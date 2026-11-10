// Traduction d'une fiche de personnage dans la langue des conversations.
//
// Utile surtout après l'import d'une carte SillyTavern : la plupart sont en
// anglais. Le personnage joue de toute façon dans la langue de jeu (le prompt
// le lui impose), mais une fiche traduite se relit, se corrige, et donne aux
// autres personnages une description dans leur langue.
//
// Rien n'est appliqué en silence : l'interface remplace la fiche et propose de
// rétablir l'original.

import type { ConnectionTarget, Persona } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";

export type TranslatedSheet = {
  description: string | null;
  systemPrompt: string;
  stableTraits: string[];
};

/** Au-delà, une liste de traits ne stabilise plus rien. */
const MAX_TRAITS = 12;

/** Ce que le modèle reçoit : les seuls champs à traduire, sous des noms parlants. */
export function sheetForTranslation(
  persona: Pick<Persona, "description" | "systemPrompt" | "stableTraits">,
): string {
  return JSON.stringify(
    {
      description: persona.description ?? "",
      character: persona.systemPrompt,
      traits: persona.stableTraits,
    },
    null,
    2,
  );
}

/**
 * Lit la réponse du modèle. Un caractère vide ou absent fait échouer la
 * traduction entière : mieux vaut garder l'original qu'une fiche amputée.
 *
 * Exporté pour les tests.
 */
export function parseTranslation(
  raw: string,
  original: Pick<Persona, "description" | "stableTraits">,
): TranslatedSheet | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const character = typeof record.character === "string" ? record.character.trim() : "";
  if (!character) return null;
  const description =
    original.description && typeof record.description === "string"
      ? record.description.trim() || original.description
      : original.description;
  const traits = Array.isArray(record.traits)
    ? record.traits
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, MAX_TRAITS)
    : [];
  return {
    description,
    systemPrompt: character,
    // Pas de traits inventés là où il n'y en avait pas ; des traits perdus en
    // route valent moins que les traits d'origine.
    stableTraits:
      original.stableTraits.length === 0
        ? []
        : traits.length > 0
          ? traits
          : [...original.stableTraits],
  };
}

export type TranslationInput = {
  connection: ConnectionTarget;
  modelId: string;
  persona: Pick<Persona, "name" | "gender" | "description" | "systemPrompt" | "stableTraits">;
  extraParameters?: Record<string, unknown>;
  /** Pack de la langue cible : celle des conversations. */
  pack?: PromptPack;
};

/** Fiche traduite, ou null si le modèle n'a rien rendu d'utilisable. */
export async function translatePersonaSheet(
  input: TranslationInput,
): Promise<TranslatedSheet | null> {
  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const sheet = sheetForTranslation(input.persona);
  // Une traduction fait à peu près la longueur de l'original ; un caractère
  // vaut environ un tiers de jeton, la marge couvre les langues plus longues.
  const maxTokens = Math.min(8000, Math.ceil(sheet.length / 2) + 300);
  const raw = await chatCompletion(input.connection, {
    ...noThinkingRequestParameters(input.connection, input.extraParameters ?? {}),
    model: input.modelId,
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [
      {
        role: "system",
        content: pack.translation.system({
          personaName: input.persona.name,
          gender: input.persona.gender,
        }),
      },
      { role: "user", content: pack.translation.user(sheet) },
    ],
  });
  return parseTranslation(raw, input.persona);
}
