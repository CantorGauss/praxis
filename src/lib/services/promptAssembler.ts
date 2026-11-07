import type {
  EmotionalReaction,
  EmotionalState,
  MemoryCategory,
  MemoryFact,
  Message,
  Persona,
  TemporalContext,
} from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import type { StagnationReason } from "../i18n/prompts/types";
import type { ChatMessage } from "./llmClient";
import { responseLengthInstruction } from "./inference";
import { publicText } from "./messageFormat";
import { rankByRelevance, recallPassages, type RecallDocument } from "./recall";
import {
  buildSceneBlock,
  renderTranscript,
  type AddresseeLabeller,
  type MessageLabeller,
  type SceneGender,
} from "./scene";

/** Estimation grossière : environ quatre caractères par token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Le marqueur de format d'un résumé est une donnée applicative : montré à un
 * modèle, il est recopié, voire « incrémenté » d'une réécriture à l'autre.
 * Toute version est retirée, y compris une version inventée par le modèle.
 */
export function stripSummaryMarkers(summary: string): string {
  return summary
    .replace(/^[ \t*]*\[(?:ACTIVE MEMORY|MÉMOIRE ACTIVE) v\d+\][ \t*]*(?:\r?\n|$)/gm, "")
    .trim();
}

/**
 * Présent uniquement quand la conversation réunit plusieurs personnages :
 * l'historique est alors réécrit du point de vue du locuteur.
 */
export type SceneInput = {
  speakerId: string;
  speakerName: string;
  speakerGender: SceneGender;
  otherNames: string[];
  /** Les autres personnages, avec leur identité publique et leur accord grammatical. */
  others: {
    name: string;
    gender: SceneGender;
    /** Courte description visible dans la fiche ; jamais le prompt interne. */
    description?: string | null;
  }[];
  /**
   * Personnages qui ont parlé mais ont quitté la scène. Leurs répliques
   * restent dans l'historique : sans cette liste, le locuteur continue de
   * leur répondre.
   */
  departedNames?: string[];
  userGender?: SceneGender;
  label: MessageLabeller;
  addresseeLabel?: AddresseeLabeller;
  userLabel?: string;
  /** À qui s'adresse le dernier message — voir `describeAddressing`. */
  addressing?: string | null;
};

export type AssembleInput = {
  persona: Persona;
  /** Identité explicite de l'humain, y compris hors scène de groupe. */
  userName?: string;
  userGender?: SceneGender;
  state: EmotionalState | null;
  /** Réaction au dernier événement, évaluée juste avant cette réponse. */
  immediateReaction?: EmotionalReaction | null;
  temporal: TemporalContext;
  /**
   * Mémoire de scène connue de ce personnage : faits qu'il a vu établir,
   * et l'état de la scène s'il a assisté à tout ce qu'elle couvre.
   */
  memory?: PromptMemory | null;
  /**
   * Messages vus par le personnage avant la fenêtre récente. Les passages en
   * rapport avec la réplique en cours y sont recherchés et rappelés tels quels.
   */
  archive?: Message[];
  coordination?: string;
  /** La scène tourne en rond : une consigne de relance clôt la requête. */
  stagnation?: StagnationReason | null;
  /** Invitation ponctuelle à glisser un aparté ; seulement en scène de groupe. */
  asideNudge?: boolean;
  recentMessages: Message[]; // du plus ancien au plus récent
  /**
   * Le locuteur a manqué une partie de la scène (arrivée tardive, absence) :
   * l'historique transmis est déjà limité à ce qu'il a vu.
   */
  missedEarlier?: boolean;
  /** Situation de départ de la conversation, connue de tous les personnages. */
  sceneDescription?: string | null;
  contextTokens: number;
  reserveOutputTokens: number;
  scene?: SceneInput | null;
  /** Langue de jeu : c'est elle qui fixe la langue des répliques. */
  pack?: PromptPack;
};

export type PromptMemory = {
  facts: MemoryFact[];
  state: string[];
  threads: string[];
};

/** Part du contexte que peut occuper le registre de faits. */
export const MEMORY_FACTS_CONTEXT_RATIO = 0.25;
/** Part du contexte réservée aux souvenirs retrouvés, et son plafond absolu. */
export const RECALL_CONTEXT_RATIO = 0.1;
export const RECALL_MAX_TOKENS = 1000;
/** Répliques récentes qui servent de requête pour retrouver les souvenirs. */
const RECALL_QUERY_WEIGHTS = [1, 1, 1.5, 2.5];

export type AssembledPrompt = {
  system: string;
  messages: ChatMessage[];
  includedMessageCount: number;
  memoryIncluded: boolean;
  /** Faits du registre effectivement transmis. */
  factCount: number;
  recalledPassageCount: number;
  estimatedTokens: number;
  error: string | null;
};

/**
 * Message système : uniquement ce qui ne change pas d'un tour à l'autre.
 *
 * Les serveurs locaux ne réutilisent leur cache d'attention que sur le
 * *préfixe commun* de deux requêtes successives. Tout ce qui varie à chaque
 * tour — l'état émotionnel, l'heure locale et ses minutes, la consigne de
 * destinataire — est donc sorti d'ici et placé **après** l'historique, par
 * `buildVolatileBlock`. Le mettre simplement en fin de message système ne
 * suffirait pas : le système précède l'historique, donc la divergence
 * invaliderait quand même le cache de toutes les répliques qui suivent.
 *
 * L'écart avec l'ordre décrit dans le brief est assumé : le contenu est le
 * même, seule la position des sections volatiles change.
 */
function buildSystemPrompt(
  input: AssembleInput,
  memoryBlocks: string[],
): string {
  const { persona } = input;
  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const a = pack.assembler;
  const parts: string[] = [];
  const userName =
    input.userName?.trim() ||
    input.scene?.userLabel?.trim() ||
    pack.scene.userLabel;
  const userGender = input.userGender ?? input.scene?.userGender ?? "neutral";

  // La fiche publique est montrée aux autres personnages ; sans elle, le
  // personnage ignore ce que tout le monde sait de lui et improvise ses
  // propres liens (« on se connaît depuis deux mois ? » face à une amie
  // d'enfance).
  const systemPrompt = persona.systemPrompt.trim();
  const description = persona.description?.trim() || null;
  const ownDescription =
    description && !systemPrompt.includes(description) ? description : null;
  parts.push(a.identity(persona.name, systemPrompt, ownDescription));
  parts.push(a.humanInterlocutor(userName, userGender));

  if (persona.stableTraits.length > 0) {
    parts.push(a.stableTraits(persona.stableTraits));
  }

  const lengthInstruction = responseLengthInstruction(persona.maxOutputTokens, pack);
  if (lengthInstruction) {
    parts.push(a.responseLength(lengthInstruction));
  }

  parts.push(a.emotionalPlay());
  parts.push(a.momentum());

  const scene = input.scene;
  if (scene && (scene.otherNames.length > 0 || scene.departedNames?.length)) {
    // Le trombinoscope est stable ; la consigne de destinataire change à
    // chaque tour et part donc dans le suffixe.
    parts.push(
      buildSceneBlock(
        {
          speakerName: scene.speakerName,
          speakerGender: scene.speakerGender,
          others: scene.others,
          departed: scene.departedNames,
          userName,
          userGender,
        },
        pack,
      ),
    );
  }

  // Décor commun : le même texte pour tous les personnages présents, c'est ce
  // qui leur donne une situation de départ partagée.
  const situation = input.sceneDescription?.trim();
  if (situation) {
    parts.push(a.startingSituation(situation));
  }

  // L'interface affiche déjà *ceci* en didascalie : le modèle doit connaître
  // la même convention, sinon il lit les actions comme des paroles.
  parts.push(a.writingConventions(userName, userGender));

  // Un aparté n'a de sens que s'il y a quelqu'un en scène pour ne pas l'entendre.
  if (scene && scene.otherNames.length > 0) {
    parts.push(a.asides());
  }

  parts.push(...memoryBlocks);

  if (input.missedEarlier) {
    parts.push(a.partialPresence());
  }

  return parts.join("\n\n");
}

/**
 * Tout ce qui change à chaque requête, transmis après l'historique pour ne
 * pas invalider le cache d'attention des messages qui précèdent.
 */
function buildVolatileBlock(input: AssembleInput): string {
  const { state, immediateReaction, temporal, scene } = input;
  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const a = pack.assembler;
  const moodLabels = pack.emotion.moodLabels;
  const volatileParts: string[] = [];

  if (immediateReaction) {
    volatileParts.push(
      a.immediateReaction({
        moodLabel: moodLabels[immediateReaction.mood],
        intensityPercent: Math.round(immediateReaction.intensity * 100),
        impulse: immediateReaction.impulse,
      }),
    );
  }

  if (state) {
    volatileParts.push(
      a.currentState({
        moodLabel: moodLabels[state.mood],
        valence: state.valence.toFixed(2),
        energy: state.energy.toFixed(2),
        warmth: state.warmth.toFixed(2),
        closeness: state.closeness.toFixed(2),
      }),
    );
  }

  volatileParts.push(
    a.temporalContext({
      localTime: temporal.localTime,
      weekday: temporal.weekday,
      dayPeriodLabel: pack.temporal.dayPeriodLabels[temporal.dayPeriod],
      elapsedLabel: temporal.elapsedLabel,
    }),
  );

  if (scene?.addressing) {
    volatileParts.push(a.thisTurn(scene.addressing));
  }

  if (input.coordination) volatileParts.push(input.coordination);

  if (input.stagnation) volatileParts.push(a.stagnation(input.stagnation));

  if (input.asideNudge && scene && scene.otherNames.length > 0) {
    volatileParts.push(a.asideNudge());
  }

  // Les petits modèles suivent parfois mieux les faits proches de la
  // génération que les mêmes faits placés tôt dans le système. La situation
  // reste dans le préfixe stable, mais ce rappel l'ancre aussi au moment exact
  // où la dernière réplique doit être interprétée.
  const situation = input.sceneDescription?.trim();
  if (situation) {
    volatileParts.push(a.sceneReminder(situation));
  }

  // Les faits que l'utilisateur a épinglés valent la fiche : ils sont
  // rappelés au plus près de la génération, là où ils pèsent le plus.
  const pinned = input.memory?.facts.filter((f) => f.pinned) ?? [];
  if (pinned.length > 0) {
    volatileParts.push(a.pinnedReminder(pinned.map((f) => f.text)));
  }

  // Même raison pour la fiche : une fois que le personnage s'est contredit
  // (« on se connaît depuis deux mois ? »), ses propres répliques pèsent plus
  // lourd que l'identité placée tout en haut. Le rappel clôt la requête.
  const description = input.persona.description?.trim();
  if (description) {
    volatileParts.push(a.identityReminder(input.persona.name, description));
  }

  return volatileParts.join("\n\n");
}

/** Requête de rappel : les dernières répliques, la plus récente pesant le plus. */
function recallQuery(messages: readonly ChatMessage[]): { text: string; weight: number }[] {
  const lastOnes = messages.slice(-RECALL_QUERY_WEIGHTS.length);
  const weights = RECALL_QUERY_WEIGHTS.slice(-lastOnes.length);
  return lastOnes.map((m, i) => ({ text: m.content, weight: weights[i] }));
}

/**
 * Les blocs de mémoire du message système. Si le registre dépasse sa part
 * du contexte, on garde les faits épinglés puis les plus pertinents pour la
 * scène en cours, dans leur ordre d'origine.
 */
function buildMemoryBlocks(
  memory: PromptMemory | null | undefined,
  query: { text: string; weight: number }[],
  factBudget: number,
  pack: PromptPack,
): { blocks: string[]; factCount: number } {
  if (!memory) return { blocks: [], factCount: 0 };
  const a = pack.assembler;
  const blocks: string[] = [];
  let facts = memory.facts;
  let partial = false;

  const cost = (list: readonly MemoryFact[]) =>
    list.reduce((acc, f) => acc + estimateTokens(f.text) + 2, 0);
  if (cost(facts) > factBudget) {
    partial = true;
    const scores = rankByRelevance(
      facts.map((f) => f.text),
      query,
    );
    const keep = new Set<number>();
    let used = 0;
    facts.forEach((f, i) => {
      if (f.pinned) {
        keep.add(i);
        used += estimateTokens(f.text) + 2;
      }
    });
    // À pertinence égale, le fait le plus récent l'emporte.
    const order = facts
      .map((_, i) => i)
      .filter((i) => !keep.has(i))
      .sort((x, y) => scores[y] - scores[x] || y - x);
    for (const i of order) {
      const c = estimateTokens(facts[i].text) + 2;
      if (used + c > factBudget) continue;
      keep.add(i);
      used += c;
    }
    facts = facts.filter((_, i) => keep.has(i));
  }

  if (facts.length > 0) {
    const labels: Record<MemoryCategory, string> = pack.memory.categoryLabels;
    const pinned = facts.filter((f) => f.pinned).map((f) => f.text);
    const groups = (Object.keys(labels) as MemoryCategory[])
      .map((category) => ({
        label: labels[category],
        facts: facts.filter((f) => !f.pinned && f.category === category).map((f) => f.text),
      }))
      .filter((g) => g.facts.length > 0);
    blocks.push(a.sceneMemory({ pinned, groups, partial }));
  }
  if (memory.state.length > 0 || memory.threads.length > 0) {
    blocks.push(a.sceneState({ state: memory.state, threads: memory.threads }));
  }
  return { blocks, factCount: facts.length };
}

/**
 * Assemble le prompt final dans un ordre déterministe en respectant le budget.
 * Le prompt de persona est toujours conservé ; la mémoire de scène vient
 * ensuite ; les messages récents remplissent le reste, du plus récent au plus
 * ancien ; les souvenirs retrouvés dans les messages plus anciens closent la
 * requête. Le dernier message n'est jamais tronqué.
 */
export function assemblePrompt(input: AssembleInput): AssembledPrompt {
  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const volatileBlock = buildVolatileBlock(input);

  const usable = input.recentMessages.filter(
    (m) => m.content.trim().length > 0 && m.status !== "error",
  );
  // En scène de groupe, l'historique est réécrit du point de vue du locuteur :
  // ses répliques restent `assistant`, les autres deviennent des blocs nommés.
  const messages: ChatMessage[] = input.scene
    ? renderTranscript(
        usable,
        input.scene.speakerId,
        input.scene.label,
        input.scene.addresseeLabel,
        pack,
      )
    : usable
        // En tête-à-tête, l'aparté de l'utilisateur reste pour le public.
        .map((m) => ({
          role: m.role,
          content: m.role === "user" ? publicText(m.content) : m.content,
        }))
        .filter((m) => m.content.trim().length > 0);
  const last = messages[messages.length - 1];
  const lastTokens = last ? estimateTokens(last.content) + 8 : 0;
  const query = recallQuery(messages);

  // Les souvenirs ne sont cherchés qu'au-delà de ce qui est transmis en clair ;
  // leur place est réservée d'avance, comme celle de la réponse.
  const archive = (input.archive ?? []).filter(
    (m) => m.content.trim().length > 0 && m.status !== "error",
  );
  const recallBudget = Math.min(
    RECALL_MAX_TOKENS,
    Math.floor(input.contextTokens * RECALL_CONTEXT_RATIO),
  );
  // Le bloc volatile occupe de la place et clôt la requête : il est réservé
  // sur le budget au même titre que la réponse attendue.
  const baseBudget =
    input.contextTokens - input.reserveOutputTokens - estimateTokens(volatileBlock);
  const budget = baseBudget - (archive.length > 0 ? recallBudget : 0);

  const memory = buildMemoryBlocks(
    input.memory,
    query,
    Math.floor(input.contextTokens * MEMORY_FACTS_CONTEXT_RATIO),
    pack,
  );
  const withMemory = buildSystemPrompt(input, memory.blocks);
  const withoutMemory = buildSystemPrompt(input, []);

  let system = withMemory;
  let memoryIncluded = memory.blocks.length > 0;
  let factCount = memory.factCount;

  // Le système + le dernier message doivent tenir, sinon erreur.
  if (estimateTokens(withMemory) + lastTokens > budget) {
    system = withoutMemory;
    memoryIncluded = false;
    factCount = 0;
    if (estimateTokens(withoutMemory) + lastTokens > baseBudget) {
      return {
        system: withoutMemory,
        messages: [],
        includedMessageCount: 0,
        memoryIncluded: false,
        factCount: 0,
        recalledPassageCount: 0,
        estimatedTokens: estimateTokens(withoutMemory) + lastTokens,
        error: pack.assembler.contextTooLong,
      };
    }
  }

  let used = estimateTokens(system);
  const included: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateTokens(messages[i].content) + 8;
    // Le dernier message passe toujours ; la réserve des souvenirs lui cède la place.
    const limit = i === messages.length - 1 ? baseBudget : budget;
    if (used + cost > limit) break;
    included.unshift(messages[i]);
    used += cost;
  }

  // Souvenirs : archive et répliques récentes qui n'ont pas tenu dans le budget.
  const label =
    input.scene?.label ??
    ((m: Message) =>
      m.role === "user"
        ? input.userName?.trim() || pack.scene.userLabel
        : (m.personaName ?? input.persona.name));
  const speakerId = input.scene?.speakerId ?? input.persona.id;
  const documents: RecallDocument[] = archive
    .map((m, order) => ({
      order,
      // Ses propres apartés, le personnage s'en souvient ; pas de ceux des autres.
      text: pack.memory.messageLine(
        label(m),
        m.personaId === speakerId ? m.content : publicText(m.content),
      ),
    }))
    .filter((d) => publicText(d.text).trim().length > 0);
  const dropped = messages.slice(0, messages.length - included.length);
  dropped.forEach((m, i) => documents.push({ order: archive.length + i, text: m.content }));
  const remaining = Math.max(0, baseBudget - used);
  const passages = recallPassages({
    documents,
    query,
    budgetTokens: Math.min(recallBudget, remaining),
    estimateTokens,
  });

  const tailBlock = [
    passages.length > 0 ? pack.assembler.recalledPassages(passages) : "",
    volatileBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Le bloc volatile clôt la requête, après l'historique. Il est fusionné avec
  // le dernier message quand celui-ci vient de l'utilisateur, pour ne pas
  // produire deux tours `user` consécutifs — certains gabarits de chat
  // exigent l'alternance stricte.
  const tail: ChatMessage[] = [];
  if (tailBlock) {
    const lastIncluded = included[included.length - 1];
    if (lastIncluded && lastIncluded.role === "user") {
      included[included.length - 1] = {
        role: "user",
        content: `${lastIncluded.content}\n\n${tailBlock}`,
      };
    } else {
      tail.push({ role: "user", content: tailBlock });
    }
    used += estimateTokens(tailBlock);
  }

  return {
    system,
    messages: [{ role: "system", content: system }, ...included, ...tail],
    includedMessageCount: included.length,
    memoryIncluded,
    factCount,
    recalledPassageCount: passages.length,
    estimatedTokens: used,
    error: null,
  };
}
