<script lang="ts">
  import { app } from "../state/appState.svelte";
  import { t } from "../i18n/ui.svelte";

  const s = $derived(t());
  const hasCast = $derived(app.personas.length > 0);
</script>

<!--
  État de repos de l'application. Le décor suit désormais l'interface : velours
  dans la pénombre, toile claire et cartouche de papier en mode clair. Les deux
  versions sont dessinées en CSS pour rester nettes à toute taille.
-->
<div class="curtain">
  <div class="backdrop" aria-hidden="true">
    <span class="valance"></span>
    <span class="light"></span>
  </div>

  <div class="stage">
    <span class="rule"></span>
    <h1>{s.curtain.title}</h1>
    <p>
      {#if hasCast}
        {s.curtain.withCast}
      {:else}
        {s.curtain.withoutCast}
      {/if}
    </p>
    <div class="actions">
      {#if hasCast}
        <button class="btn primary" onclick={() => (app.view = "new-chat")}>
          {s.sidebar.newConversation}
        </button>
        <button class="btn ghost" onclick={() => (app.view = "personas")}>
          {s.sidebar.characters}
        </button>
      {:else}
        <button class="btn primary" onclick={() => (app.view = "personas")}>
          {s.curtain.createCharacter}
        </button>
      {/if}
    </div>
    {#if app.conversations.length > 0}
      <p class="past">{s.curtain.available(app.conversations.length)}</p>
    {/if}
    <span class="rule"></span>
  </div>
</div>

<style>
  .curtain {
    --rest-surface: #2c0508;
    --rest-backdrop:
      repeating-linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.38) 0px,
        rgba(0, 0, 0, 0.06) 13px,
        rgba(255, 255, 255, 0.075) 27px,
        rgba(0, 0, 0, 0.06) 41px,
        rgba(0, 0, 0, 0.38) 56px
      ),
      repeating-linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.3) 0px,
        transparent 44px,
        rgba(255, 255, 255, 0.045) 96px,
        transparent 148px,
        rgba(0, 0, 0, 0.3) 194px
      ),
      repeating-linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.22) 0px,
        transparent 150px,
        rgba(255, 255, 255, 0.03) 300px,
        transparent 450px,
        rgba(0, 0, 0, 0.22) 610px
      ),
      linear-gradient(180deg, #86151c 0%, #5c0d13 45%, #33060a 100%);
    --rest-edges:
      linear-gradient(180deg, rgba(0, 0, 0, 0.62), transparent 20%),
      linear-gradient(0deg, rgba(0, 0, 0, 0.58), transparent 16%),
      linear-gradient(90deg, rgba(0, 0, 0, 0.45), transparent 14%),
      linear-gradient(270deg, rgba(0, 0, 0, 0.45), transparent 14%);
    --rest-light: radial-gradient(
      58% 46% at 50% 44%,
      rgba(255, 214, 150, 0.16),
      transparent 68%
    );
    --rest-stage: radial-gradient(
      120% 100% at 50% 50%,
      rgba(20, 4, 6, 0.72),
      transparent 78%
    );
    --rest-stage-border: transparent;
    --rest-stage-radius: 0;
    --rest-stage-shadow: none;
    --rest-title: #f6e9d4;
    --rest-copy: #e2c9b6;
    --rest-muted: #c9ab97;
    --rest-text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
    --rest-copy-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
    --rest-rule: #d8b45c;
    --rest-ghost-bg: rgba(20, 4, 6, 0.4);
    --rest-ghost-bg-hover: rgba(20, 4, 6, 0.62);
    --rest-ghost-border: rgba(216, 180, 92, 0.4);
    --rest-ghost-text: #ecd9bd;
    --rest-ghost-text-hover: #fff6e6;

    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--rest-surface);
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: var(--rest-backdrop);
  }

  .valance {
    position: absolute;
    inset: 0;
    background: var(--rest-edges);
  }

  .light {
    position: absolute;
    inset: 0;
    background: var(--rest-light);
  }

  .stage {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
    max-width: 46ch;
    padding: 34px 40px;
    border: 1px solid var(--rest-stage-border);
    border-radius: var(--rest-stage-radius);
    background: var(--rest-stage);
    box-shadow: var(--rest-stage-shadow);
  }

  /* Filets de laiton, en haut et en bas : le cadre de scène. */
  .rule {
    width: 130px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--rest-rule), transparent);
    opacity: 0.75;
  }

  h1 {
    font-family: var(--font-stage);
    font-size: 29px;
    font-weight: 600;
    letter-spacing: 0.01em;
    margin: 0;
    color: var(--rest-title);
    text-shadow: var(--rest-text-shadow);
  }

  p {
    color: var(--rest-copy);
    margin: 0;
    font-size: 13.5px;
    line-height: 1.6;
    text-shadow: var(--rest-copy-shadow);
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-top: 4px;
  }

  .actions :global(.btn.ghost) {
    background: var(--rest-ghost-bg);
    border-color: var(--rest-ghost-border);
    color: var(--rest-ghost-text);
  }

  .actions :global(.btn.ghost:hover) {
    background: var(--rest-ghost-bg-hover);
    color: var(--rest-ghost-text-hover);
  }

  .past {
    font-size: 12px;
    color: var(--rest-muted);
    margin-top: 6px;
  }

  :global(html[data-theme="light"]) .curtain {
    --rest-surface: #efe7dc;
    --rest-backdrop:
      radial-gradient(
        52% 56% at 50% 38%,
        rgba(255, 255, 255, 0.88),
        transparent 72%
      ),
      linear-gradient(
        105deg,
        transparent 0 17%,
        rgba(128, 92, 108, 0.075) 17.2% 17.5%,
        transparent 17.8% 82.2%,
        rgba(128, 92, 108, 0.075) 82.5% 82.8%,
        transparent 83% 100%
      ),
      repeating-linear-gradient(
        90deg,
        rgba(79, 60, 52, 0.026) 0 1px,
        transparent 1px 8px
      ),
      linear-gradient(180deg, #fbf7f1 0%, #f1e9de 54%, #e7dccf 100%);
    --rest-edges:
      linear-gradient(180deg, rgba(117, 87, 66, 0.08), transparent 24%),
      linear-gradient(0deg, rgba(117, 87, 66, 0.1), transparent 22%),
      linear-gradient(90deg, rgba(117, 87, 66, 0.07), transparent 18%),
      linear-gradient(270deg, rgba(117, 87, 66, 0.07), transparent 18%);
    --rest-light: radial-gradient(
      46% 44% at 50% 42%,
      rgba(202, 151, 68, 0.1),
      transparent 72%
    );
    --rest-stage: linear-gradient(
      145deg,
      rgba(255, 253, 248, 0.94),
      rgba(248, 240, 230, 0.9)
    );
    --rest-stage-border: rgba(151, 123, 101, 0.26);
    --rest-stage-radius: 22px;
    --rest-stage-shadow: 0 24px 70px rgba(92, 68, 52, 0.14);
    --rest-title: var(--text);
    --rest-copy: var(--text-soft);
    --rest-muted: var(--text-faint);
    --rest-text-shadow: none;
    --rest-copy-shadow: none;
    --rest-rule: var(--accent);
    --rest-ghost-bg: rgba(255, 253, 248, 0.68);
    --rest-ghost-bg-hover: var(--bg-hover);
    --rest-ghost-border: var(--border);
    --rest-ghost-text: var(--text-soft);
    --rest-ghost-text-hover: var(--text);
  }

  @media (max-width: 680px) {
    .stage {
      margin: 24px;
      padding: 28px 24px;
    }
  }
</style>
