// Connaissances d'un personnage : le « lorebook » de SillyTavern.
//
// Une entrée associe des mots-clés à un texte. Quand l'un des mots-clés
// apparaît dans les dernières répliques, le texte est glissé dans le prompt
// du personnage ; une entrée « toujours » y est en permanence. Le personnage
// connaît ainsi tout son univers sans que tout pèse à chaque réplique.
//
// Les connaissances appartiennent au personnage : elles ne vont que dans son
// prompt. En scène de groupe, les autres ne savent pas ce qu'il sait.
//
// Pris en charge : mots-clés (mots entiers, sans casse ni accents par
// défaut), clés secondaires avec leur logique (ET un / PAS tous / AUCUN /
// ET tous), entrées constantes, désactivées, ordre d'insertion, profondeur de
// lecture et budget du livre. Le reste (regex, probabilité, récursion,
// position d'insertion…) n'agit pas en jeu mais est conservé tel quel pour
// l'export : une carte qui fait l'aller-retour garde son lorebook intact.

import { replaceMacros } from "./characterCard";

/** Logique des clés secondaires, numérotée comme dans SillyTavern. */
export type SecondaryLogic = "andAny" | "notAll" | "notAny" | "andAll";

const LOGIC_BY_CODE: Record<number, SecondaryLogic> = {
  0: "andAny",
  1: "notAll",
  2: "notAny",
  3: "andAll",
};
const CODE_BY_LOGIC: Record<SecondaryLogic, number> = {
  andAny: 0,
  notAll: 1,
  notAny: 2,
  andAll: 3,
};

export type LoreEntry = {
  /** Identifiant stable dans le livre, pour l'interface. */
  id: string;
  /** Titre libre, pour s'y retrouver ; jamais montré au modèle. */
  comment: string;
  keys: string[];
  /** Ne compte que si `selective`. */
  secondaryKeys: string[];
  selective: boolean;
  secondaryLogic: SecondaryLogic;
  content: string;
  /** Toujours dans le prompt, sans attendre un mot-clé. */
  constant: boolean;
  enabled: boolean;
  caseSensitive: boolean;
  /** Plus grand = prioritaire quand la place manque, et placé plus bas. */
  insertionOrder: number;
  /** Champs SillyTavern sans effet ici, rendus tels quels à l'export. */
  extra: Record<string, unknown>;
};

export type Lorebook = {
  version: 1;
  name: string;
  description: string;
  /** Répliques relues pour chercher les mots-clés ; null = défaut de Praxis. */
  scanDepth: number | null;
  /** Plafond de jetons pour les connaissances ; null = défaut de Praxis. */
  tokenBudget: number | null;
  entries: LoreEntry[];
  /** Champs du livre sans effet ici (récursion, extensions…), conservés. */
  extra: Record<string, unknown>;
};

/** Répliques relues par défaut : la scène se joue à plusieurs voix. */
export const DEFAULT_SCAN_DEPTH = 4;
/** Plafond par défaut, et part maximale du contexte, des connaissances. */
export const DEFAULT_LORE_TOKENS = 800;
export const LORE_CONTEXT_RATIO = 0.15;

// ---------------------------------------------------------------------------
// Lecture tolérante
// ---------------------------------------------------------------------------

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strList(value: unknown): string[] {
  if (typeof value === "string") return splitKeys(value);
  return Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

/** Mots-clés saisis à la main : séparés par des virgules. */
export function splitKeys(text: string): string[] {
  return text
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

let entryCounter = 0;

/** Identifiant d'entrée, unique dans la session et sans dépendance. */
export function newEntryId(): string {
  entryCounter += 1;
  return `e${Date.now().toString(36)}${entryCounter.toString(36)}`;
}

export function blankEntry(): LoreEntry {
  return {
    id: newEntryId(),
    comment: "",
    keys: [],
    secondaryKeys: [],
    selective: false,
    secondaryLogic: "andAny",
    content: "",
    constant: false,
    enabled: true,
    caseSensitive: false,
    insertionOrder: 100,
    extra: {},
  };
}

/** Champs d'une entrée SillyTavern que Praxis interprète ; le reste va dans `extra`. */
const CARD_ENTRY_FIELDS = new Set([
  "keys",
  "key",
  "secondary_keys",
  "keysecondary",
  "content",
  "enabled",
  "disable",
  "constant",
  "selective",
  "case_sensitive",
  "insertion_order",
  "order",
  "comment",
  "name",
  "id",
  "uid",
]);

const CARD_BOOK_FIELDS = new Set(["name", "description", "scan_depth", "token_budget", "entries"]);

function without(source: Record<string, unknown>, fields: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([k]) => !fields.has(k)));
}

/**
 * Lit une entrée de carte (`character_book`), ou d'un fichier World Info de
 * SillyTavern, dont les noms de champs diffèrent un peu (`key`, `order`,
 * `disable`). Retourne null pour une entrée sans texte.
 */
function entryFromCard(
  raw: unknown,
  rewrite: (text: string) => string,
): LoreEntry | null {
  const e = record(raw);
  const content = typeof e.content === "string" ? rewrite(e.content).trim() : "";
  if (!content) return null;
  const extensions = record(e.extensions);
  const logicCode =
    typeof extensions.selectiveLogic === "number" ? extensions.selectiveLogic : 0;
  const order =
    typeof e.insertion_order === "number"
      ? e.insertion_order
      : typeof e.order === "number"
        ? e.order
        : 100;
  return {
    id: newEntryId(),
    comment:
      typeof e.comment === "string" && e.comment.trim()
        ? e.comment.trim()
        : typeof e.name === "string"
          ? e.name.trim()
          : "",
    keys: strList(e.keys ?? e.key).map(rewrite),
    secondaryKeys: strList(e.secondary_keys ?? e.keysecondary).map(rewrite),
    selective: e.selective === true,
    secondaryLogic: LOGIC_BY_CODE[logicCode] ?? "andAny",
    content,
    constant: e.constant === true,
    enabled: e.enabled === undefined ? e.disable !== true : e.enabled !== false,
    caseSensitive: e.case_sensitive === true,
    insertionOrder: Number.isFinite(order) ? order : 100,
    extra: without(e, CARD_ENTRY_FIELDS),
  };
}

/**
 * Lit un `character_book` de carte (V2 ou V3). Les macros `{{char}}` et
 * `{{user}}` sont remplacées comme dans le reste de la carte. Retourne null
 * si le livre n'a aucune entrée utilisable.
 */
export function lorebookFromCard(
  raw: unknown,
  charName: string,
  userName: string,
): Lorebook | null {
  const book = record(raw);
  // Les World Info autonomes rangent leurs entrées dans un objet indexé.
  const rawEntries = Array.isArray(book.entries)
    ? book.entries
    : Object.values(record(book.entries));
  const rewrite = (text: string) => replaceMacros(text.replace(/\r\n?/g, "\n"), charName, userName);
  const entries = rawEntries
    .map((e) => entryFromCard(e, rewrite))
    .filter((e): e is LoreEntry => e !== null);
  if (entries.length === 0) return null;
  return {
    version: 1,
    name: typeof book.name === "string" ? book.name : "",
    description: typeof book.description === "string" ? book.description : "",
    scanDepth: positiveInt(book.scan_depth),
    tokenBudget: positiveInt(book.token_budget),
    entries,
    extra: without(book, CARD_BOOK_FIELDS),
  };
}

/** Écrit le livre au format `character_book` des cartes V2/V3. */
export function lorebookToCard(book: Lorebook): Record<string, unknown> {
  return {
    ...book.extra,
    name: book.name,
    description: book.description,
    ...(book.scanDepth !== null ? { scan_depth: book.scanDepth } : {}),
    ...(book.tokenBudget !== null ? { token_budget: book.tokenBudget } : {}),
    extensions: record(book.extra.extensions),
    entries: book.entries.map((entry, index) => {
      const extensions = record(entry.extra.extensions);
      return {
        ...entry.extra,
        id: index,
        keys: entry.keys,
        secondary_keys: entry.secondaryKeys,
        comment: entry.comment,
        content: entry.content,
        constant: entry.constant,
        selective: entry.selective,
        insertion_order: entry.insertionOrder,
        enabled: entry.enabled,
        case_sensitive: entry.caseSensitive,
        extensions: { ...extensions, selectiveLogic: CODE_BY_LOGIC[entry.secondaryLogic] },
      };
    }),
  };
}

/**
 * Relit un livre déjà au format Praxis (colonne en base, distribution
 * exportée). Une valeur abîmée vaut « pas de connaissances ».
 */
export function normalizeLorebook(raw: unknown): Lorebook | null {
  const book = record(raw);
  if (book.version !== 1 || !Array.isArray(book.entries)) return null;
  const entries = book.entries.flatMap((rawEntry): LoreEntry[] => {
    const e = record(rawEntry);
    if (typeof e.content !== "string") return [];
    const logic = e.secondaryLogic;
    return [
      {
        id: typeof e.id === "string" && e.id ? e.id : newEntryId(),
        comment: typeof e.comment === "string" ? e.comment : "",
        keys: strList(e.keys),
        secondaryKeys: strList(e.secondaryKeys),
        selective: e.selective === true,
        secondaryLogic:
          logic === "notAll" || logic === "notAny" || logic === "andAll" ? logic : "andAny",
        content: e.content,
        constant: e.constant === true,
        enabled: e.enabled !== false,
        caseSensitive: e.caseSensitive === true,
        insertionOrder:
          typeof e.insertionOrder === "number" && Number.isFinite(e.insertionOrder)
            ? e.insertionOrder
            : 100,
        extra: record(e.extra),
      },
    ];
  });
  return {
    version: 1,
    name: typeof book.name === "string" ? book.name : "",
    description: typeof book.description === "string" ? book.description : "",
    scanDepth: positiveInt(book.scanDepth),
    tokenBudget: positiveInt(book.tokenBudget),
    entries,
    extra: record(book.extra),
  };
}

/** Livre vide, prêt à recevoir une première entrée. */
export function emptyLorebook(): Lorebook {
  return {
    version: 1,
    name: "",
    description: "",
    scanDepth: null,
    tokenBudget: null,
    entries: [],
    extra: {},
  };
}

// ---------------------------------------------------------------------------
// Déclenchement
// ---------------------------------------------------------------------------

/** Minuscules et sans accents, sauf entrée sensible à la casse. */
function fold(text: string, caseSensitive: boolean): string {
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’]/g, "'");
  return caseSensitive ? plain : plain.toLowerCase();
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Le mot-clé apparaît-il en mot entier (ou groupe de mots) dans le texte ? */
export function containsKey(text: string, key: string, caseSensitive = false): boolean {
  const needle = fold(key.trim(), caseSensitive);
  if (!needle) return false;
  const haystack = fold(text, caseSensitive);
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at > 0 ? haystack[at - 1] : "";
    const after = haystack[at + needle.length] ?? "";
    // Un mot-clé qui commence ou finit par un signe (« #tag ») n'a pas besoin
    // de frontière de ce côté-là.
    const startOk = !WORD_CHAR.test(needle[0]) || !before || !WORD_CHAR.test(before);
    const endOk =
      !WORD_CHAR.test(needle[needle.length - 1]) || !after || !WORD_CHAR.test(after);
    if (startOk && endOk) return true;
    from = at + 1;
  }
  return false;
}

/** L'entrée se déclenche-t-elle sur ce texte ? (Sans compter `constant`.) */
export function entryTriggers(entry: LoreEntry, text: string): boolean {
  const hit = (key: string) => containsKey(text, key, entry.caseSensitive);
  if (!entry.keys.some(hit)) return false;
  if (!entry.selective || entry.secondaryKeys.length === 0) return true;
  const matches = entry.secondaryKeys.filter(hit).length;
  switch (entry.secondaryLogic) {
    case "andAny":
      return matches > 0;
    case "andAll":
      return matches === entry.secondaryKeys.length;
    case "notAny":
      return matches === 0;
    case "notAll":
      return matches < entry.secondaryKeys.length;
  }
}

export type LoreSelection = {
  /** Toujours présentes : elles vont dans la partie stable du prompt. */
  constant: string[];
  /** Déclenchées par les dernières répliques : elles closent la requête. */
  triggered: string[];
};

export const NO_LORE: LoreSelection = { constant: [], triggered: [] };

/**
 * Choisit les entrées à transmettre. Les constantes passent d'abord, puis les
 * déclenchées par ordre d'insertion décroissant, tant que le budget tient.
 * Chaque groupe est rendu dans l'ordre d'insertion croissant, comme dans
 * SillyTavern : la plus prioritaire se retrouve au plus près de la réponse.
 *
 * `recentTexts` va du plus ancien au plus récent ; seules les
 * `scanDepth` dernières répliques sont lues.
 */
export function selectLore(
  book: Lorebook | null,
  recentTexts: readonly string[],
  contextTokens: number,
  estimateTokens: (text: string) => number,
): LoreSelection {
  if (!book) return NO_LORE;
  const active = book.entries.filter((e) => e.enabled && e.content.trim());
  if (active.length === 0) return NO_LORE;
  const depth = book.scanDepth ?? DEFAULT_SCAN_DEPTH;
  const scanned = recentTexts.slice(-depth).join("\n");
  const budget = Math.min(
    book.tokenBudget ?? DEFAULT_LORE_TOKENS,
    Math.floor(contextTokens * LORE_CONTEXT_RATIO),
  );

  const byPriority = (a: LoreEntry, b: LoreEntry) => b.insertionOrder - a.insertionOrder;
  const candidates = [
    ...active.filter((e) => e.constant).sort(byPriority),
    ...active.filter((e) => !e.constant && entryTriggers(e, scanned)).sort(byPriority),
  ];
  const kept: LoreEntry[] = [];
  let used = 0;
  for (const entry of candidates) {
    const cost = estimateTokens(entry.content) + 2;
    if (used + cost > budget) continue;
    kept.push(entry);
    used += cost;
  }
  const render = (constant: boolean) =>
    kept
      .filter((e) => e.constant === constant)
      .sort((a, b) => a.insertionOrder - b.insertionOrder)
      .map((e) => e.content.trim());
  return { constant: render(true), triggered: render(false) };
}

/**
 * Mots-clés après traduction : les originaux restent, les traduits
 * s'ajoutent. L'entrée se déclenche ainsi dans les deux langues.
 */
export function mergeKeys(original: readonly string[], translated: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of [...original, ...translated]) {
    const trimmed = key.trim();
    const folded = fold(trimmed, false);
    if (!trimmed || seen.has(folded)) continue;
    seen.add(folded);
    result.push(trimmed);
  }
  return result;
}

/** Un mot-clé écrit « /motif/drapeaux » est une regex pour SillyTavern. */
function looksLikeRegex(key: string): boolean {
  return /^\/.+\/[a-z]*$/i.test(key.trim());
}

/**
 * L'entrée porte-t-elle des réglages SillyTavern qui n'agissent pas ici
 * (regex, probabilité, récursion…) ? Ils sont conservés pour l'export, mais
 * l'interface doit le dire plutôt que de laisser croire qu'ils jouent.
 */
export function hasUnsupportedSettings(entry: LoreEntry): boolean {
  const extensions = record(entry.extra.extensions);
  const probability = extensions.probability;
  return (
    [...entry.keys, ...entry.secondaryKeys].some(looksLikeRegex) ||
    entry.extra.use_regex === true ||
    (extensions.useProbability === true &&
      typeof probability === "number" &&
      probability < 100) ||
    extensions.exclude_recursion === true ||
    extensions.prevent_recursion === true ||
    extensions.delay_until_recursion === true
  );
}
