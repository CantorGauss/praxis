import type {
  DayPeriod,
  EmotionalState,
  EmotionalStateUpdate,
  Mood,
} from "../types";
import { NEUTRAL_STATE } from "../types";

// Demi-vies de retour vers l'état neutre, en heures.
export const HALF_LIVES = {
  valence: 12,
  energy: 6,
  warmth: 72,
  closeness: 30 * 24,
} as const;

// Amplitude maximale d'une réaction forte. Les petits événements utilisent
// les anciennes bornes, puis l'amplitude augmente avec l'intensité évaluée.
export const DELTA_BOUNDS = {
  valenceDelta: 0.55,
  energyDelta: 0.45,
  warmthDelta: 0.2,
  closenessDelta: 0.05,
} as const;

export const BASE_DELTA_BOUNDS = {
  valenceDelta: 0.12,
  energyDelta: 0.1,
  warmthDelta: 0.05,
  closenessDelta: 0.01,
} as const;

export const MOODS: Mood[] = [
  "neutral",
  "joyful",
  "calm",
  "curious",
  "surprised",
  "shocked",
  "concerned",
  "afraid",
  "sad",
  "angry",
  "disgusted",
  "tired",
  "annoyed",
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function decayToward(
  current: number,
  neutral: number,
  elapsedHours: number,
  halfLifeHours: number,
): number {
  const factor = Math.pow(0.5, elapsedHours / halfLifeHours);
  return neutral + (current - neutral) * factor;
}

/** Cible d'énergie légère selon la période de la journée. */
const ENERGY_PERIOD_NUDGE: Record<DayPeriod, number> = {
  morning: 0.05,
  afternoon: 0,
  evening: -0.05,
  night: -0.1,
};

/**
 * Applique la décroissance temporelle à la lecture, avant chaque requête.
 * Retourne un nouvel état ; ne modifie rien en base.
 */
export function applyDecay(
  state: EmotionalState,
  now: Date,
  dayPeriod: DayPeriod,
): EmotionalState {
  const elapsedHours = Math.max(
    0,
    (now.getTime() - new Date(state.updatedAt).getTime()) / 3_600_000,
  );
  const valence = decayToward(
    state.valence,
    NEUTRAL_STATE.valence,
    elapsedHours,
    HALF_LIVES.valence,
  );
  let energy = decayToward(
    state.energy,
    NEUTRAL_STATE.energy,
    elapsedHours,
    HALF_LIVES.energy,
  );
  energy = clamp(energy + ENERGY_PERIOD_NUDGE[dayPeriod], 0, 1);
  const warmth = decayToward(
    state.warmth,
    NEUTRAL_STATE.warmth,
    elapsedHours,
    HALF_LIVES.warmth,
  );
  const closeness = decayToward(
    state.closeness,
    NEUTRAL_STATE.closeness,
    elapsedHours,
    HALF_LIVES.closeness,
  );
  const next: EmotionalState = {
    personaId: state.personaId,
    valence: clamp(valence, -1, 1),
    energy,
    warmth: clamp(warmth, 0, 1),
    closeness: clamp(closeness, 0, 1),
    mood: state.mood,
    updatedAt: now.toISOString(),
  };
  next.mood = inferMood(next);
  return next;
}

/** Recalcule l'humeur à partir des dimensions numériques. */
export function inferMood(state: {
  valence: number;
  energy: number;
  warmth: number;
}): Mood {
  if (state.energy < 0.25) return "tired";
  if (state.valence > 0.6 && state.energy > 0.45) return "joyful";
  if (state.valence < -0.35) return "annoyed";
  if (state.valence < -0.1 && state.warmth > 0.55) return "concerned";
  if (state.energy > 0.65 && state.valence >= 0) return "curious";
  return "calm";
}

/** L'étiquette proposée n'est gardée que si elle est cohérente avec les valeurs. */
export function reconcileMood(
  proposed: Mood,
  state: { valence: number; energy: number; warmth: number },
  intensity = 0,
): Mood {
  const inferred = inferMood(state);
  if (proposed === inferred) return proposed;
  // Les dimensions persistantes ne peuvent pas distinguer un choc d'une peur
  // ou d'une colère. Pour une réaction marquée, l'évaluation contextuelle a
  // donc priorité sur la table numérique générique.
  if (intensity >= 0.25 && proposed !== "neutral" && proposed !== "calm") {
    return proposed;
  }
  // Tolérance : accepter neutral/calm interchangeables, sinon recalculer.
  const softPairs: [Mood, Mood][] = [
    ["neutral", "calm"],
    ["calm", "neutral"],
    ["curious", "calm"],
    ["joyful", "curious"],
  ];
  if (softPairs.some(([a, b]) => proposed === a && inferred === b)) {
    return proposed;
  }
  return inferred;
}

/**
 * Applique une mise à jour bornée à l'état courant (déjà décroissant).
 * Toute valeur hors bornes est écrêtée, jamais rejetée.
 */
export function applyUpdate(
  state: EmotionalState,
  update: EmotionalStateUpdate,
  now: Date,
): EmotionalState {
  const intensity = clamp(update.intensity, 0, 1);
  const bound = (key: keyof typeof DELTA_BOUNDS) =>
    BASE_DELTA_BOUNDS[key] +
    (DELTA_BOUNDS[key] - BASE_DELTA_BOUNDS[key]) * intensity;
  const next: EmotionalState = {
    personaId: state.personaId,
    valence: clamp(
      state.valence +
        clamp(update.valenceDelta, -bound("valenceDelta"), bound("valenceDelta")),
      -1,
      1,
    ),
    energy: clamp(
      state.energy +
        clamp(update.energyDelta, -bound("energyDelta"), bound("energyDelta")),
      0,
      1,
    ),
    warmth: clamp(
      state.warmth +
        clamp(update.warmthDelta, -bound("warmthDelta"), bound("warmthDelta")),
      0,
      1,
    ),
    closeness: clamp(
      state.closeness +
        clamp(
          update.closenessDelta,
          -bound("closenessDelta"),
          bound("closenessDelta"),
        ),
      0,
      1,
    ),
    mood: "calm",
    updatedAt: now.toISOString(),
  };
  next.mood = reconcileMood(update.mood, next, intensity);
  return next;
}

/** Valide strictement le JSON renvoyé par l'analyse émotionnelle. */
export function parseEmotionalUpdate(raw: string): EmotionalStateUpdate | null {
  let text = raw.trim();
  // Tolérer un bloc de code ou du texte autour du JSON.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  text = text.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const mood = obj.mood;
  if (typeof mood !== "string" || !MOODS.includes(mood as Mood)) return null;
  const nums = ["valenceDelta", "energyDelta", "warmthDelta", "closenessDelta"];
  for (const key of nums) {
    if (typeof obj[key] !== "number" || !Number.isFinite(obj[key] as number)) {
      return null;
    }
  }
  const intensity =
    typeof obj.intensity === "number" && Number.isFinite(obj.intensity)
      ? clamp(obj.intensity, 0, 1)
      : 0.25;
  const impulse =
    typeof obj.impulse === "string" ? obj.impulse.trim().slice(0, 240) : "";
  return {
    mood: mood as Mood,
    intensity,
    impulse,
    valenceDelta: obj.valenceDelta as number,
    energyDelta: obj.energyDelta as number,
    warmthDelta: obj.warmthDelta as number,
    closenessDelta: obj.closenessDelta as number,
  };
}

export function neutralState(personaId: string, now: Date): EmotionalState {
  return {
    personaId,
    mood: NEUTRAL_STATE.mood,
    valence: NEUTRAL_STATE.valence,
    energy: NEUTRAL_STATE.energy,
    warmth: NEUTRAL_STATE.warmth,
    closeness: NEUTRAL_STATE.closeness,
    updatedAt: now.toISOString(),
  };
}

/**
 * Les étiquettes d'humeur vivent dans `i18n/moods` : elles servent à la fois
 * au prompt et à l'interface, qui ne suivent pas forcément la même langue.
 */
export { MOOD_LABELS_BY_LOCALE } from "../i18n/moods";
