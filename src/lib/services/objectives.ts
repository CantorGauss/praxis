import type { ConnectionTarget, Message, Persona, SceneObjective } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import { publicText } from "./messageFormat";
import type { MessageLabeller } from "./scene";

/**
 * Objectifs de scène : ce que chaque personnage veut obtenir ici, et ce qu'il cache.
 *
 * Sans eux, tout est réaction à la dernière réplique : les personnages
 * « font avancer » la scène en ajoutant n'importe quoi de neuf, et c'est
 * l'utilisateur qui porte seul la direction. Un objectif contrarié par celui
 * d'un autre donne à chacun une raison de reprendre la parole, quand personne
 * ne mène.
 *
 * L'objectif est écrit une fois, au début de la scène ou à l'entrée du
 * personnage, puis reste stable : il fait partie du préfixe du prompt. Un
 * objectif modifié par l'utilisateur n'est plus jamais réécrit automatiquement.
 */

/** Répliques récentes lues par l'auteur, quand la scène a déjà commencé. */
const OBJECTIVE_CONTEXT_MESSAGES = 12;
/** Extrait du prompt interne transmis à l'auteur : assez pour le caractère. */
const PRIVATE_PROMPT_CHARS = 500;
/** Un objectif reste une phrase. */
export const MAX_OBJECTIVE_CHARS = 300;

export type ObjectiveDraft = { personaId: string; goal: string; secret: string | null };

/** Lecture tolérante de la colonne : une valeur illisible vaut « aucun objectif ». */
export function decodeObjectives(raw: string | null): SceneObjective[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): SceneObjective[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const e = entry as Record<string, unknown>;
      if (typeof e.personaId !== "string" || typeof e.goal !== "string") return [];
      return [
        {
          personaId: e.personaId,
          goal: e.goal,
          secret: typeof e.secret === "string" && e.secret.trim() ? e.secret : null,
          origin: e.origin === "user" ? "user" : "auto",
          createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
          updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : "",
        },
      ];
    });
  } catch {
    return [];
  }
}

export function encodeObjectives(objectives: SceneObjective[]): string | null {
  return objectives.length ? JSON.stringify(objectives) : null;
}

/**
 * L'objectif qui joue pour ce personnage. Un objectif vidé à la main est une
 * décision — « pas d'objectif » — et ne joue pas.
 */
export function activeObjective(
  objectives: readonly SceneObjective[],
  personaId: string,
): SceneObjective | null {
  const found = objectives.find((o) => o.personaId === personaId);
  return found && found.goal.trim() ? found : null;
}

/** Personnages présents qui n'ont encore reçu aucun objectif, même vide. */
export function missingObjectives(
  objectives: readonly SceneObjective[],
  participantIds: readonly string[],
): string[] {
  return participantIds.filter((id) => !objectives.some((o) => o.personaId === id));
}

/**
 * Remplace les objectifs automatiques des personnages concernés. Ceux qu'a
 * écrits l'utilisateur restent, sauf `force` (il redemande explicitement).
 */
export function mergeObjectives(
  existing: readonly SceneObjective[],
  drafts: readonly ObjectiveDraft[],
  now: string,
  force = false,
): SceneObjective[] {
  const result = [...existing];
  for (const draft of drafts) {
    const index = result.findIndex((o) => o.personaId === draft.personaId);
    const previous = index >= 0 ? result[index] : null;
    if (previous?.origin === "user" && !force) continue;
    const next: SceneObjective = {
      personaId: draft.personaId,
      goal: draft.goal,
      secret: draft.secret,
      origin: "auto",
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };
    if (index >= 0) result[index] = next;
    else result.push(next);
  }
  return result;
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/^["«“]+|["»”]+$/g, "").trim();
  if (clean.length <= MAX_OBJECTIVE_CHARS) return clean;
  const cut = clean.slice(0, MAX_OBJECTIVE_CHARS);
  const end = cut.lastIndexOf(" ");
  return `${(end > 40 ? cut.slice(0, end) : cut).trimEnd()}…`;
}

const NAME_KEYS = ["name", "nom", "character", "personnage"];
const GOAL_KEYS = ["goal", "objectif", "objective", "but"];
const SECRET_KEYS = ["secret"];

function pick(entry: Record<string, unknown>, keys: string[]): string | null {
  for (const key of Object.keys(entry)) {
    if (keys.includes(key.toLowerCase()) && typeof entry[key] === "string") {
      return entry[key] as string;
    }
  }
  return null;
}

/**
 * Objectifs lisibles d'une réponse libre. Seuls les personnages demandés sont
 * retenus, une fois chacun ; le reste est ignoré plutôt que deviné.
 *
 * Exporté pour les tests.
 */
export function parseObjectives(
  raw: string,
  wanted: readonly { id: string; name: string }[],
): ObjectiveDraft[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const drafts: ObjectiveDraft[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const name = pick(record, NAME_KEYS)?.trim().toLowerCase();
    const goal = clip(pick(record, GOAL_KEYS) ?? "");
    if (!name || !goal) continue;
    const persona = wanted.find((p) => p.name.trim().toLowerCase() === name);
    if (!persona || drafts.some((d) => d.personaId === persona.id)) continue;
    const secret = clip(pick(record, SECRET_KEYS) ?? "");
    drafts.push({ personaId: persona.id, goal, secret: secret || null });
  }
  return drafts;
}

export type ObjectiveInput = {
  connection: ConnectionTarget;
  modelId: string;
  /** Toute la distribution présente : l'auteur doit voir contre qui il écrit. */
  cast: Pick<Persona, "id" | "name" | "description" | "systemPrompt">[];
  /** Ceux à qui il faut donner un objectif maintenant. */
  forIds: string[];
  /** Objectifs déjà attribués aux autres, que le nouveau doit contrarier. */
  existing: readonly SceneObjective[];
  sceneDescription: string | null;
  summary: string | null;
  recentMessages: Message[];
  label: MessageLabeller;
  userName: string;
  extraParameters?: Record<string, unknown>;
  pack?: PromptPack;
};

/** Objectifs pour `forIds`, ou une liste vide si le modèle n'a rien d'utilisable. */
export async function inventObjectives(input: ObjectiveInput): Promise<ObjectiveDraft[]> {
  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const o = pack.objectives;
  const wanted = input.cast.filter((p) => input.forIds.includes(p.id));
  if (wanted.length === 0) return [];

  const roster = input.cast
    .map((p) => {
      const description = p.description?.trim();
      const privatePrompt = p.systemPrompt.trim().slice(0, PRIVATE_PROMPT_CHARS);
      return o.rosterLine(p.name, description || null, privatePrompt || null);
    })
    .join("\n");
  const assigned = input.existing
    .filter((obj) => !input.forIds.includes(obj.personaId) && obj.goal.trim())
    .flatMap((obj) => {
      const persona = input.cast.find((p) => p.id === obj.personaId);
      return persona ? [o.assignedLine(persona.name, obj.goal)] : [];
    })
    .join("\n");
  const transcript = input.recentMessages
    .slice(-OBJECTIVE_CONTEXT_MESSAGES)
    .filter((m) => publicText(m.content).trim())
    .map((m) =>
      m.kind === "narration"
        ? pack.director.narrationLine(m.content)
        : pack.director.transcriptLine(input.label(m), publicText(m.content)),
    )
    .join("\n");

  try {
    const raw = await chatCompletion(
      { ...input.connection, timeoutMs: Math.min(input.connection.timeoutMs, 60_000) },
      {
        ...noThinkingRequestParameters(input.connection, input.extraParameters ?? {}),
        model: input.modelId,
        temperature: 0.9,
        max_tokens: 140 * wanted.length + 80,
        messages: [
          { role: "system", content: o.system({ userName: input.userName }) },
          {
            role: "user",
            content: o.user({
              situation: input.sceneDescription?.trim() || null,
              summary: input.summary,
              roster,
              assigned: assigned || null,
              transcript: transcript || null,
              names: wanted.map((p) => p.name),
            }),
          },
        ],
      },
    );
    return parseObjectives(raw, wanted);
  } catch {
    return [];
  }
}
