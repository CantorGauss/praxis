import type {
  ConnectionTarget,
  EmotionalReaction,
  EmotionalState,
  Persona,
} from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters, type ChatMessage } from "./llmClient";
import { applyUpdate, parseEmotionalUpdate, MOODS } from "./emotion";
import { stripSummaryMarkers } from "./promptAssembler";
import { emotionRepo } from "./repositories";

export type EmotionalAssessment = {
  state: EmotionalState;
  reaction: EmotionalReaction | null;
};

/** Tours relus avant l'événement : de quoi reconnaître une nouvelle déjà tombée. */
const KNOWN_CONTEXT_TURNS = 6;
const KNOWN_CONTEXT_MAX_CHARS = 4_000;

/**
 * Ce que le personnage sait déjà au moment d'évaluer sa réaction. Jugé seul,
 * chaque événement paraît neuf : une mort annoncée trois fois sidère trois fois,
 * et la réplique suivante rejoue la découverte au lieu de faire avancer la scène.
 */
export function knownContextFor(
  summary: string | null,
  transcript: readonly ChatMessage[],
  speakerName: string,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string | null {
  const stimulusIndex = transcript.findLastIndex((m) => m.role === "user");
  const recent = transcript
    .slice(Math.max(0, stimulusIndex - KNOWN_CONTEXT_TURNS), Math.max(0, stimulusIndex))
    .map((m) =>
      m.role === "assistant" ? pack.summary.messageLine(speakerName, m.content) : m.content,
    )
    .join("\n\n")
    .slice(-KNOWN_CONTEXT_MAX_CHARS);
  const known = [summary ? stripSummaryMarkers(summary) : "", recent]
    .filter(Boolean)
    .join("\n\n");
  return known || null;
}

/**
 * Évalue ce que le personnage ressent AVANT sa réplique. Cette position est
 * essentielle : la réaction immédiate peut ainsi réellement infléchir son jeu,
 * au lieu de ne devenir visible qu'au tour suivant.
 */
export async function assessEmotionalReaction(
  connection: ConnectionTarget,
  modelId: string,
  persona: Persona,
  decayedState: EmotionalState,
  stimulus: string,
  /** Paramètres du profil de modèle (désactivation du raisonnement, etc.). */
  extraParameters: Record<string, unknown> = {},
  pack: PromptPack = DEFAULT_PROMPT_PACK,
  /** Cadre factuel nécessaire pour interpréter un stimulus ambigu. */
  sceneDescription: string | null = null,
  /** Ce qui précède l'événement — voir `knownContextFor`. */
  alreadyKnown: string | null = null,
): Promise<EmotionalAssessment> {
  try {
    const characterization = [
      persona.description,
      persona.systemPrompt,
      persona.stableTraits.length > 0
        ? pack.emotion.traitsLine(persona.stableTraits.join(", "))
        : null,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2_000);
    const raw = await chatCompletion(
      { ...connection, timeoutMs: 30_000 },
      {
        ...noThinkingRequestParameters(connection, extraParameters),
        model: modelId,
        temperature: 0,
        max_tokens: 260,
        messages: [
          {
            role: "system",
            content: pack.emotion.analysisSystem({
              personaName: persona.name,
              moodList: MOODS.map((m) => `"${m}"`).join("|"),
            }),
          },
          {
            role: "user",
            content: pack.emotion.analysisUser({
              characterization,
              sceneDescription: sceneDescription?.trim() || null,
              mood: decayedState.mood,
              valence: decayedState.valence.toFixed(2),
              energy: decayedState.energy.toFixed(2),
              warmth: decayedState.warmth.toFixed(2),
              closeness: decayedState.closeness.toFixed(2),
              stimulus,
              alreadyKnown,
            }),
          },
        ],
      },
    );
    const update = parseEmotionalUpdate(raw);
    if (!update) return { state: decayedState, reaction: null };
    const state = applyUpdate(decayedState, update, new Date());
    await emotionRepo.save(state);
    return {
      state,
      reaction: {
        mood: state.mood,
        intensity: update.intensity,
        impulse: update.impulse,
      },
    };
  } catch {
    return { state: decayedState, reaction: null };
  }
}
