import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatCompletion: vi.fn(),
  updateConversation: vi.fn(),
}));

vi.mock("../llmClient", async () => {
  const actual = await vi.importActual<typeof import("../llmClient")>(
    "../llmClient",
  );
  return { ...actual, chatCompletion: mocks.chatCompletion };
});

vi.mock("../repositories", () => ({
  conversationRepo: { update: mocks.updateConversation },
}));

import {
  needsSummary,
  rebuildSummary,
  limitSummaryBullets,
  uncoveredMessages,
  updateSummary,
  KEEP_RECENT_MESSAGES,
  MAX_SUMMARY_BATCH,
  MIN_SUMMARY_BATCH,
  SUMMARY_FORMAT_MARKER,
  SUMMARY_MAX_BULLETS,
  SUMMARY_MAX_OUTPUT_TOKENS,
  summaryIsFull,
  summaryRequestParameters,
  summaryLooksTruncated,
  summaryNeedsRefresh,
} from "../summaryService";
import type { ConnectionTarget, Conversation } from "../../types";
import type { Message } from "../../types";
import { frPrompts } from "../../i18n/prompts";

function message(id: string, content = "contenu"): Message {
  return {
    id,
    conversationId: "c1",
    role: "user",
    content,
    status: "complete",
    kind: "speech",
    addressee: null,
    createdAt: `2026-01-01T00:00:00.${id.padStart(3, "0")}Z`,
    personaId: null,
    personaName: null,
  };
}

describe("needsSummary", () => {
  it("ne déclenche pas sous 55 % du contexte", () => {
    const messages = [message("1", "court"), message("2", "court")];
    expect(needsSummary(messages, null, 8192)).toBe(false);
  });

  it("déclenche au-delà de 55 % avec assez de messages", () => {
    const messages = Array.from(
      { length: KEEP_RECENT_MESSAGES + MIN_SUMMARY_BATCH },
      (_, i) =>
      message(String(i), "x".repeat(2000)),
    );
    expect(needsSummary(messages, null, 8192)).toBe(true);
  });

  it("ne déclenche pas s'il reste trop peu de messages à couvrir", () => {
    const messages = Array.from({ length: KEEP_RECENT_MESSAGES }, (_, i) =>
      message(String(i), "x".repeat(10_000)),
    );
    expect(needsSummary(messages, null, 8192)).toBe(false);
  });

  it("déclenche sur le nombre de messages même s'ils sont courts", () => {
    // Sans ce plafond, une centaine de répliques brèves s'accumulaient avant
    // d'atteindre le seuil du contexte — et chacune était retraitée à chaque tour.
    const messages = Array.from({ length: 25 }, (_, i) => message(String(i), "ok"));
    expect(needsSummary(messages, null, 8192)).toBe(false);
    expect(needsSummary(messages, null, 8192, 24)).toBe(true);
  });

  it("respecte le minimum de messages conservés malgré le plafond", () => {
    const messages = Array.from({ length: KEEP_RECENT_MESSAGES }, (_, i) =>
      message(String(i), "ok"),
    );
    expect(needsSummary(messages, null, 8192, 2)).toBe(false);
  });

  it("attend un vrai lot avant de réécrire le résumé", () => {
    const messages = Array.from(
      { length: KEEP_RECENT_MESSAGES + MIN_SUMMARY_BATCH - 1 },
      (_, i) => message(String(i), "x".repeat(10_000)),
    );
    expect(needsSummary(messages, null, 8192, 2)).toBe(false);
  });
});

describe("uncoveredMessages", () => {
  const messages = [message("1"), message("2"), message("3")];

  it("retourne tout sans frontière", () => {
    expect(uncoveredMessages(messages, null)).toHaveLength(3);
  });

  it("retourne les messages après la frontière", () => {
    expect(uncoveredMessages(messages, "2").map((m) => m.id)).toEqual(["3"]);
  });

  it("retourne tout si la frontière est inconnue", () => {
    expect(uncoveredMessages(messages, "zz")).toHaveLength(3);
  });
});

describe("summaryNeedsRefresh", () => {
  it("repère les résumés de l'ancien format", () => {
    expect(summaryNeedsRefresh("Ancien résumé libre")).toBe(true);
    expect(summaryNeedsRefresh(`${SUMMARY_FORMAT_MARKER}\nÉTAT ACTUEL\n...`)).toBe(
      false,
    );
    expect(summaryNeedsRefresh(null)).toBe(false);
    expect(summaryNeedsRefresh("[ACTIVE MEMORY v3]\nÉTAT ACTUEL\n...")).toBe(true);
  });

  it("repère une dernière puce coupée", () => {
    const partial = `${SUMMARY_FORMAT_MARKER}\n**ÉTAT ACTUEL**\n* Leur relation amicale`;
    expect(summaryLooksTruncated(partial)).toBe(true);
    expect(summaryNeedsRefresh(partial)).toBe(true);
    expect(
      summaryLooksTruncated(
        `${SUMMARY_FORMAT_MARKER}\n**ÉTAT ACTUEL**\n* Leur relation est amicale.`,
      ),
    ).toBe(false);
  });
});

describe("limitSummaryBullets", () => {
  it("supprime les puces excédentaires et leur rubrique devenue vide", () => {
    const summary = [
      "**ÉTAT ACTUEL**",
      ...Array.from({ length: SUMMARY_MAX_BULLETS }, (_, i) => `- Fait ${i + 1}.`),
      "",
      "**ÉVÉNEMENTS RÉCENTS IMPORTANTS**",
      "- Ancien détail de trop.",
    ].join("\n");

    const limited = limitSummaryBullets(summary);

    expect(limited.match(/^- /gm)).toHaveLength(SUMMARY_MAX_BULLETS);
    expect(limited).not.toContain("Ancien détail de trop");
    expect(limited).not.toContain("ÉVÉNEMENTS RÉCENTS IMPORTANTS");
  });

  it("laisse intact un résumé déjà dans le budget", () => {
    const summary = "**ÉTAT ACTUEL**\n- Situation active.";
    expect(limitSummaryBullets(summary)).toBe(summary);
  });
});

describe("summaryRequestParameters", () => {
  it("réduit automatiquement le raisonnement des résumés OpenRouter", () => {
    const params = summaryRequestParameters(
      {
        id: "or",
        baseUrl: "https://openrouter.ai/api/v1/",
        allowRemoteHosts: true,
        timeoutMs: 120_000,
      },
      { reasoning: { effort: "high" }, top_p: 0.9 },
    );
    expect(params.reasoning).toEqual({ effort: "none", exclude: true });
    expect(params.top_p).toBe(0.9);
  });

  it("coupe le raisonnement sur un serveur local sans y ajouter l'objet OpenRouter", () => {
    const params = summaryRequestParameters(
      {
        id: "local",
        baseUrl: "http://localhost:1234/v1",
        allowRemoteHosts: false,
        timeoutMs: 120_000,
      },
      { top_p: 0.9 },
    );
    expect(params).toEqual({
      top_p: 0.9,
      reasoning_effort: "none",
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(params.reasoning).toBeUndefined();
  });
});

describe("updateSummary", () => {
  const conversation: Conversation = {
    id: "c1",
    personaId: "p1",
    title: "T",
    sceneDescription: null,
    summary: null,
    summaryThroughMessageId: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    lastInteractionAt: null,
  };
  const connection: ConnectionTarget = {
    id: "conn-1",
    baseUrl: "http://localhost:1234/v1",
    allowRemoteHosts: false,
    timeoutMs: 120_000,
  };

  beforeEach(() => {
    mocks.chatCompletion.mockReset();
    mocks.updateConversation.mockReset();
  });

  it("distingue « rien à résumer » d'un échec", async () => {
    // Moins de messages que la fenêtre conservée : il n'y a rien à couvrir.
    // Ce n'est pas un incident, et l'utilisateur ne doit pas être alerté.
    const messages = Array.from({ length: KEEP_RECENT_MESSAGES }, (_, i) =>
      message(String(i)),
    );
    const outcome = await updateSummary(connection, "m", conversation, messages);
    expect(outcome).toEqual({ ok: false, reason: null });
  });

  it("demande de condenser une mémoire pleine", async () => {
    mocks.chatCompletion.mockResolvedValue("FAITS ÉTABLIS\n- Synthèse des faits anciens.");
    const messages = Array.from(
      { length: KEEP_RECENT_MESSAGES + MIN_SUMMARY_BATCH },
      (_, i) => message(String(i)),
    );
    const full = Array.from({ length: SUMMARY_MAX_BULLETS }, (_, i) => `- Fait ${i}.`).join("\n");

    await updateSummary(
      connection,
      "m",
      { ...conversation, summary: `${SUMMARY_FORMAT_MARKER}\nFAITS ÉTABLIS\n${full}` },
      messages,
    );

    expect(mocks.chatCompletion).toHaveBeenCalledTimes(1);
    expect(mocks.chatCompletion.mock.calls[0][1].messages[1].content).toContain(
      "The memory is full",
    );
  });

  it("repère aussi une mémoire pleine écrite sans puces", () => {
    expect(summaryIsFull("Un fait sans puce.\n".repeat(300))).toBe(true);
    expect(summaryIsFull("Un fait sans puce.")).toBe(false);
    expect(summaryIsFull(null)).toBe(false);
  });

  it("retente en condensant quand le résumé dépasse la limite de tokens", async () => {
    mocks.chatCompletion
      .mockRejectedValueOnce(new Error("the model hit the token limit"))
      .mockResolvedValueOnce("FAITS ÉTABLIS\n- Mémoire condensée.");
    const messages = Array.from(
      { length: KEEP_RECENT_MESSAGES + MIN_SUMMARY_BATCH },
      (_, i) => message(String(i)),
    );

    const outcome = await updateSummary(
      connection,
      "m",
      { ...conversation, summary: `${SUMMARY_FORMAT_MARKER}\nFAITS ÉTABLIS\n- Un fait ancien.` },
      messages,
    );

    expect(outcome.ok).toBe(true);
    const [first, second] = mocks.chatCompletion.mock.calls.map((call) => call[1]);
    expect(first.messages[1].content).not.toContain("The memory is full");
    expect(second.messages[1].content).toContain("The memory is full");
  });

  it("garde l'état courant quand les faits s'emballent", async () => {
    const bullets = Array.from({ length: 40 }, (_, i) => `- Fait ${i}.`).join("\n");
    mocks.chatCompletion.mockResolvedValue(
      `DERNIER ÉTAT CONNU\n- Inès est devant la porte.\n\nFAITS ÉTABLIS\n${bullets}`,
    );
    const messages = Array.from(
      { length: KEEP_RECENT_MESSAGES + MIN_SUMMARY_BATCH },
      (_, i) => message(String(i)),
    );

    const outcome = await updateSummary(connection, "m", conversation, messages);

    expect(outcome.ok && outcome.conversation.summary).toContain("Inès est devant la porte.");
  });

  it("ne laisse qu'un marqueur, même si le modèle en recopie ou en invente un", async () => {
    mocks.chatCompletion.mockResolvedValue(
      "[ACTIVE MEMORY v4]\n[ACTIVE MEMORY v6]\nFAITS ÉTABLIS\n- Jeff a ouvert l'enveloppe.",
    );
    const messages = Array.from(
      { length: KEEP_RECENT_MESSAGES + MIN_SUMMARY_BATCH },
      (_, i) => message(String(i)),
    );

    const outcome = await updateSummary(
      connection,
      "m",
      {
        ...conversation,
        summary: `${SUMMARY_FORMAT_MARKER}\nFAITS ÉTABLIS\n- Un fait ancien.`,
        summaryThroughMessageId: null,
      },
      messages,
    );

    expect(outcome.ok && outcome.conversation.summary).toBe(
      `${SUMMARY_FORMAT_MARKER}\nFAITS ÉTABLIS\n- Jeff a ouvert l'enveloppe.`,
    );
    const body = mocks.chatCompletion.mock.calls[0][1];
    expect(body.messages[1].content).toContain("Un fait ancien.");
    expect(body.messages[1].content).not.toContain("ACTIVE MEMORY");
  });

  it("borne la sortie et interdit d'oublier un fait que les nouveaux messages taisent", async () => {
    mocks.chatCompletion.mockResolvedValue(
      "**ÉTAT ACTUEL**\n- La scène se déroule dans la cuisine.",
    );
    const messages = Array.from(
      { length: KEEP_RECENT_MESSAGES + MIN_SUMMARY_BATCH },
      (_, i) => message(String(i)),
    );

    const outcome = await updateSummary(connection, "m", conversation, messages);

    expect(outcome.ok).toBe(true);
    expect(mocks.updateConversation).toHaveBeenCalledTimes(1);
    const body = mocks.chatCompletion.mock.calls[0][1];
    expect(body.max_tokens).toBe(SUMMARY_MAX_OUTPUT_TOKENS);
    expect(body.messages[0].content).toContain(
      `Absolute limit: ${SUMMARY_MAX_BULLETS} bullets`,
    );
    expect(body.messages[0].content).toContain(
      "Silence never removes a fact",
    );
    expect(body.messages[0].content).toContain(
      "An order is not carried out because it was given",
    );
  });

  it("reconstruit tous les anciens messages, au-delà du premier lot", async () => {
    mocks.chatCompletion.mockResolvedValue(
      "**ÉTAT ACTUEL**\n- La situation la plus récente reste active.",
    );
    const messages = Array.from({ length: 70 }, (_, i) => message(String(i)));
    const progress: number[] = [];

    const outcome = await rebuildSummary(
      connection,
      "m",
      { ...conversation, summary: "ancien résumé à préserver jusqu'au succès" },
      messages,
      undefined,
      {},
      frPrompts,
      ({ remainingMessages }) => progress.push(remainingMessages),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(mocks.chatCompletion).toHaveBeenCalledTimes(3);
    expect(mocks.updateConversation).toHaveBeenCalledTimes(1);
    expect(outcome.conversation.summaryThroughMessageId).toBe("55");
    expect(progress).toEqual([
      70 - KEEP_RECENT_MESSAGES,
      70 - KEEP_RECENT_MESSAGES - MAX_SUMMARY_BATCH,
      8,
      0,
    ]);
  });

  it("conserve l'ancien résumé si un lot de reconstruction échoue", async () => {
    mocks.chatCompletion
      .mockResolvedValueOnce("**ÉTAT ACTUEL**\n- Premier lot valide.")
      .mockRejectedValue(new Error("serveur indisponible"));
    const messages = Array.from({ length: 70 }, (_, i) => message(String(i)));

    const outcome = await rebuildSummary(
      connection,
      "m",
      { ...conversation, summary: "résumé encore valable" },
      messages,
    );

    expect(outcome).toEqual({ ok: false, reason: "serveur indisponible" });
    expect(mocks.updateConversation).not.toHaveBeenCalled();
  });
});
