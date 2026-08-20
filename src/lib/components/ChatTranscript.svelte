<script lang="ts">
  import { tick } from "svelte";
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import { personaAccent } from "../services/avatar";
  import { t } from "../i18n/ui.svelte";
  import { splitActions } from "../services/messageFormat";
  import { detectAddressee } from "../services/scene";
  import { USER_ADDRESSEE, type Message } from "../types";

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

  $effect(() => {
    void app.currentConversationId;
    followStream = true;
    unreadBelow = false;
    lastObservedMessageId = null;
  });

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
        <span class="situation-label">{s.chat.startingSituation}</span>
        {app.currentConversation.sceneDescription}
      </div>
    {/if}
    {#if app.messages.length === 0}
      <div class="welcome">
        <div class="welcome-avatars">
          {#each app.participants.slice(0, 4) as p (p.id)}
            <Avatar size={96} personaId={p.id} />
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
        <div class="narration">{m.content}</div>
      {:else}
      {@const speakerName = app.labelFor(m)}
      <div
        class="message {m.role}"
        class:with-avatar={m.role === "assistant"}
        class:grouped={group}
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
              <Avatar size={64} personaId={m.personaId} fallbackName={speakerName} />
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
                </div>
              {/if}
              <div
                class="bubble"
                class:cancelled={m.status === "cancelled"}
                style:--speaker-c={m.role === "assistant"
                  ? personaAccent(m.personaId ?? speakerName)
                  : "transparent"}
                class:tinted={group && m.role === "assistant"}
              >
                {#each splitActions(m.content) as seg}{#if seg.kind === "action"}<span
                      class="rp-action">{seg.text}</span>{:else}{seg.text}{/if}{/each}{#if m.status === "streaming"}<span class="cursor">▍</span>{/if}
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
      <div class="turn-status">{s.chat.whoSpeaks}</div>
    {/if}

    {#if group && (streamingPersona || pendingNames.length > 0)}
      <div class="turn-status">
        {#if streamingPersona}
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
  .jump-bottom {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    padding: 7px 16px;
    border-radius: 999px;
    font-size: 12.5px;
    color: var(--text);
    background: var(--bg-panel);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    cursor: pointer;
  }

  .jump-bottom:hover {
    border-color: var(--accent-soft);
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
    font-weight: 600;
    font-variant: small-caps;
    letter-spacing: 0.04em;
    color: var(--speaker-c);
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
    border-radius: 16px;
    white-space: pre-wrap;
    word-break: break-word;
    border: 1px solid var(--bubble-border);
  }

  .message.user .bubble {
    background:
      linear-gradient(155deg, rgba(111, 72, 91, 0.13), transparent 62%),
      var(--bg-user-bubble);
    border-bottom-right-radius: 4px;
    box-shadow: 0 12px 26px -19px var(--bubble-shadow);
  }

  .message.assistant .bubble {
    background:
      linear-gradient(145deg, rgba(92, 58, 75, 0.1), transparent 64%),
      var(--bg-assistant-bubble);
    border-bottom-left-radius: 4px;
    box-shadow: 0 12px 28px -19px var(--bubble-shadow);
  }

  /* En scène de groupe, un liseré coloré identifie le locuteur d'un coup d'œil. */
  .bubble.tinted {
    border-left: 2px solid var(--speaker-c);
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
    padding-left: 79px;
  }

  .message:hover .actions {
    visibility: visible;
  }

  .actions button {
    font-size: 11.5px;
    color: var(--text-faint);
  }

  .actions button:hover {
    color: var(--accent);
  }

  /* Décor commun, affiché en tête : connu de tous, dit par personne. */
  .situation {
    font-family: var(--font-stage);
    align-self: center;
    max-width: 86%;
    background: var(--situation-bg);
    border: 1px solid rgba(185, 141, 61, 0.14);
    border-radius: var(--radius);
    padding: 12px 18px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-soft);
    white-space: pre-wrap;
  }

  .situation-label {
    display: block;
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-faint);
    margin-bottom: 4px;
  }

  /* Didascalie : appartient au lieu, pas à un locuteur — donc pas de bulle. */
  .narration {
    font-family: var(--font-stage);
    align-self: center;
    max-width: 78%;
    text-align: center;
    font-style: italic;
    font-size: 12.5px;
    color: #9c8c7f;
    padding: 7px 18px;
    border-top: 1px solid rgba(185, 141, 61, 0.12);
    border-bottom: 1px solid rgba(185, 141, 61, 0.12);
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
    font-size: 11.5px;
    color: var(--accent);
    text-decoration: underline;
    font-style: normal;
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

  @media (max-width: 920px) {
    .messages {
      padding-inline: 22px;
    }

    .message {
      max-width: 88%;
    }
  }
</style>
