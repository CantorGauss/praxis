import { detectLocale, LOCALE_TAGS, type Locale } from "./locales";
import { enUi } from "./ui/en";
import { frUi } from "./ui/fr";
import type { UiStrings } from "./ui/en";

const PACKS: Record<Locale, UiStrings> = { en: enUi, fr: frUi };

/**
 * Langue de l'interface.
 *
 * Elle vit ici plutôt que dans `app` parce que tout composant en a besoin, y
 * compris ceux qui n'accèdent pas à l'état applicatif. `app` reste la source
 * de vérité persistée et pousse la valeur ici à chaque chargement des réglages.
 */
let locale = $state<Locale>(detectLocale());

export function setUiLocale(next: Locale): void {
  locale = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
}

export function uiLocale(): Locale {
  return locale;
}

/**
 * Chaînes de la langue courante. Appeler `t()` lit l'état réactif : dans un
 * composant, `const s = $derived(t())` suffit à tout retraduire au changement.
 */
export function t(): UiStrings {
  return PACKS[locale] ?? enUi;
}

/** Formatage des nombres dans la langue de l'interface. */
export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE_TAGS[locale]);
}
