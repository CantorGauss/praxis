import type { Locale } from "../locales";
import { enPrompts } from "./en";
import { frPrompts } from "./fr";
import type { PromptPack } from "./types";

export type * from "./types";
export { enPrompts, frPrompts };

const PACKS: Record<Locale, PromptPack> = {
  en: enPrompts,
  fr: frPrompts,
};

export function promptPack(locale: Locale): PromptPack {
  return PACKS[locale] ?? enPrompts;
}

/**
 * Pack employé quand aucune langue n'est passée. Les services acceptent tous
 * un pack explicite : c'est ce qui les garde purs et testables dans les deux
 * langues. Ce défaut n'existe que pour les appels internes qui n'ont aucune
 * raison de dépendre d'un réglage.
 */
export const DEFAULT_PROMPT_PACK = enPrompts;
