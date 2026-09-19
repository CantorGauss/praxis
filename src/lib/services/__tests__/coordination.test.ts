import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message, MessageInteraction } from "../../types";
import { frPrompts } from "../../i18n/prompts";
import * as llm from "../llmClient";
import { analyzeInteraction, collectProposals, coordinationContext, decodeInteraction } from "../coordination";

const participants = [{ id: "anna", name: "Anna" }, { id: "marc", name: "Marc" }];
const interaction = (patch: Partial<MessageInteraction> = {}): MessageInteraction => ({
  intent: "statement", addresseeId: null, replyToMessageId: null,
  proposal: null, responses: [], withdrawal: null, ...patch,
});
function message(id: string, actor: string, content: string, patch: Partial<MessageInteraction> = {}): Message {
  return { id, conversationId: "scene", role: actor === "user" ? "user" : "assistant",
    kind: "speech", content, status: "complete", createdAt: id,
    personaId: actor === "user" ? null : actor, personaName: actor,
    addressee: null, interaction: interaction(patch),
  };
}
function proposal(id = "p1", replacesId: string | null = null) {
  return message(id, "anna", "Allons dîner à vingt heures.", {
    intent: "proposal", proposal: { text: "Dîner à vingt heures", evidence: "Allons dîner à vingt heures.", participantIds: ["anna", "marc"], replacesId },
  });
}
function response(id: string, actor: string, stance: "agree" | "disagree" | "conditional", proposalId = "p1") {
  const text = stance === "agree" ? "D'accord." : stance === "disagree" ? "Je refuse." : "Oui, si c'est moins de vingt euros.";
  return message(id, actor, text, { intent: stance === "agree" ? "agreement" : stance === "disagree" ? "objection" : "conditional",
    replyToMessageId: proposalId,
    responses: [{ proposalId, stance, condition: stance === "conditional" ? "Moins de vingt euros" : null, evidence: text }],
  });
}

afterEach(() => vi.restoreAllMocks());

describe("proposal ledger", () => {
  it("keeps silence and conditional support separate from firm consensus", () => {
    expect(collectProposals([proposal()])[0]).toMatchObject({ status: "open", positions: { anna: { stance: "agree" } } });
    expect(collectProposals([proposal()])[0].positions.marc).toBeUndefined();
    const history = [proposal(), response("2", "marc", "conditional")];
    expect(collectProposals(history)[0]).toMatchObject({ status: "open", positions: { marc: { stance: "conditional", condition: "Moins de vingt euros" } } });
    history.push(response("3", "marc", "agree"));
    expect(collectProposals(history)[0].status).toBe("agreed");
    history.push(response("4", "anna", "disagree"));
    expect(collectProposals(history)[0].status).toBe("open");
  });

  it("records only the actual speaker's position, not a claimed vote for someone else", () => {
    const claim = response("2", "anna", "agree");
    expect(collectProposals([proposal(), claim])[0].positions.marc).toBeUndefined();
    expect(collectProposals([proposal(), response("3", "outsider", "agree")])[0].status).toBe("open");
  });

  it("does not ratify a decision while the human participant has not answered", () => {
    const p = proposal();
    p.interaction!.proposal!.participantIds.push("user");
    const history = [p, response("2", "marc", "agree")];
    expect(collectProposals(history)[0].status).toBe("open");
    expect(collectProposals([...history, response("3", "user", "agree")])[0].status).toBe("agreed");
  });

  it("requires fresh agreements after an author's revision", () => {
    const history = [proposal(), response("2", "marc", "agree"), proposal("p2", "p1")];
    const ledger = collectProposals(history);
    expect(ledger.map((p) => p.status)).toEqual(["superseded", "open"]);
    expect(ledger[1].positions.marc).toBeUndefined();
    expect(collectProposals([...history, response("4", "marc", "agree", "p1")])[1].status).toBe("open");
  });

  it("allows only the author to withdraw, and cannot revive a withdrawn proposal", () => {
    const withdrawal = (actor: string) => message("2", actor, "Je retire ma proposition.", {
      intent: "withdrawal", withdrawal: { proposalId: "p1", evidence: "Je retire ma proposition." },
    });
    expect(collectProposals([proposal(), withdrawal("marc")])[0].status).toBe("open");
    expect(collectProposals([proposal(), withdrawal("anna"), response("3", "marc", "agree")])[0].status).toBe("withdrawn");
  });

  it("replays surviving source messages when an answer is deleted or edited", () => {
    const p = proposal();
    const agree = response("2", "marc", "agree");
    expect(collectProposals([p, agree])[0].status).toBe("agreed");
    expect(collectProposals([p])[0].status).toBe("open");
    expect(collectProposals([p, { ...agree, content: "Je ne sais pas.", interaction: null }])[0].status).toBe("open");
    expect(collectProposals([agree])).toEqual([]);
    // Even stale imported annotations must actually quote their source text.
    expect(collectProposals([p, { ...agree, content: "Je ne sais pas." }])[0].status).toBe("open");
  });

  it.each(["cancelled", "error", "streaming"] as const)("ignores %s replies", (status) => {
    expect(collectProposals([proposal(), { ...response("2", "marc", "agree"), status }])[0].status).toBe("open");
  });

  it("survives persistence without mixing unrelated proposals", () => {
    const history = JSON.parse(JSON.stringify([proposal(), proposal("p2"), response("3", "marc", "agree", "p2")]));
    expect(collectProposals(history).map((p) => p.status)).toEqual(["open", "agreed"]);
    const context = coordinationContext(history, participants, frPrompts);
    expect(context).toContain("Dîner à vingt heures");
    expect(context).toContain('"status":"agreed"');
    expect(context).toContain("conditional n'est pas un accord ferme");
  });

  it("preserves earlier agreements when a persona is deleted but its messages remain", () => {
    const history = [proposal(), response("2", "marc", "agree")];
    for (const m of history) {
      m.interaction!.actorId = m.personaId!;
      m.personaId = null;
    }
    expect(collectProposals(history)[0]).toMatchObject({ authorId: "anna", status: "agreed" });
  });
});

describe("interaction extraction", () => {
  const input = (m: Message, history: Message[] = []) => ({
    connection: { id: "local", baseUrl: "http://localhost:8080/v1", allowRemoteHosts: false, timeoutMs: 1000 },
    modelId: "model", message: { ...m, interaction: null }, history, participants, userName: "Jeff", pack: frPrompts,
  });

  it("validates identifiers, preserves explicit targeting, and rejects fabricated evidence", async () => {
    const m = { ...response("2", "user", "agree"), addressee: "anna" };
    const p = proposal();
    p.interaction!.proposal!.participantIds.push("user");
    vi.spyOn(llm, "chatCompletion").mockResolvedValue(JSON.stringify(interaction({
      intent: "agreement", addresseeId: "outsider", replyToMessageId: "missing",
      responses: [
        { proposalId: "p1", stance: "agree", condition: null, evidence: "D'accord." },
        { proposalId: "missing", stance: "agree", condition: null, evidence: "D'accord." },
        { proposalId: "p1", stance: "agree", condition: null, evidence: "Je suis ravi." },
      ],
    })));
    const result = await analyzeInteraction(input(m, [p]));
    expect(result).toMatchObject({ addresseeId: "anna", replyToMessageId: null });
    expect(result!.responses).toHaveLength(1);
  });

  it("takes the decision group from the cast, not invented or omitted model participants", async () => {
    const m = proposal();
    m.interaction!.proposal!.participantIds = ["invented"];
    vi.spyOn(llm, "chatCompletion").mockResolvedValue(`\`\`\`json\n${JSON.stringify(m.interaction)}\n\`\`\``);
    const result = await analyzeInteraction(input(m));
    expect(result!.proposal!.participantIds).toEqual(["anna", "marc"]);
    const human = { ...m, role: "user" as const, personaId: null };
    expect((await analyzeInteraction(input(human)))!.proposal!.participantIds).toEqual(["anna", "marc", "user"]);
  });

  it("does not treat a quote from earlier messages as new consent", async () => {
    const m = response("2", "marc", "agree");
    m.interaction!.responses[0].evidence = "Allons dîner à vingt heures.";
    vi.spyOn(llm, "chatCompletion").mockResolvedValue(JSON.stringify(m.interaction));
    expect((await analyzeInteraction(input(m, [proposal()])))!.responses).toEqual([]);
  });

  it.each(["nonsense", "{}", '{"intent":"invented"}', "```json\n{unfinished"])("ignores malformed output: %s", async (raw) => {
    vi.spyOn(llm, "chatCompletion").mockResolvedValue(raw);
    expect(await analyzeInteraction(input(proposal()))).toBeNull();
  });

  it("falls back without blocking speech if the model fails", async () => {
    vi.spyOn(llm, "chatCompletion").mockRejectedValue(new Error("offline"));
    expect(await analyzeInteraction(input(proposal()))).toBeNull();
  });

  it("rejects corrupt stored metadata and incomplete conditional positions", () => {
    expect(decodeInteraction("not json")).toBeNull();
    expect(decodeInteraction({ intent: "statement", responses: [{ proposalId: "p1", stance: "conditional", evidence: "Oui" }] })?.responses).toEqual([]);
    expect(decodeInteraction({ intent: "agreement", responses: [{ proposalId: "p1", stance: "agree", condition: "Moins de vingt euros", evidence: "Oui, si c'est moins de vingt euros." }] })?.responses[0].stance).toBe("conditional");
  });

  it("does not truncate a source utterance to fit a small model", async () => {
    const chat = vi.spyOn(llm, "chatCompletion");
    const m = message("long", "anna", "Oui, ".repeat(3000) + "mais uniquement demain.");
    expect(await analyzeInteraction({ ...input(m), contextTokens: 2048 })).toBeNull();
    expect(chat).not.toHaveBeenCalled();
  });

  it("bounds shared context without cutting structured data", () => {
    const history = Array.from({ length: 20 }, (_, i) => proposal(`p${i}`));
    const context = coordinationContext(history, participants, frPrompts, 1600);
    const raw = context.slice(context.indexOf("{"), context.lastIndexOf("}") + 1);
    const data = JSON.parse(raw);
    expect(raw.length).toBeLessThanOrEqual(1600);
    expect(data.omittedProposals).toBeGreaterThan(0);
    expect(data.proposals.at(-1).id).toBe("p19");
  });
});
