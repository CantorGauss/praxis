import { describe, expect, it } from "vitest";
import {
  buildSceneBlock,
  clampAutoRounds,
  cleanSpeakerReply,
  describeAddressing,
  describeAutonomousTurn,
  describeLastTurn,
  describeSceneEvent,
  detectAddressee,
  findMentions,
  findVocative,
  planContinuation,
  planSpeakers,
  renderTranscript,
  speakerStopSequences,
  stripSpeakerPrefix,
  truncateAtForeignSpeaker,
  AUTO_ROUND_CHOICES,
} from "../scene";
import { enPrompts, frPrompts } from "../../i18n/prompts";
import type { Message } from "../../types";

const ANNA = { id: "p-anna", name: "Anna" };
const MARC = { id: "p-marc", name: "Marc" };
const ROSTER = [ANNA, MARC];

/** Les tests de structure tournent en français : c'est le pack le plus contraint. */
const FR = frPrompts;
const FR_USER = FR.scene.userLabel;
const FR_HEADER = FR.scene.multiSpeakerHeader;

let seq = 0;
function msg(
  personaId: string | null,
  content: string,
  overrides: Partial<Message> = {},
): Message {
  seq += 1;
  return {
    id: `m${seq}`,
    conversationId: "c1",
    role: personaId ? "assistant" : "user",
    content,
    status: "complete",
    kind: "speech",
    addressee: null,
    createdAt: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    personaId,
    personaName: personaId === ANNA.id ? "Anna" : personaId ? "Marc" : null,
    ...overrides,
  };
}

const label = (m: Message) =>
  m.role === "user" ? FR_USER : (m.personaName ?? FR.scene.unknownSpeakerLabel);

describe("renderTranscript", () => {
  it("garde les répliques du locuteur en rôle assistant, sans préfixe", () => {
    const messages = [msg(null, "Bonjour"), msg(ANNA.id, "Bonjour Jeff")];
    const rendered = renderTranscript(messages, ANNA.id, label, undefined, FR);
    expect(rendered).toEqual([
      { role: "user", content: "Utilisateur : Bonjour" },
      { role: "assistant", content: "Bonjour Jeff" },
    ]);
  });

  it("annonce un bloc qui rassemble plusieurs locuteurs", () => {
    const messages = [
      msg(null, "Bonjour à tous"),
      msg(ANNA.id, "Salut"),
      msg(MARC.id, "Bonsoir"),
    ];
    const rendered = renderTranscript(messages, MARC.id, label, undefined, FR);
    expect(rendered).toEqual([
      {
        role: "user",
        content: `${FR_HEADER}\nUtilisateur : Bonjour à tous\n\nAnna : Salut`,
      },
      { role: "assistant", content: "Bonsoir" },
    ]);
  });

  it("n'ajoute pas d'en-tête quand un seul locuteur s'est exprimé", () => {
    const messages = [msg(null, "Bonjour"), msg(null, "tu es là ?")];
    const rendered = renderTranscript(messages, MARC.id, label, undefined, FR);
    expect(rendered).toEqual([
      { role: "user", content: "Utilisateur : Bonjour\n\nUtilisateur : tu es là ?" },
    ]);
  });

  it("ignore les messages vides, y compris celui en cours de rédaction", () => {
    const messages = [
      msg(null, "Question"),
      msg(MARC.id, "", { status: "streaming" }),
    ];
    expect(renderTranscript(messages, MARC.id, label, undefined, FR)).toEqual([
      { role: "user", content: "Utilisateur : Question" },
    ]);
  });

  it("transmet une didascalie sans nom de locuteur", () => {
    const messages = [
      msg(null, "Gwendoline entre dans la pièce.", { kind: "narration" }),
      msg(ANNA.id, "Tiens, salut !"),
    ];
    const rendered = renderTranscript(messages, MARC.id, label, undefined, FR);
    expect(rendered).toEqual([
      {
        role: "user",
        content:
          "(Scène : Gwendoline entre dans la pièce.)\n\nAnna : Tiens, salut !",
      },
    ]);
  });

  it("marque la didascalie dans la langue du pack", () => {
    const messages = [msg(null, "The door slams.", { kind: "narration" })];
    const rendered = renderTranscript(messages, MARC.id, label, undefined, enPrompts);
    expect(rendered[0].content).toBe("(Scene: The door slams.)");
  });

  it("ne compte pas la didascalie comme un locuteur supplémentaire", () => {
    const messages = [
      msg(null, "La porte claque.", { kind: "narration" }),
      msg(ANNA.id, "Qu'est-ce que c'était ?"),
    ];
    const rendered = renderTranscript(messages, MARC.id, label, undefined, FR);
    expect(rendered[0].content).not.toContain(FR_HEADER);
  });

  it("produit un historique différent pour chaque locuteur", () => {
    const messages = [msg(null, "Salut"), msg(ANNA.id, "Coucou")];
    const forAnna = renderTranscript(messages, ANNA.id, label, undefined, FR);
    const forMarc = renderTranscript(messages, MARC.id, label, undefined, FR);
    expect(forAnna.at(-1)?.role).toBe("assistant");
    expect(forMarc.at(-1)?.role).toBe("user");
    expect(forMarc.at(-1)?.content).toContain("Anna : Coucou");
  });
});

describe("attribution des répliques", () => {
  it("annote le destinataire d'une réplique transmise", () => {
    // Sans l'annotation, « te fait un clin d'œil » écrit par Megan à Jeff est
    // lu par Anna comme la visant elle : c'est ce qui embrouillait les
    // personnages.
    const messages = [
      msg(MARC.id, "*te fait un clin d'œil*", { addressee: "user" }),
      msg(null, "Bonsoir"),
    ];
    const label = (m: Message) =>
      m.role === "user" ? "Jeff" : (m.personaName ?? "Personnage");
    const toLabel = (m: Message) => (m.addressee === "user" ? "Jeff" : null);
    const rendered = renderTranscript(messages, ANNA.id, label, toLabel, FR);
    expect(rendered[0].content).toContain("Marc (à Jeff) : *te fait un clin d'œil*");
  });

  it("annote le destinataire en anglais avec le pack anglais", () => {
    const messages = [msg(MARC.id, "*winks at you*", { addressee: "user" })];
    const label = (m: Message) => m.personaName ?? "Character";
    const toLabel = () => "Jeff";
    const rendered = renderTranscript(messages, ANNA.id, label, toLabel, enPrompts);
    expect(rendered[0].content).toBe("Marc (to Jeff): *winks at you*");
  });

  it("dit « toi » quand la réplique visait celui qui la lit", () => {
    const messages = [msg(MARC.id, "Et toi ?", { addressee: ANNA.id })];
    const label = (m: Message) => m.personaName ?? "Personnage";
    const toLabel = (m: Message) => (m.addressee === ANNA.id ? "toi" : null);
    expect(
      renderTranscript(messages, ANNA.id, label, toLabel, FR)[0].content,
    ).toContain("Marc (à toi) :");
  });

  it("n'annote rien quand la réplique s'adressait à la cantonade", () => {
    const messages = [msg(MARC.id, "Bonsoir tout le monde")];
    const label = (m: Message) => m.personaName ?? "Personnage";
    expect(
      renderTranscript(messages, ANNA.id, label, () => null, FR)[0].content,
    ).toBe("Marc : Bonsoir tout le monde");
  });
});

describe("describeLastTurn", () => {
  it("nomme le dernier locuteur et son destinataire", () => {
    const texte = describeLastTurn(
      {
        lastSpeakerName: "Anna",
        lastAddresseeName: "toi",
        userName: "Jeff",
        userSilentTurns: 0,
      },
      FR,
    );
    expect(texte).toBe("La dernière réplique est d'Anna, adressée à toi.");
  });

  it("élide devant une voyelle, pas devant une consonne", () => {
    const de = (name: string) =>
      describeLastTurn(
        {
          lastSpeakerName: name,
          lastAddresseeName: null,
          userName: "Jeff",
          userSilentTurns: 0,
        },
        FR,
      );
    expect(de("Anna")).toContain("d'Anna");
    expect(de("Marc")).toContain("de Marc");
  });

  it("prévient explicitement contre l'attribution à l'utilisateur silencieux", () => {
    const texte = describeLastTurn(
      {
        lastSpeakerName: "Megan",
        lastAddresseeName: null,
        userName: "Jeff",
        userSilentTurns: 4,
      },
      FR,
    );
    expect(texte).toContain("La dernière réplique est de Megan.");
    expect(texte).toContain("Jeff n'a rien dit depuis 4 répliques");
    expect(texte).toContain("n'attribue pas à Jeff des propos tenus par un personnage");
  });

  it("porte le même avertissement en anglais", () => {
    const text = describeLastTurn(
      {
        lastSpeakerName: "Megan",
        lastAddresseeName: null,
        userName: "Jeff",
        userSilentTurns: 4,
      },
      enPrompts,
    );
    expect(text).toContain("The last line is Megan's.");
    expect(text).toContain("Jeff has said nothing for 4 lines");
  });

  it("ne dit rien quand personne n'a encore parlé", () => {
    for (const pack of [enPrompts, FR]) {
      expect(
        describeLastTurn(
          {
            lastSpeakerName: null,
            lastAddresseeName: null,
            userName: "Jeff",
            userSilentTurns: 0,
          },
          pack,
        ),
      ).toBe("");
    }
  });
});

describe("buildSceneBlock", () => {
  it("dresse un trombinoscope distinguant l'humain des personnages", () => {
    const block = buildSceneBlock(
      {
        speakerName: "Anna",
        speakerGender: "feminine",
        others: [
          {
            name: "Marc",
            gender: "masculine",
            description: "Frère aîné d'Anna, médecin urgentiste",
          },
        ],
        userName: "Jeff",
        userGender: "masculine",
      },
      FR,
    );
    expect(block).toContain("[SCÈNE]");
    expect(block).toContain("Tu es Anna, et uniquement Anna.");
    expect(block).toContain("- Jeff — la personne humaine");
    expect(block).toContain("- Marc — un autre personnage");
    expect(block).toContain("Frère aîné d'Anna, médecin urgentiste");
    expect(block).toContain("- Anna — toi.");
    expect(block).toContain("ne confonds jamais Jeff et Marc");
    expect(block).not.toContain("Utilisateur");
  });

  it("ne partage que l'identité publique, sans inventer de description", () => {
    const block = buildSceneBlock(
      {
        speakerName: "Anna",
        speakerGender: "feminine",
        others: [
          { name: "Marc", gender: "masculine", description: "   " },
        ],
        userName: "Jeff",
      },
      FR,
    );
    expect(block).toContain("- Marc — un autre personnage de la scène.");
    expect(block).not.toContain("scène : .");
  });

  it("dresse le même trombinoscope en anglais", () => {
    const block = buildSceneBlock(
      {
        speakerName: "Anna",
        speakerGender: "feminine",
        others: [{ name: "Marc", gender: "masculine" }],
        userName: "Jeff",
        userGender: "masculine",
      },
      enPrompts,
    );
    expect(block).toContain("[SCENE]");
    expect(block).toContain("You are Anna, and only Anna.");
    expect(block).toContain("- Jeff — the human being");
    expect(block).toContain("- Marc — another character");
    expect(block).toContain("- Anna — you.");
    expect(block).toContain("never confuse Jeff and Marc");
  });

  it("ajoute la consigne de destinataire quand elle est fournie", () => {
    const block = buildSceneBlock(
      {
        speakerName: "Anna",
        speakerGender: "feminine",
        others: [{ name: "Marc", gender: "masculine" }],
        userName: "Jeff",
        addressing: "Le dernier message de Jeff t'est adressé directement.",
      },
      FR,
    );
    expect(block.trimEnd().endsWith("t'est adressé directement.")).toBe(true);
  });
});

describe("genre grammatical", () => {
  it("annonce l'accord de chacun dans le trombinoscope français", () => {
    const block = buildSceneBlock(
      {
        speakerName: "Anna",
        speakerGender: "feminine",
        others: [{ name: "Arthur", gender: "masculine" }],
        userName: "Jeff",
        userGender: "masculine",
      },
      FR,
    );
    expect(block).toContain("- Jeff — la personne humaine");
    expect(block).toMatch(/Jeff[^\n]*au masculin/);
    expect(block).toMatch(/Arthur[^\n]*au masculin/);
    expect(block).toContain("On parle de toi au féminin");
    expect(block).toContain("c'est la source qui fait foi");
  });

  it("n'impose aucun accord français quand le genre n'est pas précisé", () => {
    const block = buildSceneBlock(
      {
        speakerName: "Camille",
        speakerGender: "neutral",
        others: [{ name: "Dominique", gender: "neutral" }],
        userName: "Jeff",
        userGender: "neutral",
      },
      FR,
    );
    expect(block).toContain("Ton genre n'est pas précisé");
    expect(block).toContain("Son genre n'est pas précisé");
    expect(block).not.toContain("au féminin");
    expect(block).not.toContain("au masculin");
  });

  it("fixe des pronoms plutôt que des accords en anglais", () => {
    // L'anglais n'accorde ni adjectifs ni participes : le genre n'y est
    // visible que dans les pronoms, et c'est tout ce que le pack impose.
    const block = buildSceneBlock(
      {
        speakerName: "Anna",
        speakerGender: "feminine",
        others: [{ name: "Arthur", gender: "masculine" }],
        userName: "Jeff",
        userGender: "masculine",
      },
      enPrompts,
    );
    expect(block).toMatch(/Jeff[^\n]*he\/him/);
    expect(block).toMatch(/Arthur[^\n]*he\/him/);
    expect(block).toContain("Others refer to you as she/her.");
  });

  it("emploie they/them quand le genre n'est pas précisé", () => {
    const block = buildSceneBlock(
      {
        speakerName: "Camille",
        speakerGender: "neutral",
        others: [{ name: "Dominique", gender: "neutral" }],
        userName: "Jeff",
        userGender: "neutral",
      },
      enPrompts,
    );
    expect(block).toContain("they/them");
    expect(block).not.toContain("he/him");
    expect(block).not.toContain("she/her");
  });

  it("ne renvoie aucune consigne française accordée au féminin par défaut", () => {
    // Une seule formule féminine dans le prompt — « à toi seule », « fatiguée »
    // — suffisait à faire basculer tous les accords d'un personnage masculin.
    const plan = planSpeakers("@Anna ça va ?", ROSTER, null, FR);
    const texte = [
      describeAddressing(plan, ROSTER, ANNA.id, "Jeff", FR),
      describeAutonomousTurn("Jeff", FR),
      describeSceneEvent("Jeff", FR),
    ].join(" ");
    expect(texte).not.toMatch(/\bseule\b|\bprête\b|\bsûre\b|é(e)\b/);
  });
});

describe("describeAddressing", () => {
  it("signale un message adressé à tout le monde", () => {
    const plan = planSpeakers("Bonjour", ROSTER, null, FR);
    expect(describeAddressing(plan, ROSTER, ANNA.id, "Jeff", FR)).toBe(
      "Le dernier message de Jeff s'adresse à tout le monde.",
    );
    expect(describeAddressing(plan, ROSTER, ANNA.id, "Jeff", enPrompts)).toBe(
      "Jeff's last message is addressed to everyone.",
    );
  });

  it("signale une adresse directe et exclusive", () => {
    const plan = planSpeakers("@Anna ça va ?", ROSTER, null, FR);
    expect(describeAddressing(plan, ROSTER, ANNA.id, "Jeff", FR)).toContain(
      "à toi, et à toi seulement",
    );
    expect(describeAddressing(plan, ROSTER, ANNA.id, "Jeff", enPrompts)).toContain(
      "to you, and to you alone",
    );
  });

  it("prévient un personnage que le message ne lui était pas destiné", () => {
    const plan = planSpeakers("@Marc ça va ?", ROSTER, null, FR);
    expect(describeAddressing(plan, ROSTER, ANNA.id, "Jeff", FR)).toBe(
      "Le dernier message de Jeff s'adresse à Marc, pas à toi.",
    );
  });

  it("nomme les autres destinataires d'une adresse partagée", () => {
    const plan = planSpeakers("@Anna @Marc vous venez ?", ROSTER, null, FR);
    expect(describeAddressing(plan, ROSTER, ANNA.id, "Jeff", FR)).toBe(
      "Le dernier message de Jeff s'adresse à toi et à Marc.",
    );
  });
});

describe("detectAddressee", () => {
  const CANDIDATS = [{ id: "user", name: "Jeff" }, ANNA, MARC];

  it("reconnaît une mention explicite", () => {
    expect(detectAddressee("@Marc tu viens ?", CANDIDATS)?.id).toBe(MARC.id);
  });

  it("reconnaît une apostrophe en tête", () => {
    expect(detectAddressee("Anna, tu en penses quoi ?", CANDIDATS)?.id).toBe(ANNA.id);
    expect(detectAddressee("*soupire* Jeff, écoute…", CANDIDATS)?.id).toBe("user");
  });

  it("reconnaît une apostrophe en fin de phrase", () => {
    expect(detectAddressee("Tu viens, Anna ?", CANDIDATS)?.id).toBe(ANNA.id);
    expect(detectAddressee("Arrête, Marc. Ça suffit.", CANDIDATS)?.id).toBe(MARC.id);
  });

  it("ne déduit rien d'un nom simplement cité", () => {
    expect(detectAddressee("Je pense que Marc a raison.", CANDIDATS)).toBeNull();
    expect(detectAddressee("Bonjour tout le monde !", CANDIDATS)).toBeNull();
  });

  it("ne déduit rien d'un texte vide", () => {
    expect(detectAddressee("   ", CANDIDATS)).toBeNull();
  });
});

describe("describeAutonomousTurn", () => {
  it("dit que l'utilisateur n'a rien ajouté et demande de conclure", () => {
    const texte = describeAutonomousTurn("Jeff", FR);
    expect(texte).toContain("Jeff n'a rien ajouté");
    expect(texte).toContain("conclus");

    const text = describeAutonomousTurn("Jeff", enPrompts);
    expect(text).toContain("Jeff has added nothing since");
    expect(text).toContain("wrap up");
  });
});

describe("clampAutoRounds", () => {
  it("borne le réglage aux valeurs proposées", () => {
    expect(clampAutoRounds(-4)).toBe(0);
    expect(clampAutoRounds(2)).toBe(2);
    expect(clampAutoRounds(99)).toBe(AUTO_ROUND_CHOICES.length - 1);
    expect(clampAutoRounds(Number.NaN)).toBe(0);
  });
});

describe("speakerStopSequences", () => {
  it("cible les autres locuteurs et l'utilisateur, en début de ligne", () => {
    expect(speakerStopSequences(["Marc"], undefined, FR)).toEqual([
      "\nMarc :",
      "\nUtilisateur :",
    ]);
  });

  it("suit la ponctuation de la langue", () => {
    // L'espace insécable avant les deux-points est une convention française :
    // une séquence d'arrêt calquée sur le français ne couperait rien en anglais.
    expect(speakerStopSequences(["Marc"], undefined, enPrompts)).toEqual([
      "\nMarc:",
      "\nUser:",
    ]);
  });

  it("ne dépasse jamais quatre séquences", () => {
    const stops = speakerStopSequences(["A", "B", "C", "D", "E"], undefined, FR);
    expect(stops).toHaveLength(4);
  });
});

describe("nettoyage des réponses", () => {
  it("retire un préfixe de nom ajouté malgré la consigne", () => {
    expect(stripSpeakerPrefix("Anna : bonjour", "Anna")).toBe("bonjour");
    expect(stripSpeakerPrefix("**Anna :** bonjour", "Anna")).toBe("bonjour");
    expect(stripSpeakerPrefix("Annabelle arrive", "Anna")).toBe("Annabelle arrive");
  });

  it("coupe la réplique usurpée d'un autre personnage", () => {
    const raw = "Bonjour Jeff.\nMarc : et moi alors ?";
    expect(truncateAtForeignSpeaker(raw, ["Marc"])).toBe("Bonjour Jeff.");
  });

  it("laisse intact un texte qui cite un nom sans le faire parler", () => {
    const raw = "Je pense que Marc a raison.";
    expect(truncateAtForeignSpeaker(raw, ["Marc"])).toBe(raw);
  });

  it("combine les deux nettoyages", () => {
    const raw = "Anna : salut\nUtilisateur : merci";
    expect(cleanSpeakerReply(raw, "Anna", ["Marc"], FR_USER)).toBe("salut");
  });

  it("retire une étiquette étrangère en tête plutôt que de vider le message", () => {
    expect(cleanSpeakerReply("Marc : et moi alors ?", "Anna", ["Marc"])).toBe(
      "et moi alors ?",
    );
  });

  it("ne renvoie jamais une chaîne vide pour une réponse non vide", () => {
    const raw = "Marc : première réplique\nUtilisateur : et ensuite ?";
    expect(cleanSpeakerReply(raw, "Anna", ["Marc"], FR_USER)).toBe(
      "première réplique",
    );
  });
});

describe("directeur", () => {
  it("respecte un locuteur imposé", () => {
    const plan = planSpeakers("peu importe", ROSTER, MARC.id);
    expect(plan).toEqual({ personaIds: [MARC.id], reason: "forced" });
  });

  it("détecte les mentions explicites", () => {
    expect(findMentions("@Marc tu en penses quoi ?", ROSTER)).toEqual([MARC.id]);
    expect(findMentions("@tous, avis ?", ROSTER, FR)).toEqual([ANNA.id, MARC.id]);
  });

  it("accepte les mots-clés des deux langues", () => {
    // On tape « @everyone » par habitude ; refuser la forme de l'autre langue
    // ne protège de rien.
    expect(findMentions("@everyone ?", ROSTER, FR)).toEqual([ANNA.id, MARC.id]);
    expect(findMentions("@tous ?", ROSTER, enPrompts)).toEqual([ANNA.id, MARC.id]);
  });

  it("conserve l'ordre de la scène malgré l'ordre des mentions", () => {
    const plan = planSpeakers("@Marc et @Anna, vous en dites quoi ?", ROSTER);
    expect(plan.personaIds).toEqual([ANNA.id, MARC.id]);
    expect(plan.reason).toBe("mention");
  });

  it("reconnaît une apostrophe en début de message", () => {
    expect(findVocative("Marc, tu es là ?", ROSTER)).toBe(MARC.id);
    expect(findVocative("Je parlais de Marc hier", ROSTER)).toBeNull();
  });

  it("fait répondre tout le monde par défaut, dans l'ordre", () => {
    const plan = planSpeakers("Bonjour", ROSTER);
    expect(plan).toEqual({ personaIds: [ANNA.id, MARC.id], reason: "all" });
  });

  it("ignore un locuteur imposé absent de la scène", () => {
    const plan = planSpeakers("Bonjour", ROSTER, "p-inconnu");
    expect(plan.reason).toBe("all");
  });
});

describe("planContinuation", () => {
  it("reprend après le dernier locuteur", () => {
    expect(planContinuation(ROSTER, ANNA.id)).toEqual([MARC.id, ANNA.id]);
    expect(planContinuation(ROSTER, MARC.id)).toEqual([ANNA.id, MARC.id]);
  });

  it("part du début quand personne n'a encore parlé", () => {
    expect(planContinuation(ROSTER, null)).toEqual([ANNA.id, MARC.id]);
  });

  it("gère une scène à un seul personnage", () => {
    expect(planContinuation([ANNA], ANNA.id)).toEqual([ANNA.id]);
  });
});
