import type { ConnectionTarget, Message } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack, type TwistTheme } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import { publicText } from "./messageFormat";
import { stripSummaryMarkers } from "./promptAssembler";
import type { MessageLabeller } from "./scene";

/**
 * Imprévus : une didascalie inventée par le modèle quand la scène s'enlise.
 *
 * Comme pour le metteur en scène, la réponse n'est jamais crue sur parole :
 * on n'en garde qu'une phrase ou deux nettoyées, et tout échec revient à ne
 * rien insérer. Le pire cas reste la scène telle qu'elle était.
 */

/**
 * Répliques minimales entre deux didascalies avant un nouvel imprévu : la
 * scène doit avoir le temps d'exploiter ce qui vient d'arriver.
 */
export const TWIST_COOLDOWN_LINES = 8;

/** Répliques récentes soumises à l'auteur de l'imprévu. */
const TWIST_CONTEXT_MESSAGES = 14;
/** Didascalies rappelées à l'auteur, pour qu'il ne resserve pas le même procédé. */
const TWIST_MEMORY = 6;
/** Tirages tentés quand le modèle retombe sur un tic que la consigne interdit. */
const TWIST_ATTEMPTS = 3;
/** Au-delà, ce n'est plus une didascalie mais un paragraphe de roman. */
const MAX_TWIST_LENGTH = 280;
const MIN_TWIST_LENGTH = 8;

/**
 * Réduit une réponse libre à une didascalie utilisable, ou null.
 *
 * Exporté pour les tests.
 */
export function cleanTwist(
  raw: string,
  speakerNames: readonly string[] = [],
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string | null {
  // L'enjeu sert à ancrer l'imprévu dans l'intrigue ; il ne va pas sur scène.
  const stakeLine = new RegExp(`^[*_\\s]*${pack.twist.stakeLabel}[*_\\s]*[:：—–-].*(?:\\n\\s*|$)`, "i");
  // Premier paragraphe seulement : la suite est presque toujours un commentaire.
  let text =
    raw.trim().replace(stakeLine, "").split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";

  // « (Scène : …) », « Didascalie : … », « **Imprévu** — … »
  for (let pass = 0; pass < 3; pass++) {
    const before = text;
    text = text.replace(/^[(\[*_"«“\s]+|[)\]*_"»”\s]+$/g, "").trim();
    for (const prefix of pack.twist.stripPrefixes) {
      const pattern = new RegExp(`^${prefix}[*_\\s]*[:：—–-]\\s*`, "i");
      text = text.replace(pattern, "");
    }
    if (text === before) break;
  }

  // Une réplique attribuée (« Marc : … ») trahit un dialogue, pas une didascalie.
  const lower = text.toLowerCase();
  if (
    speakerNames.some((name) => {
      const n = name.trim().toLowerCase();
      return n && (lower.startsWith(`${n}:`) || lower.startsWith(`${n} :`));
    })
  ) {
    return null;
  }
  if (text.length < MIN_TWIST_LENGTH) return null;

  if (text.length > MAX_TWIST_LENGTH) {
    const cut = text.slice(0, MAX_TWIST_LENGTH);
    const sentenceEnd = Math.max(
      cut.lastIndexOf(". "),
      cut.lastIndexOf("! "),
      cut.lastIndexOf("? "),
    );
    text = sentenceEnd > MIN_TWIST_LENGTH ? cut.slice(0, sentenceEnd + 1) : `${cut.trimEnd()}…`;
  }
  return text;
}

/**
 * Détecte le nom de l'utilisateur suivi d'un verbe (« Jeff renverse son thé »).
 * Une fausse alerte ne coûte qu'un nouveau tirage ; laisser passer ôte à
 * l'utilisateur la main sur son propre rôle.
 *
 * Exporté pour les tests.
 */
export function actsForUser(twist: string, userName: string): boolean {
  const name = userName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!name) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${name}\\s+(?!et\\b|ou\\b|and\\b|or\\b)\\p{Ll}`, "iu").test(twist)
    && !new RegExp(`\\p{Ll}\\s+${name}\\s`, "u").test(twist);
}

export type TwistInput = {
  connection: ConnectionTarget;
  modelId: string;
  participants: { name: string; description: string | null }[];
  sceneDescription: string | null;
  summary: string | null;
  recentMessages: Message[];
  label: MessageLabeller;
  userName: string;
  extraParameters?: Record<string, unknown>;
  pack?: PromptPack;
  /** Imprévu réclamé par l'utilisateur, avec sa couleur ; absent quand la scène s'enlise seule. */
  theme?: TwistTheme | null;
};

/** Thèmes proposés dans l'interface, dans l'ordre d'affichage. */
export const TWIST_THEMES: readonly TwistTheme[] = [
  "surprise",
  "catastrophe",
  "romance",
  "absurd",
  "mystery",
  "revelation",
];

/** Didascalie qui relance la scène, ou null si le modèle n'a rien d'utilisable. */
export async function inventSceneTwist(input: TwistInput): Promise<string | null> {
  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const roster = input.participants
    .map((p) => (p.description ? `- ${p.name} : ${p.description}` : `- ${p.name}`))
    .join("\n");
  const transcript = input.recentMessages
    .slice(-TWIST_CONTEXT_MESSAGES)
    .filter((m) => publicText(m.content).trim())
    .map((m) =>
      m.kind === "narration"
        ? pack.director.narrationLine(m.content)
        : pack.director.transcriptLine(input.label(m), publicText(m.content)),
    )
    .join("\n");
  const previousTwists = input.recentMessages
    .filter((m) => m.kind === "narration" && m.content.trim())
    .slice(-TWIST_MEMORY)
    .map((m) => m.content.trim());

  // Une consigne négative ne suffit pas : le modèle ressert ses tics une fois
  // sur dix. Si tous les tirages y retombent, mieux vaut un imprévu imparfait
  // qu'un bouton qui ne fait rien.
  let fallback: string | null = null;
  try {
    for (let attempt = 0; attempt < TWIST_ATTEMPTS; attempt += 1) {
      const raw = await chatCompletion(
        { ...input.connection, timeoutMs: 20_000 },
        {
          ...noThinkingRequestParameters(input.connection, input.extraParameters ?? {}),
          model: input.modelId,
          // L'imprévu doit surprendre : plus de hasard que pour les répliques.
          temperature: 0.9,
          max_tokens: 200,
          messages: [
            { role: "system", content: pack.twist.system({ userName: input.userName }) },
            {
              role: "user",
              content: pack.twist.user({
                situation: input.sceneDescription?.trim() || null,
                summary: input.summary ? stripSummaryMarkers(input.summary) || null : null,
                roster,
                transcript: transcript || pack.director.emptyTranscript,
                theme: input.theme ? pack.twist.themes[input.theme] : null,
                previousTwists,
              }),
            },
          ],
        },
      );
      const twist = cleanTwist(
        raw,
        [...input.participants.map((p) => p.name), input.userName],
        pack,
      );
      if (twist && !pack.twist.rejected.test(twist) && !actsForUser(twist, input.userName)) {
        return twist;
      }
      fallback ??= twist;
    }
  } catch {
    // Un échec en cours de route ne doit pas perdre le tirage déjà obtenu.
  }
  return fallback;
}
