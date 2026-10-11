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

/** L'historique à transmettre à un personnage, et s'il peut recevoir le résumé. */
export type SpeakerKnowledge = {
  /** Tout ce que le personnage a vu, résumé ou non. */
  seen: Message[];
  /** Messages en clair, du plus ancien au plus récent. */
  recent: Message[];
  /** Le résumé ne couvre que des messages vus par ce personnage. */
  summaryKnown: boolean;
  missedSome: boolean;
};

/**
 * Le résumé est commun à toute la scène. Un personnage qui n'a pas assisté à
 * tout ce qu'il couvre ne le reçoit pas : il retrouve à la place, en clair,
 * tout ce qu'il a vu — le budget de contexte garde les plus récents.
 */
export function knowledgeFor(
  messages: Message[],
  spans: PresenceSpan[],
  personaId: string,
  summaryThroughMessageId: string | null,
): SpeakerKnowledge {
  const { messages: seen, missedSome } = witnessedBy(messages, spans, personaId);
  const through = summaryThroughMessageId
    ? messages.findIndex((m) => m.id === summaryThroughMessageId)
    : -1;
  const uncovered = (list: Message[]) => {
    const idx = list.findIndex((m) => m.id === summaryThroughMessageId);
    return idx === -1 ? list : list.slice(idx + 1);
  };

  if (!missedSome) {
    return { seen, recent: uncovered(messages), summaryKnown: true, missedSome };
  }
  if (!summaryThroughMessageId) {
    return { seen, recent: seen, summaryKnown: true, missedSome };
  }
  const seenIds = new Set(seen.map((m) => m.id));
  const summaryKnown =
    through !== -1 && messages.slice(0, through + 1).every((m) => seenIds.has(m.id));
  return {
    seen,
    recent: summaryKnown ? uncovered(seen) : seen,
    summaryKnown,
    missedSome,
  };
}
