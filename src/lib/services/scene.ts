import type { Gender, Message } from "../types";
import { DEFAULT_PROMPT_PACK, type PromptPack } from "../i18n/prompts";
import type { ChatMessage } from "./llmClient";

/**
 * Conversations à plusieurs personnages.
 *
 * L'API compatible OpenAI ne connaît que `user` et `assistant` : un message
 * `assistant` ne peut donc pas désigner à lui seul lequel des personnages a
 * parlé. Avant chaque requête, l'historique est réécrit du point de vue du
 * personnage qui va prendre la parole :
 *
 * - ses propres messages deviennent `assistant`, sans préfixe ;
 * - tout le reste (utilisateur et autres personnages) devient `user`, préfixé
 *   du nom du locuteur, les blocs consécutifs étant fusionnés.
 *
 * Chaque personnage garde ainsi son prompt, ses souvenirs, son état émotionnel
 * et son modèle : une requête par locuteur, en série.
 */

/**
 * Nom par défaut de l'utilisateur dans les transcriptions. Il est
 * remplaçable dans les réglages : si les personas parlent de « Jeff » alors
 * que le transcript affiche « Utilisateur », les personnages ne peuvent pas
 * deviner qu'il s'agit de la même personne.
 */
export function userLabel(pack: PromptPack = DEFAULT_PROMPT_PACK): string {
  return pack.scene.userLabel;
}

/**
 * Une didascalie n'est la parole de personne : elle est transmise sans nom de
 * locuteur, sous une forme reconnaissable.
 */
export function formatNarration(
  text: string,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  return pack.scene.narration(text);
}

/** Didascalies proposées par défaut lors d'une entrée ou d'une sortie. */
export function defaultEntranceText(
  name: string,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  return pack.scene.entrance(name);
}

export function defaultExitText(
  name: string,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  return pack.scene.exit(name);
}

/** Nom de repli quand la persona d'un ancien message n'existe plus. */
export function unknownSpeakerLabel(
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  return pack.scene.unknownSpeakerLabel;
}

export type Participant = { id: string; name: string };

/**
 * Genre grammatical d'un intervenant, tel qu'annoncé dans le trombinoscope.
 * Même chose que `Gender` : l'alias garde les signatures de scène lisibles.
 */
export type SceneGender = Gender;

/** Retourne le nom affiché du locuteur d'un message. */
export type MessageLabeller = (message: Message) => string;

/**
 * Retourne à qui une réplique était adressée, du point de vue du personnage
 * qui la lit : « toi », un nom, ou null si elle s'adressait à la cantonade.
 */
export type AddresseeLabeller = (message: Message) => string | null;

/**
 * Réécrit l'historique du point de vue d'un locuteur.
 * Les messages vides sont ignorés ; l'ordre chronologique est conservé.
 */
export function renderTranscript(
  messages: Message[],
  speakerId: string,
  label: MessageLabeller,
  addressee?: AddresseeLabeller,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): ChatMessage[] {
  const rendered: ChatMessage[] = [];
  let buffer: string[] = [];
  let speakers = new Set<string>();

  const flush = () => {
    if (buffer.length > 0) {
      // Les rôles de l'API ne distinguent pas les locuteurs : un bloc qui en
      // rassemble plusieurs doit l'annoncer, sinon le modèle les confond.
      const body = buffer.join("\n\n");
      rendered.push({
        role: "user",
        content:
          speakers.size > 1 ? `${pack.scene.multiSpeakerHeader}\n${body}` : body,
      });
      buffer = [];
      speakers = new Set();
    }
  };

  for (const message of messages) {
    if (!message.content.trim()) continue;
    if (message.kind === "narration") {
      // Sans nom de locuteur : la didascalie ne compte pas comme un intervenant.
      buffer.push(pack.scene.narration(message.content));
    } else if (message.personaId === speakerId) {
      flush();
      rendered.push({ role: "assistant", content: message.content });
    } else {
      const name = label(message);
      speakers.add(name);
      // Le destinataire est annoté : sans lui, le « tu » d'une réplique
      // transmise n'a pas de référent, et celui qui la lit se croit visé.
      const to = addressee?.(message) ?? null;
      buffer.push(pack.scene.transcriptLine(name, to, message.content));
    }
  }
  flush();
  return rendered;
}

export type SceneBlockOptions = {
  speakerName: string;
  speakerGender?: SceneGender;
  /** Les autres personnages présents, avec leur identité publique. */
  others: {
    name: string;
    gender: SceneGender;
    /** Une ligne issue de la fiche, distincte du prompt de personnalité. */
    description?: string | null;
  }[];
  userName?: string;
  userGender?: SceneGender;
  /** À qui s'adresse le dernier message ; calculé par le directeur. */
  addressing?: string | null;
};

/**
 * Section [SCÈNE] ajoutée au prompt système dès qu'il y a plusieurs
 * personnages. Le trombinoscope nominatif est la partie essentielle : sans
 * lui, un personnage ne distingue pas l'humain des autres personnages et
 * fusionne ses interlocuteurs en un seul « tu ».
 */
export function buildSceneBlock(
  options: SceneBlockOptions,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  const block = pack.scene.sceneBlock({
    speakerName: options.speakerName,
    speakerGender: options.speakerGender ?? "neutral",
    others: options.others,
    userName: options.userName ?? pack.scene.userLabel,
    userGender: options.userGender ?? "neutral",
  });
  return options.addressing ? `${block}\n${options.addressing}` : block;
}

/**
 * Séquences d'arrêt empêchant le modèle d'écrire la réplique d'un autre.
 * Limitées à quatre : c'est le maximum accepté par la plupart des serveurs.
 */
export function speakerStopSequences(
  otherNames: string[],
  userName?: string,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string[] {
  const names = [...otherNames, userName ?? pack.scene.userLabel];
  const unique = names.filter((n, i) => n && names.indexOf(n) === i);
  return unique.slice(0, 4).map((name) => pack.scene.speakerStopSequence(name));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Retire un préfixe de nom que le modèle aurait ajouté malgré la consigne
 * (« Anna : bonjour », « **Anna :** bonjour »).
 */
export function stripSpeakerPrefix(content: string, speakerName: string): string {
  const name = escapeRegExp(speakerName.trim());
  if (!name) return content;
  // Tolère les décorations markdown : « Anna : », « **Anna :** », « *Anna* : ».
  const pattern = new RegExp(
    `^\\s*\\*{0,2}\\s*${name}\\s*\\*{0,2}\\s*[::]\\s*\\*{0,2}\\s*`,
    "i",
  );
  return content.replace(pattern, "");
}

/**
 * Coupe la réponse si le modèle enchaîne sur la réplique d'un autre locuteur.
 * Filet de sécurité appliqué à la fin du streaming, jamais pendant.
 */
export function truncateAtForeignSpeaker(
  content: string,
  otherNames: string[],
  userName: string = DEFAULT_PROMPT_PACK.scene.userLabel,
): string {
  const names = [...otherNames, userName].filter(Boolean).map(escapeRegExp);
  if (names.length === 0) return content;
  // Un nom suivi de deux-points en début de ligne = le modèle prend un autre rôle.
  const pattern = new RegExp(
    `\\n\\s*\\*{0,2}\\s*(?:${names.join("|")})\\s*\\*{0,2}\\s*[::]`,
    "i",
  );
  const match = pattern.exec(content);
  return match ? content.slice(0, match.index).trimEnd() : content;
}

/**
 * Nettoyage complet d'une réponse de personnage dans une scène de groupe.
 *
 * Une étiquette d'un autre locuteur en tout début de réponse est seulement
 * retirée, pas tronquée : couper produirait un message vide, alors que le
 * texte qui suit reste la seule réponse dont on dispose.
 */
export function cleanSpeakerReply(
  content: string,
  speakerName: string,
  otherNames: string[],
  userName: string = DEFAULT_PROMPT_PACK.scene.userLabel,
): string {
  let cleaned = stripSpeakerPrefix(content, speakerName);
  for (const name of [...otherNames, userName]) {
    const stripped = stripSpeakerPrefix(cleaned, name);
    if (stripped !== cleaned) {
      cleaned = stripped;
      break;
    }
  }
  return truncateAtForeignSpeaker(cleaned, otherNames, userName).trimEnd();
}

// ---------------------------------------------------------------------------
// Directeur : qui prend la parole ?
// ---------------------------------------------------------------------------

export type SpeakerPlanReason = "forced" | "mention" | "vocative" | "all";

export type SpeakerPlan = {
  personaIds: string[];
  reason: SpeakerPlanReason;
};

/**
 * Mentions explicites `@Nom` (ou `@tous`) présentes dans un texte.
 *
 * Les mots-clés des deux langues sont acceptés quelle que soit la langue
 * réglée : on tape « @everyone » par habitude, et refuser la forme de l'autre
 * langue ne protège de rien.
 */
export function findMentions(
  text: string,
  participants: Participant[],
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string[] {
  const everyone = pack.scene.everyoneMentions.map(escapeRegExp).join("|");
  if (new RegExp(`@(?:${everyone})\\b`, "i").test(text)) {
    return participants.map((p) => p.id);
  }
  return participants
    .filter((p) => {
      const name = escapeRegExp(p.name.trim());
      if (!name) return false;
      return new RegExp(`@${name}\\b`, "i").test(text);
    })
    .map((p) => p.id);
}

/**
 * À qui une réplique s'adresse, déduit du texte pour l'affichage.
 * Volontairement conservateur : mention explicite, ou apostrophe en début ou
 * en fin de phrase. Un nom simplement cité (« Marc a raison ») ne compte pas —
 * mieux vaut ne rien afficher qu'afficher un destinataire faux.
 */
export function detectAddressee(
  content: string,
  candidates: Participant[],
): Participant | null {
  const text = content.trim();
  if (!text) return null;
  for (const candidate of candidates) {
    const name = escapeRegExp(candidate.name.trim());
    if (!name) continue;
    // @Nom, ou « Nom, … » en tête — éventuellement après une didascalie —,
    // ou « …, Nom ? » en fin de phrase.
    if (
      new RegExp(`@${name}\\b`, "i").test(text) ||
      new RegExp(`^\\s*(?:\\*[^*\\n]*\\*\\s*)*${name}\\s*[,:!?…]`, "i").test(text) ||
      new RegExp(`[,;]\\s*${name}\\s*[.!?…]*\\s*$`, "i").test(text) ||
      new RegExp(`[,;]\\s*${name}\\s*[.!?…]`, "i").test(text)
    ) {
      return candidate;
    }
  }
  return null;
}

/** Apostrophe en début de message : « Anna, tu en penses quoi ? ». */
export function findVocative(
  text: string,
  participants: Participant[],
): string | null {
  const trimmed = text.trimStart();
  for (const p of participants) {
    const name = escapeRegExp(p.name.trim());
    if (!name) continue;
    if (new RegExp(`^${name}\\s*[,:!?…]`, "i").test(trimmed)) return p.id;
  }
  return null;
}

/**
 * Détermine l'ordre de parole pour un tour, sans appel au modèle.
 * Priorité : locuteur imposé, mentions `@Nom`, apostrophe initiale, puis tous
 * les participants dans l'ordre de la scène.
 */
export function planSpeakers(
  text: string,
  participants: Participant[],
  forcedPersonaId: string | null = null,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): SpeakerPlan {
  const order = (ids: string[]) =>
    participants.filter((p) => ids.includes(p.id)).map((p) => p.id);

  if (forcedPersonaId && participants.some((p) => p.id === forcedPersonaId)) {
    return { personaIds: [forcedPersonaId], reason: "forced" };
  }
  const mentioned = findMentions(text, participants, pack);
  if (mentioned.length > 0) {
    return { personaIds: order(mentioned), reason: "mention" };
  }
  const vocative = findVocative(text, participants);
  if (vocative) {
    return { personaIds: [vocative], reason: "vocative" };
  }
  return { personaIds: participants.map((p) => p.id), reason: "all" };
}

/**
 * Précise à qui s'adresse le dernier message de l'utilisateur, du point de vue
 * du personnage qui va répondre. C'est ce qui évite qu'un personnage réponde
 * à une réplique qui ne lui était pas destinée.
 */
export function describeAddressing(
  plan: SpeakerPlan,
  participants: Participant[],
  speakerId: string,
  userName?: string,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  const s = pack.scene;
  const who = userName ?? s.userLabel;
  const nameOf = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? s.unknownSpeakerLabel;
  if (plan.reason === "all") return s.addressingAll(who);
  if (!plan.personaIds.includes(speakerId)) {
    return s.addressingOthers(who, s.enumerate(plan.personaIds.map(nameOf)));
  }
  if (plan.personaIds.length === 1) return s.addressingYouOnly(who);
  const others = plan.personaIds.filter((id) => id !== speakerId).map(nameOf);
  return s.addressingYouAnd(who, s.enumerate(others));
}

/**
 * Consigne d'un tour où l'utilisateur n'a rien ajouté : les personnages se
 * répondent entre eux. La demande de conclure limite les boucles polies.
 */
export function describeAutonomousTurn(
  userName?: string,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  return pack.scene.autonomousTurn(userName ?? pack.scene.userLabel);
}

/**
 * Rappel factuel de l'état du tour, placé en toute fin de prompt — juste
 * avant la génération, là où il pèse le plus.
 *
 * C'est ce qui manquait : les rôles de l'API font que tout ce qui n'est pas du
 * personnage arrive dans un même bloc `user`, et le modèle attribue le tout à
 * son interlocuteur naturel, l'humain. D'où des répliques du type « Jeff, tu
 * nous casses le délire » quand c'est un autre personnage qui avait parlé.
 */
export function describeLastTurn(
  options: {
    lastSpeakerName: string | null;
    lastAddresseeName: string | null;
    userName: string;
    /** Répliques écoulées depuis le dernier message de l'utilisateur. */
    userSilentTurns: number;
  },
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  const { lastSpeakerName, lastAddresseeName, userName, userSilentTurns } = options;
  const lines: string[] = [];
  if (lastSpeakerName) {
    lines.push(pack.scene.lastTurnSpeaker(lastSpeakerName, lastAddresseeName));
  }
  if (userSilentTurns > 0) {
    lines.push(pack.scene.lastTurnUserSilent(userName, userSilentTurns));
  }
  return lines.join("\n");
}

/** Consigne d'un tour déclenché par une didascalie (arrivée, départ). */
export function describeSceneEvent(
  userName?: string,
  pack: PromptPack = DEFAULT_PROMPT_PACK,
): string {
  return pack.scene.sceneEvent(userName ?? pack.scene.userLabel);
}

/**
 * Ordre de parole pour un tour sans message de l'utilisateur (« Continuer »).
 * Les personnages reprennent après le dernier qui a parlé, pour éviter qu'un
 * même personnage enchaîne deux fois de suite.
 */
export function planContinuation(
  participants: Participant[],
  lastSpeakerId: string | null,
): string[] {
  if (participants.length === 0) return [];
  if (participants.length === 1) return [participants[0].id];
  const index = participants.findIndex((p) => p.id === lastSpeakerId);
  if (index === -1) return participants.map((p) => p.id);
  return [
    ...participants.slice(index + 1).map((p) => p.id),
    ...participants.slice(0, index + 1).map((p) => p.id),
  ];
}

/**
 * Nombre maximal de prises de parole par personnage entre deux messages de
 * l'utilisateur. Plafond dur : il s'applique aussi aux échanges automatiques.
 */
export const MAX_CONSECUTIVE_AI_TURNS = 4;

/** Choix proposés pour les échanges automatiques entre personnages. */
export const AUTO_ROUND_CHOICES = [0, 1, 2, 3] as const;

/** Borne le réglage d'échanges automatiques à une valeur acceptée. */
export function clampAutoRounds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), AUTO_ROUND_CHOICES.length - 1);
}
