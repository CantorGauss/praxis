import { describe, expect, it } from "vitest";
import {
  buildRequestBody,
  extractCompletionText,
  readContextLength,
} from "../llmClient";

describe("buildRequestBody", () => {
  it("envoie la même limite que celle réservée pour la réponse", () => {
    const body = buildRequestBody({
      connection: {
        id: "local",
        baseUrl: "http://localhost:1234/v1",
        allowRemoteHosts: false,
        timeoutMs: 120_000,
      },
      modelId: "local-model",
      messages: [{ role: "user", content: "Bonjour" }],
      persona: { temperature: 0.7, topP: null, maxOutputTokens: null },
      profile: {
        modelId: "local-model",
      },
      stream: true,
      maxTokensOverride: 2048,
    });

    expect(body.max_tokens).toBe(2048);
  });

  it("force no-thinking sur OpenRouter même si un ancien profil dit l'inverse", () => {
    const body = buildRequestBody({
      connection: {
        id: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1/",
        allowRemoteHosts: true,
        timeoutMs: 120_000,
      },
      modelId: "google/gemini-flash-latest",
      messages: [{ role: "user", content: "Bonjour" }],
      persona: { temperature: 0.7, topP: null, maxOutputTokens: 512 },
      profile: {
        modelId: "google/gemini-flash-latest",
        customParameters: { reasoning: { effort: "high" } },
      },
      stream: true,
    });
    expect(body.reasoning).toEqual({ effort: "none", exclude: true });
  });
});

describe("extractCompletionText", () => {
  it("retourne le contenu de la première completion", () => {
    expect(
      extractCompletionText({ choices: [{ message: { content: "Résumé." } }] }),
    ).toBe("Résumé.");
  });

  it("remonte l'erreur transmise dans le corps d'une réponse réussie", () => {
    expect(() =>
      extractCompletionText({ error: { message: "No endpoints found" } }),
    ).toThrow(/No endpoints found/);
  });

  it("nomme la limite de tokens plutôt qu'un contenu manquant", () => {
    expect(() =>
      extractCompletionText({
        choices: [
          {
            message: { content: "", reasoning: "Voyons, il faut d'abord…" },
            finish_reason: "length",
          },
        ],
      }),
    ).toThrow(/token limit/);
  });

  it("refuse aussi un contenu partiel arrêté par la limite", () => {
    expect(() =>
      extractCompletionText({
        choices: [
          {
            message: { content: "**ÉTAT ACTUEL**\n* Leur relation amicale" },
            finish_reason: "length",
          },
        ],
      }),
    ).toThrow(/before finishing/);
  });

  it("se rabat sur le raisonnement quand il tient lieu de réponse", () => {
    expect(
      extractCompletionText({
        choices: [
          {
            message: { content: null, reasoning_content: "Anna, puis Marc." },
            finish_reason: "stop",
          },
        ],
      }),
    ).toBe("Anna, puis Marc.");
  });

  it("distingue une réponse vide d'une réponse sans contenu", () => {
    expect(() =>
      extractCompletionText({ choices: [{ message: { content: "   " } }] }),
    ).toThrow(/empty response/);
    expect(() => extractCompletionText({ choices: [] })).toThrow(
      /no usable content/,
    );
  });
});

describe("readContextLength", () => {
  it("lit la capacité annoncée par mlx-serve sous `meta`", () => {
    expect(
      readContextLength({
        id: "gemma",
        meta: { context_length: 8192, model_max_tokens: 131072 },
      }),
    ).toBe(8192);
  });

  it("préfère la capacité chargée au maximum de l'architecture", () => {
    // Certains serveurs publient les deux : un modèle 128K chargé à 8K ne peut
    // pas relire davantage, et retenir le maximum ferait échouer chaque requête.
    expect(
      readContextLength({
        id: "llama",
        loaded_context_length: 8192,
        max_context_length: 131072,
      }),
    ).toBe(8192);
  });

  it("se rabat sur le maximum quand le modèle n'est pas chargé", () => {
    expect(readContextLength({ id: "llama", max_context_length: 131072 })).toBe(
      131072,
    );
  });

  it("lit la capacité au premier niveau des passerelles", () => {
    expect(readContextLength({ id: "openai/gpt-4", context_length: 128000 })).toBe(
      128000,
    );
  });

  it("ne retient rien d'un serveur strictement conforme à OpenAI", () => {
    expect(readContextLength({ id: "gpt-4" })).toBeUndefined();
    expect(readContextLength({ id: "x", context_length: "grand" })).toBeUndefined();
    expect(readContextLength({ id: "x", meta: null })).toBeUndefined();
  });
});
