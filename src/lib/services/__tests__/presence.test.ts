import { describe, expect, it } from "vitest";
import { knowledgeFor, witnessedBy, type PresenceSpan } from "../presence";
import type { Message } from "../../types";

function message(id: string, minute: number, personaId: string | null = null): Message {
  return {
    id,
    conversationId: "c1",
    role: personaId ? "assistant" : "user",
    kind: "speech",
    content: `réplique ${id}`,
    status: "complete",
    createdAt: `2026-01-01T10:${String(minute).padStart(2, "0")}:00.000Z`,
    personaId,
    personaName: personaId,
    addressee: null,
  };
}

const at = (minute: number) =>
  `2026-01-01T10:${String(minute).padStart(2, "0")}:00.000Z`;

const history = [
  message("1", 1),
  message("2", 2, "anna"),
  message("3", 3),
  message("4", 4, "anna"),
  message("5", 5, "marc"),
  message("6", 6),
];

describe("witnessedBy", () => {
  it("cache ce qui s'est dit avant l'arrivée", () => {
    const spans: PresenceSpan[] = [
      { personaId: "anna", enteredAt: null, leftAt: null },
      { personaId: "marc", enteredAt: at(4), leftAt: null },
    ];
    const seen = witnessedBy(history, spans, "marc");
    expect(seen.messages.map((m) => m.id)).toEqual(["4", "5", "6"]);
    expect(seen.missedSome).toBe(true);
    expect(witnessedBy(history, spans, "anna").missedSome).toBe(false);
  });

  it("cache ce qui s'est dit pendant une absence", () => {
    const spans: PresenceSpan[] = [
      { personaId: "anna", enteredAt: null, leftAt: at(2) },
      { personaId: "anna", enteredAt: at(5), leftAt: null },
    ];
    expect(witnessedBy(history, spans, "anna").messages.map((m) => m.id)).toEqual([
      "1", "2", "4", "5", "6",
    ]);
  });

  it("garde l'historique complet sans période connue", () => {
    const seen = witnessedBy(history, [], "anna");
    expect(seen.messages).toHaveLength(history.length);
    expect(seen.missedSome).toBe(false);
  });
});

describe("knowledgeFor", () => {
  const spans: PresenceSpan[] = [
    { personaId: "anna", enteredAt: null, leftAt: null },
    { personaId: "marc", enteredAt: at(4), leftAt: null },
  ];

  it("donne le résumé et les messages non couverts à qui était là", () => {
    const k = knowledgeFor(history, spans, "anna", "3");
    expect(k.summaryKnown).toBe(true);
    expect(k.recent.map((m) => m.id)).toEqual(["4", "5", "6"]);
  });

  it("retire le résumé à qui n'a pas tout vu, et lui rend ce qu'il a vu", () => {
    const k = knowledgeFor(history, spans, "marc", "4");
    expect(k.summaryKnown).toBe(false);
    expect(k.missedSome).toBe(true);
    expect(k.recent.map((m) => m.id)).toEqual(["4", "5", "6"]);
  });

  it("garde le résumé quand il ne couvre que des messages vus", () => {
    const late: PresenceSpan[] = [
      { personaId: "anna", enteredAt: null, leftAt: at(5) },
    ];
    const k = knowledgeFor(history, late, "anna", "3");
    expect(k.summaryKnown).toBe(true);
    expect(k.missedSome).toBe(true);
    expect(k.recent.map((m) => m.id)).toEqual(["4", "5"]);
  });
});
