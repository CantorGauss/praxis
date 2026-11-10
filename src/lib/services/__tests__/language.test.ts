import { describe, expect, it } from "vitest";
import { detectLanguage, sheetLanguageDiffers } from "../language";

describe("detectLanguage", () => {
  it("reconnaît l'anglais et le français", () => {
    expect(
      detectLanguage("Seraphina is the guardian of the forest. She heals the wounded and never lies."),
    ).toBe("en");
    expect(
      detectLanguage("Hélène est commissaire à la retraite. Elle parle peu et ne pardonne rien."),
    ).toBe("fr");
    expect(detectLanguage("Tu parles peu, tu observes beaucoup, et tu ne pardonnes jamais.")).toBe("fr");
  });

  it("gère les élisions françaises", () => {
    expect(detectLanguage("L'homme qu'il était n'est plus là, et c'est tant mieux.")).toBe("fr");
  });

  it("ne tranche pas sur un texte trop court ou mélangé", () => {
    expect(detectLanguage("Seraphina")).toBeNull();
    expect(detectLanguage("gentle, stubborn")).toBeNull();
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("She is the one. Elle est la seule. The end. La fin.")).toBeNull();
  });
});

describe("sheetLanguageDiffers", () => {
  const sheet = (systemPrompt: string) => ({ systemPrompt, description: null, stableTraits: [] });

  it("signale une fiche anglaise jouée en français", () => {
    expect(
      sheetLanguageDiffers(sheet("He is a retired detective who notices everything and says little."), "fr"),
    ).toBe("en");
  });

  it("tient compte des connaissances actives", () => {
    const withLore = (enabled: boolean) => ({
      ...sheet("Tu es une guérisseuse discrète, et tu ne mens jamais."),
      lorebook: {
        entries: [
          { content: "The forest of Eldoria is old and the trees are always awake.", enabled },
        ],
      },
    });
    expect(sheetLanguageDiffers(withLore(true), "fr")).toBe("en");
    expect(sheetLanguageDiffers(withLore(false), "fr")).toBeNull();
  });

  it("se tait quand la langue est la même ou incertaine", () => {
    expect(sheetLanguageDiffers(sheet("He is a retired detective who notices everything."), "en")).toBeNull();
    expect(sheetLanguageDiffers(sheet("Grumpy."), "fr")).toBeNull();
  });
});
