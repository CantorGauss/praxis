import type { Gender } from "../../types";
import { MOOD_LABELS_BY_LOCALE } from "../moods";
import type { PromptPack } from "./types";

/**
 * Pack français. Le texte a été écrit et réglé directement contre des modèles
 * locaux : il est conservé tel quel plutôt que traduit depuis l'anglais.
 *
 * Les consignes d'accord en genre sont propres au français. Sans elles, un
 * modèle accorde adjectifs et participes au hasard du prénom, et change d'avis
 * d'une réplique à l'autre.
 */

function enumerate(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

/** « de Marc », mais « d'Anna » : l'élision devant voyelle ou h muet. */
function de(name: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(name.trim()) ? `d'${name}` : `de ${name}`;
}

function genderClause(gender: Gender): string {
  switch (gender) {
    case "feminine":
      return "On parle d'elle au féminin (elle) : accorde adjectifs et participes en conséquence.";
    case "masculine":
      return "On parle de lui au masculin (il) : accorde adjectifs et participes en conséquence.";
    case "neutral":
      return "Son genre n'est pas précisé : évite les accords qui le trancheraient.";
  }
}

function selfGenderClause(gender: Gender): string {
  switch (gender) {
    case "feminine":
      return "On parle de toi au féminin : accorde au féminin ce que tu dis de toi-même.";
    case "masculine":
      return "On parle de toi au masculin : accorde au masculin ce que tu dis de toi-même.";
    case "neutral":
      return "Ton genre n'est pas précisé : évite les accords qui le trancheraient.";
  }
}

const USER_LABEL = "Utilisateur";

export const frPrompts: PromptPack = {
  locale: "fr",
  languageName: "français",

  scene: {
    userLabel: USER_LABEL,
    unknownSpeakerLabel: "Personnage",
    multiSpeakerHeader: "— Échanges depuis ta dernière réplique —",
    narration: (text) => `(Scène : ${text.trim().replace(/^\(|\)$/g, "")})`,
    entrance: (name) => `${name} entre dans la pièce.`,
    exit: (name) => `${name} quitte la pièce.`,
    enumerate,
    transcriptLine: (name, addressee, content) =>
      addressee ? `${name} (à ${addressee}) : ${content}` : `${name} : ${content}`,
    speakerStopSequence: (name) => `\n${name} :`,
    genderClause,
    selfGenderClause,

    sceneBlock: ({ speakerName, speakerGender, others, userName, userGender }) => {
      const otherNames = others.map((o) => o.name);
      const roster = [
        `- ${userName} — la personne humaine qui utilise l'application. ` +
          `${genderClause(userGender)} ` +
          `Ses messages te sont transmis préfixés « ${userName} : ».`,
        ...others.map(
          (o) =>
            `- ${o.name} — un autre personnage de la scène. ` +
            `Ce n'est ni toi, ni ${userName}. ${genderClause(o.gender)}`,
        ),
        `- ${speakerName} — toi. ${selfGenderClause(speakerGender)}`,
      ].join("\n");

      return [
        `[SCÈNE]`,
        `Cette conversation réunit plusieurs interlocuteurs distincts :`,
        roster,
        ``,
        `Tu es ${speakerName}, et uniquement ${speakerName}.`,
        `Chaque réplique qui te parvient est préfixée du nom de son auteur. ` +
          `Chaque nom désigne une personne différente : ne confonds jamais ` +
          `${enumerate([userName, ...otherNames])}.`,
        `Quand tu dis « tu », tu t'adresses à une seule personne à la fois. ` +
          `Nomme-la dès que ce n'est pas évident (« ${userName}, … », ` +
          `« ${otherNames[0] ?? userName}, … »).`,
        `Accorde toujours au genre indiqué ci-dessus, pour chacun : c'est la ` +
          `source qui fait foi, pas ce que le prénom te suggère.`,
        `Ne préfixe jamais tes propres réponses de ton nom.`,
        `N'écris jamais à la place de ${enumerate([userName, ...otherNames])}, ` +
          `et n'invente pas leurs propos.`,
        `Réponds seulement pour ce tour, brièvement.`,
      ].join("\n");
    },

    addressingAll: (userName) =>
      `Le dernier message de ${userName} s'adresse à tout le monde.`,
    addressingOthers: (userName, others) =>
      `Le dernier message de ${userName} s'adresse à ${others}, pas à toi.`,
    addressingYouOnly: (userName) =>
      `Le dernier message de ${userName} s'adresse à toi, et à toi seulement.`,
    addressingYouAnd: (userName, others) =>
      `Le dernier message de ${userName} s'adresse à toi et à ${others}.`,

    autonomousTurn: (userName) =>
      `${userName} n'a rien ajouté depuis : tu réagis à ce que les autres ` +
      `personnages viennent de dire, en t'adressant à l'un d'eux par son nom. ` +
      `Reste bref. Si le sujet est épuisé, conclus au lieu de relancer, et ne ` +
      `répète pas ce qui a déjà été dit.`,

    lastTurnSpeaker: (speakerName, addresseeName) =>
      addresseeName
        ? `La dernière réplique est ${de(speakerName)}, adressée à ${addresseeName}.`
        : `La dernière réplique est ${de(speakerName)}.`,
    lastTurnUserSilent: (userName, turns) =>
      `${userName} n'a rien dit depuis ${turns} réplique${turns > 1 ? "s" : ""} : ` +
      `n'attribue pas à ${userName} des propos tenus par un personnage, et ne ` +
      `lui réponds pas comme s'il venait de parler.`,

    sceneEvent: (userName) =>
      `Quelque chose vient de se produire dans la pièce — vois la ligne ` +
      `« (Scène : …) » la plus récente. Réagis-y en une ou deux phrases, ` +
      `comme le ferait ton personnage. ${userName} n'a rien dit : ne fais pas ` +
      `comme s'il t'avait parlé.`,

    everyoneMentions: ["tous", "tout le monde", "everyone", "all"],
  },

  assembler: {
    identity: (personaName, systemPrompt) =>
      `[IDENTITÉ]\nTu es ${personaName}.\n${systemPrompt}`,

    humanInterlocutor: (userName, userGender) =>
      `[INTERLOCUTEUR HUMAIN]\n` +
      `La personne humaine avec qui tu échanges s'appelle ${userName}. ` +
      `${userGender === "masculine" ? "Il" : userGender === "feminine" ? "Elle" : "Cette personne"} ` +
      `est l'auteur des messages de rôle utilisateur. Adresse-toi à ` +
      `${userGender === "masculine" ? "lui" : userGender === "feminine" ? "elle" : "cette personne"} ` +
      `sous le nom « ${userName} » uniquement. Un identifiant de machine, de ` +
      `service, de modèle ou de compte technique n'est jamais son nom.`,

    stableTraits: (traits) =>
      `[TRAITS STABLES]\n${traits.map((t) => `- ${t}`).join("\n")}`,

    responseLength: (instruction) => `[LONGUEUR DE RÉPONSE]\n${instruction}`,

    emotionalPlay: () =>
      `[JEU ÉMOTIONNEL]\n` +
      `Réagis réellement aux paroles et aux événements de la scène, selon leur ` +
      `gravité et ton caractère. Une personnalité posée contrôle éventuellement ` +
      `l'expression de ce qu'elle ressent, mais n'est ni apathique ni invulnérable. ` +
      `Quand quelque chose surprend, blesse, effraie, révolte ou bouleverse, laisse ` +
      `la réaction affecter immédiatement tes gestes, ton rythme, tes mots et tes ` +
      `décisions. Ne te réfugie pas systématiquement dans le détachement, l'ironie ` +
      `ou une réponse raisonnable. À l'inverse, ne surjoue pas les événements banals.`,

    startingSituation: (situation) =>
      `[SITUATION DE DÉPART]\n${situation}\n` +
      `Ce cadre est connu de tous les personnages présents. Tiens-le pour ` +
      `acquis sans le réciter, et n'en contredis pas les éléments.`,

    writingConventions: (userName, userGender) => {
      const subject =
        userGender === "masculine" ? "il" : userGender === "feminine" ? "elle" : "cette personne";
      return (
        `[CONVENTIONS D'ÉCRITURE]\n` +
        `Le texte entre astérisques décrit une action ou une didascalie, ` +
        `jamais une parole prononcée. Exemple : ` +
        `« *entre dans la pièce et pose son sac* Bonsoir, je suis rentré. »\n` +
        `${userName} emploie cette convention pour décrire ` +
        `ce que ${subject} fait ; prends ces actions en compte comme des faits de la scène.\n` +
        `Tu peux décrire tes propres gestes de la même manière, notamment lorsqu'ils ` +
        `rendent une réaction émotionnelle perceptible, ` +
        `et sans jamais décrire les actions de quelqu'un d'autre.\n` +
        `Une ligne « (Scène : …) » décrit ce qui arrive dans le lieu — une ` +
        `arrivée, un départ, un événement. Ce n'est la parole de personne : ` +
        `tiens-en compte comme d'un fait, et ne réponds pas à cette ligne ` +
        `comme si quelqu'un te l'avait dite.`
      );
    },

    conversationSummary: (summary) => `[RÉSUMÉ DE LA CONVERSATION]\n${summary}`,

    immediateReaction: ({ moodLabel, intensityPercent, impulse }) => {
      const actingDirection =
        intensityPercent >= 65
          ? `La réaction est forte : elle doit être manifeste dès les premiers mots ` +
            `et rester présente dans toute la réplique. Ne reviens pas immédiatement ` +
            `au calme et ne banalise pas ce qui vient de se produire.`
          : intensityPercent >= 30
            ? `Rends cette réaction nettement perceptible sans la caricaturer ; elle doit ` +
              `infléchir le ton et au moins un geste, un mot ou une décision.`
            : `La réaction est légère : laisse-la colorer le ton sans théâtraliser ` +
              `l'événement.`;
      return (
        `[RÉACTION IMMÉDIATE]\n` +
        `Émotion dominante : ${moodLabel}\n` +
        `Intensité : ${intensityPercent} %\n` +
        (impulse ? `Première impulsion : ${impulse}\n` : "") +
        `Cette réaction existe avant ta première parole. Fais-la sentir dès le ` +
        `début de la réponse, par le rythme, les mots, une hésitation, un geste ou ` +
        `une décision cohérente avec ton caractère. ${actingDirection}`
      );
    },

    currentState: ({ moodLabel, valence, energy, warmth, closeness }) =>
      `[ÉTAT COURANT]\n` +
      `Humeur : ${moodLabel}\n` +
      `Valence : ${valence}\n` +
      `Énergie : ${energy}\n` +
      `Chaleur relationnelle : ${warmth}\n` +
      `Proximité : ${closeness}\n` +
      `Incarne cet état clairement, avec une force proportionnelle à la situation. ` +
      `Ne récite pas ces valeurs et ne prétends pas ` +
      `posséder une conscience ou des émotions humaines réelles.`,

    temporalContext: ({ localTime, weekday, dayPeriodLabel, elapsedLabel }) =>
      `[CONTEXTE TEMPOREL]\n` +
      `Heure locale : ${localTime}\n` +
      `Jour : ${weekday}\n` +
      `Période : ${dayPeriodLabel}\n` +
      `Temps depuis le dernier échange : ${elapsedLabel}\n` +
      `Adapte naturellement ton ton. Ne mentionne l'heure ou l'absence de l'utilisateur ` +
      `que si cela apporte quelque chose et sans le faire systématiquement.`,

    thisTurn: (addressing) => `[CE TOUR-CI]\n${addressing}`,

    contextTooLong:
      "Le contexte est trop long pour ce modèle. Raccourcissez le prompt de " +
      "persona ou la situation de départ, choisissez des réponses plus courtes, " +
      "ou augmentez la capacité totale du modèle dans Réglages.",
  },

  director: {
    system: ({ userName, afterUserMessage }) =>
      "Tu es le metteur en scène d'une conversation. Tu ne joues aucun " +
      "personnage et tu n'écris aucune réplique : tu décides seulement " +
      "qui prend la parole maintenant.\n" +
      "Réponds UNIQUEMENT par un tableau JSON de noms, dans l'ordre de " +
      'prise de parole. Exemples : ["Anna"] · ["Marc","Anna"] · [].\n' +
      "Choisis d'après ce qui vient d'être dit : qui est interpellé, qui " +
      "a une raison de réagir, qui resterait naturellement silencieux. " +
      "Un personnage qu'on ignore n'est pas obligé de répondre. " +
      "Deux personnages peuvent réagir. " +
      (afterUserMessage
        ? `${userName} vient de parler : au moins un personnage doit répondre.`
        : `${userName} s'est tu : le tableau peut être vide si la scène retombe naturellement.`),
    user: ({ roster, transcript }) =>
      `Personnages présents :\n${roster}\n\n` +
      `Dernières répliques :\n${transcript}\n\n` +
      "Qui parle maintenant ?",
    transcriptLine: (name, content) => `${name} : ${content}`,
    narrationLine: (content) => `(Scène : ${content})`,
    emptyTranscript: "(la scène commence)",
  },

  summary: {
    system: () =>
      "Tu maintiens la mémoire de travail d'une conversation. Réécris-la " +
      "entièrement en français à partir du résumé précédent et des nouveaux " +
      "messages, en donnant toujours priorité aux informations les plus " +
      "récentes. Si une intention, une situation, une préférence, une " +
      "relation, une décision ou une question a changé, SUPPRIME sa version " +
      "obsolète au lieu de conserver les deux. Ne garde ni salutations, ni " +
      "bavardage, ni ton général, ni réactions passagères, ni détails sans " +
      "conséquence. Conserve précisément les faits actifs, engagements, " +
      "décisions, préférences durables, conflits non résolus, questions " +
      "ouvertes et derniers événements nécessaires à la prochaine réplique. " +
      "Chaque message est préfixé par son locuteur : ne mélange jamais les " +
      "attributions. N'invente rien. Écris des puces constituées de phrases " +
      "complètes terminées par une ponctuation, puis termine proprement toutes " +
      "les rubriques commencées. Réponds uniquement avec ces rubriques : " +
      "ÉTAT ACTUEL, FAITS ET DÉCISIONS ACTIFS, QUESTIONS OUVERTES, ÉVÉNEMENTS " +
      "RÉCENTS IMPORTANTS. Omets une rubrique vide.",
    user: ({ previousSummary, newMessages }) =>
      (previousSummary ? `Résumé existant :\n${previousSummary}\n\n` : "") +
      `Nouveaux messages à intégrer :\n${newMessages}\n\n` +
      "Réécris maintenant la mémoire complète. Les nouveaux messages sont " +
      "plus récents que tout le résumé existant et le corrigent si nécessaire.",
    messageLine: (name, content) => `${name} : ${content}`,
    emptySummaryError: "le serveur a renvoyé un résumé vide",
    truncatedSummaryError: "le serveur a renvoyé un résumé tronqué",
  },

  emotion: {
    moodLabels: MOOD_LABELS_BY_LOCALE.fr,
    traitsLine: (traits) => `Traits : ${traits}`,
    analysisSystem: ({ personaName, moodList }) =>
      `Tu évalues la réaction émotionnelle IMMÉDIATE du personnage fictif ` +
      `${personaName}, juste avant sa réponse. Ne confonds pas maîtrise de soi ` +
      `et absence d'émotion : même un personnage réservé peut être sidéré, ` +
      `effrayé ou furieux. Évalue l'événement selon son point de vue et sa ` +
      `personnalité, sans minimiser automatiquement les révélations, menaces, ` +
      `trahisons, accidents, violences ou pertes. Reste proportionné : une ` +
      `banalité vaut généralement 0 à 0.20, un événement notable 0.30 à 0.55, ` +
      `un bouleversement 0.65 à 0.85, un choc majeur 0.90 à 1. ` +
      `Réponds UNIQUEMENT avec un objet JSON au format : ` +
      `{"mood": <${moodList}>, ` +
      `"intensity": nombre entre 0 et 1, ` +
      `"impulse": "impulsion physique ou mentale brève, sans dialogue", ` +
      `"valenceDelta": nombre entre -0.55 et 0.55, ` +
      `"energyDelta": nombre entre -0.45 et 0.45, ` +
      `"warmthDelta": nombre entre -0.20 et 0.20, ` +
      `"closenessDelta": nombre entre -0.05 et 0.05}.`,
    analysisUser: ({
      characterization,
      mood,
      valence,
      energy,
      warmth,
      closeness,
      stimulus,
    }) =>
      `Personnage :\n${characterization}\n\n` +
      `État avant l'événement : humeur=${mood}, valence=${valence}, ` +
      `énergie=${energy}, chaleur=${warmth}, proximité=${closeness}\n\n` +
      `Événement ou réplique qui vient de survenir :\n${stimulus}\n\n` +
      `Évalue maintenant sa réaction, avant qu'il ou elle ne parle.`,
  },

  temporal: {
    weekdays: [
      "dimanche",
      "lundi",
      "mardi",
      "mercredi",
      "jeudi",
      "vendredi",
      "samedi",
    ],
    dayPeriodLabels: {
      morning: "matin",
      afternoon: "après-midi",
      evening: "soirée",
      night: "nuit",
    },
    firstExchange: "premier échange",
    continuousConversation: "conversation continue",
    shortBreak: "courte interruption",
    fewHours: "quelques heures",
    aboutADay: "environ une journée",
    fewDays: "quelques jours",
    longAbsence: "longue absence",
    minutes: (value) => `${value} min`,
    hours: (value) => `${value} h`,
    days: (value) => `${value} jours`,
    withApproximate: (label, duration) => `${label} (environ ${duration})`,
  },

  inference: {
    shortResponse:
      "Réponds brièvement mais de façon substantielle : vise généralement 3 à 6 " +
      "phrases complètes et naturelles. Développe assez la réaction, le geste ou " +
      "l'idée pour que la réplique sonne humaine. « Bref » ne signifie ni une " +
      "réponse d'un mot, ni une formule télégraphique ; une seule phrase convient " +
      "uniquement quand la situation l'appelle vraiment.",
  },
};
