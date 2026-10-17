import type { ConnectionTarget, Message } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack, type TwistTheme } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import { publicText } from "./messageFormat";
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
const TWIST_CONTEXT_MESSAGES = 10;
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
  // Premier paragraphe seulement : la suite est presque toujours un commentaire.
  let text = raw.trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";

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

  try {
    const raw = await chatCompletion(
      { ...input.connection, timeoutMs: 20_000 },
      {
        ...noThinkingRequestParameters(input.connection, input.extraParameters ?? {}),
        model: input.modelId,
        // L'imprévu doit surprendre : plus de hasard que pour les répliques.
        temperature: 1,
        max_tokens: 120,
        messages: [
          { role: "system", content: pack.twist.system({ userName: input.userName }) },
          {
            role: "user",
            content: pack.twist.user({
              situation: input.sceneDescription?.trim() || null,
              summary: input.summary?.trim() || null,
              roster,
              transcript: transcript || pack.director.emptyTranscript,
              theme: input.theme ? pack.twist.themes[input.theme] : null,
            }),
          },
        ],
      },
    );
    return cleanTwist(
      raw,
      [...input.participants.map((p) => p.name), input.userName],
      pack,
    );
  } catch {
    return null;
  }
}
