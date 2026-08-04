import { describe, expect, it } from "vitest";
import {
  appearanceFromSeed,
  BUILTIN_AVATAR_IMAGES,
  builtinAvatarImage,
  builtinAvatarIndicesForGender,
  builtinAvatarSvg,
  normalizeAppearance,
  resolveAvatar,
  FACIAL_HAIRS,
  GLASSES_STYLES,
  HAIR_STYLES,
  type AvatarAppearance,
} from "../avatar";
import type { AvatarVariant, DayPeriod, Mood } from "../../types";

function variant(
  id: string,
  mood: Mood | null,
  dayPeriod: DayPeriod | null,
  priority = 0,
): AvatarVariant {
  return { id, avatarSetId: "set", mood, dayPeriod, assetPath: `${id}.png`, priority };
}

describe("resolveAvatar", () => {
  const full = [
    variant("mood-period", "joyful", "night"),
    variant("mood-only", "joyful", null),
    variant("period-only", null, "night"),
    variant("neutral", "neutral", null),
  ];

  it("préfère mood + période", () => {
    expect(resolveAvatar(full, { mood: "joyful" }, "night")?.id).toBe("mood-period");
  });

  it("retombe sur mood seul quand la période manque", () => {
    const variants = full.filter((v) => v.id !== "mood-period");
    expect(resolveAvatar(variants, { mood: "joyful" }, "night")?.id).toBe("mood-only");
  });

  it("retombe sur la période seule quand l'humeur manque", () => {
    const variants = [variant("period-only", null, "night"), variant("neutral", "neutral", null)];
    expect(resolveAvatar(variants, { mood: "tired" }, "night")?.id).toBe("period-only");
  });

  it("retombe sur le neutre en dernier recours", () => {
    const variants = [variant("neutral", "neutral", null)];
    expect(resolveAvatar(variants, { mood: "annoyed" }, "morning")?.id).toBe("neutral");
  });

  it("retourne undefined sans aucune variante utilisable", () => {
    expect(resolveAvatar([], { mood: "calm" }, "morning")).toBeUndefined();
  });

  it("respecte la priorité entre variantes équivalentes", () => {
    const variants = [
      variant("low", "calm", null, 0),
      variant("high", "calm", null, 5),
    ];
    expect(resolveAvatar(variants, { mood: "calm" }, "morning")?.id).toBe("high");
  });
});

describe("builtinAvatarSvg", () => {
  it("produit un data-URI stable et distinct par humeur/période", () => {
    const a = builtinAvatarSvg("joyful", "morning");
    expect(a.startsWith("data:image/svg+xml")).toBe(true);
    expect(a).toBe(builtinAvatarSvg("joyful", "morning"));
    expect(a).not.toBe(builtinAvatarSvg("tired", "morning"));
    expect(a).not.toBe(builtinAvatarSvg("joyful", "night"));
  });

  it("donne une silhouette différente à chaque coiffure", () => {
    const base: AvatarAppearance = {
      hair: "long",
      facialHair: "none",
      glasses: "none",
      hairColor: 0,
      skinTone: 0,
      outfit: 0,
    };
    const rendus = HAIR_STYLES.map((hair) =>
      builtinAvatarSvg("neutral", "afternoon", { ...base, hair }),
    );
    expect(new Set(rendus).size).toBe(HAIR_STYLES.length);
  });

  it("distingue pilosité et lunettes", () => {
    const base: AvatarAppearance = {
      hair: "short",
      facialHair: "none",
      glasses: "none",
      hairColor: 0,
      skinTone: 0,
      outfit: 0,
    };
    const barbes = FACIAL_HAIRS.map((facialHair) =>
      builtinAvatarSvg("neutral", "afternoon", { ...base, facialHair }),
    );
    expect(new Set(barbes).size).toBe(FACIAL_HAIRS.length);
    const lunettes = GLASSES_STYLES.map((glasses) =>
      builtinAvatarSvg("neutral", "afternoon", { ...base, glasses }),
    );
    expect(new Set(lunettes).size).toBe(GLASSES_STYLES.length);
  });

  it("produit des apparences variées pour des identifiants différents", () => {
    const seeds = ["Anna", "Gwendoline", "Marc", "Léa", "Hugo", "Sofia"];
    const looks = seeds.map((s) => appearanceFromSeed(s));
    // On n'exige pas l'unicité stricte, mais une réelle diversité de silhouettes.
    expect(new Set(looks.map((l) => l.hair)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(looks.map((l) => JSON.stringify(l))).size).toBe(seeds.length);
  });

  it("ne met jamais de barbe sur une coiffure féminine par défaut", () => {
    for (let i = 0; i < 200; i++) {
      const look = appearanceFromSeed(`persona-${i}`);
      if (["long", "bob", "ponytail"].includes(look.hair)) {
        expect(look.facialHair).toBe("none");
      }
    }
  });

  it("complète une apparence incomplète ou invalide", () => {
    const fallback = appearanceFromSeed("x");
    expect(normalizeAppearance(null, "x")).toEqual(fallback);
    expect(normalizeAppearance({ hair: "n'importe quoi" }, "x").hair).toBe(
      fallback.hair,
    );
    expect(normalizeAppearance({ hair: "bun" }, "x").hair).toBe("bun");
    expect(normalizeAppearance({ skinTone: -3 }, "x").skinTone).toBe(
      fallback.skinTone,
    );
  });
});

describe("builtinAvatarImage", () => {
  it("choisit un portrait local stable", () => {
    const look = appearanceFromSeed("Anna");
    expect(BUILTIN_AVATAR_IMAGES).toContain(builtinAvatarImage(look));
    expect(builtinAvatarImage(look)).toBe(builtinAvatarImage(look));
  });

  it("respecte un portrait choisi explicitement", () => {
    const look = { ...appearanceFromSeed("Anna"), portrait: 4 };
    expect(builtinAvatarImage(look)).toBe("/avatars/cast-05.jpg");
  });

  it("ne propose que des portraits compatibles avec le genre", () => {
    const feminineIndices = builtinAvatarIndicesForGender("feminine");
    const masculineIndices = builtinAvatarIndicesForGender("masculine");
    const feminine = new Set(feminineIndices.map((index) => BUILTIN_AVATAR_IMAGES[index]));
    const masculine = new Set(masculineIndices.map((index) => BUILTIN_AVATAR_IMAGES[index]));
    for (let portrait = 0; portrait < BUILTIN_AVATAR_IMAGES.length; portrait++) {
      const look = { ...appearanceFromSeed(`persona-${portrait}`), portrait };
      expect(feminine.has(builtinAvatarImage(look, "feminine"))).toBe(true);
      expect(masculine.has(builtinAvatarImage(look, "masculine"))).toBe(true);
    }
    expect(feminineIndices).toHaveLength(15);
    expect(masculineIndices).toHaveLength(16);
    expect(builtinAvatarIndicesForGender("neutral")).toHaveLength(32);
  });

  it("inclut la nouvelle série de portraits de métiers", () => {
    expect(BUILTIN_AVATAR_IMAGES.slice(-10)).toEqual(
      Array.from(
        { length: 10 },
        (_, index) => `/avatars/cast-${String(index + 23).padStart(2, "0")}.jpg`,
      ),
    );
  });

  it("conserve des silhouettes distinctes pour les coiffures principales", () => {
    const base: AvatarAppearance = {
      hair: "long",
      facialHair: "none",
      glasses: "none",
      hairColor: 0,
      skinTone: 0,
      outfit: 0,
    };
    const images = ["long", "bob", "short", "ponytail", "bald"].map((hair) =>
      builtinAvatarImage({ ...base, hair: hair as AvatarAppearance["hair"] }),
    );
    expect(new Set(images).size).toBeGreaterThanOrEqual(4);
  });
});
