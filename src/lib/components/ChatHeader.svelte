<script lang="ts">
  import { tick } from "svelte";
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import { formatNumber, t } from "../i18n/ui.svelte";
  import {
    KEEP_RECENT_MESSAGES,
    SUMMARY_FORMAT_MARKER,
  } from "../services/summaryService";
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

  const currentSummary = $derived(
    (app.currentConversation?.summary ?? "")
      .replace(SUMMARY_FORMAT_MARKER, "")
      .trim(),
  );
  const summaryOpen = $derived(
    Boolean(app.currentConversationId) &&
      summaryForConversationId === app.currentConversationId,
  );
  const summarizedMessageCount = $derived.by(() => {
    const boundary = app.currentConversation?.summaryThroughMessageId;
    if (!boundary) return 0;
    const index = app.messages.findIndex((message) => message.id === boundary);
    return index < 0 ? 0 : index + 1;
  });
  const recentMemoryMessageCount = $derived(
    app.messages.length - summarizedMessageCount,
  );
  const canCreateSummary = $derived(
    app.messages.length > KEEP_RECENT_MESSAGES,
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
    <button
      class="btn"
      class:on={app.castPanelOpen}
      onclick={() => (app.castPanelOpen = !app.castPanelOpen)}
      title={s.chat.sceneButtonTitle}
    >
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
            <span>{s.chat.conversationSummary}</span><span>›</span>
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
    <div class="summary-overlay">
      <button
        class="summary-scrim"
        aria-label={s.chat.closeSummary}
        onclick={closeSummary}
      ></button>
      <div
        class="summary-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-title"
        tabindex="-1"
        bind:this={summarySheetEl}
      >
        <header>
          <div>
            <span class="summary-kicker">{s.chat.condensedMemory}</span>
            <h2 id="summary-title">{s.chat.conversationSummary}</h2>
          </div>
          <button class="summary-close" onclick={closeSummary} aria-label={s.common.close}>
            ✕
          </button>
        </header>
        <p class="summary-explanation">{s.chat.summaryExplanation}</p>
        {#if currentSummary}
          <div class="summary-text">{currentSummary}</div>
        {:else}
          <div class="summary-empty">
            <strong>{s.chat.noSummaryYet}</strong>
            <p>{s.chat.noSummaryBody}</p>
          </div>
        {/if}
        <footer class="summary-actions">
          <span>
            {#if currentSummary}
              {s.chat.summaryCounts(summarizedMessageCount, recentMemoryMessageCount)}
            {:else if canCreateSummary}
              {s.chat.summaryAvailableFrom(app.messages.length)}
            {:else}
              {s.chat.summaryAvailableAfter(KEEP_RECENT_MESSAGES)}
            {/if}
          </span>
          <button
            class="btn"
            disabled={app.summarizing || app.turnInProgress || !canCreateSummary}
            onclick={() => void app.regenerateSummary()}
          >
            {app.summarizing
              ? s.chat.generating
              : currentSummary
                ? s.chat.regenerateSummary
                : s.chat.createSummary}
          </button>
        </footer>
      </div>
    </div>
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
    padding: 14px 22px;
    border-bottom: 1px solid rgba(185, 141, 61, 0.13);
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
  }

  .identity .name {
    font-family: var(--font-stage);
    font-weight: 600;
    font-size: 18px;
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
    border-bottom: 1px solid rgba(185, 141, 61, 0.18);
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

  .conn-dot.ok {
    background: var(--ok);
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
    border-radius: 13px;
    background: var(--menu-bg);
    box-shadow: 0 20px 54px rgba(0, 0, 0, 0.6);
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

  .summary-overlay {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 28px;
  }

  .summary-scrim {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: rgba(7, 4, 8, 0.76);
    backdrop-filter: blur(5px);
    cursor: default;
  }

  .summary-sheet {
    position: relative;
    width: min(680px, 100%);
    max-height: min(72vh, 720px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(197, 149, 75, 0.28);
    border-radius: 16px;
    background: var(--summary-bg);
    box-shadow: 0 32px 90px rgba(0, 0, 0, 0.72);
  }

  .summary-sheet > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding: 22px 24px 15px;
    border-bottom: 1px solid var(--border-soft);
  }

  .summary-kicker {
    color: var(--accent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .summary-sheet h2 {
    margin: 5px 0 0;
    color: var(--text);
    font-family: var(--font-stage);
    font-size: 22px;
    font-weight: 600;
  }

  .summary-close {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--text-soft);
    background: color-mix(in srgb, var(--text) 4%, transparent);
  }

  .summary-explanation {
    margin: 0;
    padding: 15px 24px;
    color: var(--text-faint);
    font-size: 12px;
    line-height: 1.5;
    border-bottom: 1px solid var(--border-soft);
  }

  .summary-text {
    overflow-y: auto;
    padding: 22px 24px 28px;
    color: var(--text-soft);
    font-family: var(--font-stage);
    font-size: 15px;
    line-height: 1.72;
    white-space: pre-wrap;
  }

  .summary-empty {
    padding: 34px 24px;
    text-align: center;
    color: var(--text-soft);
  }

  .summary-empty strong {
    display: block;
    margin-bottom: 7px;
    color: var(--text);
    font-family: var(--font-stage);
    font-size: 17px;
  }

  .summary-empty p {
    max-width: 52ch;
    margin: 0 auto;
    font-size: 12.5px;
  }

  .summary-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 13px 18px;
    border-top: 1px solid var(--border-soft);
    color: var(--text-faint);
    font-size: 11.5px;
  }

  .summary-actions .btn {
    flex: 0 0 auto;
  }

</style>
