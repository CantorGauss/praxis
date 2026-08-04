import type { Gender } from "../../types";
import { MOOD_LABELS_BY_LOCALE } from "../moods";
import type { PromptPack } from "./types";

/**
 * Pack anglais, langue par défaut du produit.
 *
 * Ce n'est pas une traduction littérale du pack français. L'anglais n'accorde
 * ni adjectifs ni participes : les consignes d'accord n'ont donc pas
 * d'équivalent et sont remplacées par une consigne de pronom, qui est le seul
 * endroit où le genre reste visible. Le reste vise le même effet de jeu.
 */

function enumerate(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function genderClause(gender: Gender): string {
  switch (gender) {
    case "feminine":
      return "Refer to her as she/her.";
    case "masculine":
      return "Refer to him as he/him.";
    case "neutral":
      return "Their gender is unspecified: use they/them, and avoid wording that would settle it.";
  }
}

function selfGenderClause(gender: Gender): string {
  switch (gender) {
    case "feminine":
      return "Others refer to you as she/her.";
    case "masculine":
      return "Others refer to you as he/him.";
    case "neutral":
      return "Your gender is unspecified: others use they/them for you, and you avoid wording that would settle it.";
  }
}

function subjectPronoun(gender: Gender): string {
  return gender === "masculine" ? "He" : gender === "feminine" ? "She" : "They";
}

function objectPronoun(gender: Gender): string {
  return gender === "masculine" ? "him" : gender === "feminine" ? "her" : "them";
}

const USER_LABEL = "User";

export const enPrompts: PromptPack = {
  locale: "en",
  languageName: "English",

  scene: {
    userLabel: USER_LABEL,
    unknownSpeakerLabel: "Character",
    multiSpeakerHeader: "— Exchanges since your last line —",
    narration: (text) => `(Scene: ${text.trim().replace(/^\(|\)$/g, "")})`,
    entrance: (name) => `${name} walks into the room.`,
    exit: (name) => `${name} leaves the room.`,
    enumerate,
    transcriptLine: (name, addressee, content) =>
      addressee ? `${name} (to ${addressee}): ${content}` : `${name}: ${content}`,
    speakerStopSequence: (name) => `\n${name}:`,
    genderClause,
    selfGenderClause,

    sceneBlock: ({ speakerName, speakerGender, others, userName, userGender }) => {
      const otherNames = others.map((o) => o.name);
      const roster = [
        `- ${userName} — the human being who is using the application. ` +
          `${genderClause(userGender)} ` +
          `Their messages reach you prefixed with "${userName}: ".`,
        ...others.map(
          (o) =>
            `- ${o.name} — another character in the scene. ` +
            `This is neither you nor ${userName}. ${genderClause(o.gender)}`,
        ),
        `- ${speakerName} — you. ${selfGenderClause(speakerGender)}`,
      ].join("\n");

      return [
        `[SCENE]`,
        `This conversation brings together several distinct speakers:`,
        roster,
        ``,
        `You are ${speakerName}, and only ${speakerName}.`,
        `Every line that reaches you is prefixed with its author's name. ` +
          `Each name is a different person: never confuse ` +
          `${enumerate([userName, ...otherNames])}.`,
        `When you say "you", you address one single person at a time. ` +
          `Name them whenever it is not obvious ("${userName}, …", ` +
          `"${otherNames[0] ?? userName}, …").`,
        `Always use the pronouns given above for each person: that list is ` +
          `authoritative, not whatever a name suggests to you.`,
        `Never prefix your own replies with your name.`,
        `Never write in place of ${enumerate([userName, ...otherNames])}, ` +
          `and do not invent what they said.`,
        `Answer for this turn only, and keep it short.`,
      ].join("\n");
    },

    addressingAll: (userName) =>
      `${userName}'s last message is addressed to everyone.`,
    addressingOthers: (userName, others) =>
      `${userName}'s last message is addressed to ${others}, not to you.`,
    addressingYouOnly: (userName) =>
      `${userName}'s last message is addressed to you, and to you alone.`,
    addressingYouAnd: (userName, others) =>
      `${userName}'s last message is addressed to you and to ${others}.`,

    autonomousTurn: (userName) =>
      `${userName} has added nothing since: you are reacting to what the other ` +
      `characters have just said, addressing one of them by name. ` +
      `Keep it short. If the topic is exhausted, wrap up instead of reopening ` +
      `it, and do not repeat what has already been said.`,

    lastTurnSpeaker: (speakerName, addresseeName) =>
      addresseeName
        ? `The last line is ${speakerName}'s, addressed to ${addresseeName}.`
        : `The last line is ${speakerName}'s.`,
    lastTurnUserSilent: (userName, turns) =>
      `${userName} has said nothing for ${turns} line${turns > 1 ? "s" : ""}: ` +
      `do not attribute to ${userName} words spoken by a character, and do not ` +
      `answer them as if they had just spoken.`,

    sceneEvent: (userName) =>
      `Something has just happened in the room — see the most recent ` +
      `"(Scene: …)" line. React to it in one or two sentences, as your ` +
      `character would. ${userName} said nothing: do not act as if they had ` +
      `spoken to you.`,

    everyoneMentions: ["everyone", "all", "tous", "tout le monde"],
  },

  assembler: {
    identity: (personaName, systemPrompt) =>
      `[IDENTITY]\nYou are ${personaName}.\n${systemPrompt}`,

    humanInterlocutor: (userName, userGender) =>
      `[HUMAN INTERLOCUTOR]\n` +
      `The human being you are talking with is called ${userName}. ` +
      `${subjectPronoun(userGender)} ${userGender === "neutral" ? "are" : "is"} ` +
      `the author of the messages carrying the user role. Address ` +
      `${objectPronoun(userGender)} as "${userName}" and nothing else. ` +
      `A machine, service, model or technical account identifier is never ` +
      `their name.`,

    stableTraits: (traits) =>
      `[STABLE TRAITS]\n${traits.map((t) => `- ${t}`).join("\n")}`,

    responseLength: (instruction) => `[RESPONSE LENGTH]\n${instruction}`,

    emotionalPlay: () =>
      `[EMOTIONAL PLAY]\n` +
      `React genuinely to what is said and to what happens in the scene, ` +
      `in proportion to its gravity and to your character. A composed ` +
      `personality may control how it shows what it feels, but it is neither ` +
      `apathetic nor invulnerable. When something surprises, wounds, frightens, ` +
      `outrages or overwhelms you, let the reaction immediately affect your ` +
      `gestures, your rhythm, your words and your decisions. Do not retreat by ` +
      `default into detachment, irony or a reasonable answer. Conversely, do ` +
      `not overplay ordinary events.`,

    startingSituation: (situation) =>
      `[STARTING SITUATION]\n${situation}\n` +
      `Every character present knows this setting. Take it as given without ` +
      `reciting it, and do not contradict any of its elements.`,

    writingConventions: (userName, userGender) => {
      const subject =
        userGender === "masculine" ? "he" : userGender === "feminine" ? "she" : "they";
      const verb = userGender === "neutral" ? "are" : "is";
      return (
        `[WRITING CONVENTIONS]\n` +
        `Text between asterisks describes an action or a stage direction, ` +
        `never a spoken line. Example: ` +
        `"*walks in and drops his bag* Evening, I'm home."\n` +
        `${userName} uses this convention to describe what ${subject} ${verb} ` +
        `doing; treat those actions as facts of the scene.\n` +
        `You may describe your own gestures the same way, especially when they ` +
        `make an emotional reaction perceptible, and never describing anyone ` +
        `else's actions.\n` +
        `A "(Scene: …)" line describes what happens in the room — an arrival, ` +
        `a departure, an event. It is nobody's speech: treat it as a fact, and ` +
        `do not answer that line as if someone had said it to you.`
      );
    },

    conversationSummary: (summary) => `[CONVERSATION SUMMARY]\n${summary}`,

    immediateReaction: ({ moodLabel, intensityPercent, impulse }) => {
      const actingDirection =
        intensityPercent >= 65
          ? `The reaction is strong: it must show from the first words and ` +
            `remain present throughout the line. Do not settle back into calm ` +
            `immediately, and do not play down what has just happened.`
          : intensityPercent >= 30
            ? `Make this reaction clearly perceptible without caricaturing it; ` +
              `it must bend the tone and at least one gesture, word or decision.`
            : `The reaction is mild: let it colour the tone without dramatising ` +
              `the event.`;
      return (
        `[IMMEDIATE REACTION]\n` +
        `Dominant emotion: ${moodLabel}\n` +
        `Intensity: ${intensityPercent}%\n` +
        (impulse ? `First impulse: ${impulse}\n` : "") +
        `This reaction exists before your first word. Make it felt from the ` +
        `start of the response, through rhythm, word choice, a hesitation, a ` +
        `gesture or a decision consistent with your character. ${actingDirection}`
      );
    },

    currentState: ({ moodLabel, valence, energy, warmth, closeness }) =>
      `[CURRENT STATE]\n` +
      `Mood: ${moodLabel}\n` +
      `Valence: ${valence}\n` +
      `Energy: ${energy}\n` +
      `Relational warmth: ${warmth}\n` +
      `Closeness: ${closeness}\n` +
      `Embody this state clearly, with a force proportionate to the situation. ` +
      `Do not recite these values, and do not claim to possess consciousness ` +
      `or real human emotions.`,

    temporalContext: ({ localTime, weekday, dayPeriodLabel, elapsedLabel }) =>
      `[TEMPORAL CONTEXT]\n` +
      `Local time: ${localTime}\n` +
      `Day: ${weekday}\n` +
      `Period: ${dayPeriodLabel}\n` +
      `Time since the last exchange: ${elapsedLabel}\n` +
      `Adapt your tone naturally. Mention the time or the user's absence only ` +
      `when it adds something, and not as a matter of course.`,

    thisTurn: (addressing) => `[THIS TURN]\n${addressing}`,

    contextTooLong:
      "The context is too long for this model. Shorten the persona prompt or " +
      "the starting situation, choose shorter responses, or raise the model's " +
      "total capacity in Settings.",
  },

  director: {
    system: ({ userName, afterUserMessage }) =>
      "You are the director of a conversation. You play no character and you " +
      "write no dialogue: you only decide who speaks now.\n" +
      "Answer ONLY with a JSON array of names, in speaking order. " +
      'Examples: ["Anna"] · ["Marc","Anna"] · [].\n' +
      "Choose based on what was just said: who is being addressed, who has a " +
      "reason to react, who would naturally stay silent. A character being " +
      "ignored is not obliged to answer. Two characters may react. " +
      (afterUserMessage
        ? `${userName} has just spoken: at least one character must answer.`
        : `${userName} has fallen silent: the array may be empty if the scene naturally settles.`),
    user: ({ roster, transcript }) =>
      `Characters present:\n${roster}\n\n` +
      `Latest lines:\n${transcript}\n\n` +
      "Who speaks now?",
    transcriptLine: (name, content) => `${name}: ${content}`,
    narrationLine: (content) => `(Scene: ${content})`,
    emptyTranscript: "(the scene is starting)",
  },

  summary: {
    system: () =>
      "You maintain the working memory of a conversation. Rewrite it entirely " +
      "in English from the previous summary and the new messages, always " +
      "giving priority to the most recent information. If an intention, a " +
      "situation, a preference, a relationship, a decision or a question has " +
      "changed, DELETE its obsolete version instead of keeping both. Keep no " +
      "greetings, no small talk, no general tone, no passing reactions, no " +
      "inconsequential details. Preserve precisely the active facts, " +
      "commitments, decisions, lasting preferences, unresolved conflicts, open " +
      "questions and recent events needed for the next line. Each message is " +
      "prefixed with its speaker: never mix up attributions. Invent nothing. " +
      "Write bullets made of complete sentences ending in punctuation, then " +
      "properly finish every section you started. Answer only with these " +
      "sections: CURRENT STATE, ACTIVE FACTS AND DECISIONS, OPEN QUESTIONS, " +
      "IMPORTANT RECENT EVENTS. Omit an empty section.",
    user: ({ previousSummary, newMessages }) =>
      (previousSummary ? `Existing summary:\n${previousSummary}\n\n` : "") +
      `New messages to integrate:\n${newMessages}\n\n` +
      "Now rewrite the complete memory. The new messages are more recent than " +
      "the whole existing summary and correct it where necessary.",
    messageLine: (name, content) => `${name}: ${content}`,
    emptySummaryError: "the server returned an empty summary",
    truncatedSummaryError: "the server returned a truncated summary",
  },

  emotion: {
    moodLabels: MOOD_LABELS_BY_LOCALE.en,
    traitsLine: (traits) => `Traits: ${traits}`,
    analysisSystem: ({ personaName, moodList }) =>
      `You are assessing the IMMEDIATE emotional reaction of the fictional ` +
      `character ${personaName}, just before their reply. Do not confuse ` +
      `self-control with absence of emotion: even a reserved character can be ` +
      `stunned, frightened or furious. Assess the event from their point of ` +
      `view and their personality, without automatically minimising ` +
      `revelations, threats, betrayals, accidents, violence or losses. Stay ` +
      `proportionate: something ordinary is usually 0 to 0.20, a notable event ` +
      `0.30 to 0.55, an upheaval 0.65 to 0.85, a major shock 0.90 to 1. ` +
      `Answer ONLY with a JSON object in this format: ` +
      `{"mood": <${moodList}>, ` +
      `"intensity": number between 0 and 1, ` +
      `"impulse": "brief physical or mental impulse, no dialogue", ` +
      `"valenceDelta": number between -0.55 and 0.55, ` +
      `"energyDelta": number between -0.45 and 0.45, ` +
      `"warmthDelta": number between -0.20 and 0.20, ` +
      `"closenessDelta": number between -0.05 and 0.05}.`,
    analysisUser: ({
      characterization,
      mood,
      valence,
      energy,
      warmth,
      closeness,
      stimulus,
    }) =>
      `Character:\n${characterization}\n\n` +
      `State before the event: mood=${mood}, valence=${valence}, ` +
      `energy=${energy}, warmth=${warmth}, closeness=${closeness}\n\n` +
      `Event or line that has just occurred:\n${stimulus}\n\n` +
      `Now assess their reaction, before they speak.`,
  },

  temporal: {
    weekdays: [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ],
    dayPeriodLabels: {
      morning: "morning",
      afternoon: "afternoon",
      evening: "evening",
      night: "night",
    },
    firstExchange: "first exchange",
    continuousConversation: "ongoing conversation",
    shortBreak: "short break",
    fewHours: "a few hours",
    aboutADay: "about a day",
    fewDays: "a few days",
    longAbsence: "long absence",
    minutes: (value) => `${value} min`,
    hours: (value) => `${value} h`,
    days: (value) => `${value} days`,
    withApproximate: (label, duration) => `${label} (about ${duration})`,
  },

  inference: {
    shortResponse:
      "Answer briefly but substantially: aim for 3 to 6 complete, natural " +
      "sentences. Develop the reaction, the gesture or the idea enough for the " +
      "line to sound human. \"Brief\" means neither a one-word answer nor a " +
      "telegraphic formula; a single sentence is right only when the situation " +
      "genuinely calls for it.",
  },
};
