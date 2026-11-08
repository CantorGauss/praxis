import { describe, expect, it } from "vitest";
import { bubbleTone } from "../bubbleTone";
import { effectsForMessage, newUnanimousAgreements } from "../sceneEffects";
import type { Message, MessageReaction, SceneProposal } from "../../types";

function message(content: string, overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    conversationId: "c1",
    role: "assistant",
    kind: "speech",
    content,
    status: "complete",
    createdAt: "2026-01-01T00:00:00Z",
    personaId: "p-anna",
    personaName: "Anna",
    addressee: null,
    ...overrides,
  };
}

const effects = (content: string, reaction: MessageReaction | null = null, overrides: Partial<Message> = {}) =>
  effectsForMessage(message(content, overrides), bubbleTone(content, reaction));

describe("effectsForMessage", () => {
  it("fait trembler la scène quand quelqu'un crie, plus fort en colère", () => {
    const calm = effects("*crie* Bravo !");
    const furious = effects("*hurle* Sors d'ici !", { mood: "angry", intensity: 0.95 });
    const shake = (list: ReturnType<typeof effects>) => list.find((e) => e.kind === "shake");
    expect(shake(calm)).toBeDefined();
    expect(shake(furious)).toBeDefined();
    expect((shake(furious) as { strength: number }).strength).toBeGreaterThan(
      (shake(calm) as { strength: number }).strength,
    );
  });

  it("fait s'envoler des rires", () => {
    expect(effects("*éclate de rire* Toi alors !")).toContainEqual({ kind: "laugh" });
  });

  it("ne lance une gerbe que pour une humeur vraiment forte", () => {
    expect(effects("Super.", { mood: "joyful", intensity: 0.9 })).toContainEqual({ kind: "burst", emoji: "✨" });
    expect(effects("Super.", { mood: "joyful", intensity: 0.5 })).toEqual([]);
    expect(effects("Bon.", { mood: "calm", intensity: 0.95 })).toEqual([]);
  });

  it("braque le projecteur sur un imprévu, pas sur une didascalie de l'utilisateur", () => {
    expect(effects("Un lama entre.", null, { kind: "narration", role: "assistant" })).toEqual([{ kind: "spotlight" }]);
    expect(effects("Marc entre.", null, { kind: "narration", role: "user" })).toEqual([]);
  });

  it("reste sage pour une réplique ordinaire", () => {
    expect(effects("Je prendrai un thé, merci.")).toEqual([]);
  });
});

describe("newUnanimousAgreements", () => {
  function proposal(overrides: Partial<SceneProposal> = {}): SceneProposal {
    return {
      id: "prop-1",
      authorId: "p-anna",
      text: "On commande des pizzas",
      sourceMessageId: "m1",
      participantIds: ["p-anna", "p-marc"],
      positions: {
        "p-anna": { stance: "agree", condition: null, evidence: "pizzas", messageId: "m1" },
        "p-marc": { stance: "agree", condition: null, evidence: "oui", messageId: "m2" },
      },
      status: "agreed",
      ...overrides,
    };
  }

  it("fête un accord unanime donné sous les yeux de l'utilisateur", () => {
    expect(newUnanimousAgreements([proposal()], new Set(), new Set(["m2"]))).toHaveLength(1);
  });

  it("ne refête ni un accord déjà célébré, ni un accord d'une session passée", () => {
    expect(newUnanimousAgreements([proposal()], new Set(["prop-1"]), new Set(["m2"]))).toEqual([]);
    expect(newUnanimousAgreements([proposal()], new Set(), new Set())).toEqual([]);
  });

  it("ignore les propositions ouvertes et celles qui n'engagent que leur auteur", () => {
    expect(newUnanimousAgreements([proposal({ status: "open" })], new Set(), new Set(["m2"]))).toEqual([]);
    expect(
      newUnanimousAgreements([proposal({ participantIds: ["p-anna"] })], new Set(), new Set(["m1"])),
    ).toEqual([]);
  });
});
