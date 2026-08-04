import type { DayPeriod, Gender, Mood } from "../../types";
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
  summary: SummaryPrompts;
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
  /** Rappel factuel de l'état du tour, placé en toute fin de prompt. */
  lastTurnSpeaker(speakerName: string, addresseeName: string | null): string;
  lastTurnUserSilent(userName: string, turns: number): string;
  /** Tour déclenché par une didascalie (arrivée, départ). */
  sceneEvent(userName: string): string;
  /** Mot-clés d'une mention « à tout le monde ». */
  everyoneMentions: readonly string[];
};

export type SceneBlockText = {
  speakerName: string;
  speakerGender: Gender;
  others: { name: string; gender: Gender }[];
  userName: string;
  userGender: Gender;
};

export type AssemblerPrompts = {
  identity(personaName: string, systemPrompt: string): string;
  humanInterlocutor(userName: string, userGender: Gender): string;
  stableTraits(traits: string[]): string;
  responseLength(instruction: string): string;
  emotionalPlay(): string;
  startingSituation(situation: string): string;
  writingConventions(userName: string, userGender: Gender): string;
  conversationSummary(summary: string): string;
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
  /** Erreur rendue à l'utilisateur, pas au modèle. */
  contextTooLong: string;
};

export type DirectorPrompts = {
  system(input: { userName: string; afterUserMessage: boolean }): string;
  user(input: { roster: string; transcript: string }): string;
  /** Ligne de transcription soumise au directeur. */
  transcriptLine(name: string, content: string): string;
  narrationLine(content: string): string;
  emptyTranscript: string;
};

export type SummaryPrompts = {
  system(): string;
  user(input: { previousSummary: string | null; newMessages: string }): string;
  /** Ligne d'un message soumis au résumé. */
  messageLine(name: string, content: string): string;
  emptySummaryError: string;
  truncatedSummaryError: string;
};

export type EmotionPrompts = {
  moodLabels: Record<Mood, string>;
  /** Ligne de traits jointe à la caractérisation soumise à l'analyse. */
  traitsLine(traits: string): string;
  analysisSystem(input: { personaName: string; moodList: string }): string;
  analysisUser(input: {
    characterization: string;
    mood: string;
    valence: string;
    energy: string;
    warmth: string;
    closeness: string;
    stimulus: string;
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
