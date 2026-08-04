use futures_util::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::State;
use tauri_plugin_sql::{Migration, MigrationKind};

const KEYRING_SERVICE: &str = "com.jeffvidal.praxis";
/// Ancien identifiant, du temps où l'application s'appelait « Anna ».
const KEYRING_SERVICE_LEGACY: &str = "com.jeffvidal.anna";
const KEYRING_USER: &str = "api-key";

const LEGACY_APP_DIR: &str = "com.jeffvidal.anna";
const LEGACY_DB_PREFIX: &str = "anna.db";
const DB_PREFIX: &str = "praxis.db";

// ---------------------------------------------------------------------------
// Reprise des données de la version « Anna »
//
// L'identifiant de bundle sert de chemin au répertoire applicatif : le changer
// rendrait la base et les avatars invisibles. On recopie donc l'ancien dossier
// au premier démarrage. Copie et non déplacement : l'original reste en place,
// intact, tant que l'utilisateur ne l'a pas supprimé lui-même.
// ---------------------------------------------------------------------------

fn copy_dir(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn migrate_legacy_app_data(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Ok(new_dir) = app.path().app_data_dir() else {
        return;
    };
    // Déjà migré, ou installation neuve : rien à faire.
    if new_dir.join(DB_PREFIX).exists() {
        return;
    }
    let Some(parent) = new_dir.parent() else {
        return;
    };
    let legacy_dir = parent.join(LEGACY_APP_DIR);
    if !legacy_dir.join(LEGACY_DB_PREFIX).exists() {
        return;
    }
    if let Err(e) = copy_dir(&legacy_dir, &new_dir) {
        eprintln!("Could not carry over the legacy Anna data: {e}");
        return;
    }
    // `anna.db`, `anna.db-wal`, `anna.db-shm` → même suffixe, nouveau préfixe.
    // Les fichiers WAL doivent suivre la base, sinon les dernières
    // transactions seraient perdues.
    let Ok(entries) = std::fs::read_dir(&new_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(suffix) = name.strip_prefix(LEGACY_DB_PREFIX) {
            let renamed = new_dir.join(format!("{DB_PREFIX}{suffix}"));
            let _ = std::fs::rename(entry.path(), renamed);
        }
    }
    eprintln!("Data carried over from {}", legacy_dir.display());
}

// ---------------------------------------------------------------------------
// État partagé : annulation des streams en cours
// ---------------------------------------------------------------------------

#[derive(Default)]
struct StreamRegistry(Mutex<HashMap<String, futures_util::future::AbortHandle>>);

// ---------------------------------------------------------------------------
// Sécurité : n'autoriser que localhost par défaut
// ---------------------------------------------------------------------------

fn validate_base_url(base_url: &str, allow_remote: bool) -> Result<url::Url, String> {
    let parsed = url::Url::parse(base_url).map_err(|_| "URL invalide".to_string())?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Only http and https are allowed".into()),
    }
    if !allow_remote {
        let host = parsed.host_str().unwrap_or_default();
        let local = matches!(host, "localhost" | "127.0.0.1" | "[::1]" | "::1");
        if !local {
            return Err(
                "Remote host not allowed. Enable remote hosts explicitly in the settings.".into(),
            );
        }
    }
    Ok(parsed)
}

fn endpoint(base: &url::Url, path: &str) -> String {
    let trimmed = base.as_str().trim_end_matches('/').to_string();
    format!("{trimmed}/{path}")
}

fn build_client(timeout_ms: Option<u64>) -> Result<reqwest::Client, String> {
    let mut builder =
        reqwest::Client::builder().connect_timeout(std::time::Duration::from_secs(5));
    if let Some(ms) = timeout_ms {
        builder = builder.timeout(std::time::Duration::from_millis(ms));
    }
    builder.build().map_err(|e| e.to_string())
}

fn apply_auth(req: reqwest::RequestBuilder, api_key: &Option<String>) -> reqwest::RequestBuilder {
    match api_key {
        Some(key) if !key.is_empty() => req.bearer_auth(key),
        _ => req,
    }
}

fn humanize_reqwest_error(e: &reqwest::Error) -> String {
    if e.is_connect() {
        "Could not connect to the local server. Check that an OpenAI-compatible server is running at this address.".into()
    } else if e.is_timeout() {
        "The server did not respond in time.".into()
    } else {
        format!("Network error: {e}")
    }
}

// ---------------------------------------------------------------------------
// Commandes HTTP
// ---------------------------------------------------------------------------

#[tauri::command]
async fn test_connection(
    base_url: String,
    api_key: Option<String>,
    allow_remote: Option<bool>,
) -> Result<bool, String> {
    let base = validate_base_url(&base_url, allow_remote.unwrap_or(false))?;
    let client = build_client(Some(8000))?;
    let url = endpoint(&base, "models");
    let resp = apply_auth(client.get(&url), &api_key)
        .send()
        .await
        .map_err(|e| humanize_reqwest_error(&e))?;
    if resp.status().is_success() {
        Ok(true)
    } else {
        Err(format!(
            "The server replied with status {}",
            resp.status()
        ))
    }
}

#[tauri::command]
async fn list_models(
    base_url: String,
    api_key: Option<String>,
    allow_remote: Option<bool>,
) -> Result<serde_json::Value, String> {
    let base = validate_base_url(&base_url, allow_remote.unwrap_or(false))?;
    let client = build_client(Some(8000))?;
    let url = endpoint(&base, "models");
    let resp = apply_auth(client.get(&url), &api_key)
        .send()
        .await
        .map_err(|e| humanize_reqwest_error(&e))?;
    if !resp.status().is_success() {
        return Err(format!(
            "The server replied with status {}",
            resp.status()
        ));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

/// Requête de chat non streamée (analyse émotionnelle, résumés, propositions
/// de souvenirs). Retourne le JSON complet de la réponse.
#[tauri::command]
async fn chat_completion(
    base_url: String,
    api_key: Option<String>,
    allow_remote: Option<bool>,
    body: serde_json::Value,
    timeout_ms: Option<u64>,
) -> Result<serde_json::Value, String> {
    let base = validate_base_url(&base_url, allow_remote.unwrap_or(false))?;
    let client = build_client(Some(timeout_ms.unwrap_or(120_000)))?;
    let url = endpoint(&base, "chat/completions");
    let resp = apply_auth(client.post(&url), &api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| humanize_reqwest_error(&e))?;
    let status = resp.status();
    let value = resp
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;
    if !status.is_success() {
        let detail = value
            .pointer("/error/message")
            .and_then(|v| v.as_str())
            .unwrap_or("erreur inconnue");
        return Err(format!("Erreur du serveur ({status}) : {detail}"));
    }
    Ok(value)
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum StreamEvent {
    Delta { content: String },
    Done,
    Cancelled,
    Error { message: String },
}

/// Requête de chat streamée (SSE). Les deltas sont poussés sur le canal.
#[tauri::command]
async fn stream_chat(
    registry: State<'_, StreamRegistry>,
    request_id: String,
    base_url: String,
    api_key: Option<String>,
    allow_remote: Option<bool>,
    body: serde_json::Value,
    channel: Channel<StreamEvent>,
) -> Result<(), String> {
    let base = validate_base_url(&base_url, allow_remote.unwrap_or(false))?;
    // Pas de timeout global : la génération peut être longue sur machine lente.
    let client = build_client(None)?;
    let url = endpoint(&base, "chat/completions");

    let (abort_handle, abort_registration) = futures_util::future::AbortHandle::new_pair();
    registry
        .0
        .lock()
        .unwrap()
        .insert(request_id.clone(), abort_handle);

    let task = async {
        let resp = match apply_auth(client.post(&url), &api_key)
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                let _ = channel.send(StreamEvent::Error {
                    message: humanize_reqwest_error(&e),
                });
                return;
            }
        };
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            let detail = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| {
                    v.pointer("/error/message")
                        .and_then(|m| m.as_str())
                        .map(String::from)
                })
                .unwrap_or(text);
            let _ = channel.send(StreamEvent::Error {
                message: format!("Erreur du serveur ({status}) : {detail}"),
            });
            return;
        }

        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();
        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(c) => c,
                Err(e) => {
                    let _ = channel.send(StreamEvent::Error {
                        message: format!("Flux interrompu : {e}"),
                    });
                    return;
                }
            };
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer.drain(..=pos);
                if let Some(data) = line.strip_prefix("data:") {
                    let data = data.trim();
                    if data == "[DONE]" {
                        let _ = channel.send(StreamEvent::Done);
                        return;
                    }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(content) = json
                            .pointer("/choices/0/delta/content")
                            .and_then(|v| v.as_str())
                        {
                            if !content.is_empty() {
                                let _ = channel.send(StreamEvent::Delta {
                                    content: content.to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
        // Fin de flux sans [DONE] explicite : considérer la réponse terminée.
        let _ = channel.send(StreamEvent::Done);
    };

    let result = futures_util::future::Abortable::new(task, abort_registration).await;
    registry.0.lock().unwrap().remove(&request_id);
    if result.is_err() {
        let _ = channel.send(StreamEvent::Cancelled);
    }
    Ok(())
}

#[tauri::command]
fn cancel_stream(registry: State<'_, StreamRegistry>, request_id: String) {
    if let Some(handle) = registry.0.lock().unwrap().remove(&request_id) {
        handle.abort();
    }
}

// ---------------------------------------------------------------------------
// Clé API dans le coffre système (jamais en clair dans SQLite)
// ---------------------------------------------------------------------------

/// Chaque connexion a sa propre entrée dans le coffre : changer de serveur ne
/// doit pas obliger à ressaisir la clé du précédent. `None` désigne l'entrée
/// unique d'avant les connexions multiples, reprise au premier démarrage.
fn keyring_user(connection_id: &Option<String>) -> String {
    match connection_id {
        Some(id) if !id.is_empty() => format!("{KEYRING_USER}:{id}"),
        _ => KEYRING_USER.to_string(),
    }
}

#[tauri::command]
fn set_api_key(connection_id: Option<String>, value: String) -> Result<(), String> {
    let user = keyring_user(&connection_id);
    let entry = keyring::Entry::new(KEYRING_SERVICE, &user).map_err(|e| e.to_string())?;
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(&value).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn get_api_key(connection_id: Option<String>) -> Result<Option<String>, String> {
    let user = keyring_user(&connection_id);
    let entry = keyring::Entry::new(KEYRING_SERVICE, &user).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => return Ok(Some(p)),
        Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(e.to_string()),
    }
    // Une connexion sans clé enregistrée n'en a pas : ne pas retomber sur celle
    // d'une autre, qui partirait vers un serveur auquel elle n'appartient pas.
    if connection_id.is_some() {
        return Ok(None);
    }
    // Repli sur l'entrée créée sous l'ancien nom, recopiée sous le nouveau.
    // L'ancienne est laissée en place : c'est le trousseau de l'utilisateur.
    let legacy = keyring::Entry::new(KEYRING_SERVICE_LEGACY, KEYRING_USER)
        .map_err(|e| e.to_string())?;
    match legacy.get_password() {
        Ok(p) => {
            let _ = entry.set_password(&p);
            Ok(Some(p))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Import d'images d'avatar
//
// Le fichier choisi est validé puis *copié* dans le répertoire applicatif :
// la base ne référence jamais un chemin arbitraire du disque de l'utilisateur,
// qui pourrait disparaître, changer, ou pointer hors du bac à sable.
// ---------------------------------------------------------------------------

const MAX_AVATAR_BYTES: u64 = 8 * 1024 * 1024;

/// Extension déduite des octets d'en-tête, jamais du nom de fichier.
fn sniff_image(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif");
    }
    if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    None
}

fn avatars_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Application directory not found: {e}"))?
        .join("avatars");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Creating the folder: {e}"))?;
    Ok(dir)
}

#[tauri::command]
async fn import_avatar(app: tauri::AppHandle, source_path: String) -> Result<String, String> {
    let source = std::path::PathBuf::from(&source_path);
    let meta = std::fs::metadata(&source).map_err(|_| "Fichier introuvable.".to_string())?;
    if !meta.is_file() {
        return Err("Ce n'est pas un fichier.".into());
    }
    if meta.len() > MAX_AVATAR_BYTES {
        return Err("Image trop volumineuse (8 Mo maximum).".into());
    }
    let bytes = std::fs::read(&source).map_err(|e| format!("Lecture impossible : {e}"))?;
    let ext = sniff_image(&bytes)
        .ok_or_else(|| "Format non reconnu. Utilisez PNG, JPEG, WebP ou GIF.".to_string())?;

    let dir = avatars_dir(&app)?;
    let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let dest = dir.join(&name);
    std::fs::write(&dest, &bytes).map_err(|e| format!("Could not write: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

/// Supprime une image importée. Refuse tout chemin hors du dossier applicatif.
#[tauri::command]
async fn remove_avatar(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir = avatars_dir(&app)?;
    let target = std::path::PathBuf::from(&path);
    let canonical_dir = dir.canonicalize().map_err(|e| e.to_string())?;
    let canonical_target = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => return Ok(()), // déjà absent
    };
    if !canonical_target.starts_with(&canonical_dir) {
        return Err("Path outside the application directory.".into());
    }
    let _ = std::fs::remove_file(canonical_target);
    Ok(())
}

/// Journalise une erreur venue de l'interface. Une application de bureau n'a
/// pas de console : sans cela, un échec au démarrage n'affiche qu'un message
/// à l'écran, impossible à rapporter ou à diagnostiquer après coup.
#[tauri::command]
fn log_client_error(app: tauri::AppHandle, message: String) {
    eprintln!("[interface] {message}");
    use tauri::Manager;
    let Ok(dir) = app.path().app_log_dir() else {
        return;
    };
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("praxis.log"))
    {
        use std::io::Write;
        let _ = writeln!(file, "{message}");
    }
}

// ---------------------------------------------------------------------------
// Migrations SQLite
// ---------------------------------------------------------------------------

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
        version: 1,
        description: "schema_initial",
        kind: MigrationKind::Up,
        sql: r#"
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS model_profiles (
                model_id TEXT PRIMARY KEY,
                display_name TEXT,
                context_window INTEGER,
                thinking_strategy TEXT NOT NULL DEFAULT '{"kind":"unsupported"}',
                custom_parameters TEXT
            );

            CREATE TABLE IF NOT EXISTS avatar_sets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS avatar_variants (
                id TEXT PRIMARY KEY,
                avatar_set_id TEXT NOT NULL REFERENCES avatar_sets(id) ON DELETE CASCADE,
                mood TEXT,
                day_period TEXT,
                asset_path TEXT NOT NULL,
                priority INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS personas (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                system_prompt TEXT NOT NULL,
                stable_traits TEXT NOT NULL DEFAULT '[]',
                default_model_id TEXT,
                temperature REAL NOT NULL DEFAULT 0.7,
                top_p REAL,
                max_output_tokens INTEGER,
                thinking_mode TEXT NOT NULL DEFAULT 'default'
                    CHECK (thinking_mode IN ('off','default','on')),
                avatar_set_id TEXT REFERENCES avatar_sets(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                category TEXT,
                scope TEXT NOT NULL CHECK (scope IN ('global','persona')),
                persona_id TEXT REFERENCES personas(id) ON DELETE CASCADE,
                enabled INTEGER NOT NULL DEFAULT 1,
                source_conversation_id TEXT,
                source_message_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                CHECK ((scope = 'persona') = (persona_id IS NOT NULL))
            );

            CREATE TABLE IF NOT EXISTS emotional_states (
                persona_id TEXT PRIMARY KEY REFERENCES personas(id) ON DELETE CASCADE,
                mood TEXT NOT NULL,
                valence REAL NOT NULL,
                energy REAL NOT NULL,
                warmth REAL NOT NULL,
                closeness REAL NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                persona_id TEXT NOT NULL REFERENCES personas(id),
                title TEXT NOT NULL,
                summary TEXT,
                summary_through_message_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_interaction_at TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK (role IN ('user','assistant')),
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'complete'
                    CHECK (status IN ('streaming','complete','cancelled','error')),
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages(conversation_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_conversations_persona
                ON conversations(persona_id);
            CREATE INDEX IF NOT EXISTS idx_memories_persona
                ON memories(persona_id);
        "#,
        },
        Migration {
            version: 2,
            description: "conversations_multi_personas",
            kind: MigrationKind::Up,
            // Une conversation peut réunir plusieurs personnages. `conversations.persona_id`
            // reste la persona principale (titre, avatar de la liste, locuteur par défaut).
            sql: r#"
            CREATE TABLE IF NOT EXISTS conversation_personas (
                conversation_id TEXT NOT NULL
                    REFERENCES conversations(id) ON DELETE CASCADE,
                persona_id TEXT NOT NULL
                    REFERENCES personas(id) ON DELETE CASCADE,
                position INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY (conversation_id, persona_id)
            );

            -- Locuteur du message : NULL pour l'utilisateur, et NULL aussi si la
            -- persona a été supprimée — `persona_name` conserve alors le nom affiché.
            ALTER TABLE messages ADD COLUMN persona_id TEXT
                REFERENCES personas(id) ON DELETE SET NULL;
            ALTER TABLE messages ADD COLUMN persona_name TEXT;

            INSERT OR IGNORE INTO conversation_personas
                (conversation_id, persona_id, position, active)
            SELECT id, persona_id, 0, 1 FROM conversations;

            UPDATE messages SET persona_id = (
                SELECT c.persona_id FROM conversations c
                WHERE c.id = messages.conversation_id
            ) WHERE role = 'assistant' AND persona_id IS NULL;

            UPDATE messages SET persona_name = (
                SELECT p.name FROM personas p WHERE p.id = messages.persona_id
            ) WHERE persona_id IS NOT NULL AND persona_name IS NULL;

            CREATE INDEX IF NOT EXISTS idx_messages_persona
                ON messages(persona_id);
        "#,
        },
        Migration {
            version: 3,
            description: "message_kind_narration",
            kind: MigrationKind::Up,
            // `role` reste le rôle protocolaire envoyé au serveur ; `kind`
            // distingue une parole d'une didascalie (entrée, sortie, décor),
            // qui n'appartient à aucun locuteur.
            sql: r#"
            ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'speech'
                CHECK (kind IN ('speech','narration'));
        "#,
        },
        Migration {
            version: 4,
            description: "conversation_scene_description",
            kind: MigrationKind::Up,
            // Situation de départ commune : le décor que tous les personnages
            // de la conversation connaissent, injecté dans chaque prompt.
            sql: r#"
            ALTER TABLE conversations ADD COLUMN scene_description TEXT;
        "#,
        },
        Migration {
            version: 5,
            description: "message_addressee",
            kind: MigrationKind::Up,
            // Destinataire d'une réplique : identifiant de persona, 'user' pour
            // l'utilisateur, NULL quand elle s'adresse à tout le monde. Résolu
            // à l'écriture — le déduire du texte après coup serait approximatif.
            sql: r#"
            ALTER TABLE messages ADD COLUMN addressee TEXT;
        "#,
        },
        Migration {
            version: 6,
            description: "persona_avatar_style",
            kind: MigrationKind::Up,
            // Apparence de l'avatar intégré (coiffure, pilosité, lunettes,
            // teintes), en JSON. NULL = déduite de l'identifiant.
            sql: r#"
            ALTER TABLE personas ADD COLUMN avatar_style TEXT;
        "#,
        },
        Migration {
            version: 7,
            description: "persona_gender",
            kind: MigrationKind::Up,
            // Genre grammatical : en français, tout s'accorde. Sans cette
            // information, un modèle le devine d'après le prénom — et se
            // trompe dès qu'il est ambigu ou étranger.
            sql: r#"
            ALTER TABLE personas ADD COLUMN gender TEXT NOT NULL DEFAULT 'neutral'
                CHECK (gender IN ('feminine','masculine','neutral'));
        "#,
        },
        Migration {
            version: 8,
            description: "connections",
            kind: MigrationKind::Up,
            // Plusieurs serveurs configurés côte à côte : un modèle local et
            // une passerelle distante ne partagent ni adresse, ni clé, ni
            // modèle, ni délai. La reprise de l'ancienne configuration unique
            // se fait côté interface, qui sait lire les réglages clé/valeur.
            sql: r#"
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                base_url TEXT NOT NULL,
                allow_remote INTEGER NOT NULL DEFAULT 0,
                timeout_ms INTEGER NOT NULL DEFAULT 120000,
                selected_model_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        "#,
        },
        Migration {
            version: 9,
            description: "disable_reasoning_modes",
            kind: MigrationKind::Up,
            // Le raisonnement caché consommait parfois tout le budget des
            // tâches internes. Praxis fonctionne désormais uniquement en mode
            // direct ; les anciens choix et stratégies deviennent inactifs.
            sql: r#"
            UPDATE personas SET thinking_mode = 'off'
                WHERE thinking_mode <> 'off';
            UPDATE model_profiles
                SET thinking_strategy = '{"kind":"unsupported"}';
        "#,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Avant tout accès à la base : reprendre les données de « Anna ».
            migrate_legacy_app_data(app.handle());
            Ok(())
        })
        .manage(StreamRegistry::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:praxis.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            test_connection,
            list_models,
            chat_completion,
            stream_chat,
            cancel_stream,
            set_api_key,
            get_api_key,
            import_avatar,
            remove_avatar,
            log_client_error
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
