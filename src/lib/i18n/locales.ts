/**
 * Deux langues, deux réglages distincts.
 *
 * `uiLocale` habille l'application ; `conversationLanguage` détermine la langue
 * dans laquelle les personnages jouent, parce que c'est la langue du prompt qui
 * fixe celle des répliques. Les deux sont volontairement séparés : une
 * interface anglaise avec des personnages francophones est un cas normal, pas
 * une incohérence à corriger.
 */
export type Locale = "en" | "fr";

export const LOCALES: readonly Locale[] = ["en", "fr"] as const;

/** Chaque langue se nomme dans sa propre langue : un sélecteur ne se traduit pas. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

/** Étiquette de formatage des nombres et des dates. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-US",
  fr: "fr-FR",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Langue déduite du système au premier lancement. Tout ce qui n'est pas
 * reconnu retombe sur l'anglais : c'est la langue par défaut du produit.
 */
export function detectLocale(
  languages: readonly string[] = typeof navigator === "undefined"
    ? []
    : navigator.languages,
): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}
