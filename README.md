# Praxis — a pocket theatre, running locally

A minimal desktop application for talking to an LLM running locally behind an
OpenAI-compatible API (`http://localhost:8080/v1` by default). Not an AI studio:
persistent characters, with a reactive and persistent emotional state, and an
avatar whose ring reflects their mood.

Everything stays on your machine: no account, no telemetry, local SQLite.

## Requirements

- [Node.js](https://nodejs.org) ≥ 20 and npm
- [Rust](https://rustup.rs) stable (full toolchain for Tauri 2)
- macOS: Xcode Command Line Tools; Linux: Tauri's WebKitGTK dependencies
- An OpenAI-compatible inference server (mlx-serve, llama.cpp, Ollama…) with a
  model loaded and its local server started

## Running it

```bash
npm install
```

```bash
./scripts/build-app.sh
```

This creates a **lightweight launcher** `Praxis.app` at the project root. It
bundles neither the compiled code nor the frontend: it keeps a link to this
folder and starts `npm run tauri dev` in the background, without opening a
Terminal. Drag it into `/Applications` if you like. Project changes are
therefore picked up on the next launch; an incremental rebuild may briefly
precede the window opening.

On first launch, a short wizard asks for your languages, tests the connection to
the local server, reads the exposed models (`GET /models`) and has you create a
first character, then opens the chat. On a local server that serves a single
model, that one is used automatically; with a gateway exposing several, pick
yours in Settings → Connections → Model used.

## Languages

Two separate settings, in Settings → Appearance → Language:

- **Interface language** — English or French, for the application chrome.
- **Conversation language** — English or French, for the characters. This is the
  language of the assembled prompt, so it is what the characters actually speak
  in.

They are deliberately independent: an English interface with French-speaking
characters is a normal setup, not an inconsistency. Changing the conversation
language affects the lines to come, not the ones already written.

The prompt scaffolding is not a literal translation between the two. French
needs explicit gender-agreement instructions — without them a model inflects
adjectives and participles at random from a first name, and changes its mind
from one line to the next. English has no such agreement, so the same slot
carries pronoun instructions instead. Both packs live in
[src/lib/i18n/prompts](src/lib/i18n/prompts).

Adding a language means adding one file under `i18n/ui/` and one under
`i18n/prompts/`; both are type-checked against the English pack, so a missing
key fails the build.

## Interface appearance

Settings → Appearance controls only the presentation of the application:
**System**, **Dark** or **Light** theme, conversation text size, and thread
spacing. Changes are immediate and persistent, and System mode follows the
computer's preferences. The options that concern the characters — emotion,
dynamic avatar and the character offered at startup — are in
Settings → Conversation.

## Several configured servers

Settings → Connections keeps as many servers side by side as needed: a local
model under mlx-serve, another under Ollama, a remote gateway. Each connection
owns **its address, its API key, its model and its timeout**; switching between
them therefore requires no retyping.

- "Add" starts from a preset (mlx-serve, llama.cpp, Ollama, OpenRouter);
  "Duplicate" copies the current connection, for instance to target two models
  on the same server.
- When several connections exist, a selector appears in the chat header:
  switching is immediate, the model list is re-read and the status dot indicates
  the active server.
- A connection that leaves the machine must be authorised **connection by
  connection**, after explicit confirmation. Local servers are never affected.
- API keys live in the system keychain, one per connection. They appear neither
  in SQLite nor in JSON exports; deleting a connection deletes its key.

## Multi-character conversations

A conversation brings together one or more characters. "+ New conversation"
opens a simple selection page. The "Scene" button in the header opens the
**right-hand panel**, which gathers the setting, the characters present, their
speaking order and the automation.

### Starting situation

The creation page allows an optional **starting situation**: setting, time of
day, what has just happened. Speaking order and title remain available under
advanced options. The situation is added verbatim to each present character's
prompt, under `[STARTING SITUATION]` — it is the shared setting, not a message:
they take it as given without reciting it. It appears at the top of the thread
and can be edited afterwards from the Scene panel.

### Who is talking to whom

In a group scene, each message carries an `Anna → Marc` banner, coloured with
the two characters' accents. The addressee is **recorded when written**, not
guessed at display time: for your messages it comes from the director (`@Name`
mention, direct address, or the "To:" selector); for the characters' lines it is
detected at the end of streaming from the mention or the direct address. With no
indication, the banner shows "everyone" rather than inventing an addressee.

### Entrances and exits mid-conversation

From the panel, "Enter" or "Leave" opens a pre-filled field where you **write
the stage direction** ("Gwendoline walks into the room."). It is stored as a
`narration` message: displayed centred in the thread with no bubble and no
author, and passed to the models as `(Scene: …)`, with no speaker name — it is
nobody's speech. A checkbox makes the present characters react in turn.

A character who leaves is no longer active in `conversation_personas` but keeps
their position: if they come back, they regain their rank in the speaking order.
The panel's arrows reorder who speaks first.

- **One request per speaker.** Each character keeps their own prompt, emotional
  state and temperature; they answer one after another, each seeing the previous
  ones' lines.
- **Who speaks?** The "Who answers?" selector is on **Auto** by default:
  `@Name` (or `@everyone`) and a direct address at the start of a message
  ("Marc, what do you think?") then choose the speaker; with no indication,
  everyone answers in scene order. Explicitly choosing a character in the
  selector forces their reply and takes priority over `@mentions` in the text.
- **Autonomous exchanges.** Setting in the Scene panel (or Settings →
  Conversation): after your message, the characters answer each other for 1 to 3
  turns.
- **Resuming after a silence.** With no message from you for 30 seconds
  (configurable, 0 to disable), the characters take the floor on their own. A
  countdown announces it in the thread, typing in the input pushes it back, and
  "Wait for my message" cancels it.
- Three safeguards against loops, including for the silence resume: the
  configured number of turns, a hard cap of four turns per character between two
  of your messages, and "Stop", which interrupts the series.
- A character joining the scene sees only the summary and the recent messages; a
  deleted character leaves their lines readable in the history.

### Your name

Characters page, at the top — above the prompts it relates to. The characters
address you by this name, and your messages are prefixed with it in group
scenes. **Make it match the name used in your prompts**: if the transcript says
"User:" while a character talks about "Jeff", the other characters cannot know
these are the same person — this is the leading cause of confusion about who is
talking to whom. Left empty, the generic label of the conversation language is
used.

### Actions and stage directions

Text between asterisks describes a gesture, not speech:

```
*I walk in and drop my keys* Evening, are you there?
```

The interface renders it in italics and the prompt explains the convention to
the characters, who adopt it for their own gestures. The `*action*` button below
the input wraps the selection.

Two levels not to be confused: `*like this*` describes **your** gesture inside
your own line; a `(Scene: …)` stage direction, produced by entrances and exits,
describes what happens in the room and belongs to nobody.

## Scripts

| Command | Effect |
|---|---|
| `./scripts/build-app.sh` | Creates the lightweight `Praxis.app` launcher |
| `npm run tauri dev` | Application in development mode |
| `npm test` | Unit tests (vitest) |
| `npm run check` | Type checking (svelte-check) |

## Architecture

- **Tauri 2 + SvelteKit (static SPA) + TypeScript**, Svelte 5 (runes).
- **SQLite** via `tauri-plugin-sql`, versioned migrations declared in
  [lib.rs](src-tauri/src/lib.rs). Database: `praxis.db` in the application data
  directory.
- **HTTP on the Rust side** (`reqwest`): the webview never calls the network
  directly. Commands: `test_connection`, `list_models`, `chat_completion`
  (non-streamed) and `stream_chat` (SSE → Tauri channel, with `cancel_stream`
  for cancellation).
- **TypeScript services** in [src/lib/services](src/lib/services):
  `promptAssembler` (deterministic order + ~4 characters/token budget),
  `temporal` (day period, elapsed time), `emotion` (half-life decay, bounded
  deltas, recomputed mood), `avatar` (variant resolution + built-in portraits),
  `summaryService` (summary at ~55% of the context, `summaryThroughMessageId`
  boundary, no message deleted), `scene` (per-speaker history rewriting,
  `[SCENE]` block, stop sequences, speaking director), `repositories` (SQLite
  access + JSON export/import).
- **Localisation** in [src/lib/i18n](src/lib/i18n): `ui/` for the interface,
  `prompts/` for everything sent to the model. The English pack is the
  reference; the French pack is typed against it.
- **Global state** in [appState.svelte.ts](src/lib/state/appState.svelte.ts).

## Notable technical decisions

- **Interface language and conversation language are two settings, not one.**
  The language of the assembled prompt is what determines the language a
  character speaks, which has nothing to do with the language the application
  chrome is read in. Collapsing them would make an English-speaking user unable
  to keep French-speaking characters. The prompt packs are not translations of
  one another either: French gender agreement has no English equivalent, and the
  corresponding slot carries pronoun instructions instead.
- **Multiple connections rather than a single configuration**: address, key,
  model and timeout belong to the connection (`connections` table), not to the
  general settings, which retain only the active identifier. Without this,
  alternating between a local model and a gateway meant retyping everything on
  each switch. The old single configuration is carried over as-is on first
  launch, keychain key included, and becomes the first connection.
- **API key in the system keychain** (`keyring` crate), never in SQLite. It
  remains optional — a local server usually does not ask for one. One entry per
  connection (`api-key:<id>`): one server's key never travels to another, and a
  connection with no stored key does not borrow a neighbour's.
- **Localhost only by default**: the Rust command refuses any non-local host as
  long as the connection in use does not explicitly allow remote hosts —
  authorisation requested connection by connection, never globally.
- **Emotional reaction before the response**: a short non-streamed request
  assesses the emotion, its intensity and a first impulse before the character
  speaks. Strong events can immediately produce shock, fear, anger, sadness,
  disgust or surprise. Deltas stay proportional to intensity, from an ordinary
  amplitude (valence ±0.12; energy ±0.10) to a major reaction (valence ±0.55;
  energy ±0.45). Any failure simply keeps the decayed state; the main line
  remains possible. Can be disabled in the settings (deterministic mode: only
  decay and the general acting instructions apply).
- **Decay applied on read** (no background task): half-lives of 12 h / 6 h /
  72 h / 30 d towards the neutral state.
- **Built-in avatar**: with no imported image, an editorial portrait is chosen
  deterministically from the character's appearance; the ring carries their
  mood, and the older procedural SVG face remains the technical fallback. The
  `avatar_sets`/`avatar_variants` tables allow file variants, resolved in the
  order mood+period → mood → period → neutral, with a guaranteed neutral
  fallback.
- **Reasoning disabled**: Praxis exposes no thinking mode. Every request
  automatically receives `{"reasoning_effort":"none",
  "chat_template_kwargs":{"enable_thinking":false}}`, including the summary, the
  emotional analysis and the speaker selection. The applied JSON is visible in
  Settings → Advanced → Show the technical parameters.
- **Nothing is sent to any server** other than the chat requests to the
  configured endpoint.
- **Explicit model choice, with automatic fallback**: with no selection, the
  first exposed model is used — enough for a local server, which only serves the
  one it has loaded. An OpenAI-compatible gateway announcing hundreds means the
  first in the list has no reason to be the right one: Settings → Connections
  therefore lets you pin it, per connection. A model chosen and then gone from
  the list is **not** silently replaced — the screen says so, because talking to
  a different model than the one displayed is worse than a visible error.
- **Multi-character: one request per speaker, not a collective prompt.** Since
  the API only knows `user`/`assistant`, the history is rewritten for each
  character (their lines as `assistant`, the others as `user` blocks prefixed
  with the name). A single prompt describing all roles would be faster but would
  lose the isolation of emotional states and inference settings. Against
  impersonation: the `[SCENE]` block, `stop` on `\nName:`, and cleanup of the
  response at the end of streaming.
- **Disambiguating the speakers costs more than splitting the turns.** The API
  roles force the user and the other characters into a single `user` block
  (emitting consecutive `user` messages breaks chat templates that require
  alternation). Three compensations: a name-by-name roster in `[SCENE]` saying
  who the human is, a header on multi-speaker blocks, and a sentence saying who
  the last message is addressed to, computed by the director.
- **`conversations.persona_id` remains the primary character** (title, list
  avatar, default speaker); the `conversation_personas` table carries the scene.
  Each message stores its `persona_id` **and** the speaker's name, so a deleted
  character does not erase the readable history.
- **The addressee is resolved on write, not on render** (`messages.addressee`:
  persona identifier, `user`, or NULL for the whole scene). Deriving it from the
  text at display time would miss the choice made in "To:", which leaves no
  trace in the message. Textual detection only serves as a fallback for messages
  predating this column.
- **`messages.role` and `messages.kind` are two different things**: `role` is
  the protocol role sent to the server (a stage direction travels as `user`, for
  lack of anything better), `kind` carries the meaning (`speech` / `narration`)
  and drives both the display and the transcript rendering. Adding an SQL role
  would have forced a table rebuild for its `CHECK` constraint.
- **The summary format marker is not translated.** `[ACTIVE MEMORY v3]` is an
  application-level marker; a translated one would change on every language
  switch and make an up-to-date summary look stale. Summaries written by earlier
  versions are rebuilt once.

## Model capacity and response length

Only two settings affect the size of a request:

- **Total model capacity**, next to the model choice in Settings → Connection:
  everything the model can read and write at once. Praxis asks the server, which
  usually announces it in `GET /models`, and keeps 90% of it to absorb the
  imprecision of the token estimate. Enter a value only to hold a shorter budget
  than the announced one. If the server publishes nothing, the fallback capacity
  from the advanced settings applies.
- **Response length**, on each character's sheet: Short, Normal or Long. These
  correspond to deterministic limits of 512, 1,024 and 2,048 tokens; older
  characters with no explicit limit now use Normal. "Short" aims for 3 to 6
  natural sentences: it is not a telegraphic mode or a one-word answer.

Room for the response is reserved before assembling the prompt:
`total capacity − reserved response = room available for identity, situation,
summary and messages`. The chat menu shows this breakdown with a gauge
separating the context sent from the reserved response.

## Response speed

Response time must not drift with the length of the conversation. Two mechanisms
handle that.

**A stable prompt prefix.** Local servers only reuse their attention cache over
the common prefix of two successive requests. The emotional state and the local
time change every turn; placed at the head of the prompt, they invalidated
everything that follows — summary, entire history — which was then recomputed on
every message, for every character. Those blocks are therefore emitted **after**
the history, merged with the last user turn. Measured on a 40-message history:
the reusable share from one turn to the next goes from 11.8% to 95.9%, i.e. ~116
tokens reprocessed instead of ~2,500.

**A bounded history window.** The token-based summary threshold alone let the
history climb to a hundred short lines. A cap on the number of messages
(Settings → Advanced, 30 by default) and a threshold at 55% of the context now
trigger compression before the heavy turn is generated. Fourteen recent messages
stay verbatim and each update absorbs at least eight messages, to avoid the
erosion produced by over-frequent rewrites. The structured summary favours the
current state, active facts, decisions, open questions and recent events; new
information explicitly replaces its obsolete versions. During summarisation, an
animated bar explicitly indicates compression, then a notification states how
many older messages were folded in. As soon as a condensed memory exists, the
**••• → Conversation summary** menu lets you read exactly the text passed to the
characters and regenerate it from the original messages. A response cut short by
the token limit is never stored as a complete summary. Summaries created by the
previous strategy are automatically rebuilt in batches from the retained
messages.

## Avatars

With no imported image, the avatar is chosen from **32 built-in portraits** of
young adults, generated specifically for the Praxis theme. The **silhouette**
stays deterministic per character: hair, facial hair, glasses and palette steer
which portrait is picked, while the coloured ring keeps indicating the mood.
Grammatical gender also filters the visual pool: fifteen feminine or sixteen
masculine portraits when it is specified, and all thirty-two for "Unspecified".
Fourteen dedicated coloured portraits — police officer, robot, scientist and
artist — accompany ready-to-customise sheets, with doctor, firefighter, police,
artist and student variants. The procedural SVG portrait remains available as a
fallback if an asset cannot be loaded.

For a real face, the form allows **importing an image** (photographic, drawn or
generated portrait): one per mood if needed, a missing mood falling back to the
neutral image. The file is validated on the Rust side (format derived from the
header bytes, 8 MB maximum) then **copied** into the application directory — the
database never references an arbitrary path on disk, and deletion refuses any
path outside that folder.

## Tests

```bash
npm test
```

They cover: day periods, elapsed-time categories, decay, delta clamping, mood
table, avatar resolution with missing variants, prompt budget and order, summary
triggering, per-speaker history rewriting, cleanup of impersonated lines,
speaker selection (mentions, direct address, round robin), and that each of
these behaves correctly in both prompt languages.

## Licence

MIT — see [LICENSE](LICENSE).

The 32 built-in portraits are AI-generated fictional faces, produced for this
project; see [static/avatars/README.md](static/avatars/README.md) for how they
were made.
