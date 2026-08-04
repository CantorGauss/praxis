import { describe, expect, it } from "vitest";
import { splitActions } from "../messageFormat";

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
