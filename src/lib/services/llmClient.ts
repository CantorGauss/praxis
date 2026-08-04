import { invoke, Channel } from "@tauri-apps/api/core";
import type { ConnectionTarget, ModelProfile, Persona } from "../types";

export type ModelInfo = {
  id: string;
  /**
   * Capacité annoncée par le serveur, quand il la publie. Absente sur un
   * serveur strictement conforme à OpenAI, dont `/v1/models` ne décrit que
   * l'identifiant.
   */
  contextLength?: number;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "done" }
  | { type: "cancelled" }
  | { type: "error"; message: string };

export type StreamCallbacks = {
  onDelta: (content: string) => void;
  onDone: () => void;
  onCancelled: () => void;
  onError: (message: string) => void;
};

/**
 * Clés lues au fil de l'eau, par connexion. `LEGACY_KEY` désigne l'entrée
 * unique d'avant les connexions multiples, seulement consultée à la reprise.
 */
const apiKeyCache = new Map<string, string | null>();
const LEGACY_KEY = "\u0000legacy";

export async function getApiKey(connectionId: string | null): Promise<string | null> {
  const cacheKey = connectionId ?? LEGACY_KEY;
  if (!apiKeyCache.has(cacheKey)) {
    try {
      apiKeyCache.set(
        cacheKey,
        await invoke<string | null>("get_api_key", { connectionId }),
      );
    } catch {
      apiKeyCache.set(cacheKey, null);
    }
  }
  return apiKeyCache.get(cacheKey) ?? null;
}

export async function setApiKey(
  connectionId: string,
  value: string,
): Promise<void> {
  await invoke("set_api_key", { connectionId, value });
  apiKeyCache.set(connectionId, value || null);
}

/** Oublie la clé d'une connexion supprimée, cache compris. */
export async function forgetApiKey(connectionId: string): Promise<void> {
  try {
    await invoke("set_api_key", { connectionId, value: "" });
  } catch {
    // Un coffre indisponible ne doit pas empêcher de supprimer la connexion.
  }
  apiKeyCache.delete(connectionId);
}

export async function testConnection(target: ConnectionTarget): Promise<void> {
  const apiKey = await getApiKey(target.id);
  await invoke("test_connection", {
    baseUrl: target.baseUrl,
    apiKey,
    allowRemote: target.allowRemoteHosts,
  });
}

type RawModel = {
  id?: string;
  /** Capacité réellement allouée au chargement, puis maximum de l'architecture. */
  loaded_context_length?: unknown;
  max_context_length?: unknown;
  /** Passerelles distantes : capacité annoncée au premier niveau. */
  context_length?: unknown;
  /** Serveurs qui regroupent les caractéristiques du modèle sous `meta`. */
  meta?: { context_length?: unknown; model_max_tokens?: unknown } | null;
};

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

/**
 * Capacité annoncée pour un modèle, dans l'ordre du plus fiable au moins
 * fiable. Un serveur peut publier à la fois la capacité réellement allouée au
 * chargement et le maximum permis par l'architecture ; c'est la première qui
 * fait autorité, la seconde étant souvent hors de portée de la mémoire
 * disponible.
 *
 * Exporté pour les tests.
 */
export function readContextLength(model: RawModel): number | undefined {
  return (
    positiveInteger(model.loaded_context_length) ??
    positiveInteger(model.meta?.context_length) ??
    positiveInteger(model.meta?.model_max_tokens) ??
    positiveInteger(model.max_context_length) ??
    positiveInteger(model.context_length)
  );
}

export async function listModels(target: ConnectionTarget): Promise<ModelInfo[]> {
  const apiKey = await getApiKey(target.id);
  const raw = await invoke<{ data?: RawModel[] }>("list_models", {
    baseUrl: target.baseUrl,
    apiKey,
    allowRemote: target.allowRemoteHosts,
  });
  return (raw.data ?? [])
    .filter((m): m is RawModel & { id: string } => typeof m.id === "string")
    .map((m) => ({ id: m.id, contextLength: readContextLength(m) }));
}

export type ChatRequestOptions = {
  connection: ConnectionTarget;
  modelId: string;
  messages: ChatMessage[];
  persona: Pick<Persona, "temperature" | "topP" | "maxOutputTokens">;
  profile: ModelProfile;
  stream: boolean;
  temperatureOverride?: number;
  maxTokensOverride?: number;
};

export const OPENROUTER_NO_THINKING = {
  effort: "none",
  exclude: true,
} as const;

/**
 * Paramètres envoyés à tout serveur pour couper le raisonnement. Les deux
 * conventions coexistent selon les implémentations : `reasoning_effort` côté
 * requête, `enable_thinking` côté gabarit de conversation. Les envoyer
 * ensemble est le seul moyen de couvrir les serveurs locaux courants.
 *
 * C'est un écart assumé à la règle « omettre les champs inconnus » : les
 * serveurs locaux visés (mlx-serve, llama.cpp, vLLM) ignorent
 * silencieusement ce qu'ils ne comprennent pas, et un raisonnement laissé actif
 * consomme le budget de réponse sans rien produire de visible.
 */
export const NO_THINKING_PARAMETERS = {
  reasoning_effort: "none",
  chat_template_kwargs: { enable_thinking: false },
} as const;

export function noThinkingRequestParameters(
  connection: Pick<ConnectionTarget, "baseUrl">,
  parameters: Record<string, unknown> = {},
): Record<string, unknown> {
  let isOpenRouter = false;
  try {
    isOpenRouter = new URL(connection.baseUrl).hostname === "openrouter.ai";
  } catch {
    // L'URL invalide sera diagnostiquée par la requête réseau.
  }
  const body: Record<string, unknown> = {
    ...parameters,
    ...NO_THINKING_PARAMETERS,
    chat_template_kwargs: {
      ...(parameters.chat_template_kwargs as Record<string, unknown> | undefined),
      ...NO_THINKING_PARAMETERS.chat_template_kwargs,
    },
  };
  if (isOpenRouter) body.reasoning = { ...OPENROUTER_NO_THINKING };
  return body;
}

/**
 * Construit le corps de requête en n'incluant que les champs réellement
 * configurés : les serveurs locaux n'acceptent pas tous tous les paramètres.
 */
export function buildRequestBody(options: ChatRequestOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.modelId,
    messages: options.messages,
    stream: options.stream,
  };
  const temperature = options.temperatureOverride ?? options.persona.temperature;
  if (temperature !== null && temperature !== undefined) {
    body.temperature = temperature;
  }
  if (options.persona.topP !== null && options.persona.topP !== undefined) {
    body.top_p = options.persona.topP;
  }
  const maxTokens = options.maxTokensOverride ?? options.persona.maxOutputTokens;
  if (maxTokens) {
    body.max_tokens = maxTokens;
  }
  // Praxis n'expose pas de mode réfléchi : le raisonnement est coupé pour
  // toutes les requêtes, y compris celles d'un profil personnalisé.
  Object.assign(
    body,
    noThinkingRequestParameters(
      options.connection,
      options.profile.customParameters ?? {},
    ),
  );
  return body;
}

export async function streamChat(
  target: ConnectionTarget,
  requestId: string,
  body: Record<string, unknown>,
  callbacks: StreamCallbacks,
): Promise<void> {
  const apiKey = await getApiKey(target.id);
  const channel = new Channel<StreamEvent>();
  let finished = false;
  channel.onmessage = (event) => {
    if (finished) return;
    switch (event.type) {
      case "delta":
        callbacks.onDelta(event.content);
        break;
      case "done":
        finished = true;
        callbacks.onDone();
        break;
      case "cancelled":
        finished = true;
        callbacks.onCancelled();
        break;
      case "error":
        finished = true;
        callbacks.onError(event.message);
        break;
    }
  };
  await invoke("stream_chat", {
    requestId,
    baseUrl: target.baseUrl,
    apiKey,
    allowRemote: target.allowRemoteHosts,
    body,
    channel,
  });
}

export async function cancelStream(requestId: string): Promise<void> {
  await invoke("cancel_stream", { requestId });
}

export type CompletionResponse = {
  choices?: {
    message?: {
      content?: string | null;
      /** Modèles de raisonnement : la réflexion arrive à part du texte. */
      reasoning?: string | null;
      reasoning_content?: string | null;
    } | null;
    finish_reason?: string | null;
  }[];
  /** Certaines passerelles renvoient l'erreur dans le corps d'un HTTP 200. */
  error?: { message?: string } | null;
};

/**
 * Texte de la première completion. Une réponse sans contenu a plusieurs causes
 * très différentes — erreur transmise en HTTP 200, budget de tokens épuisé par
 * le raisonnement, texte rangé dans un champ à part — et les confondre sous un
 * même « sans contenu exploitable » ne laisse rien à corriger à l'utilisateur.
 *
 * Exporté pour les tests.
 */
export function extractCompletionText(raw: CompletionResponse): string {
  const gatewayError = raw.error?.message;
  if (typeof gatewayError === "string" && gatewayError.trim()) {
    throw new Error(`The server replied with an error: ${gatewayError}`);
  }

  const choice = raw.choices?.[0];
  const message = choice?.message;
  const reasoning = [message?.reasoning, message?.reasoning_content].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );

  // Une fin `length` signifie que le texte est incomplet, même si le serveur a
  // déjà renvoyé quelques lignes. Ne jamais enregistrer ce fragment comme un
  // résumé valide — c'est ainsi qu'une mémoire s'arrêtait au milieu d'une puce.
  if (choice?.finish_reason === "length") {
    throw new Error(
      "the model hit the token limit before finishing its response" +
        (reasoning ? ", its internal reasoning having used up too much room" : ""),
    );
  }

  if (typeof message?.content === "string" && message.content.trim()) {
    return message.content;
  }

  // Rien dans `content`, mais le modèle a bien produit du texte : mieux vaut
  // ce texte qu'un échec.
  if (reasoning) return reasoning;

  if (typeof message?.content === "string") {
    throw new Error("the server returned an empty response");
  }
  throw new Error("server response with no usable content");
}

/** Requête non streamée ; retourne le texte de la première completion. */
export async function chatCompletion(
  target: ConnectionTarget,
  body: Record<string, unknown>,
): Promise<string> {
  const apiKey = await getApiKey(target.id);
  const raw = await invoke<CompletionResponse>("chat_completion", {
    baseUrl: target.baseUrl,
    apiKey,
    allowRemote: target.allowRemoteHosts,
    body: { ...body, stream: false },
    timeoutMs: target.timeoutMs,
  });
  return extractCompletionText(raw);
}
