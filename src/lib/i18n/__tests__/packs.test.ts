import { describe, expect, it } from "vitest";
import { enUi } from "../ui/en";
import { frUi } from "../ui/fr";
import { enPrompts, frPrompts, promptPack } from "../prompts";
import { MOOD_LABELS_BY_LOCALE } from "../moods";
import { detectLocale, isLocale, LOCALES } from "../locales";
import { MOODS } from "../../services/emotion";

/**
 * Empreinte de forme : chemin de chaque feuille, et son type. Le compilateur
 * vérifie déjà que le pack français correspond au pack anglais, mais pas qu'une
 * chaîne n'a pas été traduite en fonction — ou l'inverse, ce qui rendrait un
 * `{...}` littéral à l'écran.
 */
function shape(value: unknown, path = ""): string[] {
  if (typeof value === "function") return [`${path}:fn/${value.length}`];
  if (value && typeof value === "object") {
    return Object.entries(value)
      .flatMap(([key, child]) => shape(child, path ? `${path}.${key}` : key))
      .sort();
  }
  return [`${path}:${typeof value}`];
}

describe("packs d'interface", () => {
  it("ont exactement les mêmes clés, avec la même arité", () => {
    expect(shape(frUi)).toEqual(shape(enUi));
  });

  it("ne laissent aucune chaîne vide", () => {
    const empties: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === "string" && !value.trim()) empties.push(path);
      else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          walk(child, path ? `${path}.${key}` : key);
        }
      }
    };
    walk(enUi, "");
    walk(frUi, "");
    expect(empties).toEqual([]);
  });

  it("traduisent réellement le texte, sans recopier l'anglais", () => {
    // Un pack copié-collé compile parfaitement ; seul un test le remarque.
    expect(frUi.sidebar.newConversation).not.toBe(enUi.sidebar.newConversation);
    expect(frUi.settings.title).not.toBe(enUi.settings.title);
    expect(frUi.chat.yourTurn).not.toBe(enUi.chat.yourTurn);
  });
});

describe("packs de prompts", () => {
  it("ont exactement les mêmes clés, avec la même arité", () => {
    expect(shape(frPrompts)).toEqual(shape(enPrompts));
  });

  it("couvrent toutes les humeurs dans les deux langues", () => {
    for (const locale of LOCALES) {
      for (const mood of MOODS) {
        expect(MOOD_LABELS_BY_LOCALE[locale][mood], `${locale}/${mood}`).toBeTruthy();
      }
    }
  });

  it("nomment les sept jours, dans l'ordre à partir de dimanche", () => {
    for (const pack of [enPrompts, frPrompts]) {
      expect(pack.temporal.weekdays).toHaveLength(7);
    }
    expect(enPrompts.temporal.weekdays[0]).toBe("Sunday");
    expect(frPrompts.temporal.weekdays[0]).toBe("dimanche");
  });

  it("se résolvent par langue, et retombent sur l'anglais", () => {
    expect(promptPack("fr")).toBe(frPrompts);
    expect(promptPack("en")).toBe(enPrompts);
    expect(promptPack("de" as never)).toBe(enPrompts);
  });

  it("emploient des noms d'humeur, jamais des adjectifs accordés", () => {
    // « fatiguée » injecté dans le prompt d'un personnage masculin le faisait
    // s'accorder au féminin, lui et les autres. Aucune règle morphologique ne
    // distingue « curiosité » de « fatiguée » : la liste attendue est explicite.
    expect(MOOD_LABELS_BY_LOCALE.fr).toEqual({
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
    });
  });
});

describe("détection de langue", () => {
  it("reconnaît les étiquettes valides", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("suit la préférence système, et retombe sur l'anglais", () => {
    expect(detectLocale(["fr-CA", "en-US"])).toBe("fr");
    expect(detectLocale(["en-GB"])).toBe("en");
    expect(detectLocale(["de-DE", "fr"])).toBe("fr");
    expect(detectLocale(["de-DE"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });
});
