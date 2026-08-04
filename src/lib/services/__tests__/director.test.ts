import { describe, expect, it } from "vitest";
import { parseSpeakerChoice } from "../director";

const ANNA = { id: "p-anna", name: "Anna" };
const MARC = { id: "p-marc", name: "Marc" };
const ROSTER = [ANNA, MARC];

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
