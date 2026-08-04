<script lang="ts">
  import { tick } from "svelte";
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import { MOOD_COLORS, personaAccent } from "../services/avatar";
  import { formatNumber, t } from "../i18n/ui.svelte";
  import { splitActions } from "../services/messageFormat";
  import {
    KEEP_RECENT_MESSAGES,
    SUMMARY_CONTEXT_RATIO,
    SUMMARY_FORMAT_MARKER,
  } from "../services/summaryService";
  import {
    detectAddressee,
    findMentions,
  } from "../services/scene";
  import {
    effectiveMaxOutputTokens,
    responseLengthPreset,
  } from "../services/inference";
  import { USER_ADDRESSEE, type Message, type Persona } from "../types";
  import { backdrop } from "./backdrop";

  const s = $derived(t());

  let input = $state("");
  let inputCaret = $state(0);
  let mentionIndex = $state(0);
  let mentionDismissed = $state(false);
  /** Ce qu'on écrit : sa propre réplique, ou un événement de la scène. */
  let composerMode = $state<"speech" | "scene">("speech");
  let listEl = $state<HTMLElement | null>(null);
  let inputEl = $state<HTMLTextAreaElement | null>(null);
  let summaryButtonEl = $state<HTMLButtonElement | null>(null);
  let summarySheetEl = $state<HTMLDivElement | null>(null);
  let showInference = $state(false);
  let showMore = $state(false);
  let showComposerTools = $state(false);
  let summaryForConversationId = $state<string | null>(null);

  // Édition du dernier message utilisateur
  let editing = $state<{ id: string; content: string } | null>(null);

  const lastUserId = $derived(
    [...app.messages]
      .reverse()
      .find((m) => m.role === "user" && m.kind === "speech")?.id ?? null,
  );
  const lastMessage = $derived(app.messages[app.messages.length - 1] ?? null);
  const group = $derived(app.isGroupConversation);
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
  const streamingPersona = $derived(
    app.streamingPersonaId
      ? (app.personas.find((p) => p.id === app.streamingPersonaId) ?? null)
      : null,
  );
  const pendingNames = $derived(
    app.pendingSpeakerIds
      .map((id) => app.personas.find((p) => p.id === id)?.name)
      .filter((n): n is string => Boolean(n)),
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
  const targetLabel = $derived(
    app.composerTargetId
      ? (app.personas.find((p) => p.id === app.composerTargetId)?.name ?? s.chat.auto)
      : s.chat.auto,
  );
  const mentionedNames = $derived(
    findMentions(input, app.participants)
      .map((id) => app.personas.find((p) => p.id === id)?.name)
      .filter((name): name is string => Boolean(name)),
  );
  const mentionContext = $derived(mentionContextAt(input, inputCaret));
  const mentionSuggestions = $derived(
    mentionContext
      ? app.participants.filter((p) =>
          normalizeForSearch(p.name).startsWith(
            normalizeForSearch(mentionContext.query),
          ),
        )
      : [],
  );
  const mentionMenuOpen = $derived(
    composerMode === "speech" &&
      Boolean(mentionContext) &&
      !mentionDismissed &&
      app.participants.length > 0,
  );

  // Décompte avant reprise automatique : une horloge locale suffit, l'échéance
  // faisant foi côté état applicatif.
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(id);
  });
  const idleCountdown = $derived(
    app.idleResumeAt === null
      ? null
      : Math.max(0, Math.ceil((app.idleResumeAt - now) / 1000)),
  );

  /**
   * Suivi du flux, mais jamais contre l'utilisateur. Défiler d'autorité à
   * chaque delta ramenait de force en bas quiconque était remonté lire une
   * réplique précédente — d'autant plus vite que plusieurs personnages
   * s'enchaînent. Le fil ne se suit donc que si l'on était déjà en bas ;
   * sinon la lecture reste où elle est et un bouton signale la suite.
   */
  const BOTTOM_SLACK_PX = 64;
  let followStream = $state(true);
  let unreadBelow = $state(false);
  /** Hauteur réelle de la zone de saisie : le bouton se pose juste au-dessus. */
  let composerHeight = $state(0);

  function isAtBottom(el: HTMLElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX;
  }

  function onListScroll() {
    if (!listEl) return;
    followStream = isAtBottom(listEl);
    if (followStream) unreadBelow = false;
  }

  function jumpToBottom() {
    followStream = true;
    unreadBelow = false;
    if (listEl) listEl.scrollTo({ top: listEl.scrollHeight, behavior: "smooth" });
  }

  $effect(() => {
    void app.messages;
    void app.streamingContent;
    // Lu dans le `then`, donc hors du suivi de dépendances : remonter dans
    // l'historique ne doit pas relancer cet effet.
    void tick().then(() => {
      if (!listEl) return;
      if (followStream) listEl.scrollTop = listEl.scrollHeight;
      else unreadBelow = true;
    });
  });

  // Changer de salon rend le fil à sa fin : on y entre par le dernier message.
  $effect(() => {
    void app.currentConversationId;
    followStream = true;
    unreadBelow = false;
  });

  /**
   * Écrire est toujours permis. Répondre à l'utilisateur va à son terme —
   * son message attend. Un échange que les personnages menaient entre eux,
   * lui, s'arrête : il reprend la parole après la réplique en cours.
   */
  async function submit() {
    const text = input;
    if (!text.trim()) return;
    input = "";
    // Prendre la parole, c'est vouloir voir ce qui suit : le fil se recolle.
    followStream = true;
    unreadBelow = false;
    if (!app.userHasFloor) {
      app.queueMessage(text, composerMode);
      app.interruptScene();
      return;
    }
    if (composerMode === "scene") {
      await app.sendSceneEvent(text);
    } else {
      await app.sendMessage(text);
    }
  }

  /** Récupère le message en attente pour le modifier avant qu'il ne parte. */
  function reclaimQueued() {
    const pending = app.queuedMessage;
    if (!pending) return;
    composerMode = pending.mode;
    const text = app.unqueueMessage();
    input = input.trim() ? `${text}\n${input}` : text;
    void tick().then(() => {
      inputEl?.focus();
      const end = input.length;
      inputEl?.setSelectionRange(end, end);
    });
  }

  function openSummary() {
    if (app.currentConversationId) {
      showMore = false;
      summaryForConversationId = app.currentConversationId;
      void tick().then(() => summarySheetEl?.focus());
    }
  }

  function closeSummary() {
    summaryForConversationId = null;
    void tick().then(() => summaryButtonEl?.focus());
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (summaryOpen) closeSummary();
    showMore = false;
    showInference = false;
    showComposerTools = false;
  }

  function onKeydown(e: KeyboardEvent) {
    // Taper, c'est être là : la reprise automatique attend.
    app.noteUserActivity();
    if (mentionMenuOpen) {
      if (e.key === "ArrowDown" && mentionSuggestions.length > 0) {
        e.preventDefault();
        mentionIndex = (mentionIndex + 1) % mentionSuggestions.length;
        return;
      }
      if (e.key === "ArrowUp" && mentionSuggestions.length > 0) {
        e.preventDefault();
        mentionIndex =
          (mentionIndex - 1 + mentionSuggestions.length) % mentionSuggestions.length;
        return;
      }
      if (
        (e.key === "Enter" || e.key === "Tab") &&
        mentionSuggestions[mentionIndex]
      ) {
        e.preventDefault();
        selectMention(mentionSuggestions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        mentionDismissed = true;
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  function normalizeForSearch(value: string): string {
    return value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("fr");
  }

  function mentionContextAt(
    value: string,
    caret: number,
  ): { start: number; end: number; query: string } | null {
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(/(?:^|[\s([{])@([\p{L}\p{N}_.-]*)$/u);
    if (!match) return null;
    const query = match[1];
    return {
      start: beforeCaret.length - query.length - 1,
      end: caret,
      query,
    };
  }

  function updateCaret(el: HTMLTextAreaElement) {
    inputCaret = el.selectionStart;
  }

  function onComposerInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
    input = e.currentTarget.value;
    updateCaret(e.currentTarget);
    mentionIndex = 0;
    mentionDismissed = false;
    // Une mention complète tapée après un choix manuel redevient le geste le
    // plus récent : elle rend la main au routage automatique.
    if (
      composerMode === "speech" &&
      findMentions(input, app.participants).length > 0
    ) {
      app.composerTargetId = null;
    }
  }

  function selectMention(persona: Persona) {
    const context = mentionContext;
    if (!context) return;
    const insertion = `@${persona.name} `;
    input =
      input.slice(0, context.start) + insertion + input.slice(context.end);
    inputCaret = context.start + insertion.length;
    mentionDismissed = true;
    mentionIndex = 0;
    app.composerTargetId = null;
    void tick().then(() => {
      inputEl?.focus();
      inputEl?.setSelectionRange(inputCaret, inputCaret);
    });
  }

  async function copyMessage(m: Message) {
    await navigator.clipboard.writeText(m.content);
  }

  function startEditing(m: Message) {
    editing = { id: m.id, content: m.content };
  }

  async function submitEdit() {
    if (!editing) return;
    const content = editing.content.trim();
    editing = null;
    if (content) await app.editLastUserMessage(content);
  }

  /** Ce qui retient la parole en ce moment, dit en clair près de la saisie. */
  const turnLabel = $derived.by(() => {
    const speaker =
      streamingPersona?.name ?? app.activePersona?.name ?? s.chat.theCharacter;
    switch (app.turnPhase) {
      case "speaking":
        return app.autonomousTurn
          ? s.chat.turnChaining(speaker)
          : s.chat.turnSpeaking(speaker);
      case "directing":
        return s.chat.turnDirecting;
      case "compressing":
        return s.chat.turnCompressing;
      case "wrapping":
        return app.autonomousTurn ? s.chat.turnWrappingAuto : s.chat.turnWrapping;
      default:
        return null;
    }
  });

  /** Ce que l'utilisateur peut faire de ce qu'il vient d'écrire. */
  const floorHint = $derived(
    app.autonomousTurn ? s.chat.floorHintAutonomous : s.chat.floorHintDeferred,
  );

  /** Envoi différé seulement quand la réponse est due à l'utilisateur. */
  const deferred = $derived(!app.userHasFloor && !app.autonomousTurn);

  const sendLabel = $derived.by(() => {
    const base = composerMode === "scene" ? s.chat.makeArrive : s.chat.send;
    return deferred ? s.chat.sendLater(base) : base;
  });

  /** Encadre la sélection d'astérisques, ou insère une action vide à éditer. */
  function insertAction() {
    const el = inputEl;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const selected = input.slice(start, end);
    input = `${input.slice(0, start)}*${selected}*${input.slice(end)}`;
    void tick().then(() => {
      el?.focus();
      const caret = selected ? end + 2 : start + 1;
      el?.setSelectionRange(caret, caret);
    });
  }

  /**
   * Destinataire affiché : la valeur enregistrée à l'écriture fait foi ; on
   * ne retombe sur la détection textuelle que pour les messages antérieurs.
   */
  function addresseeOf(m: Message): { id: string; name: string } | null {
    const candidates = [
      { id: USER_ADDRESSEE, name: app.userName },
      ...app.personas.map((p) => ({ id: p.id, name: p.name })),
    ].filter((c) => c.id !== m.personaId);
    if (m.addressee) {
      return candidates.find((c) => c.id === m.addressee) ?? null;
    }
    return detectAddressee(m.content, candidates);
  }

  function accentOf(id: string): string {
    return id === USER_ADDRESSEE ? "var(--text-soft)" : personaAccent(id);
  }

</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="chat">
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

  {#if app.errorBanner}
    <div class="banner error">
      {app.errorBanner}
      <button onclick={() => (app.errorBanner = null)}>✕</button>
    </div>
  {/if}
  {#if app.notice}
    <div class="banner notice">
      {app.notice}
      <button onclick={() => (app.notice = null)}>✕</button>
    </div>
  {/if}

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
      style:bottom={`${composerHeight + 12}px`}
      onclick={jumpToBottom}
    >
      {app.streaming ? s.chat.sceneContinuesBelow : s.chat.newLinesBelow} ↓
    </button>
  {/if}

  <footer class="composer" bind:clientHeight={composerHeight}>
    {#if app.queuedMessage}
      <div class="queued">
        <span class="queued-label">{s.chat.queued}</span>
        <span class="queued-text">{app.queuedMessage.text}</span>
        <button onclick={reclaimQueued}>{s.common.edit}</button>
      </div>
    {/if}
    <div
      id="floor-state"
      class="compact-status"
      class:mine={app.userHasFloor}
      aria-live="polite"
    >
      <span class="floor-dot"></span>
      {#if app.userHasFloor}
        <strong>{s.chat.yourTurn}</strong>
      {:else}
        <strong>{turnLabel}</strong>
        <span>{floorHint}</span>
      {/if}
    </div>
    <div class="composer-row">
      <div class="composer-tools-wrap">
        <button
          class="tool-button"
          class:on={showComposerTools || composerMode === "scene"}
          aria-label={s.chat.composerOptions}
          title={s.chat.composerOptionsTitle}
          onclick={() => (showComposerTools = !showComposerTools)}
        >+</button>
        {#if showComposerTools}
          <div class="composer-tools-menu">
            <button
              class:on={composerMode === "speech"}
              onclick={() => {
                composerMode = "speech";
                showComposerTools = false;
              }}
            >
              <span>{s.chat.speak}</span><small>{s.chat.speakHint}</small>
            </button>
            <button
              class:on={composerMode === "scene"}
              onclick={() => {
                composerMode = "scene";
                showComposerTools = false;
              }}
            >
              <span>{s.chat.sceneEvent}</span><small>{s.chat.sceneEventHint}</small>
            </button>
            {#if composerMode === "speech"}
              <button onclick={() => { insertAction(); showComposerTools = false; }}>
                <span>{s.chat.insertAction}</span><small>{s.chat.insertActionHint}</small>
              </button>
            {/if}
          </div>
        {/if}
      </div>
      {#if group && composerMode === "speech"}
        <label class="target-select">
          <span>{s.chat.to}</span>
          <select
            aria-label={s.chat.whoShouldAnswer}
            value={app.composerTargetId ?? ""}
            onchange={(e) => (app.composerTargetId = e.currentTarget.value || null)}
          >
            <option value="">{s.chat.auto}</option>
            {#each app.participants as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      <div class="composer-input-wrap">
        <textarea
          rows="2"
          class:waiting={!app.userHasFloor}
          class:scene-mode={composerMode === "scene"}
          placeholder={composerMode === "scene"
            ? s.chat.scenePlaceholder
            : app.participants.length > 1
              ? targetLabel === s.chat.auto
                ? s.chat.groupPlaceholder
                : s.chat.writeTo(targetLabel)
              : app.activePersona
                ? s.chat.writeTo(app.activePersona.name)
                : s.chat.createCharacterFirst}
          value={input}
          bind:this={inputEl}
          oninput={onComposerInput}
          onclick={(e) => updateCaret(e.currentTarget)}
          onselect={(e) => updateCaret(e.currentTarget)}
          onkeydown={onKeydown}
          aria-describedby="floor-state"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mentionMenuOpen}
          aria-controls={mentionMenuOpen ? "mention-suggestions" : undefined}
          aria-activedescendant={mentionMenuOpen && mentionSuggestions[mentionIndex]
            ? `mention-${mentionSuggestions[mentionIndex].id}`
            : undefined}
          disabled={app.participants.length === 0}
        ></textarea>
        {#if mentionMenuOpen}
          <div
            id="mention-suggestions"
            class="mention-menu"
            role="listbox"
            aria-label={s.chat.mentionListAria}
          >
            <div class="mention-menu-title">{s.chat.mentionTitle}</div>
            {#each mentionSuggestions as p, index (p.id)}
              <button
                id="mention-{p.id}"
                class="mention-option"
                class:selected={index === mentionIndex}
                role="option"
                aria-selected={index === mentionIndex}
                onmouseenter={() => (mentionIndex = index)}
                onmousedown={(e) => e.preventDefault()}
                onclick={() => selectMention(p)}
              >
                <Avatar size={36} personaId={p.id} />
                <span class="mention-copy">
                  <strong>{p.name}</strong>
                  <span>{s.chat.willBeCalled}</span>
                </span>
                <kbd>@{p.name}</kbd>
              </button>
            {:else}
              <div class="mention-empty">{s.chat.noMatchingCharacter}</div>
            {/each}
            <div class="mention-keys">
              <span><kbd>↑</kbd><kbd>↓</kbd> {s.chat.keyChoose}</span>
              <span><kbd>↵</kbd> {s.chat.keyInsert}</span>
              <span><kbd>esc</kbd> {s.chat.keyClose}</span>
            </div>
          </div>
        {/if}
      </div>
      {#if app.streaming}
        <button class="btn danger stop-button" onclick={() => void app.cancelGeneration()}>
          {s.chat.stop}
        </button>
      {/if}
      <button
        class="btn primary send-button"
        class:deferred
        disabled={!input.trim() || app.participants.length === 0}
        title={app.userHasFloor
          ? undefined
          : deferred
            ? s.chat.deferredTitle
            : s.chat.interruptTitle}
        onclick={() => void submit()}
      >
        {sendLabel}
      </button>
    </div>
    {#if composerMode === "scene"}
      <div class="composer-note">{s.chat.sceneNote}</div>
    {:else if mentionedNames.length > 0 && !app.composerTargetId}
      <div class="composer-note">
        {s.chat.willAnswer(mentionedNames.join(" & "), mentionedNames.length > 1)}
      </div>
    {/if}
  </footer>
</div>

<style>
  .chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    position: relative;
    isolation: isolate;
    background: var(--bg);
  }

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

  .context-meter {
    width: min(170px, 100%);
    height: 3px;
    margin-top: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--subtle-track);
  }

  .context-meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--ok);
    box-shadow: 0 0 7px color-mix(in srgb, var(--ok) 55%, transparent);
    transition: width 0.4s ease, background 0.3s ease;
  }

  .context-meter.heavy span {
    background: var(--accent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 65%, transparent);
  }

  .mood-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text);
  }

  .mood-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--mood-c);
    box-shadow: 0 0 5px var(--mood-c);
  }

  .ctx {
    font-variant-numeric: tabular-nums;
  }

  .ctx.heavy {
    color: var(--accent);
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

  .conn-picker {
    max-width: 160px;
    padding: 5px 8px;
    font-size: 12.5px;
    color: var(--text-soft);
    background: var(--bg-sidebar);
    border: 1px solid var(--border-soft);
    border-radius: 8px;
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

  .mode-toggle {
    font-size: 13px;
  }

  .summary-button {
    color: var(--accent-soft);
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

  .inference-pop {
    position: absolute;
    top: 62px;
    right: 18px;
    z-index: 20;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    width: 300px;
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.5);
  }

  .banner {
    padding: 8px 16px;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .banner.error {
    background: var(--banner-error-bg);
    color: var(--danger);
  }

  .banner.notice {
    background: var(--banner-notice-bg);
    color: var(--text-soft);
  }

  /* Posé au-dessus du bas de la liste, juste avant la zone de saisie. */
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

  .composer {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 12px 20px 14px;
    border-top: 1px solid rgba(185, 141, 61, 0.14);
    background: var(--chat-composer-background);
    box-shadow: 0 -18px 46px -34px rgba(181, 126, 64, 0.38);
    align-items: stretch;
  }

  .composer-row {
    display: flex;
    align-items: flex-end;
    gap: 9px;
    min-width: 0;
  }

  .composer textarea {
    resize: none;
    width: 100%;
    min-height: 58px;
    padding: 12px 14px;
    font-family: var(--font-stage);
    font-size: var(--composer-font-size);
    line-height: 1.5;
    background: var(--chat-input-bg);
    border-color: rgba(151, 117, 132, 0.2);
    box-shadow: inset 0 2px 12px rgba(0, 0, 0, 0.22);
  }

  .composer-input-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .composer-tools-wrap {
    position: relative;
    flex: 0 0 auto;
  }

  .tool-button {
    width: 38px;
    height: 38px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text-soft);
    font-size: 22px;
    line-height: 1;
    background: var(--bg-panel);
  }

  .tool-button:hover,
  .tool-button.on {
    color: var(--text);
    border-color: var(--accent-soft);
    background: var(--bg-hover);
  }

  .composer-tools-menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 9px);
    z-index: 25;
    width: 250px;
    padding: 7px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--menu-bg);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.58);
  }

  .composer-tools-menu button {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px 10px;
    border-radius: 8px;
    color: var(--text-soft);
    text-align: left;
  }

  .composer-tools-menu button:hover,
  .composer-tools-menu button.on {
    color: var(--text);
    background: var(--bg-hover);
  }

  .composer-tools-menu small {
    color: var(--text-faint);
    font-size: 10.5px;
  }

  .target-select {
    height: 38px;
    display: flex;
    align-items: center;
    gap: 3px;
    padding-left: 9px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-panel);
    color: var(--text-faint);
    font-size: 11px;
  }

  .target-select select {
    max-width: 110px;
    padding: 5px 7px 5px 3px;
    border: 0;
    background: transparent;
    color: var(--text-soft);
    font-size: 12px;
  }

  .send-button,
  .stop-button {
    min-height: 38px;
    flex: 0 0 auto;
  }

  .compact-status,
  .composer-note {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: var(--text-faint);
    font-size: 11.5px;
  }

  .compact-status strong {
    color: var(--text-soft);
    font-weight: 600;
  }

  .compact-status.mine .floor-dot {
    background: var(--ok);
    box-shadow: 0 0 6px color-mix(in srgb, var(--ok) 60%, transparent);
    animation: none;
  }

  .compact-status.mine strong {
    color: var(--ok);
  }

  .compact-status span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer-note {
    padding-left: 47px;
    color: var(--accent);
  }

  .mention-menu {
    position: absolute;
    z-index: 30;
    left: 0;
    bottom: calc(100% + 9px);
    width: min(390px, 100%);
    overflow: hidden;
    border: 1px solid rgba(185, 141, 61, 0.2);
    border-radius: 14px;
    background:
      linear-gradient(160deg, rgba(77, 50, 66, 0.13), transparent 58%),
      var(--menu-bg);
    box-shadow:
      0 24px 54px rgba(0, 0, 0, 0.58),
      0 0 0 1px rgba(255, 238, 209, 0.025);
    padding: 7px;
  }

  .mention-menu-title {
    padding: 5px 9px 7px;
    color: var(--text-faint);
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }

  .mention-option {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 8px 10px;
    border-radius: 10px;
    text-align: left;
  }

  .mention-option:hover,
  .mention-option.selected {
    background: var(--selection-bg);
  }

  .mention-option.selected {
    box-shadow: inset 2px 0 var(--accent-soft);
  }

  .mention-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }

  .mention-copy strong {
    overflow: hidden;
    color: var(--text);
    font-family: var(--font-stage);
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mention-copy span {
    color: var(--text-faint);
    font-size: 10.5px;
  }

  .mention-option > kbd {
    max-width: 130px;
    overflow: hidden;
    color: #bca276;
    font-size: 10.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mention-empty {
    padding: 12px 10px;
    color: var(--text-faint);
    font-size: 12px;
  }

  .mention-keys {
    display: flex;
    gap: 13px;
    margin: 5px -7px -7px;
    padding: 7px 12px;
    border-top: 1px solid var(--border-soft);
    color: var(--text-faint);
    font-size: 10px;
  }

  .mention-keys span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  kbd {
    font-family: var(--font);
    font-size: 0.95em;
  }

  .floor-dot {
    align-self: center;
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: floor-pulse 1.4s ease-in-out infinite;
  }

  @keyframes floor-pulse {
    50% {
      opacity: 0.28;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .floor-dot {
      animation: none;
    }
  }

  /* Ce qui a été écrit trop tôt : visible, modifiable, jamais perdu. */
  .queued {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 11px;
    border: 1px dashed rgba(185, 141, 61, 0.34);
    border-radius: 10px;
    background: rgba(60, 44, 30, 0.22);
    font-size: 12px;
    color: var(--text-soft);
  }

  .queued-label {
    flex: 0 0 auto;
    color: var(--accent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .queued-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-family: var(--font-stage);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .queued button {
    flex: 0 0 auto;
    font-size: 11.5px;
    color: var(--accent);
    text-decoration: underline;
  }

  .composer textarea.waiting {
    border-color: rgba(185, 141, 61, 0.26);
  }

  /* Un envoi différé reste un envoi : le bouton change de ton, pas d'état. */
  .btn.primary.deferred {
    background: transparent;
    border: 1px dashed var(--accent-soft);
    color: var(--accent);
  }

  .btn.primary.deferred:hover {
    background: rgba(185, 141, 61, 0.14);
    border-color: var(--accent);
    color: var(--accent);
  }

  .composer textarea.scene-mode {
    font-style: italic;
    background: var(--bg-sidebar);
    border-style: dashed;
  }

  @media (max-width: 920px) {
    .messages {
      padding-inline: 22px;
    }

    .message {
      max-width: 88%;
    }
  }









  .modal-error {
    color: var(--danger);
    font-size: 13px;
  }
</style>
