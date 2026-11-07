<script lang="ts">
  import { app } from "../state/appState.svelte";
  import { t } from "../i18n/ui.svelte";
  import { promptPack } from "../i18n/prompts";
  import { KEEP_RECENT_MESSAGES } from "../services/memoryService";
  import { MEMORY_CATEGORIES, groupFacts } from "../services/memory";
  import type { MemoryCategory, MemoryFact } from "../types";

  let {
    onclose,
    sheet = $bindable(null),
  }: { onclose: () => void; sheet?: HTMLDivElement | null } = $props();

  const s = $derived(t());
  // Les catégories suivent la langue de jeu : ce sont celles que lisent les personnages.
  const labels = $derived(promptPack(app.settings.conversationLanguage).memory.categoryLabels);

  const memory = $derived(app.currentConversation?.memory ?? null);
  const facts = $derived(memory?.facts ?? []);
  const groups = $derived(groupFacts(facts));
  const pinned = $derived(facts.filter((f) => f.pinned));
  const coveredCount = $derived.by(() => {
    const boundary = app.currentConversation?.summaryThroughMessageId;
    if (!boundary) return 0;
    const index = app.messages.findIndex((m) => m.id === boundary);
    return index < 0 ? 0 : index + 1;
  });
  const canRead = $derived(app.messages.length > KEEP_RECENT_MESSAGES);
  const busy = $derived(app.summarizing || app.turnInProgress);

  let draft = $state("");
  let draftCategory = $state<MemoryCategory>("event");
  let editingId = $state<string | null>(null);
  let editText = $state("");

  async function add() {
    const text = draft.trim();
    if (!text) return;
    await app.addMemoryFact(text, draftCategory, true);
    draft = "";
  }

  function startEdit(fact: MemoryFact) {
    editingId = fact.id;
    editText = fact.text;
  }

  async function saveEdit(fact: MemoryFact) {
    const text = editText.trim();
    editingId = null;
    if (text && text !== fact.text) await app.updateMemoryFact(fact.id, { text });
  }
</script>

<div class="summary-overlay">
  <button class="summary-scrim" aria-label={s.chat.closeMemory} onclick={onclose}></button>
  <div
    class="summary-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="memory-title"
    tabindex="-1"
    bind:this={sheet}
  >
    <header>
      <div>
        <span class="summary-kicker">{s.chat.memoryKicker}</span>
        <h2 id="memory-title">{s.chat.sceneMemory}</h2>
      </div>
      <button class="summary-close" onclick={onclose} aria-label={s.common.close}>✕</button>
    </header>
    <p class="summary-explanation">{s.chat.memoryExplanation}</p>

    <div class="memory-body">
      <form
        class="memory-add"
        onsubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          type="text"
          bind:value={draft}
          placeholder={s.chat.memoryAddPlaceholder}
          disabled={!app.memoryEditable}
          maxlength="300"
        />
        <select bind:value={draftCategory} disabled={!app.memoryEditable}>
          {#each MEMORY_CATEGORIES as category (category)}
            <option value={category}>{labels[category]}</option>
          {/each}
        </select>
        <button class="btn" type="submit" disabled={!app.memoryEditable || !draft.trim()}>
          {s.chat.memoryAdd}
        </button>
      </form>

      {#if facts.length === 0 && !memory?.state.length}
        <div class="summary-empty">
          <strong>{s.chat.memoryEmpty}</strong>
          <p>{s.chat.memoryEmptyBody}</p>
        </div>
      {/if}

      {#if memory && (memory.state.length > 0 || memory.threads.length > 0)}
        <section class="memory-state">
          {#if memory.state.length > 0}
            <h3>{s.chat.memoryState}</h3>
            <ul>
              {#each memory.state as line, i (i)}<li>{line}</li>{/each}
            </ul>
          {/if}
          {#if memory.threads.length > 0}
            <h3>{s.chat.memoryThreads}</h3>
            <ul>
              {#each memory.threads as line, i (i)}<li>{line}</li>{/each}
            </ul>
          {/if}
        </section>
      {/if}

      {#snippet factRow(fact: MemoryFact)}
        <li class="fact" class:pinned={fact.pinned}>
          {#if editingId === fact.id}
            <!-- svelte-ignore a11y_autofocus -->
            <textarea
              bind:value={editText}
              rows="2"
              autofocus
              onkeydown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit(fact);
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  editingId = null;
                }
              }}
              onblur={() => void saveEdit(fact)}
            ></textarea>
          {:else}
            <span class="fact-text">
              {fact.text}
              {#if fact.origin === "user"}<small title={s.chat.memoryEdited}>✎</small>{/if}
            </span>
            <span class="fact-actions">
              <button
                class="icon"
                class:on={fact.pinned}
                title={fact.pinned ? s.chat.memoryUnpin : s.chat.memoryPin}
                aria-label={fact.pinned ? s.chat.memoryUnpin : s.chat.memoryPin}
                aria-pressed={fact.pinned}
                disabled={!app.memoryEditable}
                onclick={() => void app.setMemoryFactPinned(fact.id, !fact.pinned)}
              >📌</button>
              <button
                class="icon"
                title={s.chat.memoryEdit}
                aria-label={s.chat.memoryEdit}
                disabled={!app.memoryEditable}
                onclick={() => startEdit(fact)}
              >✎</button>
              <button
                class="icon"
                title={s.chat.memoryDelete}
                aria-label={s.chat.memoryDelete}
                disabled={!app.memoryEditable}
                onclick={() => void app.deleteMemoryFact(fact.id)}
              >✕</button>
            </span>
          {/if}
        </li>
      {/snippet}

      {#if pinned.length > 0}
        <section class="memory-group">
          <h3>📌 {s.chat.memoryPinned}</h3>
          <ul>
            {#each pinned as fact (fact.id)}{@render factRow(fact)}{/each}
          </ul>
        </section>
      {/if}

      {#each groups as group (group.category)}
        {@const unpinned = group.facts.filter((f) => !f.pinned)}
        {#if unpinned.length > 0}
          <section class="memory-group">
            <h3>{labels[group.category]}</h3>
            <ul>
              {#each unpinned as fact (fact.id)}{@render factRow(fact)}{/each}
            </ul>
          </section>
        {/if}
      {/each}
    </div>

    <footer class="summary-actions">
      <span>
        {#if canRead}
          {s.chat.memoryCounts(facts.length, coveredCount, app.memoryBacklog)}
        {:else}
          {s.chat.memoryAvailableAfter(KEEP_RECENT_MESSAGES)}
        {/if}
      </span>
      <span class="memory-buttons">
        {#if app.memoryBacklog > 0}
          <button
            class="btn"
            disabled={busy || !canRead}
            onclick={() => void app.regenerateSummary(app.currentConversationId, false)}
          >
            {app.summarizing ? s.chat.generating : s.chat.memoryCatchUp}
          </button>
        {/if}
        <button
          class="btn"
          title={s.chat.memoryRebuildTitle}
          disabled={busy || !canRead}
          onclick={() => void app.regenerateSummary(app.currentConversationId, true)}
        >
          {app.summarizing && app.memoryBacklog === 0 ? s.chat.generating : s.chat.memoryRebuild}
        </button>
      </span>
    </footer>
  </div>
</div>

<style>
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
    width: min(720px, 100%);
    max-height: min(80vh, 820px);
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
    padding: 13px 24px;
    color: var(--text-faint);
    font-size: 12px;
    line-height: 1.5;
    border-bottom: 1px solid var(--border-soft);
  }

  .memory-body {
    overflow-y: auto;
    padding: 14px 24px 22px;
  }

  .memory-add {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }

  .memory-add input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .memory-add select {
    flex: 0 0 auto;
    max-width: 38%;
  }

  .summary-empty {
    padding: 22px 0 10px;
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

  h3 {
    margin: 16px 0 6px;
    color: var(--accent);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .memory-state {
    padding: 2px 14px 10px;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: color-mix(in srgb, var(--text) 3%, transparent);
  }

  .memory-state li {
    padding: 3px 0;
    color: var(--text-soft);
    font-family: var(--font-stage);
    font-size: 14px;
    line-height: 1.5;
  }

  .fact {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 8px;
  }

  .fact:hover {
    background: color-mix(in srgb, var(--text) 4%, transparent);
  }

  .fact.pinned {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .fact-text {
    flex: 1 1 auto;
    color: var(--text-soft);
    font-family: var(--font-stage);
    font-size: 14.5px;
    line-height: 1.55;
  }

  .fact-text small {
    margin-left: 4px;
    color: var(--text-faint);
  }

  .fact textarea {
    flex: 1 1 auto;
    resize: vertical;
    font: inherit;
  }

  .fact-actions {
    flex: 0 0 auto;
    display: flex;
    gap: 2px;
    opacity: 0.35;
    transition: opacity 0.15s;
  }

  .fact:hover .fact-actions,
  .fact:focus-within .fact-actions {
    opacity: 1;
  }

  .icon {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-faint);
    font-size: 12px;
    line-height: 26px;
  }

  .icon:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text);
  }

  .icon.on {
    color: var(--accent);
    opacity: 1;
  }

  .fact.pinned .fact-actions {
    opacity: 1;
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

  .memory-buttons {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
  }
</style>
