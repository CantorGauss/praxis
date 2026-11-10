import { describe, expect, it } from "vitest";
import {
  assemblePrompt,
  estimateTokens,
  type AssembleInput,
  type PromptMemory,
} from "../promptAssembler";
import { buildTemporalContext } from "../temporal";
import { enPrompts, frPrompts } from "../../i18n/prompts";
import type { MemoryFact, Message, Persona } from "../../types";

function persona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "p1",
    name: "Anna",
    description: null,
    systemPrompt: "Tu es calme et directe.",
    stableTraits: ["chaleureuse"],
    defaultModelId: null,
    temperature: 0.7,
    topP: null,
    maxOutputTokens: null,
    gender: "neutral",
    avatarSetId: null,
    avatarStyle: null,
    lorebook: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
  personaId: string | null = role === "assistant" ? "p1" : null,
): Message {
  return {
    id,
    conversationId: "c1",
    role,
    content,
    status: "complete",
    kind: "speech",
    addressee: null,
    createdAt: `2026-01-01T00:00:0${id}Z`,
    personaId,
    personaName: personaId === "p1" ? "Anna" : personaId ? "Marc" : null,
  };
}

function fact(text: string, extra: Partial<MemoryFact> = {}): MemoryFact {
  return {
    id: extra.id ?? `f${text.length}`,
    text,
    category: "event",
    pinned: false,
    origin: "auto",
    sourceMessageIds: [],
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

function mem(...texts: string[]): PromptMemory {
  return { facts: texts.map((t, i) => fact(t, { id: `f${i + 1}` })), state: [], threads: [] };
}

/**
 * Les assertions portent sur les intitulés de sections, donc sur une langue
 * précise. Le pack français sert de référence : c'est le plus contraint, et
 * c'est celui contre lequel les prompts ont été réglés.
 */
function baseInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    persona: persona(),
    userName: "Jeff",
    userGender: "masculine",
    state: null,
    pack: frPrompts,
    temporal: buildTemporalContext(new Date(2026, 6, 23, 10, 0), null, frPrompts),
    memory: null,
    recentMessages: [
      message("1", "user", "Bonjour"),
      message("2", "assistant", "Bonjour Jeff"),
      message("3", "user", "Comment vas-tu ?"),
    ],
    contextTokens: 8192,
    reserveOutputTokens: 1024,
    ...overrides,
  };
}

describe("assemblePrompt", () => {
  it("includes current agreements after the history and reserves their context budget", () => {
    const coordination = "[COORDINATION] Marc accepte sous condition : moins de vingt euros.";
    const input = baseInput({ coordination, memory: mem("Un ancien fait.") });
    const result = assemblePrompt(input);
    expect(result.error).toBeNull();
    expect(result.system).not.toContain(coordination);
    expect(result.messages.at(-1)!.content).toContain(coordination);
    expect(result.estimatedTokens + input.reserveOutputTokens).toBeLessThanOrEqual(input.contextTokens);
    expect(assemblePrompt(baseInput({ coordination: "x".repeat(40_000), contextTokens: 4096 })).error).not.toBeNull();
  });

  it("prévient le personnage qui n'a pas assisté à toute la scène", () => {
    expect(assemblePrompt(baseInput()).system).not.toContain("[CE QUE TU SAIS DE LA SCÈNE]");
    expect(assemblePrompt(baseInput({ missedEarlier: true })).system).toContain(
      "[CE QUE TU SAIS DE LA SCÈNE]",
    );
    expect(
      assemblePrompt(baseInput({ missedEarlier: true, pack: enPrompts })).system,
    ).toContain("[WHAT YOU KNOW OF THE SCENE]");
  });

  it("assemble les sections dans l'ordre déterministe", () => {
    const input = baseInput({
      state: {
        personaId: "p1",
        mood: "calm",
        valence: 0.2,
        energy: 0.55,
        warmth: 0.65,
        closeness: 0.5,
        updatedAt: "2026-07-23T08:00:00Z",
      },
      memory: mem("Fait antérieur."),
    });
    const result = assemblePrompt(input);
    expect(result.error).toBeNull();
    // Le message système ne contient que le stable, dans l'ordre.
    const order = [
      "[IDENTITÉ]",
      "[INTERLOCUTEUR HUMAIN]",
      "[TRAITS STABLES]",
      "[MÉMOIRE DE LA SCÈNE]",
    ];
    let last = -1;
    for (const section of order) {
      const idx = result.system.indexOf(section);
      expect(idx, section).toBeGreaterThan(last);
      last = idx;
    }
    // L'état et le contexte temporel ferment la requête, après l'historique.
    expect(result.system).not.toContain("[ÉTAT COURANT]");
    expect(result.system).not.toContain("[CONTEXTE TEMPOREL]");
    expect(result.messages[0].role).toBe("system");
    const tail = result.messages.at(-1)!;
    expect(tail.content).toContain("Comment vas-tu ?");
    expect(tail.content.indexOf("Comment vas-tu ?")).toBeLessThan(
      tail.content.indexOf("[ÉTAT COURANT]"),
    );
    expect(tail.content).toContain("[CONTEXTE TEMPOREL]");
    expect(result.includedMessageCount).toBe(3);
  });

  it("n'enchaîne pas deux tours `user` quand l'historique finit par une réplique", () => {
    const result = assemblePrompt(
      baseInput({
        recentMessages: [
          message("1", "user", "Bonjour"),
          message("2", "assistant", "Bonjour Jeff"),
        ],
        state: {
          personaId: "p1",
          mood: "calm",
          valence: 0.2,
          energy: 0.55,
          warmth: 0.65,
          closeness: 0.5,
          updatedAt: "2026-07-23T08:00:00Z",
        },
      }),
    );
    const roles = result.messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
    expect(result.messages.at(-1)?.content).toContain("[ÉTAT COURANT]");
  });

  it("remplit avec les messages récents sans tronquer le dernier", () => {
    const long = "x".repeat(4000); // ~1000 tokens chacun
    const input = baseInput({
      contextTokens: 2500,
      reserveOutputTokens: 500,
      recentMessages: [
        message("1", "user", long),
        message("2", "assistant", long),
        message("3", "user", "Dernière question ?"),
      ],
    });
    const result = assemblePrompt(input);
    expect(result.error).toBeNull();
    expect(result.messages.at(-1)?.content).toContain("Dernière question ?");
    expect(result.includedMessageCount).toBeLessThan(3);
  });

  it("abandonne la mémoire avant les répliques récentes quand le budget est serré", () => {
    const input = baseInput({
      memory: mem("s".repeat(4000)),
      // Assez pour la base (~1 200 tokens) et les répliques, pas pour la mémoire.
      contextTokens: 1500,
      reserveOutputTokens: 200,
    });
    const result = assemblePrompt(input);
    expect(result.error).toBeNull();
    expect(result.memoryIncluded).toBe(false);
    expect(result.system).toContain("[IDENTITÉ]");
  });

  it("signale une erreur claire quand rien ne tient", () => {
    const input = baseInput({
      contextTokens: 100,
      reserveOutputTokens: 50,
    });
    const result = assemblePrompt(input);
    expect(result.error).toBeTruthy();
  });

  it("estime environ quatre caractères par token", () => {
    expect(estimateTokens("abcd".repeat(10))).toBe(10);
  });

  it("garde un préfixe identique quand seuls l'heure et l'humeur changent", () => {
    // L'invariant qui rend le cache d'attention réutilisable : deux tours
    // successifs ne doivent différer qu'à la toute fin du prompt.
    const commun = { memory: mem("Fait antérieur.") };
    const tour1 = assemblePrompt(
      baseInput({
        ...commun,
        temporal: buildTemporalContext(new Date(2026, 6, 23, 10, 0), null, frPrompts),
        state: {
          personaId: "p1",
          mood: "calm",
          valence: 0.2,
          energy: 0.55,
          warmth: 0.65,
          closeness: 0.5,
          updatedAt: "2026-07-23T08:00:00Z",
        },
      }),
    );
    const tour2 = assemblePrompt(
      baseInput({
        ...commun,
        temporal: buildTemporalContext(new Date(2026, 6, 23, 10, 42), null, frPrompts),
        state: {
          personaId: "p1",
          mood: "joyful",
          valence: 0.71,
          energy: 0.62,
          warmth: 0.66,
          closeness: 0.51,
          updatedAt: "2026-07-23T09:00:00Z",
        },
      }),
    );

    // Tout doit être identique sauf le dernier message : c'est exactement ce
    // que le serveur peut réutiliser de son cache d'attention.
    const sauf = (r: typeof tour1) => r.messages.slice(0, -1);
    expect(sauf(tour1)).toEqual(sauf(tour2));
    expect(tour1.system).toBe(tour2.system);
    expect(tour1.system).toContain("Fait antérieur.");
    // Seule la fin diffère.
    expect(tour1.messages.at(-1)).not.toEqual(tour2.messages.at(-1));
  });

  it("explique la convention des actions entre astérisques, même seule", () => {
    const result = assemblePrompt(baseInput());
    expect(result.system).toContain("[CONVENTIONS D'ÉCRITURE]");
    expect(result.system).toContain("entre astérisques");
    expect(result.system).not.toContain("[SCÈNE]");
  });

  it("rappelle la situation près de la dernière réplique pour lever les sous-entendus", () => {
    const situation =
      "Anna et Jeff reviennent à Paris après une semaine de vacances passée ensemble.";
    const result = assemblePrompt(
      baseInput({
        sceneDescription: situation,
        recentMessages: [message("1", "user", "Et voilà, c'est fini")],
      }),
    );

    expect(result.system).toContain("[SITUATION DE DÉPART]");
    expect(result.system).toContain(situation);
    const tail = result.messages.at(-1)?.content ?? "";
    expect(tail).toContain("Et voilà, c'est fini");
    expect(tail).toContain("[ANCRAGE DE SCÈNE POUR CETTE RÉPLIQUE]");
    expect(tail).toContain(situation);
    expect(tail.indexOf("Et voilà, c'est fini")).toBeLessThan(
      tail.indexOf("[ANCRAGE DE SCÈNE POUR CETTE RÉPLIQUE]"),
    );
  });

  it("nomme explicitement l'humain même quand le personnage est seul", () => {
    const result = assemblePrompt(baseInput());
    expect(result.system).toContain("[INTERLOCUTEUR HUMAIN]");
    expect(result.system).toContain("s'appelle Jeff");
    expect(result.system).toContain("« Jeff », jamais par un identifiant");
    expect(result.system).toContain("identifiant de machine");
  });

  it("donne au personnage sa propre fiche, qui porte ses liens avec l'humain", () => {
    const result = assemblePrompt(
      baseInput({
        persona: persona({ description: "Parisienne de 24 ans, amie d'enfance de Jeff" }),
      }),
    );
    const identity = result.system.slice(
      result.system.indexOf("[IDENTITÉ]"),
      result.system.indexOf("[INTERLOCUTEUR HUMAIN]"),
    );
    expect(identity).toContain("amie d'enfance de Jeff");
    expect(identity).toContain("Tu es calme et directe.");
  });

  it("rappelle la fiche en fin de requête, pour corriger une contradiction passée", () => {
    const result = assemblePrompt(
      baseInput({
        persona: persona({ description: "Parisienne de 24 ans, amie d'enfance de Jeff" }),
      }),
    );
    const tail = result.messages.at(-1)!.content;
    expect(tail).toContain("[QUI TU ES, ANNA]");
    expect(tail).toContain("amie d'enfance de Jeff");
    expect(tail).toContain("c'était une erreur : reconnais-la simplement");
    expect(tail.indexOf("[QUI TU ES, ANNA]")).toBeGreaterThan(tail.indexOf("[CONTEXTE TEMPOREL]"));
  });

  it("ne répète pas une fiche déjà contenue dans le prompt interne", () => {
    const result = assemblePrompt(
      baseInput({ persona: persona({ description: "calme et directe" }) }),
    );
    expect(result.system).not.toContain("Ta fiche");
  });

  it("demande plusieurs phrases naturelles pour une réponse brève", () => {
    const result = assemblePrompt(
      baseInput({ persona: persona({ maxOutputTokens: 512 }) }),
    );
    expect(result.system).toContain("[LONGUEUR DE RÉPONSE]");
    expect(result.system).toContain("3 à 6 phrases complètes");
    expect(result.system).toContain("ni une réponse d'un mot");
  });

  it("injecte une réaction immédiate forte à la fin du tour", () => {
    const result = assemblePrompt(
      baseInput({
        immediateReaction: {
          mood: "shocked",
          intensity: 0.92,
          impulse: "se fige, incapable de détourner le regard",
        },
      }),
    );
    expect(result.system).toContain("[JEU ÉMOTIONNEL]");
    expect(result.messages.at(-1)?.content).toContain("[RÉACTION IMMÉDIATE]");
    expect(result.messages.at(-1)?.content).toContain("(intensité 92 %)");
    expect(result.messages.at(-1)?.content).toContain("Ne reviens pas au calme");
  });
});

describe("assemblePrompt : élan de la scène", () => {
  it("pousse chaque réplique à faire avancer la scène, dans le préfixe stable", () => {
    const result = assemblePrompt(baseInput());
    expect(result.system).toContain("[ÉLAN]");
    expect(result.system).toContain("Tu n'es pas obligé d'être d'accord");
    expect(result.messages.at(-1)?.content).not.toContain("[LA SCÈNE PIÉTINE]");
  });

  it("clôt la requête sur une relance quand la scène piétine", () => {
    const result = assemblePrompt(baseInput({ stagnation: "consensus" }));
    const tail = result.messages.at(-1)?.content ?? "";
    expect(tail).toContain("[LA SCÈNE PIÉTINE]");
    expect(tail).toContain("Tout le monde approuve");
    expect(result.system).not.toContain("[LA SCÈNE PIÉTINE]");
  });

  it("limite les didascalies des personnages, au plus près de la réplique", () => {
    expect(assemblePrompt(baseInput()).messages.at(-1)?.content).toContain("la plupart des répliques n'en ont pas, jamais plus d'un");
    expect(assemblePrompt(baseInput({ pack: enPrompts })).messages.at(-1)?.content).toContain("most lines have none, never more than one");
  });
});

describe("assemblePrompt : voix des personnages", () => {
  it("place la voix juste après l'identité et laisse la fiche l'emporter sur le style", () => {
    const fr = assemblePrompt(baseInput()).system;
    expect(fr).toContain("[VOIX]");
    expect(fr).toContain("Sa propre fiche l'emporte sur les règles de style");
    expect(fr.indexOf("[VOIX]")).toBeLessThan(fr.indexOf("[JEU ÉMOTIONNEL]"));
    expect(fr.indexOf("[VOIX]")).toBeGreaterThan(fr.indexOf("Tu es Anna"));
    const en = assemblePrompt(baseInput({ pack: enPrompts })).system;
    expect(en).toContain("[VOICE]");
    expect(en).toContain("Your character's own description outranks");
  });

  it("interdit les clichés corporels et rappelle la façon de parler juste avant la réplique", () => {
    const fr = assemblePrompt(baseInput());
    expect(fr.system).toContain("ni cœur qui cogne");
    expect(fr.system).not.toContain("au besoin un geste");
    expect(fr.messages.at(-1)?.content).toContain("[TA FAÇON DE PARLER]");
    const en = assemblePrompt(baseInput({ pack: enPrompts }));
    expect(en.system).toContain("no pounding heart");
    expect(en.messages.at(-1)?.content).toContain("[HOW YOU TALK]");
  });

  it("demande de commencer par la parole et nomme les gestes déjà faits", () => {
    const result = assemblePrompt(baseInput({
      recentMessages: [
        message("1", "assistant", "*sourit en coin* Tu rougis."),
        message("2", "user", "Non."),
        message("3", "assistant", "*plisse les yeux* Si.", "p2"),
      ],
    }));
    const tail = result.messages.at(-1)?.content ?? "";
    expect(tail).toContain("Commence par ce que tu dis");
    expect(tail).toContain("pas « *je pose…* »");
    expect(tail).toMatch(/n'en reprends aucun[^]*- plisse les yeux\n- sourit en coin/);
    expect(assemblePrompt(baseInput({ recentMessages: [message("1", "user", "Salut")] })).messages.at(-1)?.content)
      .not.toContain("Gestes déjà faits");
  });
});

describe("assemblePrompt selon la langue de jeu", () => {
  it("impose la langue de jeu, quelle que soit celle de la fiche", () => {
    expect(assemblePrompt(baseInput()).system).toContain("Tu parles toujours français");
    expect(assemblePrompt(baseInput({ pack: enPrompts })).system).toContain(
      "Always speak English",
    );
  });

  it("rappelle la langue en fin de requête pour une fiche écrite dans une autre", () => {
    const english = persona({
      systemPrompt: "She is a retired detective. She notices everything and never forgets a face.",
    });
    const tail = (input: AssembleInput) => assemblePrompt(input).messages.at(-1)!.content;
    expect(tail(baseInput({ persona: english }))).toContain("[LANGUE]");
    expect(tail(baseInput())).not.toContain("[LANGUE]");
    expect(assemblePrompt(baseInput({ persona: english })).system).not.toContain("[LANGUE]");
  });

  it("intitule les sections dans la langue du pack", () => {
    const result = assemblePrompt(baseInput({ pack: enPrompts }));
    expect(result.system).toContain("[IDENTITY]");
    expect(result.system).toContain("[HUMAN INTERLOCUTOR]");
    expect(result.system).toContain("[STABLE TRAITS]");
    expect(result.system).toContain("[WRITING CONVENTIONS]");
    expect(result.system).not.toContain("[IDENTITÉ]");
  });

  it("garde le même ordre déterministe dans les deux langues", () => {
    const sections = {
      en: ["[IDENTITY]", "[HUMAN INTERLOCUTOR]", "[STABLE TRAITS]", "[SCENE MEMORY]"],
      fr: ["[IDENTITÉ]", "[INTERLOCUTEUR HUMAIN]", "[TRAITS STABLES]", "[MÉMOIRE DE LA SCÈNE]"],
    };
    for (const pack of [enPrompts, frPrompts]) {
      const result = assemblePrompt(
        baseInput({ pack, memory: mem("Previous fact.") }),
      );
      let last = -1;
      for (const section of sections[pack.locale]) {
        const idx = result.system.indexOf(section);
        expect(idx, `${pack.locale} ${section}`).toBeGreaterThan(last);
        last = idx;
      }
    }
  });

  it("sort l'état et le contexte temporel du système, quelle que soit la langue", () => {
    // L'invariant de cache d'attention ne dépend pas de la langue : ce qui
    // varie à chaque tour reste après l'historique.
    for (const pack of [enPrompts, frPrompts]) {
      const result = assemblePrompt(
        baseInput({
          pack,
          state: {
            personaId: "p1",
            mood: "calm",
            valence: 0.2,
            energy: 0.55,
            warmth: 0.65,
            closeness: 0.5,
            updatedAt: "2026-07-23T08:00:00Z",
          },
        }),
      );
      const stateSection = pack.locale === "en" ? "[CURRENT STATE]" : "[ÉTAT COURANT]";
      expect(result.system).not.toContain(stateSection);
      expect(result.messages.at(-1)?.content).toContain(stateSection);
    }
  });

  it("rend l'erreur de contexte trop long dans la langue du pack", () => {
    const tight = { contextTokens: 100, reserveOutputTokens: 50 };
    expect(assemblePrompt(baseInput({ ...tight, pack: enPrompts })).error).toContain(
      "too long for this model",
    );
    expect(assemblePrompt(baseInput({ ...tight, pack: frPrompts })).error).toContain(
      "trop long pour ce modèle",
    );
  });
});

describe("assemblePrompt en scène de groupe", () => {
  const label = (m: Message) =>
    m.role === "user" ? "Utilisateur" : (m.personaName ?? "Personnage");

  const scene = {
    speakerId: "p1",
    speakerName: "Anna",
    speakerGender: "feminine" as const,
    otherNames: ["Marc"],
    others: [
      {
        name: "Marc",
        gender: "masculine" as const,
        description: "Frère aîné d'Anna, médecin urgentiste",
      },
    ],
    label,
  };

  it("insère le trombinoscope dans la partie stable du prompt", () => {
    const result = assemblePrompt(baseInput({ scene }));
    const order = [
      "[IDENTITÉ]",
      "[INTERLOCUTEUR HUMAIN]",
      "[TRAITS STABLES]",
      "[SCÈNE]",
      "[CONVENTIONS D'ÉCRITURE]",
    ];
    let last = -1;
    for (const section of order) {
      const idx = result.system.indexOf(section);
      expect(idx, section).toBeGreaterThan(last);
      last = idx;
    }
    expect(result.system).toContain("Tu es Anna, et uniquement Anna.");
    expect(result.system).toContain("Frère aîné d'Anna, médecin urgentiste");
    expect(result.system).not.toContain("prompt interne");
  });

  it("met la consigne de destinataire en fin de requête, pas dans le système", () => {
    const result = assemblePrompt(
      baseInput({
        scene: { ...scene, addressing: "Le dernier message t'est adressé." },
      }),
    );
    expect(result.system).not.toContain("[CE TOUR-CI]");
    expect(result.messages.at(-1)?.content).toContain("[CE TOUR-CI]");
  });

  it("réécrit l'historique du point de vue du locuteur", () => {
    const result = assemblePrompt(
      baseInput({
        scene,
        recentMessages: [
          message("1", "user", "Bonjour"),
          message("2", "assistant", "Salut", "p1"),
          message("3", "assistant", "Bonsoir", "p2"),
        ],
      }),
    );
    const withoutSystem = result.messages.slice(1);
    expect(withoutSystem.slice(0, 2)).toEqual([
      { role: "user", content: "Utilisateur : Bonjour" },
      { role: "assistant", content: "Salut" },
    ]);
    // Le bloc volatile est fusionné avec le dernier tour utilisateur.
    expect(withoutSystem.at(-1)?.role).toBe("user");
    expect(withoutSystem.at(-1)?.content).toContain("Marc : Bonsoir");
  });

  it("garde la scène quand le seul autre personnage est sorti", () => {
    const result = assemblePrompt(
      baseInput({
        scene: { ...scene, otherNames: [], others: [], departedNames: ["Marc"] },
        recentMessages: [
          message("1", "user", "Bonjour"),
          message("2", "assistant", "Salut", "p1"),
          message("3", "assistant", "Bonsoir", "p2"),
        ],
      }),
    );
    expect(result.system).toContain("[SCÈNE]");
    expect(result.system).toContain("- Marc — a quitté la scène.");
    // Les répliques de l'absent ne passent pas pour celles du locuteur.
    expect(
      result.messages.filter((m) => m.role === "assistant").map((m) => m.content),
    ).toEqual(["Salut"]);
  });

  it("n'ajoute aucune section scène quand le personnage est seul", () => {
    const result = assemblePrompt(
      baseInput({ scene: { ...scene, otherNames: [], others: [] } }),
    );
    expect(result.system).not.toContain("[SCÈNE]");
  });

  it("explique les apartés en scène de groupe, et seulement là", () => {
    expect(assemblePrompt(baseInput({ scene })).system).toContain("[APARTÉS]");
    expect(assemblePrompt(baseInput()).system).not.toContain("[APARTÉS]");
  });

  it("n'invite à l'aparté qu'en fin de requête, et seulement sur demande", () => {
    const nudged = assemblePrompt(baseInput({ scene, asideNudge: true }));
    expect(nudged.system).not.toContain("[APARTÉ]\n");
    expect(nudged.messages.at(-1)?.content).toContain("[APARTÉ]\n");
    const plain = assemblePrompt(baseInput({ scene }));
    expect(plain.messages.at(-1)?.content).not.toContain("[APARTÉ]\n");
  });

  it("cache aux autres les apartés d'un personnage, pas à son auteur", () => {
    const recentMessages = [
      message("1", "user", "On partage le gâteau ?"),
      message("2", "assistant", "Avec plaisir ! (aparté : je le déteste)", "p2"),
      message("3", "assistant", "(aparté : Marc ment, évidemment)", "p1"),
    ];
    const asAnna = assemblePrompt(baseInput({ scene, recentMessages }));
    const annaSees = asAnna.messages.slice(1).map((m) => m.content).join("\n");
    expect(annaSees).toContain("Marc : Avec plaisir !");
    expect(annaSees).not.toContain("je le déteste");
    expect(annaSees).toContain("(aparté : Marc ment, évidemment)");
  });

  it("cache au personnage l'aparté de l'utilisateur en tête-à-tête", () => {
    const result = assemblePrompt(
      baseInput({
        recentMessages: [
          message("1", "user", "Bonjour"),
          message("2", "assistant", "Bonjour Jeff"),
          message("3", "user", "Quel beau pull. (aparté : il est affreux)"),
        ],
      }),
    );
    const sent = result.messages.slice(1).map((m) => m.content).join("\n");
    expect(sent).toContain("Quel beau pull.");
    expect(sent).not.toContain("affreux");
  });
});

describe("assemblePrompt — mémoire de scène", () => {
  it("transmet les faits par catégorie, l'état, et rappelle les faits épinglés en fin de requête", () => {
    const memory: PromptMemory = {
      facts: [
        fact("Anna et Marc sont amis d'enfance.", { id: "f1", category: "relationship" }),
        fact("La porte de la cave est verrouillée.", { id: "f2", category: "place", pinned: true }),
      ],
      state: ["Anna est dans la cuisine."],
      threads: ["Qui a pris la clé ?"],
    };
    const result = assemblePrompt(baseInput({ memory }));
    expect(result.system).toContain("[MÉMOIRE DE LA SCÈNE]");
    expect(result.system).toContain("Relations :\n- Anna et Marc sont amis d'enfance.");
    expect(result.system).toContain("À ne jamais oublier :\n- La porte de la cave est verrouillée.");
    expect(result.system).toContain("[OÙ EN ÉTAIT LA SCÈNE]");
    expect(result.system).toContain("Qui a pris la clé ?");
    const tail = result.messages.at(-1)!.content;
    expect(tail).toContain("[À NE PAS OUBLIER]");
    expect(tail).toContain("La porte de la cave est verrouillée.");
    expect(result.factCount).toBe(2);
  });

  it("garde les faits épinglés et les plus pertinents quand le registre déborde", () => {
    const filler = Array.from({ length: 80 }, (_, i) =>
      fact(`Détail sans importance numéro ${i} sur la météo du mardi précédent.`, { id: `f${i + 10}` }),
    );
    const memory: PromptMemory = {
      facts: [
        fact("Le testament est caché derrière le tableau du salon.", { id: "f1", category: "secret" }),
        ...filler,
        fact("Marc doit cinq cents euros à Anna.", { id: "f2", pinned: true, category: "commitment" }),
      ],
      state: [],
      threads: [],
    };
    const result = assemblePrompt(
      baseInput({
        memory,
        contextTokens: 4096,
        recentMessages: [message("1", "user", "Où est le testament ?")],
      }),
    );
    expect(result.error).toBeNull();
    expect(result.system).toContain("Le testament est caché derrière le tableau du salon.");
    expect(result.system).toContain("Marc doit cinq cents euros à Anna.");
    expect(result.factCount).toBeLessThan(memory.facts.length);
  });

  it("retrouve mot pour mot un passage ancien en rapport avec la dernière réplique", () => {
    const archive = [
      message("1", "assistant", "Le colis bleu est arrivé chez la voisine Germaine."),
      message("2", "user", "Il pleut beaucoup aujourd'hui."),
      message("3", "assistant", "J'ai mangé une pomme."),
      message("4", "user", "Le train était en retard."),
    ];
    const result = assemblePrompt(
      baseInput({
        archive,
        recentMessages: [message("5", "user", "Au fait, où est passé le colis bleu ?")],
      }),
    );
    const tail = result.messages.at(-1)!.content;
    expect(tail).toContain("[SOUVENIRS DE PLUS TÔT DANS LA SCÈNE]");
    expect(tail).toContain("Le colis bleu est arrivé chez la voisine Germaine.");
    expect(tail).not.toContain("J'ai mangé une pomme.");
    expect(result.recalledPassageCount).toBe(1);
  });

  it("ne rappelle rien quand l'archive n'a aucun rapport", () => {
    const archive = [message("1", "assistant", "J'ai mangé une pomme.")];
    const result = assemblePrompt(
      baseInput({ archive, recentMessages: [message("2", "user", "Quel temps fait-il ?")] }),
    );
    expect(result.messages.at(-1)!.content).not.toContain("[SOUVENIRS");
    expect(result.recalledPassageCount).toBe(0);
  });
});

describe("assemblePrompt et connaissances du personnage", () => {
  const lore = {
    version: 1 as const,
    name: "",
    description: "",
    scanDepth: null,
    tokenBudget: null,
    extra: {},
    entries: [
      {
        id: "a",
        comment: "",
        keys: [],
        secondaryKeys: [],
        selective: false,
        secondaryLogic: "andAny" as const,
        content: "Anna a grandi au-dessus d'une boulangerie.",
        constant: true,
        enabled: true,
        caseSensitive: false,
        insertionOrder: 100,
        extra: {},
      },
      {
        id: "b",
        comment: "",
        keys: ["Morel"],
        secondaryKeys: [],
        selective: false,
        secondaryLogic: "andAny" as const,
        content: "Le dossier Morel n'a jamais été classé.",
        constant: false,
        enabled: true,
        caseSensitive: false,
        insertionOrder: 100,
        extra: {},
      },
    ],
  };

  it("met les connaissances permanentes dans la partie stable", () => {
    const result = assemblePrompt(baseInput({ persona: persona({ lorebook: lore }) }));
    expect(result.system).toContain("[CE QUE TU SAIS]");
    expect(result.system).toContain("boulangerie");
    expect(result.system.indexOf("[CE QUE TU SAIS]")).toBeGreaterThan(
      result.system.indexOf("[TRAITS STABLES]"),
    );
    expect(result.system).not.toContain("Morel");
    expect(result.loreEntryCount).toBe(1);
  });

  it("rappelle en fin de requête ce que la scène vient d'évoquer", () => {
    const result = assemblePrompt(
      baseInput({
        persona: persona({ lorebook: lore }),
        recentMessages: [message("1", "user", "Et l'affaire morel, alors ?")],
      }),
    );
    expect(result.system).not.toContain("Morel");
    const tail = result.messages.at(-1)!.content;
    expect(tail).toContain("[CE QUI TE REVIENT]");
    expect(tail).toContain("Le dossier Morel");
    expect(result.loreEntryCount).toBe(2);
  });

  it("n'entend pas les apartés des autres", () => {
    const result = assemblePrompt(
      baseInput({
        persona: persona({ lorebook: lore }),
        recentMessages: [
          message("1", "user", "Bonjour."),
          message("2", "assistant", "Salut. (aparté : je pense à Morel)", "p2"),
          message("3", "user", "Tu vas bien ?"),
        ],
      }),
    );
    expect(result.messages.at(-1)!.content).not.toContain("[CE QUI TE REVIENT]");
  });

  it("parle des connaissances dans la langue du pack", () => {
    const result = assemblePrompt(
      baseInput({ pack: enPrompts, persona: persona({ lorebook: lore }) }),
    );
    expect(result.system).toContain("[WHAT YOU KNOW]");
  });
});
