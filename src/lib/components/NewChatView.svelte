<script lang="ts">
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import { personaAccent } from "../services/avatar";
  import { t } from "../i18n/ui.svelte";
  import type { Persona } from "../types";

  const s = $derived(t());

  let title = $state("");
  let sceneDescription = $state("");
  let showOptions = $state(false);
  /** Ordre de sélection = ordre de parole ; le premier est la persona principale. */
  let selected = $state<string[]>(
    app.settings.defaultPersonaId ? [app.settings.defaultPersonaId] : [],
  );
  let creating = $state(false);

  const cast = $derived(
    selected
      .map((id) => app.personaById(id))
      .filter((p): p is Persona => Boolean(p)),
  );

  function add(id: string) {
    selected = [...selected, id];
  }

  function remove(id: string) {
    selected = selected.filter((x) => x !== id);
  }

  function toggle(id: string) {
    if (selected.includes(id)) remove(id);
    else add(id);
  }

  function move(id: string, delta: -1 | 1) {
    const ids = [...selected];
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    selected = ids;
  }

  const ready = $derived(selected.length > 0);

  async function create() {
    if (!ready || creating) return;
    creating = true;
    try {
      await app.newConversation(selected, { title, sceneDescription });
    } finally {
      creating = false;
    }
  }

  function cancel() {
    app.view = "chat";
  }
</script>

<div class="view">
  <div class="view-header">
    <div>
      <h2 class="panel-title">{s.sidebar.newConversation}</h2>
      <p class="panel-sub">{s.newChat.subtitle}</p>
    </div>
    <button class="btn" onclick={cancel}>{s.common.cancel}</button>
  </div>

  <section class="primary-section">
    <h3>{s.newChat.whoToTalkTo}</h3>
    {#if app.personas.length === 0}
      <p class="empty">
        {s.newChat.noCharacters}
        <button class="link" onclick={() => (app.view = "personas")}>
          {s.newChat.createOneFirst}
        </button>
      </p>
    {:else}
      <div class="character-grid">
        {#each app.personas as p (p.id)}
          <button
            class="character-choice"
            class:selected={selected.includes(p.id)}
            style:--speaker-c={personaAccent(p.id)}
            onclick={() => toggle(p.id)}
          >
            <Avatar size={42} personaId={p.id} />
            <span class="who">
              <strong>{p.name}</strong>
              <small>{p.description ?? s.personas.noDescription}</small>
            </span>
            <span class="check">{selected.includes(p.id) ? "✓" : "+"}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <h3>{s.newChat.situation} <span class="optional">{s.newChat.optional}</span></h3>
    <div class="field">
      <textarea
        id="nc-scene"
        rows="4"
        bind:value={sceneDescription}
        placeholder={s.newChat.situationPlaceholder}
      ></textarea>
      {#if !sceneDescription.trim()}
        <button class="link" onclick={() => (sceneDescription = s.newChat.example)}>
          {s.newChat.useExample}
        </button>
      {/if}
    </div>
  </section>

  <button class="options-toggle" onclick={() => (showOptions = !showOptions)}>
    {showOptions ? s.newChat.hideOptions : s.newChat.showOptions} {s.newChat.advancedOptions}
  </button>
  {#if showOptions}
    <section class="advanced-options">
      <div class="field">
        <label for="nc-title">{s.newChat.customTitle}</label>
        <input id="nc-title" bind:value={title} placeholder={s.newChat.titlePlaceholder} />
      </div>
      {#if cast.length > 1}
        <div class="field">
          <div class="field-label">{s.newChat.speakingOrder}</div>
          <div class="order-list">
            {#each cast as p, i (p.id)}
              <div class="order-row">
                <span>{i + 1}. {p.name}</span>
                <div>
                  <button disabled={i === 0} onclick={() => move(p.id, -1)}>↑</button>
                  <button disabled={i === cast.length - 1} onclick={() => move(p.id, 1)}>↓</button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <div class="actions">
    <button class="btn" onclick={cancel}>{s.common.cancel}</button>
    {#if !ready}
      <span class="missing">
        {selected.length === 0 ? s.newChat.pickAtLeastOne : ""}
      </span>
    {/if}
    <button
      class="btn primary"
      disabled={!ready || creating}
      onclick={() => void create()}
    >
      {creating ? s.newChat.creating : s.newChat.start}
    </button>
  </div>
</div>

<style>
  .view {
    flex: 1;
    overflow-y: auto;
    padding: 28px 36px 40px;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  section {
    margin-top: 22px;
  }

  h3 {
    font-size: 14px;
    margin: 0 0 10px;
  }

  .who {
    flex: 1;
    min-width: 0;
  }

  .link {
    color: var(--accent);
    font-size: 12.5px;
    text-decoration: underline;
    align-self: flex-start;
    margin-top: 4px;
  }

  .empty {
    color: var(--text-faint);
  }

  .missing {
    align-self: center;
    font-size: 12.5px;
    color: var(--text-faint);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 26px;
    padding-top: 18px;
    border-top: 1px solid var(--border-soft);
  }

  .primary-section {
    margin-top: 12px;
  }

  .character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px;
  }

  .character-choice {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--border-soft);
    border-radius: 11px;
    background: var(--bg-panel);
    text-align: left;
  }

  .character-choice:hover {
    border-color: var(--border);
    background: var(--bg-hover);
  }

  .character-choice.selected {
    border-color: var(--speaker-c);
    box-shadow: inset 3px 0 var(--speaker-c);
  }

  .character-choice .who {
    display: flex;
    flex-direction: column;
  }

  .character-choice strong {
    overflow: hidden;
    color: var(--text);
    font-size: 13.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .character-choice small {
    overflow: hidden;
    color: var(--text-faint);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .check {
    width: 22px;
    height: 22px;
    display: grid;
    flex: 0 0 22px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--text-faint);
  }

  .selected .check {
    color: var(--accent-ink);
    border-color: var(--accent);
    background: var(--accent);
  }

  .optional {
    margin-left: 5px;
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 400;
  }

  .options-toggle {
    margin-top: 8px;
    color: var(--text-soft);
    font-size: 12.5px;
  }

  .options-toggle:hover {
    color: var(--accent);
  }

  .advanced-options {
    padding: 15px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--bg-panel);
  }

  .field-label {
    color: var(--text-soft);
    font-size: 12.5px;
    font-weight: 600;
  }

  .order-list {
    display: grid;
    gap: 5px;
  }

  .order-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 9px;
    border-radius: 7px;
    background: var(--bg-sidebar);
    color: var(--text-soft);
    font-size: 12.5px;
  }

  .order-row button {
    padding: 0 5px;
    color: var(--text-faint);
  }

  .order-row button:hover:not(:disabled) {
    color: var(--accent);
  }
</style>
