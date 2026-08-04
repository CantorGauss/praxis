import type { AvatarVariant, DayPeriod, EmotionalState, Mood } from "../types";

function findVariant(
  variants: AvatarVariant[],
  mood: Mood | null,
  dayPeriod: DayPeriod | null,
): AvatarVariant | undefined {
  return variants
    .filter((v) => v.mood === mood && v.dayPeriod === dayPeriod)
    .sort((a, b) => b.priority - a.priority)[0];
}

/**
 * Ordre de sélection : mood+période, puis mood, puis période, puis neutre.
 * Retourne undefined si le jeu ne contient aucune variante utilisable —
 * l'interface bascule alors sur l'avatar généré intégré.
 */
export function resolveAvatar(
  variants: AvatarVariant[],
  state: Pick<EmotionalState, "mood">,
  period: DayPeriod,
): AvatarVariant | undefined {
  return (
    findVariant(variants, state.mood, period) ??
    findVariant(variants, state.mood, null) ??
    findVariant(variants, null, period) ??
    findVariant(variants, "neutral", null)
  );
}

// ---------------------------------------------------------------------------
// Avatar intégré : portrait SVG déterministe selon humeur et période.
// Aucune génération d'image à la volée ; le rendu est purement vectoriel.
// ---------------------------------------------------------------------------

/** Couleur d'accent par humeur, utilisée par l'interface (anneau, pastille). */
export const MOOD_COLORS: Record<Mood, string> = {
  neutral: "#9aa3b2",
  calm: "#5fb0a5",
  joyful: "#f0b344",
  curious: "#8f7ce8",
  surprised: "#ffc857",
  shocked: "#ff746c",
  concerned: "#e8985f",
  afraid: "#9c83e8",
  sad: "#6f8fc5",
  angry: "#e14f4f",
  disgusted: "#78a06b",
  tired: "#7d8bb0",
  annoyed: "#d96d5f",
};

type EyeStyle = "open" | "wide" | "happy" | "soft" | "tired" | "flat" | "worried";
type BrowStyle = "flat" | "raised" | "knit" | "worried";

type BuiltinFace = {
  eyes: EyeStyle;
  brows: BrowStyle;
  mouth: string; // fragment SVG complet de la bouche
  blush: number; // opacité des joues, 0 à 1
};

const LINE = "#b85a48";
const IRIS = "#4c7257";
const PUPIL = "#2b241f";
const LASH = "#3c2b1f";
const SKIN_SHADOW = "#d99f74";

function lineMouth(d: string): string {
  return `<path d="${d}" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
}

const MOOD_FACE: Record<Mood, BuiltinFace> = {
  neutral: {
    eyes: "open",
    brows: "flat",
    mouth: lineMouth("M 43.5 61 Q 50 64.5 56.5 61"),
    blush: 0.3,
  },
  calm: {
    eyes: "soft",
    brows: "flat",
    mouth: lineMouth("M 43.5 61 Q 50 66 56.5 61"),
    blush: 0.4,
  },
  joyful: {
    eyes: "happy",
    brows: "raised",
    mouth:
      `<path d="M 40.5 59 Q 50 71.5 59.5 59 Q 50 62.8 40.5 59 Z" fill="#a34433"/>` +
      `<path d="M 43 60.2 Q 50 62.8 57 60.2 Q 50 65 43 60.2 Z" fill="#ffffff" opacity="0.88"/>`,
    blush: 0.7,
  },
  curious: {
    eyes: "wide",
    brows: "raised",
    mouth: `<ellipse cx="50" cy="62.5" rx="2.4" ry="3" fill="#a34433"/>`,
    blush: 0.5,
  },
  surprised: {
    eyes: "wide",
    brows: "raised",
    mouth: `<ellipse cx="50" cy="62" rx="3.2" ry="4.2" fill="#a34433"/>`,
    blush: 0.35,
  },
  shocked: {
    eyes: "wide",
    brows: "worried",
    mouth: `<ellipse cx="50" cy="62" rx="4" ry="5" fill="#8f3b32"/>`,
    blush: 0.1,
  },
  concerned: {
    eyes: "worried",
    brows: "worried",
    mouth: lineMouth("M 43.5 63.5 Q 50 59.8 56.5 63.5"),
    blush: 0.2,
  },
  afraid: {
    eyes: "worried",
    brows: "worried",
    mouth: `<ellipse cx="50" cy="62.5" rx="2.8" ry="3.8" fill="#8f3b32"/>`,
    blush: 0.08,
  },
  sad: {
    eyes: "soft",
    brows: "worried",
    mouth: lineMouth("M 43.5 64 Q 50 59 56.5 64"),
    blush: 0.12,
  },
  angry: {
    eyes: "flat",
    brows: "knit",
    mouth: lineMouth("M 42.5 63.5 Q 50 60.5 57.5 63.5"),
    blush: 0.6,
  },
  disgusted: {
    eyes: "flat",
    brows: "knit",
    mouth: lineMouth("M 42.5 62 Q 47 59.5 50 62 Q 54 65 58 62"),
    blush: 0.15,
  },
  tired: {
    eyes: "tired",
    brows: "flat",
    mouth: lineMouth("M 44 62.8 Q 50 64.2 56 62.8"),
    blush: 0.15,
  },
  annoyed: {
    eyes: "flat",
    brows: "knit",
    mouth: lineMouth("M 43.5 63.2 Q 50 61.6 56.5 63.2"),
    blush: 0.2,
  },
};

const PERIOD_SKY: Record<DayPeriod, { from: string; to: string; deco: string }> = {
  morning: {
    from: "#ffeccb",
    to: "#fdd9a0",
    deco:
      `<circle cx="78" cy="19" r="11" fill="#ffd27a" opacity="0.35"/>` +
      `<circle cx="78" cy="19" r="6" fill="#ffcf66" opacity="0.9"/>`,
  },
  afternoon: {
    from: "#e3f1e6",
    to: "#c9e4d4",
    deco:
      `<ellipse cx="24" cy="17" rx="9" ry="4" fill="#ffffff" opacity="0.6"/>` +
      `<ellipse cx="31" cy="14" rx="6" ry="3.2" fill="#ffffff" opacity="0.5"/>`,
  },
  evening: {
    from: "#f9ddc3",
    to: "#e3b6d8",
    deco:
      `<circle cx="23" cy="21" r="9" fill="#f7b26b" opacity="0.4"/>` +
      `<circle cx="79" cy="13" r="1" fill="#ffffff" opacity="0.8"/>`,
  },
  night: {
    from: "#2a3254",
    to: "#171d36",
    deco: "",
  },
};

/** Une paire d'yeux symétrique autour des centres (42.5, 47) et (57.5, 47). */
function buildEyes(style: EyeStyle, skin: string, shadow = SKIN_SHADOW): string {
  const centers = [42.5, 57.5];
  const openEye = (cx: number, irisR: number, scleraRx: number, scleraRy: number) =>
    `<ellipse cx="${cx}" cy="47.2" rx="${scleraRx}" ry="${scleraRy}" fill="#fefaf4"/>` +
    `<circle cx="${cx}" cy="47.4" r="${irisR}" fill="${IRIS}"/>` +
    `<circle cx="${cx}" cy="47.4" r="${irisR * 0.48}" fill="${PUPIL}"/>` +
    `<circle cx="${cx + 0.9}" cy="46.4" r="0.75" fill="#ffffff"/>`;
  const lashLine = (cx: number, lift: number) =>
    `<path d="M ${cx - 4.2} ${45.6 - lift} Q ${cx} ${43.6 - lift} ${cx + 4.2} ${45.6 - lift}" stroke="${LASH}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;

  return centers
    .map((cx) => {
      switch (style) {
        case "open":
          return openEye(cx, 2.4, 3.9, 3.1) + lashLine(cx, 0);
        case "wide":
          return (
            openEye(cx, 2.8, 4.4, 3.8) +
            `<circle cx="${cx - 1.1}" cy="48.3" r="0.5" fill="#ffffff" opacity="0.8"/>` +
            lashLine(cx, 1.2)
          );
        case "worried":
          return (
            openEye(cx, 2.2, 3.9, 3.1) +
            lashLine(cx, 0) +
            `<path d="M ${cx - 3} 50.4 Q ${cx} 49.4 ${cx + 3} 50.4" stroke="${shadow}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`
          );
        case "happy":
          return `<path d="M ${cx - 4} 48 Q ${cx} 43 ${cx + 4} 48" stroke="${LASH}" stroke-width="2.3" fill="none" stroke-linecap="round"/>`;
        case "soft":
          return `<path d="M ${cx - 3.8} 46.6 Q ${cx} 49.6 ${cx + 3.8} 46.6" stroke="${LASH}" stroke-width="2.1" fill="none" stroke-linecap="round"/>`;
        case "tired":
          return (
            openEye(cx, 2.3, 3.9, 3.1) +
            `<path d="M ${cx - 4.2} 43.8 Q ${cx} 44.4 ${cx + 4.2} 43.8 L ${cx + 4.2} 46.2 Q ${cx} 45.6 ${cx - 4.2} 46.2 Z" fill="${skin}"/>` +
            `<path d="M ${cx - 4} 46 Q ${cx} 45.6 ${cx + 4} 46" stroke="${LASH}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
            `<path d="M ${cx - 3} 50.6 Q ${cx} 51.8 ${cx + 3} 50.6" stroke="${shadow}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`
          );
        case "flat":
          return (
            openEye(cx, 2.3, 3.9, 3.1) +
            `<path d="M ${cx - 4.2} 43.4 Q ${cx} 43.8 ${cx + 4.2} 43.4 L ${cx + 4.2} 45.6 Q ${cx} 45.2 ${cx - 4.2} 45.6 Z" fill="${skin}"/>` +
            `<path d="M ${cx - 4} 45.4 L ${cx + 4} 45.4" stroke="${LASH}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`
          );
      }
    })
    .join("");
}

function buildBrows(style: BrowStyle, color = "#4a3120"): string {
  const brow = (d: string) =>
    `<path d="${d}" stroke="${color}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`;
  switch (style) {
    case "flat":
      return brow("M 37.5 41.8 Q 42.5 40.4 47 41.8") + brow("M 53 41.8 Q 57.5 40.4 62.5 41.8");
    case "raised":
      return brow("M 37.5 39.8 Q 42.5 37.2 47 39.4") + brow("M 53 39.4 Q 57.5 37.2 62.5 39.8");
    case "knit":
      return brow("M 38 40 Q 43 41.4 47 43") + brow("M 62 40 Q 57 41.4 53 43");
    case "worried":
      return brow("M 37.5 42.6 Q 43 42.4 47 40.4") + brow("M 62.5 42.6 Q 57 42.4 53 40.4");
  }
}

// ---------------------------------------------------------------------------
// Différenciation des personnages : palettes stables dérivées de l'identifiant.
// Deux personas d'une même scène ne doivent pas se ressembler.
// ---------------------------------------------------------------------------

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

const HAIR_PALETTES: { from: string; to: string; light: string }[] = [
  { from: "#6a4630", to: "#3c2818", light: "#8a6242" },
  { from: "#2f2b2a", to: "#141212", light: "#5a5250" },
  { from: "#c98a4b", to: "#96602c", light: "#e0ac74" },
  { from: "#8d3f34", to: "#5c261f", light: "#b56154" },
  { from: "#9aa0a8", to: "#61666e", light: "#c2c7cd" },
  { from: "#5c4a7a", to: "#372c4c", light: "#8272a8" },
];

const SHIRT_PALETTES: { from: string; to: string }[] = [
  { from: "#8fa5c9", to: "#67799c" },
  { from: "#c9a08f", to: "#9c7367" },
  { from: "#8fc9a8", to: "#679c80" },
  { from: "#c9bf8f", to: "#9c9267" },
  { from: "#b98fc9", to: "#8c679c" },
  { from: "#8fc4c9", to: "#67989c" },
];

const SKIN_TONES: { light: string; base: string; neck: string; shadow: string }[] = [
  { light: "#ffdfba", base: "#f3bd90", neck: "#eab98d", shadow: "#d99f74" },
  { light: "#f7e0c8", base: "#e6c3a3", neck: "#ddb995", shadow: "#c39a78" },
  { light: "#e2b083", base: "#c98f5f", neck: "#c08a5c", shadow: "#a06d45" },
  { light: "#a9723f", base: "#8a5628", neck: "#84522a", shadow: "#6b3f1c" },
];

/** Teinte d'accent stable d'une persona, pour distinguer ses bulles. */
export function personaAccent(seed: string): string {
  const hue = hashSeed(seed) % 360;
  return `hsl(${hue} 62% 56%)`;
}

// ---------------------------------------------------------------------------
// Apparence : la couleur seule ne suffit pas à distinguer des personnages.
// La silhouette — coiffure, pilosité, lunettes — porte l'essentiel de la
// reconnaissance, et c'est elle qui rend un personnage masculin ou féminin.
// ---------------------------------------------------------------------------

export const HAIR_STYLES = [
  "long",
  "bob",
  "short",
  "ponytail",
  "bun",
  "curly",
  "bald",
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const FACIAL_HAIRS = ["none", "moustache", "goatee", "beard"] as const;
export type FacialHair = (typeof FACIAL_HAIRS)[number];

export const GLASSES_STYLES = ["none", "round", "square"] as const;
export type GlassesStyle = (typeof GLASSES_STYLES)[number];

export type AvatarAppearance = {
  hair: HairStyle;
  facialHair: FacialHair;
  glasses: GlassesStyle;
  hairColor: number;
  skinTone: number;
  outfit: number;
  /** Portrait éditorial choisi ; absent dans les anciennes données. */
  portrait?: number;
};

/**
 * Portraits éditoriaux intégrés. Le bouton « Visage » parcourt la sélection
 * compatible avec le genre grammatical du personnage.
 */
export const BUILTIN_AVATAR_IMAGES = [
  "/avatars/cast-01.jpg",
  "/avatars/cast-02.jpg",
  "/avatars/cast-03.jpg",
  "/avatars/cast-04.jpg",
  "/avatars/cast-05.jpg",
  "/avatars/cast-06.jpg",
  "/avatars/cast-07.jpg",
  "/avatars/cast-08.jpg",
  "/avatars/cast-09.jpg",
  "/avatars/cast-10.jpg",
  "/avatars/cast-11.jpg",
  "/avatars/cast-12.jpg",
  "/avatars/cast-13.jpg",
  "/avatars/cast-14.jpg",
  "/avatars/cast-15.jpg",
  "/avatars/cast-16.jpg",
  "/avatars/cast-17.jpg",
  "/avatars/cast-18.jpg",
  "/avatars/cast-19.jpg",
  "/avatars/cast-20.jpg",
  "/avatars/cast-21.jpg",
  "/avatars/cast-22.jpg",
  "/avatars/cast-23.jpg",
  "/avatars/cast-24.jpg",
  "/avatars/cast-25.jpg",
  "/avatars/cast-26.jpg",
  "/avatars/cast-27.jpg",
  "/avatars/cast-28.jpg",
  "/avatars/cast-29.jpg",
  "/avatars/cast-30.jpg",
  "/avatars/cast-31.jpg",
  "/avatars/cast-32.jpg",
] as const;

export type AvatarGender = "feminine" | "masculine" | "neutral";

const AVATAR_INDICES_BY_GENDER: Record<AvatarGender, readonly number[]> = {
  feminine: [0, 2, 4, 6, 7, 8, 12, 13, 14, 20, 22, 24, 26, 28, 30],
  masculine: [1, 3, 5, 9, 10, 11, 15, 16, 17, 18, 21, 23, 25, 27, 29, 31],
  neutral: [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  ],
};

export function builtinAvatarIndicesForGender(
  gender: AvatarGender,
): readonly number[] {
  return AVATAR_INDICES_BY_GENDER[gender];
}

const AVATARS_BY_HAIR: Record<HairStyle, readonly number[]> = {
  long: [0],
  bob: [2],
  short: [1, 3, 5],
  ponytail: [4],
  bun: [4],
  curly: [0, 3, 5],
  bald: [1],
};

/** Choisit un portrait stable, en gardant la coiffure comme premier repère. */
export function builtinAvatarImage(
  appearance: AvatarAppearance | string = "",
  gender: AvatarGender = "neutral",
): (typeof BUILTIN_AVATAR_IMAGES)[number] {
  const look =
    typeof appearance === "string"
      ? appearanceFromSeed(appearance)
      : appearance;
  const genderCandidates = builtinAvatarIndicesForGender(gender);
  let portrait: number;
  if (
    typeof look.portrait === "number" &&
    Number.isInteger(look.portrait) &&
    look.portrait >= 0
  ) {
    portrait = look.portrait % BUILTIN_AVATAR_IMAGES.length;
  } else {
    const candidates = AVATARS_BY_HAIR[look.hair];
    const detailSeed =
      look.hairColor * 31 +
      look.skinTone * 17 +
      look.outfit * 13 +
      GLASSES_STYLES.indexOf(look.glasses) * 7 +
      FACIAL_HAIRS.indexOf(look.facialHair) * 5;
    portrait = candidates[detailSeed % candidates.length];
  }
  const compatiblePortrait = genderCandidates.includes(portrait)
    ? portrait
    : genderCandidates[portrait % genderCandidates.length];
  return BUILTIN_AVATAR_IMAGES[compatiblePortrait];
}

/** Portrait suivant du même genre, pour le bouton « Visage ». */
export function nextBuiltinAvatarPortrait(
  appearance: AvatarAppearance | string,
  gender: AvatarGender,
): number {
  const currentImage = builtinAvatarImage(appearance, gender);
  const currentPortrait = BUILTIN_AVATAR_IMAGES.indexOf(currentImage);
  const candidates = builtinAvatarIndicesForGender(gender);
  const position = candidates.indexOf(currentPortrait);
  return candidates[(position + 1) % candidates.length];
}

export const HAIR_STYLE_LABELS: Record<HairStyle, string> = {
  long: "Cheveux longs",
  bob: "Carré",
  short: "Courts",
  ponytail: "Queue de cheval",
  bun: "Chignon",
  curly: "Bouclés",
  bald: "Rasés",
};

export const FACIAL_HAIR_LABELS: Record<FacialHair, string> = {
  none: "Aucune",
  moustache: "Moustache",
  goatee: "Bouc",
  beard: "Barbe",
};

export const GLASSES_LABELS: Record<GlassesStyle, string> = {
  none: "Aucunes",
  round: "Rondes",
  square: "Rectangulaires",
};

/**
 * Apparence déduite de l'identifiant : deux personas créées sans réglage
 * doivent déjà se distinguer, sans rien demander à l'utilisateur.
 */
export function appearanceFromSeed(seed: string): AvatarAppearance {
  const h = hashSeed(seed);
  // Les coiffures longues vont plutôt avec l'absence de pilosité, et
  // inversement : sans cette corrélation, on obtient surtout du bruit.
  const hair = HAIR_STYLES[h % HAIR_STYLES.length];
  const feminine = hair === "long" || hair === "bob" || hair === "ponytail";
  const facialHair = feminine
    ? "none"
    : FACIAL_HAIRS[(h >>> 5) % FACIAL_HAIRS.length];
  return {
    hair,
    facialHair,
    glasses: GLASSES_STYLES[(h >>> 11) % GLASSES_STYLES.length],
    hairColor: h % HAIR_PALETTES.length,
    skinTone: (h >>> 7) % SKIN_TONES.length,
    outfit: (h >>> 3) % SHIRT_PALETTES.length,
    // Les rôles spéciaux restent des choix volontaires : une fiche vierge
    // reçoit l'un des portraits généralistes.
    portrait: h % 18,
  };
}

/** Complète une apparence partielle ou invalide venue de la base. */
export function normalizeAppearance(
  value: unknown,
  seed: string,
): AvatarAppearance {
  const fallback = appearanceFromSeed(seed);
  if (!value || typeof value !== "object") return fallback;
  const v = value as Partial<AvatarAppearance>;
  const pick = <T extends string>(candidate: unknown, allowed: readonly T[], def: T): T =>
    allowed.includes(candidate as T) ? (candidate as T) : def;
  const index = (candidate: unknown, length: number, def: number) =>
    typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0
      ? candidate % length
      : def;
  return {
    hair: pick(v.hair, HAIR_STYLES, fallback.hair),
    facialHair: pick(v.facialHair, FACIAL_HAIRS, fallback.facialHair),
    glasses: pick(v.glasses, GLASSES_STYLES, fallback.glasses),
    hairColor: index(v.hairColor, HAIR_PALETTES.length, fallback.hairColor),
    skinTone: index(v.skinTone, SKIN_TONES.length, fallback.skinTone),
    outfit: index(v.outfit, SHIRT_PALETTES.length, fallback.outfit),
    portrait: index(
      v.portrait,
      BUILTIN_AVATAR_IMAGES.length,
      fallback.portrait ?? 0,
    ),
  };
}

export const PALETTE_SIZES = {
  hairColor: HAIR_PALETTES.length,
  skinTone: SKIN_TONES.length,
  outfit: SHIRT_PALETTES.length,
} as const;

/** Chevelure derrière le buste : c'est elle qui dessine la silhouette. */
function buildHairBack(style: HairStyle): string {
  switch (style) {
    case "long":
      return `<path d="M 26 92 Q 21 62 25 42 Q 29 18 50 17 Q 71 18 75 42 Q 79 62 74 92 Q 62 85 50 86 Q 38 85 26 92 Z" fill="url(#hair)"/>`;
    case "bob":
      return `<path d="M 28 70 Q 24 58 26 42 Q 30 18 50 17 Q 70 18 74 42 Q 76 58 72 70 Q 62 64 50 64 Q 38 64 28 70 Z" fill="url(#hair)"/>`;
    case "ponytail":
      return (
        `<path d="M 30 60 Q 27 48 28 42 Q 31 19 50 18 Q 69 19 72 42 Q 73 48 70 60 Q 60 56 50 56 Q 40 56 30 60 Z" fill="url(#hair)"/>` +
        `<path d="M 70 40 Q 84 46 82 62 Q 81 74 74 78 Q 79 66 76 56 Q 74 48 68 46 Z" fill="url(#hair)"/>`
      );
    case "bun":
      return (
        `<circle cx="50" cy="16" r="9" fill="url(#hair)"/>` +
        `<path d="M 31 52 Q 28 26 50 22 Q 72 26 69 52 Q 62 44 50 44 Q 38 44 31 52 Z" fill="url(#hair)"/>`
      );
    case "curly":
      return (
        `<circle cx="32" cy="34" r="11" fill="url(#hair)"/>` +
        `<circle cx="50" cy="24" r="13" fill="url(#hair)"/>` +
        `<circle cx="68" cy="34" r="11" fill="url(#hair)"/>` +
        `<circle cx="30" cy="48" r="9" fill="url(#hair)"/>` +
        `<circle cx="70" cy="48" r="9" fill="url(#hair)"/>`
      );
    case "short":
    case "bald":
      return "";
  }
}

/** Mèches et calotte devant le visage. */
function buildHairFront(style: HairStyle, light: string): string {
  const strand = (d: string) =>
    `<path d="${d}" stroke="${light}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.55"/>`;
  switch (style) {
    case "long":
    case "bob":
      return (
        `<path d="M 31.5 45 Q 29.5 24 50 21.5 Q 70.5 24 68.5 45 Q 66.5 32.5 56 30 Q 58.5 33.5 56.5 36.5 Q 47.5 27.5 38.5 32 Q 33 35 31.5 45 Z" fill="url(#hair)"/>` +
        strand("M 34 31 Q 42 26 52 27.5")
      );
    case "ponytail":
      return (
        `<path d="M 32 44 Q 30 24 50 21 Q 70 24 68 44 Q 64 32 50 31 Q 38 31 32 44 Z" fill="url(#hair)"/>` +
        strand("M 36 30 Q 45 25 56 28")
      );
    case "bun":
      return (
        `<path d="M 32 44 Q 31 25 50 22 Q 69 25 68 44 Q 62 33 50 33 Q 38 33 32 44 Z" fill="url(#hair)"/>` +
        strand("M 37 31 Q 45 27 55 29")
      );
    case "short":
      return (
        `<path d="M 31.5 46 Q 30 23 50 20.5 Q 70 23 68.5 46 Q 65 34 58 32.5 Q 48 30 40 34 Q 34 37 31.5 46 Z" fill="url(#hair)"/>` +
        strand("M 36 33 Q 45 28 57 31")
      );
    case "curly":
      return `<path d="M 33 42 Q 33 26 50 24 Q 67 26 67 42 Q 60 34 50 34 Q 40 34 33 42 Z" fill="url(#hair)"/>`;
    case "bald":
      // Ni calotte ni mèche : juste une ombre légère aux tempes.
      return `<path d="M 33 42 Q 36 34 42 31" stroke="${light}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.28"/>`;
  }
}

/** Pilosité : le marqueur le plus lisible d'un personnage masculin. */
function buildFacialHair(style: FacialHair, color: string): string {
  const moustache =
    `<path d="M 43 58.4 Q 46.5 56.4 50 57.8 Q 53.5 56.4 57 58.4 Q 53.5 60.4 50 59.2 Q 46.5 60.4 43 58.4 Z" fill="${color}"/>`;
  switch (style) {
    case "none":
      return "";
    case "moustache":
      return moustache;
    case "goatee":
      return (
        moustache +
        `<path d="M 45.5 64.5 Q 50 63.5 54.5 64.5 Q 54 70.5 50 71.5 Q 46 70.5 45.5 64.5 Z" fill="${color}"/>`
      );
    case "beard":
      return (
        `<path d="M 32.5 50 Q 34 68 50 70.5 Q 66 68 67.5 50 Q 67 62 58 65 Q 50 67 42 65 Q 33 62 32.5 50 Z" fill="${color}"/>` +
        moustache
      );
  }
}

function buildGlasses(style: GlassesStyle): string {
  if (style === "none") return "";
  const frame = "#3b3a38";
  const lens =
    style === "round"
      ? `<circle cx="42.5" cy="47.2" r="6.2" fill="#ffffff" fill-opacity="0.2" stroke="${frame}" stroke-width="1.5"/>` +
        `<circle cx="57.5" cy="47.2" r="6.2" fill="#ffffff" fill-opacity="0.2" stroke="${frame}" stroke-width="1.5"/>`
      : `<rect x="36" y="42.6" width="13" height="9.2" rx="2" fill="#ffffff" fill-opacity="0.2" stroke="${frame}" stroke-width="1.5"/>` +
        `<rect x="51" y="42.6" width="13" height="9.2" rx="2" fill="#ffffff" fill-opacity="0.2" stroke="${frame}" stroke-width="1.5"/>`;
  return (
    lens +
    `<path d="M 48.7 47.2 L 51.3 47.2" stroke="${frame}" stroke-width="1.5"/>` +
    `<path d="M 36.2 46 L 32.5 47.5" stroke="${frame}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M 63.8 46 L 67.5 47.5" stroke="${frame}" stroke-width="1.5" stroke-linecap="round"/>`
  );
}

/** Construit un data-URI SVG stable pour l'humeur, la période et la persona. */
export function builtinAvatarSvg(
  mood: Mood,
  period: DayPeriod,
  appearance: AvatarAppearance | string = "",
): string {
  const look =
    typeof appearance === "string"
      ? appearanceFromSeed(appearance)
      : appearance;
  const face = MOOD_FACE[mood] ?? MOOD_FACE.neutral;
  const sky = PERIOD_SKY[period];
  const night = period === "night";
  const hair = HAIR_PALETTES[look.hairColor % HAIR_PALETTES.length];
  const shirt = SHIRT_PALETTES[look.outfit % SHIRT_PALETTES.length];
  const skin = SKIN_TONES[look.skinTone % SKIN_TONES.length];
  const skinBase = skin.base;

  const defs =
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${sky.from}"/><stop offset="1" stop-color="${sky.to}"/>` +
    `</linearGradient>` +
    `<radialGradient id="skin" cx="0.42" cy="0.36" r="0.85">` +
    `<stop offset="0" stop-color="${skin.light}"/><stop offset="1" stop-color="${skinBase}"/>` +
    `</radialGradient>` +
    `<linearGradient id="hair" x1="0" y1="0" x2="0.3" y2="1">` +
    `<stop offset="0" stop-color="${hair.from}"/><stop offset="1" stop-color="${hair.to}"/>` +
    `</linearGradient>` +
    `<linearGradient id="shirt" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${shirt.from}"/><stop offset="1" stop-color="${shirt.to}"/>` +
    `</linearGradient>` +
    `<clipPath id="round"><circle cx="50" cy="50" r="50"/></clipPath>` +
    `</defs>`;

  // Chevelure arrière, buste, cou, visage, puis mèches avant.
  const character =
    buildHairBack(look.hair) +
    `<path d="M 22 100 Q 24 76 50 74 Q 76 76 78 100 Z" fill="url(#shirt)"/>` +
    `<rect x="45" y="60" width="10" height="12" rx="4" fill="${skin.neck}"/>` +
    `<ellipse cx="50" cy="48" rx="18" ry="20" fill="url(#skin)"/>` +
    buildHairFront(look.hair, hair.light);

  const blush =
    face.blush > 0
      ? `<ellipse cx="36.5" cy="55" rx="3.4" ry="1.9" fill="#f2a48c" opacity="${face.blush}"/>` +
        `<ellipse cx="63.5" cy="55" rx="3.4" ry="1.9" fill="#f2a48c" opacity="${face.blush}"/>`
      : "";

  const nose = `<path d="M 49.6 53 Q 51 55.3 49.6 56.4" stroke="${skin.shadow}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;

  // La pilosité passe par-dessus la bouche, les lunettes par-dessus les yeux.
  const features =
    buildBrows(face.brows, hair.to) +
    buildEyes(face.eyes, skinBase, skin.shadow) +
    nose +
    blush +
    face.mouth +
    buildFacialHair(look.facialHair, hair.to) +
    buildGlasses(look.glasses);

  // La nuit, un voile bleuté unifie l'éclairage, puis lune et étoiles par-dessus.
  const nightLayer = night
    ? `<circle cx="50" cy="50" r="50" fill="#1b2342" opacity="0.22"/>` +
      `<circle cx="80" cy="16" r="7" fill="#f2e6c4"/><circle cx="83.5" cy="13.5" r="6" fill="#20284a"/>` +
      `<circle cx="20" cy="18" r="1.1" fill="#e8ddb0" opacity="0.9"/>` +
      `<circle cx="68" cy="10" r="0.8" fill="#e8ddb0" opacity="0.8"/>` +
      `<circle cx="88" cy="32" r="0.7" fill="#e8ddb0" opacity="0.7"/>` +
      `<circle cx="30" cy="9" r="0.7" fill="#e8ddb0" opacity="0.7"/>`
    : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    defs +
    `<g clip-path="url(#round)">` +
    `<rect width="100" height="100" fill="url(#bg)"/>` +
    sky.deco +
    character +
    features +
    nightLayer +
    `</g>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
