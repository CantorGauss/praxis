// Traduction d'une fiche de personnage dans la langue des conversations.
//
// Utile surtout après l'import d'une carte SillyTavern : la plupart sont en
// anglais. Le personnage joue de toute façon dans la langue de jeu (le prompt
// le lui impose), mais une fiche traduite se relit, se corrige, et donne aux
// autres personnages une description dans leur langue.
//
// Les connaissances suivent, par lots : leurs mots-clés traduits s'ajoutent
// aux originaux, pour qu'une entrée se déclenche dans les deux langues.
//
// Rien n'est appliqué en silence : l'interface remplace la fiche et propose de
// rétablir l'original.

import type { ConnectionTarget, Persona } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import { mergeKeys, type LoreEntry, type Lorebook } from "./lorebook";

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

// ---------------------------------------------------------------------------
// Connaissances (lorebook)
// ---------------------------------------------------------------------------

/** Taille d'un lot d'entrées : assez petit pour tenir dans une réponse. */
const LORE_BATCH_CHARS = 4000;
const LORE_BATCH_ENTRIES = 20;

type LoreItem = { i: number; keys: string[]; secondary: string[]; content: string };

/** Découpe les entrées en lots, chacune gardant son rang dans le livre. */
export function loreBatches(entries: readonly LoreEntry[]): LoreItem[][] {
  const batches: LoreItem[][] = [];
  let current: LoreItem[] = [];
  let size = 0;
  entries.forEach((entry, i) => {
    const item = { i, keys: entry.keys, secondary: entry.secondaryKeys, content: entry.content };
    const cost = JSON.stringify(item).length;
    if (current.length > 0 && (size + cost > LORE_BATCH_CHARS || current.length >= LORE_BATCH_ENTRIES)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += cost;
  });
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Lit la traduction d'un lot. Le contenu traduit remplace l'original ; les
 * mots-clés traduits s'ajoutent aux originaux. Une entrée absente ou vide de
 * la réponse reste telle quelle. Retourne les entrées effectivement traduites.
 *
 * Exporté pour les tests.
 */
export function parseLoreTranslation(
  raw: string,
  entries: LoreEntry[],
  batch: readonly LoreItem[],
): number {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return 0;
  }
  const list = (parsed as { entries?: unknown })?.entries;
  if (!Array.isArray(list)) return 0;
  const wanted = new Set(batch.map((item) => item.i));
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  let done = 0;
  for (const rawItem of list) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const i = item.i;
    if (typeof i !== "number" || !wanted.has(i)) continue;
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!content) continue;
    wanted.delete(i);
    const entry = entries[i];
    entries[i] = {
      ...entry,
      content,
      keys: mergeKeys(entry.keys, strings(item.keys)),
      secondaryKeys: mergeKeys(entry.secondaryKeys, strings(item.secondary)),
    };
    done += 1;
  }
  return done;
}

export type TranslationInput = {
  connection: ConnectionTarget;
  modelId: string;
  persona: Pick<
    Persona,
    "name" | "gender" | "description" | "systemPrompt" | "stableTraits" | "lorebook"
  >;
  extraParameters?: Record<string, unknown>;
  /** Pack de la langue cible : celle des conversations. */
  pack?: PromptPack;
};

export type TranslationResult = TranslatedSheet & {
  lorebook: Lorebook | null;
  /** Entrées du lorebook restées dans leur langue (lot refusé ou illisible). */
  untranslatedEntries: number;
};

/** Une traduction fait à peu près la longueur de l'original, avec de la marge. */
function outputBudget(text: string): number {
  return Math.min(8000, Math.ceil(text.length / 2) + 300);
}

/**
 * Fiche et connaissances traduites. Retourne null si la fiche elle-même n'a
 * pas pu l'être ; les lots de connaissances qui échouent restent dans leur
 * langue et sont comptés.
 */
export async function translatePersonaSheet(
  input: TranslationInput,
): Promise<TranslationResult | null> {
  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const who = { personaName: input.persona.name, gender: input.persona.gender };
  const base = {
    ...noThinkingRequestParameters(input.connection, input.extraParameters ?? {}),
    model: input.modelId,
    temperature: 0.2,
  };

  const sheet = sheetForTranslation(input.persona);
  const raw = await chatCompletion(input.connection, {
    ...base,
    max_tokens: outputBudget(sheet),
    messages: [
      { role: "system", content: pack.translation.system(who) },
      { role: "user", content: pack.translation.user(sheet) },
    ],
  });
  const translated = parseTranslation(raw, input.persona);
  if (!translated) return null;

  const book = input.persona.lorebook;
  if (!book || book.entries.length === 0) {
    return { ...translated, lorebook: book, untranslatedEntries: 0 };
  }
  const entries = book.entries.map((e) => ({ ...e }));
  let untranslated = 0;
  for (const batch of loreBatches(entries)) {
    const payload = JSON.stringify({ entries: batch }, null, 2);
    try {
      const answer = await chatCompletion(input.connection, {
        ...base,
        max_tokens: outputBudget(payload),
        messages: [
          { role: "system", content: pack.translation.loreSystem(who) },
          { role: "user", content: pack.translation.loreUser(payload) },
        ],
      });
      untranslated += batch.length - parseLoreTranslation(answer, entries, batch);
    } catch {
      untranslated += batch.length;
    }
  }
  return {
    ...translated,
    lorebook: { ...book, entries },
    untranslatedEntries: untranslated,
  };
}
