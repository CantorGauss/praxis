<script lang="ts">
  import { tick } from "svelte";
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import MemoryPanel from "./MemoryPanel.svelte";
  import { formatNumber, t } from "../i18n/ui.svelte";
  import {
    effectiveMaxOutputTokens,
    responseLengthPreset,
  } from "../services/inference";

  const s = $derived(t());

  let summaryButtonEl = $state<HTMLButtonElement | null>(null);
  let summarySheetEl = $state<HTMLDivElement | null>(null);
  let showInference = $state(false);
  let showMore = $state(false);
  let summaryForConversationId = $state<string | null>(null);

  const summaryOpen = $derived(
    Boolean(app.currentConversationId) &&
      summaryForConversationId === app.currentConversationId,
  );
  const contextBudget = $derived.by(() => {
    const prompt = app.lastPromptTokens;
    const capacity = app.lastPromptContextTokens;
    if (prompt === null || capacity === null || capacity <= 0) return null;
    const reply =
      app.lastReplyTokenBudget ??
      effectiveMaxOutputTokens(app.activePersona?.maxOutputTokens);
    const promptPercent = Math.min(100, (prompt / capacity) * 100);
    const replyPercent = Math.min(
      100 - promptPercent,
      (reply / capacity) * 100,
    );
    return {
      prompt,
      capacity,
      reply,
      promptPercent,
      replyPercent,
      replyLabel: s.responseLength[responseLengthPreset(reply).id].reply,
    };
  });

  function openSummary() {
    if (!app.currentConversationId) return;
    showMore = false;
    summaryForConversationId = app.currentConversationId;
    void tick().then(() => summarySheetEl?.focus());
  }

  function closeSummary() {
    summaryForConversationId = null;
    void tick().then(() => summaryButtonEl?.focus());
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    if (summaryOpen) closeSummary();
    showMore = false;
    showInference = false;
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<header class="chat-header">
    <div class="avatar-stack" style:--count={app.participants.length}>
      {#each app.participants.slice(0, 4) as p (p.id)}
        <Avatar size={42} personaId={p.id} />
      {/each}
      {#if app.participants.length === 0}
        <Avatar size={42} />
      {/if}
    </div>
    <div class="identity">
      <div class="name">
        {app.currentConversation?.title ?? s.chat.conversation}
      </div>
      <div class="meta">
        {app.participants.map((p) => p.name).join(" · ") || s.chat.noCharacter}
      </div>
    </div>
    <div class="spacer"></div>
    <span
      class="conn-dot"
      class:ok={app.connected === true}
      class:ko={app.connected === false}
      title={app.connected
        ? s.chat.connectedTo(
            app.activeConnection?.name ?? s.chat.serverFallback,
            app.activeConnection?.baseUrl ?? "",
          )
        : s.chat.unreachable(app.activeConnection?.name ?? s.chat.serverFallback)}
    ></span>
    {#if app.currentConversation}
      <button
        class="btn"
        class:on={app.curtainCallOpen}
        onclick={() => app.lowerCurtain()}
        title={s.curtainCall.buttonTitle}
      >
        <span class="scene-icon" aria-hidden="true">🎭</span>
        {s.curtainCall.button}
      </button>
    {/if}
    <button
      class="btn"
      class:on={app.castPanelOpen}
      onclick={() => (app.castPanelOpen = !app.castPanelOpen)}
      title={s.chat.sceneButtonTitle}
    >
      <span class="scene-icon" aria-hidden="true">🎬</span>
      {s.chat.scene}{app.participants.length > 0 ? ` (${app.participants.length})` : ""}
    </button>
    <div class="more-wrap">
      <button
        class="btn more-button"
        class:on={showMore}
        aria-label={s.chat.moreOptions}
        title={s.chat.moreOptions}
        onclick={() => {
          showMore = !showMore;
          if (!showMore) showInference = false;
        }}
      >•••</button>
      {#if showMore}
        <div class="more-menu">
          <div class="menu-status">
            <span class="conn-dot" class:ok={app.connected === true} class:ko={app.connected === false}></span>
            <span>{app.activeConnection?.name ?? s.chat.serverFallback}</span>
            <small>{app.activeModelId ?? s.chat.noModel}</small>
          </div>
          {#if app.connections.length > 1}
            <label class="menu-field">
              {s.chat.connection}
              <select
                value={app.activeConnection?.id ?? ""}
                onchange={(e) => void app.useConnection(e.currentTarget.value)}
              >
                {#each app.connections as c (c.id)}
                  <option value={c.id}>{c.name}</option>
                {/each}
              </select>
            </label>
          {/if}
          <button class="menu-row" bind:this={summaryButtonEl} onclick={openSummary}>
            <span>{s.chat.sceneMemory}</span><span>›</span>
          </button>
          <button class="menu-row" onclick={() => (showInference = !showInference)}>
            <span>{s.chat.temperature}</span><strong>{(app.temperatureOverride ?? app.activePersona?.temperature ?? 0.7).toFixed(2)}</strong>
          </button>
          {#if showInference}
            <div class="temperature-control">
              <input
                aria-label={s.chat.temperatureAria}
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={app.temperatureOverride ?? app.activePersona?.temperature ?? 0.7}
                oninput={(e) => (app.temperatureOverride = Number(e.currentTarget.value))}
              />
              <button onclick={() => (app.temperatureOverride = null)}>{s.chat.characterValue}</button>
            </div>
          {/if}
          {#if contextBudget}
            <div class="menu-context">
              <strong class="budget-title">{s.chat.modelCapacity}</strong>
              <strong>{s.chat.tokens(formatNumber(contextBudget.capacity))}</strong>
              <span>{s.chat.contextSent}</span>
              <span>≈ {formatNumber(contextBudget.prompt)}</span>
              <span>{s.chat.roomForReply(contextBudget.replyLabel)}</span>
              <span>{s.chat.upTo(formatNumber(contextBudget.reply))}</span>
              <i
                title={s.chat.capacityBarTitle}
                aria-label={s.chat.capacityBarAria}
              >
                <b
                  class="prompt-share"
                  style:width={`${contextBudget.promptPercent}%`}
                ></b>
                <b
                  class="reply-share"
                  style:width={`${contextBudget.replyPercent}%`}
                ></b>
              </i>
              <small>{s.chat.capacityNote}</small>
            </div>
          {/if}
          <button class="menu-row" onclick={() => (app.view = "settings")}>
            <span>{s.chat.openSettings}</span><span>›</span>
          </button>
        </div>
      {/if}
    </div>
  </header>

  {#if summaryOpen}
    <MemoryPanel onclose={closeSummary} bind:sheet={summarySheetEl} />
  {/if}

  {#if app.summarizing}
    <div class="compression-status" aria-live="polite">
      <span>
        {s.chat.compressing}
        {#if app.summaryPendingMessages > 0}
          {s.chat.compressingCount(app.summaryPendingMessages)}
        {/if}
      </span>
      <div class="compression-track"><i></i></div>
    </div>
  {/if}


<style>
  .chat-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 13px 22px;
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 14%, transparent);
    backdrop-filter: blur(10px);
    background: var(--chat-header-background);
    box-shadow: 0 14px 38px -24px var(--chat-header-shadow);
    z-index: 2;
  }

  .avatar-stack {
    display: flex;
    align-items: center;
  }

  .avatar-stack :global(.avatar-wrap:not(:first-child)) {
    margin-left: -15px;
    transition: margin 0.35s var(--spring);
  }

  /* Au survol, la troupe s'écarte pour se laisser voir. */
  .avatar-stack:hover :global(.avatar-wrap:not(:first-child)) {
    margin-left: 4px;
  }

  .scene-icon {
    font-size: 13px;
  }

  .identity .name {
    font-family: var(--font-stage);
    font-weight: 700;
    font-size: 19px;
    letter-spacing: 0.01em;
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .identity .meta {
    font-size: 11.5px;
    color: var(--text-faint);
  }

  .compression-status {
    position: relative;
    z-index: 3;
    padding: 7px 22px 9px;
    color: var(--text-soft);
    font-size: 12px;
    background: var(--compression-bg);
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .compression-track {
    height: 2px;
    margin-top: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--subtle-track);
  }

  .compression-track i {
    display: block;
    width: 38%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    animation: compress-context 1.15s ease-in-out infinite;
  }

  @keyframes compress-context {
    from { transform: translateX(-110%); }
    to { transform: translateX(290%); }
  }

  @media (prefers-reduced-motion: reduce) {
    .compression-track i {
      width: 100%;
      animation: none;
    }
  }

  .spacer {
    flex: 1;
  }

  .conn-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-faint);
  }

  /* Voyant « en scène » : il respire tant que le serveur répond. */
  .conn-dot.ok {
    background: var(--ok);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok) 60%, transparent);
    animation: on-air 2.4s ease-out infinite;
  }

  @keyframes on-air {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok) 55%, transparent); }
    70%, 100% { box-shadow: 0 0 0 7px transparent; }
  }

  @media (prefers-reduced-motion: reduce) {
    .conn-dot.ok {
      animation: none;
    }
  }

  .conn-dot.ko {
    background: var(--danger);
  }

  .more-wrap {
    position: relative;
  }

  .more-button {
    min-width: 42px;
    justify-content: center;
    letter-spacing: 0.08em;
  }

  .more-menu {
    position: absolute;
    top: calc(100% + 9px);
    right: 0;
    z-index: 25;
    width: 310px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--menu-bg);
    box-shadow: 0 20px 54px rgba(0, 0, 0, 0.5);
    animation: menu-pop 0.28s var(--spring) both;
    transform-origin: top right;
  }

  @keyframes menu-pop {
    from { opacity: 0; transform: translateY(-6px) scale(0.95); }
  }

  @media (prefers-reduced-motion: reduce) {
    .more-menu {
      animation: none;
    }
  }

  .menu-status {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    column-gap: 8px;
    padding: 8px 9px 11px;
    border-bottom: 1px solid var(--border-soft);
    color: var(--text-soft);
    font-size: 12.5px;
  }

  .menu-status small {
    grid-column: 2;
    overflow: hidden;
    color: var(--text-faint);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-row {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 9px;
    border-radius: 8px;
    color: var(--text-soft);
    text-align: left;
  }

  .menu-row:hover {
    color: var(--text);
    background: var(--bg-hover);
  }

  .menu-row strong {
    color: var(--text-faint);
    font-size: 11.5px;
    font-weight: 500;
  }

  .menu-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 9px;
    color: var(--text-faint);
    font-size: 11px;
  }

  .menu-field select {
    width: 100%;
    padding: 5px 7px;
    font-size: 12px;
  }

  .temperature-control,
  .menu-context {
    margin: 2px 8px 7px;
    padding: 9px;
    border-radius: 8px;
    background: var(--bg-sidebar);
  }

  .temperature-control input {
    width: 100%;
    padding: 0;
  }

  .temperature-control button {
    color: var(--accent);
    font-size: 11px;
  }

  .menu-context {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 5px 8px;
    color: var(--text-faint);
    font-size: 11px;
  }

  .menu-context .budget-title,
  .menu-context > strong:last-of-type {
    color: var(--text-soft);
  }

  .menu-context > strong:last-of-type,
  .menu-context > span:nth-of-type(even) {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .menu-context i {
    grid-column: 1 / -1;
    display: flex;
    height: 3px;
    overflow: hidden;
    border-radius: 99px;
    background: var(--border-soft);
  }

  .menu-context b {
    height: 100%;
  }

  .menu-context .prompt-share {
    background: var(--accent-soft);
  }

  .menu-context .reply-share {
    background: var(--accent);
  }

  .menu-context small {
    grid-column: 1 / -1;
    margin-top: 2px;
    color: var(--text-faint);
    line-height: 1.35;
  }

</style>
