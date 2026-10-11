import type { Message } from "../types";
import type { StagnationReason } from "../i18n/prompts/types";

/**
 * Détection d'une scène qui tourne en rond.
 *
 * Volontairement sans appel au modèle : la mesure tourne avant chaque réplique
 * autonome, et une requête de plus par tour coûterait de la latence et, sur une
 * passerelle distante, de l'argent. On compare donc le vocabulaire des
 * dernières répliques des personnages à celui des précédentes. Un faux positif
 * ne produit qu'une consigne de relance : les seuils peuvent rester prudents
 * sans être parfaits.
 */

/** Répliques récentes évaluées, comparées aux précédentes de la fenêtre. */
const RECENT_LINES = 3;
const EARLIER_LINES = 6;
/** En deçà, la scène n'a pas encore eu le temps de piétiner. */
const MIN_EARLIER_LINES = 2;
/** Mots trop courts : articles, pronoms, auxiliaires, dans les deux langues. */
const MIN_WORD_LENGTH = 4;
/** Part de vocabulaire neuf en dessous de laquelle l'échange tourne en rond. */
const LOW_NOVELTY_RATIO = 0.4;
/** Recouvrement entre deux répliques au-delà duquel l'une répète l'autre. */
const ECHO_SIMILARITY = 0.5;
/** Il faut assez de mots pour qu'une proportion veuille dire quelque chose. */
const MIN_RECENT_WORDS = 12;
const MIN_LINE_WORDS = 6;

/** Mots outils de quatre lettres ou plus, qui reviennent dans toute conversation. */
const STOPWORDS = new Set([
  // français
  "alors", "aussi", "autre", "autres", "avais", "avait", "avec", "avez", "avoir",
  "avons", "bien", "cela", "celle", "celui", "cette", "ceux", "chez",
  "comme", "comment", "dans", "depuis", "donc", "elle", "elles", "encore",
  "était", "étais", "être", "fait", "faire", "faut", "juste", "leur", "leurs",
  "mais", "même", "moins", "notre", "nous", "parce", "peut", "peux",
  "plus", "pour", "pourquoi", "quand", "quel", "quelle", "quelque", "quoi",
  "rien", "sans", "sont", "suis", "sûr", "tout", "toute", "toutes", "tous",
  "très", "trop", "vais", "veux", "voilà", "votre", "vous", "vraiment", "déjà",
  "ensuite", "toujours", "jamais", "entre", "sous", "vers",
  "dire", "dis", "dit", "crois", "pense", "sais",
  // anglais
  "about", "after", "again", "also", "been", "before", "being", "could",
  "does", "doing", "even", "from", "have", "here", "into", "just",
  "know", "like", "more", "much", "only", "really", "should", "some", "still",
  "than", "that", "their", "them", "then", "there", "these", "they", "think",
  "this", "those", "very", "want", "well", "were", "what", "when", "where",
  "which", "while", "will", "with", "would", "yeah", "your", "because",
  "maybe", "right", "something", "going",
]);

/** Ensemble des mots porteurs de sens d'une réplique, noms propres exclus. */
export function contentWords(text: string, excluded: ReadonlySet<string>): Set<string> {
  const words = new Set<string>();
  // Apostrophes et traits d'union séparent : « l'idée » et « idée » sont le
  // même mot, et les élisions (« c'est », "don't") tombent sous la longueur.
  for (const match of text.toLowerCase().matchAll(/\p{L}+/gu)) {
    const word = match[0];
    if (word.length < MIN_WORD_LENGTH) continue;
    if (STOPWORDS.has(word) || excluded.has(word)) continue;
    words.add(word);
  }
  return words;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

const isCharacterLine = (m: Message) =>
  m.role === "assistant" &&
  m.kind === "speech" &&
  m.status === "complete" &&
  m.content.trim().length > 0;

/**
 * Raison pour laquelle la scène piétine, ou null si elle avance.
 *
 * Seules les répliques des personnages comptent : c'est leur boucle qu'on
 * cherche à rompre, l'utilisateur menant ses propres sujets. La fenêtre
 * s'arrête au dernier message de l'utilisateur ou à la dernière didascalie —
 * ce qui suit répond à quelque chose de neuf et ne doit pas être comparé à
 * ce qui précède.
 *
 * `names` : prénoms des participants, qui reviennent forcément d'une réplique
 * à l'autre sans indiquer de redite.
 */
export function detectStagnation(
  messages: readonly Message[],
  names: readonly string[] = [],
): StagnationReason | null {
  const window: Message[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === "narration" || m.role === "user") break;
    if (isCharacterLine(m)) window.unshift(m);
    if (window.length >= RECENT_LINES + EARLIER_LINES) break;
  }
  if (window.length < RECENT_LINES + MIN_EARLIER_LINES) return null;

  const recent = window.slice(-RECENT_LINES);

  // Approbation en chaîne : chacun abonde, plus personne ne fait avancer.
  const intents = recent.map((m) => m.interaction?.intent);
  const agreements = intents.filter((i) => i === "agreement").length;
  const driving = intents.some((i) =>
    i === "question" || i === "proposal" || i === "objection",
  );
  if (agreements >= 2 && !driving) return "consensus";

  const excluded = new Set(
    names.flatMap((n) => n.toLowerCase().split(/\s+/)).filter(Boolean),
  );
  const recentSets = recent.map((m) => contentWords(m.content, excluded));
  const earlierSets = window
    .slice(0, -RECENT_LINES)
    .map((m) => contentWords(m.content, excluded));

  // Redite : une réplique récente reprend presque une réplique antérieure.
  for (let i = 0; i < recentSets.length; i++) {
    const current = recentSets[i];
    if (current.size < MIN_LINE_WORDS) continue;
    const before = [...earlierSets, ...recentSets.slice(0, i)];
    if (
      before.some(
        (other) => other.size >= MIN_LINE_WORDS && jaccard(current, other) >= ECHO_SIMILARITY,
      )
    ) {
      return "echo";
    }
  }

  // Ressassement : peu de vocabulaire que la fenêtre n'avait pas déjà employé.
  const recentWords = new Set(recentSets.flatMap((s) => [...s]));
  if (recentWords.size < MIN_RECENT_WORDS) return null;
  const earlierWords = new Set(earlierSets.flatMap((s) => [...s]));
  let fresh = 0;
  for (const word of recentWords) if (!earlierWords.has(word)) fresh += 1;
  return fresh / recentWords.size < LOW_NOVELTY_RATIO ? "low-novelty" : null;
}

/**
 * Répliques prononcées depuis la dernière didascalie, quelle qu'en soit
 * l'origine. Sert d'intervalle minimal entre deux imprévus : une scène relancée
 * doit avoir le temps d'exploiter ce qui vient d'arriver.
 */
export function linesSinceNarration(messages: readonly Message[]): number {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].kind === "narration") break;
    if (messages[i].kind === "speech" && messages[i].content.trim()) count += 1;
  }
  return count;
}
