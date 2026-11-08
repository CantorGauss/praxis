import type { Message, Mood, SceneProposal } from "../types";
import type { BubbleTone } from "./bubbleTone";

/**
 * Effets de scène : ce qui se passe à l'écran quand la pièce s'emballe.
 *
 * Purement décoratif, comme le ton des bulles : rien ici ne remonte vers les
 * prompts. Ce module décide seulement *quoi* jouer ; le dessin et le
 * mouvement vivent dans `sceneFx` et `SceneEffects.svelte`.
 */

export type SceneEffect =
  /** La scène tremble ; `strength` de 0 à 1. */
  | { kind: "shake"; strength: number }
  /** Une gerbe de pictogrammes jaillit de la bulle. */
  | { kind: "burst"; emoji: string }
  /** Des « ha ha » s'envolent de la bulle. */
  | { kind: "laugh" }
  /** Un imprévu tombe : coup de projecteur et étincelles. */
  | { kind: "spotlight" };

/** Pictogramme de la gerbe, par humeur ; absent = pas de gerbe. */
export const MOOD_BURST: Partial<Record<Mood, string>> = {
  joyful: "✨",
  angry: "💢",
  annoyed: "💢",
  sad: "💧",
  shocked: "⚡",
  surprised: "❗",
  afraid: "💦",
  disgusted: "🤢",
  curious: "❓",
  tired: "💤",
};

/** Seule une humeur vraiment forte mérite sa gerbe. */
export const BURST_INTENSITY = 0.75;

/** Ce que déclenche une réplique ou une didascalie qui vient d'arriver. */
export function effectsForMessage(message: Message, tone: BubbleTone): SceneEffect[] {
  if (message.kind === "narration") {
    // Seul l'imprévu écrit par le modèle a droit au projecteur : une entrée
    // ou une sortie décrite par l'utilisateur reste discrète.
    return message.role === "assistant" ? [{ kind: "spotlight" }] : [];
  }
  const effects: SceneEffect[] = [];
  if (tone.delivery === "shout") {
    // Un cri en colère secoue davantage qu'un cri de joie.
    const heated = tone.mood === "angry" || tone.mood === "annoyed" || tone.mood === "shocked";
    effects.push({
      kind: "shake",
      strength: Math.min(1, 0.35 + (heated ? 0.65 : 0.35) * Math.max(tone.intensity, 0.5)),
    });
  }
  if (tone.delivery === "laugh") effects.push({ kind: "laugh" });
  const emoji = tone.mood ? MOOD_BURST[tone.mood] : undefined;
  if (emoji && tone.intensity >= BURST_INTENSITY) effects.push({ kind: "burst", emoji });
  return effects;
}

/**
 * Propositions qui viennent de faire l'unanimité, et seulement celles-là.
 *
 * Il faut au moins deux personnes concernées — une proposition qui n'engage
 * que son auteur est « acceptée » d'office — et l'accord doit avoir été donné
 * sous les yeux de l'utilisateur : rouvrir une conversation ne relance pas la
 * fête de la veille.
 */
export function newUnanimousAgreements(
  proposals: readonly SceneProposal[],
  celebrated: ReadonlySet<string>,
  freshMessageIds: ReadonlySet<string>,
): SceneProposal[] {
  return proposals.filter(
    (proposal) =>
      proposal.status === "agreed" &&
      proposal.participantIds.length > 1 &&
      !celebrated.has(proposal.id) &&
      Object.values(proposal.positions).some((position) =>
        freshMessageIds.has(position.messageId),
      ),
  );
}
