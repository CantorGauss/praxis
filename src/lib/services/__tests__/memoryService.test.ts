import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatCompletion: vi.fn(),
  updateConversation: vi.fn(),
}));

vi.mock("../llmClient", async () => {
  const actual = await vi.importActual<typeof import("../llmClient")>("../llmClient");
  return { ...actual, chatCompletion: mocks.chatCompletion };
});

vi.mock("../repositories", () => ({
  conversationRepo: { update: mocks.updateConversation },
}));

import {
  KEEP_RECENT_MESSAGES,
  MAX_MEMORY_BATCH,
  MIN_MEMORY_BATCH,
  memoryNeedsMigration,
  needsMemoryUpdate,
  nextBatch,
  rebuildMemory,
  roleLabellerFor,
  updateMemory,
} from "../memoryService";
import { frPrompts } from "../../i18n/prompts";
import type { ConnectionTarget, Conversation, Message } from "../../types";

const target: ConnectionTarget = {
  id: "local",
  baseUrl: "http://localhost:1234/v1",
  allowRemoteHosts: false,
  timeoutMs: 1000,
};

function message(n: number, content = `Réplique ${n}.`): Message {
  return {
    id: `m${n}`,
    conversationId: "c1",
    role: n % 2 ? "user" : "assistant",
    kind: "speech",
    content,
    status: "complete",
    createdAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}.000Z`,
    personaId: n % 2 ? null : "anna",
    personaName: n % 2 ? null : "Anna",
    addressee: null,
  };
}

function history(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => message(i + 1));
}

const conversation: Conversation = {
  id: "c1",
  personaId: "anna",
  title: "Scène",
  sceneDescription: null,
  summary: null,
  summaryThroughMessageId: null,
  memory: null,
  objectives: [],
  createdAt: "",
  updatedAt: "",
  lastInteractionAt: null,
};

beforeEach(() => {
  mocks.chatCompletion.mockReset();
  mocks.updateConversation.mockReset();
});

describe("needsMemoryUpdate", () => {
  it("attend un vrai lot au-delà de la fenêtre récente", () => {
    expect(needsMemoryUpdate(history(KEEP_RECENT_MESSAGES + MIN_MEMORY_BATCH - 1), 8192, 10)).toBe(false);
    expect(needsMemoryUpdate(history(KEEP_RECENT_MESSAGES + MIN_MEMORY_BATCH + 1), 8192, 20)).toBe(true);
    expect(needsMemoryUpdate(history(KEEP_RECENT_MESSAGES + MIN_MEMORY_BATCH + 1), 8192)).toBe(false);
  });
});

describe("nextBatch", () => {
  it("prend les plus anciens messages hors fenêtre récente, dans la limite du lot et du contexte", () => {
    expect(nextBatch(history(KEEP_RECENT_MESSAGES + 5)).map((m) => m.id)).toEqual(
      ["m1", "m2", "m3", "m4", "m5"],
    );
    expect(nextBatch(history(100))).toHaveLength(MAX_MEMORY_BATCH);
    const long = [message(1, "x".repeat(4000)), message(2, "y".repeat(4000)), ...history(20)];
    expect(nextBatch(long, 4096)).toHaveLength(1);
  });
});

describe("memoryNeedsMigration", () => {
  it("repère une conversation à l'ancien résumé", () => {
    expect(memoryNeedsMigration(conversation)).toBe(false);
    expect(memoryNeedsMigration({ ...conversation, summary: "[ACTIVE MEMORY v5]\n- Un fait." })).toBe(true);
    expect(
      memoryNeedsMigration({
        ...conversation,
        summary: "ancien",
        memory: { version: 1, facts: [], state: [], threads: [], nextFactNumber: 1 },
      }),
    ).toBe(false);
  });
});

describe("updateMemory", () => {
  it("numérote le lot, applique les opérations et avance la frontière", async () => {
    mocks.chatCompletion.mockResolvedValue(
      JSON.stringify({
        add: [{ text: "Anna a promis de rappeler Jeff.", category: "commitment", sources: [2] }],
        state: ["Anna et Jeff sont au café."],
      }),
    );
    const messages = history(KEEP_RECENT_MESSAGES + 3);
    const outcome = await updateMemory(
      target, "m", conversation, messages, roleLabellerFor(frPrompts), {}, frPrompts,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.conversation.summaryThroughMessageId).toBe("m3");
    expect(outcome.conversation.memory?.facts).toEqual([
      expect.objectContaining({ id: "f1", sourceMessageIds: ["m2"], category: "commitment" }),
    ]);
    expect(outcome.conversation.memory?.state).toEqual(["Anna et Jeff sont au café."]);
    expect(mocks.updateConversation).toHaveBeenCalledWith(outcome.conversation);

    const request = mocks.chatCompletion.mock.calls[0][1];
    const user = request.messages[1].content as string;
    expect(user).toContain("Registre actuel :\n(vide)");
    expect(user).toContain(`[1] ${frPrompts.scene.userLabel} : Réplique 1.`);
    expect(user).toContain("[2] Anna : Réplique 2.");
    expect(user).not.toContain("Réplique 4.");
  });

  it("montre au modèle les faits existants avec leur identifiant", async () => {
    mocks.chatCompletion.mockResolvedValue('{"add":[],"retire":["f1"]}');
    const memory = {
      version: 1 as const,
      state: [],
      threads: [],
      nextFactNumber: 2,
      facts: [{
        id: "f1", text: "Marc est à Lyon.", category: "place" as const, pinned: false,
        origin: "auto" as const, sourceMessageIds: [], createdAt: "", updatedAt: "",
      }],
    };
    const outcome = await updateMemory(
      target, "m", { ...conversation, memory }, history(KEEP_RECENT_MESSAGES + 2), undefined, {}, frPrompts,
    );
    expect(mocks.chatCompletion.mock.calls[0][1].messages[1].content).toContain("- f1 [place] Marc est à Lyon.");
    expect(outcome.ok && outcome.conversation.memory?.facts).toEqual([]);
  });

  it("réessaie une fois une sortie illisible puis remonte la cause sans avancer", async () => {
    mocks.chatCompletion.mockResolvedValue("Je ne sais pas.");
    const outcome = await updateMemory(
      target, "m", conversation, history(KEEP_RECENT_MESSAGES + 2), undefined, {}, frPrompts,
    );
    expect(outcome).toEqual({ ok: false, reason: frPrompts.memory.invalidUpdateError });
    expect(mocks.chatCompletion).toHaveBeenCalledTimes(2);
    expect(mocks.updateConversation).not.toHaveBeenCalled();
  });

  it("ne demande rien quand tout tient dans la fenêtre récente", async () => {
    const outcome = await updateMemory(target, "m", conversation, history(KEEP_RECENT_MESSAGES));
    expect(outcome).toEqual({ ok: false, reason: null });
    expect(mocks.chatCompletion).not.toHaveBeenCalled();
  });

  it("n'envoie pas les apartés dans la mémoire commune", async () => {
    mocks.chatCompletion.mockResolvedValue('{"add":[]}');
    const messages = history(KEEP_RECENT_MESSAGES + 2);
    messages[0] = message(1, "Bonjour. (aparté : je n'en pense pas un mot.)");
    await updateMemory(target, "m", conversation, messages, undefined, {}, frPrompts);
    expect(mocks.chatCompletion.mock.calls[0][1].messages[1].content).not.toContain("pas un mot");
  });
});

describe("rebuildMemory", () => {
  it("relit tout par lots, garde les faits de l'utilisateur et ne persiste qu'à la fin", async () => {
    let call = 0;
    mocks.chatCompletion.mockImplementation(async () => {
      call += 1;
      return JSON.stringify({ add: [{ text: `Fait du lot ${call}.`, category: "event", sources: [1] }] });
    });
    const messages = history(KEEP_RECENT_MESSAGES + MAX_MEMORY_BATCH + 5);
    const start: Conversation = {
      ...conversation,
      summary: "[ACTIVE MEMORY v5]\n- Ancien.",
      summaryThroughMessageId: "m3",
      memory: {
        version: 1, state: [], threads: [], nextFactNumber: 9,
        facts: [
          { id: "f4", text: "Ancien fait auto.", category: "event", pinned: false, origin: "auto",
            sourceMessageIds: ["m1"], createdAt: "", updatedAt: "" },
          { id: "f8", text: "Anna est gauchère.", category: "person", pinned: false, origin: "user",
            sourceMessageIds: [], createdAt: "", updatedAt: "" },
        ],
      },
    };
    const progress: number[] = [];
    const outcome = await rebuildMemory(
      target, "m", start, messages, undefined, {}, frPrompts,
      (p) => progress.push(p.remainingMessages),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(mocks.chatCompletion).toHaveBeenCalledTimes(2);
    expect(progress).toEqual([MAX_MEMORY_BATCH + 5, 5, 0]);
    expect(outcome.conversation.summary).toBeNull();
    expect(outcome.conversation.summaryThroughMessageId).toBe(`m${MAX_MEMORY_BATCH + 5}`);
    expect(outcome.conversation.memory?.facts.map((f) => [f.id, f.text])).toEqual([
      ["f8", "Anna est gauchère."],
      ["f9", "Fait du lot 1."],
      ["f10", "Fait du lot 2."],
    ]);
    expect(mocks.updateConversation).toHaveBeenCalledTimes(1);
  });

  it("laisse l'ancienne mémoire intacte si un lot échoue", async () => {
    mocks.chatCompletion
      .mockResolvedValueOnce('{"add":[]}')
      .mockRejectedValue(new Error("Serveur indisponible"));
    const outcome = await rebuildMemory(
      target, "m", conversation, history(KEEP_RECENT_MESSAGES + MAX_MEMORY_BATCH + 5),
      undefined, {}, frPrompts,
    );
    expect(outcome).toEqual({ ok: false, reason: "Serveur indisponible" });
    expect(mocks.updateConversation).not.toHaveBeenCalled();
  });
});
