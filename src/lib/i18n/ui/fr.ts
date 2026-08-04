import type { UiStrings } from "./en";

/**
 * Chaînes de l'interface, en français. Typé contre le pack anglais : une clé
 * oubliée ou en trop ne compile pas.
 */
export const frUi: UiStrings = {
  common: {
    cancel: "Annuler",
    close: "Fermer",
    save: "Enregistrer",
    delete: "Supprimer",
    add: "Ajouter",
    edit: "Modifier",
    duplicate: "Dupliquer",
    confirm: "Confirmer",
    back: "Retour",
    next: "Suivant",
    retry: "Réessayer",
    copy: "Copier",
    copied: "Copié",
    loading: "Chargement…",
    none: "Aucun",
    optional: "facultatif",
    unnamed: "Sans titre",
  },

  gender: {
    feminine: "Féminin",
    masculine: "Masculin",
    neutral: "Non précisé",
  },

  responseLength: {
    short: { label: "Brèves", reply: "brève", description: "3 à 6 phrases naturelles" },
    normal: { label: "Normales", reply: "normale", description: "Une réponse développée" },
    long: { label: "Longues", reply: "longue", description: "Une réponse très détaillée" },
  },

  sidebar: {
    conversations: "Conversations",
    newConversation: "Nouvelle conversation",
    deleteConversation: "Supprimer la conversation",
    noConversations: "Aucune conversation.",
    createOneToStart: "Créez-en une pour commencer.",
    characters: "Personnages",
    settings: "Réglages",
    deleteConversationTitle: "Supprimer la conversation ?",
    deleteConversationBody: (title: string) =>
      `« ${title} » et tous ses messages seront définitivement supprimés.`,
  },

  curtain: {
    title: "Aucune conversation ouverte",
    withCast:
      "Ouvrez une conversation existante ou choisissez les personnages d’une nouvelle conversation.",
    withoutCast:
      "Créez un premier personnage — un nom, une description et un caractère — avant de commencer.",
    createCharacter: "Créer un personnage",
    available: (count: number) =>
      `${count} conversation${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} dans la colonne de gauche.`,
  },

  avatar: {
    fallbackName: "la persona",
    altText: (name: string) => `Avatar de ${name}`,
    moodTitle: (name: string, mood: string, percent: number | null) =>
      `${name} — humeur : ${mood}${percent === null ? "" : ` (${percent} %)`}`,
  },

  onboarding: {
    welcome: "Bienvenue",
    intro:
      "Cette application discute avec un modèle exécuté localement derrière une " +
      "API compatible OpenAI. Rien ne quitte votre machine.",
    serverAddress: "Adresse du serveur local",
    connectionHint:
      "Démarrez votre serveur d'inférence local, vérifiez son adresse et son port, puis réessayez.",
    noModelLoaded:
      "Le serveur répond mais aucun modèle n'est chargé. Chargez-en un dans votre serveur d'inférence puis réessayez.",
    testConnection: "Tester la connexion",
    connecting: "Connexion…",
    createFirstCharacter:
      "Créez votre premier personnage. Vous pourrez tout modifier ensuite.",
    whatShouldWeCallYou: "Comment doit-on vous appeler ?",
    namePlaceholder: "Votre prénom",
    userNameHint:
      "Ce nom désigne vos messages, en particulier dans les conversations réunissant plusieurs personnages.",
    continue: "Continuer",
  },

  cast: {
    title: "Scène",
    subtitle: "Décor et personnages",
    closePanel: "Fermer le panneau",
    afterCurrentTurn: "Après le tour en cours",
    theCharacter: "Le personnage",
    pendingEnter: (name: string) => `${name} entrera.`,
    pendingLeave: (name: string) => `${name} sortira.`,
    setting: "Décor",
    noSetting: "Aucune mise en scène.",
    editSetting: "Modifier le décor",
    settingHint:
      "Ajouté au prompt de chaque personnage présent. Les modèles ne relisent " +
      "pas le passé : le changement vaut pour les répliques à venir.",
    autonomousConversation: "Conversation autonome",
    afterYourMessage: "Après votre message",
    theyWait: "Ils attendent",
    roundsAmongThem: (n: number) => `${n} tour${n > 1 ? "s" : ""} entre eux`,
    continueNow: "Continuer maintenant",
    resumeAutonomy: "Reprendre l’autonomie",
    pauseAutonomy: "Mettre en pause",
    idleHint: "La reprise après un silence se règle dans Réglages → Conversation.",
    present: "Présents",
    available: "Disponibles",
    speakEarlier: "Parler plus tôt",
    speakLater: "Parler plus tard",
    makeLeave: (name: string) => `Faire sortir ${name}`,
    mustKeepOne: "Il doit rester un personnage dans la conversation",
    leave: "Sortir",
    makeEnter: (name: string) => `Faire entrer ${name}`,
    enter: "Entrer",
    allPresent: "Tous vos personnages sont présents.",
    describeArrival: "Décrivez son arrivée",
    describeDeparture: "Décrivez son départ",
    narrationHint:
      "Cette didascalie apparaît dans la conversation sans être attribuée à " +
      "quelqu'un ; les personnages présents la lisent comme un fait.",
    makeOthersReact: "Faire réagir les personnages présents",
    bringIn: "Faire entrer",
    sendOut: "Faire sortir",
  },

  personas: {
    title: "Personnages",
    subtitle: "Sélectionnez un personnage à gauche pour modifier sa fiche.",
    import: "Importer",
    export: "Exporter",
    addCharacter: "+ Personnage",
    newCharacter: "Nouveau personnage",
    defaultCharacterPrompt:
      "Tu es une présence posée et attentive. Tu réponds en français, avec " +
      "chaleur et concision. Tu tutoies ton interlocuteur.",
    exported: (count: number) =>
      `${count} personnage${count > 1 ? "s exportés" : " exporté"}.`,
    imported: (count: number) =>
      `${count} personnage${count > 1 ? "s ajoutés" : " ajouté"}.`,
    nothingImportable: "Aucun personnage exploitable dans ce fichier.",
    exportFileName: "distribution.json",
    pickStartingPoint: "Choisir un point de départ",
    everythingEditable: "Tout reste modifiable après la création.",
    blankSheet: "Fiche vierge",
    createFreely: "Créer librement",
    portraitOf: (name: string) => `Portrait de ${name}`,
    templateRoles: {
      police: "Policier",
      robot: "Robot",
      scientist: "Scientifique",
      artist: "Artiste",
    },
    yourName: "Votre nom",
    yourNameHint: "Utilisé par les personnages pour s’adresser à vous.",
    characterList: "Liste des personnages",
    noDescription: "Sans description",
    namePlaceholder: "Nom",
    descriptionPlaceholder: "Description — qui est-il, en une ligne",
    genderTitle:
      "Accord des adjectifs et participes, pour ce personnage et pour ceux qui parlent de lui",
    showAllPortraits: "Afficher tous les portraits",
    choosePortrait: "Choisir un portrait",
    responseStyleTitle: "Style, réflexion et longueur des réponses",
    closeSettings: "Fermer les réglages",
    responseStyle: "Style de réponse",
    portraitCount: (count: number, gender: string) =>
      `${count} proposition${count > 1 ? "s" : ""} pour « ${gender} »`,
    choosePortraitNumber: (n: number) => `Choisir le portrait ${n}`,
    characterPlaceholder:
      "Caractère — comment il parle, ce qui le motive, ce qu'il évite",
    responseTone: "Ton des réponses",
    styles: {
      plain: { label: "Sobre", description: "Stable et factuel" },
      natural: { label: "Naturel", description: "Équilibré et vivant" },
      creative: { label: "Créatif", description: "Plus libre et surprenant" },
    },
    responseLengthTitle: "Longueur des réponses",
    lengthExplanation:
      "Praxis réserve automatiquement la place nécessaire dans la capacité du modèle.",
    stableTraits: "Traits marquants",
    stableTraitsHint:
      "Quelques mots facultatifs pour stabiliser sa personnalité.",
    traitsPlaceholder: "Ex. curieux, direct, protecteur",
    noCharacters: "Aucun personnage. Créez-en un pour commencer une conversation.",
    deleteTitle: (name: string) => `Supprimer ${name} ?`,
    deleteSolo: (count: number) =>
      `${count} conversation${count > 1 ? "s" : ""} où il est seul en scène ` +
      `ser${count > 1 ? "ont" : "a"} supprimé${count > 1 ? "s" : ""}.`,
    deleteShared: (count: number) =>
      `${count} conversation${count > 1 ? "s" : ""} à plusieurs ` +
      `ser${count > 1 ? "ont" : "a"} conservé${count > 1 ? "s" : ""} : il quitte ` +
      `la scène, ses répliques restent lisibles.`,
    deleteEmotion: "Son état émotionnel sera supprimé.",
  },

  chat: {
    conversation: "Conversation",
    noCharacter: "Aucun personnage",
    serverFallback: "Serveur",
    connectedTo: (name: string, url: string) => `${name} connecté (${url})`,
    unreachable: (name: string) => `${name} inaccessible`,
    sceneButtonTitle: "Décor, personnages et automatisations",
    scene: "Scène",
    moreOptions: "Plus d’options",
    noModel: "aucun modèle",
    connection: "Connexion",
    conversationSummary: "Résumé de la conversation",
    temperature: "Température",
    temperatureAria: "Température de cette conversation",
    characterValue: "Valeur du personnage",
    modelCapacity: "Capacité du modèle",
    tokens: (formatted: string) => `${formatted} tokens`,
    contextSent: "Contexte envoyé",
    roomForReply: (length: string) => `Place pour une réponse ${length}`,
    upTo: (formatted: string) => `jusqu’à ${formatted}`,
    capacityBarTitle: "Contexte envoyé puis place réservée pour la réponse",
    capacityBarAria: "Répartition de la capacité du modèle",
    capacityNote:
      "Le reste est la marge disponible. Les anciens messages sont résumés avant de la dépasser.",
    openSettings: "Ouvrir les réglages",
    closeSummary: "Fermer le résumé",
    condensedMemory: "Mémoire condensée",
    summaryExplanation:
      "Ce texte est transmis aux personnages pour préserver les faits anciens. " +
      "Les échanges récents restent conservés intégralement à côté de cette mémoire.",
    noSummaryYet: "Aucune mémoire condensée pour le moment",
    noSummaryBody:
      "Les échanges récents sont encore transmis intégralement aux personnages. " +
      "Un résumé devient utile quand la conversation s'allonge.",
    summaryCounts: (condensed: number, recent: number) =>
      `${condensed} anciens messages condensés · ${recent} récents conservés intégralement`,
    summaryAvailableFrom: (count: number) =>
      `${count} messages disponibles pour créer cette mémoire`,
    summaryAvailableAfter: (threshold: number) =>
      `Disponible après plus de ${threshold} messages`,
    generating: "Génération…",
    regenerateSummary: "Régénérer le résumé",
    createSummary: "Créer le résumé",
    compressing: "Compression du contexte…",
    compressingCount: (count: number) =>
      `${count} anciens messages passent dans le résumé`,
    startingSituation: "Situation de départ",
    welcomeGroup: (names: string, first: string) =>
      `${names} sont là. Sous la zone de saisie, choisissez qui répond — ou ` +
      `laissez « Auto » et écrivez « @${first} » dans votre message.`,
    welcomeSolo: (name: string) => `Commencez une conversation avec ${name}.`,
    welcomeEmpty: "Créez d'abord un personnage dans la page Personnages.",
    everyone: "tout le monde",
    interrupted: "Réponse interrompue",
    regenerate: "Régénérer",
    idleCountdown: (seconds: number) =>
      `Sans réponse de votre part, la conversation reprend dans ${seconds} s.`,
    pause: "Mettre en pause",
    waitForMyMessage: "Attendre mon message",
    scenePaused: "Scène en pause : les personnages n'enchaînent plus tout seuls.",
    resume: "Reprendre",
    whoSpeaks: "Qui prend la parole…",
    isAnswering: (name: string) => `${name} répond…`,
    thenSpeakers: (names: string) => `ensuite : ${names}`,
    sceneContinuesBelow: "La scène continue plus bas",
    newLinesBelow: "Nouvelles répliques plus bas",
    queued: "En attente",
    yourTurn: "À vous de parler",
    composerOptions: "Options de saisie",
    composerOptionsTitle: "Parole, action ou événement de scène",
    speak: "Parler",
    speakHint: "Un message de votre part",
    sceneEvent: "Événement de scène",
    sceneEventHint: "Un bruit, une arrivée, un incident…",
    insertAction: "Insérer une action",
    insertActionHint: "Ajoute des *astérisques*",
    to: "À",
    whoShouldAnswer: "Qui doit répondre",
    auto: "Auto",
    scenePlaceholder: "La sonnette de l'appartement retentit…",
    groupPlaceholder: "Écrire à la scène… @Nom pour appeler quelqu'un",
    writeTo: (name: string) => `Écrire à ${name}…`,
    createCharacterFirst: "Créez d'abord un personnage…",
    mentionListAria: "Personnages à mentionner",
    mentionTitle: "Appeler un personnage",
    willBeCalled: "Sera appelé dans ce message",
    noMatchingCharacter: "Aucun personnage correspondant",
    keyChoose: "choisir",
    keyInsert: "insérer",
    keyClose: "fermer",
    stop: "Arrêter",
    send: "Envoyer",
    makeArrive: "Faire arriver",
    sendLater: (base: string) => `${base} ensuite`,
    deferredTitle: "On vous répond : votre message part dès la fin du tour",
    interruptTitle:
      "Les personnages échangent entre eux : votre message coupe court aux tours restants",
    sceneNote: "Événement de scène — ce texte n’est attribué à personne.",
    willAnswer: (names: string, plural: boolean) =>
      `${names} ${plural ? "répondront" : "répondra"}.`,
    turnSpeaking: (name: string) => `${name} vous répond…`,
    turnChaining: (name: string) => `${name} enchaîne…`,
    turnDirecting: "La scène choisit qui prend la parole…",
    turnCompressing: "Compression du contexte…",
    turnWrappingAuto: "Les personnages enchaînent…",
    turnWrapping: "Fin du tour…",
    theCharacter: "Le personnage",
    floorHintAutonomous: "écrivez : vous reprenez la parole après cette réplique",
    floorHintDeferred: "vous pouvez écrire : votre message partira à la fin du tour",
  },

  newChat: {
    subtitle: "Choisissez les personnages. Vous pourrez modifier la scène à tout moment.",
    whoToTalkTo: "Avec qui voulez-vous discuter ?",
    noCharacters: "Aucun personnage.",
    createOneFirst: "Créez-en un d'abord.",
    situation: "Situation",
    optional: "facultative",
    situationPlaceholder:
      "Où êtes-vous, à quel moment, que vient-il de se passer ?",
    useExample: "Utiliser un exemple",
    example:
      "Un soir d'automne, dans le salon d'un vieil appartement. " +
      "La pluie bat les fenêtres. Du thé refroidit sur la table et un livre " +
      "reste ouvert sur le canapé, manifestement abandonné en pleine lecture. " +
      "Personne n'a encore abordé le sujet qui fâche.",
    hideOptions: "Masquer",
    showOptions: "Afficher",
    advancedOptions: "les options avancées",
    customTitle: "Titre personnalisé",
    titlePlaceholder: "Généré automatiquement si vide",
    speakingOrder: "Ordre de parole",
    pickAtLeastOne: "Choisissez au moins un personnage.",
    creating: "Création…",
    start: "Commencer",
  },

  fatal: {
    dbUnavailable: "La base de données est inaccessible",
    dbUnavailableBody: (detail: string) =>
      `L'application n'a pas pu ouvrir son stockage local. Vos données n'ont pas ` +
      `été modifiées. Détail : ${detail}`,
  },

  settings: {
    title: "Réglages",
    sectionsAria: "Rubriques des réglages",
    tabs: {
      connections: "Connexion",
      conversation: "Conversation",
      appearance: "Apparence",
      advanced: "Avancé",
      data: "Données",
    },
    language: "Langue",
    languageIntro:
      "L'interface et les personnages ne sont pas obligés de partager la même langue.",
    connections: "Connexions",
    connectionsHint:
      "Chaque connexion garde son adresse, sa clé, son modèle et son délai. " +
      "Basculer de l'une à l'autre ne demande aucune ressaisie.",
    remoteTag: "distant",
    serverTypeAria: "Type de serveur à ajouter",
    keepOneConnection: "Il doit rester au moins une connexion.",
    deleteConnectionTitle: "Supprimer cette connexion et sa clé",
    unnamed: "Sans nom",
    baseUrl: "URL de base",
    baseUrlHint:
      "L'adresse d'un serveur local, terminée par /v1. Les préréglages ci-dessus " +
      "remplissent celles des serveurs courants.",
    apiKey: "Clé API (facultative)",
    apiKeyHint:
      "Propre à cette connexion, stockée dans le coffre sécurisé du système — " +
      "jamais dans la base, ni dans les exports.",
    keySaved: "Clé enregistrée.",
    keyRemoved: "Clé supprimée du coffre.",
    timeout: "Délai d'expiration (secondes)",
    allowRemote:
      "Autoriser un hôte distant pour cette connexion (sinon, seul localhost est joignable)",
    remoteWarning:
      "Les conversations envoyées avec cette connexion quittent votre machine.",
    testing: "Test en cours…",
    testConnection: "Tester la connexion",
    connectionOk: "Connexion réussie.",
    modelForConnection: "Modèle utilisé par cette connexion",
    filterModels: "Filtrer la liste (ex. deepseek)",
    refresh: "Actualiser",
    automaticFirstModel: "— Automatique : le premier modèle exposé —",
    noModel: "aucun modèle",
    noModelsAnnounced:
      "Aucun modèle annoncé par ce serveur. Testez la connexion, ou chargez un " +
      "modèle côté serveur puis actualisez.",
    modelGone: (id: string) =>
      `Ce serveur ne liste plus ${id}. Les requêtes partiront quand même sous ce ` +
      `nom et échoueront probablement : choisissez-en un autre dans la liste.`,
    modelsAnnounced: (count: number) =>
      `${count} modèle${count > 1 ? "s" : ""} annoncé${count > 1 ? "s" : ""} par ` +
      `ce serveur. En « Automatique », le premier de la liste est employé — cela ` +
      `suffit à un serveur local qui n'en sert qu'un, mais pas à une passerelle ` +
      `qui en expose des centaines : choisissez explicitement.`,
    modelCapacity: "Capacité totale du modèle",
    automaticDetected: (k: number) => `Automatique (${k}K détectés)`,
    automaticFallback: (k: number) => `Automatique (${k}K de secours)`,
    custom: "Personnalisée…",
    capacityExplanation:
      "C'est tout ce que le modèle peut lire et écrire en une fois : identité, " +
      "conversation, situation et prochaine réponse. Praxis la demande au serveur ; " +
      "ne la saisissez que pour retenir un budget plus court. La longueur de " +
      "chaque réponse se choisit dans la fiche du personnage ; sa place est " +
      "réservée automatiquement.",
    capacityManual: (tokens: string) =>
      `Capacité saisie : ${tokens} tokens pour ce modèle.`,
    capacityDetected: (announced: string, used: string) =>
      `Détectée auprès du serveur : ${announced} tokens annoncés, ${used} ` +
      `employés en gardant une marge.`,
    capacityFallback: (tokens: string) =>
      `Ce serveur n'annonce pas sa capacité ; repli sur ${tokens} tokens.`,
    customCapacity: "Capacité personnalisée",
    capacitySaved: (k: number) => `Capacité enregistrée : ${k}K.`,
    capacityReturned: "Capacité rendue au serveur.",
    capacityTooSmall: "Indiquez une capacité d’au moins 2 048 tokens.",
    advancedInference: "Inférence avancée",
    hide: "Masquer",
    show: "Afficher",
    technicalParameters: "les paramètres techniques",
    fallbackCapacity: "Capacité de secours du mode Automatique",
    fallbackCapacityHint:
      "Utilisée uniquement lorsqu'aucune capacité précise n'est enregistrée pour " +
      "le modèle actif.",
    selectModelFirst: "Sélectionnez d'abord un modèle.",
    technicalProfileOf: (id: string) => `Profil technique de ${id}.`,
    reasoningOff: "Raisonnement désactivé",
    reasoningOffBody:
      "Praxis n'expose pas de mode réfléchi : le raisonnement est coupé à chaque " +
      "requête, quel que soit le serveur. Ces paramètres sont ajoutés " +
      "automatiquement et remplacent toute valeur contradictoire ci-dessous. Un " +
      "serveur qui ne les connaît pas les ignore.",
    otherCustomParameters: "Autres paramètres personnalisés (JSON, facultatif)",
    reasoningKeyManaged:
      "La clé « reasoning » est gérée par Praxis et retirée de ce champ.",
    saveProfile: "Enregistrer le profil",
    profileSaved: "Profil enregistré. Le raisonnement reste désactivé.",
    parametersMustBeObject: "les paramètres doivent être un objet JSON",
    performance: "Performance",
    historyWindow: "Messages conservés en clair avant résumé",
    historyWindowHint: (keptRecent: number, ratioPercent: number) =>
      `Chaque requête retraite l'historique non résumé, et une scène à deux ` +
      `personnages produit trois messages par tour. Au-delà de ce nombre, les ` +
      `plus anciens passent dans le résumé. Baissez-le si les réponses ` +
      `ralentissent ; montez-le si les personnages perdent le fil. Le défaut est ` +
      `30. Les ${keptRecent} messages les plus récents restent toujours conservés ` +
      `mot pour mot ; une compression est aussi déclenchée vers ${ratioPercent} % ` +
      `de la fenêtre.`,
    groupConversation: "Conversation à plusieurs personnages",
    whoSpeaks: "Qui prend la parole",
    roundRobin: "Chacun son tour",
    modelDecides: "Le modèle décide",
    whoSpeaksHint:
      "« Chacun son tour » fait répondre tout le monde, dans l'ordre de la scène — " +
      "sûr, mais mécanique. « Le modèle décide » demande avant chaque tour qui " +
      "réagirait naturellement : un personnage ignoré peut se taire, deux peuvent " +
      "répondre ensemble, et la scène peut retomber d'elle-même. Cela coûte une " +
      "requête courte de plus par tour, et vos mentions « @Nom » restent toujours " +
      "prioritaires.",
    autoRounds: "Échanges automatiques entre personnages",
    autoRoundsNone: "Aucun — ils attendent votre message",
    autoRoundsN: (n: number) => `${n} tour${n > 1 ? "s" : ""} supplémentaire${n > 1 ? "s" : ""}`,
    autoRoundsHint: (cap: number) =>
      `Après votre message, les personnages se répondent entre eux pendant ce ` +
      `nombre de tours. Un plafond dur de ${cap} prises de parole par personnage ` +
      `s'applique dans tous les cas, et « Arrêter » interrompt la série ` +
      `immédiatement.`,
    idleResume: "Reprise après un silence (secondes)",
    idleResumeHint:
      "Si vous ne dites rien pendant ce temps, les personnages reprennent la " +
      "parole entre eux. 0 pour qu'ils attendent toujours votre message. Taper " +
      "dans la zone de saisie repousse l'échéance.",
    characterBehaviour: "Comportement des personnages",
    defaultPersona: "Personnage proposé au démarrage d'une conversation",
    noneOption: "— Aucun —",
    keepEmotion: "Conserver l'évolution émotionnelle des personnages",
    analyseReaction: "Analyser leur réaction avant chaque réponse",
    analyseReactionHint:
      "Rend les réactions plus expressives, au prix d'une courte requête " +
      "supplémentaire avant chaque réplique.",
    varyAvatars: "Faire varier les avatars selon l'humeur et le moment de la journée",
    reset: (name: string) => `Réinitialiser ${name}`,
    theme: "Thème",
    themeIntro:
      "Le changement est immédiat. « Système » suit automatiquement le mode clair " +
      "ou sombre de votre ordinateur.",
    themes: {
      system: { label: "Système", description: "Suit votre ordinateur" },
      dark: { label: "Sombre", description: "Velours et pénombre" },
      light: { label: "Clair", description: "Papier et lumière" },
    },
    readingComfort: "Confort de lecture",
    conversationTextSize: "Taille des conversations",
    conversationTextSizeHint: "Modifie les répliques et la zone de saisie.",
    textSizes: {
      small: { label: "Petite", description: "Plus de texte à l’écran" },
      normal: { label: "Normale", description: "Lecture équilibrée" },
      large: { label: "Grande", description: "Lecture plus confortable" },
    },
    threadSpacing: "Espacement du fil",
    threadSpacingHint:
      "Change l’air entre les messages sans modifier leur contenu.",
    densities: {
      comfortable: { label: "Confortable", description: "Bulles plus aérées" },
      compact: { label: "Compacte", description: "Plus de messages visibles" },
    },
    data: "Données",
    exportAll: "Exporter tout en JSON",
    importBackup: "Importer une sauvegarde",
    deleteAll: "Supprimer toutes les données",
    exportFileName: "praxis-export.json",
    exportDone: "Export terminé.",
    importDone: "Import terminé. Rechargement…",
    importFailed: (reason: string) => `Échec de l'import : ${reason}`,
    allowRemoteTitle: "Autoriser un serveur distant ?",
    allowRemotePreset: (name: string, url: string) =>
      `${name} (${url}) n'est pas sur votre machine.`,
    allowRemoteBody:
      "Les messages, personnages et souvenirs employés avec cette connexion " +
      "seront transmis à ce serveur, soumis à ses conditions et à sa politique " +
      "de conservation. Les connexions locales ne sont pas concernées.",
    allowThisConnection: "J'autorise cette connexion",
    deleteConnectionModal: (name: string) => `Supprimer « ${name} » ?`,
    deleteConnectionBody:
      "Cette connexion et sa clé API seront effacées. Vos conversations, " +
      "personnages et souvenirs ne sont pas touchés.",
    wipeTitle: "Tout supprimer ?",
    wipeBody:
      "Conversations, personnages, états émotionnels et réglages seront " +
      "définitivement effacés de cette machine. Cette action est irréversible.",
    wipeConfirm: "Supprimer définitivement",
    presetHints: {
      mlxserve: "Serveur local de MLX Core, sur son port par défaut.",
      llamacpp: "Serveur intégré de llama.cpp.",
      ollama: "API compatible OpenAI exposée par Ollama.",
      openrouter:
        "Passerelle distante : les conversations envoyées avec cette connexion " +
        "quittent votre machine. Une clé API est nécessaire.",
    },
    uiLanguage: "Langue de l'interface",
    conversationLanguage: "Langue des conversations",
    conversationLanguageHint:
      "La langue dans laquelle les personnages parlent. Elle est fixée par le " +
      "prompt, donc indépendante de la langue de l'interface.",
  },

  persona: {
    name: "Nom",
    description: "Description",
    personalityPrompt: "Personnalité (prompt système)",
  },

  app: {
    narrationSpeaker: "Scène",
    personaWillEnter: (name: string) =>
      `${name} entrera dès la fin du tour en cours.`,
    personaWillLeave: (name: string) =>
      `${name} sortira dès la fin du tour en cours.`,
    autoTurnsExhausted:
      "Les personnages ont déjà enchaîné plusieurs tours. Écrivez un message pour relancer la scène.",
    noConnection: "Aucune connexion configurée. Ajoutez un serveur dans les réglages.",
    noModel: "Aucun modèle sélectionné. Choisissez un modèle dans les réglages.",
    waitBeforeRebuildingSummary:
      "Attendez la fin de la réponse avant de recréer le résumé.",
    cannotRebuildSummaryOffline:
      "Impossible de recréer le résumé sans modèle connecté.",
    summaryAppearsLater: (keptMessages: number) =>
      `Le résumé apparaîtra lorsque la conversation dépassera ` +
      `${keptMessages} messages ; les échanges actuels sont encore ` +
      `conservés intégralement.`,
    summaryRebuildFailed: (reason: string) =>
      `Impossible de recréer le résumé : ${reason}. Réessayez avec ce même bouton.`,
    nothingOldToSummarize: "Il n'y a pas encore d'anciens messages à résumer.",
    summaryRebuilt: (keptMessages: number) =>
      `Résumé recréé à partir des messages d'origine ; ${keptMessages} messages ` +
      `récents restent conservés intégralement.`,
    contextCompressed: (absorbed: number, kept: number) =>
      `Contexte compressé : ${absorbed} ancien` +
      `${absorbed > 1 ? "s messages intégrés" : " message intégré"} ` +
      `au résumé, ${kept} conservés en clair.`,
    autoSummaryInterrupted: (reason: string) =>
      `Résumé automatique interrompu : ${reason}. La conversation continue ` +
      `normalement. Ouvrez ••• → Résumé de la conversation pour le régénérer ` +
      `immédiatement, ou attendez la prochaine tentative automatique.`,
  },
};
