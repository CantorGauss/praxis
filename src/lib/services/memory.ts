import type { MemoryCategory, MemoryFact, Message, SceneMemory } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";

/**
 * Mémoire de scène : un registre de faits plutôt qu'un résumé.
 *
 * L'ancien résumé était réécrit en entier à chaque mise à jour. Passé une
 * centaine de répliques, il atteignait son plafond et chaque réécriture
 * devenait une condensation : la scène perdait quelques faits à chaque passage,
 * et les erreurs du modèle devenaient des « faits établis » qui revenaient au
 * tour suivant. Ici, le modèle ne propose que des opérations — ajouter, corriger
 * ou retirer un fait désigné par son identifiant. Rien ne disparaît par
 * omission, et l'utilisateur peut épingler ou corriger chaque fait.
 */

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  "relationship",
  "person",
  "event",
  "secret",
  "commitment",
  "place",
  "object",
  "other",
];

/** Un fait reste une phrase : au-delà, c'est un récit qui s'est glissé là. */
export const MAX_FACT_CHARS = 320;
/** Un lot qui produit davantage de faits recopie presque toujours les répliques. */
export const MAX_FACTS_ADDED_PER_UPDATE = 12;
export const MAX_STATE_LINES = 5;
export const MAX_THREAD_LINES = 5;

export function emptyMemory(): SceneMemory {
  return { version: 1, facts: [], state: [], threads: [], nextFactNumber: 1 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanLine(value: unknown, max = MAX_FACT_CHARS): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function cleanLines(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((line) => cleanLine(line))
    .filter((line): line is string => Boolean(line))
    .slice(0, max);
}

function asCategory(value: unknown): MemoryCategory {
  return typeof value === "string" &&
    (MEMORY_CATEGORIES as readonly string[]).includes(value)
    ? (value as MemoryCategory)
    : "other";
}

/** Relit la colonne JSON ; une valeur illisible vaut « pas encore de mémoire ». */
export function decodeMemory(raw: string | null): SceneMemory | null {
  if (!raw) return null;
  try {
    return normalizeMemory(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function normalizeMemory(value: unknown): SceneMemory | null {
  if (!isRecord(value) || !Array.isArray(value.facts)) return null;
  const facts: MemoryFact[] = [];
  const seen = new Set<string>();
  for (const raw of value.facts) {
    if (!isRecord(raw) || typeof raw.id !== "string" || seen.has(raw.id)) continue;
    const text = cleanLine(raw.text);
    if (!text) continue;
    seen.add(raw.id);
    facts.push({
      id: raw.id,
      text,
      category: asCategory(raw.category),
      pinned: raw.pinned === true,
      origin: raw.origin === "user" ? "user" : "auto",
      sourceMessageIds: Array.isArray(raw.sourceMessageIds)
        ? raw.sourceMessageIds.filter((id): id is string => typeof id === "string")
        : [],
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    });
  }
  const highest = facts.reduce((max, f) => Math.max(max, factNumber(f.id) ?? 0), 0);
  const next =
    typeof value.nextFactNumber === "number" && Number.isFinite(value.nextFactNumber)
      ? Math.floor(value.nextFactNumber)
      : 1;
  return {
    version: 1,
    facts,
    state: cleanLines(value.state, MAX_STATE_LINES),
    threads: cleanLines(value.threads, MAX_THREAD_LINES),
    nextFactNumber: Math.max(next, highest + 1),
  };
}

function factNumber(id: string): number | null {
  const match = /^f(\d+)$/i.exec(id.trim());
  return match ? Number(match[1]) : null;
}

/** Les modèles écrivent « F3 », « 3 » ou « [f3] » : tout désigne f3. */
function normalizeFactId(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value)) return `f${value}`;
  if (typeof value !== "string") return null;
  const match = /^\s*\[?\s*f?(\d+)\s*\]?\s*$/i.exec(value);
  return match ? `f${Number(match[1])}` : null;
}

/** Un fait saisi ou corrigé par l'utilisateur, ou épinglé, n'est plus touché par l'extraction. */
export function isProtected(fact: MemoryFact): boolean {
  return fact.origin === "user" || fact.pinned;
}

/**
 * Ce que sait un personnage : les faits établis par un message auquel il a
 * assisté, et ceux qui n'ont pas de source (saisis par l'utilisateur).
 */
export function factsKnownBy(
  facts: readonly MemoryFact[],
  seenMessageIds: ReadonlySet<string>,
): MemoryFact[] {
  return facts.filter(
    (f) =>
      f.sourceMessageIds.length === 0 ||
      f.sourceMessageIds.some((id) => seenMessageIds.has(id)),
  );
}

// ---------------------------------------------------------------------------
// Opérations proposées par le modèle
// ---------------------------------------------------------------------------

export type MemoryUpdate = {
  add: { text: string; category: MemoryCategory; sources: number[] }[];
  update: { id: string; text: string; sources: number[] }[];
  retire: string[];
  /** null = le modèle n'a rien dit : l'état précédent est conservé. */
  state: string[] | null;
  threads: string[] | null;
};

function sourceNumbers(value: unknown): number[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return list
    .map((n) => (typeof n === "string" ? Number(n.replace(/[^\d]/g, "")) : n))
    .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0);
}

/** Tolère un bloc de code ou du texte autour du JSON ; refuse tout le reste. */
export function parseMemoryUpdate(raw: string): MemoryUpdate | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const add: MemoryUpdate["add"] = [];
  for (const item of Array.isArray(parsed.add) ? parsed.add : []) {
    const text = cleanLine(isRecord(item) ? item.text : item);
    if (!text) continue;
    add.push({
      text,
      category: asCategory(isRecord(item) ? item.category : null),
      sources: sourceNumbers(isRecord(item) ? item.sources : undefined),
    });
  }

  const update: MemoryUpdate["update"] = [];
  for (const item of Array.isArray(parsed.update) ? parsed.update : []) {
    if (!isRecord(item)) continue;
    const id = normalizeFactId(item.id);
    const text = cleanLine(item.text);
    if (id && text) update.push({ id, text, sources: sourceNumbers(item.sources) });
  }

  const retire = (Array.isArray(parsed.retire) ? parsed.retire : [])
    .map((item) => normalizeFactId(isRecord(item) ? item.id : item))
    .filter((id): id is string => Boolean(id));

  return {
    add,
    update,
    retire,
    state: Array.isArray(parsed.state) ? cleanLines(parsed.state, MAX_STATE_LINES) : null,
    threads: Array.isArray(parsed.threads)
      ? cleanLines(parsed.threads, MAX_THREAD_LINES)
      : null,
  };
}

function comparable(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type AppliedMemoryUpdate = {
  memory: SceneMemory;
  added: number;
  updated: number;
  retired: number;
};

/**
 * Applique les opérations d'un lot. `numbered` associe à chaque numéro
 * montré au modèle (1, 2…) le message correspondant.
 *
 * Garde-fous : un identifiant inconnu est ignoré, un fait protégé n'est ni
 * corrigé ni retiré, un doublon exact n'est pas ajouté. Un fait sans source
 * valide est attribué à tout le lot, pour ne jamais le rendre invisible.
 */
export function applyMemoryUpdate(
  memory: SceneMemory,
  update: MemoryUpdate,
  numbered: readonly Message[],
  now: string,
): AppliedMemoryUpdate {
  const toIds = (sources: number[]) => {
    const ids = sources
      .map((n) => numbered[n - 1]?.id)
      .filter((id): id is string => Boolean(id));
    return ids.length > 0 ? [...new Set(ids)] : numbered.map((m) => m.id);
  };

  let facts = memory.facts.map((f) => ({ ...f }));
  const byId = new Map(facts.map((f) => [f.id, f]));
  let updated = 0;
  let retired = 0;

  const retiring = new Set(
    update.retire.filter((id) => {
      const fact = byId.get(id);
      return fact !== undefined && !isProtected(fact);
    }),
  );

  for (const change of update.update) {
    const fact = byId.get(change.id);
    if (!fact || isProtected(fact) || retiring.has(fact.id)) continue;
    if (comparable(fact.text) === comparable(change.text)) continue;
    fact.text = change.text;
    fact.sourceMessageIds = [...new Set([...fact.sourceMessageIds, ...toIds(change.sources)])];
    fact.updatedAt = now;
    updated += 1;
  }

  if (retiring.size > 0) {
    facts = facts.filter((f) => !retiring.has(f.id));
    retired = retiring.size;
  }

  const known = new Set(facts.map((f) => comparable(f.text)));
  let next = memory.nextFactNumber;
  let added = 0;
  for (const item of update.add.slice(0, MAX_FACTS_ADDED_PER_UPDATE)) {
    const key = comparable(item.text);
    if (!key || known.has(key)) continue;
    known.add(key);
    facts.push({
      id: `f${next}`,
      text: item.text,
      category: item.category,
      pinned: false,
      origin: "auto",
      sourceMessageIds: toIds(item.sources),
      createdAt: now,
      updatedAt: now,
    });
    next += 1;
    added += 1;
  }

  return {
    memory: {
      version: 1,
      facts,
      state: update.state ?? memory.state,
      threads: update.threads ?? memory.threads,
      nextFactNumber: next,
    },
    added,
    updated,
    retired,
  };
}

// ---------------------------------------------------------------------------
// Modifications faites par l'utilisateur
// ---------------------------------------------------------------------------

export function addUserFact(
  memory: SceneMemory | null,
  text: string,
  category: MemoryCategory,
  now: string,
  pinned = true,
): SceneMemory {
  const base = memory ?? emptyMemory();
  const clean = cleanLine(text);
  if (!clean) return base;
  return {
    ...base,
    facts: [
      ...base.facts,
      {
        id: `f${base.nextFactNumber}`,
        text: clean,
        category,
        pinned,
        origin: "user",
        sourceMessageIds: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    nextFactNumber: base.nextFactNumber + 1,
  };
}

/** Une correction manuelle fait du fait celui de l'utilisateur. */
export function editFact(
  memory: SceneMemory,
  id: string,
  changes: { text?: string; category?: MemoryCategory },
  now: string,
): SceneMemory {
  return {
    ...memory,
    facts: memory.facts.map((f) => {
      if (f.id !== id) return f;
      const text = changes.text === undefined ? f.text : cleanLine(changes.text);
      if (!text) return f;
      return {
        ...f,
        text,
        category: changes.category ?? f.category,
        origin: "user",
        updatedAt: now,
      };
    }),
  };
}

export function setFactPinned(
  memory: SceneMemory,
  id: string,
  pinned: boolean,
  now: string,
): SceneMemory {
  return {
    ...memory,
    facts: memory.facts.map((f) => (f.id === id ? { ...f, pinned, updatedAt: now } : f)),
  };
}

export function removeFact(memory: SceneMemory, id: string): SceneMemory {
  return { ...memory, facts: memory.facts.filter((f) => f.id !== id) };
}

/**
 * Des messages ont disparu (réplique modifiée, tour rejoué) : les faits
 * automatiques qui en dépendaient ne sont plus fondés. Les faits de
 * l'utilisateur restent, sans les sources disparues. L'état et les intrigues
 * sont oubliés dès qu'un fait tombe : la prochaine mise à jour les refait.
 */
export function rewindMemory(
  memory: SceneMemory,
  survivingMessageIds: ReadonlySet<string>,
): SceneMemory {
  let dropped = false;
  const facts: MemoryFact[] = [];
  for (const fact of memory.facts) {
    const lost = fact.sourceMessageIds.some((id) => !survivingMessageIds.has(id));
    if (!lost) {
      facts.push(fact);
    } else if (isProtected(fact)) {
      facts.push({
        ...fact,
        sourceMessageIds: fact.sourceMessageIds.filter((id) => survivingMessageIds.has(id)),
      });
    } else {
      dropped = true;
    }
  }
  return {
    ...memory,
    facts,
    state: dropped ? [] : memory.state,
    threads: dropped ? [] : memory.threads,
  };
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

/** Faits regroupés par catégorie, dans un ordre stable (épinglés en tête). */
export function groupFacts(
  facts: readonly MemoryFact[],
): { category: MemoryCategory; facts: MemoryFact[] }[] {
  return MEMORY_CATEGORIES.map((category) => ({
    category,
    facts: facts
      .filter((f) => f.category === category)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
  })).filter((group) => group.facts.length > 0);
}

/**
 * Version texte de la mémoire, pour les tâches annexes (analyse émotionnelle,
 * imprévus, critique) qui attendaient auparavant le résumé.
 */
export function memoryDigest(
  facts: readonly MemoryFact[],
  state: readonly string[],
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string | null {
  const labels = pack.memory.categoryLabels;
  const parts = groupFacts(facts).map(
    (group) =>
      `${pack.memory.heading(labels[group.category])}\n${group.facts.map((f) => `- ${f.text}`).join("\n")}`,
  );
  if (state.length > 0) {
    parts.push(`${pack.memory.heading(pack.memory.stateLabel)}\n${state.map((s) => `- ${s}`).join("\n")}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}
