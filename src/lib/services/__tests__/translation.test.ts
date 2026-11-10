import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loreBatches,
  parseLoreTranslation,
  parseTranslation,
  sheetForTranslation,
  translatePersonaSheet,
} from "../translation";
import { blankEntry, emptyLorebook, type LoreEntry } from "../lorebook";
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
  lorebook: null,
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

function loreEntry(overrides: Partial<LoreEntry>): LoreEntry {
  return { ...blankEntry(), ...overrides };
}

describe("traduction des connaissances", () => {
  const connection = {
    id: "local",
    baseUrl: "http://localhost:8080/v1",
    allowRemoteHosts: false,
    timeoutMs: 1000,
  };

  it("découpe les gros lorebooks en lots", () => {
    const entries = Array.from({ length: 45 }, (_, i) =>
      loreEntry({ keys: [`k${i}`], content: "court" }),
    );
    const batches = loreBatches(entries);
    expect(batches.map((b) => b.length)).toEqual([20, 20, 5]);
    expect(batches[2][0].i).toBe(40);
    const big = [loreEntry({ content: "x".repeat(3500) }), loreEntry({ content: "y".repeat(3500) })];
    expect(loreBatches(big).map((b) => b.length)).toEqual([1, 1]);
  });

  it("remplace le contenu et ajoute les mots-clés traduits", () => {
    const entries = [
      loreEntry({ keys: ["sword"], secondaryKeys: ["night"], content: "A sword." }),
      loreEntry({ keys: ["lake"], content: "A lake." }),
    ];
    const batch = loreBatches(entries)[0];
    const done = parseLoreTranslation(
      'ok {"entries":[{"i":0,"keys":["épée"],"secondary":["nuit"],"content":"Une épée."},{"i":1,"content":"  "},{"i":9,"content":"Intrus"}]}',
      entries,
      batch,
    );
    expect(done).toBe(1);
    expect(entries[0]).toMatchObject({
      keys: ["sword", "épée"],
      secondaryKeys: ["night", "nuit"],
      content: "Une épée.",
    });
    expect(entries[1].content).toBe("A lake.");
  });

  it("traduit fiche et connaissances, et compte ce qui a échoué", async () => {
    const lorebook = {
      ...emptyLorebook(),
      entries: [
        ...Array.from({ length: 20 }, (_, i) => loreEntry({ keys: [`k${i}`], content: `Fact ${i}.` })),
        loreEntry({ keys: ["last"], content: "Last fact." }),
      ],
    };
    const chat = vi
      .spyOn(llm, "chatCompletion")
      .mockResolvedValueOnce('{"description":"G","character":"Elle garde la forêt.","traits":["douce"]}')
      .mockResolvedValueOnce(
        JSON.stringify({
          entries: Array.from({ length: 20 }, (_, i) => ({ i, keys: [`c${i}`], content: `Fait ${i}.` })),
        }),
      )
      .mockRejectedValueOnce(new Error("timeout"));
    const result = await translatePersonaSheet({
      connection,
      modelId: "m",
      persona: { ...original, lorebook },
      pack: promptPack("fr"),
    });
    expect(chat).toHaveBeenCalledTimes(3);
    expect(result?.untranslatedEntries).toBe(1);
    expect(result?.lorebook?.entries[3]).toMatchObject({ keys: ["k3", "c3"], content: "Fait 3." });
    expect(result?.lorebook?.entries[20].content).toBe("Last fact.");
    // L'original n'est pas modifié en place : « Rétablir » doit pouvoir s'en servir.
    expect(lorebook.entries[3].content).toBe("Fact 3.");
    const loreCall = chat.mock.calls[1][1] as { messages: { content: string }[] };
    expect(loreCall.messages[0].content).toContain("mots-clés");
  });
});
