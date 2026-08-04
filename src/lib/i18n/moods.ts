import type { Mood } from "../types";
import type { Locale } from "./locales";

/**
 * Étiquettes d'humeur, partagées entre le prompt et l'interface.
 *
 * Des noms, jamais des adjectifs : « fatiguée » injecté dans le prompt d'un
 * personnage masculin l'entraînait à s'accorder au féminin, lui et les autres.
 * L'anglais n'a pas ce problème d'accord, mais la forme nominale y reste la
 * bonne — elle décrit l'état sans le coller au personnage.
 *
 * Le même tableau sert des deux côtés parce que le texte est identique ; les
 * deux usages restent indépendants, l'interface suivant `uiLocale` et le
 * prompt `conversationLanguage`.
 */
export const MOOD_LABELS_BY_LOCALE: Record<Locale, Record<Mood, string>> = {
  en: {
    neutral: "neutral",
    joyful: "joy",
    calm: "calm",
    curious: "curiosity",
    surprised: "surprise",
    shocked: "shock",
    concerned: "concern",
    afraid: "fear",
    sad: "sadness",
    angry: "anger",
    disgusted: "disgust",
    tired: "tiredness",
    annoyed: "annoyance",
  },
  fr: {
    neutral: "neutre",
    joyful: "joie",
    calm: "calme",
    curious: "curiosité",
    surprised: "surprise",
    shocked: "choc",
    concerned: "inquiétude",
    afraid: "peur",
    sad: "tristesse",
    angry: "colère",
    disgusted: "dégoût",
    tired: "fatigue",
    annoyed: "agacement",
  },
};
