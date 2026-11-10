// Cartes de personnage au format SillyTavern (« Character Card » V1, V2, V3).
//
// Une carte est un JSON, livré tel quel ou caché dans une image PNG : un
// fragment tEXt « chara » porte la V2 en base64, un fragment « ccv3 » la V3.
// Ce module ne touche ni à la base ni au disque : il lit et écrit des octets
// et des objets, ce qui le rend testable hors de Tauri.
//
// Les deux modèles ne se recouvrent pas tout à fait. Une carte SillyTavern
// décrit un personnage *et* une scène (message d'accueil, scénario, exemples
// de dialogue) ; Praxis sépare les deux. À l'import, on garde ce qui décrit le
// personnage. À l'export, les réglages propres à Praxis voyagent dans
// `extensions.praxis`, que la spécification demande de conserver : une carte
// qui fait l'aller-retour revient intacte.

import type { Gender, Persona } from "../types";
import type { AvatarAppearance } from "./avatar";

/** Champs communs aux V2 et V3 (la V1 en est un sous-ensemble à plat). */
export type CharacterCardData = {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;
  extensions: Record<string, unknown>;
  // V3 uniquement.
  group_only_greetings?: string[];
  creation_date?: number;
  modification_date?: number;
};

export type CharacterCardV2 = {
  spec: "chara_card_v2";
  spec_version: "2.0";
  data: CharacterCardData;
};

export type CharacterCardV3 = {
  spec: "chara_card_v3";
  spec_version: "3.0";
  data: CharacterCardData;
};

/** Ce que Praxis range dans `extensions.praxis` pour un aller-retour sans perte. */
export type PraxisCardExtension = {
  version: 1;
  tagline: string | null;
  traits: string[];
  gender: Gender;
  temperature: number;
  topP: number | null;
  maxOutputTokens: number | null;
  appearance: AvatarAppearance | null;
};

/** Personnage prêt à créer, sans identifiant ni réglages de modèle. */
export type CardPersonaDraft = {
  name: string;
  description: string | null;
  systemPrompt: string;
  stableTraits: string[];
  gender: Gender;
  temperature: number | null;
  topP: number | null;
  maxOutputTokens: number | null;
  appearance: unknown;
};

const PRAXIS_EXTENSION = "praxis";

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Ramène n'importe quelle version de carte aux champs communs. Retourne null
 * si l'objet n'a rien d'une carte (pas de nom, ou ni `spec` ni champs V1).
 */
export function normalizeCard(raw: unknown): CharacterCardData | null {
  const root = record(raw);
  const spec = str(root.spec);
  let source: Record<string, unknown>;
  if (spec === "chara_card_v2" || spec === "chara_card_v3") {
    source = record(root.data);
  } else if (
    // V1 : champs à plat, sans `spec`. Le nom seul ne suffit pas à
    // distinguer une carte d'un JSON quelconque.
    typeof root.name === "string" &&
    (typeof root.description === "string" ||
      typeof root.personality === "string" ||
      typeof root.first_mes === "string")
  ) {
    source = root;
  } else {
    return null;
  }
  const name = str(source.name).trim();
  if (!name) return null;
  const card: CharacterCardData = {
    name,
    description: str(source.description),
    personality: str(source.personality),
    scenario: str(source.scenario),
    first_mes: str(source.first_mes),
    mes_example: str(source.mes_example),
    creator_notes: str(source.creator_notes),
    system_prompt: str(source.system_prompt),
    post_history_instructions: str(source.post_history_instructions),
    alternate_greetings: strList(source.alternate_greetings),
    tags: strList(source.tags),
    creator: str(source.creator),
    character_version: str(source.character_version),
    extensions: record(source.extensions),
  };
  return card;
}

/** Vrai si le JSON ressemble à une carte SillyTavern (et non à une distribution Praxis). */
export function looksLikeCard(raw: unknown): boolean {
  return normalizeCard(raw) !== null;
}

/**
 * Remplace les macros de SillyTavern. `{{char}}` devient le nom du
 * personnage ; `{{user}}` le nom de l'utilisateur, figé à l'import — Praxis
 * présente déjà l'utilisateur au modèle par son nom.
 */
export function replaceMacros(text: string, charName: string, userName: string): string {
  return text
    .replace(/\{\{\s*char\s*\}\}|<BOT>/gi, charName)
    .replace(/\{\{\s*user\s*\}\}|<USER>/gi, userName);
}

function clean(text: string, charName: string, userName: string): string {
  return replaceMacros(text.replace(/\r\n?/g, "\n"), charName, userName)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Une « personnalité » courte faite de mots séparés par des virgules
 * (« curieuse, franche, rancunière ») devient une liste de traits ; une
 * phrase rédigée reste du texte et rejoint le caractère.
 */
export function traitsFromPersonality(personality: string): string[] | null {
  const text = personality.trim();
  if (!text || text.length > 200 || text.includes("\n")) return null;
  const parts = text
    .split(/[,;]/)
    .map((p) => p.trim().replace(/[.!]+$/, "").trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  // Au-delà de quatre mots, ce n'est plus un trait mais une proposition.
  if (parts.some((p) => p.split(/\s+/).length > 4)) return null;
  return parts.slice(0, 8);
}

const FEMININE = /\b(she|her|hers|herself|elle|elles)\b/gi;
const MASCULINE = /\b(he|him|his|himself|il|ils)\b/gi;

/**
 * Devine l'accord grammatical d'après les pronoms du texte. Une carte ne dit
 * pas le genre ; sans cela, tous les personnages importés seraient neutres et
 * s'accorderaient au hasard en français.
 */
export function guessGender(text: string): Gender {
  const f = text.match(FEMININE)?.length ?? 0;
  const m = text.match(MASCULINE)?.length ?? 0;
  if (f >= 2 && f >= m * 2) return "feminine";
  if (m >= 2 && m >= f * 2) return "masculine";
  return "neutral";
}

function isGender(value: unknown): value is Gender {
  return value === "feminine" || value === "masculine" || value === "neutral";
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Traduit une carte en personnage Praxis. Retourne null si la carte ne donne
 * de quoi écrire aucun caractère.
 */
export function cardToPersona(
  card: CharacterCardData,
  userName: string,
): CardPersonaDraft | null {
  const name = card.name.trim();
  const praxis = record(card.extensions[PRAXIS_EXTENSION]);
  const fromPraxis = Object.keys(praxis).length > 0;

  const description = clean(card.description, name, userName);
  const personality = clean(card.personality, name, userName);
  const praxisTraits = strList(praxis.traits);
  const listedTraits = fromPraxis ? null : traitsFromPersonality(personality);

  // Le caractère : la description, et la personnalité quand elle est rédigée.
  // Scénario, message d'accueil et exemples de dialogue décrivent une scène,
  // que Praxis écrit à chaque conversation : ils ne sont pas repris.
  const paragraphs = [description];
  if (personality && !listedTraits && !(fromPraxis && praxisTraits.length > 0)) {
    paragraphs.push(personality);
  }
  let systemPrompt = paragraphs.filter(Boolean).join("\n\n");
  if (!systemPrompt) systemPrompt = clean(card.scenario, name, userName);
  if (!systemPrompt) return null;

  const notes = clean(card.creator_notes, name, userName);
  const tagline =
    typeof praxis.tagline === "string"
      ? praxis.tagline.trim() || null
      : // Une note d'auteur courte tient lieu de description ; les longues
        // sont des crédits ou des modes d'emploi.
        notes && notes.length <= 120 && !notes.includes("\n")
        ? notes
        : null;

  return {
    name,
    description: tagline,
    systemPrompt,
    stableTraits: fromPraxis ? praxisTraits : (listedTraits ?? []),
    gender: isGender(praxis.gender)
      ? praxis.gender
      : guessGender(`${description}\n${personality}\n${card.first_mes}`),
    temperature: finiteOrNull(praxis.temperature),
    topP: finiteOrNull(praxis.topP),
    maxOutputTokens: finiteOrNull(praxis.maxOutputTokens),
    appearance: praxis.appearance ?? null,
  };
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

/** Données de carte communes aux deux versions écrites. */
function cardData(persona: Persona, now: Date): CharacterCardData {
  const extension: PraxisCardExtension = {
    version: 1,
    tagline: persona.description,
    traits: persona.stableTraits,
    gender: persona.gender,
    temperature: persona.temperature,
    topP: persona.topP,
    maxOutputTokens: persona.maxOutputTokens,
    appearance: persona.avatarStyle,
  };
  const timestamp = Math.floor(now.getTime() / 1000);
  return {
    name: persona.name,
    description: persona.systemPrompt,
    personality: persona.stableTraits.join(", "),
    scenario: "",
    first_mes: "",
    mes_example: "",
    creator_notes: persona.description ?? "",
    system_prompt: "",
    post_history_instructions: "",
    alternate_greetings: [],
    tags: [],
    creator: "",
    character_version: "",
    extensions: { [PRAXIS_EXTENSION]: extension },
    creation_date: Math.floor(new Date(persona.createdAt).getTime() / 1000) || timestamp,
    modification_date: timestamp,
  };
}

export function personaToCardV2(persona: Persona, now = new Date()): CharacterCardV2 {
  const {
    group_only_greetings: _g,
    creation_date: _c,
    modification_date: _m,
    ...data
  } = cardData(persona, now);
  return { spec: "chara_card_v2", spec_version: "2.0", data };
}

export function personaToCardV3(persona: Persona, now = new Date()): CharacterCardV3 {
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: { ...cardData(persona, now), group_only_greetings: [] },
  };
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((b, i) => bytes[i] === b)
  );
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type PngChunk = { type: string; data: Uint8Array };

function readChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new Error("Not a PNG file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) break; // fichier tronqué : on garde ce qui précède
    chunks.push({ type, data: bytes.subarray(start, end) });
    offset = end + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

function writeChunks(chunks: PngChunk[]): Uint8Array {
  const total =
    PNG_SIGNATURE.length + chunks.reduce((n, c) => n + 12 + c.data.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(PNG_SIGNATURE, 0);
  let offset = PNG_SIGNATURE.length;
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.data.length);
    const typed = new Uint8Array(4 + chunk.data.length);
    for (let i = 0; i < 4; i++) typed[i] = chunk.type.charCodeAt(i);
    typed.set(chunk.data, 4);
    out.set(typed, offset + 4);
    view.setUint32(offset + 8 + chunk.data.length, crc32(typed));
    offset += 12 + chunk.data.length;
  }
  return out;
}

const latin1 = new TextDecoder("latin1");
const utf8 = new TextDecoder("utf-8");

/** Fragments texte du PNG (tEXt, et iTXt non compressés), par mot-clé. */
function textChunks(chunks: PngChunk[]): Map<string, string> {
  const texts = new Map<string, string>();
  for (const { type, data } of chunks) {
    const sep = data.indexOf(0);
    if (sep < 0) continue;
    const keyword = latin1.decode(data.subarray(0, sep)).toLowerCase();
    if (type === "tEXt") {
      texts.set(keyword, latin1.decode(data.subarray(sep + 1)));
    } else if (type === "iTXt") {
      // mot-clé \0 compression méthode langue \0 traduction \0 texte
      if (data[sep + 1] !== 0) continue; // compressé : non pris en charge
      const langEnd = data.indexOf(0, sep + 3);
      const transEnd = langEnd < 0 ? -1 : data.indexOf(0, langEnd + 1);
      if (transEnd < 0) continue;
      texts.set(keyword, utf8.decode(data.subarray(transEnd + 1)));
    }
  }
  return texts;
}

export function base64ToUtf8(value: string): string {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return utf8.decode(bytes);
}

export function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/**
 * Extrait la carte d'une image. La V3 (« ccv3 ») prime, comme dans
 * SillyTavern ; la V2 (« chara ») sert de repli. Retourne null si l'image ne
 * contient aucune carte lisible.
 */
export function readCardFromPng(bytes: Uint8Array): CharacterCardData | null {
  const texts = textChunks(readChunks(bytes));
  for (const keyword of ["ccv3", "chara"]) {
    const encoded = texts.get(keyword);
    if (!encoded) continue;
    try {
      const card = normalizeCard(JSON.parse(base64ToUtf8(encoded)));
      if (card) return card;
    } catch {
      // Fragment illisible : on tente le suivant.
    }
  }
  return null;
}

function textChunk(keyword: string, text: string): PngChunk {
  const data = new Uint8Array(keyword.length + 1 + text.length);
  for (let i = 0; i < keyword.length; i++) data[i] = keyword.charCodeAt(i);
  data[keyword.length] = 0;
  // Le texte est du base64 : de l'ASCII pur, donc du latin-1 valide.
  for (let i = 0; i < text.length; i++) data[keyword.length + 1 + i] = text.charCodeAt(i);
  return { type: "tEXt", data };
}

/**
 * Écrit la carte dans une image PNG, en V2 et en V3 à la fois, comme le fait
 * SillyTavern : les outils anciens lisent « chara », les récents « ccv3 ».
 * Une carte déjà présente dans l'image est remplacée.
 */
export function writeCardToPng(
  png: Uint8Array,
  v2: CharacterCardV2,
  v3: CharacterCardV3,
): Uint8Array {
  const chunks = readChunks(png).filter((chunk) => {
    if (chunk.type !== "tEXt" && chunk.type !== "iTXt") return true;
    const sep = chunk.data.indexOf(0);
    const keyword = latin1.decode(chunk.data.subarray(0, sep < 0 ? 0 : sep)).toLowerCase();
    return keyword !== "chara" && keyword !== "ccv3";
  });
  const iend = chunks.findIndex((c) => c.type === "IEND");
  const insertAt = iend < 0 ? chunks.length : iend;
  chunks.splice(
    insertAt,
    0,
    textChunk("chara", utf8ToBase64(JSON.stringify(v2))),
    textChunk("ccv3", utf8ToBase64(JSON.stringify(v3))),
  );
  if (iend < 0) chunks.push({ type: "IEND", data: new Uint8Array(0) });
  return writeChunks(chunks);
}

/** Nom de fichier sûr pour l'export d'une carte. */
export function cardFileName(name: string, extension: "png" | "json"): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return `${base || "character"}.${extension}`;
}
