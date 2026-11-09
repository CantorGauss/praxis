import type { DayPeriod, Gender, MemoryCategory, Mood } from "../../types";
import type { Locale } from "../locales";

/**
 * Tout le texte envoyé au modèle, regroupé par langue.
 *
 * Ce n'est pas une simple table de traduction : chaque langue a ses propres
 * contraintes. Le français exige des consignes d'accord en genre pour les
 * adjectifs et les participes ; l'anglais n'en a aucun usage et se contente de
 * fixer les pronoms. Un pack n'est donc pas tenu de rendre le même texte, mais
 * de produire le même *effet* sur le jeu du personnage.
 */
export type PromptPack = {
  locale: Locale;
  /** Nom de la langue tel qu'on le donne au modèle dans une consigne. */
  languageName: string;
  scene: ScenePrompts;
  assembler: AssemblerPrompts;
  director: DirectorPrompts;
  twist: TwistPrompts;
  review: ReviewPrompts;
  objectives: ObjectivePrompts;
  coordination: {
    analysisSystem: string;
    context(data: string): string;
  };
  memory: MemoryPrompts;
  emotion: EmotionPrompts;
  temporal: TemporalPrompts;
  inference: InferencePrompts;
};

export type ScenePrompts = {
  /** Nom par défaut de l'utilisateur dans les transcriptions. */
  userLabel: string;
  /** Repli quand la persona d'un ancien message n'existe plus. */
  unknownSpeakerLabel: string;
  /** En-tête d'un bloc qui rassemble plusieurs locuteurs. */
  multiSpeakerHeader: string;
  /** Forme reconnaissable d'une didascalie, sans nom de locuteur. */
  narration(text: string): string;
  /** Motif reconnaissant une didascalie déjà formatée, toutes langues confondues. */
  entrance(name: string): string;
  exit(name: string): string;
  /** Énumération naturelle : « A, B et C » / "A, B and C". */
  enumerate(names: string[]): string;
  /** Ligne d'historique attribuée à un autre locuteur. */
  transcriptLine(name: string, addressee: string | null, content: string): string;
  /** Préfixe de coupure : ce qui trahit le modèle prenant un autre rôle. */
  speakerStopSequence(name: string): string;
  /** Comment on parle de quelqu'un d'autre. */
  genderClause(gender: Gender): string;
  /** Même chose, adressé au personnage qui parle. */
  selfGenderClause(gender: Gender): string;
  /** Bloc [SCÈNE] : le trombinoscope nominatif et ses règles. */
  sceneBlock(options: SceneBlockText): string;
  /** À qui s'adresse le dernier message, du point de vue du locuteur. */
  addressingAll(userName: string): string;
  addressingOthers(userName: string, others: string): string;
  addressingYouOnly(userName: string): string;
  addressingYouAnd(userName: string, others: string): string;
  /** Tour sans message de l'utilisateur : les personnages se répondent. */
  autonomousTurn(userName: string): string;
  userSilentTurn(userName: string): string;
  /** Rappel factuel de l'état du tour, placé en toute fin de prompt. */
  lastTurnSpeaker(speakerName: string, addresseeName: string | null): string;
  lastTurnUserSilent(userName: string, turns: number): string;
  /** Personnages sortis de scène : ils n'entendent plus rien. */
  departedReminder(names: string[]): string;
  /** Tour déclenché par une didascalie (arrivée, départ). */
  sceneEvent(userName: string): string;
  /** Consigne de celui qui entre : la didascalie parle de lui, pas d'un tiers. */
  ownEntrance(speakerName: string): string;
  /** Mot-clés d'une mention « à tout le monde ». */
  everyoneMentions: readonly string[];
};

export type SceneBlockText = {
  speakerName: string;
  speakerGender: Gender;
  others: {
    name: string;
    gender: Gender;
    /** Identité publique courte ; null quand la fiche n'en indique aucune. */
    description?: string | null;
  }[];
  /** Personnages qui ont parlé plus tôt mais ont quitté la scène. */
  departed?: string[];
  userName: string;
  userGender: Gender;
};

export type AssemblerPrompts = {
  /**
   * `description` est la fiche publique du personnage : les autres la voient,
   * lui doit donc la connaître aussi — elle porte souvent ses liens avec
   * l'humain (« amie d'enfance de Jeff »).
   */
  identity(personaName: string, systemPrompt: string, description?: string | null): string;
  humanInterlocutor(userName: string, userGender: Gender): string;
  stableTraits(traits: string[]): string;
  responseLength(instruction: string): string;
  /**
   * La voix du personnage : de l'oral, dans son registre. Sa propre fiche
   * l'emporte sur les règles générales de style.
   */
  voice(): string;
  emotionalPlay(): string;
  /** Ce qui pousse chaque réplique à faire avancer la scène. */
  momentum(): string;
  startingSituation(situation: string): string;
  /**
   * Ce que le personnage veut dans la scène et ce qu'il cache. Stable d'un tour
   * à l'autre : il reste dans le préfixe du prompt.
   */
  objective(goal: string, secret: string | null): string;
  /** Le même but, rappelé juste avant la réplique : c'est là qu'il pèse. */
  objectiveReminder(goal: string): string;
  /** Rappel saillant placé juste avant la réponse, près de la dernière réplique. */
  sceneReminder(situation: string): string;
  /**
   * La fiche du personnage, rappelée juste avant la génération : face à ses
   * propres répliques qui la contredisent, un petit modèle suit l'historique
   * plutôt que le haut du prompt.
   */
  identityReminder(personaName: string, description: string): string;
  /** Rappel de style juste avant la réplique : les consignes de forme s'oublient vite. */
  voiceReminder(recentGestures: string[]): string;
  writingConventions(userName: string, userGender: Gender): string;
  /** Règle des apartés, en scène de groupe : dits au public, entendus de personne. */
  asides(): string;
  /** Invitation ponctuelle à en glisser un, placée en fin de requête. */
  asideNudge(): string;
  /**
   * Registre des faits connus du personnage, regroupés par catégorie.
   * `pinned` : les faits que l'utilisateur tient pour essentiels.
   */
  sceneMemory(input: {
    pinned: string[];
    groups: { label: string; facts: string[] }[];
    /** Des faits moins pertinents ont été laissés de côté faute de place. */
    partial: boolean;
  }): string;
  /** Instantané de la scène à la frontière de la mémoire. */
  sceneState(input: { state: string[]; threads: string[] }): string;
  /** Extraits exacts retrouvés plus tôt dans la scène, placés juste avant la réponse. */
  recalledPassages(passages: string[]): string;
  /** Les faits épinglés, rappelés juste avant la génération. */
  pinnedReminder(facts: string[]): string;
  /** Le personnage n'a pas assisté à toute la scène : il ignore ce qu'il a manqué. */
  partialPresence(): string;
  immediateReaction(input: {
    moodLabel: string;
    intensityPercent: number;
    impulse: string;
  }): string;
  currentState(input: {
    moodLabel: string;
    valence: string;
    energy: string;
    warmth: string;
    closeness: string;
  }): string;
  temporalContext(input: {
    localTime: string;
    weekday: string;
    dayPeriodLabel: string;
    elapsedLabel: string;
  }): string;
  thisTurn(addressing: string): string;
  /** Relance quand les dernières répliques tournent en rond. */
  stagnation(reason: StagnationReason): string;
  /** Erreur rendue à l'utilisateur, pas au modèle. */
  contextTooLong: string;
};

export type DirectorPrompts = {
  system(input: {
    userName: string;
    afterUserMessage: boolean;
    /** Les personnages ont un but : on fait parler celui qui y gagne le plus. */
    hasObjectives?: boolean;
    /**
     * L'utilisateur a choisi d'écouter : la scène ne doit pas retomber. Sinon,
     * le silence lui rend la parole, et c'est souvent ce qu'il attend.
     */
    listening?: boolean;
  }): string;
  user(input: { roster: string; transcript: string }): string;
  /** Ligne de distribution d'un personnage qui a un but. */
  rosterLine(name: string, description: string | null, goal: string | null): string;
  /** Ligne de transcription soumise au directeur. */
  transcriptLine(name: string, content: string): string;
  narrationLine(content: string): string;
  emptyTranscript: string;
};

/** Pourquoi la scène est jugée enlisée ; voir `detectStagnation`. */
export type StagnationReason = "echo" | "low-novelty" | "consensus";

/** Couleur d'un imprévu demandé par l'utilisateur. */
export type TwistTheme =
  | "surprise"
  | "catastrophe"
  | "romance"
  | "absurd"
  | "mystery"
  | "revelation";

export type TwistPrompts = {
  system(input: { userName: string }): string;
  user(input: {
    situation: string | null;
    summary: string | null;
    roster: string;
    transcript: string;
    /** Consigne de ton, quand l'utilisateur a choisi un thème. */
    theme?: string | null;
    /** Didascalies déjà jouées : sans elles, le modèle ressert le même procédé. */
    previousTwists?: readonly string[];
    /** Ce que chacun cherche en secret : l'imprévu peut le contrarier. */
    objectives?: string | null;
  }): string;
  /** Consigne propre à chaque thème, ajoutée à la demande. */
  themes: Record<TwistTheme, string>;
  /** Étiquette de la ligne d'enjeu, écrite avant la didascalie puis retirée. */
  stakeLabel: string;
  /** Tics que le modèle reproduit malgré la consigne : la didascalie est retirée. */
  rejected: RegExp;
  /** Préfixes qu'un modèle ajoute volontiers et qu'on retire de la didascalie. */
  stripPrefixes: readonly string[];
};

/** La critique du lendemain, écrite au baisser de rideau. */
export type ReviewPrompts = {
  system(input: { userName: string }): string;
  user(input: {
    situation: string | null;
    summary: string | null;
    roster: string;
    transcript: string;
    /** Ce que chacun voulait : le critique peut dire qui l'a obtenu. */
    objectives?: string | null;
  }): string;
};

/** L'auteur qui donne à chaque personnage un but pour la scène. */
export type ObjectivePrompts = {
  system(input: { userName: string }): string;
  user(input: {
    situation: string | null;
    summary: string | null;
    roster: string;
    /** Objectifs déjà donnés aux autres, que les nouveaux doivent contrarier. */
    assigned: string | null;
    transcript: string | null;
    /** Personnages à qui donner un objectif maintenant. */
    names: string[];
  }): string;
  /** Un personnage de la distribution, avec un extrait de son prompt interne. */
  rosterLine(name: string, description: string | null, privatePrompt: string | null): string;
  assignedLine(name: string, goal: string): string;
  /** Une ligne « ce que chacun veut », pour l'imprévu et la critique. */
  goalLine(name: string, goal: string, secret: string | null): string;
};

export type MemoryPrompts = {
  /** Consigne d'extraction : le modèle ne renvoie que des opérations en JSON. */
  system: string;
  user(input: {
    /** Registre courant, une ligne par fait : « f3 [event] … ». */
    facts: string[];
    /** Faits du registre laissés de côté faute de place. */
    omittedFacts: number;
    state: string[];
    threads: string[];
    /** Nouveaux messages numérotés : « [1] Anna : … ». */
    newMessages: string;
  }): string;
  /** Ligne d'un message soumis à l'extraction. */
  messageLine(name: string, content: string): string;
  categoryLabels: Record<MemoryCategory, string>;
  stateLabel: string;
  threadsLabel: string;
  /** « Relations : » / "Relationships:". */
  heading(label: string): string;
  invalidUpdateError: string;
  stalledError: string;
};

export type EmotionPrompts = {
  moodLabels: Record<Mood, string>;
  /** Ligne de traits jointe à la caractérisation soumise à l'analyse. */
  traitsLine(traits: string): string;
  analysisSystem(input: { personaName: string; moodList: string }): string;
  analysisUser(input: {
    characterization: string;
    sceneDescription: string | null;
    mood: string;
    valence: string;
    energy: string;
    warmth: string;
    closeness: string;
    stimulus: string;
    /** Ce qui précède l'événement : sans cela, tout paraît nouveau au personnage. */
    alreadyKnown: string | null;
  }): string;
};

export type TemporalPrompts = {
  weekdays: readonly string[];
  dayPeriodLabels: Record<DayPeriod, string>;
  /** Catégories naturelles de temps écoulé. */
  firstExchange: string;
  continuousConversation: string;
  shortBreak: string;
  fewHours: string;
  aboutADay: string;
  fewDays: string;
  longAbsence: string;
  /** Durée arrondie, jointe au libellé pour donner un ordre de grandeur. */
  minutes(value: number): string;
  hours(value: number): string;
  days(value: number): string;
  /** « quelques heures (environ 5 h) ». */
  withApproximate(label: string, duration: string): string;
};

export type InferencePrompts = {
  /** Consigne de longueur ; null quand le preset n'en demande aucune. */
  shortResponse: string;
};
