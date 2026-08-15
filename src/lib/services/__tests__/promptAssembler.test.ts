import { describe, expect, it } from "vitest";
import { assemblePrompt, estimateTokens, type AssembleInput } from "../promptAssembler";
import { buildTemporalContext } from "../temporal";
import { enPrompts, frPrompts } from "../../i18n/prompts";
import type { Message, Persona } from "../../types";

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
    summary: null,
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
      summary: "Résumé antérieur.",
    });
    const result = assemblePrompt(input);
    expect(result.error).toBeNull();
    // Le message système ne contient que le stable, dans l'ordre.
    const order = [
      "[IDENTITÉ]",
      "[INTERLOCUTEUR HUMAIN]",
      "[TRAITS STABLES]",
      "[RÉSUMÉ DE LA CONVERSATION]",
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

  it("abandonne le résumé avant les souvenirs quand le budget est serré", () => {
    const input = baseInput({
      summary: "s".repeat(4000),
      contextTokens: 1250,
      reserveOutputTokens: 200,
    });
    const result = assemblePrompt(input);
    expect(result.error).toBeNull();
    expect(result.summaryIncluded).toBe(false);
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
    const commun = { summary: "Résumé antérieur." };
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
    expect(tour1.system).toContain("Résumé antérieur.");
    // Seule la fin diffère.
    expect(tour1.messages.at(-1)).not.toEqual(tour2.messages.at(-1));
  });

  it("explique la convention des actions entre astérisques, même seule", () => {
    const result = assemblePrompt(baseInput());
    expect(result.system).toContain("[CONVENTIONS D'ÉCRITURE]");
    expect(result.system).toContain("entre astérisques");
    expect(result.system).not.toContain("[SCÈNE]");
  });

  it("nomme explicitement l'humain même quand le personnage est seul", () => {
    const result = assemblePrompt(baseInput());
    expect(result.system).toContain("[INTERLOCUTEUR HUMAIN]");
    expect(result.system).toContain("s'appelle Jeff");
    expect(result.system).toContain("« Jeff » uniquement");
    expect(result.system).toContain("identifiant de machine");
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
    expect(result.messages.at(-1)?.content).toContain("Intensité : 92 %");
    expect(result.messages.at(-1)?.content).toContain("Ne reviens pas immédiatement");
  });
});

describe("assemblePrompt selon la langue de jeu", () => {
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
      en: ["[IDENTITY]", "[HUMAN INTERLOCUTOR]", "[STABLE TRAITS]", "[CONVERSATION SUMMARY]"],
      fr: ["[IDENTITÉ]", "[INTERLOCUTEUR HUMAIN]", "[TRAITS STABLES]", "[RÉSUMÉ DE LA CONVERSATION]"],
    };
    for (const pack of [enPrompts, frPrompts]) {
      const result = assemblePrompt(
        baseInput({ pack, summary: "Previous summary." }),
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

  it("n'ajoute aucune section scène quand le personnage est seul", () => {
    const result = assemblePrompt(
      baseInput({ scene: { ...scene, otherNames: [], others: [] } }),
    );
    expect(result.system).not.toContain("[SCÈNE]");
  });
});
