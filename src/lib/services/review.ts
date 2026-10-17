import type { ConnectionTarget, Message, Mood } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import { chatCompletion, noThinkingRequestParameters } from "./llmClient";
import { countAsides, publicText, splitActions } from "./messageFormat";
import type { MessageLabeller, Participant } from "./scene";

/**
 * Baisser le rideau : la critique du lendemain et les Molières de la soirée.
 *
 * Les Molières sont calculés ici, sans modèle, à partir de ce que la scène a
 * déjà enregistré — humeurs figées, intentions, accords, apartés. La critique,
 * elle, est écrite par le modèle ; comme partout ailleurs, sa réponse n'est
 * jamais crue sur parole et un échec ne casse rien.
 */

/** En dessous, la scène n'a pas encore assez joué pour être critiquée. */
export const MIN_LINES_FOR_REVIEW = 4;

/** Répliques récentes lues par le critique. */
const REVIEW_CONTEXT_MESSAGES = 40;
/** Au-delà, une réplique est tronquée dans ce que lit le critique. */
const REVIEW_LINE_CHARS = 400;
/** Une citation de palmarès reste une citation, pas un paragraphe. */
const QUOTE_CHARS = 110;

export type AwardId =
  | "chatterbox"
  | "volcano"
  | "drama"
  | "sunshine"
  | "diplomat"
  | "contrarian"
  | "yesBut"
  | "curious"
  | "whisperer"
  | "wallflower"
  | "twist";

export type SceneAward = {
  id: AwardId;
  /** Lauréats ex aequo ; vide pour le prix du coup de théâtre, qui revient à la scène. */
  winnerIds: string[];
  /** Le chiffre qui justifie le prix (mots, objections, apartés…). */
  count: number;
  /** Une réplique ou une didascalie à citer, quand le prix en mérite une. */
  quote: string | null;
};

export type SceneStats = {
  lines: number;
  narrations: number;
  twists: number;
  asides: number;
};

/** Seuil d'intensité à partir duquel une humeur mérite un prix. */
const AWARD_INTENSITY = 0.45;

const MOOD_AWARDS: { id: AwardId; moods: Mood[] }[] = [
  { id: "volcano", moods: ["angry", "annoyed", "disgusted"] },
  { id: "drama", moods: ["shocked", "sad", "afraid", "surprised"] },
  { id: "sunshine", moods: ["joyful"] },
];

/** Ce qui se cite d'une réplique : la parole d'abord, le geste à défaut. */
function quote(text: string): string {
  const heard = publicText(text) || text;
  const spoken = splitActions(heard)
    .filter((segment) => segment.kind === "speech")
    .map((segment) => segment.text)
    .join(" ");
  const clean =
    spoken.replace(/\s+/g, " ").trim() ||
    heard.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= QUOTE_CHARS) return clean;
  const cut = clean.slice(0, QUOTE_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Les répliques des personnages, terminées et non vides. */
function characterLines(messages: Message[]): (Message & { personaId: string })[] {
  return messages.filter(
    (m): m is Message & { personaId: string } =>
      m.kind === "speech" &&
      m.role === "assistant" &&
      Boolean(m.personaId) &&
      m.status !== "error" &&
      m.content.trim().length > 0,
  );
}

export function sceneStats(messages: Message[]): SceneStats {
  const narrations = messages.filter((m) => m.kind === "narration");
  return {
    lines: messages.filter(
      (m) => m.kind === "speech" && m.status !== "error" && m.content.trim(),
    ).length,
    narrations: narrations.length,
    twists: narrations.filter((m) => m.role === "assistant").length,
    asides: messages.reduce((sum, m) => sum + countAsides(m.content), 0),
  };
}

/** Lauréats d'un décompte : tous ceux qui atteignent le maximum, s'il dépasse le seuil. */
function leaders(counts: Map<string, number>, minimum: number): { ids: string[]; count: number } | null {
  let best = 0;
  for (const value of counts.values()) best = Math.max(best, value);
  if (best < minimum) return null;
  return {
    ids: [...counts].filter(([, value]) => value === best).map(([id]) => id),
    count: best,
  };
}

/**
 * Palmarès de la scène. Seuls les personnages qui ont parlé concourent ; un
 * prix sans lauréat crédible n'est pas décerné plutôt que donné au hasard.
 *
 * `cast` : la distribution à considérer, dans l'ordre de la scène. Un
 * personnage sorti en cours de route concourt encore pour ce qu'il a dit.
 */
export function computeAwards(messages: Message[], cast: Participant[]): SceneAward[] {
  const lines = characterLines(messages).filter((m) => cast.some((p) => p.id === m.personaId));
  if (lines.length === 0) return [];
  const awards: SceneAward[] = [];
  const tally = () => new Map<string, number>(cast.map((p) => [p.id, 0]));
  const add = (map: Map<string, number>, id: string, n = 1) =>
    map.set(id, (map.get(id) ?? 0) + n);

  const wordCounts = tally();
  const lineCounts = tally();
  const questions = tally();
  const asides = tally();
  const agreements = tally();
  const objections = tally();
  const conditionals = tally();

  for (const m of lines) {
    const heard = publicText(m.content);
    add(wordCounts, m.personaId, words(heard));
    add(lineCounts, m.personaId);
    add(asides, m.personaId, countAsides(m.content));
    add(questions, m.personaId, (heard.match(/\?/g) ?? []).length > 0 ? 1 : 0);
    const interaction = m.interaction;
    if (!interaction) continue;
    if (interaction.intent === "objection") add(objections, m.personaId);
    for (const response of interaction.responses) {
      if (response.stance === "agree") add(agreements, m.personaId);
      else if (response.stance === "disagree") add(objections, m.personaId);
      else add(conditionals, m.personaId);
    }
    if (interaction.intent === "conditional" && interaction.responses.length === 0) {
      add(conditionals, m.personaId);
    }
  }

  // Le prix du bavardage n'a de sens que s'il y a de la concurrence.
  const speakers = [...lineCounts.values()].filter((n) => n > 0).length;
  if (speakers > 1) {
    const chatty = leaders(wordCounts, 1);
    if (chatty) awards.push({ id: "chatterbox", winnerIds: chatty.ids.slice(0, 1), count: chatty.count, quote: null });
  }

  // Prix d'humeur : la réplique la plus intense de la famille d'humeurs.
  for (const { id, moods } of MOOD_AWARDS) {
    let best: (typeof lines)[number] | null = null;
    for (const m of lines) {
      const r = m.reaction;
      if (!r || !moods.includes(r.mood) || r.intensity < AWARD_INTENSITY) continue;
      if (!best || r.intensity > (best.reaction?.intensity ?? 0)) best = m;
    }
    if (best) {
      awards.push({
        id,
        winnerIds: [best.personaId],
        count: Math.round((best.reaction?.intensity ?? 0) * 100),
        quote: quote(best.content),
      });
    }
  }

  const counted: [AwardId, Map<string, number>, number][] = [
    ["diplomat", agreements, 2],
    ["contrarian", objections, 2],
    ["yesBut", conditionals, 1],
    ["curious", questions, 3],
    ["whisperer", asides, 1],
  ];
  for (const [id, counts, minimum] of counted) {
    const won = leaders(counts, minimum);
    if (won) awards.push({ id, winnerIds: won.ids, count: won.count, quote: null });
  }

  // La plante verte : quelqu'un qui a bien moins parlé que les autres, dans
  // une scène assez peuplée pour qu'on le remarque.
  if (cast.length >= 3) {
    const counts = [...lineCounts];
    const most = Math.max(...counts.map(([, n]) => n));
    const least = Math.min(...counts.map(([, n]) => n));
    if (most >= 4 && least * 3 <= most) {
      const quietest = counts.filter(([, n]) => n === least).map(([id]) => id);
      if (quietest.length < cast.length) {
        awards.push({ id: "wallflower", winnerIds: quietest.slice(0, 1), count: least, quote: null });
      }
    }
  }

  // Le coup de théâtre : le dernier imprévu écrit par le metteur en scène.
  const twist = [...messages].reverse().find((m) => m.kind === "narration" && m.role === "assistant");
  if (twist) awards.push({ id: "twist", winnerIds: [], count: 0, quote: quote(twist.content) });

  return awards;
}

// ---------------------------------------------------------------------------
// La critique
// ---------------------------------------------------------------------------

export type SceneReview = {
  newspaper: string | null;
  headline: string | null;
  /** De 1 à 5 ; null quand le critique n'a pas noté. */
  stars: number | null;
  body: string;
};

function field(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * Lit la réponse du critique. On attend du JSON, mais un petit modèle écrit
 * volontiers sa critique en prose : on la garde alors telle quelle, sans
 * journal ni étoiles, plutôt que de la jeter.
 *
 * Exporté pour les tests.
 */
export function parseReview(raw: string): SceneReview | null {
  const text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const data = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      const body = field(data.review ?? data.body ?? data.critique, 900);
      if (body) {
        const rawStars = Number(data.stars ?? data.rating ?? data.etoiles);
        return {
          newspaper: field(data.newspaper ?? data.journal, 60),
          headline: field(data.headline ?? data.title ?? data.titre, 140),
          stars: Number.isFinite(rawStars) ? Math.min(5, Math.max(1, Math.round(rawStars))) : null,
          body,
        };
      }
    } catch {
      // Pas du JSON valide : on retombe sur la prose.
    }
  }
  const prose = field(text.replace(/[{}"]/g, " "), 900);
  return prose && prose.length >= 40
    ? { newspaper: null, headline: null, stars: null, body: prose }
    : null;
}

export type ReviewInput = {
  connection: ConnectionTarget;
  modelId: string;
  /** Toute la distribution, présents et sortis, avec leur identité publique. */
  cast: { name: string; description: string | null }[];
  sceneDescription: string | null;
  summary: string | null;
  messages: Message[];
  label: MessageLabeller;
  userName: string;
  extraParameters?: Record<string, unknown>;
  pack?: PromptPack;
};

/**
 * La critique du lendemain. Le critique est dans la salle : il entend les
 * apartés, et ne se prive pas de les commenter.
 */
export async function writeReview(input: ReviewInput): Promise<SceneReview | null> {
  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const roster = input.cast
    .map((p) => (p.description ? `- ${p.name} : ${p.description}` : `- ${p.name}`))
    .join("\n");
  const transcript = input.messages
    .filter((m) => m.content.trim() && m.status !== "error")
    .slice(-REVIEW_CONTEXT_MESSAGES)
    .map((m) => {
      const content =
        m.content.length > REVIEW_LINE_CHARS
          ? `${m.content.slice(0, REVIEW_LINE_CHARS)}…`
          : m.content;
      return m.kind === "narration"
        ? pack.director.narrationLine(content)
        : pack.director.transcriptLine(input.label(m), content);
    })
    .join("\n");

  try {
    const raw = await chatCompletion(
      { ...input.connection, timeoutMs: Math.max(input.connection.timeoutMs, 60_000) },
      {
        ...noThinkingRequestParameters(input.connection, input.extraParameters ?? {}),
        model: input.modelId,
        temperature: 0.9,
        max_tokens: 500,
        messages: [
          { role: "system", content: pack.review.system({ userName: input.userName }) },
          {
            role: "user",
            content: pack.review.user({
              situation: input.sceneDescription?.trim() || null,
              summary: input.summary?.trim() || null,
              roster,
              transcript,
            }),
          },
        ],
      },
    );
    return parseReview(raw);
  } catch {
    return null;
  }
}
