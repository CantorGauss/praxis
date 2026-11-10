import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../appState.svelte";
import { DEFAULT_SETTINGS, type Conversation, type Persona } from "../../types";
import * as llm from "../../services/llmClient";
import * as director from "../../services/director";
import * as summaries from "../../services/memoryService";
import * as coordination from "../../services/coordination";
import * as emotionAnalysis from "../../services/emotionAnalysis";
import * as objectives from "../../services/objectives";
import type { MessageInteraction } from "../../types";
import { conversationRepo, emotionRepo, messageRepo, participantRepo, presenceRepo, profileRepo } from "../../services/repositories";
import { MAX_CONSECUTIVE_AI_TURNS } from "../../services/scene";

const NOW = "2026-09-19T12:00:00.000Z";
const conversation: Conversation = {
  id: "scene", personaId: "anna", title: "Au café", sceneDescription: "Un café tranquille.",
  summary: null, summaryThroughMessageId: null, memory: null, objectives: [], createdAt: NOW, updatedAt: NOW,
  lastInteractionAt: null,
};
const personas: Persona[] = ["Anna", "Marc"].map((name) => ({
  id: name.toLowerCase(), name, description: null, systemPrompt: `Tu es ${name}.`,
  stableTraits: [], defaultModelId: null, temperature: 0.7, topP: null,
  maxOutputTokens: 128, gender: "neutral", avatarSetId: null, avatarStyle: null, lorebook: null,
  createdAt: NOW, updatedAt: NOW,
}));

let nextId: number;
let speakerIds: Array<string | null>;
let reply: (callbacks: llm.StreamCallbacks) => void;

function complete(callbacks: llm.StreamCallbacks) {
  callbacks.onDelta("Une nouvelle réplique pour les autres.");
  callbacks.onDone();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 16));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  app.closeConversation();
  app.settings = {
    ...DEFAULT_SETTINGS, emotionEnabled: false, sceneDirector: "round",
    sceneAutoRounds: 0, idleChatterSeconds: 0, conversationLanguage: "fr",
    // Le rythme de lecture a ses propres tests ; ici on suit l'enchaînement.
    revealSpeed: "instant",
  };
  app.personas = personas;
  app.conversations = [conversation];
  app.currentConversationId = conversation.id;
  app.participantIds = personas.map((p) => p.id);
  app.connections = [{
    id: "local", name: "Local", baseUrl: "http://localhost:8080/v1",
    allowRemoteHosts: false, timeoutMs: 1000, selectedModelId: "model",
    createdAt: NOW, updatedAt: NOW,
  }];
  app.idlePaused = false;
  app.userSilent = false;
  app.errorBanner = null;
  app.notice = null;
  nextId = 0;
  speakerIds = [];
  reply = complete;
  vi.spyOn(profileRepo, "get").mockResolvedValue({ modelId: "model" });
  vi.spyOn(messageRepo, "create").mockImplementation(async (
    conversationId, role, content, status = "complete", speaker, kind = "speech", addressee = null,
  ) => ({
    id: String(++nextId), conversationId, role, content, status, kind, addressee,
    personaId: speaker?.id ?? null, personaName: speaker?.name ?? null, createdAt: NOW,
  }));
  vi.spyOn(messageRepo, "update").mockResolvedValue();
  vi.spyOn(messageRepo, "remove").mockResolvedValue();
  vi.spyOn(messageRepo, "removeAfter").mockResolvedValue();
  vi.spyOn(messageRepo, "saveInteraction").mockResolvedValue();
  vi.spyOn(coordination, "analyzeInteraction").mockResolvedValue(null);
  vi.spyOn(messageRepo, "list").mockResolvedValue([]);
  vi.spyOn(conversationRepo, "touch").mockResolvedValue(NOW);
  vi.spyOn(conversationRepo, "update").mockResolvedValue();
  vi.spyOn(participantRepo, "list").mockResolvedValue(personas.map((p, position) => ({
    conversationId: conversation.id, personaId: p.id, position, active: true,
  })));
  vi.spyOn(participantRepo, "replace").mockResolvedValue();
  vi.spyOn(participantRepo, "join").mockResolvedValue();
  vi.spyOn(participantRepo, "leave").mockResolvedValue();
  vi.spyOn(presenceRepo, "list").mockResolvedValue([]);
  vi.spyOn(llm, "streamChat").mockImplementation(async (_target, _id, _body, callbacks) => {
    speakerIds.push(app.streamingPersonaId);
    reply(callbacks);
  });
  vi.spyOn(llm, "cancelStream").mockResolvedValue();
});

const speechAct = (patch: Partial<MessageInteraction> = {}): MessageInteraction => ({
  intent: "statement", addresseeId: null, replyToMessageId: null, proposal: null,
  responses: [], withdrawal: null, ...patch,
});

describe("coordination de la scène", () => {
  it("attend que la réplique soit lue avant de donner la parole au suivant", async () => {
    app.settings.revealSpeed = "normal";
    const sending = app.sendMessage("Bonsoir à tous.");
    await vi.advanceTimersByTimeAsync(500);
    expect(speakerIds).toEqual(["anna"]);
    expect(app.messages.at(-1)?.status).toBe("streaming");
    expect(app.messages.at(-1)?.content.length).toBeLessThan(
      "Une nouvelle réplique pour les autres.".length,
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(speakerIds).toEqual(["anna", "marc"]);
    // « Tout afficher » libère aussitôt la scène.
    app.skipReveal();
    await vi.advanceTimersByTimeAsync(0);
    await sending;
    expect(app.messages.filter((m) => m.role === "assistant").every((m) => m.status === "complete")).toBe(true);
  });

  it("consulte le directeur après chaque réplique, y compris après l'utilisateur", async () => {
    app.settings.sceneDirector = "model";
    app.personas = [...personas, { ...personas[0], id: "gwen", name: "Gwen" }];
    app.participantIds = ["anna", "marc", "gwen"];
    const choose = vi.spyOn(director, "chooseSpeakers")
      .mockResolvedValueOnce(["anna", "gwen"])
      .mockResolvedValueOnce(["marc"])
      .mockResolvedValueOnce(["anna"]);
    reply = (callbacks) => {
      callbacks.onDelta(`Réplique de ${app.streamingPersonaId}.`);
      callbacks.onDone();
    };
    await app.sendMessage("Une idée ?");
    expect(speakerIds).toEqual(["anna", "marc", "anna"]);
    expect(choose.mock.calls.map(([input]) => input.recentMessages.at(-1)?.content)).toEqual([
      "Une idée ?", "Réplique de anna.", "Réplique de marc.",
    ]);
    expect(choose.mock.calls.map(([input]) => input.afterUserMessage)).toEqual([true, false, false]);
  });

  it("donne priorité au destinataire d'une question même s'il a déjà parlé", async () => {
    app.personas = [...personas, { ...personas[0], id: "gwen", name: "Gwen" }];
    app.participantIds = ["anna", "marc", "gwen"];
    vi.mocked(coordination.analyzeInteraction).mockImplementation(async ({ message }) => speechAct({
      intent: "question", addresseeId: message.personaId === "anna" ? "marc" : message.personaId === "marc" ? "anna" : null,
    }));
    await app.sendMessage("On en parle ?");
    expect(speakerIds).toEqual(["anna", "marc", "anna"]);
    expect(messageRepo.saveInteraction).toHaveBeenCalledTimes(4);
  });

  it("ne laisse pas le directeur faire parler deux fois de suite le même personnage", async () => {
    app.settings.sceneDirector = "model";
    vi.spyOn(director, "chooseSpeakers").mockResolvedValue(["anna"]);
    await app.sendMessage("Une idée ?");
    expect(speakerIds).toEqual(["anna", "marc"]);
  });

  it("fait parler l'entrant d'abord et lui dit que l'arrivée est la sienne", async () => {
    app.settings.sceneDirector = "model";
    app.participantIds = ["anna"];
    vi.spyOn(participantRepo, "join").mockResolvedValue();
    vi.spyOn(director, "chooseSpeakers").mockResolvedValue(["marc"]);
    await app.enterScene("marc", "Marc entre dans la pièce.");
    expect(speakerIds).toEqual(["marc", "anna"]);
    const requests = vi.mocked(llm.streamChat).mock.calls.map(([, , body]) => JSON.stringify(body));
    expect(requests[0]).toContain("c'est toi, Marc, qui viens d'arriver");
    expect(requests[1]).not.toContain("qui viens d'arriver");
    expect(requests[1]).toContain("Quelque chose vient de se produire");
  });

  it("rappelle à l'entrant que l'arrivée est la sienne quand sa réplique est régénérée", async () => {
    app.participantIds = ["anna"];
    vi.spyOn(participantRepo, "join").mockResolvedValue();
    await app.enterScene("marc", "Marc entre dans la pièce.", false);
    app.messages = [...app.messages, {
      id: "marc-1", conversationId: conversation.id, role: "assistant", kind: "speech",
      content: "Une réplique ratée.", status: "complete", addressee: null,
      personaId: "marc", personaName: "Marc", createdAt: NOW,
    }];
    await app.regenerate();
    expect(JSON.stringify(vi.mocked(llm.streamChat).mock.calls[0][2]))
      .toContain("c'est toi, Marc, qui viens d'arriver");
  });

  it("conserve les destinataires imposés et ne délègue pas ce choix au directeur", async () => {
    app.settings.sceneDirector = "model";
    const choose = vi.spyOn(director, "chooseSpeakers").mockResolvedValue(["anna"]);
    await app.sendMessage("@Marc tu en penses quoi ?");
    expect(speakerIds).toEqual(["marc"]);
    expect(choose).not.toHaveBeenCalled();
  });

  it("respecte une pause du directeur sans relancer des tours automatiques", async () => {
    app.settings.sceneDirector = "model";
    app.settings.sceneAutoRounds = 3;
    const choose = vi.spyOn(director, "chooseSpeakers")
      .mockResolvedValueOnce(["anna"])
      .mockResolvedValue([]);
    await app.sendMessage("Bonjour");
    expect(speakerIds).toEqual(["anna"]);
    expect(choose).toHaveBeenCalledTimes(2);
  });

  it("transmet les propositions et les positions au personnage suivant puis les conserve", async () => {
    reply = (callbacks) => {
      callbacks.onDelta(app.streamingPersonaId === "anna" ? "Allons au parc." : "D'accord.");
      callbacks.onDone();
    };
    vi.mocked(coordination.analyzeInteraction).mockImplementation(async ({ message, history }) => {
      if (message.personaId === "anna") return speechAct({ intent: "proposal", proposal: {
        text: "Aller au parc", evidence: message.content, participantIds: ["anna", "marc"], replacesId: null,
      } });
      if (message.personaId === "marc") return speechAct({ intent: "agreement", responses: [{
        proposalId: history.find((m) => m.personaId === "anna")!.id,
        stance: "agree", condition: null, evidence: message.content,
      }] });
      return speechAct();
    });
    await app.sendMessage("Que faire ?");
    const marcPrompt = JSON.stringify(vi.mocked(llm.streamChat).mock.calls[1][2].messages);
    expect(marcPrompt).toContain("Aller au parc");
    expect(marcPrompt).toContain("COORDINATION DE LA CONVERSATION");
    expect(app.proposals[0].status).toBe("agreed");
    expect(messageRepo.saveInteraction).toHaveBeenCalledTimes(3);
    const saved = JSON.parse(JSON.stringify(app.messages));
    app.closeConversation();
    vi.mocked(messageRepo.list).mockResolvedValueOnce(saved);
    await app.openConversation(conversation.id);
    expect(app.proposals[0].status).toBe("agreed");
  });

  it("ne révèle pas à un arrivant ce qui s'est dit avant son entrée", async () => {
    const before = "2026-09-19T11:00:00.000Z";
    app.participantIds = ["anna"];
    app.messages = [
      { id: "old-1", conversationId: conversation.id, role: "user", kind: "speech",
        content: "Le code du coffre est 4512.", status: "complete", createdAt: before,
        personaId: null, personaName: null, addressee: null },
      { id: "old-2", conversationId: conversation.id, role: "assistant", kind: "speech",
        content: "Je le garderai pour moi.", status: "complete", createdAt: before,
        personaId: "anna", personaName: "Anna", addressee: null },
    ];
    vi.mocked(presenceRepo.list).mockResolvedValue([
      { personaId: "anna", enteredAt: null, leftAt: null },
      { personaId: "marc", enteredAt: NOW, leftAt: null },
    ]);
    await app.enterScene("marc", "Marc entre dans le café.");
    await vi.advanceTimersByTimeAsync(1000);

    const prompts = vi.mocked(llm.streamChat).mock.calls.map((call) => ({
      speaker: (call[2].messages as { content: string }[])[0].content,
      text: JSON.stringify(call[2].messages),
    }));
    const marc = prompts.find((p) => p.speaker.includes("Tu es Marc."))!;
    const anna = prompts.find((p) => p.speaker.includes("Tu es Anna."))!;
    expect(marc.text).not.toContain("4512");
    expect(marc.text).toContain("Marc entre dans le café.");
    expect(marc.text).toContain("[CE QUE TU SAIS DE LA SCÈNE]");
    expect(anna.text).toContain("4512");
    expect(anna.text).not.toContain("[CE QUE TU SAIS DE LA SCÈNE]");
  });

  it("ne donne pas non plus les faits de la mémoire à l'analyse émotionnelle d'un arrivant", async () => {
    const before = "2026-09-19T11:00:00.000Z";
    app.settings = { ...app.settings, emotionEnabled: true, emotionAnalysisEnabled: true };
    app.conversations = [{
      ...conversation, summaryThroughMessageId: "old-1",
      memory: {
        version: 1, state: [], threads: [], nextFactNumber: 2,
        facts: [{
          id: "f1", text: "Le code du coffre est 4512.", category: "secret", pinned: false,
          origin: "auto", sourceMessageIds: ["old-1"], createdAt: before, updatedAt: before,
        }],
      },
    }];
    app.participantIds = ["anna"];
    app.messages = [
      { id: "old-1", conversationId: conversation.id, role: "user", kind: "speech",
        content: "Un secret.", status: "complete", createdAt: before,
        personaId: null, personaName: null, addressee: null },
    ];
    vi.mocked(presenceRepo.list).mockResolvedValue([
      { personaId: "anna", enteredAt: null, leftAt: null },
      { personaId: "marc", enteredAt: NOW, leftAt: null },
    ]);
    vi.spyOn(participantRepo, "join").mockResolvedValue();
    vi.spyOn(emotionRepo, "get").mockResolvedValue(null);
    vi.spyOn(emotionRepo, "save").mockResolvedValue();
    const assess = vi.spyOn(emotionAnalysis, "assessEmotionalReaction")
      .mockImplementation(async (_target, _model, _persona, state) => ({ state, reaction: null }));
    await app.enterScene("marc", "Marc entre dans le café.");
    await vi.advanceTimersByTimeAsync(1000);

    const known = (id: string) => assess.mock.calls.find((call) => call[2].id === id)?.[8];
    expect(known("marc") ?? "").not.toContain("4512");
    expect(known("anna")).toContain("4512");
  });

  it("ne conserve pas l'ancien accord lors d'une régénération de la dernière réplique", async () => {
    reply = (callbacks) => { callbacks.onDelta(app.streamingPersonaId === "anna" ? "Allons au parc." : "D'accord."); callbacks.onDone(); };
    vi.mocked(coordination.analyzeInteraction).mockImplementation(async ({ message, history }) => {
      if (message.personaId === "anna") return speechAct({ proposal: { text: "Parc", evidence: message.content, participantIds: ["anna", "marc"], replacesId: null } });
      if (message.personaId === "marc" && message.content === "D'accord.") return speechAct({ responses: [{ proposalId: history.find((m) => m.personaId === "anna")!.id, stance: "agree", condition: null, evidence: message.content }] });
      return speechAct();
    });
    await app.sendMessage("Que faire ?");
    expect(app.proposals[0].status).toBe("agreed");
    reply = (callbacks) => { callbacks.onDelta("Je réfléchis encore."); callbacks.onDone(); };
    await app.regenerate();
    expect(speakerIds).toEqual(["anna", "marc", "marc"]);
    expect(app.proposals[0].status).toBe("open");
  });

  it("invalide les intentions, le destinataire et la mémoire après modification", async () => {
    vi.mocked(coordination.analyzeInteraction).mockResolvedValue(speechAct({ intent: "question" }));
    await app.sendMessage("@Anna Bonjour");
    app.conversations = [{
      ...conversation, summaryThroughMessageId: app.messages[0].id,
      memory: {
        version: 1, state: ["Anna salue Jeff."], threads: [], nextFactNumber: 3,
        facts: [
          { id: "f1", text: "Ancien accord.", category: "commitment", pinned: false, origin: "auto",
            sourceMessageIds: [app.messages[0].id], createdAt: NOW, updatedAt: NOW },
          { id: "f2", text: "Jeff aime le thé.", category: "person", pinned: true, origin: "user",
            sourceMessageIds: [], createdAt: NOW, updatedAt: NOW },
        ],
      },
    }];
    await app.editLastUserMessage("@Marc Bonsoir");
    expect(messageRepo.removeAfter).toHaveBeenCalled();
    expect(messageRepo.update).toHaveBeenLastCalledWith(expect.any(String), "Une nouvelle réplique pour les autres.", "complete", null);
    expect(app.messages[0].content).toBe("@Marc Bonsoir");
    expect(app.currentConversation?.summaryThroughMessageId).toBeNull();
    // Le fait tiré du message modifié tombe ; celui de l'utilisateur reste.
    expect(app.currentConversation?.memory?.facts.map((f) => f.id)).toEqual(["f2"]);
    expect(app.currentConversation?.memory?.state).toEqual([]);
    expect(speakerIds).toEqual(["anna", "marc"]);
    expect(coordination.analyzeInteraction).toHaveBeenCalledTimes(4);
  });

  it("ne poursuit pas une ancienne sélection après un message en attente", async () => {
    app.settings.sceneDirector = "model";
    let finishChoice!: (ids: string[]) => void;
    vi.spyOn(director, "chooseSpeakers")
      .mockResolvedValueOnce(["anna"])
      .mockImplementationOnce(() => new Promise((resolve) => { finishChoice = resolve; }))
      .mockResolvedValue(["marc"]);
    const running = app.sendMessage("Bonjour");
    await vi.advanceTimersByTimeAsync(0);
    expect(speakerIds).toEqual(["anna"]);
    await app.sendMessage("@Marc Une seconde.");
    finishChoice(["anna"]);
    await running;
    await vi.advanceTimersByTimeAsync(0);
    expect(speakerIds).toEqual(["anna", "marc"]);
    expect(app.messages.find((m) => m.content === "@Marc Une seconde.")).toBeTruthy();
  });
});

afterEach(() => {
  app.closeConversation();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("mode Se taire", () => {
  it("démarre une scène vide puis alterne au-delà du plafond, même sans autonomie configurée", async () => {
    expect(app.canContinueScene).toBe(false);
    await app.staySilent();
    const total = personas.length * MAX_CONSECUTIVE_AI_TURNS + 2;
    for (let i = 1; i < total; i++) await vi.advanceTimersByTimeAsync(750);

    expect(speakerIds).toHaveLength(total);
    expect(speakerIds).toEqual(Array.from({ length: total }, (_, i) => personas[i % 2].id));
    expect(app.messages.every((message) => message.role === "assistant")).toBe(true);
    expect(app.userSilent).toBe(true);
    expect(app.canContinueScene).toBe(true);
    expect(app.idleResumeAt).toBeNull();
    const body = vi.mocked(llm.streamChat).mock.calls[0][2];
    expect(JSON.stringify(body.messages)).toContain("choisit d'écouter sans intervenir");
    app.reclaimFloor();
    expect(app.canContinueScene).toBe(false);
  });

  it("enchaîne même si le directeur demande le silence ou redésigne le dernier locuteur", async () => {
    app.settings.sceneDirector = "model";
    vi.spyOn(director, "chooseSpeakers")
      .mockResolvedValueOnce([])
      .mockResolvedValue(["anna"]);
    await app.staySilent();
    await vi.advanceTimersByTimeAsync(750);
    expect(speakerIds).toEqual(["anna", "marc"]);
  });

  it("termine la réponse à l'utilisateur avant de commencer à échanger entre personnages", async () => {
    let firstReply!: llm.StreamCallbacks;
    reply = (callbacks) => { firstReply = callbacks; };
    const sending = app.sendMessage("Bonjour");
    await vi.advanceTimersByTimeAsync(0);
    await app.staySilent();
    expect(speakerIds).toEqual(["anna"]);
    reply = complete;
    complete(firstReply);
    await sending;
    expect(speakerIds).toEqual(["anna", "marc"]);
    await vi.advanceTimersByTimeAsync(750);
    expect(speakerIds).toEqual(["anna", "marc", "anna"]);
  });

  it("rend la parole après la réplique en cours et reste arrêté malgré la minuterie habituelle", async () => {
    app.settings.idleChatterSeconds = 1;
    let pending!: llm.StreamCallbacks;
    reply = (callbacks) => { pending = callbacks; };
    const running = app.staySilent();
    await vi.advanceTimersByTimeAsync(0);
    app.reclaimFloor();
    expect(llm.cancelStream).not.toHaveBeenCalled();
    complete(pending);
    await running;
    await vi.advanceTimersByTimeAsync(5000);
    expect(speakerIds).toEqual(["anna"]);
    expect(app.userSilent).toBe(false);
    expect(app.userHasFloor).toBe(true);
  });

  it.each(["speech", "scene"] as const)("envoie l'intervention %s après la réplique et quitte le mode", async (mode) => {
    let pending!: llm.StreamCallbacks;
    reply = (callbacks) => { pending = callbacks; };
    const running = app.staySilent();
    await vi.advanceTimersByTimeAsync(0);
    if (mode === "speech") await app.sendMessage("Je reviens.");
    else await app.sendSceneEvent("La porte s'ouvre.");
    expect(app.userSilent).toBe(false);
    expect(app.queuedMessage?.mode).toBe(mode);
    reply = complete;
    complete(pending);
    await running;
    await vi.advanceTimersByTimeAsync(5000);
    expect(app.messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(app.queuedMessage).toBeNull();
    expect(speakerIds).toHaveLength(3);
  });

  it("reprend la main pendant le choix du directeur sans générer une réplique", async () => {
    app.settings.sceneDirector = "model";
    let choose!: (ids: string[]) => void;
    vi.spyOn(director, "chooseSpeakers").mockReturnValue(new Promise((resolve) => { choose = resolve; }));
    const running = app.staySilent();
    await vi.advanceTimersByTimeAsync(0);
    expect(app.directing).toBe(true);
    app.reclaimFloor();
    choose(["anna"]);
    await running;
    await vi.advanceTimersByTimeAsync(5000);
    expect(llm.streamChat).not.toHaveBeenCalled();
  });

  it("ne lance pas de réponse si l'utilisateur reprend la main pendant l'enregistrement", async () => {
    const createMessage = vi.mocked(messageRepo.create).getMockImplementation()!;
    let finishSave!: () => void;
    vi.mocked(messageRepo.create).mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => { finishSave = resolve; });
      return createMessage(...args);
    });
    const running = app.staySilent();
    await vi.advanceTimersByTimeAsync(0);
    app.reclaimFloor();
    finishSave();
    await running;
    await vi.advanceTimersByTimeAsync(5000);
    expect(llm.streamChat).not.toHaveBeenCalled();
    expect(messageRepo.remove).toHaveBeenCalledWith("1");
    expect(app.messages).toHaveLength(0);
  });

  it("attend la fin d'une reconstruction manuelle de la mémoire pour démarrer le mode silencieux", async () => {
    const history = Array.from({ length: summaries.KEEP_RECENT_MESSAGES + 1 }, (_, i) => ({
      id: `old-${i}`, conversationId: conversation.id, role: "assistant" as const,
      content: "Une ancienne réplique.", status: "complete" as const, kind: "speech" as const,
      personaId: "anna", personaName: "Anna", addressee: null, createdAt: NOW,
    }));
    vi.mocked(messageRepo.list).mockResolvedValueOnce(history);
    let finishSummary!: (outcome: summaries.MemoryOutcome) => void;
    vi.spyOn(summaries, "rebuildMemory").mockReturnValue(new Promise((resolve) => { finishSummary = resolve; }));
    const rebuilding = app.regenerateSummary();
    await vi.advanceTimersByTimeAsync(0);
    expect(app.summarizing).toBe(true);
    await app.staySilent();
    expect(llm.streamChat).not.toHaveBeenCalled();
    finishSummary({
      ok: true, conversation,
      applied: { memory: { version: 1, facts: [], state: [], threads: [], nextFactNumber: 1 }, added: 0, updated: 0, retired: 0 },
    });
    await rebuilding;
    await vi.advanceTimersByTimeAsync(750);
    expect(speakerIds).toEqual(["anna"]);
    expect(app.userSilent).toBe(true);
  });

  it.each(["error", "empty", "preparation"])("s'arrête sur une réponse %s sans boucle de nouvelles requêtes", async (failure) => {
    if (failure === "preparation") vi.mocked(profileRepo.get).mockRejectedValue(new Error("Profile unavailable"));
    else reply = failure === "error" ? (callbacks) => callbacks.onError("Offline") : (callbacks) => callbacks.onDone();
    await app.staySilent();
    const calls = speakerIds.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(speakerIds).toHaveLength(calls);
    expect(app.userSilent).toBe(false);
  });

  it.each(["close", "switch", "solo", "stop"])("ne relance pas la scène après %s", async (action) => {
    await app.staySilent();
    if (action === "close") app.closeConversation();
    if (action === "switch") {
      app.conversations = [...app.conversations, { ...conversation, id: "other" }];
      await app.openConversation("other");
    }
    if (action === "solo") await app.setParticipants(["anna"]);
    if (action === "stop") await app.cancelGeneration();
    await vi.advanceTimersByTimeAsync(5000);
    expect(speakerIds).toEqual(["anna"]);
    expect(app.userSilent).toBe(false);
  });

  it("préserve la limite et l'absence de relance hors du mode silencieux", async () => {
    await app.sendMessage("Bonjour");
    for (let i = 0; i < 10; i++) await app.continueScene(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(speakerIds).toHaveLength(personas.length * MAX_CONSECUTIVE_AI_TURNS);
    expect(app.canContinueScene).toBe(false);
    expect(app.userSilent).toBe(false);
  });
});

describe("objectifs secrets", () => {
  it("les écrit une fois avant la première réplique et les donne à chacun en privé", async () => {
    app.settings.sceneAutoRounds = 1;
    app.conversations = [{ ...conversation, objectives: [] }];
    const invent = vi.spyOn(objectives, "inventObjectives").mockResolvedValue([
      { personaId: "anna", goal: "obtenir les clés de Marc", secret: "Anna a perdu le double." },
      { personaId: "marc", goal: "garder les clés", secret: null },
    ]);
    const store = vi.spyOn(conversationRepo, "setObjectives").mockResolvedValue();
    await app.sendMessage("Bonsoir.");
    expect(invent).toHaveBeenCalledTimes(1);
    expect(invent.mock.calls[0][0].forIds).toEqual(["anna", "marc"]);
    expect(store).toHaveBeenCalledTimes(1);
    const bodies = vi.mocked(llm.streamChat).mock.calls.map(([, , body]) => JSON.stringify(body));
    const annaBody = bodies[speakerIds.indexOf("anna")];
    const marcBody = bodies[speakerIds.indexOf("marc")];
    expect(annaBody).toContain("obtenir les clés de Marc");
    expect(annaBody).toContain("Anna a perdu le double.");
    expect(marcBody).toContain("garder les clés");
    expect(marcBody).not.toContain("Anna a perdu le double.");
  });

  it("ne relance pas l'auteur à chaque réplique après un échec", async () => {
    app.settings.sceneAutoRounds = 2;
    app.conversations = [{ ...conversation, objectives: [] }];
    const invent = vi.spyOn(objectives, "inventObjectives").mockResolvedValue([]);
    await app.sendMessage("Bonsoir.");
    expect(invent).toHaveBeenCalledTimes(1);
  });

  it("ne s'en mêle pas quand le réglage est coupé", async () => {
    app.settings.sceneObjectives = false;
    app.conversations = [{ ...conversation, objectives: [] }];
    const invent = vi.spyOn(objectives, "inventObjectives").mockResolvedValue([]);
    await app.sendMessage("Bonsoir.");
    expect(invent).not.toHaveBeenCalled();
  });
});
