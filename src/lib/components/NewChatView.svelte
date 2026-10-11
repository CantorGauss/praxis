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

  /** Tire une situation au hasard, jamais deux fois la même d'affilée. */
  function surprise() {
    const pool = s.newChat.examples.filter((example) => example !== sceneDescription);
    sceneDescription = pool[Math.floor(Math.random() * pool.length)];
  }

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
    <h3><span class="step" aria-hidden="true">1</span>{s.newChat.whoToTalkTo}</h3>
    <p class="section-hint">{s.newChat.castingHint}</p>
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
          {@const order = selected.indexOf(p.id)}
          <button
            class="character-choice"
            class:selected={order !== -1}
            style:--speaker-c={personaAccent(p.id)}
            aria-pressed={order !== -1}
            onclick={() => toggle(p.id)}
          >
            <span class="portrait">
              <Avatar size={68} personaId={p.id} />
              {#key order}
                <span class="check">{order !== -1 ? order + 1 : "+"}</span>
              {/key}
            </span>
            <span class="who">
              <strong>{p.name}</strong>
              <small>{p.description ?? s.personas.noDescription}</small>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <h3>
      <span class="step" aria-hidden="true">2</span>{s.newChat.situation}
      <span class="optional">{s.newChat.optional}</span>
    </h3>
    <div class="field">
      <textarea
        id="nc-scene"
        rows="4"
        bind:value={sceneDescription}
        placeholder={s.newChat.situationPlaceholder}
      ></textarea>
      <button class="dice" onclick={surprise}>
        <span class="dice-face" aria-hidden="true">🎲</span>
        {s.newChat.surpriseMe}
      </button>
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
      {#if !creating}<span aria-hidden="true">🎬</span>{/if}
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
    margin-top: 26px;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 15px;
    margin: 0 0 4px;
  }

  /* Numéros d'étape : on suit le programme de la soirée. */
  .step {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--accent-gradient);
    color: var(--accent-ink);
    font-size: 12px;
    font-weight: 800;
  }

  .section-hint {
    margin: 0 0 12px 31px;
    color: var(--text-faint);
    font-size: 12.5px;
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

  .actions :global(.btn.primary) {
    padding: 9px 22px;
    font-size: 15px;
  }

  .primary-section {
    margin-top: 16px;
  }

  .character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
    gap: 12px;
  }

  /* Cartes de casting : on choisit sa troupe comme on choisit ses cartes. */
  .character-choice {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 18px 14px 15px;
    border: 1.5px solid var(--border-soft);
    border-radius: 20px;
    background:
      radial-gradient(90% 60% at 50% 0%, color-mix(in srgb, var(--speaker-c) 14%, transparent), transparent 70%),
      var(--bg-panel);
    text-align: center;
    transition:
      transform 0.3s var(--spring),
      border-color 0.2s,
      box-shadow 0.3s;
  }

  .character-choice:hover {
    border-color: color-mix(in srgb, var(--speaker-c) 50%, var(--border));
    transform: translateY(-3px) rotate(-0.6deg);
    box-shadow: 0 16px 30px -18px color-mix(in srgb, var(--speaker-c) 80%, transparent);
  }

  .character-choice:active {
    transform: scale(0.97);
  }

  .character-choice.selected {
    border-color: var(--speaker-c);
    background:
      radial-gradient(100% 70% at 50% 0%, color-mix(in srgb, var(--speaker-c) 26%, transparent), transparent 75%),
      var(--bg-panel);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--speaker-c) 22%, transparent),
      0 18px 34px -20px var(--speaker-c);
  }

  .portrait {
    position: relative;
    display: inline-flex;
  }

  .character-choice .who {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
  }

  .character-choice strong {
    overflow: hidden;
    color: var(--text);
    font-family: var(--font-stage);
    font-size: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .character-choice small {
    display: -webkit-box;
    overflow: hidden;
    color: var(--text-faint);
    font-size: 11.5px;
    line-height: 1.4;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* Pastille : « + » pour inviter, puis le rang de passage. */
  .check {
    position: absolute;
    right: -6px;
    bottom: -4px;
    z-index: 2;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 2px solid var(--bg-panel);
    border-radius: 50%;
    background: var(--bg-hover);
    color: var(--text-soft);
    font-size: 13px;
    font-weight: 800;
  }

  .selected .check {
    color: #fff;
    background: var(--speaker-c);
    animation: check-pop 0.4s var(--spring);
  }

  @keyframes check-pop {
    from { transform: scale(0.3) rotate(-40deg); }
  }

  .optional {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--bg-hover);
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 500;
  }

  section .field {
    margin-top: 10px;
  }

  .dice {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 4px;
    padding: 5px 13px 5px 9px;
    border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent);
    border-radius: 999px;
    color: var(--accent);
    font-size: 12.5px;
    font-weight: 600;
  }

  .dice:hover {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .dice-face {
    display: inline-block;
    font-size: 15px;
    transition: transform 0.5s var(--spring);
  }

  .dice:hover .dice-face {
    transform: rotate(200deg) scale(1.15);
  }

  .dice:active .dice-face {
    transform: rotate(380deg) scale(0.9);
  }

  .options-toggle {
    margin-top: 14px;
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

  @media (prefers-reduced-motion: reduce) {
    .character-choice,
    .dice-face {
      transition: none;
    }

    .selected .check {
      animation: none;
    }
  }
</style>
