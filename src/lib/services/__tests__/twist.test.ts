import { afterEach, describe, expect, it, vi } from "vitest";
import { actsForUser, cleanTwist, inventSceneTwist } from "../twist";
import * as llm from "../llmClient";
import { enPrompts, frPrompts } from "../../i18n/prompts";

afterEach(() => vi.restoreAllMocks());

const NAMES = ["Anna", "Marc", "Jeff"];

describe("cleanTwist", () => {
  it("garde une didascalie simple telle quelle", () => {
    expect(cleanTwist("Le lustre grince et une enveloppe tombe du plafond.", NAMES, frPrompts))
      .toBe("Le lustre grince et une enveloppe tombe du plafond.");
  });

  it("retire les préfixes, parenthèses et astérisques ajoutés par le modèle", () => {
    expect(cleanTwist("(Scène : On frappe trois coups secs à la porte.)", NAMES, frPrompts))
      .toBe("On frappe trois coups secs à la porte.");
    expect(cleanTwist("**Didascalie** : *Le chat renverse le vase.*", NAMES, frPrompts))
      .toBe("Le chat renverse le vase.");
    expect(cleanTwist("Stage direction: A siren wails outside.", NAMES, enPrompts))
      .toBe("A siren wails outside.");
  });

  it("retire la ligne d'enjeu, qui ne va pas sur scène", () => {
    const raw = "Enjeu : la grossesse que Gwendoline nie\nDidascalie : Un test de grossesse tombe de son sac.";
    expect(cleanTwist(raw, NAMES, frPrompts)).toBe("Un test de grossesse tombe de son sac.");
    expect(cleanTwist("**Stake:** Anna's lie\n\nStage direction: Her phone lights up.", NAMES, enPrompts))
      .toBe("Her phone lights up.");
  });

  it("refuse une réponse coupée après la ligne d'enjeu", () => {
    expect(cleanTwist("Enjeu : la grossesse que Gwendoline nie", NAMES, frPrompts)).toBeNull();
  });

  it("ne garde que le premier paragraphe", () => {
    expect(cleanTwist("La radio annonce une grève générale.\n\nCela devrait relancer le débat.", NAMES, frPrompts))
      .toBe("La radio annonce une grève générale.");
  });

  it("garde une didascalie dont la phrase contient deux-points", () => {
    expect(cleanTwist("La porte s'ouvre : personne derrière.", NAMES, frPrompts))
      .toBe("La porte s'ouvre : personne derrière.");
  });

  it("refuse une réplique attribuée ou une réponse vide", () => {
    expect(cleanTwist("Marc : Vous avez entendu ?", NAMES, frPrompts)).toBeNull();
    expect(cleanTwist("  ", NAMES, frPrompts)).toBeNull();
  });

  it("raccourcit un paragraphe trop long à la dernière phrase complète", () => {
    const long = `${"Une longue phrase qui décrit le décor en détail. ".repeat(8)}Fin.`;
    const cleaned = cleanTwist(long, NAMES, frPrompts)!;
    expect(cleaned.length).toBeLessThanOrEqual(280);
    expect(cleaned.endsWith(".")).toBe(true);
  });
});

describe("actsForUser", () => {
  it("repère l'utilisateur mis en action", () => {
    expect(actsForUser("Jeff renverse son thé sur son pantalon.", "Jeff")).toBe(true);
    expect(actsForUser("Anna gronde ; Jeff les ramasse aussitôt.", "Jeff")).toBe(true);
  });

  it("laisse passer une simple mention", () => {
    expect(actsForUser("Anna regarde Jeff sans un mot.", "Jeff")).toBe(false);
    expect(actsForUser("La main de Jeffrey tremble.", "Jeff")).toBe(false);
    expect(actsForUser("Le regard passe de Gwendoline à Jeff.", "Jeff")).toBe(false);
  });
});

describe("inventSceneTwist", () => {
  const input = {
    connection: { id: "local", baseUrl: "http://localhost:8080/v1", allowRemoteHosts: false, timeoutMs: 1000 },
    modelId: "model",
    participants: [{ name: "Anna", description: "notaire" }, { name: "Marc", description: null }],
    sceneDescription: "Un dîner de famille.",
    summary: null,
    recentMessages: [],
    label: () => "Anna",
    userName: "Jeff",
    pack: frPrompts,
  };

  it("transmet la situation et nettoie la réponse", async () => {
    const chat = vi.spyOn(llm, "chatCompletion").mockResolvedValue("(Scène : Le four se met à fumer.)");
    expect(await inventSceneTwist(input)).toBe("Le four se met à fumer.");
    const sent = JSON.stringify(chat.mock.calls[0][1]);
    expect(sent).toContain("Un dîner de famille.");
    expect(sent).toContain("ne fais jamais agir ni parler Jeff");
  });

  it("transmet la couleur demandée, et seulement quand il y en a une", async () => {
    const chat = vi.spyOn(llm, "chatCompletion").mockResolvedValue("Un lama traverse le salon.");
    await inventSceneTwist({ ...input, theme: "absurd" });
    await inventSceneTwist(input);
    const [themed, plain] = chat.mock.calls.map((call) => JSON.stringify(call[1]));
    expect(themed).toContain("Le public réclame un imprévu");
    expect(themed).toContain("l'invraisemblable est permis");
    expect(plain).not.toContain("Le public réclame un imprévu");
  });

  it("retire un tic interdit et garde le premier tirage correct", async () => {
    const chat = vi.spyOn(llm, "chatCompletion")
      .mockResolvedValueOnce("Le livre s'ouvre tout seul à la page 12.")
      .mockResolvedValueOnce("Anna retrouve le double des clés dans sa poche.");
    expect(await inventSceneTwist(input)).toBe("Anna retrouve le double des clés dans sa poche.");
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("préfère un imprévu imparfait à un bouton sans effet", async () => {
    const chat = vi.spyOn(llm, "chatCompletion").mockResolvedValue("La pluie cesse brusquement.");
    expect(await inventSceneTwist(input)).toBe("La pluie cesse brusquement.");
    expect(chat).toHaveBeenCalledTimes(3);
  });

  it("garde le tirage déjà obtenu si une nouvelle tentative échoue", async () => {
    vi.spyOn(llm, "chatCompletion")
      .mockResolvedValueOnce("La pluie cesse brusquement.")
      .mockRejectedValueOnce(new Error("timeout"));
    expect(await inventSceneTwist(input)).toBe("La pluie cesse brusquement.");
  });

  it("rappelle les didascalies déjà jouées, même sorties de la fenêtre récente", async () => {
    const chat = vi.spyOn(llm, "chatCompletion").mockResolvedValue("Le four se met à fumer.");
    const line = (id: string, kind: "speech" | "narration", content: string) => ({
      id, conversationId: "c1", role: "assistant" as const, kind, content, status: "complete" as const,
      createdAt: "2026-01-01T00:00:00Z", personaId: null, personaName: null, addressee: null,
    });
    await inventSceneTwist({
      ...input,
      recentMessages: [
        line("t", "narration", "Un pigeon se pose sur la table."),
        ...Array.from({ length: 20 }, (_, i) => line(`m${i}`, "speech", `Réplique ${i}.`)),
      ],
    });
    const prompt = chat.mock.calls[0][1].messages as { content: string }[];
    expect(prompt[1].content).toContain("Didascalies déjà jouées");
    expect(prompt[1].content).toContain("Un pigeon se pose sur la table.");
    expect(prompt[1].content).not.toContain("Réplique 0.");
  });

  it("ne transmet pas les apartés à l'auteur des imprévus", async () => {
    const chat = vi.spyOn(llm, "chatCompletion").mockResolvedValue("On sonne.");
    await inventSceneTwist({
      ...input,
      recentMessages: [{
        id: "m1", conversationId: "c1", role: "assistant", kind: "speech",
        content: "Quel bon rôti. (aparté : il est brûlé)", status: "complete",
        createdAt: "2026-01-01T00:00:00Z", personaId: "p1", personaName: "Anna", addressee: null,
      }],
    });
    const sent = JSON.stringify(chat.mock.calls[0][1]);
    expect(sent).toContain("Quel bon rôti.");
    expect(sent).not.toContain("brûlé");
  });

  it("ne lève jamais : un échec revient à ne rien insérer", async () => {
    vi.spyOn(llm, "chatCompletion").mockRejectedValue(new Error("timeout"));
    expect(await inventSceneTwist(input)).toBeNull();
  });
});
