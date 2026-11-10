<script lang="ts">
  import {
    blankEntry,
    DEFAULT_LORE_TOKENS,
    DEFAULT_SCAN_DEPTH,
    emptyLorebook,
    hasUnsupportedSettings,
    splitKeys,
    type LoreEntry,
    type Lorebook,
    type SecondaryLogic,
  } from "../services/lorebook";
  import { t } from "../i18n/ui.svelte";

  /**
   * Connaissances d'un personnage. Comme le reste de la fiche, chaque champ
   * enregistre en quittant le focus ; les cases à cocher, tout de suite.
   */
  let {
    lorebook,
    onchange,
  }: {
    lorebook: Lorebook | null;
    onchange: (next: Lorebook | null) => void | Promise<void>;
  } = $props();

  const s = $derived(t());
  const l = $derived(s.personas.lore);
  /**
   * Copie de travail, tant qu'un enregistrement est en cours : le livre est
   * stocké d'un bloc, et deux modifications rapprochées (deux cases cochées
   * d'affilée) partiraient sinon de la même version, la seconde effaçant la
   * première. Hors enregistrement, la fiche fait foi (traduction, retour à
   * l'original…).
   */
  let local = $state<Lorebook | null>(null);
  let pending = 0;
  const book = $derived(local ?? lorebook ?? emptyLorebook());

  $effect(() => {
    void lorebook;
    if (pending === 0) local = null;
  });

  /** Au-delà, une liste se parcourt mieux avec un filtre. */
  const FILTER_THRESHOLD = 8;
  let filter = $state("");

  const LOGICS: SecondaryLogic[] = ["andAny", "andAll", "notAny", "notAll"];

  const visible = $derived.by(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return book.entries;
    return book.entries.filter((e) =>
      [e.comment, e.content, ...e.keys, ...e.secondaryKeys].some((text) =>
        text.toLowerCase().includes(query),
      ),
    );
  });

  function save(next: Lorebook) {
    local = next;
    pending += 1;
    // Un livre vidé de ses entrées n'est plus stocké.
    void Promise.resolve(onchange(next.entries.length > 0 ? next : null)).finally(() => {
      pending -= 1;
      if (pending === 0) local = null;
    });
  }

  function updateEntry(id: string, change: Partial<LoreEntry>) {
    save({
      ...book,
      entries: book.entries.map((e) => (e.id === id ? { ...e, ...change } : e)),
    });
  }

  function addEntry() {
    filter = "";
    const entry = blankEntry();
    save({ ...book, entries: [...book.entries, entry] });
    // Le contenu est le premier champ à écrire : on l'amène sous les yeux.
    setTimeout(() => {
      const field = document.querySelector<HTMLTextAreaElement>(`#lore-content-${entry.id}`);
      field?.scrollIntoView({ block: "center", behavior: "smooth" });
      field?.focus();
    }, 0);
  }

  function removeEntry(id: string) {
    save({ ...book, entries: book.entries.filter((e) => e.id !== id) });
  }

  function positiveOrNull(value: string): number | null {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
</script>

<section class="lore" aria-label={l.title}>
  <div class="lore-head">
    <div>
      <strong>{l.title}</strong>
      <span>{l.hint}</span>
    </div>
    <button class="btn primary" onclick={addEntry}>{l.add}</button>
  </div>

  {#if book.entries.length === 0}
    <p class="lore-empty">{l.empty}</p>
  {:else}
    <div class="lore-tools">
      {#if book.entries.length > FILTER_THRESHOLD}
        <input
          class="lore-filter"
          type="search"
          bind:value={filter}
          placeholder={l.filter}
          aria-label={l.filter}
        />
      {/if}
      <label title={l.scanDepthTitle}>
        <span>{l.scanDepth}</span>
        <input
          type="number"
          min="1"
          max="50"
          value={book.scanDepth ?? ""}
          placeholder={String(DEFAULT_SCAN_DEPTH)}
          onchange={(e) => save({ ...book, scanDepth: positiveOrNull(e.currentTarget.value) })}
        />
      </label>
      <label title={l.tokenBudgetTitle}>
        <span>{l.tokenBudget}</span>
        <input
          type="number"
          min="50"
          step="50"
          value={book.tokenBudget ?? ""}
          placeholder={String(DEFAULT_LORE_TOKENS)}
          onchange={(e) => save({ ...book, tokenBudget: positiveOrNull(e.currentTarget.value) })}
        />
      </label>
    </div>

    <ul class="lore-entries">
      {#each visible as entry (entry.id)}
        <li class="lore-entry" class:disabled={!entry.enabled}>
          <div class="entry-top">
            <input
              class="entry-comment"
              value={entry.comment}
              placeholder={l.commentPlaceholder}
              onchange={(e) => updateEntry(entry.id, { comment: e.currentTarget.value.trim() })}
            />
            <label class="toggle">
              <input
                type="checkbox"
                checked={entry.constant}
                onchange={(e) => updateEntry(entry.id, { constant: e.currentTarget.checked })}
              />
              {l.constant}
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                checked={entry.enabled}
                onchange={(e) => updateEntry(entry.id, { enabled: e.currentTarget.checked })}
              />
              {l.enabled}
            </label>
            <button
              class="entry-delete"
              aria-label={l.deleteEntry}
              title={l.deleteEntry}
              onclick={() => removeEntry(entry.id)}
            >✕</button>
          </div>

          <input
            class="entry-keys"
            value={entry.keys.join(", ")}
            placeholder={entry.constant ? l.keysUnused : l.keysPlaceholder}
            disabled={entry.constant}
            onchange={(e) => updateEntry(entry.id, { keys: splitKeys(e.currentTarget.value) })}
          />

          {#if !entry.constant}
            <div class="entry-condition">
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={entry.selective}
                  onchange={(e) => updateEntry(entry.id, { selective: e.currentTarget.checked })}
                />
                {l.condition}
              </label>
              {#if entry.selective}
                <select
                  value={entry.secondaryLogic}
                  onchange={(e) =>
                    updateEntry(entry.id, {
                      secondaryLogic: e.currentTarget.value as SecondaryLogic,
                    })}
                >
                  {#each LOGICS as logic (logic)}
                    <option value={logic}>{l.logic[logic]}</option>
                  {/each}
                </select>
                <input
                  value={entry.secondaryKeys.join(", ")}
                  placeholder={l.secondaryPlaceholder}
                  onchange={(e) =>
                    updateEntry(entry.id, { secondaryKeys: splitKeys(e.currentTarget.value) })}
                />
              {/if}
            </div>
          {/if}

          <textarea
            id="lore-content-{entry.id}"
            rows="3"
            value={entry.content}
            placeholder={l.contentPlaceholder}
            onchange={(e) => updateEntry(entry.id, { content: e.currentTarget.value.trim() })}
          ></textarea>

          {#if hasUnsupportedSettings(entry)}
            <p class="entry-note">{l.unsupported}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .lore {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-soft);
  }

  .lore-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .lore-head > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .lore-head strong {
    color: var(--text-soft);
    font-size: 12px;
    font-weight: 650;
  }

  .lore-head span,
  .lore-empty {
    color: var(--text-faint);
    font-size: 11px;
    line-height: 1.4;
  }

  .lore-head .btn {
    flex-shrink: 0;
  }

  .lore-empty {
    margin: 0;
  }

  .lore-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .lore-filter {
    flex: 1;
    min-width: 160px;
    font-size: 12px;
    padding: 5px 9px;
  }

  .lore-tools label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-faint);
    font-size: 11px;
  }

  .lore-tools input[type="number"] {
    width: 72px;
    font-size: 12px;
    padding: 4px 7px;
  }

  .lore-entries {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .lore-entry {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 9px 10px;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: var(--choice-bg);
  }

  .lore-entry.disabled {
    opacity: 0.55;
  }

  .entry-top,
  .entry-condition {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .entry-comment {
    flex: 1;
    min-width: 140px;
    font-size: 12.5px;
    font-weight: 600;
    padding: 4px 8px;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-soft);
    font-size: 11.5px;
    white-space: nowrap;
  }

  .entry-delete {
    padding: 2px 6px;
    color: var(--text-faint);
  }

  .entry-delete:hover {
    color: var(--danger);
  }

  .entry-keys,
  .entry-condition input:not([type="checkbox"]),
  .entry-condition select {
    font-size: 12px;
    padding: 4px 8px;
  }

  .entry-condition input:not([type="checkbox"]) {
    flex: 1;
    min-width: 140px;
  }

  .lore-entry textarea {
    width: 100%;
    resize: vertical;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .entry-note {
    margin: 0;
    color: var(--text-faint);
    font-size: 10.5px;
    font-style: italic;
  }
</style>
