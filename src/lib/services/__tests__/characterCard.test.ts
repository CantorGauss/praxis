import { describe, expect, it } from "vitest";
import {
  base64ToUtf8,
  cardFileName,
  cardToPersona,
  guessGender,
  isPng,
  normalizeCard,
  personaToCardV2,
  personaToCardV3,
  readCardFromPng,
  replaceMacros,
  traitsFromPersonality,
  utf8ToBase64,
  writeCardToPng,
  type CharacterCardData,
} from "../characterCard";
import type { Persona } from "../../types";

// --- PNG minimal, construit à la main ---------------------------------------

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  const typed = new Uint8Array(4 + data.length);
  typed.set([...type].map((c) => c.charCodeAt(0)));
  typed.set(data, 4);
  out.set(typed, 4);
  view.setUint32(8 + data.length, crc32(typed));
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function textChunk(keyword: string, text: string): Uint8Array {
  return chunk("tEXt", new TextEncoder().encode(`${keyword}\0${text}`));
}

function png(...extra: Uint8Array[]): Uint8Array {
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, 1);
  new DataView(ihdr.buffer).setUint32(4, 1);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return concat(
    SIGNATURE,
    chunk("IHDR", ihdr),
    ...extra,
    chunk("IDAT", new Uint8Array([1, 2, 3])),
    chunk("IEND", new Uint8Array(0)),
  );
}

/** Vérifie que chaque fragment du PNG a une longueur et un CRC cohérents. */
function chunkTypes(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types: string[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const typed = bytes.subarray(offset + 4, offset + 8 + length);
    expect(view.getUint32(offset + 8 + length)).toBe(crc32(typed));
    types.push(String.fromCharCode(...typed.subarray(0, 4)));
    offset += 12 + length;
  }
  return types;
}

const persona: Persona = {
  id: "p1",
  name: "Hélène Marchal",
  description: "Commissaire à la retraite",
  systemPrompt: "Tu parles peu, tu observes beaucoup. Tu ne pardonnes rien.",
  stableTraits: ["méfiante", "patiente"],
  defaultModelId: "some-model",
  temperature: 1.05,
  topP: 0.9,
  maxOutputTokens: 300,
  gender: "feminine",
  avatarSetId: null,
  avatarStyle: null,
  lorebook: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function card(overrides: Partial<CharacterCardData> = {}): CharacterCardData {
  return normalizeCard({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: { name: "Seraphina", description: "", ...overrides },
  })!;
}

describe("normalizeCard", () => {
  it("lit une carte V2 et complète les champs absents", () => {
    const c = normalizeCard({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { name: " Seraphina ", description: "Guardian of the forest.", tags: ["fantasy", 3] },
    });
    expect(c?.name).toBe("Seraphina");
    expect(c?.description).toBe("Guardian of the forest.");
    expect(c?.tags).toEqual(["fantasy"]);
    expect(c?.first_mes).toBe("");
    expect(c?.extensions).toEqual({});
  });

  it("lit une carte V3", () => {
    const c = normalizeCard({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: { name: "Aqua", description: "A goddess.", group_only_greetings: [] },
    });
    expect(c?.name).toBe("Aqua");
  });

  it("lit une carte V1 à plat", () => {
    const c = normalizeCard({ name: "Bob", description: "A baker.", first_mes: "Hi!" });
    expect(c?.name).toBe("Bob");
    expect(c?.first_mes).toBe("Hi!");
  });

  it("refuse ce qui n'est pas une carte", () => {
    expect(normalizeCard({ kind: "praxis.personas", personas: [] })).toBeNull();
    expect(normalizeCard({ name: "Juste un nom" })).toBeNull();
    expect(normalizeCard({ spec: "chara_card_v2", data: { name: "  " } })).toBeNull();
    expect(normalizeCard(null)).toBeNull();
    expect(normalizeCard([1, 2])).toBeNull();
  });
});

describe("replaceMacros", () => {
  it("remplace {{char}}, {{user}} et les anciennes balises", () => {
    expect(
      replaceMacros("{{char}} greets {{ User }}. <BOT> likes <USER>.", "Ann", "Jeff"),
    ).toBe("Ann greets Jeff. Ann likes Jeff.");
  });
});

describe("traitsFromPersonality", () => {
  it("découpe une liste de mots", () => {
    expect(traitsFromPersonality("kind, sarcastic; loyal.")).toEqual([
      "kind",
      "sarcastic",
      "loyal",
    ]);
  });

  it("laisse les phrases rédigées en texte", () => {
    expect(traitsFromPersonality("She is kind but never forgives a betrayal.")).toBeNull();
    expect(
      traitsFromPersonality("kind, but she will never ever forgive anyone who lies"),
    ).toBeNull();
    expect(traitsFromPersonality("")).toBeNull();
  });
});

describe("guessGender", () => {
  it("devine l'accord d'après les pronoms", () => {
    expect(guessGender("She smiles. Her eyes are green and she knows it.")).toBe("feminine");
    expect(guessGender("He is tall. His voice is low.")).toBe("masculine");
    expect(guessGender("Elle est grande, elle rit fort.")).toBe("feminine");
    expect(guessGender("They are a robot.")).toBe("neutral");
    expect(guessGender("She said he was there. He and she.")).toBe("neutral");
  });
});

describe("cardToPersona", () => {
  it("garde la description comme caractère et la liste en traits", () => {
    const draft = cardToPersona(
      card({
        description: "{{char}} guards the forest and distrusts {{user}}.\r\nShe heals the wounded.",
        personality: "gentle, stubborn, wise",
        scenario: "{{user}} wakes up in her cabin.",
        first_mes: "*She looks at you.*",
        creator_notes: "A healer.",
      }),
      "Jeff",
    );
    expect(draft).toEqual({
      name: "Seraphina",
      description: "A healer.",
      systemPrompt: "Seraphina guards the forest and distrusts Jeff.\nShe heals the wounded.",
      stableTraits: ["gentle", "stubborn", "wise"],
      gender: "feminine",
      temperature: null,
      topP: null,
      maxOutputTokens: null,
      appearance: null,
      lorebook: null,
    });
  });

  it("ajoute une personnalité rédigée au caractère", () => {
    const draft = cardToPersona(
      card({
        description: "A retired detective.",
        personality: "He notices everything and says little. He never forgets a face.",
      }),
      "you",
    );
    expect(draft?.systemPrompt).toBe(
      "A retired detective.\n\nHe notices everything and says little. He never forgets a face.",
    );
    expect(draft?.stableTraits).toEqual([]);
  });

  it("ignore les notes d'auteur longues", () => {
    const draft = cardToPersona(
      card({ description: "x", creator_notes: "Made by me.\nJoin my Discord!" }),
      "you",
    );
    expect(draft?.description).toBeNull();
  });

  it("se rabat sur le scénario, puis renonce", () => {
    expect(cardToPersona(card({ scenario: "A tavern." }), "you")?.systemPrompt).toBe(
      "A tavern.",
    );
    expect(cardToPersona(card({ first_mes: "Hello" }), "you")).toBeNull();
  });
});

describe("export vers SillyTavern", () => {
  const now = new Date("2026-03-01T00:00:00Z");

  it("écrit une V2 conforme", () => {
    const v2 = personaToCardV2(persona, now);
    expect(v2.spec).toBe("chara_card_v2");
    expect(v2.spec_version).toBe("2.0");
    expect(v2.data.name).toBe("Hélène Marchal");
    expect(v2.data.description).toBe(persona.systemPrompt);
    expect(v2.data.personality).toBe("méfiante, patiente");
    expect(v2.data.creator_notes).toBe("Commissaire à la retraite");
    expect(v2.data.first_mes).toBe("");
    expect(v2.data.alternate_greetings).toEqual([]);
    expect(v2.data).not.toHaveProperty("creation_date");
    expect(v2.data).not.toHaveProperty("group_only_greetings");
  });

  it("écrit une V3 datée", () => {
    const v3 = personaToCardV3(persona, now);
    expect(v3.spec).toBe("chara_card_v3");
    expect(v3.spec_version).toBe("3.0");
    expect(v3.data.group_only_greetings).toEqual([]);
    expect(v3.data.creation_date).toBe(Date.parse(persona.createdAt) / 1000);
    expect(v3.data.modification_date).toBe(now.getTime() / 1000);
  });

  it("fait l'aller-retour sans perte grâce à l'extension Praxis", () => {
    const draft = cardToPersona(normalizeCard(personaToCardV2(persona))!, "Jeff");
    expect(draft).toEqual({
      name: persona.name,
      description: persona.description,
      systemPrompt: persona.systemPrompt,
      stableTraits: persona.stableTraits,
      gender: "feminine",
      temperature: 1.05,
      topP: 0.9,
      maxOutputTokens: 300,
      appearance: null,
      lorebook: null,
    });
  });

  it("emporte le lorebook dans la carte et le relit au retour", () => {
    const withLore: Persona = {
      ...persona,
      lorebook: {
        version: 1,
        name: "Commissariat",
        description: "",
        scanDepth: 3,
        tokenBudget: null,
        extra: { recursive_scanning: true },
        entries: [
          {
            id: "a",
            comment: "Le dossier",
            keys: ["dossier Morel"],
            secondaryKeys: [],
            selective: false,
            secondaryLogic: "andAny",
            content: "Hélène n'a jamais classé le dossier Morel.",
            constant: false,
            enabled: true,
            caseSensitive: false,
            insertionOrder: 50,
            extra: { extensions: { probability: 80 } },
          },
        ],
      },
    };
    const v2 = personaToCardV2(withLore);
    const book = v2.data.character_book as { entries: Record<string, unknown>[] };
    expect(book.entries[0]).toMatchObject({
      keys: ["dossier Morel"],
      content: "Hélène n'a jamais classé le dossier Morel.",
      insertion_order: 50,
      extensions: { probability: 80, selectiveLogic: 0 },
    });
    expect(personaToCardV3(withLore).data.character_book).toEqual(book);
    const back = cardToPersona(normalizeCard(v2)!, "Jeff")!.lorebook!;
    expect(back.name).toBe("Commissariat");
    expect(back.scanDepth).toBe(3);
    expect(back.extra).toEqual({ recursive_scanning: true, extensions: {} });
    expect(back.entries[0]).toMatchObject({
      comment: "Le dossier",
      keys: ["dossier Morel"],
      insertionOrder: 50,
      extra: { extensions: { probability: 80, selectiveLogic: 0 } },
    });
  });

  it("n'écrit pas de lorebook vide", () => {
    expect(personaToCardV2(persona).data).not.toHaveProperty("character_book");
  });

  it("préfère le texte modifié dans SillyTavern à l'ancien caractère", () => {
    const v2 = personaToCardV2(persona);
    v2.data.description = "Nouveau caractère.";
    expect(cardToPersona(normalizeCard(v2)!, "Jeff")?.systemPrompt).toBe("Nouveau caractère.");
  });
});

describe("PNG", () => {
  it("reconnaît la signature", () => {
    expect(isPng(png())).toBe(true);
    expect(isPng(new TextEncoder().encode("{}"))).toBe(false);
  });

  it("lit une carte « chara » écrite par un autre outil", () => {
    const json = JSON.stringify({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { name: "Zoé", description: "Une pâtissière ✨" },
    });
    const image = png(textChunk("chara", utf8ToBase64(json)));
    expect(readCardFromPng(image)?.description).toBe("Une pâtissière ✨");
  });

  it("préfère « ccv3 » à « chara »", () => {
    const v2 = { spec: "chara_card_v2", data: { name: "Old", description: "v2" } };
    const v3 = { spec: "chara_card_v3", data: { name: "New", description: "v3" } };
    const image = png(
      textChunk("chara", utf8ToBase64(JSON.stringify(v2))),
      textChunk("ccv3", utf8ToBase64(JSON.stringify(v3))),
    );
    expect(readCardFromPng(image)?.name).toBe("New");
  });

  it("se rabat sur « chara » si « ccv3 » est illisible", () => {
    const v2 = { spec: "chara_card_v2", data: { name: "Old", description: "v2" } };
    const image = png(
      textChunk("ccv3", "!!!pas du base64!!!"),
      textChunk("chara", utf8ToBase64(JSON.stringify(v2))),
    );
    expect(readCardFromPng(image)?.name).toBe("Old");
  });

  it("retourne null pour une image sans carte", () => {
    expect(readCardFromPng(png(textChunk("Software", "GIMP")))).toBeNull();
  });

  it("écrit les deux versions avant IEND, avec des CRC valides", () => {
    const out = writeCardToPng(
      png(textChunk("Software", "GIMP")),
      personaToCardV2(persona),
      personaToCardV3(persona),
    );
    expect(chunkTypes(out)).toEqual(["IHDR", "tEXt", "IDAT", "tEXt", "tEXt", "IEND"]);
    const back = readCardFromPng(out);
    expect(back?.name).toBe("Hélène Marchal");
    expect(back?.extensions).toHaveProperty("praxis");
  });

  it("remplace une carte déjà présente au lieu de l'empiler", () => {
    const first = writeCardToPng(png(), personaToCardV2(persona), personaToCardV3(persona));
    const renamed = { ...persona, name: "Autre" };
    const second = writeCardToPng(first, personaToCardV2(renamed), personaToCardV3(renamed));
    expect(chunkTypes(second).filter((t) => t === "tEXt")).toHaveLength(2);
    expect(readCardFromPng(second)?.name).toBe("Autre");
  });
});

describe("utilitaires", () => {
  it("encode et décode le base64 en UTF-8", () => {
    const text = "Héloïse — « ✨ » 日本";
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it("donne un nom de fichier sûr", () => {
    expect(cardFileName("Hélène Marchal", "png")).toBe("Helene_Marchal.png");
    expect(cardFileName("R2/D2?", "json")).toBe("R2D2.json");
    expect(cardFileName("???", "png")).toBe("character.png");
  });
});
