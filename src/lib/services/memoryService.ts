import type { ConnectionTarget, Conversation, Message, SceneMemory } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import { publicText } from "./messageFormat";
import { estimateTokens } from "./promptAssembler";
import { conversationRepo } from "./repositories";
import type { MessageLabeller } from "./scene";
import {
  applyMemoryUpdate,
  emptyMemory,
  isProtected,
  parseMemoryUpdate,
  type AppliedMemoryUpdate,
} from "./memory";
import { rankByRelevance } from "./recall";

/**
 * Repli quand aucun nom de locuteur n'est fourni. L'application passe son
 * propre libellé, qui tient compte du nom d'utilisateur configuré.
 */
export function roleLabellerFor(
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): MessageLabeller {
  return (m) =>
    m.role === "user"
      ? pack.scene.userLabel
      : (m.personaName ?? pack.scene.unknownSpeakerLabel);
}

export const roleLabeller: MessageLabeller = roleLabellerFor();

/** Fenêtre récente toujours transmise mot pour mot, jamais encore versée en mémoire. */
export const KEEP_RECENT_MESSAGES = 14;

/** Une mise à jour absorbe un vrai bloc : extraire réplique par réplique coûte cher pour rien. */
export const MIN_MEMORY_BATCH = 8;

/**
 * Au-delà, les petits modèles survolent le lot et oublient des faits : un lot
 * plus court est lu plus attentivement.
 */
export const MAX_MEMORY_BATCH = 20;

/** Part du contexte que peuvent occuper les messages d'un lot. */
const BATCH_CONTEXT_RATIO = 0.3;

export const MEMORY_MAX_OUTPUT_TOKENS = 1500;

/**
 * Registre montré au modèle pendant l'extraction. Au-delà, on lui montre les
 * faits en rapport avec le lot et les plus récents : il lui faut les voir pour
 * les corriger ou éviter les doublons, mais pas tous à chaque fois.
 */
export const MAX_LEDGER_FACTS_SHOWN = 60;
const RECENT_LEDGER_FACTS = 15;

/** On met la mémoire à jour avant que le préremplissage ne devienne coûteux. */
export const MEMORY_CONTEXT_RATIO = 0.55;

/**
 * Deux déclencheurs, et le premier atteint gagne : environ 55 % de la fenêtre
 * de contexte, ou un nombre de messages pas encore versés en mémoire.
 */
export function needsMemoryUpdate(
  uncovered: Message[],
  contextTokens: number,
  maxMessages = Number.POSITIVE_INFINITY,
): boolean {
  if (uncovered.length < KEEP_RECENT_MESSAGES + MIN_MEMORY_BATCH) return false;
  if (uncovered.length > maxMessages) return true;
  const total = uncovered.reduce((acc, m) => acc + estimateTokens(m.content) + 8, 0);
  return total > contextTokens * MEMORY_CONTEXT_RATIO;
}

/** Messages pas encore versés en mémoire. */
export function uncoveredMessages(
  messages: Message[],
  throughMessageId: string | null,
): Message[] {
  if (!throughMessageId) return messages;
  const idx = messages.findIndex((m) => m.id === throughMessageId);
  return idx === -1 ? messages : messages.slice(idx + 1);
}

/**
 * Conversation antérieure au registre : l'ancien résumé n'est plus fiable et
 * ne contient pas les sources des faits. La mémoire est refaite depuis les
 * messages d'origine.
 */
export function memoryNeedsMigration(conversation: Conversation): boolean {
  return (
    conversation.memory === null &&
    Boolean(conversation.summary?.trim() || conversation.summaryThroughMessageId)
  );
}

export type MemoryOutcome =
  | { ok: true; conversation: Conversation; applied: AppliedMemoryUpdate }
  /** `reason: null` = il n'y avait rien à verser en mémoire, ce n'est pas un échec. */
  | { ok: false; reason: string | null };

export type MemoryUpdateOptions = {
  /** Faux pendant une reconstruction : l'ancienne mémoire reste intacte jusqu'au succès. */
  persist?: boolean;
  /** Capacité du modèle : borne la taille d'un lot. */
  contextTokens?: number;
};

export type MemoryRebuildProgress = {
  processedMessages: number;
  remainingMessages: number;
  totalMessages: number;
};

/** Le lot à verser : les plus anciens messages hors de la fenêtre récente. */
export function nextBatch(
  uncovered: Message[],
  contextTokens = Number.POSITIVE_INFINITY,
): Message[] {
  const available = Math.max(0, uncovered.length - KEEP_RECENT_MESSAGES);
  const candidates = uncovered.slice(0, Math.min(available, MAX_MEMORY_BATCH));
  const cap = contextTokens * BATCH_CONTEXT_RATIO;
  const batch: Message[] = [];
  let used = 0;
  for (const m of candidates) {
    const cost = estimateTokens(m.content) + 8;
    if (batch.length > 0 && used + cost > cap) break;
    batch.push(m);
    used += cost;
  }
  return batch;
}

function ledgerLines(memory: SceneMemory, batchText: string): { lines: string[]; omitted: number } {
  const facts = memory.facts;
  let shown = facts;
  if (facts.length > MAX_LEDGER_FACTS_SHOWN) {
    const scores = rankByRelevance(
      facts.map((f) => f.text),
      [{ text: batchText, weight: 1 }],
    );
    const keep = new Set<number>();
    // Les plus récents, puis les protégés, puis les plus pertinents.
    for (let i = Math.max(0, facts.length - RECENT_LEDGER_FACTS); i < facts.length; i++) keep.add(i);
    facts.forEach((f, i) => {
      if (isProtected(f) && keep.size < MAX_LEDGER_FACTS_SHOWN) keep.add(i);
    });
    const byScore = facts
      .map((_, i) => i)
      .filter((i) => !keep.has(i))
      .sort((a, b) => scores[b] - scores[a]);
    for (const i of byScore) {
      if (keep.size >= MAX_LEDGER_FACTS_SHOWN) break;
      keep.add(i);
    }
    shown = facts.filter((_, i) => keep.has(i));
  }
  return {
    lines: shown.map((f) => `${f.id} [${f.category}] ${f.text}`),
    omitted: facts.length - shown.length,
  };
}

/**
 * Verse un lot de messages dans la mémoire. Aucun message n'est supprimé de
 * la base : seule la frontière `summaryThroughMessageId` avance.
 */
export async function updateMemory(
  connection: ConnectionTarget,
  modelId: string,
  conversation: Conversation,
  messages: Message[],
  label: MessageLabeller = roleLabeller,
  /** Paramètres du profil de modèle (désactivation du raisonnement, etc.). */
  extraParameters: Record<string, unknown> = {},
  pack: PromptPack = DEFAULT_PROMPT_PACK,
  options: MemoryUpdateOptions = {},
): Promise<MemoryOutcome> {
  const uncovered = uncoveredMessages(messages, conversation.summaryThroughMessageId);
  const batch = nextBatch(uncovered, options.contextTokens);
  if (batch.length === 0) return { ok: false, reason: null };

  // La mémoire est commune à toute la scène : les apartés n'y entrent pas.
  const numbered = batch.filter((m) => m.status !== "error" && publicText(m.content).trim());
  const memory = conversation.memory ?? emptyMemory();
  const boundary = batch[batch.length - 1].id;

  if (numbered.length === 0) {
    const updated = { ...conversation, memory, summaryThroughMessageId: boundary };
    if (options.persist !== false) await conversationRepo.update(updated);
    return { ok: true, conversation: updated, applied: { memory, added: 0, updated: 0, retired: 0 } };
  }

  const block = numbered
    .map((m, i) => `[${i + 1}] ${pack.memory.messageLine(label(m), publicText(m.content))}`)
    .join("\n\n");
  const ledger = ledgerLines(memory, block);

  let reason = pack.memory.invalidUpdateError;
  // Une sortie illisible tient souvent à un accident de génération : une
  // seconde tentative suffit généralement.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await chatCompletion(connection, {
        ...noThinkingRequestParameters(connection, extraParameters),
        model: modelId,
        temperature: 0.2,
        max_tokens: MEMORY_MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: pack.memory.system },
          {
            role: "user",
            content: pack.memory.user({
              facts: ledger.lines,
              omittedFacts: ledger.omitted,
              state: memory.state,
              threads: memory.threads,
              newMessages: block,
            }),
          },
        ],
      });
      const parsed = parseMemoryUpdate(text);
      if (!parsed) {
        reason = pack.memory.invalidUpdateError;
        continue;
      }
      const applied = applyMemoryUpdate(memory, parsed, numbered, new Date().toISOString());
      const updated: Conversation = {
        ...conversation,
        memory: applied.memory,
        summaryThroughMessageId: boundary,
      };
      if (options.persist !== false) await conversationRepo.update(updated);
      return { ok: true, conversation: updated, applied };
    } catch (e) {
      // Jamais bloquant pour le chat : on remonte la cause, on ne la masque pas.
      reason = String(e).replace(/^Error:\s*/, "");
    }
  }
  return { ok: false, reason };
}

/**
 * Refait toute la mémoire depuis les messages d'origine, par lots
 * chronologiques. Les faits saisis, corrigés ou épinglés par l'utilisateur
 * sont conservés. Rien n'est persisté avant la fin : un échec laisse
 * l'ancienne mémoire intacte.
 */
export async function rebuildMemory(
  connection: ConnectionTarget,
  modelId: string,
  conversation: Conversation,
  messages: Message[],
  label: MessageLabeller = roleLabeller,
  extraParameters: Record<string, unknown> = {},
  pack: PromptPack = DEFAULT_PROMPT_PACK,
  onProgress?: (progress: MemoryRebuildProgress) => void,
  options: { contextTokens?: number; fromScratch?: boolean } = {},
): Promise<MemoryOutcome> {
  const fromScratch = options.fromScratch ?? true;
  const kept = conversation.memory?.facts.filter(isProtected) ?? [];
  let working: Conversation = fromScratch
    ? {
        ...conversation,
        summary: null,
        summaryThroughMessageId: null,
        memory: {
          ...emptyMemory(),
          facts: kept,
          nextFactNumber: conversation.memory?.nextFactNumber ?? 1,
        },
      }
    : conversation;

  const remainingOf = (c: Conversation) =>
    Math.max(0, uncoveredMessages(messages, c.summaryThroughMessageId).length - KEEP_RECENT_MESSAGES);
  const totalMessages = remainingOf(working);
  if (totalMessages === 0) return { ok: false, reason: null };

  let remainingMessages = totalMessages;
  let last: AppliedMemoryUpdate | null = null;
  onProgress?.({ processedMessages: 0, remainingMessages, totalMessages });

  while (remainingMessages > 0) {
    const previousBoundary = working.summaryThroughMessageId;
    const outcome = await updateMemory(
      connection,
      modelId,
      working,
      messages,
      label,
      extraParameters,
      pack,
      { persist: false, contextTokens: options.contextTokens },
    );
    if (!outcome.ok) return outcome;
    working = outcome.conversation;
    last = outcome.applied;

    const nextRemaining = remainingOf(working);
    if (working.summaryThroughMessageId === previousBoundary || nextRemaining >= remainingMessages) {
      return { ok: false, reason: pack.memory.stalledError };
    }
    remainingMessages = nextRemaining;
    onProgress?.({
      processedMessages: totalMessages - remainingMessages,
      remainingMessages,
      totalMessages,
    });
  }

  try {
    working = { ...working, summary: null };
    await conversationRepo.update(working);
    return {
      ok: true,
      conversation: working,
      applied: last ?? { memory: working.memory ?? emptyMemory(), added: 0, updated: 0, retired: 0 },
    };
  } catch (e) {
    return { ok: false, reason: String(e).replace(/^Error:\s*/, "") };
  }
}
