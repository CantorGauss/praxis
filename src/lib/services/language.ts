// Reconnaissance grossière de la langue d'une fiche, entre les langues que
// Praxis sait jouer. Elle ne sert qu'à prévenir : signaler une fiche écrite
// dans une autre langue que celle des conversations, et rappeler au
// personnage dans quelle langue répondre. Dans le doute, elle ne dit rien.

import type { Locale } from "../i18n/locales";

/**
 * Mots outils fréquents et propres à chaque langue. Les mots ambigus d'une
 * langue à l'autre (« a », « on », « me ») en sont écartés.
 */
const FUNCTION_WORDS: Record<Locale, ReadonlySet<string>> = {
  en: new Set([
    "the", "and", "is", "are", "was", "were", "of", "to", "with", "his", "her",
    "she", "he", "you", "your", "they", "their", "that", "this", "have", "has",
    "not", "but", "for", "who", "when", "what", "will", "would", "be", "been",
    "an", "it", "its", "from", "by", "at", "or", "very", "always", "never",
  ]),
  fr: new Set([
    "le", "la", "les", "et", "est", "sont", "des", "du", "un", "une", "avec",
    "il", "elle", "ils", "elles", "tu", "ton", "ta", "tes", "pas", "mais",
    "pour", "qui", "que", "dans", "sur", "au", "aux", "ce", "cette", "ses",
    "sa", "leur", "était", "être", "avoir", "très", "toujours", "jamais",
    "ne", "se", "lui", "où", "quand", "rien",
  ]),
};

/** En dessous, le texte est trop court pour trancher. */
const MIN_HITS = 4;
/** La langue retenue doit l'emporter nettement. */
const DOMINANCE = 2;

/** Langue dominante du texte, ou null quand rien ne permet de trancher. */
export function detectLanguage(text: string): Locale | null {
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  const hits: Record<Locale, number> = { en: 0, fr: 0 };
  for (const raw of words) {
    // « l'homme », « qu'il » : on garde le mot après l'apostrophe.
    const word = raw.includes("'") ? raw.slice(raw.lastIndexOf("'") + 1) : raw;
    for (const locale of Object.keys(hits) as Locale[]) {
      if (FUNCTION_WORDS[locale].has(word)) hits[locale] += 1;
    }
  }
  const ranked = (Object.entries(hits) as [Locale, number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (best[1] < MIN_HITS || best[1] < second[1] * DOMINANCE) return null;
  return best[0];
}

type Sheet = {
  systemPrompt: string;
  description: string | null;
  stableTraits: readonly string[];
  lorebook?: { entries: readonly { content: string; enabled: boolean }[] } | null;
};

/** Texte d'une fiche sur lequel juger sa langue (connaissances à part). */
export function personaSheetText(persona: Sheet): string {
  return [persona.description ?? "", persona.systemPrompt, persona.stableTraits.join(", ")]
    .join("\n");
}

/** Texte des connaissances actives, jugé séparément : souvent plus long que la fiche. */
function loreText(persona: Sheet): string {
  return (persona.lorebook?.entries ?? [])
    .filter((e) => e.enabled)
    .map((e) => e.content)
    .join("\n");
}

/**
 * Langue de la fiche ou de ses connaissances quand elle diffère manifestement
 * de celle des conversations ; null sinon.
 */
export function sheetLanguageDiffers(
  persona: Sheet,
  conversationLanguage: Locale,
): Locale | null {
  for (const text of [personaSheetText(persona), loreText(persona)]) {
    const detected = detectLanguage(text);
    if (detected && detected !== conversationLanguage) return detected;
  }
  return null;
}
