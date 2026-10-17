import { afterEach, describe, expect, it, vi } from "vitest";
import { computeAwards, parseReview, sceneStats, writeReview } from "../review";
import * as llm from "../llmClient";
import { frPrompts } from "../../i18n/prompts";
import type { Message, MessageInteraction } from "../../types";

afterEach(() => vi.restoreAllMocks());

const ANNA = { id: "p-anna", name: "Anna" };
const MARC = { id: "p-marc", name: "Marc" };
const INES = { id: "p-ines", name: "Inès" };

let seq = 0;
function line(
  speaker: { id: string; name: string } | null,
  content: string,
  overrides: Partial<Message> = {},
): Message {
  seq += 1;
  return {
    id: `m${seq}`,
    conversationId: "c1",
    role: speaker ? "assistant" : "user",
    kind: "speech",
    content,
    status: "complete",
    createdAt: `2026-01-01T00:00:${String(seq % 60).padStart(2, "0")}Z`,
    personaId: speaker?.id ?? null,
    personaName: speaker?.name ?? null,
    addressee: null,
    ...overrides,
  };
}

function interaction(overrides: Partial<MessageInteraction>): MessageInteraction {
  return {
    intent: "statement",
    addresseeId: null,
    replyToMessageId: null,
    proposal: null,
    responses: [],
    withdrawal: null,
    ...overrides,
  };
}

const agree = (proposalId: string) => ({
  proposalId,
  stance: "agree" as const,
  condition: null,
  evidence: "oui",
});

describe("computeAwards", () => {
  it("ne décerne rien tant qu'aucun personnage n'a parlé", () => {
    expect(computeAwards([line(null, "Bonjour ?")], [ANNA, MARC])).toEqual([]);
  });

  it("couronne le plus bavard, le plus en colère et le roi de l'aparté", () => {
    const messages = [
      line(ANNA, "Je crois que nous devrions vraiment partir tout de suite, tous ensemble."),
      line(MARC, "Non.", { reaction: { mood: "angry", intensity: 0.9 } }),
      line(ANNA, "Bon. (aparté : quel grincheux)"),
    ];
    const awards = computeAwards(messages, [ANNA, MARC]);
    const byId = Object.fromEntries(awards.map((a) => [a.id, a]));
    expect(byId.chatterbox.winnerIds).toEqual([ANNA.id]);
    expect(byId.volcano).toMatchObject({ winnerIds: [MARC.id], count: 90, quote: "Non." });
    expect(byId.whisperer).toMatchObject({ winnerIds: [ANNA.id], count: 1 });
  });

  it("cite la parole plutôt que le geste", () => {
    const messages = [
      line(ANNA, "*renverse sa tasse* Attends. Attends !", { reaction: { mood: "shocked", intensity: 0.8 } }),
      line(MARC, "*serre les poings*", { reaction: { mood: "angry", intensity: 0.7 } }),
    ];
    const byId = Object.fromEntries(computeAwards(messages, [ANNA, MARC]).map((a) => [a.id, a]));
    expect(byId.drama.quote).toBe("Attends. Attends !");
    expect(byId.volcano.quote).toBe("serre les poings");
  });

  it("ignore les humeurs trop faibles pour mériter un prix", () => {
    const messages = [
      line(ANNA, "Hmm.", { reaction: { mood: "annoyed", intensity: 0.3 } }),
      line(MARC, "Ah.", { reaction: { mood: "neutral", intensity: 1 } }),
    ];
    expect(computeAwards(messages, [ANNA, MARC]).map((a) => a.id)).not.toContain("volcano");
  });

  it("compte accords, objections et « oui, mais »", () => {
    const messages = [
      line(ANNA, "D'accord.", { interaction: interaction({ intent: "agreement", responses: [agree("x"), agree("y")] }) }),
      line(MARC, "Jamais !", { interaction: interaction({ intent: "objection" }) }),
      line(MARC, "Hors de question.", { interaction: interaction({ intent: "objection" }) }),
      line(ANNA, "Oui, si on rentre tôt.", {
        interaction: interaction({
          intent: "conditional",
          responses: [{ proposalId: "z", stance: "conditional", condition: "rentrer tôt", evidence: "si" }],
        }),
      }),
    ];
    const byId = Object.fromEntries(computeAwards(messages, [ANNA, MARC]).map((a) => [a.id, a]));
    expect(byId.diplomat).toMatchObject({ winnerIds: [ANNA.id], count: 2 });
    expect(byId.contrarian).toMatchObject({ winnerIds: [MARC.id], count: 2 });
    expect(byId.yesBut).toMatchObject({ winnerIds: [ANNA.id], count: 1 });
  });

  it("remarque la plante verte dans une scène assez peuplée", () => {
    const messages = [
      ...Array.from({ length: 4 }, () => line(ANNA, "Bla.")),
      ...Array.from({ length: 3 }, () => line(MARC, "Bla bla.")),
    ];
    const award = computeAwards(messages, [ANNA, MARC, INES]).find((a) => a.id === "wallflower");
    expect(award).toMatchObject({ winnerIds: [INES.id], count: 0 });
    expect(computeAwards(messages, [ANNA, MARC]).some((a) => a.id === "wallflower")).toBe(false);
  });

  it("cite le dernier imprévu au palmarès", () => {
    const messages = [
      line(ANNA, "Bon."),
      line(null, "Un lama entre dans la cuisine.", { kind: "narration", role: "assistant" }),
    ];
    const award = computeAwards(messages, [ANNA]).find((a) => a.id === "twist");
    expect(award).toMatchObject({ winnerIds: [], quote: "Un lama entre dans la cuisine." });
  });
});

describe("sceneStats", () => {
  it("compte répliques, didascalies, imprévus et apartés", () => {
    expect(
      sceneStats([
        line(null, "Salut"),
        line(ANNA, "Bonjour (aparté : enfin quelqu'un)"),
        line(null, "On frappe.", { kind: "narration" }),
        line(null, "Le lustre tombe.", { kind: "narration", role: "assistant" }),
        line(MARC, "", { status: "error" }),
      ]),
    ).toEqual({ lines: 2, narrations: 2, twists: 1, asides: 1 });
  });
});

describe("parseReview", () => {
  it("lit la critique en JSON et borne les étoiles", () => {
    expect(
      parseReview('```json\n{"newspaper":"Le Petit Rideau","headline":"Quel four !","stars":7,"review":"Anna brille, Marc boude, le public rit."}\n```'),
    ).toEqual({
      newspaper: "Le Petit Rideau",
      headline: "Quel four !",
      stars: 5,
      body: "Anna brille, Marc boude, le public rit.",
    });
  });

  it("garde une critique en prose plutôt que de la jeter", () => {
    const review = parseReview(
      "Une soirée inégale où Anna porte la pièce à bout de bras pendant que Marc fixe le plafond.",
    );
    expect(review).toMatchObject({ newspaper: null, stars: null });
    expect(review?.body).toContain("Anna porte la pièce");
  });

  it("refuse une réponse vide ou inutilisable", () => {
    expect(parseReview("")).toBeNull();
    expect(parseReview("{}")).toBeNull();
  });
});

describe("writeReview", () => {
  const input = {
    connection: { id: "local", baseUrl: "http://localhost:8080/v1", allowRemoteHosts: false, timeoutMs: 1000 },
    modelId: "model",
    cast: [{ name: "Anna", description: "notaire" }, { name: "Marc", description: null }],
    sceneDescription: "Un dîner de famille.",
    summary: null,
    messages: [line(ANNA, "Délicieux. (aparté : c'est immangeable)")],
    label: (m: Message) => m.personaName ?? "Jeff",
    userName: "Jeff",
    pack: frPrompts,
  };

  it("laisse le critique entendre les apartés", async () => {
    const chat = vi
      .spyOn(llm, "chatCompletion")
      .mockResolvedValue('{"newspaper":"X","headline":"Y","stars":2,"review":"Anna ment avec un aplomb remarquable."}');
    expect((await writeReview(input))?.stars).toBe(2);
    const sent = JSON.stringify(chat.mock.calls[0][1]);
    expect(sent).toContain("c'est immangeable");
    expect(sent).toContain("Un dîner de famille.");
  });

  it("ne lève jamais : un échec revient à ne rien afficher", async () => {
    vi.spyOn(llm, "chatCompletion").mockRejectedValue(new Error("timeout"));
    expect(await writeReview(input)).toBeNull();
  });
});
