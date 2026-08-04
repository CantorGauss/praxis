import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";

/**
 * Réglages d'inférence présentés en termes d'usage. Les nombres restent une
 * contrainte technique interne : dans la fiche d'un personnage, l'utilisateur
 * choisit surtout la longueur qu'il souhaite lire.
 *
 * Seuls l'identifiant et le plafond vivent ici : les libellés dépendent de la
 * langue de l'interface et sont rendus par `t.inference.*`.
 */
export const RESPONSE_LENGTH_PRESETS = [
  { id: "short", maxTokens: 512 },
  { id: "normal", maxTokens: 1024 },
  { id: "long", maxTokens: 2048 },
] as const;

export type ResponseLengthId = (typeof RESPONSE_LENGTH_PRESETS)[number]["id"];

export const DEFAULT_MAX_OUTPUT_TOKENS = RESPONSE_LENGTH_PRESETS[1].maxTokens;

/** Valeurs simples proposées pour la capacité totale d'un modèle. */
export const MODEL_CONTEXT_PRESETS = [4096, 8192, 16384, 32768] as const;

/**
 * Marge appliquée à une capacité détectée. Le budget est calculé à partir
 * d'une estimation grossière — environ quatre caractères par token — qui
 * sous-estime le français accentué. Dépasser la capacité réelle du serveur est
 * une erreur dure, alors qu'une marge ne coûte que quelques centaines de
 * tokens : elle n'est donc pas appliquée à une valeur saisie à la main, que
 * l'utilisateur a déjà choisie comme budget.
 */
export const DETECTED_CONTEXT_SAFETY_RATIO = 0.9;

export type ContextBudgetSource = "manual" | "detected" | "fallback";

export type ContextBudget = {
  /** Tokens réellement utilisables pour l'assemblage du prompt. */
  tokens: number;
  source: ContextBudgetSource;
  /** Capacité brute annoncée par le serveur, avant marge. */
  detected?: number;
};

/**
 * Capacité retenue pour un modèle. La valeur saisie prime sur celle annoncée
 * par le serveur : on peut vouloir un budget délibérément inférieur, et
 * l'écraser à chaque rafraîchissement de la liste des modèles serait hostile.
 */
export function resolveContextBudget(input: {
  manual?: number | null;
  detected?: number | null;
  fallback: number;
}): ContextBudget {
  const detected =
    typeof input.detected === "number" && input.detected > 0
      ? Math.floor(input.detected)
      : undefined;
  if (typeof input.manual === "number" && input.manual > 0) {
    return { tokens: Math.floor(input.manual), source: "manual", detected };
  }
  if (detected !== undefined) {
    return {
      tokens: Math.max(1, Math.floor(detected * DETECTED_CONTEXT_SAFETY_RATIO)),
      source: "detected",
      detected,
    };
  }
  return { tokens: Math.floor(input.fallback), source: "fallback" };
}

/**
 * Les anciennes personas utilisaient `null` pour « laisser le serveur
 * décider ». Cela rendait la longueur imprévisible et réservait parfois moins
 * de place que la réponse réellement générée. `null` signifie désormais la
 * longueur normale, déterministe.
 */
export function effectiveMaxOutputTokens(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  return Math.max(1, Math.round(value));
}

/** Preset le plus proche, notamment pour les anciennes valeurs importées. */
export function responseLengthPreset(value: number | null | undefined) {
  const tokens = effectiveMaxOutputTokens(value);
  return RESPONSE_LENGTH_PRESETS.reduce((closest, preset) =>
    Math.abs(preset.maxTokens - tokens) < Math.abs(closest.maxTokens - tokens)
      ? preset
      : closest,
  );
}

/** La limite de tokens est un plafond ; cette consigne donne aussi une cible. */
export function responseLengthInstruction(
  value: number | null | undefined,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string | null {
  if (responseLengthPreset(value).id !== "short") return null;
  return pack.inference.shortResponse;
}
