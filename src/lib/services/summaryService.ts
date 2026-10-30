import type { ConnectionTarget, Conversation, Message } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import { publicText } from "./messageFormat";
import { estimateTokens, stripSummaryMarkers } from "./promptAssembler";
import { conversationRepo } from "./repositories";
import type { MessageLabeller } from "./scene";

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

/**
 * Fenêtre récente toujours conservée mot pour mot. Six répliques suffisaient
 * rarement à couvrir un échange de groupe et faisaient dépendre trop vite la
 * cohérence d'un résumé nécessairement plus approximatif.
 */
export const KEEP_RECENT_MESSAGES = 14;

/**
 * On évite de réécrire le résumé toutes les deux ou trois répliques : chaque
 * fusion successive érode les détails récents et conserve trop facilement des
 * états devenus faux. Une mise à jour absorbe donc un vrai bloc de messages.
 */
export const MIN_SUMMARY_BATCH = 8;

/** Taille maximale d'un lot envoyé au modèle pour éviter un prompt de résumé géant. */
export const MAX_SUMMARY_BATCH = 24;

/**
 * Ce qui sort de la fenêtre récente n'existe plus que dans le résumé. Les faits
 * y sont donc cumulatifs : un plafond trop bas, comme les douze puces de la v4,
 * oblige le modèle à sacrifier un fait acquis à chaque lot, et la scène se
 * contredit quelques répliques plus loin. La limite ne sert qu'à contenir une
 * très longue partie.
 */
export const SUMMARY_MAX_BULLETS = 22;
export const SUMMARY_MAX_OUTPUT_TOKENS = 1800;

/**
 * Les modèles dépassent volontiers de deux ou trois puces. Couper dès la limite
 * demandée sacrifierait les rubriques de fin : le filet ne sert qu'à l'emballement.
 */
const SUMMARY_BULLET_TOLERANCE = 6;

/** Au-delà, le résumé pèse plus lourd que les répliques qu'il remplace. */
const SUMMARY_FULL_CHARS = 4_000;

const SUMMARY_BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * Filet de sécurité pour les serveurs qui ignorent la limite demandée. Les
 * faits établis ferment le résumé : ils sont les seuls à pouvoir s'emballer, et
 * couper la fin préserve ainsi l'état courant et les questions ouvertes. En
 * temps normal, `summaryIsFull` déclenche une condensation bien avant.
 */
export function limitSummaryBullets(
  summary: string,
  maxBullets = SUMMARY_MAX_BULLETS,
): string {
  if (maxBullets < 1) return "";
  const lines = summary.split("\n");
  let count = 0;
  let cutoff = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (!SUMMARY_BULLET.test(lines[i])) continue;
    count += 1;
    if (count > maxBullets) {
      cutoff = i;
      break;
    }
  }
  if (cutoff === lines.length) return summary;

  const kept = lines.slice(0, cutoff);
  const lastBullet = kept.findLastIndex((line) => SUMMARY_BULLET.test(line));
  return kept.slice(0, lastBullet + 1).join("\n").trimEnd();
}

/**
 * Mémoire à condenser. Sans cet ordre explicite, un modèle reporte tous les
 * faits et en ajoute : autour de 120 répliques, le résumé butait sur le plafond
 * de puces puis sur celui des tokens, et plus aucune mise à jour n'aboutissait.
 * La taille compte autant que les puces : un modèle en oublie parfois le format.
 */
export function summaryIsFull(summary: string | null): boolean {
  if (!summary) return false;
  const bullets = summary.split("\n").filter((line) => SUMMARY_BULLET.test(line));
  return bullets.length >= SUMMARY_MAX_BULLETS || summary.length >= SUMMARY_FULL_CHARS;
}

/**
 * Marqueur applicatif : permet de reconstruire une fois les anciens résumés.
 *
 * Volontairement hors des packs de langue. Un marqueur traduit changerait à
 * chaque bascule de langue et ferait passer pour périmé un résumé qui ne l'est
 * pas. La v3 succède au marqueur français `[MÉMOIRE ACTIVE v2]` : les résumés
 * antérieurs sont réécrits une fois, ce qui est de toute façon nécessaire
 * puisque leurs rubriques étaient en français. La v4 introduisait une politique
 * d'expiration : tout ce qu'un lot ne reconfirmait pas était effacé, y compris
 * les faits acquis. La v5 rend les faits cumulatifs et force la reconstruction
 * des v4 depuis les messages d'origine, seuls à contenir ce qui a été perdu.
 */
export const SUMMARY_FORMAT_MARKER = "[ACTIVE MEMORY v5]";

/** Détecte notamment une dernière puce coupée en plein milieu. */
export function summaryLooksTruncated(summary: string): boolean {
  const body = stripSummaryMarkers(summary);
  if (!body) return true;
  const lastLine =
    body
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? "";
  const isBullet = /^(?:[-*•]|\d+[.)])\s+/.test(lastLine);
  return isBullet && !/[.!?…:;](?:\*{0,2})$/.test(lastLine);
}

export function summaryNeedsRefresh(summary: string | null): boolean {
  return (
    Boolean(summary?.trim()) &&
    (!summary!.startsWith(SUMMARY_FORMAT_MARKER) || summaryLooksTruncated(summary!))
  );
}

/** On compresse avant que le préremplissage ne devienne franchement coûteux. */
export const SUMMARY_CONTEXT_RATIO = 0.55;

/**
 * Deux déclencheurs, et le premier atteint gagne : environ 55 % de la fenêtre
 * de contexte, ou un nombre de messages non résumés.
 *
 * Le seuil en tokens seul laissait l'historique grimper à une centaine de
 * répliques courtes avant le premier résumé — et chacune de ces répliques est
 * retraitée à chaque tour, pour chaque personnage. Le plafond en nombre de
 * messages borne le coût de façon prévisible, indépendamment de leur longueur.
 */
export function needsSummary(
  messages: Message[],
  summary: string | null,
  contextTokens: number,
  maxMessages = Number.POSITIVE_INFINITY,
): boolean {
  if (messages.length < KEEP_RECENT_MESSAGES + MIN_SUMMARY_BATCH) return false;
  if (messages.length > maxMessages) return true;
  const total =
    messages.reduce((acc, m) => acc + estimateTokens(m.content) + 8, 0) +
    (summary ? estimateTokens(summary) : 0);
  return total > contextTokens * SUMMARY_CONTEXT_RATIO;
}

/** Messages non couverts par le résumé courant. */
export function uncoveredMessages(
  messages: Message[],
  summaryThroughMessageId: string | null,
): Message[] {
  if (!summaryThroughMessageId) return messages;
  const idx = messages.findIndex((m) => m.id === summaryThroughMessageId);
  return idx === -1 ? messages : messages.slice(idx + 1);
}

/**
 * Résultat d'une tentative de résumé. La raison de l'échec est remontée
 * telle quelle : un « le résumé a échoué » sans cause est indiagnosticable,
 * et c'est presque toujours le serveur local qui a quelque chose à dire.
 */
export type SummaryOutcome =
  | { ok: true; conversation: Conversation }
  /** `reason: null` = il n'y avait rien à résumer, ce n'est pas un échec. */
  | { ok: false; reason: string | null };

export type SummaryUpdateOptions = {
  /** Faux pendant une reconstruction : l'ancien résumé reste intact jusqu'au succès total. */
  persist?: boolean;
};

export type SummaryRebuildProgress = {
  processedMessages: number;
  remainingMessages: number;
  totalMessages: number;
};

/**
 * Les tâches internes n'ont pas besoin d'un raisonnement caché. OpenRouter
 * reçoit le même ordre `none` que les réponses principales.
 */
export function summaryRequestParameters(
  connection: ConnectionTarget,
  extraParameters: Record<string, unknown>,
): Record<string, unknown> {
  return noThinkingRequestParameters(connection, extraParameters);
}

/**
 * Génère ou met à jour le résumé d'une conversation. Aucun message n'est
 * supprimé de la base : seule la frontière `summaryThroughMessageId` avance.
 */
export async function updateSummary(
  connection: ConnectionTarget,
  modelId: string,
  conversation: Conversation,
  messages: Message[],
  label: MessageLabeller = roleLabeller,
  /** Paramètres du profil de modèle (désactivation du raisonnement, etc.). */
  extraParameters: Record<string, unknown> = {},
  pack: PromptPack = DEFAULT_PROMPT_PACK,
  options: SummaryUpdateOptions = {},
): Promise<SummaryOutcome> {
  const rebuilding = summaryNeedsRefresh(conversation.summary);
  const uncovered = rebuilding
    ? messages
    : uncoveredMessages(messages, conversation.summaryThroughMessageId);
  const summarizableCount = Math.max(0, uncovered.length - KEEP_RECENT_MESSAGES);
  const toSummarize = uncovered.slice(
    0,
    Math.min(summarizableCount, MAX_SUMMARY_BATCH),
  );
  if (toSummarize.length === 0) return { ok: false, reason: null };

  // Les répliques sont nommées : sans cela, les propos de plusieurs
  // personnages se mélangeraient dans le résumé.
  const block = toSummarize
    // Le résumé est partagé par tous les personnages : les apartés n'y entrent pas.
    .filter((m) => publicText(m.content).trim())
    .map((m) => pack.summary.messageLine(label(m), publicText(m.content)))
    .join("\n\n");

  const previousSummary =
    !rebuilding && conversation.summary ? stripSummaryMarkers(conversation.summary) : null;
  // Un résumé trop long pour tenir dans la réponse échoue à chaque tentative
  // identique : la seconde chance est donc une condensation.
  const attempts = summaryIsFull(previousSummary)
    ? [true]
    : previousSummary
      ? [false, true]
      : [false];

  let reason = pack.summary.emptySummaryError;
  for (const compact of attempts) {
    try {
      const requestParameters = summaryRequestParameters(connection, extraParameters);
      const text = await chatCompletion(connection, {
        ...requestParameters,
        model: modelId,
        temperature: 0.2,
        // Le plafond force une mémoire de travail compacte. Les paramètres
        // ci-dessus coupent déjà le raisonnement caché, qui ne doit pas le manger.
        max_tokens: SUMMARY_MAX_OUTPUT_TOKENS,
        messages: [
          {
            role: "system",
            content: pack.summary.system({ maxBullets: SUMMARY_MAX_BULLETS }),
          },
          {
            role: "user",
            content: pack.summary.user({ previousSummary, newMessages: block, compact }),
          },
        ],
      });
      const body = limitSummaryBullets(
        stripSummaryMarkers(text),
        SUMMARY_MAX_BULLETS + SUMMARY_BULLET_TOLERANCE,
      );
      if (!body) {
        reason = pack.summary.emptySummaryError;
        continue;
      }
      if (summaryLooksTruncated(body)) {
        reason = pack.summary.truncatedSummaryError;
        continue;
      }
      const updated: Conversation = {
        ...conversation,
        summary: `${SUMMARY_FORMAT_MARKER}\n${body}`,
        summaryThroughMessageId: toSummarize[toSummarize.length - 1].id,
      };
      if (options.persist !== false) await conversationRepo.update(updated);
      return { ok: true, conversation: updated };
    } catch (e) {
      // Jamais bloquant pour le chat : on remonte la cause, on ne la masque pas.
      reason = String(e).replace(/^Error:\s*/, "");
    }
  }
  return { ok: false, reason };
}

/**
 * Reconstruit toute la mémoire condensable, par lots chronologiques.
 *
 * `updateSummary` ne traite volontairement qu'un lot par tour automatique. Une
 * reconstruction manuelle doit au contraire aller jusqu'au bout : auparavant,
 * elle s'arrêtait après les 24 messages les plus anciens puis annonçait un
 * succès. Les résultats intermédiaires restent en mémoire et ne sont persistés
 * qu'une fois la reconstruction complète, afin qu'un échec conserve l'ancien
 * résumé intact.
 */
export async function rebuildSummary(
  connection: ConnectionTarget,
  modelId: string,
  conversation: Conversation,
  messages: Message[],
  label: MessageLabeller = roleLabeller,
  extraParameters: Record<string, unknown> = {},
  pack: PromptPack = DEFAULT_PROMPT_PACK,
  onProgress?: (progress: SummaryRebuildProgress) => void,
): Promise<SummaryOutcome> {
  const totalMessages = Math.max(0, messages.length - KEEP_RECENT_MESSAGES);
  if (totalMessages === 0) return { ok: false, reason: null };

  let working: Conversation = {
    ...conversation,
    summary: null,
    summaryThroughMessageId: null,
  };
  let remainingMessages = totalMessages;
  onProgress?.({
    processedMessages: 0,
    remainingMessages,
    totalMessages,
  });

  while (remainingMessages > 0) {
    const previousBoundary = working.summaryThroughMessageId;
    const outcome = await updateSummary(
      connection,
      modelId,
      working,
      messages,
      label,
      extraParameters,
      pack,
      { persist: false },
    );
    if (!outcome.ok) return outcome;
    working = outcome.conversation;

    const uncovered = uncoveredMessages(messages, working.summaryThroughMessageId);
    const nextRemaining = Math.max(0, uncovered.length - KEEP_RECENT_MESSAGES);
    if (
      working.summaryThroughMessageId === previousBoundary ||
      nextRemaining >= remainingMessages
    ) {
      return { ok: false, reason: pack.summary.stalledSummaryError };
    }
    remainingMessages = nextRemaining;
    onProgress?.({
      processedMessages: totalMessages - remainingMessages,
      remainingMessages,
      totalMessages,
    });
  }

  try {
    await conversationRepo.update(working);
    return { ok: true, conversation: working };
  } catch (e) {
    return { ok: false, reason: String(e).replace(/^Error:\s*/, "") };
  }
}
