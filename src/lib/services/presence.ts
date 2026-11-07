import type { Message } from "../types";

/**
 * Une période pendant laquelle un personnage était dans la scène.
 * `enteredAt` null : présent depuis le début. `leftAt` null : toujours là.
 */
export type PresenceSpan = {
  personaId: string;
  enteredAt: string | null;
  leftAt: string | null;
};

/** Ce qu'un personnage a vu et entendu de la conversation. */
export type Witnessed = {
  /** Les messages échangés en sa présence, dans l'ordre. */
  messages: Message[];
  /** Une partie de la conversation s'est déroulée sans lui. */
  missedSome: boolean;
};

function within(span: PresenceSpan, at: string): boolean {
  return (
    (span.enteredAt === null || at >= span.enteredAt) &&
    (span.leftAt === null || at <= span.leftAt)
  );
}

/**
 * Un personnage qui entre en cours de scène ne sait pas ce qui s'est dit
 * avant lui, ni pendant une absence. Sans période connue, il est réputé
 * présent depuis le début : c'est le cas des conversations antérieures au
 * suivi des présences.
 */
export function witnessedBy(
  messages: Message[],
  spans: PresenceSpan[],
  personaId: string,
): Witnessed {
  const own = spans.filter((s) => s.personaId === personaId);
  if (own.length === 0) return { messages, missedSome: false };
  const seen = messages.filter(
    (m) => m.personaId === personaId || own.some((s) => within(s, m.createdAt)),
  );
  return { messages: seen, missedSome: seen.length < messages.length };
}

/** Ce qu'un personnage sait de la scène, découpé pour le prompt. */
export type SpeakerKnowledge = {
  /** Tout ce que le personnage a vu, versé en mémoire ou non. */
  seen: Message[];
  /** Identifiants de `seen` : décident quels faits du registre il connaît. */
  seenIds: Set<string>;
  /** Messages en clair, pas encore versés en mémoire, du plus ancien au plus récent. */
  recent: Message[];
  /** Messages vus déjà versés en mémoire : on y cherche les souvenirs à rappeler. */
  archive: Message[];
  /**
   * L'état de la scène est commun à tous : seul un personnage qui a assisté à
   * tout ce que couvre la mémoire le reçoit.
   */
  stateKnown: boolean;
  missedSome: boolean;
};

/**
 * Chaque personnage garde ce qu'il a vu : les faits établis devant lui (via
 * `seenIds`), et les messages anciens auxquels il a assisté (via `archive`).
 * Auparavant, un personnage arrivé en cours de scène perdait tout le résumé,
 * y compris ce qui s'était dit en sa présence.
 */
export function knowledgeFor(
  messages: Message[],
  spans: PresenceSpan[],
  personaId: string,
  memoryThroughMessageId: string | null,
): SpeakerKnowledge {
  const { messages: seen, missedSome } = witnessedBy(messages, spans, personaId);
  const seenIds = new Set(seen.map((m) => m.id));
  const through = memoryThroughMessageId
    ? messages.findIndex((m) => m.id === memoryThroughMessageId)
    : -1;
  if (through === -1) {
    return { seen, seenIds, recent: seen, archive: [], stateKnown: true, missedSome };
  }
  const covered = new Set(messages.slice(0, through + 1).map((m) => m.id));
  return {
    seen,
    seenIds,
    recent: seen.filter((m) => !covered.has(m.id)),
    archive: seen.filter((m) => covered.has(m.id)),
    stateKnown: !missedSome || [...covered].every((id) => seenIds.has(id)),
    missedSome,
  };
}
