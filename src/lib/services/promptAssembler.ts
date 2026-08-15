import type {
  EmotionalReaction,
  EmotionalState,
  Message,
  Persona,
  TemporalContext,
} from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import type { ChatMessage } from "./llmClient";
import { responseLengthInstruction } from "./inference";
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
  summary: string | null;
  recentMessages: Message[]; // du plus ancien au plus récent
  /** Situation de départ de la conversation, connue de tous les personnages. */
  sceneDescription?: string | null;
  contextTokens: number;
  reserveOutputTokens: number;
  scene?: SceneInput | null;
  /** Langue de jeu : c'est elle qui fixe la langue des répliques. */
  pack?: PromptPack;
};

export type AssembledPrompt = {
  system: string;
  messages: ChatMessage[];
  includedMessageCount: number;
  summaryIncluded: boolean;
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
  includeSummary: boolean,
): string {
  const { persona, summary } = input;
  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const a = pack.assembler;
  const parts: string[] = [];
  const userName =
    input.userName?.trim() ||
    input.scene?.userLabel?.trim() ||
    pack.scene.userLabel;
  const userGender = input.userGender ?? input.scene?.userGender ?? "neutral";

  parts.push(a.identity(persona.name, persona.systemPrompt.trim()));
  parts.push(a.humanInterlocutor(userName, userGender));

  if (persona.stableTraits.length > 0) {
    parts.push(a.stableTraits(persona.stableTraits));
  }

  const lengthInstruction = responseLengthInstruction(persona.maxOutputTokens, pack);
  if (lengthInstruction) {
    parts.push(a.responseLength(lengthInstruction));
  }

  parts.push(a.emotionalPlay());

  const scene = input.scene;
  if (scene && scene.otherNames.length > 0) {
    // Le trombinoscope est stable ; la consigne de destinataire change à
    // chaque tour et part donc dans le suffixe.
    parts.push(
      buildSceneBlock(
        {
          speakerName: scene.speakerName,
          speakerGender: scene.speakerGender,
          others: scene.others,
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

  if (includeSummary && summary) {
    parts.push(a.conversationSummary(summary));
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

  return volatileParts.join("\n\n");
}

/**
 * Assemble le prompt final dans un ordre déterministe en respectant le budget.
 * Le prompt de persona est toujours conservé ; le résumé vient ensuite ; les
 * messages récents remplissent le reste, du plus récent au plus ancien.
 * Le dernier message utilisateur n'est jamais tronqué.
 */
export function assemblePrompt(input: AssembleInput): AssembledPrompt {
  const pack = input.pack ?? DEFAULT_PROMPT_PACK;
  const volatileBlock = buildVolatileBlock(input);
  // Le bloc volatile occupe de la place et clôt la requête : il est réservé
  // sur le budget au même titre que la réponse attendue.
  const budget =
    input.contextTokens - input.reserveOutputTokens - estimateTokens(volatileBlock);
  const withSummary = buildSystemPrompt(input, true);
  const withoutSummary = buildSystemPrompt(input, false);

  let system = withSummary;
  let summaryIncluded = Boolean(input.summary);
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
    : usable.map((m) => ({ role: m.role, content: m.content }));
  const last = messages[messages.length - 1];
  const lastTokens = last ? estimateTokens(last.content) + 8 : 0;

  // Le système + le dernier message utilisateur doivent tenir, sinon erreur.
  if (estimateTokens(withSummary) + lastTokens > budget) {
    system = withoutSummary;
    summaryIncluded = false;
    if (estimateTokens(withoutSummary) + lastTokens > budget) {
      return {
        system: withoutSummary,
        messages: [],
        includedMessageCount: 0,
        summaryIncluded: false,
        estimatedTokens: estimateTokens(withoutSummary) + lastTokens,
        error: pack.assembler.contextTooLong,
      };
    }
  }

  let used = estimateTokens(system);
  const included: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateTokens(messages[i].content) + 8;
    if (used + cost > budget) break;
    included.unshift(messages[i]);
    used += cost;
  }

  // Le bloc volatile clôt la requête, après l'historique. Il est fusionné avec
  // le dernier message quand celui-ci vient de l'utilisateur, pour ne pas
  // produire deux tours `user` consécutifs — certains gabarits de chat
  // exigent l'alternance stricte.
  const tail: ChatMessage[] = [];
  if (volatileBlock) {
    const lastIncluded = included[included.length - 1];
    if (lastIncluded && lastIncluded.role === "user") {
      included[included.length - 1] = {
        role: "user",
        content: `${lastIncluded.content}\n\n${volatileBlock}`,
      };
    } else {
      tail.push({ role: "user", content: volatileBlock });
    }
    used += estimateTokens(volatileBlock);
  }

  return {
    system,
    messages: [{ role: "system", content: system }, ...included, ...tail],
    includedMessageCount: included.length,
    summaryIncluded,
    estimatedTokens: used,
    error: null,
  };
}
