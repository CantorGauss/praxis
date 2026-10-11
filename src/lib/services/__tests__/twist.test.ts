import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanTwist, inventSceneTwist } from "../twist";
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

  it("ne lève jamais : un échec revient à ne rien insérer", async () => {
    vi.spyOn(llm, "chatCompletion").mockRejectedValue(new Error("timeout"));
    expect(await inventSceneTwist(input)).toBeNull();
  });
});
