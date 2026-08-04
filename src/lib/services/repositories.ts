import { invoke } from "@tauri-apps/api/core";
import { getDb, newId, nowIso } from "./db";
import type {
  AppSettings,
  AvatarVariant,
  Connection,
  Conversation,
  ConversationParticipant,
  EmotionalState,
  Message,
  MessageKind,
  MessageStatus,
  ModelProfile,
  Persona,
} from "../types";
import { DEFAULT_SETTINGS, DEFAULT_TIMEOUT_MS } from "../types";
import { detectLocale, isLocale, type Locale } from "../i18n/locales";
import { getApiKey, setApiKey } from "./llmClient";
import { neutralState } from "./emotion";
import { normalizeAppearance, type AvatarAppearance } from "./avatar";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "./inference";

// ---------------------------------------------------------------------------
// Réglages (table clé/valeur)
// ---------------------------------------------------------------------------

export const settingsRepo = {
  async load(): Promise<AppSettings> {
    const db = await getDb();
    const rows = await db.select<{ key: string; value: string }[]>(
      "SELECT key, value FROM settings",
    );
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const parse = <T>(key: string, fallback: T): T => {
      if (!(key in map)) return fallback;
      try {
        return JSON.parse(map[key]) as T;
      } catch {
        return fallback;
      }
    };
    const oneOf = <T extends string>(key: string, values: readonly T[], fallback: T): T => {
      const value = parse(key, fallback);
      return values.includes(value) ? value : fallback;
    };
    let historyWindowMessages = parse(
      "historyWindowMessages",
      DEFAULT_SETTINGS.historyWindowMessages,
    );
    // Migration ponctuelle du précédent défaut (24) vers le réglage plus
    // réactif (18). Le marqueur évite d'écraser un choix futur de l'utilisateur.
    if (!parse("summaryPerformanceV2", false)) {
      if (historyWindowMessages === 24) historyWindowMessages = 18;
      await db.execute(
        "INSERT INTO settings (key, value) VALUES ($1, $2) " +
          "ON CONFLICT(key) DO UPDATE SET value = $2",
        ["historyWindowMessages", JSON.stringify(historyWindowMessages)],
      );
      await db.execute(
        "INSERT INTO settings (key, value) VALUES ($1, $2) " +
          "ON CONFLICT(key) DO UPDATE SET value = $2",
        ["summaryPerformanceV2", "true"],
      );
    }
    // Une base qui a déjà servi vient de la version francophone : on ne fait
    // pas basculer en anglais une installation existante, sinon les
    // personnages changent de langue du jour au lendemain. Une base neuve
    // suit la langue du système, et retombe sur l'anglais par défaut.
    const upgradeFromFrenchOnly = !("uiLocale" in map) && parse("onboarded", false);
    const initialLocale: Locale = upgradeFromFrenchOnly ? "fr" : detectLocale();

    return {
      uiLocale: isLocale(parse("uiLocale", initialLocale))
        ? parse("uiLocale", initialLocale)
        : initialLocale,
      conversationLanguage: isLocale(parse("conversationLanguage", initialLocale))
        ? parse("conversationLanguage", initialLocale)
        : initialLocale,
      logicalContextTokens: parse(
        "logicalContextTokens",
        DEFAULT_SETTINGS.logicalContextTokens,
      ),
      activeConnectionId: parse(
        "activeConnectionId",
        DEFAULT_SETTINGS.activeConnectionId,
      ),
      emotionEnabled: parse("emotionEnabled", DEFAULT_SETTINGS.emotionEnabled),
      emotionAnalysisEnabled: parse(
        "emotionAnalysisEnabled",
        DEFAULT_SETTINGS.emotionAnalysisEnabled,
      ),
      avatarsEnabled: parse("avatarsEnabled", DEFAULT_SETTINGS.avatarsEnabled),
      interfaceTheme: oneOf(
        "interfaceTheme",
        ["system", "dark", "light"] as const,
        DEFAULT_SETTINGS.interfaceTheme,
      ),
      chatTextSize: oneOf(
        "chatTextSize",
        ["small", "normal", "large"] as const,
        DEFAULT_SETTINGS.chatTextSize,
      ),
      interfaceDensity: oneOf(
        "interfaceDensity",
        ["compact", "comfortable"] as const,
        DEFAULT_SETTINGS.interfaceDensity,
      ),
      defaultPersonaId: parse("defaultPersonaId", DEFAULT_SETTINGS.defaultPersonaId),
      onboarded: parse("onboarded", DEFAULT_SETTINGS.onboarded),
      // Vide reste vide : le libellé générique de la langue prend le relais.
      userName: parse("userName", DEFAULT_SETTINGS.userName),
      userGender: parse("userGender", DEFAULT_SETTINGS.userGender),
      sceneDirector: parse("sceneDirector", DEFAULT_SETTINGS.sceneDirector),
      sceneAutoRounds: parse("sceneAutoRounds", DEFAULT_SETTINGS.sceneAutoRounds),
      idleChatterSeconds: parse(
        "idleChatterSeconds",
        DEFAULT_SETTINGS.idleChatterSeconds,
      ),
      historyWindowMessages,
    };
  },

  async save(settings: AppSettings): Promise<void> {
    const db = await getDb();
    for (const [key, value] of Object.entries(settings)) {
      await db.execute(
        "INSERT INTO settings (key, value) VALUES ($1, $2) " +
          "ON CONFLICT(key) DO UPDATE SET value = $2",
        [key, JSON.stringify(value)],
      );
    }
  },
};

// ---------------------------------------------------------------------------
// Connexions (serveurs d'inférence)
// ---------------------------------------------------------------------------

type ConnectionRow = {
  id: string;
  name: string;
  base_url: string;
  allow_remote: number;
  timeout_ms: number;
  selected_model_id: string | null;
  created_at: string;
  updated_at: string;
};

function connectionFromRow(r: ConnectionRow): Connection {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    allowRemoteHosts: Boolean(r.allow_remote),
    timeoutMs: r.timeout_ms,
    selectedModelId: r.selected_model_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type ConnectionInput = Omit<Connection, "id" | "createdAt" | "updatedAt">;

export const connectionRepo = {
  async list(): Promise<Connection[]> {
    const db = await getDb();
    const rows = await db.select<ConnectionRow[]>(
      "SELECT * FROM connections ORDER BY created_at ASC",
    );
    return rows.map(connectionFromRow);
  },

  async create(input: ConnectionInput): Promise<Connection> {
    const db = await getDb();
    const id = newId();
    const now = nowIso();
    await db.execute(
      `INSERT INTO connections
        (id, name, base_url, allow_remote, timeout_ms, selected_model_id,
         created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        input.name,
        input.baseUrl,
        input.allowRemoteHosts ? 1 : 0,
        input.timeoutMs,
        input.selectedModelId,
        now,
        now,
      ],
    );
    return { ...input, id, createdAt: now, updatedAt: now };
  },

  async update(connection: Connection): Promise<Connection> {
    const db = await getDb();
    const now = nowIso();
    await db.execute(
      `UPDATE connections SET
        name = $2, base_url = $3, allow_remote = $4, timeout_ms = $5,
        selected_model_id = $6, updated_at = $7
       WHERE id = $1`,
      [
        connection.id,
        connection.name,
        connection.baseUrl,
        connection.allowRemoteHosts ? 1 : 0,
        connection.timeoutMs,
        connection.selectedModelId,
        now,
      ],
    );
    return { ...connection, updatedAt: now };
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM connections WHERE id = $1", [id]);
  },

  /**
   * Liste les connexions en garantissant qu'il y en a au moins une. Les
   * réglages d'avant — une seule adresse, un seul modèle, une seule clé —
   * deviennent la première connexion, sans rien redemander à l'utilisateur.
   */
  async listOrSeed(): Promise<Connection[]> {
    const existing = await this.list();
    if (existing.length > 0) return existing;

    const db = await getDb();
    const rows = await db.select<{ key: string; value: string }[]>(
      "SELECT key, value FROM settings WHERE key IN " +
        "('baseUrl','timeoutMs','allowRemoteHosts','selectedModelId')",
    );
    const legacy = new Map(rows.map((r) => [r.key, r.value]));
    const read = <T>(key: string, fallback: T): T => {
      const raw = legacy.get(key);
      if (raw === undefined) return fallback;
      try {
        const parsed = JSON.parse(raw) as T;
        return parsed === null ? fallback : parsed;
      } catch {
        return fallback;
      }
    };

    const baseUrl = read("baseUrl", "http://localhost:8080/v1");
    const allowRemoteHosts = read("allowRemoteHosts", false);
    const connection = await this.create({
      // Le nom décrit ce à quoi on se connecte, pas comment on l'appelait.
      name: allowRemoteHosts ? "Serveur configuré" : "Serveur local",
      baseUrl,
      allowRemoteHosts,
      timeoutMs: read("timeoutMs", DEFAULT_TIMEOUT_MS),
      selectedModelId: read<string | null>("selectedModelId", null),
    });

    // La clé du coffre appartenait à cette configuration : elle la suit.
    try {
      const key = await getApiKey(null);
      if (key) await setApiKey(connection.id, key);
    } catch {
      // Coffre indisponible : la connexion existe, la clé sera ressaisie.
    }
    return [connection];
  },
};

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

type PersonaRow = {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  stable_traits: string;
  default_model_id: string | null;
  temperature: number;
  top_p: number | null;
  max_output_tokens: number | null;
  gender: Persona["gender"] | null;
  avatar_set_id: string | null;
  avatar_style: string | null;
  created_at: string;
  updated_at: string;
};

/** L'apparence stockée est complétée : un JSON absent ou abîmé retombe sur
 *  l'apparence déduite de l'identifiant. */
function parseAvatarStyle(raw: string | null, id: string): AvatarAppearance | null {
  if (!raw) return null;
  try {
    return normalizeAppearance(JSON.parse(raw), id);
  } catch {
    return null;
  }
}

function personaFromRow(r: PersonaRow): Persona {
  let traits: string[] = [];
  try {
    const parsed = JSON.parse(r.stable_traits);
    if (Array.isArray(parsed)) traits = parsed.filter((t) => typeof t === "string");
  } catch {
    traits = [];
  }
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    systemPrompt: r.system_prompt,
    stableTraits: traits,
    defaultModelId: r.default_model_id,
    temperature: r.temperature,
    topP: r.top_p,
    maxOutputTokens: r.max_output_tokens,
    gender: r.gender ?? "neutral",
    avatarSetId: r.avatar_set_id,
    avatarStyle: parseAvatarStyle(r.avatar_style, r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const personaRepo = {
  async list(): Promise<Persona[]> {
    const db = await getDb();
    const rows = await db.select<PersonaRow[]>(
      "SELECT * FROM personas ORDER BY created_at ASC",
    );
    return rows.map(personaFromRow);
  },

  async get(id: string): Promise<Persona | null> {
    const db = await getDb();
    const rows = await db.select<PersonaRow[]>(
      "SELECT * FROM personas WHERE id = $1",
      [id],
    );
    return rows.length ? personaFromRow(rows[0]) : null;
  },

  async create(
    input: Omit<Persona, "id" | "createdAt" | "updatedAt">,
  ): Promise<Persona> {
    const db = await getDb();
    const id = newId();
    const now = nowIso();
    await db.execute(
      `INSERT INTO personas
        (id, name, description, system_prompt, stable_traits, default_model_id,
         temperature, top_p, max_output_tokens, thinking_mode, gender,
         avatar_set_id, avatar_style, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        input.name,
        input.description,
        input.systemPrompt,
        JSON.stringify(input.stableTraits),
        input.defaultModelId,
        input.temperature,
        input.topP,
        input.maxOutputTokens,
        // Colonne conservée pour ne pas réécrire la base ; Praxis ne raisonne
        // jamais, et son défaut SQL ('default') serait trompeur.
        "off",
        input.gender,
        input.avatarSetId,
        input.avatarStyle ? JSON.stringify(input.avatarStyle) : null,
        now,
        now,
      ],
    );
    // État émotionnel neutre créé avec la persona.
    const state = neutralState(id, new Date());
    await emotionRepo.save(state);
    return { ...input, id, createdAt: now, updatedAt: now };
  },

  async update(persona: Persona): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE personas SET
        name = $2, description = $3, system_prompt = $4, stable_traits = $5,
        default_model_id = $6, temperature = $7, top_p = $8,
        max_output_tokens = $9, thinking_mode = $10, gender = $11,
        avatar_set_id = $12, avatar_style = $13, updated_at = $14
       WHERE id = $1`,
      [
        persona.id,
        persona.name,
        persona.description,
        persona.systemPrompt,
        JSON.stringify(persona.stableTraits),
        persona.defaultModelId,
        persona.temperature,
        persona.topP,
        persona.maxOutputTokens,
        "off",
        persona.gender,
        persona.avatarSetId,
        persona.avatarStyle ? JSON.stringify(persona.avatarStyle) : null,
        nowIso(),
      ],
    );
  },

  /**
   * Conversations concernées par une suppression : celles où la persona est
   * seule en scène disparaissent, les conversations de groupe survivent.
   */
  async usage(id: string): Promise<{ solo: number; shared: number }> {
    const db = await getDb();
    const rows = await db.select<{ n: number; total: number }[]>(
      `SELECT COUNT(*) AS n,
              (SELECT COUNT(*) FROM conversation_personas cp2
                WHERE cp2.conversation_id = cp.conversation_id) AS total
         FROM conversation_personas cp
        WHERE cp.persona_id = $1
        GROUP BY total`,
      [id],
    );
    let solo = 0;
    let shared = 0;
    for (const row of rows) {
      if (row.total <= 1) solo += row.n;
      else shared += row.n;
    }
    return { solo, shared };
  },

  /** Identifiants des conversations où la persona est la seule en scène. */
  async soloConversationIds(id: string): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<{ conversation_id: string }[]>(
      `SELECT cp.conversation_id FROM conversation_personas cp
        WHERE cp.persona_id = $1
          AND (SELECT COUNT(*) FROM conversation_personas cp2
                WHERE cp2.conversation_id = cp.conversation_id) <= 1`,
      [id],
    );
    return rows.map((r) => r.conversation_id);
  },

  /**
   * Supprime la persona et son état émotionnel.
   * Les conversations où elle était seule sont supprimées ; celles de groupe
   * sont conservées : la persona quitte la scène, ses messages restent visibles
   * grâce au nom copié dans chaque message.
   */
  async remove(id: string): Promise<void> {
    const db = await getDb();
    const soloIds = await this.soloConversationIds(id);
    for (const conversationId of soloIds) {
      await conversationRepo.remove(conversationId);
    }
    // Conversations de groupe : la persona quitte la scène.
    await db.execute("DELETE FROM conversation_personas WHERE persona_id = $1", [id]);
    // Une conversation dont la persona principale part est réattribuée.
    const orphans = await db.select<{ id: string }[]>(
      "SELECT id FROM conversations WHERE persona_id = $1",
      [id],
    );
    for (const orphan of orphans) {
      const remaining = await db.select<{ persona_id: string }[]>(
        "SELECT persona_id FROM conversation_personas WHERE conversation_id = $1 ORDER BY position ASC LIMIT 1",
        [orphan.id],
      );
      if (remaining.length > 0) {
        await db.execute("UPDATE conversations SET persona_id = $2 WHERE id = $1", [
          orphan.id,
          remaining[0].persona_id,
        ]);
      } else {
        await conversationRepo.remove(orphan.id);
      }
    }
    await db.execute("DELETE FROM emotional_states WHERE persona_id = $1", [id]);
    // `messages.persona_id` passe à NULL (ON DELETE SET NULL) ; `persona_name`
    // conserve le nom affiché des répliques déjà écrites.
    await db.execute("DELETE FROM personas WHERE id = $1", [id]);
  },
};

// ---------------------------------------------------------------------------
// État émotionnel
// ---------------------------------------------------------------------------

type StateRow = {
  persona_id: string;
  mood: EmotionalState["mood"];
  valence: number;
  energy: number;
  warmth: number;
  closeness: number;
  updated_at: string;
};

export const emotionRepo = {
  async get(personaId: string): Promise<EmotionalState | null> {
    const db = await getDb();
    const rows = await db.select<StateRow[]>(
      "SELECT * FROM emotional_states WHERE persona_id = $1",
      [personaId],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      personaId: r.persona_id,
      mood: r.mood,
      valence: r.valence,
      energy: r.energy,
      warmth: r.warmth,
      closeness: r.closeness,
      updatedAt: r.updated_at,
    };
  },

  async save(state: EmotionalState): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO emotional_states
        (persona_id, mood, valence, energy, warmth, closeness, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(persona_id) DO UPDATE SET
        mood = $2, valence = $3, energy = $4, warmth = $5,
        closeness = $6, updated_at = $7`,
      [
        state.personaId,
        state.mood,
        state.valence,
        state.energy,
        state.warmth,
        state.closeness,
        state.updatedAt,
      ],
    );
  },
};

// ---------------------------------------------------------------------------
// Conversations et messages
// ---------------------------------------------------------------------------

type ConversationRow = {
  id: string;
  persona_id: string;
  title: string;
  scene_description: string | null;
  summary: string | null;
  summary_through_message_id: string | null;
  created_at: string;
  updated_at: string;
  last_interaction_at: string | null;
};

function conversationFromRow(r: ConversationRow): Conversation {
  return {
    id: r.id,
    personaId: r.persona_id,
    title: r.title,
    sceneDescription: r.scene_description,
    summary: r.summary,
    summaryThroughMessageId: r.summary_through_message_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastInteractionAt: r.last_interaction_at,
  };
}

export const conversationRepo = {
  async list(): Promise<Conversation[]> {
    const db = await getDb();
    const rows = await db.select<ConversationRow[]>(
      "SELECT * FROM conversations ORDER BY COALESCE(last_interaction_at, updated_at) DESC",
    );
    return rows.map(conversationFromRow);
  },

  /**
   * `participantIds` définit la scène ; le premier est la persona principale.
   * Une conversation à un seul personnage est le cas particulier d'un seul id.
   */
  async create(
    personaId: string,
    title: string,
    participantIds: string[] = [personaId],
    sceneDescription: string | null = null,
  ): Promise<Conversation> {
    const db = await getDb();
    const id = newId();
    const now = nowIso();
    await db.execute(
      `INSERT INTO conversations
        (id, persona_id, title, scene_description, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, personaId, title, sceneDescription, now, now],
    );
    await participantRepo.replace(id, participantIds);
    return {
      id,
      personaId,
      title,
      sceneDescription,
      summary: null,
      summaryThroughMessageId: null,
      createdAt: now,
      updatedAt: now,
      lastInteractionAt: null,
    };
  },

  async update(conversation: Conversation): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE conversations SET
        persona_id = $2, title = $3, summary = $4,
        summary_through_message_id = $5, updated_at = $6, last_interaction_at = $7,
        scene_description = $8
       WHERE id = $1`,
      [
        conversation.id,
        conversation.personaId,
        conversation.title,
        conversation.summary,
        conversation.summaryThroughMessageId,
        nowIso(),
        conversation.lastInteractionAt,
        conversation.sceneDescription,
      ],
    );
  },

  async touch(id: string): Promise<string> {
    const db = await getDb();
    const now = nowIso();
    await db.execute(
      "UPDATE conversations SET last_interaction_at = $2, updated_at = $2 WHERE id = $1",
      [id, now],
    );
    return now;
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM messages WHERE conversation_id = $1", [id]);
    await db.execute("DELETE FROM conversation_personas WHERE conversation_id = $1", [
      id,
    ]);
    await db.execute("DELETE FROM conversations WHERE id = $1", [id]);
  },
};

// ---------------------------------------------------------------------------
// Participants d'une conversation (scène à plusieurs personnages)
// ---------------------------------------------------------------------------

type ParticipantRow = {
  conversation_id: string;
  persona_id: string;
  position: number;
  active: number;
};

function participantFromRow(r: ParticipantRow): ConversationParticipant {
  return {
    conversationId: r.conversation_id,
    personaId: r.persona_id,
    position: r.position,
    active: Boolean(r.active),
  };
}

export const participantRepo = {
  async list(conversationId: string): Promise<ConversationParticipant[]> {
    const db = await getDb();
    const rows = await db.select<ParticipantRow[]>(
      "SELECT * FROM conversation_personas WHERE conversation_id = $1 ORDER BY position ASC",
      [conversationId],
    );
    return rows.map(participantFromRow);
  },

  /** Tous les participants, pour afficher la composition dans la liste. */
  async listAll(): Promise<ConversationParticipant[]> {
    const db = await getDb();
    const rows = await db.select<ParticipantRow[]>(
      "SELECT * FROM conversation_personas ORDER BY conversation_id, position ASC",
    );
    return rows.map(participantFromRow);
  },

  /** Remplace la scène ; l'ordre du tableau devient l'ordre de parole. */
  async replace(conversationId: string, personaIds: string[]): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM conversation_personas WHERE conversation_id = $1", [
      conversationId,
    ]);
    let position = 0;
    for (const personaId of personaIds) {
      await db.execute(
        `INSERT OR IGNORE INTO conversation_personas
          (conversation_id, persona_id, position, active)
         VALUES ($1,$2,$3,1)`,
        [conversationId, personaId, position],
      );
      position += 1;
    }
  },

  async setActive(
    conversationId: string,
    personaId: string,
    active: boolean,
  ): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE conversation_personas SET active = $3 WHERE conversation_id = $1 AND persona_id = $2",
      [conversationId, personaId, active ? 1 : 0],
    );
  },

  /**
   * Fait entrer un personnage. S'il était déjà venu, il retrouve sa place
   * dans l'ordre de parole ; sinon il prend la dernière.
   */
  async join(conversationId: string, personaId: string): Promise<void> {
    const db = await getDb();
    const existing = await db.select<{ persona_id: string }[]>(
      "SELECT persona_id FROM conversation_personas WHERE conversation_id = $1 AND persona_id = $2",
      [conversationId, personaId],
    );
    if (existing.length > 0) {
      await this.setActive(conversationId, personaId, true);
      return;
    }
    const rows = await db.select<{ next: number | null }[]>(
      "SELECT MAX(position) + 1 AS next FROM conversation_personas WHERE conversation_id = $1",
      [conversationId],
    );
    await db.execute(
      `INSERT INTO conversation_personas (conversation_id, persona_id, position, active)
       VALUES ($1,$2,$3,1)`,
      [conversationId, personaId, rows[0]?.next ?? 0],
    );
  },

  /** Fait sortir un personnage : il ne parle plus, ses répliques restent. */
  async leave(conversationId: string, personaId: string): Promise<void> {
    await this.setActive(conversationId, personaId, false);
  },
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: Message["role"];
  content: string;
  status: MessageStatus;
  created_at: string;
  persona_id: string | null;
  persona_name: string | null;
  kind: MessageKind | null;
  addressee: string | null;
};

function messageFromRow(r: MessageRow): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    kind: r.kind ?? "speech",
    content: r.content,
    status: r.status,
    createdAt: r.created_at,
    personaId: r.persona_id,
    personaName: r.persona_name,
    addressee: r.addressee,
  };
}

export type MessageSpeaker = { id: string; name: string } | null;

export const messageRepo = {
  async list(conversationId: string): Promise<Message[]> {
    const db = await getDb();
    const rows = await db.select<MessageRow[]>(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC",
      [conversationId],
    );
    return rows.map(messageFromRow);
  },

  /**
   * `speaker` identifie le personnage qui parle ; null pour l'utilisateur.
   * Le nom est copié dans le message pour rester lisible même si la persona
   * est supprimée plus tard.
   */
  async create(
    conversationId: string,
    role: Message["role"],
    content: string,
    status: MessageStatus,
    speaker: MessageSpeaker = null,
    kind: MessageKind = "speech",
    addressee: string | null = null,
  ): Promise<Message> {
    const db = await getDb();
    const id = newId();
    const now = nowIso();
    await db.execute(
      `INSERT INTO messages
        (id, conversation_id, role, content, status, created_at,
         persona_id, persona_name, kind, addressee)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        conversationId,
        role,
        content,
        status,
        now,
        speaker?.id ?? null,
        speaker?.name ?? null,
        kind,
        addressee,
      ],
    );
    return {
      id,
      conversationId,
      role,
      kind,
      content,
      status,
      createdAt: now,
      personaId: speaker?.id ?? null,
      personaName: speaker?.name ?? null,
      addressee,
    };
  },

  async update(
    id: string,
    content: string,
    status: MessageStatus,
    addressee?: string | null,
  ): Promise<void> {
    const db = await getDb();
    if (addressee === undefined) {
      await db.execute("UPDATE messages SET content = $2, status = $3 WHERE id = $1", [
        id,
        content,
        status,
      ]);
      return;
    }
    await db.execute(
      "UPDATE messages SET content = $2, status = $3, addressee = $4 WHERE id = $1",
      [id, content, status, addressee],
    );
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM messages WHERE id = $1", [id]);
  },

  /** Supprime tous les messages strictement postérieurs à un message donné. */
  async removeAfter(conversationId: string, message: Message): Promise<void> {
    const db = await getDb();
    await db.execute(
      "DELETE FROM messages WHERE conversation_id = $1 AND (created_at > $2 OR (created_at = $2 AND id > $3))",
      [conversationId, message.createdAt, message.id],
    );
  },
};

// ---------------------------------------------------------------------------
// Profils de modèle
// ---------------------------------------------------------------------------

type ProfileRow = {
  model_id: string;
  display_name: string | null;
  context_window: number | null;
  custom_parameters: string | null;
};

function profileFromRow(r: ProfileRow): ModelProfile {
  let custom: Record<string, unknown> | undefined;
  if (r.custom_parameters) {
    try {
      custom = JSON.parse(r.custom_parameters);
    } catch {
      custom = undefined;
    }
  }
  return {
    modelId: r.model_id,
    displayName: r.display_name ?? undefined,
    contextWindow: r.context_window ?? undefined,
    customParameters: custom,
  };
}

export const profileRepo = {
  async get(modelId: string): Promise<ModelProfile> {
    const db = await getDb();
    const rows = await db.select<ProfileRow[]>(
      "SELECT * FROM model_profiles WHERE model_id = $1",
      [modelId],
    );
    if (!rows.length) return { modelId };
    return profileFromRow(rows[0]);
  },

  async save(profile: ModelProfile): Promise<void> {
    const db = await getDb();
    // `thinking_strategy` est laissée à son défaut SQL, déjà « unsupported » :
    // la colonne survit aux bases existantes sans que rien ne la lise.
    await db.execute(
      `INSERT INTO model_profiles
        (model_id, display_name, context_window, custom_parameters)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT(model_id) DO UPDATE SET
        display_name = $2, context_window = $3, custom_parameters = $4`,
      [
        profile.modelId,
        profile.displayName ?? null,
        profile.contextWindow ?? null,
        profile.customParameters ? JSON.stringify(profile.customParameters) : null,
      ],
    );
  },
};

// ---------------------------------------------------------------------------
// Export / import de la distribution
//
// Format volontairement lisible et autonome : on transporte des personnages,
// pas des identifiants. À l'import, chaque personnage est recréé avec un
// nouvel identifiant — les conversations existantes ne sont jamais touchées.
// ---------------------------------------------------------------------------

export type PersonaExport = {
  name: string;
  description: string | null;
  character: string;
  traits: string[];
  temperature: number;
  topP: number | null;
  maxOutputTokens: number | null;
  gender: Persona["gender"];
  appearance: AvatarAppearance | null;
};

const PERSONAS_FILE_KIND = "praxis.personas";

export async function exportPersonas(): Promise<string> {
  const personas = await personaRepo.list();
  const payload: PersonaExport[] = personas.map((p) => ({
    name: p.name,
    description: p.description,
    character: p.systemPrompt,
    traits: p.stableTraits,
    temperature: p.temperature,
    topP: p.topP,
    maxOutputTokens: p.maxOutputTokens,
    gender: p.gender,
    appearance: p.avatarStyle,
  }));
  return JSON.stringify(
    { kind: PERSONAS_FILE_KIND, version: 1, exportedAt: nowIso(), personas: payload },
    null,
    2,
  );
}

/** Ajoute les personnages du fichier. Retourne le nombre créé. */
export async function importPersonas(json: string): Promise<number> {
  const parsed = JSON.parse(json) as {
    kind?: string;
    personas?: Partial<PersonaExport>[];
  };
  if (parsed.kind !== PERSONAS_FILE_KIND || !Array.isArray(parsed.personas)) {
    throw new Error("Ce fichier n'est pas une distribution Praxis.");
  }
  let created = 0;
  for (const entry of parsed.personas) {
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const character =
      typeof entry.character === "string" ? entry.character.trim() : "";
    // Un personnage sans nom ni caractère n'est pas jouable : on l'ignore
    // plutôt que d'introduire une ligne vide dans la distribution.
    if (!name || !character) continue;
    const id = newId();
    await personaRepo.create({
      name,
      description:
        typeof entry.description === "string" && entry.description.trim()
          ? entry.description.trim()
          : null,
      systemPrompt: character,
      stableTraits: Array.isArray(entry.traits)
        ? entry.traits.filter((t): t is string => typeof t === "string")
        : [],
      defaultModelId: null,
      temperature:
        typeof entry.temperature === "number" && Number.isFinite(entry.temperature)
          ? Math.min(Math.max(entry.temperature, 0), 2)
          : 0.7,
      topP: typeof entry.topP === "number" ? entry.topP : null,
      maxOutputTokens:
        typeof entry.maxOutputTokens === "number" && entry.maxOutputTokens > 0
          ? Math.round(entry.maxOutputTokens)
          : DEFAULT_MAX_OUTPUT_TOKENS,
      gender:
        entry.gender === "feminine" || entry.gender === "masculine"
          ? entry.gender
          : "neutral",
      avatarSetId: null,
      avatarStyle: normalizeAppearance(entry.appearance, id),
    });
    created += 1;
  }
  return created;
}

// ---------------------------------------------------------------------------
// Avatars (variantes importées — le rendu intégré sert de repli)
// ---------------------------------------------------------------------------

/**
 * Importe une image choisie par l'utilisateur. La validation et la copie dans
 * le répertoire applicatif sont faites côté Rust : la base ne référence jamais
 * un chemin arbitraire du disque.
 */
export async function importAvatarFile(sourcePath: string): Promise<string> {
  return invoke<string>("import_avatar", { sourcePath });
}

async function removeAvatarFile(path: string): Promise<void> {
  try {
    await invoke("remove_avatar", { path });
  } catch {
    // Un fichier déjà absent ne doit pas empêcher de nettoyer la base.
  }
}

type VariantRow = {
  id: string;
  avatar_set_id: string;
  mood: AvatarVariant["mood"];
  day_period: AvatarVariant["dayPeriod"];
  asset_path: string;
  priority: number;
};

export const avatarRepo = {
  /** Crée le jeu d'avatars d'une persona si elle n'en a pas encore. */
  async ensureSet(persona: Persona): Promise<string> {
    if (persona.avatarSetId) return persona.avatarSetId;
    const db = await getDb();
    const id = newId();
    await db.execute("INSERT INTO avatar_sets (id, name) VALUES ($1,$2)", [
      id,
      persona.name,
    ]);
    await db.execute("UPDATE personas SET avatar_set_id = $2 WHERE id = $1", [
      persona.id,
      id,
    ]);
    return id;
  },

  /**
   * Enregistre une image pour une humeur donnée (null = image neutre, utilisée
   * en repli). Remplace la variante existante pour ce couple humeur/période.
   */
  async setVariant(
    avatarSetId: string,
    mood: AvatarVariant["mood"],
    dayPeriod: AvatarVariant["dayPeriod"],
    assetPath: string,
  ): Promise<void> {
    const db = await getDb();
    const existing = await db.select<{ id: string; asset_path: string }[]>(
      `SELECT id, asset_path FROM avatar_variants
        WHERE avatar_set_id = $1
          AND mood IS $2 AND day_period IS $3`,
      [avatarSetId, mood, dayPeriod],
    );
    for (const row of existing) {
      await removeAvatarFile(row.asset_path);
      await db.execute("DELETE FROM avatar_variants WHERE id = $1", [row.id]);
    }
    await db.execute(
      `INSERT INTO avatar_variants (id, avatar_set_id, mood, day_period, asset_path, priority)
       VALUES ($1,$2,$3,$4,$5,0)`,
      [newId(), avatarSetId, mood, dayPeriod, assetPath],
    );
  },

  async removeVariant(id: string): Promise<void> {
    const db = await getDb();
    const rows = await db.select<{ asset_path: string }[]>(
      "SELECT asset_path FROM avatar_variants WHERE id = $1",
      [id],
    );
    if (rows[0]) await removeAvatarFile(rows[0].asset_path);
    await db.execute("DELETE FROM avatar_variants WHERE id = $1", [id]);
  },

  async variants(avatarSetId: string): Promise<AvatarVariant[]> {
    const db = await getDb();
    const rows = await db.select<VariantRow[]>(
      "SELECT * FROM avatar_variants WHERE avatar_set_id = $1",
      [avatarSetId],
    );
    return rows.map((r) => ({
      id: r.id,
      avatarSetId: r.avatar_set_id,
      mood: r.mood,
      dayPeriod: r.day_period,
      assetPath: r.asset_path,
      priority: r.priority,
    }));
  },
};

// ---------------------------------------------------------------------------
// Export / import JSON
// ---------------------------------------------------------------------------

const EXPORT_TABLES = [
  "settings",
  "connections",
  "model_profiles",
  "avatar_sets",
  "avatar_variants",
  "personas",
  "memories",
  "emotional_states",
  "conversations",
  "conversation_personas",
  "messages",
] as const;

export const EXPORT_SCHEMA_VERSION = 6;

export async function exportAllData(): Promise<string> {
  const db = await getDb();
  const dump: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    dump[table] = await db.select<unknown[]>(`SELECT * FROM ${table}`);
  }
  return JSON.stringify(
    {
      app: "anna",
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: nowIso(),
      tables: dump,
    },
    null,
    2,
  );
}

export async function importAllData(json: string): Promise<void> {
  const parsed = JSON.parse(json) as {
    app?: string;
    schemaVersion?: number;
    tables?: Record<string, Record<string, unknown>[]>;
  };
  if (parsed.app !== "anna" || !parsed.tables) {
    throw new Error("Ce fichier n'est pas une sauvegarde Anna valide.");
  }
  const db = await getDb();
  // Remplacement complet : vider dans l'ordre inverse des dépendances.
  for (const table of [...EXPORT_TABLES].reverse()) {
    await db.execute(`DELETE FROM ${table}`);
  }
  for (const table of EXPORT_TABLES) {
    const rows = parsed.tables[table] ?? [];
    for (const row of rows) {
      const cols = Object.keys(row);
      if (!cols.length) continue;
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
      await db.execute(
        `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`,
        cols.map((c) => row[c] as never),
      );
    }
  }
  // Sauvegarde antérieure au multi-personnages : reconstituer les scènes et
  // le locuteur des messages à partir de la persona de chaque conversation.
  await db.execute(
    `INSERT OR IGNORE INTO conversation_personas
        (conversation_id, persona_id, position, active)
     SELECT id, persona_id, 0, 1 FROM conversations`,
  );
  await db.execute(
    `UPDATE messages SET persona_id = (
        SELECT c.persona_id FROM conversations c WHERE c.id = messages.conversation_id
     ) WHERE role = 'assistant' AND persona_id IS NULL`,
  );
  await db.execute(
    `UPDATE messages SET persona_name = (
        SELECT p.name FROM personas p WHERE p.id = messages.persona_id
     ) WHERE persona_id IS NOT NULL AND persona_name IS NULL`,
  );
}

export async function deleteAllData(): Promise<void> {
  const db = await getDb();
  for (const table of [...EXPORT_TABLES].reverse()) {
    await db.execute(`DELETE FROM ${table}`);
  }
}
