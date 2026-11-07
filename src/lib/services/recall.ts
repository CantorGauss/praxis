/**
 * Recherche lexicale dans l'historique (BM25), entièrement locale.
 *
 * Le registre de faits garde ce qu'il ne faut pas oublier ; il ne garde pas
 * les mots exacts. Quand la scène revient sur un sujet ancien — un objet, un
 * nom, une promesse — les répliques d'origine sont retrouvées ici et remises
 * sous les yeux du personnage, telles qu'elles ont été dites.
 *
 * Pas d'embeddings : la plupart des serveurs locaux n'en exposent pas, et dans
 * une scène de fiction les ancres utiles sont surtout des noms propres et des
 * mots précis, que la recherche lexicale retrouve très bien.
 */

const STOPWORDS = new Set(
  (
    // Français
    "alors aussi autre avant avec avoir bien c cela ce ceci celle celui cependant ces cet cette " +
    "ceux chez comme comment dans de des donc dont du elle elles en encore est et etre eu fait " +
    "faire il ils je la le les leur leurs lui ma mais me meme mes moi mon ne ni nos notre nous " +
    "on ou par pas peu peut plus pour pourquoi quand que quel quelle quelles quels qui sa sans " +
    "se ses si son sont sous suis sur ta te tes toi ton tous tout toute toutes tres tu un une " +
    "vos votre vous ça ai as avais avait avez avons ont etait etais sera serait j l d m n s t qu " +
    "oui non ici voila juste vraiment rien quoi bon ben hein ah oh euh " +
    // Anglais
    "the a an and or but if then than that this these those there here is are was were be been " +
    "being have has had do does did of to in on at by for with from as it its i you he she we " +
    "they me him her us them my your his our their not no yes so just what which who whom how " +
    "why when where will would can could should shall may might must very really oh ah well"
  ).split(/\s+/),
);

/** Minuscules, sans accents, sans ponctuation. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ");
}

/**
 * Racinisation volontairement grossière : la troncature à six lettres réunit
 * « promesse », « promesses », « promis » ou « clés », « clé » sans dépendre
 * d'une langue. Les fausses parentés qu'elle crée coûtent peu à côté des
 * occurrences qu'elle rattrape.
 */
function stem(token: string): string {
  const base = token.length > 3 ? token.replace(/[sx]$/, "") : token;
  return base.length > 6 ? base.slice(0, 6) : base;
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map(stem);
}

export type RecallDocument = {
  /** Position chronologique : sert à replacer les extraits dans l'ordre. */
  order: number;
  text: string;
};

export type ScoredDocument = RecallDocument & { score: number };

const K1 = 1.2;
const B = 0.75;

/**
 * Score BM25 de chaque document pour la requête. Les termes de la requête
 * peuvent être pondérés (la dernière réplique compte plus que les précédentes).
 */
export function scoreDocuments(
  documents: readonly RecallDocument[],
  query: readonly { text: string; weight: number }[],
): ScoredDocument[] {
  if (documents.length === 0) return [];
  const docTerms = documents.map((d) => tokenize(d.text));
  const avgLength =
    docTerms.reduce((acc, terms) => acc + terms.length, 0) / documents.length || 1;
  const docFrequency = new Map<string, number>();
  for (const terms of docTerms) {
    for (const term of new Set(terms)) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
    }
  }

  const queryWeights = new Map<string, number>();
  for (const part of query) {
    for (const term of new Set(tokenize(part.text))) {
      queryWeights.set(term, Math.max(queryWeights.get(term) ?? 0, part.weight));
    }
  }

  const n = documents.length;
  return documents.map((doc, i) => {
    const terms = docTerms[i];
    if (terms.length === 0 || queryWeights.size === 0) return { ...doc, score: 0 };
    const frequency = new Map<string, number>();
    for (const term of terms) frequency.set(term, (frequency.get(term) ?? 0) + 1);
    let score = 0;
    for (const [term, weight] of queryWeights) {
      const tf = frequency.get(term);
      if (!tf) continue;
      const df = docFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score +=
        weight * idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * terms.length) / avgLength)));
    }
    return { ...doc, score };
  });
}

/**
 * En dessous, la correspondance tient à un mot banal partagé par hasard :
 * mieux vaut ne rien rappeler que distraire le personnage.
 */
export const MIN_RECALL_SCORE = 2.2;
export const MAX_RECALLED_PASSAGES = 6;

export type RecallOptions = {
  documents: readonly RecallDocument[];
  query: readonly { text: string; weight: number }[];
  /** Tokens disponibles pour l'ensemble des extraits. */
  budgetTokens: number;
  estimateTokens: (text: string) => number;
  /** Ajoute la réplique précédente à chaque extrait, pour son contexte. */
  withPrevious?: boolean;
  maxPassages?: number;
  minScore?: number;
};

/**
 * Extraits les plus pertinents, rendus dans l'ordre chronologique. Les
 * répliques voisines sont fusionnées en un seul extrait.
 */
export function recallPassages(options: RecallOptions): string[] {
  const {
    documents,
    query,
    budgetTokens,
    estimateTokens,
    withPrevious = true,
    maxPassages = MAX_RECALLED_PASSAGES,
    minScore = MIN_RECALL_SCORE,
  } = options;
  if (budgetTokens <= 0 || documents.length === 0) return [];

  const scored = scoreDocuments(documents, query)
    .filter((d) => d.score >= minScore)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];

  const byOrder = new Map(documents.map((d) => [d.order, d]));
  const chosen = new Set<number>();
  let used = 0;
  let hits = 0;
  for (const hit of scored) {
    if (hits >= maxPassages) break;
    if (chosen.has(hit.order)) continue;
    const group = [hit.order];
    const previous = hit.order - 1;
    if (withPrevious && byOrder.has(previous) && !chosen.has(previous)) group.unshift(previous);
    const cost = group.reduce((acc, o) => acc + estimateTokens(byOrder.get(o)!.text) + 4, 0);
    if (used + cost > budgetTokens) {
      // L'extrait seul tient peut-être sans sa réplique précédente.
      const alone = estimateTokens(hit.text) + 4;
      if (group.length === 1 || used + alone > budgetTokens) continue;
      group.splice(0, 1);
      used += alone;
    } else {
      used += cost;
    }
    for (const o of group) chosen.add(o);
    hits += 1;
  }

  // Regroupe les répliques consécutives en un même extrait.
  const orders = [...chosen].sort((a, b) => a - b);
  const passages: { lastOrder: number; lines: string[] }[] = [];
  for (const order of orders) {
    const text = byOrder.get(order)!.text;
    const last = passages.at(-1);
    if (last && last.lastOrder === order - 1) {
      last.lines.push(text);
      last.lastOrder = order;
    } else {
      passages.push({ lastOrder: order, lines: [text] });
    }
  }
  return passages.map((p) => p.lines.join("\n"));
}

/**
 * Classe des textes par pertinence pour la requête, sans seuil : sert à choisir
 * quels faits garder quand le registre déborde du budget.
 */
export function rankByRelevance(
  texts: readonly string[],
  query: readonly { text: string; weight: number }[],
): number[] {
  return scoreDocuments(
    texts.map((text, order) => ({ order, text })),
    query,
  ).map((d) => d.score);
}
