import { describe, expect, it } from "vitest";
import { bubbleTone, tint } from "../bubbleTone";

describe("bubbleTone", () => {
  it("reste sobre sans humeur ni indice", () => {
    expect(bubbleTone("Bonjour, comment vas-tu ?", null)).toEqual({
      mood: null,
      intensity: 0,
      delivery: null,
      entrance: "rise",
      emoji: null,
    });
  });

  it("garde une humeur faible dans la teinte, sans geste ni pictogramme", () => {
    const tone = bubbleTone("D'accord.", { mood: "joyful", intensity: 0.3 });
    expect(tone.mood).toBe("joyful");
    expect(tone.entrance).toBe("rise");
    expect(tone.emoji).toBeNull();
  });

  it("anime une humeur marquée selon sa nature", () => {
    expect(bubbleTone("Quoi ?", { mood: "angry", intensity: 0.8 })).toMatchObject({
      entrance: "shake",
      emoji: "😠",
    });
    expect(bubbleTone("Super !", { mood: "joyful", intensity: 0.6 }).entrance).toBe(
      "bounce",
    );
    expect(bubbleTone("Ah.", { mood: "sad", intensity: 0.5 }).entrance).toBe("droop");
  });

  it("ignore l'humeur neutre", () => {
    expect(bubbleTone("Oui.", { mood: "neutral", intensity: 0.9 }).mood).toBeNull();
  });

  it("lit la façon de parler dans les didascalies", () => {
    expect(bubbleTone("*chuchote* Viens par ici.", null).delivery).toBe("whisper");
    expect(bubbleTone("*hurle* Sortez !", null).delivery).toBe("shout");
    expect(bubbleTone("*éclate de rire* Non, sérieux ?", null).delivery).toBe("laugh");
    expect(bubbleTone("*laughs softly* Fine.", null).delivery).toBe("whisper");
    expect(bubbleTone("*frissonne* Il fait froid.", null).delivery).toBe("tremble");
    expect(bubbleTone("*dit à voix basse* Attention.", null).delivery).toBe("whisper");
  });

  it("garde l'entrée de l'humeur quand le texte change de ton en route", () => {
    const reaction = { mood: "joyful" as const, intensity: 0.6 };
    expect(bubbleTone("", reaction).entrance).toBe("bounce");
    expect(bubbleTone("*hurle* QUOI ?!", reaction)).toMatchObject({
      entrance: "bounce",
      delivery: "shout",
    });
  });

  it("ne confond pas « sourit » avec un rire", () => {
    expect(bubbleTone("*sourit* Bien sûr.", null).delivery).toBeNull();
  });

  it("repère les cris et les rires dans le texte", () => {
    expect(bubbleTone("ARRÊTE TOUT DE SUITE", null).delivery).toBe("shout");
    expect(bubbleTone("Non mais vraiment !!", null).delivery).toBe("shout");
    expect(bubbleTone("Hahaha, elle est bonne.", null)).toMatchObject({
      delivery: "laugh",
      emoji: "😆",
    });
    expect(bubbleTone("OK", null).delivery).toBeNull();
  });

  it("fait trembler une peur très forte", () => {
    expect(bubbleTone("Il y a quelqu'un ?", { mood: "afraid", intensity: 0.85 })).toMatchObject({
      delivery: "tremble",
      entrance: "tremble",
      emoji: "😨",
    });
  });
});

describe("tint", () => {
  it("convertit une couleur hexadécimale avec opacité bornée", () => {
    expect(tint("#e14f4f", 0.25)).toBe("rgba(225, 79, 79, 0.25)");
    expect(tint("#000000", 2)).toBe("rgba(0, 0, 0, 1)");
  });
});
