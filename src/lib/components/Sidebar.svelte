<script lang="ts">
  import { app } from "../state/appState.svelte";
  import { backdrop } from "./backdrop";
  import { t } from "../i18n/ui.svelte";

  const s = $derived(t());

  let confirmDeleteId = $state<string | null>(null);
</script>

<aside class="sidebar">
  <div class="sidebar-brand">Praxis</div>
  <div class="sidebar-heading">{s.sidebar.conversations}</div>
  <button
    class="btn primary new-conv"
    class:active={app.view === "new-chat"}
    onclick={() => (app.view = "new-chat")}
  >
    + {s.sidebar.newConversation}
  </button>

  <nav class="conversations">
    {#each app.conversations as conv (conv.id)}
      {@const names = app.personaNamesOf(conv.id)}
      <div
        class="conv-row"
        class:active={conv.id === app.currentConversationId && app.view === "chat"}
      >
        <button class="conv-title" onclick={() => void app.openConversation(conv.id)}>
          <span class="conv-label">{conv.title}</span>
          {#if names.length > 1}
            <span class="conv-cast">{names.join(" · ")}</span>
          {/if}
        </button>
        <button
          class="conv-delete"
          title={s.sidebar.deleteConversation}
          onclick={() => (confirmDeleteId = conv.id)}
        >
          ✕
        </button>
      </div>
    {/each}
    {#if app.conversations.length === 0}
      <p class="empty">{s.sidebar.noConversations}<br />{s.sidebar.createOneToStart}</p>
    {/if}
  </nav>

  <div class="bottom-nav">
    <button
      class="nav-item"
      class:active={app.view === "personas"}
      onclick={() => (app.view = "personas")}
    >
      {s.sidebar.characters}
    </button>
    <button
      class="nav-item"
      class:active={app.view === "settings"}
      onclick={() => (app.view = "settings")}
    >
      {s.sidebar.settings}
    </button>
  </div>
</aside>

{#if confirmDeleteId}
  {@const conv = app.conversations.find((c) => c.id === confirmDeleteId)}
  <div class="modal-backdrop" role="presentation" {...backdrop(() => (confirmDeleteId = null))}>
    <div class="modal" role="dialog" tabindex="-1">
      <h3>{s.sidebar.deleteConversationTitle}</h3>
      <p>{s.sidebar.deleteConversationBody(conv?.title ?? "")}</p>
      <div class="modal-actions">
        <button class="btn" onclick={() => (confirmDeleteId = null)}>{s.common.cancel}</button>
        <button
          class="btn danger"
          onclick={() => {
            const id = confirmDeleteId;
            confirmDeleteId = null;
            if (id) void app.deleteConversation(id);
          }}
        >
          {s.common.delete}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .sidebar {
    width: 240px;
    min-width: 240px;
    /* Velours : rayures verticales à la limite du perceptible. */
    background:
      repeating-linear-gradient(
        96deg,
        rgba(255, 255, 255, 0.014) 0px,
        rgba(255, 255, 255, 0.014) 1px,
        transparent 1px,
        transparent 7px
      ),
      var(--bg-sidebar);
    border-right: 1px solid var(--border-soft);
    box-shadow: inset -14px 0 26px -18px rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    padding: 12px;
    gap: 12px;
  }

  .sidebar-brand {
    padding: 2px 10px 0;
    color: var(--text);
    font-family: var(--font-stage);
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .sidebar-heading {
    margin: 2px 10px -4px;
    color: var(--text-faint);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .new-conv {
    justify-content: center;
  }

  .conversations {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .conv-row {
    display: flex;
    align-items: center;
    border-radius: 8px;
  }

  .conv-row:hover {
    background: var(--bg-hover);
  }

  .conv-row.active {
    background: linear-gradient(90deg, rgba(107, 63, 137, 0.3), var(--bg-active));
    box-shadow: inset 3px 0 var(--accent);
  }

  .conv-title {
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 8px 10px;
    font-size: 13.5px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .conv-label {
    font-family: var(--font-stage);
    font-size: 14px;
  }

  .conv-label,
  .conv-cast {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .conv-cast {
    font-size: 11.5px;
    color: var(--text-faint);
  }









  .conv-delete {
    padding: 4px 8px;
    color: var(--text-faint);
    visibility: hidden;
    font-size: 11px;
  }

  .conv-row:hover .conv-delete {
    visibility: visible;
  }

  .conv-delete:hover {
    color: var(--danger);
  }

  .empty {
    color: var(--text-faint);
    font-size: 13px;
    text-align: center;
    margin-top: 24px;
  }

  .bottom-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-top: 1px solid var(--border-soft);
    padding-top: 10px;
  }

  .nav-item {
    text-align: left;
    padding: 8px 10px;
    border-radius: 8px;
    color: var(--text-soft);
    font-weight: 500;
  }

  .nav-item:hover {
    background: var(--bg-hover);
  }

  .nav-item.active {
    background: linear-gradient(90deg, rgba(107, 63, 137, 0.3), var(--bg-active));
    box-shadow: inset 3px 0 var(--accent);
    color: var(--text);
  }
</style>
