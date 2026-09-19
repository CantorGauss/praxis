import type {
  ConnectionTarget, DialogueIntent, Message, MessageInteraction, SceneProposal,
} from "../types";
import { USER_ADDRESSEE } from "../types";
import type { PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import type { Participant } from "./scene";

const INTENTS: DialogueIntent[] = [
  "statement", "question", "answer", "clarification", "proposal",
  "agreement", "objection", "conditional", "withdrawal",
];
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const shortText = (value: unknown, limit = 400): string | null =>
  typeof value === "string" && value.trim() && value.length <= limit ? value.trim() : null;
const normal = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase();

/** Defensive decoding for SQLite/import data as well as model output. */
export function decodeInteraction(raw: unknown): MessageInteraction | null {
  try {
    const value = record(typeof raw === "string" ? JSON.parse(raw) : raw);
    if (!value || !INTENTS.includes(value.intent as DialogueIntent)) return null;
    const p = record(value.proposal);
    const w = record(value.withdrawal);
    const proposal = p && shortText(p.text) && shortText(p.evidence, 800) && Array.isArray(p.participantIds)
      ? {
          text: shortText(p.text)!, evidence: shortText(p.evidence, 800)!,
          participantIds: [...new Set(p.participantIds.filter((id): id is string => typeof id === "string"))].slice(0, 32),
          replacesId: shortText(p.replacesId, 100),
        } : null;
    const responses: MessageInteraction["responses"] = [];
    for (const item of Array.isArray(value.responses) ? value.responses.slice(0, 8) : []) {
      const r = record(item);
      if (!r || !shortText(r.proposalId, 100) || !shortText(r.evidence, 800)) continue;
      if (r.stance !== "agree" && r.stance !== "disagree" && r.stance !== "conditional") continue;
      const condition = shortText(r.condition);
      if (r.stance === "conditional" && !condition) continue;
      const stance = r.stance === "agree" && condition ? "conditional" : r.stance;
      responses.push({ proposalId: r.proposalId as string, stance, condition: stance === "conditional" ? condition : null, evidence: shortText(r.evidence, 800)! });
    }
    return {
      ...(shortText(value.actorId, 100) ? { actorId: shortText(value.actorId, 100)! } : {}),
      intent: value.intent as DialogueIntent,
      addresseeId: shortText(value.addresseeId, 100),
      replyToMessageId: shortText(value.replyToMessageId, 100),
      proposal,
      responses,
      withdrawal: w && shortText(w.proposalId, 100) && shortText(w.evidence, 800)
        ? { proposalId: w.proposalId as string, evidence: shortText(w.evidence, 800)! } : null,
    };
  } catch {
    return null;
  }
}

export function messageActor(message: Message): string | null {
  return message.role === "user" ? USER_ADDRESSEE : message.personaId ?? message.interaction?.actorId ?? null;
}

const quotedIn = (evidence: string, message: Message) =>
  Boolean(normal(evidence)) && normal(message.content).includes(normal(evidence));

/** Replay only surviving, completed messages. Edits/deletions undo their effects. */
export function collectProposals(messages: Message[]): SceneProposal[] {
  const proposals = new Map<string, SceneProposal>();
  for (const message of messages) {
    if (message.status !== "complete" || message.kind !== "speech") continue;
    const interaction = decodeInteraction(message.interaction);
    const actor = messageActor(message);
    if (!interaction || !actor) continue;
    const draft = interaction.proposal;
    if (draft && draft.participantIds.includes(actor) && quotedIn(draft.evidence, message)) {
      // Only the author can replace their proposal; another character offers
      // an alternative, not a rewrite of someone else's agreement.
      const previous = draft.replacesId ? proposals.get(draft.replacesId) : null;
      if (previous?.authorId === actor && previous.status !== "withdrawn") previous.status = "superseded";
      const id = message.id;
      const participantIds = [...new Set(draft.participantIds)];
      proposals.set(id, {
        id, authorId: actor, text: draft.text, sourceMessageId: message.id,
        participantIds,
        positions: { [actor]: { stance: "agree", condition: null, evidence: draft.evidence, messageId: message.id } },
        status: participantIds.length > 1 ? "open" : "agreed",
      });
    }
    for (const response of interaction.responses) {
      const proposal = proposals.get(response.proposalId);
      if (!proposal || !proposal.participantIds.includes(actor) || !quotedIn(response.evidence, message)) continue;
      if (proposal.status === "withdrawn" || proposal.status === "superseded") continue;
      // The speaker can only express their own position. Silence never adds one.
      proposal.positions[actor] = {
        stance: response.stance, condition: response.condition,
        evidence: response.evidence, messageId: message.id,
      };
      proposal.status = proposal.participantIds.every((id) => proposal.positions[id]?.stance === "agree")
        ? "agreed" : "open";
    }
    const withdrawal = interaction.withdrawal;
    const proposal = withdrawal ? proposals.get(withdrawal.proposalId) : null;
    if (withdrawal && proposal?.authorId === actor && quotedIn(withdrawal.evidence, message) && proposal.status !== "superseded") {
      proposal.status = "withdrawn";
    }
  }
  return [...proposals.values()];
}

/** Bounded working view; the complete ledger remains persisted in messages. */
export function coordinationContext(messages: Message[], participants: Participant[], pack: PromptPack, maxDataChars = 4800): string {
  const proposals = collectProposals(messages);
  const active = proposals.filter((p) => p.status === "open").slice(-6);
  const settled = proposals.filter((p) => p.status !== "open").slice(-4);
  const recent = messages.filter((m) => m.status === "complete" && m.kind === "speech" && m.interaction).slice(-4);
  if (!active.length && !settled.length && !recent.length) return "";
  const compact = (p: SceneProposal) => ({
    id: p.id, authorId: p.authorId, text: p.text, status: p.status,
    participantIds: p.participantIds,
    positions: Object.fromEntries(Object.entries(p.positions).map(([id, position]) =>
      [id, { stance: position.stance, condition: position.condition }])),
  });
  const data = {
    participants: participants.map((p) => ({ id: p.id, name: p.name.slice(0, 80) })),
    proposals: [...settled, ...active].map(compact),
    omittedProposals: proposals.length - settled.length - active.length,
    recentIntentions: recent.map((m) => ({ messageId: m.id, speakerId: messageActor(m), intent: m.interaction!.intent, addresseeId: m.interaction!.addresseeId, replyToMessageId: m.interaction!.replyToMessageId })),
  };
  // Quotes stay available in the UI, but don't consume every speaker's context.
  while (JSON.stringify(data).length > maxDataChars && data.proposals.length > 0) {
    data.proposals.shift();
    data.omittedProposals++;
  }
  while (JSON.stringify(data).length > maxDataChars && data.recentIntentions.length > 0) data.recentIntentions.shift();
  return pack.coordination.context(JSON.stringify(data));
}

export type InteractionInput = {
  connection: ConnectionTarget;
  modelId: string;
  message: Message;
  history: Message[];
  participants: Participant[];
  userName: string;
  pack: PromptPack;
  extraParameters?: Record<string, unknown>;
  contextTokens?: number;
};

/** Extract observable speech acts, never invented consensus or private thoughts. */
export async function analyzeInteraction(input: InteractionInput): Promise<MessageInteraction | null> {
  const { message, history, pack } = input;
  if (message.status !== "complete" || message.kind !== "speech") return null;
  const actor = messageActor(message);
  if (!actor) return null;
  const participants = [...input.participants, { id: USER_ADDRESSEE, name: input.userName }];
  try {
    const contextTokens = input.contextTokens ?? 8192;
    const data = {
      participants,
      context: coordinationContext(history, participants, pack, Math.min(4800, contextTokens)),
      recentMessages: history.filter((m) => m.status === "complete").slice(-8).map((m) => ({ id: m.id, speakerId: messageActor(m), addresseeId: m.addressee, content: m.content.slice(-2000) })),
      message: { id: message.id, speakerId: actor, addresseeId: message.addressee, content: message.content },
    };
    // Keep the complete source utterance: chopping its ending could remove a
    // condition or negation. Omit analysis when even that cannot fit safely.
    const fits = () => (JSON.stringify(data).length + pack.coordination.analysisSystem.length) / 3 + 720 <= contextTokens;
    while (!fits() && data.recentMessages.length) data.recentMessages.shift();
    if (!fits()) return null;
    const raw = await chatCompletion({ ...input.connection, timeoutMs: 15_000 }, {
      ...noThinkingRequestParameters(input.connection, input.extraParameters ?? {}),
      model: input.modelId, temperature: 0, max_tokens: 700,
      messages: [
        { role: "system", content: pack.coordination.analysisSystem },
        { role: "user", content: JSON.stringify(data) },
      ],
    });
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const result = decodeInteraction(raw.slice(start, end + 1));
    if (!result) return null;
    result.actorId = actor;
    const ids = new Set(participants.map((p) => p.id));
    if (result.addresseeId === actor || !ids.has(result.addresseeId ?? "")) result.addresseeId = null;
    // Explicit UI targeting wins over an inferred destination.
    if (message.role === "user" && message.addressee) result.addresseeId = message.addressee;
    if (!history.some((m) => m.id === result.replyToMessageId && m.status === "complete" && m.kind === "speech")) result.replyToMessageId = null;
    const known = collectProposals(history);
    if (result.proposal) {
      if (!quotedIn(result.proposal.evidence, message)) result.proposal = null;
      else {
        // The current cast is the default decision group; include the human
        // only when they propose it or are explicitly addressed.
        result.proposal.participantIds = [...new Set([
          ...input.participants.map((p) => p.id), actor,
          ...(result.addresseeId === USER_ADDRESSEE ? [USER_ADDRESSEE] : []),
        ])];
        if (!known.some((p) => p.id === result.proposal!.replacesId && p.authorId === actor)) result.proposal.replacesId = null;
      }
    }
    result.responses = result.responses.filter((r) =>
      quotedIn(r.evidence, message) && known.some((p) => p.id === r.proposalId && p.participantIds.includes(actor) && (p.status === "open" || p.status === "agreed")),
    );
    if (result.withdrawal && (!quotedIn(result.withdrawal.evidence, message) || !known.some((p) => p.id === result.withdrawal!.proposalId && p.authorId === actor))) result.withdrawal = null;
    return result;
  } catch {
    // Unsupported/malformed structured output never prevents ordinary dialogue.
    return null;
  }
}
