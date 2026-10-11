<script lang="ts">
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import { backdrop } from "./backdrop";
  import { t } from "../i18n/ui.svelte";

  const s = $derived(t());

  let confirmDeleteId = $state<string | null>(null);
</script>

<aside class="sidebar">
  <div class="sidebar-brand">
    <span class="brand-mark" aria-hidden="true">🎭</span>
    <span class="brand-copy">
      <span class="brand-name">Praxis</span>
      <span class="brand-tagline">{s.sidebar.tagline}</span>
    </span>
  </div>
  <button
    class="btn primary new-conv"
    class:active={app.view === "new-chat"}
    onclick={() => (app.view = "new-chat")}
  >
    <span class="new-conv-icon" aria-hidden="true">✦</span>
    {s.sidebar.newConversation}
  </button>
  <div class="sidebar-heading">{s.sidebar.conversations}</div>

  <nav class="conversations">
    {#each app.conversations as conv (conv.id)}
      {@const names = app.personaNamesOf(conv.id)}
      {@const castIds = app.participantsByConversation[conv.id] ?? []}
      <div
        class="conv-row"
        class:active={conv.id === app.currentConversationId && app.view === "chat"}
      >
        <button class="conv-title" onclick={() => void app.openConversation(conv.id)}>
          <span class="conv-faces" class:crowd={castIds.length > 1} aria-hidden="true">
            {#each castIds.slice(0, 3) as id (id)}
              <Avatar size={24} personaId={id} />
            {/each}
          </span>
          <span class="conv-text">
            <span class="conv-label">{conv.title}</span>
            {#if names.length > 1}
              <span class="conv-cast">{names.join(" · ")}</span>
            {/if}
          </span>
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
      <p class="empty">
        <span class="empty-icon" aria-hidden="true">🍿</span>
        {s.sidebar.noConversations}<br />{s.sidebar.createOneToStart}
      </p>
    {/if}
  </nav>

  <div class="bottom-nav">
    <button
      class="nav-item"
      class:active={app.view === "personas"}
      onclick={() => (app.view = "personas")}
    >
      <span class="nav-icon" aria-hidden="true">🎭</span>
      {s.sidebar.characters}
      <span class="nav-count">{app.personas.length}</span>
    </button>
    <button
      class="nav-item"
      class:active={app.view === "settings"}
      onclick={() => (app.view = "settings")}
    >
      <span class="nav-icon" aria-hidden="true">🎛️</span>
      {s.sidebar.settings}
    </button>
  </div>
</aside>

{#if confirmDeleteId}
    {@const conv = app.conversationById(confirmDeleteId)}
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
    width: 260px;
    min-width: 260px;
    background:
      radial-gradient(120% 40% at 0% 0%, rgba(255, 95, 143, 0.1), transparent 70%),
      radial-gradient(120% 30% at 100% 100%, rgba(79, 214, 200, 0.07), transparent 70%),
      var(--bg-sidebar);
    border-right: 1px solid var(--border-soft);
    display: flex;
    flex-direction: column;
    padding: 14px 12px 12px;
    gap: 12px;
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 6px 2px;
  }

  .brand-mark {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    flex: 0 0 36px;
    border-radius: 11px;
    background: var(--accent-gradient);
    box-shadow: 0 6px 16px -6px var(--accent-glow);
    font-size: 20px;
    transform: rotate(-6deg);
    transition: transform 0.4s var(--spring);
  }

  .sidebar-brand:hover .brand-mark {
    transform: rotate(8deg) scale(1.08);
  }

  .brand-copy {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }

  .brand-name {
    color: var(--text);
    font-family: var(--font-stage);
    font-size: 21px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .brand-tagline {
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 500;
  }

  .sidebar-heading {
    margin: 4px 10px -6px;
    color: var(--text-faint);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .new-conv {
    justify-content: center;
    padding-block: 9px;
  }

  .new-conv-icon {
    display: inline-block;
    transition: transform 0.5s var(--spring);
  }

  .new-conv:hover .new-conv-icon {
    transform: rotate(180deg) scale(1.2);
  }

  .conversations {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 0 -4px;
    padding: 0 4px;
  }

  .conv-row {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 12px;
    border: 1px solid transparent;
    transition:
      background 0.2s,
      transform 0.25s var(--spring);
  }

  .conv-row:hover {
    background: var(--bg-hover);
    transform: translateX(2px);
  }

  .conv-row.active {
    background:
      linear-gradient(90deg, rgba(255, 143, 90, 0.16), rgba(255, 95, 143, 0.08) 60%, transparent),
      var(--bg-active);
    border-color: color-mix(in srgb, var(--accent) 22%, transparent);
  }

  .conv-title {
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 8px 8px 8px 9px;
    font-size: 13.5px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Largeur fixe : les titres restent alignés quel que soit le nombre de visages. */
  .conv-faces {
    display: flex;
    flex: 0 0 42px;
  }

  .conv-faces.crowd :global(.avatar-wrap:not(:first-child)) {
    margin-left: -15px;
  }

  .conv-faces :global(.avatar-wrap) {
    box-shadow:
      0 0 0 2px var(--bg-sidebar),
      0 0 0 3px var(--ring);
  }

  .conv-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .conv-label {
    font-family: var(--font-stage);
    font-size: 14px;
    font-weight: 600;
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

  /* Superposé au survol : le titre garde toute la largeur le reste du temps. */
  .conv-delete {
    position: absolute;
    top: 50%;
    right: 6px;
    translate: 0 -50%;
    width: 24px;
    height: 24px;
    background: var(--bg-hover);
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text-faint);
    visibility: hidden;
    font-size: 10px;
  }

  .conv-row:hover .conv-delete {
    visibility: visible;
  }

  .conv-delete:hover {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 14%, transparent);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: var(--text-faint);
    font-size: 13px;
    text-align: center;
    margin-top: 24px;
  }

  .empty-icon {
    font-size: 30px;
    margin-bottom: 6px;
  }

  .bottom-nav {
    display: flex;
    flex-direction: column;
    gap: 3px;
    border-top: 1px solid var(--border-soft);
    padding-top: 10px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 8px 10px;
    border-radius: 12px;
    color: var(--text-soft);
    font-weight: 600;
    transition:
      background 0.2s,
      color 0.2s;
  }

  .nav-icon {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--bg-hover);
    font-size: 15px;
    transition: transform 0.35s var(--spring);
  }

  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text);
  }

  .nav-item:hover .nav-icon {
    transform: rotate(-10deg) scale(1.1);
  }

  .nav-item.active {
    background:
      linear-gradient(90deg, rgba(255, 143, 90, 0.16), rgba(255, 95, 143, 0.08) 60%, transparent),
      var(--bg-active);
    color: var(--text);
  }

  .nav-item.active .nav-icon {
    background: var(--accent-gradient);
  }

  .nav-count {
    margin-left: auto;
    min-width: 22px;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--bg-hover);
    color: var(--text-faint);
    font-size: 11px;
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .brand-mark,
    .new-conv-icon,
    .nav-icon,
    .conv-row {
      transition: none;
    }
  }
</style>
