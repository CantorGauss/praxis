import { describe, expect, it } from "vitest";
import { rankByRelevance, recallPassages, scoreDocuments, tokenize } from "../recall";

const estimate = (text: string) => Math.ceil(text.length / 4);

describe("tokenize", () => {
  it("ignore accents, casse, mots vides et rapproche les formes d'un même mot", () => {
    expect(tokenize("Les CLÉS de la cave")).toEqual(["cle", "cave"]);
    expect(tokenize("promesse")).toEqual(tokenize("promesses"));
  });
});

describe("scoreDocuments", () => {
  it("préfère le document qui partage les mots rares de la requête", () => {
    const scores = scoreDocuments(
      [
        { order: 0, text: "Anna : il fait beau aujourd'hui." },
        { order: 1, text: "Marc : j'ai caché le testament derrière le tableau." },
        { order: 2, text: "Anna : il fait froid." },
      ],
      [{ text: "Où est le testament ?", weight: 1 }],
    );
    expect(scores[1].score).toBeGreaterThan(scores[0].score);
    expect(scores[0].score).toBe(0);
  });
});

describe("recallPassages", () => {
  const documents = [
    { order: 0, text: "Jeff : Tu te souviens de Germaine ?" },
    { order: 1, text: "Anna : Germaine, la voisine qui garde le colis bleu." },
    { order: 2, text: "Marc : Il pleut." },
    { order: 3, text: "Anna : J'ai faim." },
    { order: 4, text: "Marc : Le train est en retard." },
  ];

  it("rend l'extrait pertinent avec sa réplique précédente, dans l'ordre", () => {
    const passages = recallPassages({
      documents,
      query: [{ text: "Qui garde le colis bleu ?", weight: 2 }],
      budgetTokens: 500,
      estimateTokens: estimate,
    });
    expect(passages).toEqual([
      "Jeff : Tu te souviens de Germaine ?\nAnna : Germaine, la voisine qui garde le colis bleu.",
    ]);
  });

  it("ne rappelle rien sans correspondance significative ou sans budget", () => {
    expect(
      recallPassages({ documents, query: [{ text: "Bonjour", weight: 1 }], budgetTokens: 500, estimateTokens: estimate }),
    ).toEqual([]);
    expect(
      recallPassages({ documents, query: [{ text: "colis bleu", weight: 2 }], budgetTokens: 0, estimateTokens: estimate }),
    ).toEqual([]);
  });

  it("respecte le budget en abandonnant la réplique de contexte si besoin", () => {
    const passages = recallPassages({
      documents,
      query: [{ text: "colis bleu Germaine voisine", weight: 2 }],
      budgetTokens: 18,
      estimateTokens: estimate,
    });
    expect(passages).toEqual(["Anna : Germaine, la voisine qui garde le colis bleu."]);
  });
});

describe("rankByRelevance", () => {
  it("classe les faits selon la requête", () => {
    const scores = rankByRelevance(
      ["Anna a un chat.", "Le coffre contient le testament.", "Marc aime le jazz."],
      [{ text: "Ouvrons le coffre", weight: 1 }],
    );
    expect(scores.indexOf(Math.max(...scores))).toBe(1);
  });
});
