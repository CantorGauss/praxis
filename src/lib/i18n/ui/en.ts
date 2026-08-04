/**
 * Chaînes de l'interface, en anglais — la langue par défaut du produit.
 *
 * Ce pack fait référence : `UiStrings` en est dérivé, et le pack français est
 * typé contre lui. Une clé ajoutée ici sans équivalent français casse la
 * compilation, ce qui est exactement le rappel voulu.
 */
export const enUi = {
  common: {
    cancel: "Cancel",
    close: "Close",
    save: "Save",
    delete: "Delete",
    add: "Add",
    edit: "Edit",
    duplicate: "Duplicate",
    confirm: "Confirm",
    back: "Back",
    next: "Next",
    retry: "Retry",
    copy: "Copy",
    copied: "Copied",
    loading: "Loading…",
    none: "None",
    optional: "optional",
    unnamed: "Untitled",
  },

  gender: {
    feminine: "Feminine",
    masculine: "Masculine",
    neutral: "Unspecified",
  },

  responseLength: {
    short: { label: "Short", reply: "short", description: "3 to 6 natural sentences" },
    normal: { label: "Normal", reply: "normal", description: "A developed answer" },
    long: { label: "Long", reply: "long", description: "A very detailed answer" },
  },

  sidebar: {
    conversations: "Conversations",
    newConversation: "New conversation",
    deleteConversation: "Delete conversation",
    noConversations: "No conversations yet.",
    createOneToStart: "Create one to get started.",
    characters: "Characters",
    settings: "Settings",
    deleteConversationTitle: "Delete this conversation?",
    deleteConversationBody: (title: string) =>
      `“${title}” and all its messages will be permanently deleted.`,
  },

  curtain: {
    title: "No conversation open",
    withCast:
      "Open an existing conversation, or pick the characters for a new one.",
    withoutCast:
      "Create a first character — a name, a description and a temperament — before you begin.",
    createCharacter: "Create a character",
    available: (count: number) =>
      `${count} conversation${count > 1 ? "s" : ""} available in the left column.`,
  },

  avatar: {
    fallbackName: "the character",
    altText: (name: string) => `${name}'s avatar`,
    moodTitle: (name: string, mood: string, percent: number | null) =>
      `${name} — mood: ${mood}${percent === null ? "" : ` (${percent}%)`}`,
  },

  onboarding: {
    welcome: "Welcome",
    intro:
      "This application talks to a model running locally behind an " +
      "OpenAI-compatible API. Nothing leaves your machine.",
    serverAddress: "Local server address",
    connectionHint:
      "Start your local inference server, check its address and port, then try again.",
    noModelLoaded:
      "The server answers but no model is loaded. Load one in your inference server, then try again.",
    testConnection: "Test the connection",
    connecting: "Connecting…",
    createFirstCharacter:
      "Create your first character. You can change everything afterwards.",
    whatShouldWeCallYou: "What should we call you?",
    namePlaceholder: "Your name",
    userNameHint:
      "This name labels your messages, especially in conversations with several characters.",
    continue: "Continue",
  },

  cast: {
    title: "Scene",
    subtitle: "Setting and characters",
    closePanel: "Close the panel",
    afterCurrentTurn: "After the current turn",
    theCharacter: "The character",
    pendingEnter: (name: string) => `${name} will enter.`,
    pendingLeave: (name: string) => `${name} will leave.`,
    setting: "Setting",
    noSetting: "No setting described.",
    editSetting: "Edit the setting",
    settingHint:
      "Added to every present character's prompt. Models do not reread the " +
      "past: the change applies to the lines to come.",
    autonomousConversation: "Autonomous conversation",
    afterYourMessage: "After your message",
    theyWait: "They wait",
    roundsAmongThem: (n: number) => `${n} round${n > 1 ? "s" : ""} among themselves`,
    continueNow: "Continue now",
    resumeAutonomy: "Resume autonomy",
    pauseAutonomy: "Pause",
    idleHint: "Resuming after a silence is set in Settings → Conversation.",
    present: "Present",
    available: "Available",
    speakEarlier: "Speak earlier",
    speakLater: "Speak later",
    makeLeave: (name: string) => `Send ${name} out`,
    mustKeepOne: "One character must stay in the conversation",
    leave: "Leave",
    makeEnter: (name: string) => `Bring ${name} in`,
    enter: "Enter",
    allPresent: "All your characters are present.",
    describeArrival: "Describe their arrival",
    describeDeparture: "Describe their departure",
    narrationHint:
      "This stage direction appears in the conversation without being " +
      "attributed to anyone; the characters present read it as a fact.",
    makeOthersReact: "Have the present characters react",
    bringIn: "Bring in",
    sendOut: "Send out",
  },

  personas: {
    title: "Characters",
    subtitle: "Select a character on the left to edit their sheet.",
    import: "Import",
    export: "Export",
    addCharacter: "+ Character",
    newCharacter: "New character",
    defaultCharacterPrompt:
      "You are a composed, attentive presence. You answer in English, with " +
      "warmth and concision.",
    exported: (count: number) =>
      `${count} character${count > 1 ? "s" : ""} exported.`,
    imported: (count: number) =>
      `${count} character${count > 1 ? "s" : ""} added.`,
    nothingImportable: "No usable character in that file.",
    exportFileName: "cast.json",
    pickStartingPoint: "Pick a starting point",
    everythingEditable: "Everything stays editable after creation.",
    blankSheet: "Blank sheet",
    createFreely: "Start from scratch",
    portraitOf: (name: string) => `Portrait of ${name}`,
    templateRoles: {
      police: "Police officer",
      robot: "Robot",
      scientist: "Scientist",
      artist: "Artist",
    },
    yourName: "Your name",
    yourNameHint: "Used by the characters to address you.",
    characterList: "Character list",
    noDescription: "No description",
    namePlaceholder: "Name",
    descriptionPlaceholder: "Description — who they are, in one line",
    genderTitle:
      "Pronouns used for this character, and by those who speak about them",
    showAllPortraits: "Show all portraits",
    choosePortrait: "Choose a portrait",
    responseStyleTitle: "Style, thinking and response length",
    closeSettings: "Close settings",
    responseStyle: "Response style",
    portraitCount: (count: number, gender: string) =>
      `${count} option${count > 1 ? "s" : ""} for “${gender}”`,
    choosePortraitNumber: (n: number) => `Choose portrait ${n}`,
    characterPlaceholder:
      "Temperament — how they speak, what drives them, what they avoid",
    responseTone: "Response tone",
    styles: {
      plain: { label: "Plain", description: "Steady and factual" },
      natural: { label: "Natural", description: "Balanced and alive" },
      creative: { label: "Creative", description: "Freer and more surprising" },
    },
    responseLengthTitle: "Response length",
    lengthExplanation:
      "Praxis automatically reserves the room needed within the model's capacity.",
    stableTraits: "Distinctive traits",
    stableTraitsHint:
      "A few optional words to keep their personality steady.",
    traitsPlaceholder: "e.g. curious, direct, protective",
    noCharacters: "No characters yet. Create one to start a conversation.",
    deleteTitle: (name: string) => `Delete ${name}?`,
    deleteSolo: (count: number) =>
      `${count} conversation${count > 1 ? "s" : ""} where they are alone on ` +
      `stage will be deleted.`,
    deleteShared: (count: number) =>
      `${count} group conversation${count > 1 ? "s" : ""} will be kept: they ` +
      `leave the scene, their lines stay readable.`,
    deleteEmotion: "Their emotional state will be deleted.",
  },

  chat: {
    conversation: "Conversation",
    noCharacter: "No character",
    serverFallback: "Server",
    connectedTo: (name: string, url: string) => `${name} connected (${url})`,
    unreachable: (name: string) => `${name} unreachable`,
    sceneButtonTitle: "Setting, characters and automation",
    scene: "Scene",
    moreOptions: "More options",
    noModel: "no model",
    connection: "Connection",
    conversationSummary: "Conversation summary",
    temperature: "Temperature",
    temperatureAria: "Temperature for this conversation",
    characterValue: "Character's value",
    modelCapacity: "Model capacity",
    tokens: (formatted: string) => `${formatted} tokens`,
    contextSent: "Context sent",
    roomForReply: (length: string) => `Room for a ${length} reply`,
    upTo: (formatted: string) => `up to ${formatted}`,
    capacityBarTitle: "Context sent, then room reserved for the reply",
    capacityBarAria: "Breakdown of the model's capacity",
    capacityNote:
      "The rest is available headroom. Older messages are summarised before it runs out.",
    openSettings: "Open settings",
    closeSummary: "Close the summary",
    condensedMemory: "Condensed memory",
    summaryExplanation:
      "This text is passed to the characters to preserve older facts. Recent " +
      "exchanges are still kept in full alongside this memory.",
    noSummaryYet: "No condensed memory yet",
    noSummaryBody:
      "Recent exchanges are still passed to the characters in full. A summary " +
      "becomes useful as the conversation grows.",
    summaryCounts: (condensed: number, recent: number) =>
      `${condensed} older messages condensed · ${recent} recent kept in full`,
    summaryAvailableFrom: (count: number) =>
      `${count} messages available to build this memory`,
    summaryAvailableAfter: (threshold: number) =>
      `Available after more than ${threshold} messages`,
    generating: "Generating…",
    regenerateSummary: "Regenerate the summary",
    createSummary: "Create the summary",
    compressing: "Compressing the context…",
    compressingCount: (count: number) =>
      `${count} older messages are moving into the summary`,
    startingSituation: "Starting situation",
    welcomeGroup: (names: string, first: string) =>
      `${names} are here. Below the input, choose who answers — or leave “Auto” ` +
      `and write “@${first}” in your message.`,
    welcomeSolo: (name: string) => `Start a conversation with ${name}.`,
    welcomeEmpty: "Create a character first, on the Characters page.",
    everyone: "everyone",
    interrupted: "Response interrupted",
    regenerate: "Regenerate",
    idleCountdown: (seconds: number) =>
      `Without a reply from you, the conversation resumes in ${seconds} s.`,
    pause: "Pause",
    waitForMyMessage: "Wait for my message",
    scenePaused: "Scene paused: the characters no longer continue on their own.",
    resume: "Resume",
    whoSpeaks: "Deciding who speaks…",
    isAnswering: (name: string) => `${name} is answering…`,
    thenSpeakers: (names: string) => `next: ${names}`,
    sceneContinuesBelow: "The scene continues below",
    newLinesBelow: "New lines below",
    queued: "Queued",
    yourTurn: "Your turn to speak",
    composerOptions: "Input options",
    composerOptionsTitle: "Speech, action or scene event",
    speak: "Speak",
    speakHint: "A message from you",
    sceneEvent: "Scene event",
    sceneEventHint: "A noise, an arrival, an incident…",
    insertAction: "Insert an action",
    insertActionHint: "Adds *asterisks*",
    to: "To",
    whoShouldAnswer: "Who should answer",
    auto: "Auto",
    scenePlaceholder: "The doorbell rings…",
    groupPlaceholder: "Write to the scene… @Name to call someone",
    writeTo: (name: string) => `Write to ${name}…`,
    createCharacterFirst: "Create a character first…",
    mentionListAria: "Characters to mention",
    mentionTitle: "Call a character",
    willBeCalled: "Will be called in this message",
    noMatchingCharacter: "No matching character",
    keyChoose: "choose",
    keyInsert: "insert",
    keyClose: "close",
    stop: "Stop",
    send: "Send",
    makeArrive: "Bring in",
    sendLater: (base: string) => `${base} later`,
    deferredTitle: "You are being answered: your message goes out at the end of the turn",
    interruptTitle:
      "The characters are talking among themselves: your message cuts the remaining turns short",
    sceneNote: "Scene event — this text is attributed to no one.",
    willAnswer: (names: string, plural: boolean) =>
      `${names} ${plural ? "will answer" : "will answer"}.`,
    turnSpeaking: (name: string) => `${name} is answering you…`,
    turnChaining: (name: string) => `${name} continues…`,
    turnDirecting: "The scene is choosing who speaks…",
    turnCompressing: "Compressing the context…",
    turnWrappingAuto: "The characters are continuing…",
    turnWrapping: "End of turn…",
    theCharacter: "The character",
    floorHintAutonomous: "type: you take the floor back after this line",
    floorHintDeferred: "you can type: your message goes out at the end of the turn",
  },

  newChat: {
    subtitle: "Pick the characters. You can change the scene at any time.",
    whoToTalkTo: "Who do you want to talk to?",
    noCharacters: "No characters yet.",
    createOneFirst: "Create one first.",
    situation: "Situation",
    optional: "optional",
    situationPlaceholder:
      "Where are you, at what time, what has just happened?",
    useExample: "Use an example",
    example:
      "An autumn evening, in the living room of an old flat. Rain beats " +
      "against the windows. Tea is going cold on the table and a book lies " +
      "open on the sofa, plainly abandoned mid-chapter. Nobody has yet " +
      "brought up the difficult subject.",
    hideOptions: "Hide",
    showOptions: "Show",
    advancedOptions: "advanced options",
    customTitle: "Custom title",
    titlePlaceholder: "Generated automatically if left empty",
    speakingOrder: "Speaking order",
    pickAtLeastOne: "Choose at least one character.",
    creating: "Creating…",
    start: "Start",
  },

  fatal: {
    dbUnavailable: "The database is unavailable",
    dbUnavailableBody: (detail: string) =>
      `The application could not open its local storage. Your data has not been ` +
      `modified. Details: ${detail}`,
  },

  settings: {
    title: "Settings",
    sectionsAria: "Settings sections",
    tabs: {
      connections: "Connection",
      conversation: "Conversation",
      appearance: "Appearance",
      advanced: "Advanced",
      data: "Data",
    },
    language: "Language",
    languageIntro:
      "The interface and the characters do not have to share a language.",
    connections: "Connections",
    connectionsHint:
      "Each connection keeps its own address, key, model and timeout. " +
      "Switching between them requires no retyping.",
    remoteTag: "remote",
    serverTypeAria: "Type of server to add",
    keepOneConnection: "At least one connection must remain.",
    deleteConnectionTitle: "Delete this connection and its key",
    unnamed: "Unnamed",
    baseUrl: "Base URL",
    baseUrlHint:
      "The address of a local server, ending in /v1. The presets above fill in " +
      "the common ones.",
    apiKey: "API key (optional)",
    apiKeyHint:
      "Specific to this connection, stored in the system keychain — never in " +
      "the database, nor in exports.",
    keySaved: "Key saved.",
    keyRemoved: "Key removed from the keychain.",
    timeout: "Timeout (seconds)",
    allowRemote:
      "Allow a remote host for this connection (otherwise only localhost is reachable)",
    remoteWarning:
      "Conversations sent over this connection leave your machine.",
    testing: "Testing…",
    testConnection: "Test the connection",
    connectionOk: "Connection successful.",
    modelForConnection: "Model used by this connection",
    filterModels: "Filter the list (e.g. deepseek)",
    refresh: "Refresh",
    automaticFirstModel: "— Automatic: the first model exposed —",
    noModel: "no model",
    noModelsAnnounced:
      "No model announced by this server. Test the connection, or load a model " +
      "on the server side then refresh.",
    modelGone: (id: string) =>
      `This server no longer lists ${id}. Requests will still go out under that ` +
      `name and will probably fail: pick another one from the list.`,
    modelsAnnounced: (count: number) =>
      `${count} model${count > 1 ? "s" : ""} announced by this server. Under ` +
      `“Automatic”, the first in the list is used — enough for a local server ` +
      `that serves only one, but not for a gateway exposing hundreds: choose ` +
      `explicitly.`,
    modelCapacity: "Total model capacity",
    automaticDetected: (k: number) => `Automatic (${k}K detected)`,
    automaticFallback: (k: number) => `Automatic (${k}K fallback)`,
    custom: "Custom…",
    capacityExplanation:
      "This is everything the model can read and write at once: identity, " +
      "conversation, situation and next reply. Praxis asks the server for it; " +
      "set it by hand only to hold a shorter budget. The length of each reply " +
      "is chosen on the character sheet; its room is reserved automatically.",
    capacityManual: (tokens: string) =>
      `Manual capacity: ${tokens} tokens for this model.`,
    capacityDetected: (announced: string, used: string) =>
      `Detected from the server: ${announced} tokens announced, ${used} used ` +
      `with a safety margin.`,
    capacityFallback: (tokens: string) =>
      `This server does not announce its capacity; falling back to ${tokens} tokens.`,
    customCapacity: "Custom capacity",
    capacitySaved: (k: number) => `Capacity saved: ${k}K.`,
    capacityReturned: "Capacity handed back to the server.",
    capacityTooSmall: "Enter a capacity of at least 2,048 tokens.",
    advancedInference: "Advanced inference",
    hide: "Hide",
    show: "Show",
    technicalParameters: "the technical parameters",
    fallbackCapacity: "Fallback capacity for Automatic mode",
    fallbackCapacityHint:
      "Used only when no precise capacity is stored for the active model.",
    selectModelFirst: "Select a model first.",
    technicalProfileOf: (id: string) => `Technical profile of ${id}.`,
    reasoningOff: "Reasoning disabled",
    reasoningOffBody:
      "Praxis exposes no thinking mode: reasoning is switched off on every " +
      "request, whatever the server. These parameters are added automatically " +
      "and override any contradictory value below. A server that does not know " +
      "them ignores them.",
    otherCustomParameters: "Other custom parameters (JSON, optional)",
    reasoningKeyManaged:
      "The “reasoning” key is managed by Praxis and stripped from this field.",
    saveProfile: "Save the profile",
    profileSaved: "Profile saved. Reasoning stays disabled.",
    parametersMustBeObject: "the parameters must be a JSON object",
    performance: "Performance",
    historyWindow: "Messages kept verbatim before summarising",
    historyWindowHint: (keptRecent: number, ratioPercent: number) =>
      `Every request reprocesses the unsummarised history, and a two-character ` +
      `scene produces three messages per turn. Beyond this number, the oldest ` +
      `move into the summary. Lower it if responses slow down; raise it if the ` +
      `characters lose the thread. The default is 30. The ${keptRecent} most ` +
      `recent messages are always kept word for word; compression also triggers ` +
      `around ${ratioPercent}% of the window.`,
    groupConversation: "Multi-character conversation",
    whoSpeaks: "Who takes the floor",
    roundRobin: "One after another",
    modelDecides: "The model decides",
    whoSpeaksHint:
      "“One after another” makes everyone answer, in scene order — safe, but " +
      "mechanical. “The model decides” asks before each turn who would naturally " +
      "react: an ignored character may stay silent, two may answer together, and " +
      "the scene may settle on its own. It costs one short extra request per " +
      "turn, and your “@Name” mentions always take priority.",
    autoRounds: "Automatic exchanges between characters",
    autoRoundsNone: "None — they wait for your message",
    autoRoundsN: (n: number) => `${n} extra turn${n > 1 ? "s" : ""}`,
    autoRoundsHint: (cap: number) =>
      `After your message, the characters answer each other for this many turns. ` +
      `A hard cap of ${cap} turns per character applies in all cases, and “Stop” ` +
      `interrupts the series immediately.`,
    idleResume: "Resume after a silence (seconds)",
    idleResumeHint:
      "If you say nothing for this long, the characters take the floor among " +
      "themselves. 0 for them to always wait for your message. Typing in the " +
      "input pushes the deadline back.",
    characterBehaviour: "Character behaviour",
    defaultPersona: "Character offered when starting a conversation",
    noneOption: "— None —",
    keepEmotion: "Keep the characters' emotional evolution",
    analyseReaction: "Analyse their reaction before each response",
    analyseReactionHint:
      "Makes reactions more expressive, at the cost of one short extra request " +
      "before each line.",
    varyAvatars: "Vary avatars with mood and time of day",
    reset: (name: string) => `Reset ${name}`,
    theme: "Theme",
    themeIntro:
      "The change is immediate. “System” automatically follows your computer's " +
      "light or dark mode.",
    themes: {
      system: { label: "System", description: "Follows your computer" },
      dark: { label: "Dark", description: "Velvet and half-light" },
      light: { label: "Light", description: "Paper and daylight" },
    },
    readingComfort: "Reading comfort",
    conversationTextSize: "Conversation text size",
    conversationTextSizeHint: "Changes the lines and the input area.",
    textSizes: {
      small: { label: "Small", description: "More text on screen" },
      normal: { label: "Normal", description: "Balanced reading" },
      large: { label: "Large", description: "More comfortable reading" },
    },
    threadSpacing: "Thread spacing",
    threadSpacingHint: "Changes the air between messages without altering them.",
    densities: {
      comfortable: { label: "Comfortable", description: "Airier bubbles" },
      compact: { label: "Compact", description: "More messages visible" },
    },
    data: "Data",
    exportAll: "Export everything as JSON",
    importBackup: "Import a backup",
    deleteAll: "Delete all data",
    exportFileName: "praxis-export.json",
    exportDone: "Export complete.",
    importDone: "Import complete. Reloading…",
    importFailed: (reason: string) => `Import failed: ${reason}`,
    allowRemoteTitle: "Allow a remote server?",
    allowRemotePreset: (name: string, url: string) =>
      `${name} (${url}) is not on your machine.`,
    allowRemoteBody:
      "The messages, characters and memories used with this connection will be " +
      "sent to that server, subject to its terms and its retention policy. " +
      "Local connections are unaffected.",
    allowThisConnection: "I allow this connection",
    deleteConnectionModal: (name: string) => `Delete “${name}”?`,
    deleteConnectionBody:
      "This connection and its API key will be erased. Your conversations, " +
      "characters and memories are untouched.",
    wipeTitle: "Delete everything?",
    wipeBody:
      "Conversations, characters, emotional states and settings will be " +
      "permanently erased from this machine. This cannot be undone.",
    wipeConfirm: "Delete permanently",
    presetHints: {
      mlxserve: "MLX Core's local server, on its default port.",
      llamacpp: "llama.cpp's built-in server.",
      ollama: "The OpenAI-compatible API exposed by Ollama.",
      openrouter:
        "Remote gateway: conversations sent over this connection leave your " +
        "machine. An API key is required.",
    },
    uiLanguage: "Interface language",
    conversationLanguage: "Conversation language",
    conversationLanguageHint:
      "The language the characters speak. It is set by the prompt, so it is " +
      "independent of the interface language.",
  },

  persona: {
    name: "Name",
    description: "Description",
    personalityPrompt: "Personality (system prompt)",
  },

  /** Bandeaux et messages émis par l'état applicatif. */
  app: {
    narrationSpeaker: "Scene",
    personaWillEnter: (name: string) =>
      `${name} will enter at the end of the current turn.`,
    personaWillLeave: (name: string) =>
      `${name} will leave at the end of the current turn.`,
    autoTurnsExhausted:
      "The characters have already taken several turns in a row. Write a message to restart the scene.",
    noConnection: "No connection configured. Add a server in the settings.",
    noModel: "No model selected. Choose a model in the settings.",
    waitBeforeRebuildingSummary:
      "Wait for the response to finish before rebuilding the summary.",
    cannotRebuildSummaryOffline: "Cannot rebuild the summary without a connected model.",
    summaryAppearsLater: (keptMessages: number) =>
      `The summary will appear once the conversation goes past ${keptMessages} ` +
      `messages; the current exchanges are still kept in full.`,
    summaryRebuildFailed: (reason: string) =>
      `Cannot rebuild the summary: ${reason}. Try again with the same button.`,
    nothingOldToSummarize: "There are no older messages to summarise yet.",
    summaryRebuilt: (keptMessages: number) =>
      `Summary rebuilt from the original messages; ${keptMessages} recent ` +
      `messages are still kept in full.`,
    contextCompressed: (absorbed: number, kept: number) =>
      `Context compressed: ${absorbed} older ` +
      `${absorbed > 1 ? "messages folded" : "message folded"} into the summary, ` +
      `${kept} kept verbatim.`,
    autoSummaryInterrupted: (reason: string) =>
      `Automatic summary interrupted: ${reason}. The conversation continues ` +
      `normally. Open ••• → Conversation summary to regenerate it now, or wait ` +
      `for the next automatic attempt.`,
  },
};

/**
 * Sans `as const` : les valeurs restent des `string`, de sorte que le pack
 * français soit contraint sur la *forme* — clés présentes, signatures des
 * fonctions — et non sur le texte anglais lui-même.
 */
export type UiStrings = typeof enUi;
