<script lang="ts">
  import { tick } from "svelte";
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import { t } from "../i18n/ui.svelte";
  import { findMentions } from "../services/scene";
  import type { Persona } from "../types";

  let { height = $bindable(0) }: { height?: number } = $props();

  const s = $derived(t());
  let input = $state("");
  let inputCaret = $state(0);
  let mentionIndex = $state(0);
  let mentionDismissed = $state(false);
  let composerMode = $state<"speech" | "scene">("speech");
  let inputEl = $state<HTMLTextAreaElement | null>(null);
  let showComposerTools = $state(false);

  const group = $derived(app.isGroupConversation);
  const streamingPersona = $derived(app.personaById(app.streamingPersonaId));
  const targetLabel = $derived(
    app.composerTargetId
      ? (app.personaById(app.composerTargetId)?.name ?? s.chat.auto)
      : s.chat.auto,
  );
  const mentionedNames = $derived(
    findMentions(input, app.participants)
      .map((id) => app.personaById(id)?.name)
      .filter((name): name is string => Boolean(name)),
  );
  const mentionContext = $derived(mentionContextAt(input, inputCaret));
  const mentionSuggestions = $derived(
    mentionContext
      ? app.participants.filter((persona) =>
          normalizeForSearch(persona.name).startsWith(
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

  async function submit() {
    const text = input;
    if (!text.trim()) return;
    input = "";
    if (!app.userHasFloor) {
      app.queueMessage(text, composerMode);
      app.interruptScene();
      return;
    }
    if (composerMode === "scene") await app.sendSceneEvent(text);
    else await app.sendMessage(text);
  }

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

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") showComposerTools = false;
  }

  function onKeydown(event: KeyboardEvent) {
    app.noteUserActivity();
    if (mentionMenuOpen) {
      if (event.key === "ArrowDown" && mentionSuggestions.length > 0) {
        event.preventDefault();
        mentionIndex = (mentionIndex + 1) % mentionSuggestions.length;
        return;
      }
      if (event.key === "ArrowUp" && mentionSuggestions.length > 0) {
        event.preventDefault();
        mentionIndex =
          (mentionIndex - 1 + mentionSuggestions.length) %
          mentionSuggestions.length;
        return;
      }
      if (
        (event.key === "Enter" || event.key === "Tab") &&
        mentionSuggestions[mentionIndex]
      ) {
        event.preventDefault();
        selectMention(mentionSuggestions[mentionIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        mentionDismissed = true;
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
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

  function updateCaret(element: HTMLTextAreaElement) {
    inputCaret = element.selectionStart;
  }

  function onComposerInput(
    event: Event & { currentTarget: HTMLTextAreaElement },
  ) {
    input = event.currentTarget.value;
    updateCaret(event.currentTarget);
    mentionIndex = 0;
    mentionDismissed = false;
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
        return app.autonomousTurn
          ? s.chat.turnWrappingAuto
          : s.chat.turnWrapping;
      default:
        return null;
    }
  });
  const floorHint = $derived(
    app.autonomousTurn ? s.chat.floorHintAutonomous : s.chat.floorHintDeferred,
  );
  const deferred = $derived(!app.userHasFloor && !app.autonomousTurn);
  const sendLabel = $derived.by(() => {
    const base = composerMode === "scene" ? s.chat.makeArrive : s.chat.send;
    return deferred ? s.chat.sendLater(base) : base;
  });

  function insertAction() {
    const element = inputEl;
    const start = element?.selectionStart ?? input.length;
    const end = element?.selectionEnd ?? input.length;
    const selected = input.slice(start, end);
    input = `${input.slice(0, start)}*${selected}*${input.slice(end)}`;
    void tick().then(() => {
      element?.focus();
      const caret = selected ? end + 2 : start + 1;
      element?.setSelectionRange(caret, caret);
    });
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<footer class="composer" bind:clientHeight={height}>
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


<style>
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
</style>
