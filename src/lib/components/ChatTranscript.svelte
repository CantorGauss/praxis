<script lang="ts">
  import { tick } from "svelte";
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import { MOOD_COLORS, personaAccent } from "../services/avatar";
  import { bubbleTone, tint, type BubbleTone } from "../services/bubbleTone";
  import { MOOD_LABELS_BY_LOCALE } from "../i18n/moods";
  import { t, uiLocale } from "../i18n/ui.svelte";
  import { splitActions } from "../services/messageFormat";
  import { detectAddressee } from "../services/scene";
  import { USER_ADDRESSEE, type DialogueIntent, type Message } from "../types";

  let { bottomOffset = 0 }: { bottomOffset?: number } = $props();

  const s = $derived(t());
  const group = $derived(app.isGroupConversation);
  const lastUserId = $derived(
    [...app.messages]
      .reverse()
      .find((message) => message.role === "user" && message.kind === "speech")
      ?.id ?? null,
  );
  const lastMessage = $derived(app.messages[app.messages.length - 1] ?? null);
  const streamingPersona = $derived(app.personaById(app.streamingPersonaId));
  const pendingNames = $derived(
    app.pendingSpeakerIds
      .map((id) => app.personaById(id)?.name)
      .filter((name): name is string => Boolean(name)),
  );

  let editing = $state<{ id: string; content: string } | null>(null);
  let listEl = $state<HTMLElement | null>(null);
  let now = $state(Date.now());
  let followStream = $state(true);
  let unreadBelow = $state(false);
  let lastObservedMessageId = $state<string | null>(null);
  const BOTTOM_SLACK_PX = 64;

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(id);
  });

  const idleCountdown = $derived(
    app.idleResumeAt === null
      ? null
      : Math.max(0, Math.ceil((app.idleResumeAt - now) / 1000)),
  );

  function isAtBottom(element: HTMLElement): boolean {
    return (
      element.scrollHeight - element.scrollTop - element.clientHeight <=
      BOTTOM_SLACK_PX
    );
  }

  function onListScroll() {
    if (!listEl) return;
    followStream = isAtBottom(listEl);
    if (followStream) unreadBelow = false;
  }

  function jumpToBottom() {
    followStream = true;
    unreadBelow = false;
    listEl?.scrollTo({ top: listEl.scrollHeight, behavior: "smooth" });
  }

  $effect(() => {
    const last = app.messages[app.messages.length - 1] ?? null;
    void app.streamingContent;
    if (last?.id !== lastObservedMessageId) {
      lastObservedMessageId = last?.id ?? null;
      if (last?.role === "user") {
        followStream = true;
        unreadBelow = false;
      }
    }
    void tick().then(() => {
      if (!listEl) return;
      if (followStream) listEl.scrollTop = listEl.scrollHeight;
      else unreadBelow = true;
    });
  });

  // Seules les répliques nées sous les yeux de l'utilisateur font leur
  // entrée : rouvrir une conversation ne rejoue pas toute la pièce.
  let openedAt = $state(Date.now());

  $effect(() => {
    void app.currentConversationId;
    followStream = true;
    unreadBelow = false;
    lastObservedMessageId = null;
    openedAt = Date.now();
  });

  function isFresh(message: Message): boolean {
    return Date.parse(message.createdAt) >= openedAt - 500;
  }

  const moodLabels = $derived(MOOD_LABELS_BY_LOCALE[uiLocale()]);

  function toneOf(message: Message): BubbleTone {
    const reaction = app.settings.emotionEnabled ? message.reaction : null;
    return bubbleTone(message.content, reaction);
  }

  /** Teinte de la bulle, dosée par l'intensité de l'humeur. */
  function toneStyle(tone: BubbleTone): string {
    if (!tone.mood) return "";
    const color = MOOD_COLORS[tone.mood];
    const k = 0.35 + tone.intensity * 0.65;
    return [
      `--tone-wash: ${tint(color, 0.05 + 0.13 * k)}`,
      `--tone-edge: ${tint(color, 0.18 + 0.45 * k)}`,
      `--tone-glow: ${tint(color, 0.1 + 0.32 * k)}`,
      `--tone-solid: ${color}`,
    ].join("; ");
  }

  const INTENT_ICON: Record<DialogueIntent, string> = {
    statement: "",
    question: "?",
    answer: "↩",
    clarification: "ℹ",
    proposal: "💡",
    agreement: "✓",
    objection: "✋",
    conditional: "≈",
    withdrawal: "↶",
  };

  async function copyMessage(message: Message) {
    await navigator.clipboard.writeText(message.content);
  }

  function startEditing(message: Message) {
    editing = { id: message.id, content: message.content };
  }

  async function submitEdit() {
    if (!editing) return;
    const content = editing.content.trim();
    editing = null;
    if (content) await app.editLastUserMessage(content);
  }

  function addresseeOf(message: Message): { id: string; name: string } | null {
    const candidates = [
      { id: USER_ADDRESSEE, name: app.userName },
      ...app.personas.map((persona) => ({ id: persona.id, name: persona.name })),
    ].filter((candidate) => candidate.id !== message.personaId);
    if (message.addressee) {
      return (
        candidates.find((candidate) => candidate.id === message.addressee) ?? null
      );
    }
    return detectAddressee(message.content, candidates);
  }

  function accentOf(id: string): string {
    return id === USER_ADDRESSEE ? "var(--text-soft)" : personaAccent(id);
  }
</script>

<main class="messages" bind:this={listEl} onscroll={onListScroll}>
    {#if app.currentConversation?.sceneDescription}
      <div class="situation">
        <span class="situation-label"><span aria-hidden="true">🎬</span> {s.chat.startingSituation}</span>
        {app.currentConversation.sceneDescription}
      </div>
    {/if}
    {#if app.messages.length === 0}
      <div class="welcome">
        <div class="welcome-avatars">
          {#each app.participants.slice(0, 4) as p, i (p.id)}
            <span class="welcome-actor" style:--i={i}>
              <Avatar size={96} personaId={p.id} />
            </span>
          {/each}
          {#if app.participants.length === 0}
            <Avatar size={96} />
          {/if}
        </div>
        <p>
          {#if app.participants.length > 1}
            {s.chat.welcomeGroup(
              app.participants.map((p) => p.name).join(", "),
              app.participants[0].name,
            )}
          {:else if app.participants.length === 1}
            {s.chat.welcomeSolo(app.participants[0].name)}
          {:else}
            {s.chat.welcomeEmpty}
          {/if}
        </p>
      </div>
    {/if}
    {#each app.messages as m (m.id)}
      {#if m.kind === "narration"}
        <div
          class="narration"
          class:generated={m.role === "assistant"}
          class:fresh={isFresh(m)}
          title={m.role === "assistant" ? s.app.generatedTwist : undefined}
        >{m.content}</div>
      {:else}
      {@const speakerName = app.labelFor(m)}
      {@const tone = toneOf(m)}
      <div
        id={`message-${m.id}`}
        class="message {m.role} enter-{tone.entrance}"
        class:with-avatar={m.role === "assistant"}
        class:grouped={group}
        class:fresh={isFresh(m)}
      >
        {#if editing && editing.id === m.id}
          <div class="bubble editing">
            <textarea rows="3" bind:value={editing.content}></textarea>
            <div class="edit-actions">
              <button class="btn" onclick={() => (editing = null)}>{s.common.cancel}</button>
              <button class="btn primary" onclick={() => void submitEdit()}>
                {s.chat.send}
              </button>
            </div>
          </div>
        {:else}
          <div class="row">
            {#if m.role === "assistant"}
              <div class="avatar-slot">
                <Avatar size={64} personaId={m.personaId} fallbackName={speakerName} />
              </div>
            {/if}
            <div class="column">
              {#if group}
                {@const to = addresseeOf(m)}
                <div class="speaker">
                  <span
                    class="from"
                    style:--speaker-c={m.role === "assistant"
                      ? personaAccent(m.personaId ?? speakerName)
                      : "var(--text-soft)"}
                  >
                    {m.role === "assistant" ? speakerName : app.userName}
                  </span>
                  <span class="arrow">→</span>
                  <span
                    class="to"
                    class:everyone={to === null}
                    style:--to-c={to ? accentOf(to.id) : "var(--text-faint)"}
                  >
                    {to ? to.name : s.chat.everyone}
                  </span>
                  {#if m.status === "complete" && m.interaction && m.interaction.intent !== "statement"}
                    <span
                      class="intention intent-{m.interaction.intent}"
                      title={s.coordination.intentHint}
                    ><span class="intent-icon" aria-hidden="true">{INTENT_ICON[m.interaction.intent]}</span>{s.coordination.intent[m.interaction.intent]}</span>
                  {/if}
                </div>
              {/if}
              <div
                class="bubble {tone.delivery ? `say-${tone.delivery}` : ''}"
                class:cancelled={m.status === "cancelled"}
                class:streaming={m.status === "streaming"}
                class:moody={tone.mood !== null}
                style={toneStyle(tone)}
                style:--speaker-c={m.role === "assistant"
                  ? personaAccent(m.personaId ?? speakerName)
                  : "transparent"}
                class:tinted={group && m.role === "assistant"}
              >
                {#if tone.emoji && m.status !== "cancelled"}
                  <span
                    class="mood-badge"
                    title={tone.mood ? moodLabels[tone.mood] : undefined}
                    aria-label={tone.mood ? moodLabels[tone.mood] : undefined}
                  >{tone.emoji}</span>
                {/if}
                {#if m.status === "streaming" && !m.content}<span
                    class="typing"
                    aria-label={s.chat.isAnswering(speakerName)}
                  ><i></i><i></i><i></i></span>{/if}{#each splitActions(m.content) as seg}{#if seg.kind === "action"}<span
                      class="rp-action">{seg.text}</span>{:else}{seg.text}{/if}{/each}{#if m.status === "streaming" && m.content}<span class="cursor">▍</span>{/if}
                {#if m.status === "cancelled"}
                  <div class="status-label">{s.chat.interrupted}</div>
                {/if}
              </div>
            </div>
          </div>
          <div class="actions" class:indented={m.role === "assistant"}>
            <button onclick={() => void copyMessage(m)}>{s.common.copy}</button>
            {#if m.role === "assistant" && m.id === lastMessage?.id && !app.streaming}
              <button onclick={() => void app.regenerate()}>{s.chat.regenerate}</button>
            {/if}
            {#if m.role === "user" && m.id === lastUserId && !app.streaming}
              <button onclick={() => startEditing(m)}>{s.common.edit}</button>
            {/if}
          </div>
        {/if}
      </div>
      {/if}
    {/each}

    {#if idleCountdown !== null}
      <div class="idle-hint">
        {s.chat.idleCountdown(idleCountdown)}
        <button onclick={() => app.toggleIdlePause()}>{s.chat.pause}</button>
        <button onclick={() => app.cancelIdleChatter()}>{s.chat.waitForMyMessage}</button>
      </div>
    {:else if app.idlePaused && group}
      <div class="idle-hint">
        {s.chat.scenePaused}
        <button onclick={() => app.toggleIdlePause()}>{s.chat.resume}</button>
      </div>
    {/if}

    {#if app.directing}
      <div class="turn-status"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>{s.chat.whoSpeaks}</div>
    {/if}

    {#if group && (streamingPersona || pendingNames.length > 0)}
      <div class="turn-status">
        {#if streamingPersona}
          <span
            class="dots"
            aria-hidden="true"
            style:--dot-c={personaAccent(streamingPersona.id)}
          ><i></i><i></i><i></i></span>
          {s.chat.isAnswering(streamingPersona.name)}
        {/if}
        {#if pendingNames.length > 0}
          <span class="waiting">
            {s.chat.thenSpeakers(pendingNames.join(", "))}
          </span>
        {/if}
      </div>
    {/if}
  </main>

  {#if unreadBelow}
    <button
      class="jump-bottom"
      style:bottom={`${bottomOffset + 12}px`}
      onclick={jumpToBottom}
    >
      {app.streaming ? s.chat.sceneContinuesBelow : s.chat.newLinesBelow} ↓
    </button>
  {/if}


<style>
  .message { scroll-margin-top: 16px; }
  .intention {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 6px;
    padding: 1px 8px 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--intent-c, var(--border));
    color: var(--intent-c, var(--text-faint));
    font-size: 11px;
    line-height: 1.5;
  }
  .intent-icon { font-size: 10.5px; }
  .intent-question { --intent-c: rgba(143, 124, 232, 0.8); }
  .intent-proposal { --intent-c: rgba(240, 179, 68, 0.85); }
  .intent-agreement { --intent-c: rgba(95, 176, 125, 0.85); }
  .intent-objection { --intent-c: rgba(225, 95, 85, 0.85); }
  .intent-conditional { --intent-c: rgba(232, 152, 95, 0.85); }
  .jump-bottom {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    padding: 7px 16px;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent-gradient);
    box-shadow: 0 10px 26px -8px var(--accent-glow);
    cursor: pointer;
    animation: jump-in 0.4s var(--spring) both;
  }

  .jump-bottom:hover {
    filter: brightness(1.06);
  }

  @keyframes jump-in {
    from { opacity: 0; transform: translate(-50%, 12px) scale(0.9); }
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding:
      var(--messages-padding-top) clamp(24px, 5vw, 68px)
      var(--messages-padding-bottom);
    display: flex;
    flex-direction: column;
    gap: var(--message-gap);
    background: var(--chat-stage-background);
    box-shadow: inset 0 20px 42px -36px rgba(201, 153, 76, 0.28);
  }

  .welcome {
    margin: auto;
    text-align: center;
    font-family: var(--font-stage);
    font-size: 17px;
    color: var(--text-soft);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    max-width: 460px;
  }

  .welcome-avatars {
    display: flex;
    gap: 14px;
  }

  @media (prefers-reduced-motion: no-preference) {
    .welcome-actor {
      animation:
        avatar-hop 0.6s var(--spring) both,
        welcome-bob 3s ease-in-out 0.8s infinite;
      animation-delay: calc(var(--i) * 0.12s), calc(0.8s + var(--i) * 0.4s);
    }
  }

  @keyframes welcome-bob {
    0%, 100% { translate: 0 0; }
    50% { translate: 0 -6px; }
  }

  .message {
    display: flex;
    flex-direction: column;
    max-width: min(78%, 780px);
  }

  .message.user {
    align-self: flex-end;
    align-items: flex-end;
  }

  .message.assistant {
    align-self: flex-start;
    align-items: flex-start;
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 15px;
  }

  .avatar-slot {
    flex-shrink: 0;
    transition: transform 0.35s var(--spring);
  }

  .message:hover .avatar-slot {
    transform: rotate(-5deg) scale(1.05);
  }

  .column {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* « Qui → à qui », lisible d'un coup d'œil dans une scène à plusieurs. */
  .speaker {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    margin: 0 0 5px 3px;
  }

  .message.user .speaker {
    justify-content: flex-end;
  }

  .speaker .from {
    font-family: var(--font-stage);
    font-weight: 700;
    font-variant: small-caps;
    letter-spacing: 0.04em;
    color: var(--speaker-c);
    padding: 0 9px 1px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--speaker-c) 14%, transparent);
    white-space: nowrap;
  }

  .speaker .arrow {
    color: var(--text-faint);
    font-size: 11px;
  }

  .speaker .to {
    font-family: var(--font-stage);
    font-weight: 600;
    font-variant: small-caps;
    letter-spacing: 0.04em;
    color: var(--to-c);
  }

  .speaker .to.everyone {
    font-weight: 500;
    font-style: italic;
  }

  .bubble {
    font-family: var(--font-stage);
    font-size: var(--chat-font-size);
    line-height: 1.65;
    padding: var(--bubble-padding);
    border-radius: 20px;
    white-space: pre-wrap;
    word-break: break-word;
    border: 1px solid var(--bubble-border);
    position: relative;
    transition:
      border-color 0.4s ease,
      box-shadow 0.4s ease;
  }

  /* La voix de l'utilisateur : la couleur de la rampe, en lavis. */
  .message.user .bubble {
    background:
      linear-gradient(135deg, rgba(255, 191, 71, 0.16), rgba(255, 95, 143, 0.14)),
      var(--bg-user-bubble);
    border-color: color-mix(in srgb, var(--accent-2) 22%, transparent);
    border-bottom-right-radius: 6px;
    box-shadow: 0 14px 30px -20px var(--accent-glow);
  }

  .message.assistant .bubble {
    background:
      linear-gradient(145deg, var(--tone-wash, rgba(92, 58, 75, 0.1)), transparent 64%),
      var(--bg-assistant-bubble);
    border-bottom-left-radius: 6px;
    box-shadow: 0 12px 28px -19px var(--bubble-shadow);
  }

  /* Humeur figée avec la réplique : un lavis et un liseré, dosés par l'intensité. */
  .bubble.moody {
    border-color: var(--tone-edge);
    box-shadow:
      0 12px 28px -19px var(--bubble-shadow),
      0 0 22px -10px var(--tone-glow);
  }

  /* Pastille d'émotion, posée au coin de la bulle. */
  .mood-badge {
    position: absolute;
    top: -11px;
    right: -11px;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 14px;
    font-style: normal;
    line-height: 1;
    background: var(--bg-panel);
    border: 1px solid var(--tone-edge, var(--border));
    box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.45);
    cursor: default;
    user-select: none;
  }

  .message.user .mood-badge {
    right: auto;
    left: -11px;
  }

  /* Façon de dire : crier, chuchoter, rire. */
  .bubble.say-shout {
    font-weight: 600;
    letter-spacing: 0.01em;
    font-size: calc(var(--chat-font-size) * 1.05);
    border-width: 1.5px;
    border-color: var(--tone-edge, rgba(225, 79, 79, 0.45));
  }

  /* Ni italique ni gris : ce sont les marques des didascalies, et les
     paroles chuchotées doivent rester des paroles. */
  .bubble.say-whisper {
    font-size: calc(var(--chat-font-size) * 0.95);
    border-style: dashed;
  }

  .bubble.say-laugh {
    border-radius: 22px;
  }

  .message.user .bubble.say-laugh {
    border-bottom-right-radius: 6px;
  }

  .message.assistant .bubble.say-laugh {
    border-bottom-left-radius: 6px;
  }

  /* Points de suspension pendant que le personnage cherche ses mots. */
  .typing,
  .dots {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    vertical-align: middle;
  }

  .typing {
    padding: 4px 2px;
  }

  .typing i,
  .dots i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--speaker-c, var(--text-faint));
    opacity: 0.5;
  }

  .message.user .typing i {
    background: var(--text-faint);
  }

  .dots {
    gap: 3px;
    margin-right: 7px;
  }

  .dots i {
    width: 5px;
    height: 5px;
    background: var(--dot-c, var(--text-faint));
  }

  /* En scène de groupe, un liseré coloré identifie le locuteur d'un coup d'œil. */
  .bubble.tinted {
    border-left: 3px solid var(--speaker-c);
  }

  .bubble.cancelled {
    opacity: 0.75;
  }

  /* Didascalies (*action*) : distinctes des paroles */
  .rp-action {
    font-style: italic;
    color: var(--text-soft);
    opacity: 0.9;
  }

  .rp-action::before {
    content: "· ";
    color: var(--text-faint);
    font-style: normal;
  }

  .rp-action::after {
    content: " ·";
    color: var(--text-faint);
    font-style: normal;
  }

  .bubble.editing {
    width: 100%;
    min-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .status-label {
    font-size: 11.5px;
    color: var(--text-faint);
    font-style: italic;
    margin-top: 4px;
  }

  .cursor {
    animation: blink 1s step-end infinite;
    color: var(--accent);
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .actions {
    display: flex;
    gap: 10px;
    padding: 3px 6px;
    visibility: hidden;
  }

  .actions.indented {
    padding-left: 75px;
  }

  .message:hover .actions {
    visibility: visible;
  }

  .actions button {
    padding: 1px 9px;
    border-radius: 999px;
    font-size: 11.5px;
    color: var(--text-faint);
    transition:
      color 0.15s,
      background 0.15s;
  }

  .actions button:hover {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  /* Décor commun, affiché en tête : connu de tous, dit par personne. */
  .situation {
    font-family: var(--font-stage);
    align-self: center;
    max-width: 86%;
    background: var(--situation-bg);
    border: 1px dashed color-mix(in srgb, var(--accent) 32%, transparent);
    border-radius: 16px;
    padding: 12px 18px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-soft);
    white-space: pre-wrap;
  }

  .situation-label {
    display: block;
    font-family: var(--font);
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
    margin-bottom: 4px;
  }

  /* Didascalie : appartient au lieu, pas à un locuteur — donc pas de bulle. */
  .narration {
    font-family: var(--font-stage);
    align-self: center;
    max-width: 78%;
    text-align: center;
    font-style: italic;
    font-size: 13.5px;
    color: var(--text-soft);
    padding: 8px 22px;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--accent) 9%, transparent) 20%,
      color-mix(in srgb, var(--accent) 9%, transparent) 80%,
      transparent
    );
  }

  /* Imprévu écrit par le modèle : même didascalie, signée d'un astérisme. */
  .narration.generated::before {
    content: "✦";
    margin-right: 6px;
    display: inline-block;
    font-style: normal;
    color: var(--accent);
  }

  .narration.generated {
    color: var(--text);
  }

  .idle-hint {
    align-self: center;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-faint);
    font-style: italic;
  }

  .idle-hint button {
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    font-size: 11.5px;
    color: var(--accent);
    font-style: normal;
  }

  .idle-hint button:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .turn-status {
    align-self: flex-start;
    font-size: 12px;
    color: var(--text-faint);
    font-style: italic;
    padding-left: 4px;
  }

  .turn-status .waiting {
    opacity: 0.8;
  }

  /* ---------------------------------------------------------------------
     Entrées en scène. Seules les répliques nouvelles bougent, et rien ne
     bouge si le système demande de réduire les animations.
     --------------------------------------------------------------------- */
  @media (prefers-reduced-motion: no-preference) {
    .message.fresh .column {
      animation: enter-rise 0.32s ease-out both;
    }

    .message.assistant .column { transform-origin: 0% 100%; }
    .message.user .column { transform-origin: 100% 100%; }

    .message.fresh.enter-pop .column {
      animation: enter-pop 0.42s cubic-bezier(0.2, 1.5, 0.4, 1) both;
    }
    .message.fresh.enter-shake .column {
      animation: enter-shake 0.55s ease-out both;
    }
    .message.fresh.enter-bounce .column {
      animation: enter-bounce 0.6s cubic-bezier(0.3, 1.4, 0.5, 1) both;
    }
    .message.fresh.enter-droop .column {
      animation: enter-droop 0.9s ease-out both;
    }
    .message.fresh.enter-tremble .column {
      animation: enter-tremble 0.8s linear both;
    }
    .message.fresh.enter-drift .column {
      animation: enter-drift 0.9s ease-out both;
    }
    .message.fresh.enter-tilt .column {
      animation: enter-tilt 0.5s ease-out both;
    }

    /* L'avatar réagit avec la bulle. */
    .message.fresh .avatar-slot {
      animation: avatar-in 0.4s ease-out both;
    }
    .message.fresh.enter-bounce .avatar-slot,
    .message.fresh.enter-pop .avatar-slot {
      animation: avatar-hop 0.55s cubic-bezier(0.3, 1.5, 0.5, 1) both;
    }
    .message.fresh.enter-shake .avatar-slot,
    .message.fresh.enter-tremble .avatar-slot {
      animation: avatar-shake 0.55s ease-out both;
    }
    .message.fresh.enter-droop .avatar-slot {
      animation: avatar-droop 1s ease-out both;
    }

    .message.fresh .mood-badge {
      animation: badge-pop 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) 0.25s both;
    }
    .message.fresh.enter-bounce .mood-badge {
      animation:
        badge-pop 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) 0.25s both,
        badge-wiggle 0.6s ease-in-out 0.7s 2;
    }

    /* Un cri envoie une onde autour de la bulle. */
    .message.fresh .bubble.say-shout::after {
      content: "";
      position: absolute;
      inset: -1px;
      border-radius: inherit;
      border: 2px solid var(--tone-solid, rgba(225, 79, 79, 0.8));
      pointer-events: none;
      animation: shout-ring 0.7s ease-out 0.1s both;
    }

    /* La façon de dire se joue sur la bulle, au moment où elle se révèle —
       parfois en plein streaming, quand la didascalie arrive. */
    .message.fresh .bubble.say-shout {
      animation: say-shake 0.5s ease-out 0.1s;
    }
    .message.fresh .bubble.say-laugh {
      animation: say-giggle 0.7s ease-in-out 0.1s;
    }
    .message.fresh .bubble.say-tremble {
      animation: enter-tremble 0.8s linear 0.1s;
    }

    /* Une lueur respire autour de la bulle tant que le personnage parle. */
    .bubble.streaming::before {
      content: "";
      position: absolute;
      inset: -1px;
      border-radius: inherit;
      box-shadow: 0 0 18px -6px var(--tone-glow, var(--speaker-c, var(--accent)));
      pointer-events: none;
      animation: breathe 1.8s ease-in-out infinite;
    }

    .typing i,
    .dots i {
      animation: typing 1.1s ease-in-out infinite;
    }
    .typing i:nth-child(2),
    .dots i:nth-child(2) { animation-delay: 0.15s; }
    .typing i:nth-child(3),
    .dots i:nth-child(3) { animation-delay: 0.3s; }

    .narration.fresh {
      animation: narration-in 0.7s ease-out both;
    }

    /* Un imprévu traverse la scène d'un éclat doré. */
    .narration.generated.fresh {
      background-image: linear-gradient(
        100deg,
        transparent 35%,
        rgba(210, 164, 77, 0.2) 50%,
        transparent 65%
      );
      background-size: 300% 100%;
      background-repeat: no-repeat;
      animation:
        narration-in 0.7s ease-out both,
        sweep 1.6s ease-in-out 0.2s both;
    }

    .narration.generated.fresh::before {
      animation: spark 1s ease-out 0.15s both;
    }
  }

  @keyframes enter-rise {
    from { opacity: 0; transform: translateY(10px) scale(0.985); }
    to { opacity: 1; transform: none; }
  }

  @keyframes enter-pop {
    0% { opacity: 0; transform: scale(0.6); }
    60% { opacity: 1; transform: scale(1.05); }
    100% { opacity: 1; transform: none; }
  }

  @keyframes enter-shake {
    0% { opacity: 0; transform: scale(0.9); }
    18% { opacity: 1; transform: scale(1.04); }
    30% { transform: translateX(-7px) rotate(-0.6deg); }
    45% { transform: translateX(6px) rotate(0.5deg); }
    60% { transform: translateX(-4px); }
    75% { transform: translateX(3px); }
    90% { transform: translateX(-1px); }
    100% { opacity: 1; transform: none; }
  }

  @keyframes enter-bounce {
    0% { opacity: 0; transform: translateY(20px) scale(0.94); }
    50% { opacity: 1; transform: translateY(-7px) scale(1.02); }
    72% { transform: translateY(2px); }
    100% { opacity: 1; transform: none; }
  }

  @keyframes enter-droop {
    from { opacity: 0; transform: translateY(-8px); filter: saturate(0.4); }
    to { opacity: 1; transform: none; filter: none; }
  }

  @keyframes enter-tremble {
    0% { opacity: 0; transform: translateX(0); }
    15% { opacity: 1; transform: translateX(-2px); }
    25% { transform: translateX(2px); }
    35% { transform: translateX(-2px); }
    45% { transform: translateX(1.5px); }
    55% { transform: translateX(-1.5px); }
    65% { transform: translateX(1px); }
    75% { transform: translateX(-1px); }
    100% { opacity: 1; transform: none; }
  }

  @keyframes enter-drift {
    from { opacity: 0; filter: blur(3px); transform: translateY(4px); }
    to { opacity: 1; filter: none; transform: none; }
  }

  @keyframes enter-tilt {
    0% { opacity: 0; transform: translateY(8px) rotate(-2.5deg); }
    60% { opacity: 1; transform: rotate(1deg); }
    100% { opacity: 1; transform: none; }
  }

  @keyframes avatar-in {
    from { opacity: 0; transform: scale(0.85); }
    to { opacity: 1; transform: none; }
  }

  @keyframes avatar-hop {
    0% { opacity: 0; transform: translateY(8px) scale(0.9); }
    45% { opacity: 1; transform: translateY(-9px) scale(1.04); }
    100% { opacity: 1; transform: none; }
  }

  @keyframes avatar-shake {
    0% { opacity: 0; }
    20% { opacity: 1; transform: rotate(-6deg); }
    40% { transform: rotate(5deg); }
    60% { transform: rotate(-3deg); }
    80% { transform: rotate(2deg); }
    100% { opacity: 1; transform: none; }
  }

  @keyframes avatar-droop {
    from { opacity: 0; transform: translateY(-6px) rotate(3deg); }
    to { opacity: 1; transform: none; }
  }

  @keyframes badge-pop {
    from { opacity: 0; transform: scale(0) rotate(-30deg); }
    to { opacity: 1; transform: none; }
  }

  @keyframes badge-wiggle {
    25% { transform: rotate(-14deg); }
    75% { transform: rotate(14deg); }
  }

  @keyframes shout-ring {
    from { opacity: 0.8; transform: scale(1); }
    to { opacity: 0; transform: scale(1.08, 1.25); }
  }

  @keyframes breathe {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.85; }
  }

  @keyframes say-shake {
    0%, 100% { transform: none; }
    15% { transform: translateX(-6px) rotate(-0.8deg); }
    30% { transform: translateX(5px) rotate(0.6deg); }
    45% { transform: translateX(-4px); }
    60% { transform: translateX(3px); }
    80% { transform: translateX(-1px); }
  }

  @keyframes say-giggle {
    0%, 100% { transform: none; }
    20% { transform: translateY(-4px) rotate(-0.6deg); }
    40% { transform: translateY(0) rotate(0.4deg); }
    60% { transform: translateY(-3px) rotate(-0.3deg); }
    80% { transform: translateY(0); }
  }

  @keyframes typing {
    0%, 60%, 100% { opacity: 0.35; transform: translateY(0); }
    30% { opacity: 0.95; transform: translateY(-4px); }
  }

  @keyframes narration-in {
    from { opacity: 0; letter-spacing: 0.06em; }
    to { opacity: 1; letter-spacing: normal; }
  }

  @keyframes sweep {
    from { background-position: 100% 0; }
    to { background-position: 0% 0; }
  }

  @keyframes spark {
    0% { opacity: 0; transform: scale(0.2) rotate(-180deg); }
    60% { opacity: 1; transform: scale(1.5) rotate(20deg); }
    100% { opacity: 1; transform: none; }
  }

  @media (max-width: 920px) {
    .messages {
      padding-inline: 22px;
    }

    .message {
      max-width: 88%;
    }
  }
</style>
