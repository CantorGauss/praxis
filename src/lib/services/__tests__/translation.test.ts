import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTranslation, sheetForTranslation, translatePersonaSheet } from "../translation";
import * as llm from "../llmClient";
import { promptPack } from "../../i18n/prompts";

afterEach(() => {
  vi.restoreAllMocks();
});

const original = {
  name: "Seraphina",
  gender: "feminine" as const,
  description: "Forest guardian",
  systemPrompt: "Seraphina guards the forest. She heals the wounded.",
  stableTraits: ["gentle", "stubborn"],
};

describe("parseTranslation", () => {
  it("lit une réponse JSON, même entourée de texte", () => {
    const raw =
      'Voici :\n{"description":"Gardienne de la forêt","character":"Seraphina garde la forêt.","traits":["douce","têtue"]}\nVoilà.';
    expect(parseTranslation(raw, original)).toEqual({
      description: "Gardienne de la forêt",
      systemPrompt: "Seraphina garde la forêt.",
      stableTraits: ["douce", "têtue"],
    });
  });

  it("échoue sans caractère plutôt que d'amputer la fiche", () => {
    expect(parseTranslation('{"description":"x","character":"  "}', original)).toBeNull();
    expect(parseTranslation("Désolé, je ne peux pas.", original)).toBeNull();
    expect(parseTranslation('{"character": "oops"', original)).toBeNull();
    expect(parseTranslation('["a"]', original)).toBeNull();
  });

  it("garde l'original pour ce que le modèle a perdu", () => {
    expect(parseTranslation('{"character":"Texte."}', original)).toEqual({
      description: "Forest guardian",
      systemPrompt: "Texte.",
      stableTraits: ["gentle", "stubborn"],
    });
  });

  it("n'invente ni description ni traits absents de l'original", () => {
    const bare = { description: null, stableTraits: [] };
    expect(
      parseTranslation('{"description":"Inventée","character":"Texte.","traits":["neuf"]}', bare),
    ).toEqual({ description: null, systemPrompt: "Texte.", stableTraits: [] });
  });
});

describe("translatePersonaSheet", () => {
  const connection = {
    id: "local",
    baseUrl: "http://localhost:8080/v1",
    allowRemoteHosts: false,
    timeoutMs: 1000,
  };

  it("envoie la fiche et les consignes d'accord, et rend la traduction", async () => {
    const chat = vi
      .spyOn(llm, "chatCompletion")
      .mockResolvedValue('{"description":"Gardienne","character":"Elle garde la forêt.","traits":["douce"]}');
    const sheet = await translatePersonaSheet({
      connection,
      modelId: "model",
      persona: original,
      pack: promptPack("fr"),
    });
    expect(sheet?.systemPrompt).toBe("Elle garde la forêt.");
    const body = chat.mock.calls[0][1] as { messages: { content: string }[]; temperature: number };
    expect(body.temperature).toBeLessThan(0.5);
    expect(body.messages[0].content).toContain("en français");
    expect(body.messages[0].content).toContain("accorde au féminin");
    expect(body.messages[1].content).toContain(sheetForTranslation(original));
  });

  it("rend null si la réponse est inutilisable", async () => {
    vi.spyOn(llm, "chatCompletion").mockResolvedValue("Je préfère ne pas.");
    expect(
      await translatePersonaSheet({ connection, modelId: "m", persona: original, pack: promptPack("fr") }),
    ).toBeNull();
  });
});
