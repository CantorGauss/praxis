import type { ConnectionTarget, Message } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import type { MessageLabeller, Participant } from "./scene";

/**
 * Mise en scène confiée au modèle.
 *
 * Choisit un seul locuteur à la fois. Le choix suivant voit la réplique
 * réellement produite et les intentions/accords qu'elle a exprimés.
 *
 * La réponse du modèle n'est jamais crue sur parole : seuls des noms de la
 * scène courante sont retenus, sans doublon, et tout échec retombe sur le
 * tour de table déterministe. Le pire cas reste donc l'ancien comportement.
 */

/** Nombre de répliques récentes soumises au directeur. Le contexte lointain
 *  n'aide pas à décider qui parle maintenant, et coûte des jetons. */
const DIRECTOR_CONTEXT_MESSAGES = 8;

/**
 * Extrait une liste de noms d'une réponse libre. On accepte un tableau JSON,
 * mais aussi une phrase : les petits modèles locaux commentent volontiers au
 * lieu de répondre en JSON strict.
 */
export function parseSpeakerChoice(
  raw: string,
  participants: Participant[],
): string[] {
  const ids: string[] = [];
  const push = (name: string) => {
    const found = participants.find(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (found && !ids.includes(found.id)) ids.push(found.id);
  };

  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === "string") push(entry);
        }
        // Un tableau explicitement vide est une décision : personne ne parle.
        return ids;
      }
    } catch {
      // Tableau mal formé : on retombe sur le balayage textuel ci-dessous.
    }
  }

  // Repli : les noms cités, dans leur ordre d'apparition.
  const positions = participants
    .map((p) => ({ p, at: raw.toLowerCase().indexOf(p.name.toLowerCase()) }))
    .filter((x) => x.at !== -1)
    .sort((a, b) => a.at - b.at);
  for (const { p } of positions) push(p.name);
  return ids;
}

export type DirectorInput = {
  connection: ConnectionTarget;
  modelId: string;
  participants: Participant[];
  /** Descriptions courtes, pour que le choix tienne compte des caractères. */
  descriptions: Record<string, string | null>;
  recentMessages: Message[];
  label: MessageLabeller;
  userName: string;
  /** Vrai quand l'utilisateur vient de parler : quelqu'un doit répondre. */
  afterUserMessage: boolean;
  coordination?: string;
  /** Paramètres du profil de modèle (désactivation du raisonnement, etc.). */
  extraParameters?: Record<string, unknown>;
  /** Langue de jeu ; le directeur écrit dans la même que les personnages. */
  pack?: PromptPack;
};

/**
 * Retourne les identifiants des personnages qui prennent la parole, dans
 * l'ordre. Tableau vide = personne ne réagit — sauf si l'utilisateur vient de
 * parler, auquel cas l'appelant retombe sur le tour de table.
 */
export async function chooseSpeakers(input: DirectorInput): Promise<string[] | null> {
  const { participants } = input;
  if (participants.length < 2) return null;

  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const d = pack.director;

  const roster = participants
    .map((p) => {
      const description = input.descriptions[p.id];
      return description ? `- ${p.name} : ${description}` : `- ${p.name}`;
    })
    .join("\n");

  const transcript = input.recentMessages
    .slice(-DIRECTOR_CONTEXT_MESSAGES)
    .filter((m) => m.content.trim())
    .map((m) =>
      m.kind === "narration"
        ? d.narrationLine(m.content)
        : d.transcriptLine(input.label(m), m.content),
    )
    .join("\n");

  try {
    const raw = await chatCompletion(
      { ...input.connection, timeoutMs: 20_000 },
      {
        ...noThinkingRequestParameters(
          input.connection,
          input.extraParameters ?? {},
        ),
        model: input.modelId,
        temperature: 0.4,
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content: d.system({
              userName: input.userName,
              afterUserMessage: input.afterUserMessage,
            }),
          },
          {
            role: "user",
            content: d.user({
              roster,
              transcript: transcript || d.emptyTranscript,
            }) + (input.coordination ? `\n\n${input.coordination}` : ""),
          },
        ],
      },
    );
    const chosen = parseSpeakerChoice(raw, participants);
    // Only an explicit empty array means silence; unusable output is a failure.
    if (!chosen.length && !/\[\s*\]/.test(raw)) return null;
    // One utterance at a time; the next choice sees its actual content.
    return chosen.slice(0, 1);
  } catch {
    // Serveur muet ou trop lent : le tour de table prend le relais.
    return null;
  }
}
