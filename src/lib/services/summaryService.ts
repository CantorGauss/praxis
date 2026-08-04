import type { ConnectionTarget, Conversation, Message } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import { estimateTokens } from "./promptAssembler";
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
 * Marqueur applicatif : permet de reconstruire une fois les anciens résumés.
 *
 * Volontairement hors des packs de langue. Un marqueur traduit changerait à
 * chaque bascule de langue et ferait passer pour périmé un résumé qui ne l'est
 * pas. La v3 succède au marqueur français `[MÉMOIRE ACTIVE v2]` : les résumés
 * antérieurs sont réécrits une fois, ce qui est de toute façon nécessaire
 * puisque leurs rubriques étaient en français.
 */
export const SUMMARY_FORMAT_MARKER = "[ACTIVE MEMORY v3]";

/** Détecte notamment une dernière puce coupée en plein milieu. */
export function summaryLooksTruncated(summary: string): boolean {
  const body = summary.replace(SUMMARY_FORMAT_MARKER, "").trim();
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
    .map((m) => pack.summary.messageLine(label(m), m.content))
    .join("\n\n");

  try {
    const requestParameters = summaryRequestParameters(connection, extraParameters);
    const text = await chatCompletion(connection, {
      ...requestParameters,
      model: modelId,
      temperature: 0.2,
      // Certains modèles dépensent une partie du budget en raisonnement. Une
      // marge confortable évite de couper la mémoire après deux lignes.
      max_tokens: 2000,
      messages: [
        { role: "system", content: pack.summary.system() },
        {
          role: "user",
          content: pack.summary.user({
            previousSummary:
              !rebuilding && conversation.summary ? conversation.summary : null,
            newMessages: block,
          }),
        },
      ],
    });
    const body = text.trim();
    if (!body) return { ok: false, reason: pack.summary.emptySummaryError };
    if (summaryLooksTruncated(body)) {
      return { ok: false, reason: pack.summary.truncatedSummaryError };
    }
    const summary = body.startsWith(SUMMARY_FORMAT_MARKER)
      ? body
      : `${SUMMARY_FORMAT_MARKER}\n${body}`;
    const updated: Conversation = {
      ...conversation,
      summary,
      summaryThroughMessageId: toSummarize[toSummarize.length - 1].id,
    };
    await conversationRepo.update(updated);
    return { ok: true, conversation: updated };
  } catch (e) {
    // Jamais bloquant pour le chat : on remonte la cause, on ne la masque pas.
    return { ok: false, reason: String(e).replace(/^Error:\s*/, "") };
  }
}
