import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionTarget, EmotionalState, Persona } from "../../types";

const TEST_CONNECTION: ConnectionTarget = {
  id: "conn-1",
  baseUrl: "http://localhost:1234/v1",
  allowRemoteHosts: false,
  timeoutMs: 120_000,
};

vi.mock("../llmClient", () => ({
  chatCompletion: vi.fn(),
  noThinkingRequestParameters: vi.fn(
    (_connection: ConnectionTarget, parameters: Record<string, unknown>) =>
      parameters,
  ),
}));

vi.mock("../repositories", () => ({
  emotionRepo: { save: vi.fn() },
}));

import { chatCompletion } from "../llmClient";
import { emotionRepo } from "../repositories";
import { assessEmotionalReaction } from "../emotionAnalysis";

const persona: Persona = {
  id: "p1",
  name: "Anna",
  description: "Courageuse mais très attachée à Marc",
  systemPrompt: "Tu es vive, entière et spontanée.",
  stableTraits: ["loyale", "impulsive"],
  defaultModelId: null,
  temperature: 0.7,
  topP: null,
  maxOutputTokens: null,
  gender: "feminine",
  avatarSetId: null,
  avatarStyle: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const state: EmotionalState = {
  personaId: "p1",
  mood: "calm",
  valence: 0.2,
  energy: 0.55,
  warmth: 0.65,
  closeness: 0.5,
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("assessEmotionalReaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("transforme un choc en état utilisable avant la réplique", async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        mood: "shocked",
        intensity: 0.94,
        impulse: "se fige puis cherche Marc du regard",
        valenceDelta: -0.5,
        energyDelta: 0.4,
        warmthDelta: -0.08,
        closenessDelta: 0.02,
      }),
    );

    const result = await assessEmotionalReaction(
      TEST_CONNECTION,
      "local-model",
      persona,
      state,
      "Une explosion vient de détruire la pièce voisine.",
    );

    expect(result.reaction).toEqual({
      mood: "shocked",
      intensity: 0.94,
      impulse: "se fige puis cherche Marc du regard",
    });
    expect(result.state.mood).toBe("shocked");
    expect(result.state.valence).toBeLessThan(-0.2);
    expect(emotionRepo.save).toHaveBeenCalledWith(result.state);

    const request = vi.mocked(chatCompletion).mock.calls[0][1];
    const messages = request.messages as { content: string }[];
    expect(messages[0].content).toContain("IMMEDIATE");
    expect(messages[0].content).toContain("without automatically minimising");
    expect(messages[1].content).toContain("before they speak");
  });

  it("conserve l'état courant si l'analyse échoue", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(new Error("serveur indisponible"));
    const result = await assessEmotionalReaction(
      TEST_CONNECTION,
      "local-model",
      persona,
      state,
      "Bonjour",
    );
    expect(result).toEqual({ state, reaction: null });
    expect(emotionRepo.save).not.toHaveBeenCalled();
  });
});
