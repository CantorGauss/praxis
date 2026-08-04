import type {
  ConnectionTarget,
  EmotionalReaction,
  EmotionalState,
  Persona,
} from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import { applyUpdate, parseEmotionalUpdate, MOODS } from "./emotion";
import { emotionRepo } from "./repositories";

export type EmotionalAssessment = {
  state: EmotionalState;
  reaction: EmotionalReaction | null;
};

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
              mood: decayedState.mood,
              valence: decayedState.valence.toFixed(2),
              energy: decayedState.energy.toFixed(2),
              warmth: decayedState.warmth.toFixed(2),
              closeness: decayedState.closeness.toFixed(2),
              stimulus,
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
