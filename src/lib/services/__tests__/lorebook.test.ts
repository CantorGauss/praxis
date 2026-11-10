import { describe, expect, it } from "vitest";
import {
  blankEntry,
  containsKey,
  emptyLorebook,
  entryTriggers,
  hasUnsupportedSettings,
  lorebookFromCard,
  lorebookToCard,
  mergeKeys,
  normalizeLorebook,
  selectLore,
  type LoreEntry,
  type Lorebook,
} from "../lorebook";

/** Un jeton tous les quatre caractères, comme l'estimation de l'assembleur. */
const estimate = (text: string) => Math.ceil(text.length / 4);

function entry(overrides: Partial<LoreEntry> = {}): LoreEntry {
  return { ...blankEntry(), content: "Un savoir.", ...overrides };
}

function book(entries: LoreEntry[], overrides: Partial<Lorebook> = {}): Lorebook {
  return { ...emptyLorebook(), entries, ...overrides };
}

describe("containsKey", () => {
  it("cherche des mots entiers, sans casse ni accents", () => {
    expect(containsKey("Elle a retrouvé l'Épée de Lune.", "épée de lune")).toBe(true);
    expect(containsKey("Le EPEE brille", "épée")).toBe(true);
    expect(containsKey("Un épéiste passe.", "épée")).toBe(false);
    expect(containsKey("Eldorian ruins", "Eldoria")).toBe(false);
    expect(containsKey("To Eldoria!", "Eldoria")).toBe(true);
  });

  it("respecte la casse quand on la demande", () => {
    expect(containsKey("the Rose inn", "Rose", true)).toBe(true);
    expect(containsKey("a rose", "Rose", true)).toBe(false);
  });

  it("accepte les mots-clés qui commencent par un signe", () => {
    expect(containsKey("rendez-vous au #3", "#3")).toBe(true);
  });

  it("ignore un mot-clé vide", () => {
    expect(containsKey("n'importe quoi", "  ")).toBe(false);
  });
});

describe("entryTriggers", () => {
  const base = entry({ keys: ["amulette"], secondaryKeys: ["volée", "perdue"], selective: true });

  it("exige une clé principale", () => {
    expect(entryTriggers(base, "Elle a été volée.")).toBe(false);
  });

  it("applique la logique des clés secondaires", () => {
    const text = "L'amulette a été volée.";
    expect(entryTriggers({ ...base, secondaryLogic: "andAny" }, text)).toBe(true);
    expect(entryTriggers({ ...base, secondaryLogic: "andAll" }, text)).toBe(false);
    expect(entryTriggers({ ...base, secondaryLogic: "notAny" }, text)).toBe(false);
    expect(entryTriggers({ ...base, secondaryLogic: "notAll" }, text)).toBe(true);
    expect(entryTriggers({ ...base, secondaryLogic: "notAny" }, "L'amulette brille.")).toBe(true);
  });

  it("ignore les clés secondaires d'une entrée non sélective", () => {
    expect(entryTriggers({ ...base, selective: false }, "L'amulette brille.")).toBe(true);
  });
});

describe("selectLore", () => {
  it("garde les constantes et les entrées évoquées, dans l'ordre d'insertion", () => {
    const lore = book([
      entry({ content: "Constante B", constant: true, insertionOrder: 20 }),
      entry({ content: "Constante A", constant: true, insertionOrder: 10 }),
      entry({ content: "Forêt", keys: ["forêt"], insertionOrder: 5 }),
      entry({ content: "Lac", keys: ["lac"] }),
      entry({ content: "Éteinte", keys: ["forêt"], enabled: false }),
      entry({ content: "   ", keys: ["forêt"] }),
    ]);
    expect(selectLore(lore, ["On entre dans la forêt."], 8192, estimate)).toEqual({
      constant: ["Constante A", "Constante B"],
      triggered: ["Forêt"],
    });
  });

  it("ne lit que les dernières répliques", () => {
    const lore = book([entry({ content: "Lac", keys: ["lac"] })], { scanDepth: 2 });
    const texts = ["Près du lac.", "Bonjour.", "Ça va ?"];
    expect(selectLore(lore, texts, 8192, estimate).triggered).toEqual([]);
    expect(selectLore({ ...lore, scanDepth: 3 }, texts, 8192, estimate).triggered).toEqual(["Lac"]);
  });

  it("tient le budget en sacrifiant les moins prioritaires", () => {
    const long = "x".repeat(400); // ~100 jetons
    const lore = book(
      [
        entry({ content: `${long}1`, keys: ["a"], insertionOrder: 1 }),
        entry({ content: `${long}2`, keys: ["a"], insertionOrder: 2 }),
        entry({ content: `${long}3`, keys: ["a"], insertionOrder: 3 }),
      ],
      { tokenBudget: 220 },
    );
    const kept = selectLore(lore, ["a"], 100_000, estimate).triggered;
    expect(kept).toEqual([`${long}2`, `${long}3`]);
  });

  it("borne aussi le budget par la taille du contexte", () => {
    const lore = book([entry({ content: "y".repeat(400), constant: true })]);
    // 15 % de 512 jetons : 76, moins que les ~100 de l'entrée.
    expect(selectLore(lore, [], 512, estimate).constant).toEqual([]);
  });

  it("ne rend rien sans livre", () => {
    expect(selectLore(null, ["forêt"], 8192, estimate)).toEqual({ constant: [], triggered: [] });
  });
});

describe("lorebookFromCard", () => {
  it("lit un character_book et garde ce qu'il ne gère pas", () => {
    const lore = lorebookFromCard(
      {
        name: "Eldoria",
        scan_depth: 3,
        token_budget: 500,
        recursive_scanning: true,
        extensions: {},
        entries: [
          {
            keys: ["{{char}}'s cabin", "cabin"],
            secondary_keys: ["night"],
            selective: true,
            content: "{{char}} built the cabin for {{user}}.\r\nIt is warm.",
            enabled: true,
            insertion_order: 30,
            case_sensitive: false,
            comment: "Cabin",
            id: 7,
            position: "after_char",
            extensions: { selectiveLogic: 3, probability: 50, useProbability: true },
          },
          { keys: ["empty"], content: "   ", enabled: true, insertion_order: 1 },
        ],
      },
      "Seraphina",
      "Jeff",
    );
    expect(lore).not.toBeNull();
    expect(lore!.name).toBe("Eldoria");
    expect(lore!.scanDepth).toBe(3);
    expect(lore!.tokenBudget).toBe(500);
    expect(lore!.extra).toEqual({ recursive_scanning: true, extensions: {} });
    expect(lore!.entries).toHaveLength(1);
    expect(lore!.entries[0]).toMatchObject({
      comment: "Cabin",
      keys: ["Seraphina's cabin", "cabin"],
      secondaryKeys: ["night"],
      selective: true,
      secondaryLogic: "andAll",
      content: "Seraphina built the cabin for Jeff.\nIt is warm.",
      insertionOrder: 30,
      extra: {
        position: "after_char",
        extensions: { selectiveLogic: 3, probability: 50, useProbability: true },
      },
    });
  });

  it("lit les entrées d'un World Info autonome", () => {
    const lore = lorebookFromCard(
      {
        entries: {
          "0": { key: ["port"], keysecondary: [], content: "Le port est fermé.", order: 12, disable: true },
          "1": { key: ["phare"], content: "Le phare clignote.", constant: true },
        },
      },
      "Anna",
      "Jeff",
    );
    expect(lore!.entries.map((e) => [e.keys, e.insertionOrder, e.enabled, e.constant])).toEqual([
      [["port"], 12, false, false],
      [["phare"], 100, true, true],
    ]);
  });

  it("renonce à un livre sans entrée utilisable", () => {
    expect(lorebookFromCard({ entries: [] }, "A", "B")).toBeNull();
    expect(lorebookFromCard("pas un livre", "A", "B")).toBeNull();
  });
});

describe("lorebookToCard et normalizeLorebook", () => {
  const lore = book(
    [
      entry({
        comment: "Lac",
        keys: ["lac"],
        secondaryKeys: ["nuit"],
        selective: true,
        secondaryLogic: "notAny",
        content: "Le lac gèle en hiver.",
        insertionOrder: 40,
        extra: { position: "before_char", extensions: { depth: 4 } },
      }),
    ],
    { name: "Monde", scanDepth: 5, extra: { recursive_scanning: false } },
  );

  it("écrit un character_book conforme", () => {
    expect(lorebookToCard(lore)).toEqual({
      recursive_scanning: false,
      name: "Monde",
      description: "",
      scan_depth: 5,
      extensions: {},
      entries: [
        {
          position: "before_char",
          id: 0,
          keys: ["lac"],
          secondary_keys: ["nuit"],
          comment: "Lac",
          content: "Le lac gèle en hiver.",
          constant: false,
          selective: true,
          insertion_order: 40,
          enabled: true,
          case_sensitive: false,
          extensions: { depth: 4, selectiveLogic: 2 },
        },
      ],
    });
  });

  it("revient intact d'un aller-retour par la carte", () => {
    const back = lorebookFromCard(lorebookToCard(lore), "A", "B")!;
    expect(back.entries[0]).toMatchObject({
      comment: "Lac",
      keys: ["lac"],
      secondaryLogic: "notAny",
      content: "Le lac gèle en hiver.",
      extra: { position: "before_char", extensions: { depth: 4, selectiveLogic: 2 } },
    });
  });

  it("relit le format stocké, et refuse le reste", () => {
    expect(normalizeLorebook(JSON.parse(JSON.stringify(lore)))).toEqual(lore);
    expect(normalizeLorebook({ version: 2, entries: [] })).toBeNull();
    expect(normalizeLorebook(null)).toBeNull();
  });
});

describe("mergeKeys", () => {
  it("ajoute les traductions sans doublon", () => {
    expect(mergeKeys(["sword", "Eldoria"], ["épée", "eldoria", " ", "Épée"])).toEqual([
      "sword",
      "Eldoria",
      "épée",
    ]);
  });
});

describe("hasUnsupportedSettings", () => {
  it("repère regex, probabilité et récursion", () => {
    expect(hasUnsupportedSettings(entry({ keys: ["/drag(on|ons)/i"] }))).toBe(true);
    expect(
      hasUnsupportedSettings(
        entry({ extra: { extensions: { useProbability: true, probability: 40 } } }),
      ),
    ).toBe(true);
    expect(
      hasUnsupportedSettings(
        entry({ extra: { extensions: { useProbability: true, probability: 100 } } }),
      ),
    ).toBe(false);
    expect(hasUnsupportedSettings(entry({ keys: ["dragon"] }))).toBe(false);
  });
});
