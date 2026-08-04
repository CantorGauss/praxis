import type {
  AppSettings,
  AvatarVariant,
  Connection,
  ConnectionTarget,
  Conversation,
  EmotionalReaction,
  EmotionalState,
  Message,
  Persona,
} from "../types";
import { DEFAULT_SETTINGS, USER_ADDRESSEE } from "../types";
import {
  connectionRepo,
  conversationRepo,
  emotionRepo,
  messageRepo,
  participantRepo,
  personaRepo,
  profileRepo,
  avatarRepo,
  settingsRepo,
  type ConnectionInput,
} from "../services/repositories";
import {
  buildRequestBody,
  cancelStream,
  forgetApiKey,
  listModels,
  streamChat,
  testConnection,
  type ModelInfo,
} from "../services/llmClient";
import { buildTemporalContext } from "../services/temporal";
import { applyDecay, neutralState } from "../services/emotion";
import { assemblePrompt, type SceneInput } from "../services/promptAssembler";
import {
  needsSummary,
  uncoveredMessages,
  updateSummary,
  KEEP_RECENT_MESSAGES,
  MAX_SUMMARY_BATCH,
  MIN_SUMMARY_BATCH,
  summaryNeedsRefresh,
} from "../services/summaryService";
import {
  cleanSpeakerReply,
  clampAutoRounds,
  describeAddressing,
  describeAutonomousTurn,
  describeLastTurn,
  describeSceneEvent,
  detectAddressee,
  planContinuation,
  planSpeakers,
  renderTranscript,
  speakerStopSequences,
  MAX_CONSECUTIVE_AI_TURNS,
  type Participant,
  type SpeakerPlan,
} from "../services/scene";
import { promptPack } from "../i18n/prompts";
import { setUiLocale, t } from "../i18n/ui.svelte";
import { chooseSpeakers } from "../services/director";
import { assessEmotionalReaction } from "../services/emotionAnalysis";
import { newId } from "../services/db";
import {
  effectiveMaxOutputTokens,
  resolveContextBudget,
  type ContextBudget,
} from "../services/inference";

export type View = "chat" | "new-chat" | "personas" | "settings";

/**
 * Où en est le tour de parole. Une conversation à voix haute a des silences
 * qui veulent dire « à vous » et d'autres qui veulent dire « pas encore » :
 * l'interface doit pouvoir les distinguer sans deviner.
 */
export type TurnPhase =
  | "idle"
  | "speaking"
  | "directing"
  | "compressing"
  | "wrapping";

class AppState {
  loaded = $state(false);
  view = $state<View>("chat");
  settings = $state<AppSettings>({ ...DEFAULT_SETTINGS });

  personas = $state<Persona[]>([]);
  conversations = $state<Conversation[]>([]);
  /** Serveurs configurés ; la bascule de l'un à l'autre est immédiate. */
  connections = $state<Connection[]>([]);
  /** Modèles annoncés par la connexion active, et par elle seule. */
  models = $state<ModelInfo[]>([]);
  connected = $state<boolean | null>(null);

  currentConversationId = $state<string | null>(null);
  messages = $state<Message[]>([]);

  /** Scène courante : identifiants des personnages, dans l'ordre de parole. */
  participantIds = $state<string[]>([]);
  /** Composition de chaque conversation, pour la barre latérale. */
  participantsByConversation = $state<Record<string, string[]>>({});

  /** État émotionnel et avatars par persona : chaque personnage a les siens. */
  emotionalStates = $state<Record<string, EmotionalState>>({});
  /** Dernière réaction immédiate, utilisée pendant et après la réplique. */
  emotionalReactions = $state<Record<string, EmotionalReaction | null>>({});
  avatarVariantsByPersona = $state<Record<string, AvatarVariant[]>>({});

  streaming = $state(false);
  streamingContent = $state("");
  /** Personnage en train d'écrire, et ceux qui attendent leur tour. */
  streamingPersonaId = $state<string | null>(null);
  pendingSpeakerIds = $state<string[]>([]);
  private streamRequestId: string | null = null;
  private turnAborted = false;

  /** Destinataire imposé depuis la zone de saisie ; null = laisser le directeur choisir. */
  composerTargetId = $state<string | null>(null);
  /** Panneau latéral listant les personnages présents et disponibles. */
  castPanelOpen = $state(false);

  /**
   * Dernier échec de résumé : nombre de messages non couverts à ce moment-là.
   * Sans cela, un résumé qui échoue est retenté à *chaque* réplique — et
   * chaque tentative bloque le serveur jusqu'à son délai d'expiration.
   */
  private summaryRetryFloor = new Map<string, number>();

  /** Vrai pendant que le metteur en scène choisit qui parle. */
  directing = $state(false);

  /** Taille estimée du dernier prompt envoyé, pour diagnostiquer la lenteur. */
  lastPromptTokens = $state<number | null>(null);
  /** Fenêtre réellement annoncée par le profil du modèle pour ce prompt. */
  lastPromptContextTokens = $state<number | null>(null);
  /** Place réellement gardée pour la réponse du dernier personnage. */
  lastReplyTokenBudget = $state<number | null>(null);
  /** Compression de l'historique actuellement exécutée par le modèle. */
  summarizing = $state(false);
  summaryPendingMessages = $state(0);
  /** Englobe préparation, compression, génération et tours automatiques. */
  turnInProgress = $state(false);

  /**
   * Message écrit alors que la parole n'était pas encore revenue. On ne jette
   * jamais ce que l'utilisateur a tapé : il part dès la fin du tour.
   */
  queuedMessage = $state<{ text: string; mode: "speech" | "scene" } | null>(null);

  /**
   * Entrées et sorties demandées pendant qu'un personnage parle. Elles sont
   * jouées dès que le verrou du tour est libéré, au lieu d'être ignorées.
   */
  pendingSceneActions = $state<
    Array<{
      kind: "enter" | "leave";
      personaId: string;
      description: string;
      react: boolean;
    }>
  >([]);
  private flushingSceneAction = false;

  /**
   * Vrai quand les personnages se parlent entre eux plutôt que de répondre à
   * l'utilisateur. Ces tours-là ne lui sont pas dus : il peut les interrompre,
   * alors qu'une réponse à son propre message doit aller à son terme.
   */
  autonomousTurn = $state(false);

  /** Reprise automatique de la scène après un silence de l'utilisateur. */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Instant auquel les personnages reprendront la parole seuls, s'il y a lieu. */
  idleResumeAt = $state<number | null>(null);
  /**
   * Mise en pause de la vie autonome de la scène : ni reprise après silence,
   * ni tours enchaînés. Les personnages n'ouvrent la bouche que sur demande.
   */
  idlePaused = $state(false);

  temperatureOverride = $state<number | null>(null);
  errorBanner = $state<string | null>(null);
  notice = $state<string | null>(null);

  get currentConversation(): Conversation | null {
    return (
      this.conversations.find((c) => c.id === this.currentConversationId) ?? null
    );
  }

  /** Persona principale : en-tête, réglages par défaut, avatar de la liste. */
  get activePersona(): Persona | null {
    const conv = this.currentConversation;
    const id = conv?.personaId ?? this.settings.defaultPersonaId;
    return (
      this.personas.find((p) => p.id === id) ??
      (this.personas.length ? this.personas[0] : null)
    );
  }

  /**
   * Personnages de la scène courante, dans l'ordre de parole. Vide tant
   * qu'aucun salon n'est ouvert : personne n'est en scène par défaut.
   */
  get participants(): Persona[] {
    if (!this.currentConversationId) return [];
    return this.participantIds
      .map((id) => this.personas.find((p) => p.id === id))
      .filter((p): p is Persona => Boolean(p));
  }

  get isGroupConversation(): boolean {
    return this.participants.length > 1;
  }

  /**
   * Connexion employée par toutes les requêtes. Le réglage prime ; à défaut —
   * connexion supprimée, réglage jamais écrit — la première configurée sert,
   * plutôt que de laisser l'application sans serveur.
   */
  get activeConnection(): Connection | null {
    const chosen = this.settings.activeConnectionId;
    return (
      this.connections.find((c) => c.id === chosen) ?? this.connections[0] ?? null
    );
  }

  /** Cible de requête, ou null si aucune connexion n'est configurée. */
  private get target(): ConnectionTarget | null {
    return this.activeConnection;
  }

  /**
   * Modèle utilisé. Le choix explicite prime toujours, y compris quand le
   * serveur ne le liste pas : retomber en silence sur le premier de la liste
   * ferait parler un autre modèle que celui affiché. À défaut de choix, le
   * premier exposé suffit — c'est le cas d'un serveur local qui n'en sert qu'un.
   */
  get activeModelId(): string | null {
    return this.activeConnection?.selectedModelId ?? this.models[0]?.id ?? null;
  }

  /**
   * Vrai quand le modèle choisi ne figure plus parmi ceux annoncés : renommé,
   * déchargé, ou passerelle changée. La requête part quand même, mais l'écran
   * doit le dire plutôt que de laisser deviner l'échec.
   */
  get selectedModelMissing(): boolean {
    const chosen = this.activeConnection?.selectedModelId;
    if (!chosen || this.models.length === 0) return false;
    return !this.models.some((m) => m.id === chosen);
  }

  /** Fixe le modèle de la connexion active ; null = automatique. */
  async selectModel(modelId: string | null): Promise<void> {
    const connection = this.activeConnection;
    if (!connection) return;
    await this.updateConnection({
      ...connection,
      selectedModelId: modelId?.trim() || null,
    });
    this.lastPromptTokens = null;
    this.lastPromptContextTokens = null;
    this.lastReplyTokenBudget = null;
  }

  // -------------------------------------------------------------------------
  // Connexions
  // -------------------------------------------------------------------------

  /**
   * Change de serveur. Chaque connexion garde son modèle et sa clé : la liste
   * des modèles et l'état de connexion, eux, appartenaient au précédent et
   * sont donc repris de zéro.
   */
  async useConnection(id: string): Promise<void> {
    if (!this.connections.some((c) => c.id === id)) return;
    if (this.settings.activeConnectionId === id) return;
    this.settings.activeConnectionId = id;
    await this.saveSettings();
    this.models = [];
    this.connected = null;
    this.errorBanner = null;
    this.lastPromptTokens = null;
    this.lastPromptContextTokens = null;
    this.lastReplyTokenBudget = null;
    await this.refreshConnection();
  }

  async addConnection(input: ConnectionInput, activate = true): Promise<Connection> {
    const created = await connectionRepo.create(input);
    this.connections = [...this.connections, created];
    if (activate) {
      this.settings.activeConnectionId = created.id;
      await this.saveSettings();
      this.models = [];
      this.connected = null;
      await this.refreshConnection();
    }
    return created;
  }

  async updateConnection(connection: Connection): Promise<void> {
    const saved = await connectionRepo.update(connection);
    this.connections = this.connections.map((c) =>
      c.id === saved.id ? saved : c,
    );
  }

  /** Copie d'une connexion : même serveur, autre clé ou autre modèle. */
  async duplicateConnection(id: string): Promise<void> {
    const source = this.connections.find((c) => c.id === id);
    if (!source) return;
    await this.addConnection({
      name: `${source.name} (copie)`,
      baseUrl: source.baseUrl,
      allowRemoteHosts: source.allowRemoteHosts,
      timeoutMs: source.timeoutMs,
      selectedModelId: source.selectedModelId,
    });
  }

  /**
   * Supprime une connexion et la clé qui l'accompagne. La dernière ne peut pas
   * partir : l'application n'aurait plus aucun serveur où s'adresser.
   */
  async removeConnection(id: string): Promise<void> {
    if (this.connections.length <= 1) return;
    const wasActive = this.activeConnection?.id === id;
    await connectionRepo.remove(id);
    await forgetApiKey(id);
    this.connections = this.connections.filter((c) => c.id !== id);
    if (wasActive) {
      this.settings.activeConnectionId = this.connections[0]?.id ?? null;
      await this.saveSettings();
      this.models = [];
      this.connected = null;
      await this.refreshConnection();
    }
  }

  /** État émotionnel de la persona principale (en-tête, avatar par défaut). */
  get emotionalState(): EmotionalState | null {
    const persona = this.activePersona;
    if (!persona || !this.settings.emotionEnabled) return null;
    return this.emotionalStates[persona.id] ?? null;
  }

  stateFor(personaId: string | null | undefined): EmotionalState | null {
    if (!personaId || !this.settings.emotionEnabled) return null;
    return this.emotionalStates[personaId] ?? null;
  }

  reactionFor(personaId: string | null | undefined): EmotionalReaction | null {
    if (!personaId || !this.settings.emotionEnabled) return null;
    return this.emotionalReactions[personaId] ?? null;
  }

  variantsFor(personaId: string | null | undefined): AvatarVariant[] {
    if (!personaId) return [];
    return this.avatarVariantsByPersona[personaId] ?? [];
  }

  /** Nom sous lequel les personnages désignent l'utilisateur. */
  get userName(): string {
    return this.settings.userName.trim() || this.pack.scene.userLabel;
  }

  /** Roster de la scène, tel que le directeur l'attend. */
  get roster(): Participant[] {
    return this.participants.map((p) => ({ id: p.id, name: p.name }));
  }

  /** Nom affiché du locuteur d'un message, même si la persona a disparu. */
  labelFor = (message: Message): string => {
    if (message.kind === "narration") return t().app.narrationSpeaker;
    if (message.role === "user") return this.userName;
    const persona = message.personaId
      ? this.personas.find((p) => p.id === message.personaId)
      : undefined;
    return persona?.name ?? message.personaName ?? this.pack.scene.unknownSpeakerLabel;
  };

  /**
   * À qui une réplique s'adressait, vu par `readerId`. « toi » quand c'est
   * lui — sans quoi le tutoiement d'une réplique transmise reste ambigu.
   */
  addresseeLabelFor(readerId: string) {
    return (message: Message): string | null => {
      const target = message.addressee;
      if (!target || target === message.personaId) return null;
      if (target === readerId) return "toi";
      if (target === USER_ADDRESSEE) return this.userName;
      return this.personas.find((p) => p.id === target)?.name ?? null;
    };
  }

  personaNamesOf(conversationId: string): string[] {
    const ids = this.participantsByConversation[conversationId] ?? [];
    return ids
      .map((id) => this.personas.find((p) => p.id === id)?.name)
      .filter((n): n is string => Boolean(n));
  }

  /**
   * Nombre de répliques enchaînées depuis le dernier message de l'utilisateur.
   * Sert à borner les échanges entre personnages.
   */
  get consecutiveAiTurns(): number {
    let count = 0;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      // Une didascalie relance la scène : elle remet le compteur à zéro.
      if (this.messages[i].role === "user") break;
      count += 1;
    }
    return count;
  }

  /**
   * Vrai quand la scène attend réellement l'utilisateur. C'est la seule
   * condition qui doit gouverner la zone de saisie : `turnInProgress` seul
   * laissait passer la régénération, dont l'envoi retombait ensuite dans le
   * vide sans que rien ne l'explique.
   */
  get userHasFloor(): boolean {
    return (
      !this.streaming &&
      !this.turnInProgress &&
      !this.directing &&
      !this.summarizing
    );
  }

  /** Ce qui occupe la scène en ce moment, du plus visible au plus discret. */
  get turnPhase(): TurnPhase {
    if (this.streaming) return "speaking";
    if (this.directing) return "directing";
    if (this.summarizing) return "compressing";
    if (this.turnInProgress) return "wrapping";
    return "idle";
  }

  get canContinueScene(): boolean {
    return (
      !this.streaming &&
      this.participants.length > 1 &&
      this.messages.length > 0 &&
      this.consecutiveAiTurns <
        this.participants.length * MAX_CONSECUTIVE_AI_TURNS
    );
  }

  // -------------------------------------------------------------------------
  // Chargement initial
  // -------------------------------------------------------------------------

  async init(): Promise<void> {
    this.settings = await settingsRepo.load();
    setUiLocale(this.settings.uiLocale);
    // Reprend au besoin l'ancienne configuration unique : au premier
    // démarrage après mise à jour, elle devient la première connexion.
    this.connections = await connectionRepo.listOrSeed();
    if (
      !this.settings.activeConnectionId ||
      !this.connections.some((c) => c.id === this.settings.activeConnectionId)
    ) {
      this.settings.activeConnectionId = this.connections[0]?.id ?? null;
      await this.saveSettings();
    }
    this.personas = await personaRepo.list();
    this.conversations = await conversationRepo.list();
    await this.reloadParticipantIndex();
    // Aucun salon n'est ouvert d'office : on entre dans une salle vide, et
    // c'est l'utilisateur qui lève le rideau.
    await this.refreshEmotionalState();
    this.loaded = true;
    void this.refreshConnection();
    setInterval(() => void this.refreshConnection(), 30_000);
  }

  private async reloadParticipantIndex(): Promise<void> {
    const rows = await participantRepo.listAll();
    const index: Record<string, string[]> = {};
    for (const row of rows) {
      (index[row.conversationId] ??= []).push(row.personaId);
    }
    this.participantsByConversation = index;
  }

  async refreshConnection(): Promise<void> {
    const target = this.target;
    if (!target) {
      this.connected = false;
      return;
    }
    try {
      await testConnection(target);
      this.connected = true;
      if (this.models.length === 0) await this.refreshModels();
    } catch {
      this.connected = false;
    }
  }

  async refreshModels(): Promise<void> {
    const target = this.target;
    if (!target) {
      this.models = [];
      return;
    }
    try {
      this.models = await listModels(target);
    } catch {
      this.models = [];
    }
  }

  /**
   * Capacité retenue pour un modèle. La liste des modèles est rafraîchie à
   * chaque connexion : la valeur annoncée par le serveur y est donc à jour, y
   * compris après un rechargement du modèle avec une autre capacité.
   */
  contextBudgetFor(modelId: string, manual?: number): ContextBudget {
    return resolveContextBudget({
      manual,
      detected: this.models.find((m) => m.id === modelId)?.contextLength,
      fallback: this.settings.logicalContextTokens,
    });
  }

  async saveSettings(): Promise<void> {
    // L'interface se retraduit immédiatement : attendre l'écriture disque
    // ferait clignoter le réglage qu'on vient de changer.
    setUiLocale(this.settings.uiLocale);
    await settingsRepo.save(this.settings);
  }

  /**
   * Pack de prompts de la langue de jeu. Distinct de la langue de l'interface :
   * c'est lui qui décide dans quelle langue les personnages répondent.
   */
  get pack() {
    return promptPack(this.settings.conversationLanguage);
  }

  // -------------------------------------------------------------------------
  // Conversations et composition de la scène
  // -------------------------------------------------------------------------

  async openConversation(id: string): Promise<void> {
    this.cancelIdleChatter();
    // Un message en attente appartient à la scène où il a été écrit ; il ne
    // doit pas suivre l'utilisateur dans une autre conversation.
    this.queuedMessage = null;
    this.pendingSceneActions = [];
    if (this.streaming) await this.cancelGeneration();
    this.currentConversationId = id;
    this.messages = await messageRepo.list(id);
    this.lastPromptTokens = null;
    this.lastPromptContextTokens = null;
    this.lastReplyTokenBudget = null;
    this.view = "chat";
    const participants = await participantRepo.list(id);
    this.participantIds = participants.filter((p) => p.active).map((p) => p.personaId);
    this.participantsByConversation = {
      ...this.participantsByConversation,
      [id]: participants.map((p) => p.personaId),
    };
    this.composerTargetId = null;
    await this.refreshEmotionalState();
  }

  /** Rebaisse le rideau : plus aucun salon à l'écran. */
  closeConversation(): void {
    this.cancelIdleChatter();
    this.queuedMessage = null;
    this.pendingSceneActions = [];
    this.currentConversationId = null;
    this.messages = [];
    this.participantIds = [];
    this.composerTargetId = null;
    this.lastPromptTokens = null;
    this.lastPromptContextTokens = null;
    this.lastReplyTokenBudget = null;
  }

  /** Nouvelle conversation ; `personaIds` définit la scène, le premier est principal. */
  async newConversation(
    personaIds: string[],
    options: { title?: string; sceneDescription?: string | null } = {},
  ): Promise<void> {
    const ids = personaIds.filter(Boolean);
    if (ids.length === 0) {
      this.view = "personas";
      return;
    }
    const conv = await conversationRepo.create(
      ids[0],
      options.title?.trim() || "Nouvelle conversation",
      ids,
      options.sceneDescription?.trim() || null,
    );
    this.conversations = [conv, ...this.conversations];
    this.participantsByConversation = {
      ...this.participantsByConversation,
      [conv.id]: ids,
    };
    await this.openConversation(conv.id);
  }

  async deleteConversation(id: string): Promise<void> {
    await conversationRepo.remove(id);
    this.conversations = this.conversations.filter((c) => c.id !== id);
    const index = { ...this.participantsByConversation };
    delete index[id];
    this.participantsByConversation = index;
    if (this.currentConversationId === id) {
      this.closeConversation();
    }
  }

  /**
   * Redéfinit la scène d'une conversation. Un personnage qui rejoint ne voit
   * que le résumé et les messages récents ; un personnage qui part laisse ses
   * répliques dans l'historique.
   */
  async setParticipants(personaIds: string[]): Promise<void> {
    const conv = this.currentConversation;
    if (!conv || personaIds.length === 0) return;
    await participantRepo.replace(conv.id, personaIds);
    this.participantIds = personaIds;
    this.participantsByConversation = {
      ...this.participantsByConversation,
      [conv.id]: personaIds,
    };
    if (!personaIds.includes(conv.personaId)) {
      const updated = { ...conv, personaId: personaIds[0] };
      await conversationRepo.update(updated);
      this.conversations = this.conversations.map((c) =>
        c.id === conv.id ? updated : c,
      );
    }
    if (this.composerTargetId && !personaIds.includes(this.composerTargetId)) {
      this.composerTargetId = null;
    }
    await this.refreshEmotionalState();
  }

  async addParticipant(personaId: string): Promise<void> {
    if (this.participantIds.includes(personaId)) return;
    await this.setParticipants([...this.participantIds, personaId]);
  }

  async removeParticipant(personaId: string): Promise<void> {
    const remaining = this.participantIds.filter((id) => id !== personaId);
    if (remaining.length === 0) return;
    await this.setParticipants(remaining);
  }

  /** Modifie la situation de départ de la conversation courante. */
  async setSceneDescription(text: string): Promise<void> {
    const conv = this.currentConversation;
    if (!conv) return;
    const updated = { ...conv, sceneDescription: text.trim() || null };
    await conversationRepo.update(updated);
    this.conversations = this.conversations.map((c) =>
      c.id === conv.id ? updated : c,
    );
  }

  /** Réordonne la parole d'un participant d'un cran. */
  async moveParticipant(personaId: string, delta: -1 | 1): Promise<void> {
    const ids = [...this.participantIds];
    const from = ids.indexOf(personaId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await this.setParticipants(ids);
  }

  /** Insère une didascalie : elle n'appartient à aucun locuteur. */
  private async addNarration(
    conversationId: string,
    text: string,
  ): Promise<Message | null> {
    const content = text.trim();
    if (!content) return null;
    const message = await messageRepo.create(
      conversationId,
      "user",
      content,
      "complete",
      null,
      "narration",
    );
    if (this.currentConversationId === conversationId) {
      this.messages = [...this.messages, message];
    }
    return message;
  }

  /**
   * Fait entrer un personnage en cours de conversation. La didascalie est
   * rédigée par l'utilisateur : c'est elle qui informe les autres personnages
   * de l'arrivée, l'entrant retrouvant le fil par le résumé et les messages
   * récents.
   */
  async enterScene(
    personaId: string,
    description: string,
    react = true,
  ): Promise<void> {
    const conv = this.currentConversation;
    const persona = this.personas.find((p) => p.id === personaId);
    if (!conv || !persona) return;
    if (this.streaming || this.turnInProgress) {
      this.pendingSceneActions = [
        ...this.pendingSceneActions,
        { kind: "enter", personaId, description, react },
      ];
      this.interruptScene();
      this.notice = t().app.personaWillEnter(persona.name);
      return;
    }
    if (this.participantIds.includes(personaId)) return;

    await participantRepo.join(conv.id, personaId);
    const participants = await participantRepo.list(conv.id);
    this.participantIds = participants.filter((p) => p.active).map((p) => p.personaId);
    this.participantsByConversation = {
      ...this.participantsByConversation,
      [conv.id]: this.participantIds,
    };
    await this.refreshEmotionalState();
    await this.addNarration(conv.id, description);
    if (react) await this.reactToScene(conv.id);
  }

  /** Fait sortir un personnage ; ses répliques restent dans l'historique. */
  async leaveScene(
    personaId: string,
    description: string,
    react = true,
  ): Promise<void> {
    const conv = this.currentConversation;
    const persona = this.personas.find((p) => p.id === personaId);
    if (!conv || !persona) return;
    if (this.streaming || this.turnInProgress) {
      this.pendingSceneActions = [
        ...this.pendingSceneActions,
        { kind: "leave", personaId, description, react },
      ];
      this.interruptScene();
      this.notice = t().app.personaWillLeave(persona.name);
      return;
    }
    if (this.participantIds.length <= 1) return;
    if (!this.participantIds.includes(personaId)) return;

    await participantRepo.leave(conv.id, personaId);
    this.participantIds = this.participantIds.filter((id) => id !== personaId);
    this.participantsByConversation = {
      ...this.participantsByConversation,
      [conv.id]: this.participantIds,
    };
    if (this.composerTargetId === personaId) this.composerTargetId = null;
    if (!this.participantIds.includes(conv.personaId)) {
      const updated = { ...conv, personaId: this.participantIds[0] };
      await conversationRepo.update(updated);
      this.conversations = this.conversations.map((c) =>
        c.id === conv.id ? updated : c,
      );
    }
    await this.addNarration(conv.id, description);
    if (react) await this.reactToScene(conv.id);
  }

  /** Un tour de réaction à une didascalie, sans message de l'utilisateur. */
  private async reactToScene(conversationId: string): Promise<void> {
    if (this.participantIds.length === 0) return;
    await this.withTurn(async () => {
      await this.playRound(conversationId, [...this.participantIds], () =>
        describeSceneEvent(this.userName, this.pack),
      );
      this.pendingSpeakerIds = [];
      await this.runPostTurnTasks(conversationId);
    });
  }

  /** Remplace la scène par une seule persona (ancien « changer de persona »). */
  async changeConversationPersona(personaId: string): Promise<void> {
    const conv = this.currentConversation;
    if (!conv) return;
    const updated = { ...conv, personaId };
    await conversationRepo.update(updated);
    this.conversations = this.conversations.map((c) =>
      c.id === conv.id ? updated : c,
    );
    await this.setParticipants([personaId]);
  }

  // -------------------------------------------------------------------------
  // État émotionnel et avatars
  // -------------------------------------------------------------------------

  async refreshEmotionalState(): Promise<void> {
    const targets = new Set<string>();
    for (const persona of this.participants) targets.add(persona.id);
    const active = this.activePersona;
    if (active) targets.add(active.id);
    if (!this.settings.emotionEnabled) {
      this.emotionalStates = {};
      this.emotionalReactions = {};
      this.avatarVariantsByPersona = {};
      return;
    }
    const now = new Date();
    const states: Record<string, EmotionalState> = {};
    const variants: Record<string, AvatarVariant[]> = {};
    for (const personaId of targets) {
      const persona = this.personas.find((p) => p.id === personaId);
      if (!persona) continue;
      const stored = (await emotionRepo.get(personaId)) ?? neutralState(personaId, now);
      const temporal = buildTemporalContext(now, stored.updatedAt, this.pack);
      states[personaId] = applyDecay(stored, now, temporal.dayPeriod);
      variants[personaId] = persona.avatarSetId
        ? await avatarRepo.variants(persona.avatarSetId)
        : [];
    }
    this.emotionalStates = states;
    this.avatarVariantsByPersona = variants;
  }

  async resetEmotionalState(personaId: string): Promise<void> {
    const state = neutralState(personaId, new Date());
    await emotionRepo.save(state);
    this.emotionalStates = { ...this.emotionalStates, [personaId]: state };
    this.emotionalReactions = { ...this.emotionalReactions, [personaId]: null };
  }

  // -------------------------------------------------------------------------
  // Envoi de message et tours de parole
  // -------------------------------------------------------------------------

  /**
   * Écrire quand la parole n'est pas encore revenue n'est pas une erreur :
   * le message est mis de côté et part de lui-même à la fin du tour.
   */
  queueMessage(text: string, mode: "speech" | "scene"): void {
    const content = text.trim();
    if (!content) return;
    this.queuedMessage = { text: content, mode };
    this.cancelIdleChatter();
  }

  /**
   * L'utilisateur reprend la parole pendant que les personnages échangent
   * entre eux. On ne coupe pas celui qui est en train de parler — sa réplique
   * va à son terme — mais les tours prévus derrière lui tombent.
   */
  interruptScene(): void {
    if (!this.autonomousTurn) return;
    this.turnAborted = true;
    this.pendingSpeakerIds = [];
  }

  /** Reprend le message en attente pour le remettre dans la zone de saisie. */
  unqueueMessage(): string {
    const pending = this.queuedMessage;
    this.queuedMessage = null;
    return pending?.text ?? "";
  }

  /** Envoie le message mis en attente, une fois la parole revenue. */
  private async flushQueuedMessage(): Promise<void> {
    const pending = this.queuedMessage;
    if (!pending) return;
    if (!this.userHasFloor) {
      // La scène a repris la parole entre-temps. On retente : un message mis
      // en file doit finir par partir, jamais rester coincé.
      setTimeout(() => void this.flushQueuedMessage(), 150);
      return;
    }
    this.queuedMessage = null;
    if (pending.mode === "scene") await this.sendSceneEvent(pending.text);
    else await this.sendMessage(pending.text);
  }

  /** Joue la prochaine entrée/sortie mise en attente. */
  private async flushPendingSceneAction(): Promise<void> {
    if (this.flushingSceneAction) return;
    const pending = this.pendingSceneActions[0];
    if (!pending) return;
    if (!this.userHasFloor) {
      setTimeout(() => void this.flushPendingSceneAction(), 150);
      return;
    }
    this.flushingSceneAction = true;
    this.pendingSceneActions = this.pendingSceneActions.slice(1);
    try {
      if (pending.kind === "enter") {
        await this.enterScene(
          pending.personaId,
          pending.description,
          pending.react,
        );
      } else {
        await this.leaveScene(
          pending.personaId,
          pending.description,
          pending.react,
        );
      }
    } finally {
      this.flushingSceneAction = false;
      // Un tour de réaction appelle aussi `releaseFloor`, mais pendant que ce
      // vidage est verrouillé. On relance donc la file une fois l'action finie.
      if (this.userHasFloor) this.releaseFloor();
    }
  }

  /**
   * Fin de tour : soit un message attendait son moment, soit le silence de
   * l'utilisateur recommence à compter.
   */
  private releaseFloor(): void {
    if (this.pendingSceneActions.length > 0) {
      setTimeout(() => void this.flushPendingSceneAction(), 0);
      return;
    }
    if (this.queuedMessage) {
      // Le tour courant n'a pas fini de se dérouler ; on laisse la pile se
      // vider avant de relancer, sinon les garde-fous d'envoi refusent.
      setTimeout(() => void this.flushQueuedMessage(), 0);
      return;
    }
    this.scheduleIdleChatter();
  }

  async sendMessage(text: string): Promise<void> {
    const content = text.trim();
    if (!content) return;
    // La parole n'était pas revenue — la scène a repris juste avant l'envoi.
    // Mettre de côté plutôt que jeter : sans cela le message apparaissait à
    // l'écran sans que personne n'y réponde jamais.
    if (this.streaming || this.turnInProgress) {
      this.queueMessage(content, "speech");
      return;
    }
    this.cancelIdleChatter();
    this.errorBanner = null;

    let conv = this.requireConversation();
    if (!conv) return;

    // Le destinataire est résolu ici, avec le plan du directeur : le déduire
    // du texte à l'affichage raterait le choix fait dans « Répondre : ».
    const plan = planSpeakers(
      content,
      this.roster,
      this.composerTargetId,
      this.pack,
    );
    const userMessage = await messageRepo.create(
      conv.id,
      "user",
      content,
      "complete",
      null,
      "speech",
      plan.reason !== "all" && plan.personaIds.length === 1
        ? plan.personaIds[0]
        : null,
    );
    this.messages = [...this.messages, userMessage];

    conv = await this.titleFromFirstMessage(conv, content);

    await this.runTurns(conv.id, plan.personaIds, this.addressingFor(plan));
  }

  /**
   * Un salon ne naît jamais par accident : il se crée depuis le lever de
   * rideau, avec sa distribution et sa situation de départ. Écrire dans le
   * vide renvoie donc à cet écran plutôt que d'improviser une scène sans décor.
   */
  private requireConversation(): Conversation | null {
    const current = this.currentConversation;
    if (current) return current;
    this.view = "new-chat";
    return null;
  }

  private async titleFromFirstMessage(
    conv: Conversation,
    content: string,
  ): Promise<Conversation> {
    if (conv.title !== "Nouvelle conversation") return conv;
    const title = content.length > 48 ? `${content.slice(0, 48)}…` : content;
    const updated = { ...conv, title };
    await conversationRepo.update(updated);
    this.conversations = this.conversations.map((c) =>
      c.id === updated.id ? updated : c,
    );
    return updated;
  }

  /**
   * Événement de scène décrit par l'utilisateur : un bruit, une sonnette, une
   * lumière qui s'éteint. Ce n'est la parole de personne — c'est une
   * didascalie, transmise sans locuteur, à laquelle les personnages réagissent.
   */
  async sendSceneEvent(text: string): Promise<void> {
    const content = text.trim();
    if (!content) return;
    if (this.streaming || this.turnInProgress) {
      this.queueMessage(content, "scene");
      return;
    }
    this.cancelIdleChatter();
    this.errorBanner = null;

    let conv = this.requireConversation();
    if (!conv) return;
    await this.addNarration(conv.id, content);
    conv = await this.titleFromFirstMessage(conv, content);
    await this.runTurns(conv.id, [...this.participantIds], () =>
      describeSceneEvent(this.userName, this.pack),
    );
  }

  /**
   * Laisse le personnage suivant réagir sans nouveau message de l'utilisateur.
   * C'est aussi ce que déclenche la minuterie de silence.
   */
  async continueScene(silent = false): Promise<void> {
    const conv = this.currentConversation;
    if (!conv || this.streaming || this.turnInProgress) return;
    if (!this.canContinueScene) {
      if (!silent) {
        this.notice = t().app.autoTurnsExhausted;
      }
      return;
    }
    const order = planContinuation(this.roster, this.lastSpeakerId());
    if (order.length === 0) return;
    // La consultation du metteur en scène fait déjà partie du tour autonome :
    // l'utilisateur doit pouvoir la couper comme le reste, et elle doit se
    // dérouler *sous* le verrou — sinon un message envoyé pendant qu'on décide
    // trouvait la scène libre puis se faisait refuser le tour qui suit.
    await this.withTurn(async () => {
      this.autonomousTurn = true;
      const speakers = await this.decideSpeakers(order.slice(0, 1), {
        afterUserMessage: false,
        consultModel: true,
      });
      // Personne n'a de raison de parler, ou l'utilisateur a écrit pendant
      // qu'on décidait : dans les deux cas la scène lui rend la parole plutôt
      // que d'ouvrir un tour qu'il faudrait aussitôt interrompre.
      if (speakers.length === 0 || this.queuedMessage) return;
      await this.playTurn(conv.id, speakers, () =>
        describeAutonomousTurn(this.userName, this.pack),
      );
    });
  }

  // -------------------------------------------------------------------------
  // Reprise automatique après un silence
  // -------------------------------------------------------------------------

  /**
   * Programme la reprise de la scène si l'utilisateur reste silencieux.
   * Le plafond `MAX_CONSECUTIVE_AI_TURNS` continue de s'appliquer : passé ce
   * point la minuterie s'arrête, et seul un message la relance.
   */
  private scheduleIdleChatter(): void {
    this.cancelIdleChatter();
    const seconds = this.settings.idleChatterSeconds;
    // Le silence de l'utilisateur ne compte pas quand il a justement écrit :
    // aucune reprise autonome tant que son message n'est pas parti.
    if (this.queuedMessage) return;
    if (this.idlePaused || seconds <= 0 || this.streaming) return;
    if (this.participants.length < 2 || !this.canContinueScene) return;
    const delay = seconds * 1000;
    this.idleResumeAt = Date.now() + delay;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.idleResumeAt = null;
      void this.continueScene(true);
    }, delay);
  }

  /** Annule la reprise programmée : l'utilisateur s'est manifesté. */
  cancelIdleChatter(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.idleResumeAt = null;
  }

  /** Suspend ou relance la vie autonome de la scène. */
  toggleIdlePause(): void {
    this.idlePaused = !this.idlePaused;
    if (this.idlePaused) {
      this.cancelIdleChatter();
    } else {
      this.scheduleIdleChatter();
    }
  }

  /**
   * Frappe au clavier, ouverture d'un panneau : l'utilisateur est là, on
   * repousse la reprise plutôt que de lui couper la parole.
   */
  noteUserActivity(): void {
    if (this.idleTimer !== null) this.scheduleIdleChatter();
  }

  /**
   * Ordre de parole du tour. Le choix explicite de l'utilisateur — mention,
   * apostrophe, sélecteur — n'est jamais soumis au modèle : c'est une
   * instruction, pas une suggestion. Le directeur n'intervient que lorsque le
   * message s'adresse à la cantonade, et son échec retombe sur `fallback`.
   */
  private async decideSpeakers(
    fallback: string[],
    options: { afterUserMessage: boolean; consultModel: boolean },
  ): Promise<string[]> {
    const modelId = this.activeModelId;
    const target = this.target;
    if (
      !options.consultModel ||
      this.settings.sceneDirector !== "model" ||
      !modelId ||
      !target ||
      this.participants.length < 2
    ) {
      return fallback;
    }
    this.directing = true;
    try {
      const profile = await profileRepo.get(modelId);
      const chosen = await chooseSpeakers({
        connection: target,
        modelId,
        extraParameters: profile.customParameters,
        participants: this.roster,
        descriptions: Object.fromEntries(
          this.participants.map((p) => [p.id, p.description]),
        ),
        recentMessages: this.messages,
        label: this.labelFor,
        userName: this.userName,
        afterUserMessage: options.afterUserMessage,
        pack: this.pack,
      });
      if (chosen === null) return fallback;
      // Après un message de l'utilisateur, le silence général serait vécu
      // comme une panne : on rend la main au tour de table.
      if (chosen.length === 0) return options.afterUserMessage ? fallback : [];
      return chosen;
    } finally {
      this.directing = false;
    }
  }

  private lastSpeakerId(): string | null {
    return (
      [...this.messages].reverse().find((m) => m.role === "assistant")?.personaId ??
      null
    );
  }

  /** Consigne de destinataire à donner à chaque locuteur du tour. */
  private addressingFor(plan: SpeakerPlan): (speakerId: string) => string {
    return (speakerId) =>
      describeAddressing(plan, this.roster, speakerId, this.userName, this.pack);
  }

  /**
   * Verrou de la scène : un seul tour à la fois, quelle qu'en soit l'origine —
   * message, didascalie, régénération, reprise après silence.
   *
   * Il ne suffit pas de tester `streaming` : entre deux locuteurs d'un même
   * tour, pendant la consultation du metteur en scène ou pendant l'analyse
   * émotionnelle, plus personne n'écrit alors que le tour n'est pas fini. Deux
   * tours lancés dans cet intervalle se chevauchaient, écrivaient tous deux
   * dans le même flux de streaming, et rendaient la conversation incohérente.
   *
   * Retourne false si la scène était déjà occupée : l'appelant décide alors
   * quoi faire de ce qu'il voulait jouer.
   */
  private async withTurn(body: () => Promise<void>): Promise<boolean> {
    if (this.turnInProgress) return false;
    this.turnInProgress = true;
    this.turnAborted = false;
    try {
      await body();
    } finally {
      this.pendingSpeakerIds = [];
      this.autonomousTurn = false;
      this.turnInProgress = false;
      // C'est seulement maintenant que la parole revient à l'utilisateur.
      this.releaseFloor();
    }
    return true;
  }

  /** Déroulé d'un tour. À n'appeler que sous le verrou de `withTurn`. */
  private async playTurn(
    conversationId: string,
    speakerIds: string[],
    addressing: (speakerId: string) => string,
  ): Promise<void> {
    // Pré-vol : le tour qui franchit le seuil profite déjà de la compression,
    // au lieu de retraiter une dernière fois tout l'historique devenu lourd.
    await this.maybeSummarize(conversationId);
    const completed = await this.playRound(conversationId, speakerIds, addressing);
    this.pendingSpeakerIds = [];
    if (completed) await this.playAutoRounds(conversationId);
    await this.runPostTurnTasks(conversationId);
  }

  /**
   * Fait parler les personnages l'un après l'autre : une requête par locuteur,
   * chacun voyant les répliques de ceux qui viennent de passer.
   */
  private async runTurns(
    conversationId: string,
    speakerIds: string[],
    addressing: (speakerId: string) => string,
    autonomous = false,
  ): Promise<void> {
    await this.withTurn(async () => {
      this.autonomousTurn = autonomous;
      await this.playTurn(conversationId, speakerIds, addressing);
    });
  }

  /** Un passage de parole ; retourne false si le tour a été interrompu. */
  private async playRound(
    conversationId: string,
    speakerIds: string[],
    addressing: (speakerId: string) => string,
  ): Promise<boolean> {
    this.pendingSpeakerIds = [...speakerIds];
    for (const speakerId of speakerIds) {
      if (this.turnAborted) return false;
      this.pendingSpeakerIds = this.pendingSpeakerIds.filter((id) => id !== speakerId);
      const conv = this.conversations.find((c) => c.id === conversationId);
      const speaker = this.personas.find((p) => p.id === speakerId);
      if (!conv || !speaker) continue;
      if (!this.target) {
        this.errorBanner = t().app.noConnection;
        return false;
      }
      const modelId = this.activeModelId;
      if (!modelId) {
        this.errorBanner = t().app.noModel;
        return false;
      }
      const done = await this.generateReply(
        conv,
        speaker,
        modelId,
        addressing(speakerId),
      );
      if (!done) return false;
    }
    return true;
  }

  /**
   * Échanges automatiques entre personnages, une fois l'utilisateur servi.
   * Trois garde-fous : le nombre de tours réglé, le plafond dur
   * `MAX_CONSECUTIVE_AI_TURNS` par personnage, et l'annulation manuelle.
   */
  private async playAutoRounds(conversationId: string): Promise<void> {
    const rounds = clampAutoRounds(this.settings.sceneAutoRounds);
    if (this.idlePaused || rounds <= 0 || this.participants.length < 2) return;
    // Un message écrit pendant qu'on répondait à l'utilisateur attend déjà son
    // tour : lui faire regarder les personnages bavarder entre eux avant de le
    // lire serait précisément l'attente qu'on cherche à supprimer.
    if (this.queuedMessage) return;
    // À partir d'ici l'utilisateur a été servi : ce qui suit lui appartient
    // moins qu'à la scène, et il peut le couper court.
    this.autonomousTurn = true;
    for (let round = 0; round < rounds; round++) {
      if (this.turnAborted || this.queuedMessage || !this.canContinueScene) break;
      const order = planContinuation(this.roster, this.lastSpeakerId());
      if (order.length === 0) break;
      // Le plafond peut tomber en cours de tour : on tronque à ce qui reste.
      const budget =
        this.participants.length * MAX_CONSECUTIVE_AI_TURNS -
        this.consecutiveAiTurns;
      if (budget <= 0) break;
      const speakers = await this.decideSpeakers(order, {
        afterUserMessage: false,
        consultModel: true,
      });
      // Le metteur en scène peut juger que la scène est retombée.
      if (speakers.length === 0) break;
      const completed = await this.playRound(
        conversationId,
        speakers.slice(0, Math.min(speakers.length, budget)),
        () => describeAutonomousTurn(this.userName, this.pack),
      );
      this.pendingSpeakerIds = [];
      if (!completed) break;
    }
  }

  /** Retourne true si la réponse s'est terminée normalement. */
  private async generateReply(
    conv: Conversation,
    speaker: Persona,
    modelId: string,
    addressing: string | null = null,
  ): Promise<boolean> {
    const target = this.target;
    if (!target) {
      this.errorBanner = t().app.noConnection;
      return false;
    }
    // Contexte temporel calculé avant de toucher lastInteractionAt.
    const now = new Date();
    const temporal = buildTemporalContext(now, conv.lastInteractionAt, this.pack);

    // Décroissance appliquée à la lecture, persistée.
    let state: EmotionalState | null = null;
    if (this.settings.emotionEnabled) {
      const stored =
        (await emotionRepo.get(speaker.id)) ?? neutralState(speaker.id, now);
      state = applyDecay(stored, now, temporal.dayPeriod);
      await emotionRepo.save(state);
      this.emotionalStates = { ...this.emotionalStates, [speaker.id]: state };
    }

    const others = this.participants.filter((p) => p.id !== speaker.id);
    const otherNames = others.map((p) => p.name);
    const scene: SceneInput | null =
      otherNames.length > 0
        ? {
            speakerId: speaker.id,
            speakerName: speaker.name,
            speakerGender: speaker.gender,
            otherNames,
            others: others.map((p) => ({ name: p.name, gender: p.gender })),
            userGender: this.settings.userGender,
            label: this.labelFor,
            addresseeLabel: this.addresseeLabelFor(speaker.id),
            userLabel: this.userName,
            addressing,
          }
        : null;

    const profile = await profileRepo.get(modelId);
    const recent = uncoveredMessages(this.messages, conv.summaryThroughMessageId);

    // Ce à quoi le personnage réagit : dernier bloc non signé de lui. Cette
    // évaluation précède la génération pour affecter la réplique en cours.
    const transcript = renderTranscript(
      recent,
      speaker.id,
      this.labelFor,
      undefined,
      this.pack,
    );
    const precedingTurn =
      [...transcript].reverse().find((m) => m.role === "user")?.content ?? "";
    let immediateReaction: EmotionalReaction | null = null;
    if (
      state &&
      this.settings.emotionAnalysisEnabled &&
      precedingTurn.trim().length > 0
    ) {
      const assessment = await assessEmotionalReaction(
        target,
        modelId,
        speaker,
        state,
        precedingTurn,
        profile.customParameters,
        this.pack,
      );
      state = assessment.state;
      immediateReaction = assessment.reaction;
      this.emotionalStates = {
        ...this.emotionalStates,
        [speaker.id]: assessment.state,
      };
    }
    this.emotionalReactions = {
      ...this.emotionalReactions,
      [speaker.id]: immediateReaction,
    };

    // Rappel factuel de l'état du tour : qui a parlé en dernier, à qui, et
    // depuis combien de temps l'utilisateur s'est tu.
    const lastSpoken = [...recent]
      .reverse()
      .find((m) => m.kind === "speech" && m.id !== undefined && m.content.trim());
    const turnContext = describeLastTurn(
      {
        lastSpeakerName: lastSpoken ? this.labelFor(lastSpoken) : null,
        lastAddresseeName: lastSpoken
          ? this.addresseeLabelFor(speaker.id)(lastSpoken)
          : null,
        userName: this.userName,
        userSilentTurns: this.consecutiveAiTurns,
      },
      this.pack,
    );
    if (scene && turnContext) {
      scene.addressing = [turnContext, scene.addressing].filter(Boolean).join("\n");
    }


    const contextTokens = this.contextBudgetFor(modelId, profile.contextWindow).tokens;
    // La longueur choisie dans la fiche du personnage est une vraie limite,
    // jamais un simple indice visuel. Elle réserve la même place dans le prompt
    // que celle demandée au serveur.
    const replyTokenBudget = effectiveMaxOutputTokens(speaker.maxOutputTokens);
    const assembled = assemblePrompt({
      persona: speaker,
      userName: this.userName,
      userGender: this.settings.userGender,
      state,
      immediateReaction,
      temporal,
      summary: conv.summary,
      recentMessages: recent,
      sceneDescription: conv.sceneDescription,
      contextTokens,
      reserveOutputTokens: replyTokenBudget,
      scene,
      pack: this.pack,
    });
    if (assembled.error) {
      this.errorBanner = assembled.error;
      return false;
    }
    this.lastPromptTokens = assembled.estimatedTokens;
    this.lastPromptContextTokens = contextTokens;
    this.lastReplyTokenBudget = replyTokenBudget;

    const body = buildRequestBody({
      connection: target,
      modelId,
      messages: assembled.messages,
      persona: speaker,
      profile,
      stream: true,
      temperatureOverride: this.temperatureOverride ?? undefined,
      maxTokensOverride: replyTokenBudget,
    });
    if (scene) {
      // Garde-fou principal contre l'usurpation d'un autre personnage.
      body.stop = speakerStopSequences(otherNames, this.userName, this.pack);
    }

    const assistantMessage = await messageRepo.create(
      conv.id,
      "assistant",
      "",
      "streaming",
      { id: speaker.id, name: speaker.name },
    );
    this.messages = [...this.messages, assistantMessage];
    this.streaming = true;
    this.streamingContent = "";
    this.streamingPersonaId = speaker.id;
    const requestId = newId();
    this.streamRequestId = requestId;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finalize = async (status: "complete" | "cancelled" | "error") => {
        if (settled) return;
        settled = true;
        const raw = this.streamingContent;
        const content = scene
          ? cleanSpeakerReply(raw, speaker.name, otherNames, this.userName)
          : raw;
        // À qui le personnage vient de parler, figé une fois pour toutes.
        const addressee = scene
          ? (detectAddressee(content, [
              { id: USER_ADDRESSEE, name: this.userName },
              ...others.map((p) => ({ id: p.id, name: p.name })),
            ])?.id ?? null)
          : null;
        this.streaming = false;
        this.streamRequestId = null;
        this.streamingPersonaId = null;
        this.streamingContent = "";
        if (status === "error" && !content) {
          // Aucune réponse partielle : retirer le message vide.
          await messageRepo.remove(assistantMessage.id);
          this.messages = this.messages.filter((m) => m.id !== assistantMessage.id);
          resolve(false);
          return;
        }
        await messageRepo.update(assistantMessage.id, content, status, addressee);
        this.messages = this.messages.map((m) =>
          m.id === assistantMessage.id ? { ...m, content, status, addressee } : m,
        );
        const touchedAt = await conversationRepo.touch(conv.id);
        this.conversations = this.conversations
          .map((c) =>
            c.id === conv.id
              ? { ...c, lastInteractionAt: touchedAt, updatedAt: touchedAt }
              : c,
          )
          .sort(
            (a, b) =>
              (b.lastInteractionAt ?? b.updatedAt).localeCompare(
                a.lastInteractionAt ?? a.updatedAt,
              ),
          );

        resolve(status === "complete");
      };

      streamChat(target, requestId, body, {
        onDelta: (delta) => {
          this.streamingContent += delta;
          const partial = this.streamingContent;
          this.messages = this.messages.map((m) =>
            m.id === assistantMessage.id ? { ...m, content: partial } : m,
          );
        },
        onDone: () => void finalize("complete"),
        onCancelled: () => void finalize("cancelled"),
        onError: (message) => {
          this.errorBanner = message;
          this.connected = message.includes("connecter") ? false : this.connected;
          void finalize("error");
        },
      }).catch((e) => {
        this.errorBanner = String(e);
        void finalize("error");
      });
    });
  }

  /**
   * Tâche annexe jouée une fois le tour terminé et le serveur libre. L'analyse
   * émotionnelle a déjà eu lieu avant chaque réplique ; il ne reste que le résumé.
   */
  private async runPostTurnTasks(conversationId: string): Promise<void> {
    await this.maybeSummarize(conversationId);
  }

  /** Reconstruit à la demande la mémoire depuis les messages d'origine. */
  async regenerateSummary(
    conversationId: string | null = this.currentConversationId,
  ): Promise<void> {
    if (!conversationId || this.summarizing) return;
    if (this.turnInProgress) {
      this.notice = t().app.waitBeforeRebuildingSummary;
      return;
    }
    const conv = this.conversations.find((c) => c.id === conversationId);
    const modelId = this.activeModelId;
    const target = this.target;
    if (!conv || !modelId || !target) {
      this.notice = t().app.cannotRebuildSummaryOffline;
      return;
    }
    const messages = await messageRepo.list(conversationId);
    if (messages.length <= KEEP_RECENT_MESSAGES) {
      this.notice = t().app.summaryAppearsLater(KEEP_RECENT_MESSAGES);
      return;
    }
    const profile = await profileRepo.get(modelId);
    this.summarizing = true;
    this.summaryPendingMessages = Math.min(
      MAX_SUMMARY_BATCH,
      messages.length - KEEP_RECENT_MESSAGES,
    );
    try {
      const outcome = await updateSummary(
        target,
        modelId,
        { ...conv, summary: null, summaryThroughMessageId: null },
        messages,
        this.labelFor,
        profile.customParameters,
        this.pack,
      );
      if (!outcome.ok) {
        const reason = outcome.reason?.replace(/[.\s]+$/, "");
        this.notice = reason
          ? t().app.summaryRebuildFailed(reason)
          : t().app.nothingOldToSummarize;
        return;
      }
      this.summaryRetryFloor.delete(conversationId);
      this.conversations = this.conversations.map((c) =>
        c.id === outcome.conversation.id ? outcome.conversation : c,
      );
      this.notice = t().app.summaryRebuilt(KEEP_RECENT_MESSAGES);
    } finally {
      this.summarizing = false;
      this.summaryPendingMessages = 0;
    }
  }

  /** Un seul résumé par tour, et pas de nouvelle tentative après un échec
   *  tant que la conversation n'a pas réellement avancé. */
  private async maybeSummarize(conversationId: string): Promise<void> {
    if (this.summarizing) return;
    const conv = this.conversations.find((c) => c.id === conversationId);
    const modelId = this.activeModelId;
    const target = this.target;
    if (!conv || !modelId || !target) return;
    const messages = await messageRepo.list(conversationId);
    const rebuilding = summaryNeedsRefresh(conv.summary);
    const uncovered = rebuilding
      ? messages
      : uncoveredMessages(messages, conv.summaryThroughMessageId);
    // Les anciens résumés peu structurés ne doivent pas continuer à polluer
    // une conversation encore assez courte pour tenir entièrement en clair.
    if (
      rebuilding &&
      messages.length < KEEP_RECENT_MESSAGES + MIN_SUMMARY_BATCH
    ) {
      const cleared = {
        ...conv,
        summary: null,
        summaryThroughMessageId: null,
      };
      await conversationRepo.update(cleared);
      this.conversations = this.conversations.map((c) =>
        c.id === cleared.id ? cleared : c,
      );
      return;
    }
    const profile = await profileRepo.get(modelId);
    const contextTokens = this.contextBudgetFor(modelId, profile.contextWindow).tokens;
    if (
      !needsSummary(
        uncovered,
        conv.summary,
        contextTokens,
        this.settings.historyWindowMessages,
      )
    ) {
      return;
    }
    // Après un échec, on laisse la conversation grandir avant de réessayer :
    // retenter à chaque réplique bloquait le serveur pour rien.
    const floor = this.summaryRetryFloor.get(conversationId);
    if (floor !== undefined && uncovered.length < floor) return;

    this.summarizing = true;
    this.summaryPendingMessages = Math.min(
      MAX_SUMMARY_BATCH,
      Math.max(0, uncovered.length - KEEP_RECENT_MESSAGES),
    );
    try {
      const outcome = await updateSummary(
        target,
        modelId,
        conv,
        messages,
        this.labelFor,
        profile.customParameters,
        this.pack,
      );
      if (outcome.ok) {
        this.summaryRetryFloor.delete(conversationId);
        this.conversations = this.conversations.map((c) =>
          c.id === outcome.conversation.id ? outcome.conversation : c,
        );
        // Le dernier chiffre décrivait le prompt d'avant compression ; mieux
        // vaut attendre la mesure exacte de la prochaine requête.
        this.lastPromptTokens = null;
        this.lastPromptContextTokens = contextTokens;
        this.notice = t().app.contextCompressed(
          this.summaryPendingMessages,
          KEEP_RECENT_MESSAGES,
        );
        return;
      }
      // `reason: null` : il n'y avait rien à résumer, ce n'est pas un incident.
      if (outcome.reason === null) return;
      const reason = outcome.reason.replace(/[.\s]+$/, "");
      this.summaryRetryFloor.set(
        conversationId,
        uncovered.length + KEEP_RECENT_MESSAGES,
      );
      this.notice = t().app.autoSummaryInterrupted(reason);
    } finally {
      this.summarizing = false;
      this.summaryPendingMessages = 0;
    }
  }

  /** Annule la réponse en cours et abandonne les tours restants. */
  async cancelGeneration(): Promise<void> {
    this.cancelIdleChatter();
    this.turnAborted = true;
    this.pendingSpeakerIds = [];
    if (this.streamRequestId) {
      await cancelStream(this.streamRequestId);
    }
  }

  async regenerate(): Promise<void> {
    if (this.streaming || this.turnInProgress) return;
    const conv = this.currentConversation;
    if (!conv) return;
    const last = this.messages[this.messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const speaker =
      this.personas.find((p) => p.id === last.personaId) ?? this.activePersona;
    if (!speaker) return;
    const modelId = this.activeModelId;
    if (!modelId) return;
    // Tout se joue sous le verrou, suppression comprise : régénérer retirait
    // la dernière réplique sans tenir la scène, et un tour lancé entre-temps
    // repartait d'un historique amputé.
    await this.withTurn(async () => {
      await messageRepo.remove(last.id);
      this.messages = this.messages.slice(0, -1);
      // Le personnage régénère sa réplique dans le même contexte d'adresse ;
      // aucun tour automatique ne doit s'enchaîner sur une simple régénération.
      const lastUser = [...this.messages]
        .reverse()
        .find((m) => m.role === "user" && m.kind === "speech");
      const addressing = lastUser
        ? this.addressingFor(planSpeakers(lastUser.content, this.roster, null))(
            speaker.id,
          )
        : describeAutonomousTurn(this.userName, this.pack);
      await this.playRound(conv.id, [speaker.id], () => addressing);
      this.pendingSpeakerIds = [];
      await this.runPostTurnTasks(conv.id);
    });
  }

  /** Modifie le dernier message utilisateur et rejoue le tour complet. */
  async editLastUserMessage(newContent: string): Promise<void> {
    if (this.streaming || this.turnInProgress) return;
    const conv = this.currentConversation;
    if (!conv) return;
    const lastUser = [...this.messages]
      .reverse()
      .find((m) => m.role === "user" && m.kind === "speech");
    if (!lastUser) return;
    await messageRepo.removeAfter(conv.id, lastUser);
    await messageRepo.update(lastUser.id, newContent, "complete");
    this.messages = this.messages
      .filter(
        (m) =>
          m.createdAt < lastUser.createdAt ||
          (m.createdAt === lastUser.createdAt && m.id <= lastUser.id),
      )
      .map((m) => (m.id === lastUser.id ? { ...m, content: newContent } : m));
    const plan = planSpeakers(newContent, this.roster, this.composerTargetId);
    await this.runTurns(conv.id, plan.personaIds, this.addressingFor(plan));
  }

  // -------------------------------------------------------------------------
  // Personas
  // -------------------------------------------------------------------------

  async reloadPersonas(): Promise<void> {
    this.personas = await personaRepo.list();
  }

  /** Après suppression d'une persona : recharger conversations et scènes. */
  async reloadConversations(): Promise<void> {
    this.conversations = await conversationRepo.list();
    await this.reloadParticipantIndex();
    const current = this.currentConversationId;
    if (current && this.conversations.some((c) => c.id === current)) {
      await this.openConversation(current);
    } else {
      this.closeConversation();
    }
  }
}

export const app = new AppState();
