import { describe, expect, it } from "vitest";
import {
  addUserFact,
  applyMemoryUpdate,
  decodeMemory,
  editFact,
  emptyMemory,
  factsKnownBy,
  memoryDigest,
  parseMemoryUpdate,
  removeFact,
  rewindMemory,
  setFactPinned,
} from "../memory";
import { frPrompts } from "../../i18n/prompts";
import type { MemoryFact, Message, SceneMemory } from "../../types";

const NOW = "2026-11-07T10:00:00.000Z";

function message(id: string, content = "contenu"): Message {
  return {
    id,
    conversationId: "c1",
    role: "user",
    kind: "speech",
    content,
    status: "complete",
    createdAt: NOW,
    personaId: null,
    personaName: null,
    addressee: null,
  };
}

function fact(id: string, text: string, extra: Partial<MemoryFact> = {}): MemoryFact {
  return {
    id,
    text,
    category: "event",
    pinned: false,
    origin: "auto",
    sourceMessageIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function memoryWith(...facts: MemoryFact[]): SceneMemory {
  return { ...emptyMemory(), facts, nextFactNumber: facts.length + 1 };
}

describe("parseMemoryUpdate", () => {
  it("lit le JSON même entouré d'un bloc de code", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        add: [{ text: "Anna a perdu ses clés.", category: "event", sources: [2] }],
        update: [{ id: "F3", text: "Marc vit chez Anna.", sources: ["4"] }],
        retire: ["f5", 6, "[f7]"],
        state: ["- Anna est au salon."],
        threads: [],
      }) +
      "\n```";
    const parsed = parseMemoryUpdate(raw)!;
    expect(parsed.add).toEqual([{ text: "Anna a perdu ses clés.", category: "event", sources: [2] }]);
    expect(parsed.update).toEqual([{ id: "f3", text: "Marc vit chez Anna.", sources: [4] }]);
    expect(parsed.retire).toEqual(["f5", "f6", "f7"]);
    expect(parsed.state).toEqual(["Anna est au salon."]);
    expect(parsed.threads).toEqual([]);
  });

  it("ramène une catégorie inconnue à « other » et garde l'état quand il est absent", () => {
    const parsed = parseMemoryUpdate('{"add":[{"text":"Un fait.","category":"weather"}]}')!;
    expect(parsed.add[0].category).toBe("other");
    expect(parsed.state).toBeNull();
    expect(parsed.threads).toBeNull();
  });

  it("refuse une sortie illisible", () => {
    expect(parseMemoryUpdate("Voici les faits : aucun.")).toBeNull();
    expect(parseMemoryUpdate("{pas du json}")).toBeNull();
  });
});

describe("applyMemoryUpdate", () => {
  const batch = [message("m1"), message("m2"), message("m3")];

  it("ajoute des faits numérotés avec leurs sources, sans jamais en perdre par omission", () => {
    const memory = memoryWith(fact("f1", "Anna et Marc sont amis d'enfance."));
    const { memory: next, added } = applyMemoryUpdate(
      memory,
      {
        add: [{ text: "Marc a cassé le vase.", category: "event", sources: [2, 9] }],
        update: [],
        retire: [],
        state: ["Marc est dans l'entrée."],
        threads: null,
      },
      batch,
      NOW,
    );
    expect(added).toBe(1);
    // Le fait f1, que le lot ne mentionne pas, est toujours là.
    expect(next.facts.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(next.facts[1].sourceMessageIds).toEqual(["m2"]);
    expect(next.state).toEqual(["Marc est dans l'entrée."]);
    expect(next.nextFactNumber).toBe(3);
  });

  it("attribue à tout le lot un fait sans source valide", () => {
    const { memory: next } = applyMemoryUpdate(
      emptyMemory(),
      { add: [{ text: "Il neige.", category: "other", sources: [] }], update: [], retire: [], state: null, threads: null },
      batch,
      NOW,
    );
    expect(next.facts[0].sourceMessageIds).toEqual(["m1", "m2", "m3"]);
  });

  it("corrige et retire seulement les faits connus et non protégés", () => {
    const memory = memoryWith(
      fact("f1", "Anna est à Paris.", { sourceMessageIds: ["old"] }),
      fact("f2", "La porte est verrouillée.", { pinned: true }),
      fact("f3", "Jeff aime le thé.", { origin: "user" }),
      fact("f4", "Marc dort."),
    );
    const { memory: next, updated, retired } = applyMemoryUpdate(
      memory,
      {
        add: [],
        update: [
          { id: "f1", text: "Anna est rentrée à Lyon.", sources: [3] },
          { id: "f2", text: "La porte est ouverte.", sources: [1] },
          { id: "f99", text: "Inventé.", sources: [] },
        ],
        retire: ["f3", "f4", "f42"],
        state: null,
        threads: null,
      },
      batch,
      NOW,
    );
    expect(updated).toBe(1);
    expect(retired).toBe(1);
    expect(next.facts.map((f) => [f.id, f.text])).toEqual([
      ["f1", "Anna est rentrée à Lyon."],
      ["f2", "La porte est verrouillée."],
      ["f3", "Jeff aime le thé."],
    ]);
    expect(next.facts[0].sourceMessageIds).toEqual(["old", "m3"]);
  });

  it("n'ajoute pas un doublon d'un fait existant", () => {
    const memory = memoryWith(fact("f1", "Anna a un chat nommé Pistache."));
    const { added } = applyMemoryUpdate(
      memory,
      { add: [{ text: "anna a un chat nommé pistache", category: "person", sources: [1] }], update: [], retire: [], state: null, threads: null },
      batch,
      NOW,
    );
    expect(added).toBe(0);
  });
});

describe("factsKnownBy", () => {
  it("ne donne à un personnage que les faits établis devant lui, plus ceux de l'utilisateur", () => {
    const facts = [
      fact("f1", "Le code du coffre est 4512.", { sourceMessageIds: ["m1"] }),
      fact("f2", "Marc est arrivé en retard.", { sourceMessageIds: ["m1", "m5"] }),
      fact("f3", "C'est l'hiver.", { origin: "user" }),
    ];
    expect(factsKnownBy(facts, new Set(["m5", "m6"])).map((f) => f.id)).toEqual(["f2", "f3"]);
  });
});

describe("modifications manuelles", () => {
  it("ajoute un fait épinglé sans source, connu de tous", () => {
    const memory = addUserFact(null, "  Anna est allergique aux noix. ", "person", NOW);
    expect(memory.facts).toEqual([
      expect.objectContaining({
        id: "f1",
        text: "Anna est allergique aux noix.",
        pinned: true,
        origin: "user",
        sourceMessageIds: [],
      }),
    ]);
  });

  it("une correction rend le fait à l'utilisateur ; épingler et retirer agissent par identifiant", () => {
    let memory = memoryWith(fact("f1", "Anna a 30 ans."), fact("f2", "Marc a 40 ans."));
    memory = editFact(memory, "f1", { text: "Anna a 32 ans." }, NOW);
    expect(memory.facts[0]).toMatchObject({ text: "Anna a 32 ans.", origin: "user" });
    memory = setFactPinned(memory, "f2", true, NOW);
    expect(memory.facts[1].pinned).toBe(true);
    memory = removeFact(memory, "f1");
    expect(memory.facts.map((f) => f.id)).toEqual(["f2"]);
  });
});

describe("rewindMemory", () => {
  it("retire les faits tirés de messages disparus et garde ceux de l'utilisateur", () => {
    const memory: SceneMemory = {
      ...memoryWith(
        fact("f1", "Ancien fait.", { sourceMessageIds: ["m1"] }),
        fact("f2", "Fait disparu.", { sourceMessageIds: ["m1", "m9"] }),
        fact("f3", "Fait de l'utilisateur.", { origin: "user", sourceMessageIds: ["m9"] }),
      ),
      state: ["Quelque chose."],
    };
    const next = rewindMemory(memory, new Set(["m1"]));
    expect(next.facts.map((f) => f.id)).toEqual(["f1", "f3"]);
    expect(next.facts[1].sourceMessageIds).toEqual([]);
    expect(next.state).toEqual([]);
  });
});

describe("decodeMemory", () => {
  it("relit une mémoire enregistrée et répare le prochain identifiant", () => {
    const raw = JSON.stringify({
      version: 1,
      facts: [fact("f7", "Un fait."), { id: "f8" }, "n'importe quoi"],
      state: ["Un état."],
      threads: "pas une liste",
      nextFactNumber: 2,
    });
    const memory = decodeMemory(raw)!;
    expect(memory.facts.map((f) => f.id)).toEqual(["f7"]);
    expect(memory.threads).toEqual([]);
    expect(memory.nextFactNumber).toBe(8);
  });

  it("ignore une valeur illisible", () => {
    expect(decodeMemory(null)).toBeNull();
    expect(decodeMemory("{")).toBeNull();
  });
});

describe("memoryDigest", () => {
  it("regroupe les faits par catégorie et ajoute l'état", () => {
    const digest = memoryDigest(
      [fact("f1", "Anna et Marc sont frère et sœur.", { category: "relationship" })],
      ["Ils sont dans la cuisine."],
      frPrompts,
    );
    expect(digest).toBe(
      "Relations :\n- Anna et Marc sont frère et sœur.\n\nOù en est la scène :\n- Ils sont dans la cuisine.",
    );
    expect(memoryDigest([], [], frPrompts)).toBeNull();
  });
});
