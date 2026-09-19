<script lang="ts">
  import { app } from "../state/appState.svelte";
  import { t } from "../i18n/ui.svelte";
  import { USER_ADDRESSEE } from "../types";

  const s = $derived(t().coordination);
  const proposals = $derived(app.proposals);

  function nameOf(id: string): string {
    if (id === USER_ADDRESSEE) return app.userName;
    return app.personaById(id)?.name ??
      app.messages.find((m) => m.personaId === id || m.interaction?.actorId === id)?.personaName ?? s.unknownPerson;
  }
</script>

{#if proposals.length > 0}
  {#key app.currentConversationId}
    <details class="coordination">
      <summary>{s.title} <span class="count">{proposals.length}</span></summary>
      <div class="ledger">
        <p class="hint">{s.hint}</p>
        {#each [...proposals].reverse() as proposal (proposal.id)}
          <article>
            <div class="heading">
              <a href={`#message-${proposal.sourceMessageId}`}>{proposal.text}</a>
              <span class="status" class:agreed={proposal.status === "agreed"}>{s.status[proposal.status]}</span>
            </div>
            <ul>
              {#each proposal.participantIds as id (id)}
                {@const position = proposal.positions[id]}
                <li>
                  <span>{nameOf(id)}</span>
                  {#if position}
                    <a class="position" href={`#message-${position.messageId}`} title={position.evidence}>
                      {s.stance[position.stance]}{position.condition ? ` — ${position.condition}` : ""}
                    </a>
                  {:else}
                    <span class="pending">{s.pending}</span>
                  {/if}
                </li>
              {/each}
            </ul>
          </article>
        {/each}
      </div>
    </details>
  {/key}
{/if}

<style>
  .coordination { flex: 0 0 auto; border-bottom: 1px solid var(--border); background: var(--bg); font-size: 12px; }
  summary { cursor: pointer; padding: 10px 20px; color: var(--text-soft); }
  .count { margin-left: 6px; color: var(--text-faint); }
  .ledger { max-height: min(32vh, 280px); overflow-y: auto; padding: 0 20px 12px; }
  .hint { color: var(--text-soft); margin: 0 0 10px; }
  article { padding: 10px 0; border-top: 1px solid var(--border); }
  .heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  a { color: var(--text); text-decoration: none; overflow-wrap: anywhere; }
  a:hover { text-decoration: underline; }
  .status { color: var(--text-soft); white-space: nowrap; }
  .status.agreed { color: var(--accent); }
  ul { margin: 8px 0 0; padding: 0; list-style: none; }
  li { display: flex; gap: 12px; padding: 3px 0; align-items: baseline; }
  li > span:first-child { min-width: 64px; }
  .position { color: var(--text-soft); }
  .pending { color: var(--text-faint); }
  @media (max-width: 600px) { .heading { flex-wrap: wrap; gap: 4px; } }
</style>
