import type { MessageReaction, Mood } from "../types";
import { splitActions } from "./messageFormat";

/**
 * Ton visuel d'une bulle de dialogue, déduit de l'humeur figée avec la
 * réplique et de la façon dont elle est dite. Purement décoratif : rien ici
 * ne remonte vers le prompt.
 */

/** Façon de dire la réplique, lue dans les didascalies ou le texte. */
export type BubbleDelivery = "shout" | "whisper" | "laugh" | "tremble";

/**
 * Mouvement d'entrée de la bulle lorsqu'elle apparaît. Il ne dépend que de
 * l'humeur, connue avant le premier mot : le texte qui arrive en streaming ne
 * doit pas relancer l'entrée en cours de route.
 */
export type BubbleEntrance =
  | "rise"
  | "pop"
  | "shake"
  | "bounce"
  | "droop"
  | "tremble"
  | "drift"
  | "tilt";

export type BubbleTone = {
  /** null : pas d'humeur notable à montrer. */
  mood: Mood | null;
  /** Force de l'humeur, de 0 à 1. */
  intensity: number;
  delivery: BubbleDelivery | null;
  entrance: BubbleEntrance;
  /** Petit pictogramme affiché au coin de la bulle, ou null. */
  emoji: string | null;
};

/** En dessous, l'humeur reste dans la teinte de la bulle mais sans geste. */
export const NOTABLE_INTENSITY = 0.45;

export const MOOD_EMOJI: Record<Mood, string | null> = {
  neutral: null,
  joyful: "😄",
  calm: "😌",
  curious: "🤔",
  surprised: "😮",
  shocked: "😱",
  concerned: "😟",
  afraid: "😨",
  sad: "😢",
  angry: "😠",
  disgusted: "🤢",
  tired: "😴",
  annoyed: "😒",
};

const MOOD_ENTRANCE: Record<Mood, BubbleEntrance> = {
  neutral: "rise",
  joyful: "bounce",
  calm: "drift",
  curious: "tilt",
  surprised: "pop",
  shocked: "pop",
  concerned: "rise",
  afraid: "tremble",
  sad: "droop",
  angry: "shake",
  disgusted: "rise",
  tired: "droop",
  annoyed: "shake",
};

// Didascalies, en français et en anglais. Chaque racine doit commencer un
// mot : « sourit » ne contient pas le mot « rit ». `\b` ignore les lettres
// accentuées, d'où la frontière écrite à la main.
const cue = (roots: string) => new RegExp(`(^|[^\\p{L}])(${roots})`, "iu");

const ACTION_CUES: [BubbleDelivery, RegExp][] = [
  ["shout", cue("cri(e|ent|ant)|hurl|s['’]écri|vocif|beugl|tonn(e|ant)|rugi|shout|yell|scream|roar|bellow")],
  ["whisper", cue("chuchot|murmur|souffl|à voix basse|tout bas|whisper|under (his|her|their) breath|softly|quietly")],
  ["laugh", cue("rit|rient|rire|riant|rican|pouff|glouss|s['’]esclaff|laugh|giggl|chuckl|snicker|cackl")],
  ["tremble", cue("trembl|frissonn|tressaill|grelott|shiver|quiver|shaking")],
];

const LAUGH_TEXT = /(^|[^\p{L}])((ha|hé|hi|ah){2,}|mdr|lol|xd)($|[^\p{L}])/iu;

function deliveryOf(content: string): BubbleDelivery | null {
  const segments = splitActions(content);
  const actions = segments
    .filter((segment) => segment.kind === "action")
    .map((segment) => segment.text)
    .join(" ");
  if (actions) {
    for (const [delivery, pattern] of ACTION_CUES) {
      if (pattern.test(actions)) return delivery;
    }
  }

  const speech = segments
    .filter((segment) => segment.kind === "speech")
    .map((segment) => segment.text)
    .join(" ");
  const letters = speech.match(/\p{L}/gu) ?? [];
  const upper = speech.match(/\p{Lu}/gu) ?? [];
  if (letters.length >= 6 && upper.length / letters.length >= 0.7) return "shout";
  if (/!{2,}/.test(speech)) return "shout";
  if (LAUGH_TEXT.test(speech)) return "laugh";
  return null;
}

export function bubbleTone(
  content: string,
  reaction: MessageReaction | null | undefined,
): BubbleTone {
  const delivery = deliveryOf(content);
  const intensity = reaction ? Math.min(1, Math.max(0, reaction.intensity)) : 0;
  const mood = reaction && reaction.mood !== "neutral" ? reaction.mood : null;
  const notable = mood !== null && intensity >= NOTABLE_INTENSITY;
  const terrified =
    notable && (mood === "afraid" || mood === "shocked") && intensity >= 0.7;

  // Une peur ou un choc très forts font trembler la voix même sans le dire.
  // Ce tremblement-là est décidé par l'humeur, donc dès l'entrée.
  const effectiveDelivery: BubbleDelivery | null =
    delivery ?? (terrified ? "tremble" : null);

  const entrance: BubbleEntrance = terrified
    ? "tremble"
    : notable && mood
      ? MOOD_ENTRANCE[mood]
      : "rise";

  const emoji = notable && mood
    ? MOOD_EMOJI[mood]
    : effectiveDelivery === "laugh"
      ? "😆"
      : null;

  return { mood, intensity, delivery: effectiveDelivery, entrance, emoji };
}

/** `#rrggbb` → `rgba(r, g, b, a)`, pour doser une teinte d'humeur. */
export function tint(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
