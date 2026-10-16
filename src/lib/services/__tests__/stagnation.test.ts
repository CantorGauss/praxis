import { describe, expect, it } from "vitest";
import { contentWords, detectStagnation, linesSinceNarration } from "../stagnation";
import type { DialogueIntent, Message } from "../../types";

let counter = 0;

function line(
  name: "Anna" | "Marc" | "Jeff",
  content: string,
  intent?: DialogueIntent,
): Message {
  counter += 1;
  const user = name === "Jeff";
  return {
    id: `m${counter}`,
    conversationId: "c1",
    role: user ? "user" : "assistant",
    kind: "speech",
    content,
    status: "complete",
    createdAt: `2026-01-01T00:00:${String(counter).padStart(2, "0")}Z`,
    personaId: user ? null : `p-${name.toLowerCase()}`,
    personaName: user ? null : name,
    addressee: null,
    interaction: intent
      ? { intent, addresseeId: null, replyToMessageId: null, proposal: null, responses: [], withdrawal: null }
      : undefined,
  } as Message;
}

function narration(content: string, role: "user" | "assistant" = "user"): Message {
  return { ...line("Jeff", content), role, kind: "narration" };
}

const NAMES = ["Jeff", "Anna", "Marc"];

/** Une scène qui avance : chaque réplique apporte son propre vocabulaire. */
const LIVELY = [
  line("Anna", "Marc, tu as vu la lettre posée sur la console de l'entrée ce matin ?"),
  line("Marc", "Celle avec le cachet rouge ? Je pensais qu'elle venait du notaire de ta tante."),
  line("Anna", "Non, regarde l'écriture : c'est mon frère, il ne m'a plus écrit depuis dix ans."),
  line("Marc", "Ton frère ? Celui qui est parti au Canada après la vente de la maison ?"),
  line("Anna", "Exactement. Et il annonce qu'il débarque samedi, avec sa nouvelle femme."),
  line("Marc", "Samedi, c'est l'anniversaire de ta mère. Il le sait forcément, il calcule son effet."),
  line("Anna", "Tu crois qu'il veut récupérer sa part de l'héritage devant toute la famille ?"),
  line("Marc", "Je crois surtout qu'il faut appeler ta mère avant qu'elle ouvre son courrier."),
];

/** La même scène, enlisée : on ressasse le même voyage et la même confiance. */
const CIRCULAR = [
  line("Anna", "Ce voyage en Italie sera merveilleux, j'en suis certaine, Marc."),
  line("Marc", "Oui, ce voyage en Italie sera vraiment merveilleux, Anna, j'en suis certain."),
  line("Anna", "Je suis tellement contente de partir en Italie avec toi, ce voyage sera parfait."),
  line("Marc", "Moi aussi, partir en Italie avec toi, ce voyage sera parfait et merveilleux."),
  line("Anna", "L'Italie, le voyage, nous deux : vraiment, ce sera merveilleux et parfait."),
  line("Marc", "Oui, merveilleux, parfait : notre voyage en Italie sera vraiment merveilleux."),
];

describe("contentWords", () => {
  it("écarte les mots outils, les élisions et les noms des participants", () => {
    const words = contentWords("C'est vraiment l'idée de Marc, mais elle reste bonne.", new Set(["marc"]));
    expect([...words].sort()).toEqual(["bonne", "idée", "reste"]);
  });
});

describe("detectStagnation", () => {
  it("laisse tranquille une scène qui avance", () => {
    expect(detectStagnation(LIVELY, NAMES)).toBeNull();
  });

  it("repère un échange qui tourne en rond", () => {
    expect(detectStagnation(CIRCULAR, NAMES)).not.toBeNull();
  });

  it("repère une réplique qui en répète une autre", () => {
    const echo = [
      ...LIVELY.slice(0, 5),
      line("Marc", "Ton frère ? Celui qui est parti au Canada après la vente de la maison familiale ?"),
    ];
    expect(detectStagnation(echo, NAMES)).toBe("echo");
  });

  it("repère une approbation en chaîne", () => {
    const consensus = [
      ...LIVELY.slice(0, 4),
      line("Anna", "Tu as raison, appelons-la ce soir.", "agreement"),
      line("Marc", "D'accord, je m'en occupe après le dîner.", "agreement"),
      line("Anna", "Parfait, on fait comme ça.", "statement"),
    ];
    expect(detectStagnation(consensus, NAMES)).toBe("consensus");
  });

  it("ne parle pas d'approbation en chaîne quand quelqu'un relance", () => {
    const debate = [
      ...LIVELY.slice(0, 4),
      line("Anna", "Tu as raison, appelons-la ce soir.", "agreement"),
      line("Marc", "D'accord, mais qui annonce la nouvelle à ton oncle ?", "agreement"),
      line("Anna", "Et si on ne lui disait rien du tout ?", "question"),
    ];
    expect(detectStagnation(debate, NAMES)).not.toBe("consensus");
  });

  it("attend d'avoir assez de répliques pour juger", () => {
    expect(detectStagnation(CIRCULAR.slice(0, 4), NAMES)).toBeNull();
  });

  it("ne compare pas au-delà d'un message de l'utilisateur ou d'une didascalie", () => {
    expect(detectStagnation([...CIRCULAR.slice(0, 4), line("Jeff", "Et le budget ?"), ...CIRCULAR.slice(4)], NAMES)).toBeNull();
    expect(detectStagnation([...CIRCULAR.slice(0, 4), narration("On sonne."), ...CIRCULAR.slice(4)], NAMES)).toBeNull();
  });
});

describe("linesSinceNarration", () => {
  it("compte les répliques depuis la dernière didascalie, d'où qu'elle vienne", () => {
    expect(linesSinceNarration(LIVELY)).toBe(LIVELY.length);
    expect(linesSinceNarration([...LIVELY, narration("Un verre se brise.", "assistant"), LIVELY[0]])).toBe(1);
  });
});
