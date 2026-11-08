import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeObjective,
  decodeObjectives,
  encodeObjectives,
  inventObjectives,
  mergeObjectives,
  missingObjectives,
  parseObjectives,
} from "../objectives";
import * as llm from "../llmClient";
import { promptPack } from "../../i18n/prompts";
import { assemblePrompt } from "../promptAssembler";
import { chooseSpeakers } from "../director";
import type { Persona, SceneObjective } from "../../types";

const NOW = "2026-11-08T10:00:00.000Z";
const ANNA = { id: "anna", name: "Anna" };
const MARC = { id: "marc", name: "Marc" };

function objective(personaId: string, goal: string, extra: Partial<SceneObjective> = {}): SceneObjective {
  return { personaId, goal, secret: null, origin: "auto", createdAt: NOW, updatedAt: NOW, ...extra };
}

afterEach(() => vi.restoreAllMocks());

describe("parseObjectives", () => {
  it("lit un tableau JSON, même entouré de commentaire", () => {
    const raw =
      'Voici :\n[{"name":"Anna","goal":"obtenir de Marc qu\'il avoue","secret":"Anna a lu la lettre."},' +
      '{"name":"marc","goal":"gagner du temps","secret":""}]';
    expect(parseObjectives(raw, [ANNA, MARC])).toEqual([
      { personaId: "anna", goal: "obtenir de Marc qu'il avoue", secret: "Anna a lu la lettre." },
      { personaId: "marc", goal: "gagner du temps", secret: null },
    ]);
  });

  it("accepte les clés françaises et ignore les inconnus, les doublons et les buts vides", () => {
    const raw = JSON.stringify([
      { nom: "Anna", objectif: "partir avant minuit" },
      { nom: "Anna", objectif: "autre chose" },
      { nom: "Zoé", objectif: "exister" },
      { nom: "Marc", objectif: "  " },
    ]);
    expect(parseObjectives(raw, [ANNA, MARC])).toEqual([
      { personaId: "anna", goal: "partir avant minuit", secret: null },
    ]);
  });

  it("rend une liste vide sur une réponse illisible", () => {
    expect(parseObjectives("Je ne peux pas.", [ANNA])).toEqual([]);
    expect(parseObjectives("[{oops}]", [ANNA])).toEqual([]);
  });

  it("tronque un objectif trop long", () => {
    const raw = JSON.stringify([{ name: "Anna", goal: "convaincre ".repeat(60) }]);
    const [draft] = parseObjectives(raw, [ANNA]);
    expect(draft.goal.length).toBeLessThanOrEqual(301);
    expect(draft.goal.endsWith("…")).toBe(true);
  });
});

describe("état des objectifs", () => {
  it("un but vidé à la main compte comme attribué mais ne joue pas", () => {
    const list = [objective("anna", "", { origin: "user" })];
    expect(missingObjectives(list, ["anna", "marc"])).toEqual(["marc"]);
    expect(activeObjective(list, "anna")).toBeNull();
  });

  it("ne réécrit pas un objectif de l'utilisateur, sauf demande explicite", () => {
    const list = [objective("anna", "le mien", { origin: "user" }), objective("marc", "ancien")];
    const drafts = [
      { personaId: "anna", goal: "nouveau", secret: null },
      { personaId: "marc", goal: "nouveau", secret: "s" },
    ];
    const merged = mergeObjectives(list, drafts, "later");
    expect(merged.map((o) => o.goal)).toEqual(["le mien", "nouveau"]);
    expect(merged[1]).toMatchObject({ createdAt: NOW, updatedAt: "later", secret: "s" });
    expect(mergeObjectives(list, drafts, "later", true).map((o) => o.goal)).toEqual(["nouveau", "nouveau"]);
  });

  it("survit à un aller-retour en base et à une colonne abîmée", () => {
    const list = [objective("anna", "partir", { secret: "a menti" })];
    expect(decodeObjectives(encodeObjectives(list))).toEqual(list);
    expect(encodeObjectives([])).toBeNull();
    expect(decodeObjectives("pas du json")).toEqual([]);
    expect(decodeObjectives('[{"personaId":1}]')).toEqual([]);
  });
});

describe("inventObjectives", () => {
  const cast: Pick<Persona, "id" | "name" | "description" | "systemPrompt">[] = [
    { id: "anna", name: "Anna", description: "sœur aînée", systemPrompt: "Tu es Anna, rancunière." },
    { id: "marc", name: "Marc", description: null, systemPrompt: "" },
  ];
  const base = {
    connection: { id: "local", baseUrl: "http://localhost:8080/v1", allowRemoteHosts: false, timeoutMs: 1000 },
    modelId: "model",
    cast,
    sceneDescription: "Le notaire est en retard.",
    summary: null,
    recentMessages: [],
    label: () => "?",
    userName: "Jeff",
    pack: promptPack("fr"),
  };

  it("ne demande que les absents et montre ceux déjà donnés", async () => {
    const chat = vi
      .spyOn(llm, "chatCompletion")
      .mockResolvedValue('[{"name":"Marc","goal":"faire signer Anna"}]');
    const drafts = await inventObjectives({
      ...base,
      forIds: ["marc"],
      existing: [objective("anna", "retarder la signature")],
    });
    expect(drafts).toEqual([{ personaId: "marc", goal: "faire signer Anna", secret: null }]);
    const sent = JSON.stringify(chat.mock.calls[0][1]);
    expect(sent).toContain("Anna veut : retarder la signature");
    expect(sent).toContain("Donne un objectif à : Marc.");
    expect(sent).toContain("rancunière");
  });

  it("rend une liste vide si le serveur échoue", async () => {
    vi.spyOn(llm, "chatCompletion").mockRejectedValue(new Error("down"));
    expect(await inventObjectives({ ...base, forIds: ["anna"], existing: [] })).toEqual([]);
  });
});

describe("objectifs dans les prompts", () => {
  it("le personnage reçoit son but en haut et juste avant de répondre", () => {
    const persona: Persona = {
      id: "anna", name: "Anna", description: null, systemPrompt: "Tu es Anna.",
      stableTraits: [], defaultModelId: null, temperature: 0.7, topP: null,
      maxOutputTokens: 128, gender: "feminine", avatarSetId: null, avatarStyle: null,
      createdAt: NOW, updatedAt: NOW,
    };
    const assembled = assemblePrompt({
      persona,
      state: null,
      temporal: {
        localIso: NOW, localTime: "10:00", weekday: "dimanche", dayPeriod: "morning",
        elapsedMs: null, elapsedLabel: "premier échange",
      },
      recentMessages: [],
      contextTokens: 8000,
      reserveOutputTokens: 200,
      objective: { goal: "obtenir les clés", secret: "Anna a perdu le double." },
      pack: promptPack("fr"),
    });
    expect(assembled.system).toContain("Ton objectif : obtenir les clés");
    expect(assembled.system).toContain("Ce que tu caches : Anna a perdu le double.");
    const last = assembled.messages[assembled.messages.length - 1].content;
    expect(last).toContain("[TON BUT]\nobtenir les clés");
  });

  it("le metteur en scène voit les buts et, quand on écoute, ne laisse pas la scène retomber", async () => {
    const chat = vi.spyOn(llm, "chatCompletion").mockResolvedValue('["Marc"]');
    await chooseSpeakers({
      listening: true,
      connection: { id: "local", baseUrl: "http://localhost:8080/v1", allowRemoteHosts: false, timeoutMs: 1000 },
      modelId: "model",
      participants: [ANNA, MARC],
      descriptions: {},
      goals: { anna: "obtenir les clés", marc: null },
      recentMessages: [],
      label: () => "?",
      userName: "Jeff",
      afterUserMessage: false,
      pack: promptPack("fr"),
    });
    const sent = JSON.stringify(chat.mock.calls[0][1]);
    expect(sent).toContain("- Anna — veut : obtenir les clés");
    expect(sent).toContain("Ne rends pas de tableau vide");
  });

  it("hors écoute, le metteur en scène peut rendre la parole à l'utilisateur", async () => {
    const chat = vi.spyOn(llm, "chatCompletion").mockResolvedValue("[]");
    const chosen = await chooseSpeakers({
      connection: { id: "local", baseUrl: "http://localhost:8080/v1", allowRemoteHosts: false, timeoutMs: 1000 },
      modelId: "model",
      participants: [ANNA, MARC],
      descriptions: {},
      goals: { anna: "obtenir les clés", marc: null },
      recentMessages: [],
      label: () => "?",
      userName: "Jeff",
      afterUserMessage: false,
      pack: promptPack("fr"),
    });
    const sent = JSON.stringify(chat.mock.calls[0][1]);
    expect(sent).toContain("veut : obtenir les clés");
    expect(sent).not.toContain("Ne rends pas de tableau vide");
    expect(sent).toContain("Jeff reprend la main");
    expect(chosen).toEqual([]);
  });
});
