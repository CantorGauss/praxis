<script lang="ts">
  import { tick } from "svelte";
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import { MOOD_COLORS, personaAccent } from "../services/avatar";
  import { MOOD_LABELS_BY_LOCALE } from "../i18n/moods";
  import { t, uiLocale } from "../i18n/ui.svelte";
  import {
    AUTO_ROUND_CHOICES,
    defaultEntranceText,
    defaultExitText,
  } from "../services/scene";
  import type { Persona } from "../types";

  const s = $derived(t());

  /** Didascalie en cours de rédaction pour une entrée ou une sortie. */
  let pending = $state<{
    persona: Persona;
    mode: "enter" | "leave";
    text: string;
  } | null>(null);
  let react = $state(true);
  let fieldEl = $state<HTMLInputElement | null>(null);
  /** Décor en cours d'édition ; null quand on ne l'édite pas. */
  let editingScene = $state<string | null>(null);

  async function saveScene() {
    if (editingScene === null) return;
    const text = editingScene;
    editingScene = null;
    await app.setSceneDescription(text);
  }

  async function setAutoRounds(value: number) {
    app.settings.sceneAutoRounds = value;
    await app.saveSettings();
  }

  const present = $derived(app.participants);
  const absent = $derived(
    app.personas.filter((p) => !app.participantIds.includes(p.id)),
  );
  const canLeave = $derived(app.participants.length > 1);

  function start(persona: Persona, mode: "enter" | "leave") {
    pending = {
      persona,
      mode,
      text:
        mode === "enter"
          ? defaultEntranceText(persona.name, app.pack)
          : defaultExitText(persona.name, app.pack),
    };
    void tick().then(() => {
      fieldEl?.focus();
      fieldEl?.select();
    });
  }

  async function confirm() {
    if (!pending || !pending.text.trim()) return;
    const { persona, mode, text } = pending;
    pending = null;
    if (mode === "enter") {
      await app.enterScene(persona.id, text, react);
    } else {
      await app.leaveScene(persona.id, text, react);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void confirm();
    } else if (e.key === "Escape") {
      pending = null;
    }
  }
</script>

<aside class="cast-panel">
  <header>
    <div>
      <h3>{s.cast.title}</h3>
      <span class="header-sub">{s.cast.subtitle}</span>
    </div>
    <button
      class="close"
      title={s.cast.closePanel}
      onclick={() => (app.castPanelOpen = false)}
    >
      ✕
    </button>
  </header>

  <div class="scroll">
    {#if app.pendingSceneActions.length > 0}
      <div class="pending-actions" aria-live="polite">
        <strong>{s.cast.afterCurrentTurn}</strong>
        {#each app.pendingSceneActions as action}
          {@const who =
            app.personaById(action.personaId)?.name ??
            s.cast.theCharacter}
          <span>
            {action.kind === "enter"
              ? s.cast.pendingEnter(who)
              : s.cast.pendingLeave(who)}
          </span>
        {/each}
      </div>
    {/if}
    <section>
      <h4>{s.cast.setting}</h4>
      {#if editingScene === null}
        <p class="situation" class:vide={!app.currentConversation?.sceneDescription}>
          {app.currentConversation?.sceneDescription ?? s.cast.noSetting}
        </p>
        <button
          class="act"
          disabled={!app.currentConversation}
          onclick={() =>
            (editingScene = app.currentConversation?.sceneDescription ?? "")}
        >
          {s.cast.editSetting}
        </button>
      {:else}
        <textarea rows="6" bind:value={editingScene}></textarea>
        <span class="hint">{s.cast.settingHint}</span>
        <div class="form-actions">
          <button class="btn" onclick={() => (editingScene = null)}>
            {s.common.cancel}
          </button>
          <button class="btn primary" onclick={() => void saveScene()}>
            {s.common.save}
          </button>
        </div>
      {/if}
    </section>

    {#if app.isGroupConversation}
      <section class="scene-controls">
        <h4>{s.cast.autonomousConversation}</h4>
        <label class="control-field">
          <span>{s.cast.afterYourMessage}</span>
          <select
            value={app.settings.sceneAutoRounds}
            onchange={(e) => void setAutoRounds(Number(e.currentTarget.value))}
          >
            {#each AUTO_ROUND_CHOICES as n (n)}
              <option value={n}>{n === 0 ? s.cast.theyWait : s.cast.roundsAmongThem(n)}</option>
            {/each}
          </select>
        </label>
        <div class="scene-actions">
          <button
            class="btn"
            disabled={!app.canContinueScene || app.turnInProgress}
            onclick={() => void app.continueScene()}
          >
            {s.cast.continueNow}
          </button>
          <button class="btn" class:on={app.idlePaused} onclick={() => app.toggleIdlePause()}>
            {app.idlePaused ? s.cast.resumeAutonomy : s.cast.pauseAutonomy}
          </button>
        </div>
        <p class="control-hint">{s.cast.idleHint}</p>
      </section>
    {/if}

    <section>
      <h4>{s.cast.present} <span class="count">{present.length}</span></h4>
      {#each present as p, i (p.id)}
        {@const state = app.stateFor(p.id)}
        <div class="row present" style:--speaker-c={personaAccent(p.id)}>
          <Avatar size={44} personaId={p.id} />
          <div class="who">
            <div class="name">{p.name}</div>
            <div class="sub">
              {#if state && app.settings.emotionEnabled}
                <span class="mood" style:--mood-c={MOOD_COLORS[state.mood]}>
                  <span class="dot"></span>{MOOD_LABELS_BY_LOCALE[uiLocale()][state.mood]}
                </span>
              {:else if p.description}
                {p.description}
              {/if}
            </div>
          </div>
          <div class="order">
            <button
              title={s.cast.speakEarlier}
              disabled={i === 0 || app.streaming}
              onclick={() => void app.moveParticipant(p.id, -1)}>▲</button
            >
            <button
              title={s.cast.speakLater}
              disabled={i === present.length - 1 || app.streaming}
              onclick={() => void app.moveParticipant(p.id, 1)}>▼</button
            >
          </div>
          <button
            class="act"
            disabled={!canLeave || app.pendingSceneActions.some((a) => a.kind === "leave" && a.personaId === p.id)}
            title={canLeave ? s.cast.makeLeave(p.name) : s.cast.mustKeepOne}
            onclick={() => start(p, "leave")}
          >
            {s.cast.leave}
          </button>
        </div>
        {#if pending && pending.persona.id === p.id}
          {@render form()}
        {/if}
      {/each}
    </section>

    <section>
      <h4>{s.cast.available} <span class="count">{absent.length}</span></h4>
      {#each absent as p (p.id)}
        <div class="row absent">
          <Avatar size={44} personaId={p.id} />
          <div class="who">
            <div class="name">{p.name}</div>
            <div class="sub">{p.description ?? "—"}</div>
          </div>
          <button
            class="act"
            disabled={app.pendingSceneActions.some((a) => a.kind === "enter" && a.personaId === p.id)}
            title={s.cast.makeEnter(p.name)}
            onclick={() => start(p, "enter")}
          >
            {s.cast.enter}
          </button>
        </div>
        {#if pending && pending.persona.id === p.id}
          {@render form()}
        {/if}
      {/each}
      {#if absent.length === 0}
        <p class="empty">{s.cast.allPresent}</p>
      {/if}
    </section>

    <button class="link" onclick={() => (app.view = "personas")}>
      + {s.curtain.createCharacter}
    </button>
  </div>
</aside>

{#snippet form()}
  {#if pending}
    <div class="narration-form">
      <label for="narration-text">
        {pending.mode === "enter" ? s.cast.describeArrival : s.cast.describeDeparture}
      </label>
      <input
        id="narration-text"
        bind:this={fieldEl}
        bind:value={pending.text}
        onkeydown={onKeydown}
      />
      <span class="hint">{s.cast.narrationHint}</span>
      <label class="checkbox">
        <input type="checkbox" bind:checked={react} />
        {s.cast.makeOthersReact}
      </label>
      <div class="form-actions">
        <button class="btn" onclick={() => (pending = null)}>{s.common.cancel}</button>
        <button
          class="btn primary"
          disabled={!pending.text.trim()}
          onclick={() => void confirm()}
        >
          {pending.mode === "enter" ? s.cast.bringIn : s.cast.sendOut}
        </button>
      </div>
    </div>
  {/if}
{/snippet}

<style>
  .cast-panel {
    width: 300px;
    min-width: 300px;
    background: var(--bg-sidebar);
    border-left: 1px solid var(--border-soft);
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 8px;
  }

  h3 {
    margin: 0;
    font-size: 14px;
  }

  .header-sub {
    display: block;
    margin-top: -2px;
    color: var(--text-faint);
    font-size: 10.5px;
  }

  .close {
    color: var(--text-faint);
    font-size: 12px;
  }

  .close:hover {
    color: var(--danger);
  }

  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0 10px 14px;
  }

  .pending-actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 2px 0 12px;
    padding: 9px 10px;
    border: 1px solid rgba(185, 141, 61, 0.34);
    border-radius: 9px;
    background: rgba(92, 63, 34, 0.2);
    color: var(--text-soft);
    font-size: 11.5px;
  }

  .pending-actions strong {
    color: var(--accent);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  section {
    margin-bottom: 14px;
  }

  .scene-controls {
    padding: 8px;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: var(--bg-panel);
  }

  .control-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: var(--text-soft);
    font-size: 11.5px;
  }

  .control-field select {
    width: 100%;
    padding: 6px 8px;
    font-size: 12px;
  }

  .scene-actions {
    display: grid;
    gap: 6px;
    margin-top: 8px;
  }

  .scene-actions .btn {
    justify-content: center;
    padding: 5px 8px;
    font-size: 11.5px;
  }

  .control-hint {
    margin: 7px 1px 0;
    color: var(--text-faint);
    font-size: 10.5px;
    line-height: 1.35;
  }

  h4 {
    margin: 6px 4px;
    font-size: 11.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-faint);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .count {
    background: var(--bg-active);
    color: var(--text-soft);
    border-radius: 999px;
    padding: 0 6px;
    letter-spacing: 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 9px;
    border: 1px solid transparent;
  }

  .row:hover {
    background: var(--bg-hover);
  }

  .row.present {
    background: var(--bg-panel);
    border-left: 3px solid var(--speaker-c);
  }

  .row.absent {
    opacity: 0.72;
  }

  .row.absent:hover {
    opacity: 1;
  }

  .who {
    flex: 1;
    min-width: 0;
  }

  .name {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    font-size: 11px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mood {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--mood-c);
  }

  .order {
    display: flex;
    flex-direction: column;
    line-height: 1;
  }

  .order button {
    font-size: 8px;
    color: var(--text-faint);
    padding: 1px 2px;
  }

  .order button:hover:not(:disabled) {
    color: var(--accent);
  }

  .order button:disabled {
    opacity: 0.3;
  }

  .act {
    font-size: 11.5px;
    color: var(--text-soft);
    white-space: nowrap;
  }

  .act:hover:not(:disabled) {
    color: var(--accent);
  }

  .act:disabled {
    opacity: 0.4;
  }

  .narration-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    margin: 4px 0 8px;
    background: var(--bg-panel);
    border: 1px solid var(--accent-soft);
    border-radius: 9px;
  }

  .narration-form label {
    font-size: 11.5px;
    color: var(--text-soft);
  }

  .narration-form .hint {
    font-size: 10.5px;
    color: var(--text-faint);
    line-height: 1.35;
  }

  .checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .form-actions .btn {
    font-size: 12px;
    padding: 4px 10px;
  }

  .situation {
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-soft);
    background: var(--bg-panel);
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    margin: 0 0 6px;
    white-space: pre-wrap;
    max-height: 160px;
    overflow-y: auto;
  }

  .situation.vide {
    color: var(--text-faint);
    font-style: italic;
  }

  .empty {
    font-size: 12px;
    color: var(--text-faint);
    text-align: center;
    margin: 10px 0;
  }

  .link {
    font-size: 12.5px;
    color: var(--text-soft);
    padding: 6px 4px;
  }

  .link:hover {
    color: var(--accent);
  }
</style>
