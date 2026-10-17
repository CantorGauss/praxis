import { describe, expect, it } from "vitest";
import {
  countAsides,
  publicText,
  splitActions,
  splitAsides,
  splitMessage,
} from "../messageFormat";

describe("splitActions", () => {
  it("sépare paroles et actions", () => {
    expect(
      splitActions("Bonjour. *sourit doucement* Comment vas-tu ?"),
    ).toEqual([
      { kind: "speech", text: "Bonjour. " },
      { kind: "action", text: "sourit doucement" },
      { kind: "speech", text: " Comment vas-tu ?" },
    ]);
  });

  it("gère un message entièrement en action", () => {
    expect(splitActions("*rit aux éclats*")).toEqual([
      { kind: "action", text: "rit aux éclats" },
    ]);
  });

  it("gère plusieurs actions", () => {
    const segments = splitActions("*entre* Salut ! *s'assoit*");
    expect(segments.filter((s) => s.kind === "action")).toHaveLength(2);
  });

  it("laisse un astérisque non refermé en texte normal (streaming)", () => {
    expect(splitActions("Je pense que *tout va")).toEqual([
      { kind: "speech", text: "Je pense que *tout va" },
    ]);
  });

  it("ne traverse pas les sauts de ligne", () => {
    expect(splitActions("a *ligne\nsuivante* b")).toEqual([
      { kind: "speech", text: "a *ligne\nsuivante* b" },
    ]);
  });

  it("retourne une liste vide pour un message vide", () => {
    expect(splitActions("")).toEqual([]);
  });

  it("laisse le gras **texte** essentiellement intact", () => {
    const segments = splitActions("**important**");
    expect(segments.map((s) => s.text).join("")).toContain("important");
  });
});

describe("apartés", () => {
  it("repère les apartés en français et en anglais", () => {
    expect(splitAsides("Bien sûr ! (aparté : jamais de la vie) On y va ?")).toEqual([
      { kind: "public", text: "Bien sûr ! " },
      { kind: "aside", text: "jamais de la vie" },
      { kind: "public", text: " On y va ?" },
    ]);
    expect(countAsides("[Aside: she knows] Fine.")).toBe(1);
    expect(countAsides("(À part, au public — il ne se doute de rien)")).toBe(1);
    expect(countAsides("(en aparté : quelle horreur)")).toBe(1);
  });

  it("laisse tranquilles les parenthèses ordinaires", () => {
    expect(countAsides("(à part ça, tout va bien)")).toBe(0);
    expect(countAsides("(aside from that - fine)")).toBe(0);
    expect(countAsides("(apartement : 3e étage)")).toBe(0);
  });

  it("n'en voit pas tant que la parenthèse n'est pas refermée", () => {
    expect(countAsides("Oui. (aparté : en fait")).toBe(0);
  });

  it("retire les apartés de ce que la scène entend", () => {
    expect(publicText("Avec plaisir ! (aparté : je le déteste) Je prends une part.")).toBe(
      "Avec plaisir ! Je prends une part.",
    );
    expect(publicText("(aparté : personne ne m'écoute)")).toBe("");
    // La typographie française n'est pas touchée.
    expect(publicText("Vraiment ? (aparté : non) D'accord !")).toBe("Vraiment ? D'accord !");
  });

  it("découpe paroles, actions et apartés pour l'affichage", () => {
    expect(splitMessage("*sourit* Merci. (aparté : enfin)")).toEqual([
      { kind: "action", text: "sourit" },
      { kind: "speech", text: " Merci. " },
      { kind: "aside", text: "enfin" },
    ]);
  });
});
