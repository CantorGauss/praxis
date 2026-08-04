// Types du domaine — contrat fonctionnel de l'application.

import type { AvatarAppearance } from "./services/avatar";
import type { Locale } from "./i18n/locales";

export type { AvatarAppearance };
export type { Locale };

/**
 * Genre grammatical, pour l'accord des adjectifs et des participes. En
 * français rien n'est neutre à l'usage : sans cette indication, les
 * personnages s'accordent au hasard du prénom.
 */
export type Gender = "feminine" | "masculine" | "neutral";

export type ModelProfile = {
  modelId: string;
  displayName?: string;
  /**
   * Capacité saisie par l'utilisateur. Elle prime sur celle annoncée par le
   * serveur : on peut vouloir un budget délibérément inférieur au maximum réel.
   * `undefined` = laisser la détection décider.
   */
  contextWindow?: number;
  customParameters?: Record<string, unknown>;
};

export type Persona = {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  stableTraits: string[];
  defaultModelId: string | null;
  temperature: number;
  topP: number | null;
  maxOutputTokens: number | null;
  /** Accord grammatical employé pour ce personnage. */
  gender: Gender;
  avatarSetId: string | null;
  /**
   * Apparence de l'avatar intégré (coiffure, pilosité, lunettes, teintes).
   * null = déduite de l'identifiant, de sorte que deux personas créées sans
   * réglage ne se ressemblent pas.
   */
  avatarStyle: AvatarAppearance | null;
  createdAt: string;
  updatedAt: string;
};

export type Mood =
  | "neutral"
  | "joyful"
  | "calm"
  | "curious"
  | "surprised"
  | "shocked"
  | "concerned"
  | "afraid"
  | "sad"
  | "angry"
  | "disgusted"
  | "tired"
  | "annoyed";

export type EmotionalState = {
  personaId: string;
  mood: Mood;
  valence: number; // -1 à 1
  energy: number; // 0 à 1
  warmth: number; // 0 à 1
  closeness: number; // 0 à 1, évolue plus lentement
  updatedAt: string;
};

export type EmotionalStateUpdate = {
  mood: Mood;
  /** Force de la réaction immédiate, de 0 (imperceptible) à 1 (bouleversante). */
  intensity: number;
  /** Impulsion de jeu brève : ce que le personnage ressent ou fait d'abord. */
  impulse: string;
  valenceDelta: number;
  energyDelta: number;
  warmthDelta: number;
  closenessDelta: number;
};

export type EmotionalReaction = Pick<
  EmotionalStateUpdate,
  "mood" | "intensity" | "impulse"
>;

export type Conversation = {
  id: string;
  /** Persona principale : titre, avatar de la liste, locuteur par défaut. */
  personaId: string;
  title: string;
  /** Situation de départ commune, connue de tous les personnages présents. */
  sceneDescription: string | null;
  summary: string | null;
  summaryThroughMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  lastInteractionAt: string | null;
};

/** Participation d'une persona à une conversation de groupe. */
export type ConversationParticipant = {
  conversationId: string;
  personaId: string;
  /** Ordre de parole dans la scène. */
  position: number;
  /** Un participant inactif reste dans l'historique mais ne parle plus. */
  active: boolean;
};

export type MessageStatus = "streaming" | "complete" | "cancelled" | "error";

/**
 * `speech` : une réplique. `narration` : une didascalie qui n'appartient à
 * personne (entrée, sortie, événement de la scène).
 */
export type MessageKind = "speech" | "narration";

export type Message = {
  id: string;
  conversationId: string;
  /** Rôle protocolaire envoyé au serveur ; une didascalie voyage en `user`. */
  role: "user" | "assistant";
  kind: MessageKind;
  content: string;
  status: MessageStatus;
  createdAt: string;
  /** Locuteur : null pour l'utilisateur, ou si la persona a été supprimée. */
  personaId: string | null;
  /** Nom du locuteur au moment du message, conservé si la persona disparaît. */
  personaName: string | null;
  /**
   * Destinataire : identifiant de persona, `USER_ADDRESSEE` pour l'utilisateur,
   * ou null quand la réplique s'adresse à toute la scène.
   */
  addressee: string | null;
};

/** Valeur d'`addressee` désignant l'utilisateur, qui n'est pas une persona. */
export const USER_ADDRESSEE = "user";

export type DayPeriod = "morning" | "afternoon" | "evening" | "night";

export type AvatarVariant = {
  id: string;
  avatarSetId: string;
  mood: Mood | null;
  dayPeriod: DayPeriod | null;
  assetPath: string;
  priority: number;
};

export type TemporalContext = {
  localIso: string;
  localTime: string;
  weekday: string;
  dayPeriod: DayPeriod;
  elapsedMs: number | null;
  elapsedLabel: string;
};

/**
 * Un serveur d'inférence configuré, avec tout ce qui lui appartient en propre :
 * son adresse, sa clé, son modèle, son délai. Passer d'un serveur local à une
 * passerelle distante revient à changer de connexion active, pas à ressaisir
 * des réglages.
 *
 * La clé API ne figure pas ici : elle vit dans le coffre du système, sous
 * l'identifiant de la connexion.
 */
export type Connection = {
  id: string;
  name: string;
  baseUrl: string;
  /**
   * Une connexion qui sort de la machine doit être autorisée explicitement,
   * connexion par connexion : le réglage global d'avant rendait distantes
   * toutes les autres du même coup.
   */
  allowRemoteHosts: boolean;
  timeoutMs: number;
  /**
   * Modèle choisi explicitement. null = premier modèle exposé par le serveur,
   * ce qui suffit à un serveur local qui n'en sert qu'un — mais jamais à une
   * passerelle comme OpenRouter, qui en liste des centaines.
   */
  selectedModelId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Ce dont une requête a besoin pour partir : où, avec quelle clé, jusqu'à quand. */
export type ConnectionTarget = Pick<
  Connection,
  "id" | "baseUrl" | "allowRemoteHosts" | "timeoutMs"
>;

export const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Points de départ proposés à la création. Ils ne font qu'éviter la saisie
 * d'une URL : rien n'est activé en douce, et `remote` sert justement à
 * demander confirmation avant de créer une connexion qui quitte la machine.
 */
export type ConnectionPresetKey =
  | "mlxserve"
  | "llamacpp"
  | "ollama"
  | "openrouter";

export type ConnectionPreset = {
  key: ConnectionPresetKey;
  name: string;
  baseUrl: string;
  remote: boolean;
};

export const CONNECTION_PRESETS: ConnectionPreset[] = [
  {
    key: "mlxserve",
    name: "mlx-serve",
    baseUrl: "http://localhost:8080/v1",
    remote: false,
  },
  {
    key: "llamacpp",
    name: "llama.cpp",
    baseUrl: "http://localhost:8080/v1",
    remote: false,
  },
  {
    key: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    remote: false,
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    remote: true,
  },
];

/** Préférences purement visuelles, sans effet sur les personnages ou les prompts. */
export type InterfaceTheme = "system" | "dark" | "light";
export type ChatTextSize = "small" | "normal" | "large";
export type InterfaceDensity = "compact" | "comfortable";

export type AppSettings = {
  /** Langue de l'interface. Sans effet sur le jeu des personnages. */
  uiLocale: Locale;
  /**
   * Langue dans laquelle les personnages jouent. C'est la langue du prompt qui
   * fixe celle des répliques : le réglage est donc distinct de `uiLocale`, et
   * une interface anglaise avec des personnages francophones est un cas normal.
   */
  conversationLanguage: Locale;
  logicalContextTokens: number;
  /** Connexion employée par toutes les requêtes ; null = la première connue. */
  activeConnectionId: string | null;
  emotionEnabled: boolean;
  emotionAnalysisEnabled: boolean;
  avatarsEnabled: boolean;
  /** Thème de l'interface ; `system` suit l'apparence de macOS/Windows/Linux. */
  interfaceTheme: InterfaceTheme;
  /** Taille des répliques et de la zone de saisie. */
  chatTextSize: ChatTextSize;
  /** Espacement vertical du fil et des bulles. */
  interfaceDensity: InterfaceDensity;
  defaultPersonaId: string | null;
  onboarded: boolean;
  /**
   * Nom sous lequel les personnages désignent l'utilisateur. Vide = le libellé
   * générique de la langue de conversation (« Utilisateur », "User").
   */
  userName: string;
  /** Accord grammatical employé pour vous. */
  userGender: Gender;
  /**
   * Qui décide de la prise de parole : `round` fait répondre chacun son tour,
   * `model` demande au modèle qui parlerait — au prix d'une requête de plus.
   */
  sceneDirector: "round" | "model";
  /** Tours d'échange entre personnages joués automatiquement (0 = aucun). */
  sceneAutoRounds: number;
  /**
   * Secondes de silence après lesquelles les personnages reprennent la parole
   * entre eux. 0 = jamais : ils attendent toujours un message.
   */
  idleChatterSeconds: number;
  /**
   * Nombre de messages non résumés au-delà duquel un résumé est déclenché.
   * Borne le coût de chaque requête indépendamment de la longueur des
   * répliques : au-delà, les plus anciennes passent dans le résumé.
   */
  historyWindowMessages: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  uiLocale: "en",
  conversationLanguage: "en",
  logicalContextTokens: 8192,
  activeConnectionId: null,
  emotionEnabled: true,
  emotionAnalysisEnabled: true,
  avatarsEnabled: true,
  interfaceTheme: "system",
  chatTextSize: "normal",
  interfaceDensity: "comfortable",
  defaultPersonaId: null,
  onboarded: false,
  userName: "",
  userGender: "neutral",
  sceneDirector: "round",
  sceneAutoRounds: 1,
  idleChatterSeconds: 30,
  historyWindowMessages: 30,
};

export const NEUTRAL_STATE = {
  mood: "calm",
  valence: 0.2,
  energy: 0.55,
  warmth: 0.65,
  closeness: 0.5,
} as const;
