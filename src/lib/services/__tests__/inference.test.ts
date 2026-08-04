import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DETECTED_CONTEXT_SAFETY_RATIO,
  effectiveMaxOutputTokens,
  resolveContextBudget,
  responseLengthInstruction,
  responseLengthPreset,
} from "../inference";
import { frPrompts } from "../../i18n/prompts";

describe("réglages d'inférence lisibles", () => {
  it("donne une limite déterministe aux anciennes personas sans limite", () => {
    expect(effectiveMaxOutputTokens(null)).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(responseLengthPreset(null).id).toBe("normal");
  });

  it("conserve une limite personnalisée valide", () => {
    expect(effectiveMaxOutputTokens(2048)).toBe(2048);
  });

  it("rattache une ancienne valeur au choix le plus proche", () => {
    expect(responseLengthPreset(600).id).toBe("short");
    expect(responseLengthPreset(1200).id).toBe("normal");
    expect(responseLengthPreset(1900).id).toBe("long");
  });

  it("définit bref comme quelques phrases naturelles, pas un télégramme", () => {
    const en = responseLengthInstruction(512);
    expect(en).toContain("3 to 6 complete, natural sentences");
    expect(en).toContain("neither a one-word answer");

    const fr = responseLengthInstruction(512, frPrompts);
    expect(fr).toContain("3 à 6 phrases");
    expect(fr).toContain("ni une réponse d'un mot");
  });

  it("ne donne aucune consigne de longueur hors du preset bref", () => {
    expect(responseLengthInstruction(1024)).toBeNull();
    expect(responseLengthInstruction(1024, frPrompts)).toBeNull();
  });
});

describe("budget de contexte", () => {
  it("emploie la capacité annoncée par le serveur, avec une marge", () => {
    const budget = resolveContextBudget({ detected: 8192, fallback: 4096 });
    expect(budget.source).toBe("detected");
    expect(budget.detected).toBe(8192);
    expect(budget.tokens).toBe(Math.floor(8192 * DETECTED_CONTEXT_SAFETY_RATIO));
  });

  it("laisse la valeur saisie primer sur celle du serveur, sans marge", () => {
    const budget = resolveContextBudget({
      manual: 4096,
      detected: 32768,
      fallback: 8192,
    });
    expect(budget.source).toBe("manual");
    expect(budget.tokens).toBe(4096);
    // La valeur du serveur reste connue : les réglages l'affichent.
    expect(budget.detected).toBe(32768);
  });

  it("retombe sur le repli quand le serveur n'annonce rien", () => {
    const budget = resolveContextBudget({ fallback: 8192 });
    expect(budget.source).toBe("fallback");
    expect(budget.tokens).toBe(8192);
    expect(budget.detected).toBeUndefined();
  });

  it("ignore une capacité aberrante plutôt que de bâtir un budget nul", () => {
    expect(resolveContextBudget({ detected: 0, fallback: 8192 }).source).toBe(
      "fallback",
    );
    expect(resolveContextBudget({ manual: -1, fallback: 8192 }).source).toBe(
      "fallback",
    );
    expect(
      resolveContextBudget({ detected: Number.NaN, fallback: 8192 }).tokens,
    ).toBe(8192);
  });
});
