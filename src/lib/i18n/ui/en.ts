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
    tagline: "A pocket theatre",
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
    title: "The curtain is down",
    withCast:
      "Your troupe is waiting in the wings. Pick up a scene on the left, or start a brand-new one.",
    withoutCast:
      "The stage is empty. Invent a first character — a name, a quirk, a temperament — and the show can begin.",
    createCharacter: "Create a character",
    raiseCurtain: "Raise the curtain",
    available: (count: number) =>
      `${count} scene${count > 1 ? "s" : ""} waiting in the left column.`,
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
    skipConnection: "Set up the connection later",
    skipConnectionHint:
      "To use a remote gateway such as OpenRouter, create your character now, then add the connection in Settings.",
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
    objectives: "Secret goals",
    objectivesHidden:
      "Each character wants something and won't say it. Try to guess, or peek.",
    objectivesNone: "No goals yet: they will be written before the next line.",
    objectivesOff: "Secret goals are turned off in Settings.",
    reveal: "Peek",
    hide: "Hide",
    redistribute: "Deal new goals",
    goalLabel: "Wants",
    secretLabel: "Hides",
    noGoal: "No goal",
    editedByYou: "edited by you",
    goalPlaceholder: "get Marc to admit he sold the house",
    secretPlaceholder: "Optional",
    goalHint: "Leave the goal empty for this character to have none.",
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
    importTitle:
      "Add characters from a Praxis cast or from SillyTavern character cards (PNG or JSON)",
    importFilter: "Characters",
    unreadableFile: (file: string) =>
      `${file}: neither a Praxis cast nor a character card.`,
    exportCard: "Export card",
    exportCardTitle:
      "Save as a SillyTavern character card: a PNG with the portrait, or JSON",
    cardExported: (name: string) => `${name} saved as a character card.`,
    languageNames: { en: "English", fr: "French" },
    sheetInOtherLanguage: (sheet: string, conversation: string) =>
      `This sheet is written in ${sheet} and conversations are in ` +
      `${conversation}. The character will still speak ${conversation}.`,
    translateSheet: (language: string) => `Translate into ${language}`,
    translating: "Translating…",
    translated: "Sheet translated. Read it over: everything stays editable.",
    restoreOriginal: "Restore the original",
    translationFailed:
      "The model returned nothing usable. The sheet is unchanged.",
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
    sceneMemory: "Scene memory",
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
      "The rest is available headroom. Older messages go into memory before it runs out.",
    openSettings: "Open settings",
    closeMemory: "Close the memory",
    memoryKicker: "What the characters don't forget",
    memoryExplanation:
      "Each fact is kept on its own and only removed if the scene contradicts " +
      "it. A character only knows the facts established in front of them. Pin " +
      "what must never be forgotten: it is restated before every line. Earlier " +
      "passages related to the scene are also found and brought back word for word.",
    memoryEmpty: "No facts kept yet",
    memoryEmptyBody:
      "Recent exchanges are still passed on in full. The ledger fills up as the " +
      "conversation grows — you can already add your own facts.",
    memoryState: "Where the scene stands",
    memoryThreads: "Open questions",
    memoryAddPlaceholder: "A fact that must never be forgotten…",
    memoryAdd: "Add",
    memoryPin: "Pin",
    memoryUnpin: "Unpin",
    memoryPinned: "Pinned",
    memoryEdited: "Edited by hand",
    memoryDelete: "Remove this fact",
    memoryEdit: "Edit",
    memoryCounts: (facts: number, covered: number, backlog: number) =>
      `${facts} ${facts === 1 ? "fact" : "facts"} · ${covered} messages read` +
      (backlog > 0 ? ` · ${backlog} pending` : ""),
    memoryAvailableAfter: (threshold: number) =>
      `The automatic ledger starts after ${threshold} messages`,
    memoryCatchUp: "Update now",
    memoryRebuild: "Rebuild all",
    memoryRebuildTitle:
      "Rereads the whole conversation from the start. Facts you added, edited " +
      "or pinned are kept.",
    generating: "Reading…",
    compressing: "Updating the memory…",
    compressingCount: (count: number) =>
      `${count} older messages to read`,
    startingSituation: "Starting situation",
    welcomeGroup: (names: string, first: string) =>
      `${names} are here. Below the input, choose who answers — or leave “Auto” ` +
      `and write “@${first}” in your message.`,
    welcomeSolo: (name: string) => `Start a conversation with ${name}.`,
    welcomeEmpty: "Create a character first, on the Characters page.",
    everyone: "everyone",
    interrupted: "Response interrupted",
    showWholeLine: "Show it all ⏭",
    showWholeLineHint: "Show the rest of the line now",
    regenerate: "Regenerate",
    idleCountdown: (seconds: number) =>
      `Without a reply from you, the conversation resumes in ${seconds} s.`,
    pause: "Pause",
    waitForMyMessage: "Wait for my message",
    scenePaused: "Scene paused: the characters no longer continue on their own.",
    resume: "Resume",
    whoSpeaks: "Deciding who speaks…",
    writingObjectives: "Dealing out secret goals…",
    isAnswering: (name: string) => `${name} is answering…`,
    thenSpeakers: (names: string) => `next: ${names}`,
    sceneContinuesBelow: "The scene continues below",
    newLinesBelow: "New lines below",
    queued: "Queued",
    yourTurn: "Your turn to speak",
    staySilent: "Stay silent",
    staySilentHint: "Let the characters talk among themselves until you join in",
    reclaimFloor: "Take the floor",
    reclaimFloorHint: "Let the current line finish, then wait for your message",
    listening: "You are listening",
    listeningHint: "The characters continue among themselves",
    composerOptions: "Input options",
    composerOptionsTitle: "Speech, action or scene event",
    speak: "Speak",
    speakHint: "A message from you",
    sceneEvent: "Scene event",
    sceneEventHint: "A noise, an arrival, an incident…",
    insertAction: "Insert an action",
    insertActionHint: "Adds *asterisks*",
    insertAside: "Slip in an aside",
    insertAsideHint: "Said to the audience: no character hears it",
    asidePrefix: "aside: ",
    aside: "aside",
    asideHint: "Said to the audience: nobody in the scene hears it",
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

  curtainCall: {
    button: "Curtain",
    buttonTitle: "Bring the curtain down: the evening's review and awards",
    kicker: "The morning after",
    title: "The reviews are in",
    close: "Raise the curtain",
    defaultPaper: "The Backstage Gazette",
    starsAria: (n: number) => `${n} star${n > 1 ? "s" : ""} out of 5`,
    reviewLoading: "The critic is scribbling in their notebook…",
    reviewFailed: "The critic slipped out before the end.",
    retry: "Ask for a review again",
    rewrite: "Another review",
    tooEarly: (min: number) =>
      `Too early for a review: play at least ${min} lines, the critic ` +
      `didn't stay for so little.`,
    awardsTitle: "Tonight's awards",
    noAwards: "No winners yet: the evening has only just begun.",
    director: "The director",
    stats: (lines: number, narrations: number, twists: number, asides: number) =>
      [
        `${lines} line${lines > 1 ? "s" : ""}`,
        narrations ? `${narrations} stage direction${narrations > 1 ? "s" : ""}` : "",
        twists ? `${twists} twist${twists > 1 ? "s" : ""}` : "",
        asides ? `${asides} aside${asides > 1 ? "s" : ""}` : "",
      ].filter(Boolean).join(" · "),
    awards: {
      chatterbox: { icon: "🗣️", title: "Motor Mouth Award", detail: (n: number) => `${n} words on the clock` },
      volcano: { icon: "🌋", title: "Volcano Award", detail: (n: number) => `anger at ${n}%` },
      drama: { icon: "🎭", title: "Melodrama Award", detail: (n: number) => `emotion at ${n}%` },
      sunshine: { icon: "☀️", title: "Ray of Sunshine Award", detail: (n: number) => `joy at ${n}%` },
      diplomat: { icon: "🕊️", title: "Diplomacy Award", detail: (n: number) => `${n} agreements given` },
      contrarian: { icon: "✋", title: "Devil's Advocate Award", detail: (n: number) => `${n} objections` },
      yesBut: {
        icon: "🤏",
        title: "\"Yes, but…\" Award",
        detail: (n: number) => `${n} conditional agreement${n > 1 ? "s" : ""}`,
      },
      curious: { icon: "🔍", title: "Curiosity Award", detail: (n: number) => `${n} lines asking questions` },
      whisperer: {
        icon: "🤫",
        title: "Aside Award",
        detail: (n: number) => `${n} confidence${n > 1 ? "s" : ""} to the audience`,
      },
      wallflower: {
        icon: "🪴",
        title: "Potted Plant Award",
        detail: (n: number) => (n === 0 ? "not a word all evening" : `${n} line${n > 1 ? "s" : ""}, all told`),
      },
      twist: { icon: "✦", title: "Coup de Théâtre Award", detail: (_n: number) => "goes to the twist" },
    },
  },

  effects: {
    unanimous: (text: string) => `🎉 Unanimous: "${text}"`,
    ovation: "🌹 A triumph! Standing ovation",
    tomatoes: "🍅 The audience is throwing tomatoes",
  },

  twist: {
    button: "Twist",
    title: "Make something happen in the scene",
    menuTitle: "What kind of twist?",
    themes: {
      surprise: { icon: "🎲", label: "Surprise", hint: "Director's choice" },
      catastrophe: { icon: "🔥", label: "Disaster", hint: "Things break, spill, panic" },
      romance: { icon: "💌", label: "Romance", hint: "A love note, a flustered glance" },
      absurd: { icon: "🦙", label: "Absurd", hint: "The improbable, with a straight face" },
      mystery: { icon: "🕵️", label: "Mystery", hint: "A clue nobody can explain" },
      revelation: { icon: "💥", label: "Coup de théâtre", hint: "A secret comes out" },
    },
  },

  coordination: {
    title: "Proposals and agreements",
    hint: "A missing response is not agreement. Conditions remain open until resolved.",
    intentHint: "Intention expressed in this message",
    unknownPerson: "Former participant",
    pending: "No position expressed",
    status: { open: "Under discussion", agreed: "Agreed", withdrawn: "Withdrawn", superseded: "Replaced" },
    stance: { agree: "Agrees", disagree: "Objects", conditional: "Under conditions" },
    intent: {
      statement: "Statement", question: "Question", answer: "Answer", clarification: "Clarification",
      proposal: "Proposal", agreement: "Agreement", objection: "Objection", conditional: "Condition", withdrawal: "Withdrawal",
    },
  },

  newChat: {
    subtitle: "Pick the characters. You can change the scene at any time.",
    whoToTalkTo: "Who do you want to talk to?",
    castingHint: "Click to cast — the order you pick is the order they speak.",
    noCharacters: "No characters yet.",
    createOneFirst: "Create one first.",
    situation: "Situation",
    optional: "optional",
    situationPlaceholder:
      "Where are you, at what time, what has just happened?",
    examples: [
      "An autumn evening, in the living room of an old flat. Rain beats " +
        "against the windows. Tea is going cold on the table and a book lies " +
        "open on the sofa, plainly abandoned mid-chapter. Nobody has yet " +
        "brought up the difficult subject.",
      "A night train has stopped between two stations. The lights flicker. " +
        "Nobody has come through the door at the end of the carriage for " +
        "twenty minutes.",
      "A cooking contest, live on air. Ten minutes left on the clock, the " +
        "oven has just died, and the jury is already walking over.",
      "A lift stuck between the 14th and 15th floors of an office tower, at " +
        "11 p.m. Someone has just admitted they are claustrophobic.",
      "The last evening of a summer holiday, on a beach. The bonfire is " +
        "dying down and someone has found an unopened letter in the sand.",
      "A spaceship's mess hall, six months into the voyage. The coffee " +
        "machine has finally broken and morale is at an all-time low.",
    ],
    surpriseMe: "Surprise me",
    hideOptions: "Hide",
    showOptions: "Show",
    advancedOptions: "advanced options",
    customTitle: "Custom title",
    titlePlaceholder: "Generated automatically if left empty",
    speakingOrder: "Speaking order",
    pickAtLeastOne: "Choose at least one character.",
    creating: "Creating…",
    start: "Curtain up!",
  },

  fatal: {
    dbUnavailable: "The database is unavailable",
    dbUnavailableBody: (detail: string) =>
      `The application could not open its local storage. Your data has not been ` +
      `modified. Details: ${detail}`,
  },

  settings: {
    subtitle: "Everything stays on your machine — backstage, under lock and key.",
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
      `Every request reprocesses the messages not yet in memory, and a ` +
      `two-character scene produces three messages per turn. Beyond this number, ` +
      `the oldest are read and their facts join the ledger; older passages can ` +
      `still be found word for word. Lower it if responses slow down. The default ` +
      `is 30. The ${keptRecent} most recent messages are always passed on word for ` +
      `word; an update also triggers around ${ratioPercent}% of the window.`,
    groupConversation: "Multi-character conversation",
    whoSpeaks: "Who takes the floor",
    roundRobin: "Scene order",
    modelDecides: "The model decides",
    whoSpeaksHint:
      "“Scene order” follows the cast order while prioritizing direct questions. " +
      "“The model decides” chooses the next speaker after every utterance; a character " +
      "may answer again or stay silent. Your “@Name” mentions always take priority. " +
      "Group conversations also track intentions and agreements. These short analyses " +
      "use the selected connection and can add a pause between replies.",
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
    sceneTwists: "Twists when the scene goes in circles",
    sceneEffects: "Stage effects",
    sceneEffectsHint:
      "Confetti when everyone agrees, the stage shaking when someone shouts, " +
      "laughter floating up, a spotlight on twists. Purely visual; also off " +
      "when your system asks for reduced motion.",
    sceneTwistsHint: (lines: number) =>
      "When the characters repeat themselves without you, the model writes a " +
      "stage direction that shakes things up: news arriving, an incident, an " +
      "unexpected gesture. It costs one short extra request, at most once " +
      `every ${lines} lines.`,
    sceneObjectives: "Secret goals",
    sceneObjectivesHint:
      "When a scene with several characters starts, or someone walks in, the " +
      "model gives each of them a goal of their own that cuts across someone " +
      "else's, sometimes with a secret. They pursue it even when you say " +
      "nothing. It costs one extra request per cast; you can read and edit " +
      "the goals in the cast panel.",
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
    revealSpeed: "Line speed",
    revealSpeedHint:
      "Lines appear at reading pace, and the next character waits until you have read the last one.",
    revealSpeeds: {
      slow: { label: "Slow", description: "Time to take it all in" },
      normal: { label: "Normal", description: "An even reading pace" },
      fast: { label: "Fast", description: "For skimmers" },
      instant: { label: "Instant", description: "As fast as the model writes" },
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
    generatedTwist: "Twist written by the model to get the scene moving",
    twistWillHappen: "The twist will happen as soon as the current line ends.",
    objectivesFailed: "The model didn't return usable goals. Try again, or write them yourself.",
    twistFailed: "The director came up empty this time. Roll the die again!",
    personaWillEnter: (name: string) =>
      `${name} will enter at the end of the current turn.`,
    personaWillLeave: (name: string) =>
      `${name} will leave at the end of the current turn.`,
    autoTurnsExhausted:
      "The characters have already taken several turns in a row. Write a message to restart the scene.",
    noConnection: "No connection configured. Add a server in the settings.",
    noModel: "No model selected. Choose a model in the settings.",
    waitBeforeRebuildingMemory:
      "Wait for the response to finish before updating the memory.",
    cannotRebuildMemoryOffline: "Cannot update the memory without a connected model.",
    memoryAppearsLater: (keptMessages: number) =>
      `The memory will start filling once the conversation goes past ` +
      `${keptMessages} messages; current exchanges are still passed on in full.`,
    memoryRebuildFailed: (reason: string) =>
      `Cannot update the memory: ${reason}. Try again with the same button.`,
    nothingOldToMemorize: "There are no older messages to put into memory yet.",
    memoryRebuilt: (factCount: number) =>
      `Memory up to date from the original messages: ${factCount} ` +
      `${factCount === 1 ? "fact" : "facts"} in the ledger.`,
    memoryUpdated: (absorbed: number, changed: number) =>
      `Memory updated: ${absorbed} older ${absorbed === 1 ? "message" : "messages"} read` +
      (changed > 0 ? `, ${changed} ${changed === 1 ? "fact" : "facts"} added or corrected.` : `, nothing new to keep.`),
    autoMemoryInterrupted: (reason: string) =>
      `Automatic memory update interrupted: ${reason}. The conversation ` +
      `continues normally. Open ••• → Scene memory to try again now, or wait ` +
      `for the next automatic attempt.`,
  },
};

/**
 * Sans `as const` : les valeurs restent des `string`, de sorte que le pack
 * français soit contraint sur la *forme* — clés présentes, signatures des
 * fonctions — et non sur le texte anglais lui-même.
 */
export type UiStrings = typeof enUi;
