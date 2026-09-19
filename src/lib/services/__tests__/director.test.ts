import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseSpeakers, parseSpeakerChoice } from "../director";
import * as llm from "../llmClient";

const ANNA = { id: "p-anna", name: "Anna" };
const MARC = { id: "p-marc", name: "Marc" };
const ROSTER = [ANNA, MARC];

afterEach(() => vi.restoreAllMocks());

describe("chooseSpeakers", () => {
  const input = {
    connection: { id: "local", baseUrl: "http://localhost:8080/v1", allowRemoteHosts: false, timeoutMs: 1000 },
    modelId: "model", participants: ROSTER, descriptions: {}, recentMessages: [],
    label: () => "Jeff", userName: "Jeff", afterUserMessage: false, coordination: "Pending proposal: dinner",
  };

  it("selects a single next speaker and includes shared coordination", async () => {
    const chat = vi.spyOn(llm, "chatCompletion").mockResolvedValue('["Marc","Anna"]');
    expect(await chooseSpeakers(input)).toEqual([MARC.id]);
    expect(JSON.stringify(chat.mock.calls[0])).toContain("Pending proposal: dinner");
  });

  it("distinguishes explicit silence from unusable model output", async () => {
    const chat = vi.spyOn(llm, "chatCompletion").mockResolvedValue("[]");
    expect(await chooseSpeakers(input)).toEqual([]);
    chat.mockResolvedValue("Je ne sais pas.");
    expect(await chooseSpeakers(input)).toBeNull();
    chat.mockResolvedValue('["Unknown"]');
    expect(await chooseSpeakers(input)).toBeNull();
  });
});

describe("parseSpeakerChoice", () => {
  it("lit un tableau JSON de noms, dans l'ordre", () => {
    expect(parseSpeakerChoice('["Marc","Anna"]', ROSTER)).toEqual([MARC.id, ANNA.id]);
  });

  it("accepte un tableau vide : personne ne parle", () => {
    expect(parseSpeakerChoice("[]", ROSTER)).toEqual([]);
  });

  it("tolère du bavardage autour du JSON", () => {
    const raw = 'Voici mon choix :\n["Anna"]\nElle est directement interpellée.';
    expect(parseSpeakerChoice(raw, ROSTER)).toEqual([ANNA.id]);
  });

  it("ignore les noms qui ne sont pas en scène", () => {
    expect(parseSpeakerChoice('["Gwendoline","Anna"]', ROSTER)).toEqual([ANNA.id]);
  });

  it("ne fait jamais parler deux fois le même personnage", () => {
    expect(parseSpeakerChoice('["Anna","Anna","Marc"]', ROSTER)).toEqual([
      ANNA.id,
      MARC.id,
    ]);
  });

  it("retombe sur les noms cités quand le JSON est absent", () => {
    // Les petits modèles locaux répondent volontiers en français.
    expect(parseSpeakerChoice("Marc devrait répondre, puis Anna.", ROSTER)).toEqual([
      MARC.id,
      ANNA.id,
    ]);
  });

  it("retombe sur les noms cités quand le JSON est mal formé", () => {
    expect(parseSpeakerChoice('["Anna", ', ROSTER)).toEqual([ANNA.id]);
  });

  it("ne retient rien d'une réponse hors sujet", () => {
    expect(parseSpeakerChoice("Je ne sais pas trop.", ROSTER)).toEqual([]);
  });

  it("est insensible à la casse", () => {
    expect(parseSpeakerChoice('["anna"]', ROSTER)).toEqual([ANNA.id]);
  });
});
