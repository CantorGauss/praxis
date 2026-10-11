<script lang="ts">
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import { t } from "../i18n/ui.svelte";

  const s = $derived(t());
  const hasCast = $derived(app.personas.length > 0);
  const troupe = $derived(app.personas.slice(0, 5));
  /** Ampoules de l'enseigne : assez pour faire le tour du cartouche. */
  const BULBS = 14;
</script>

<!--
  État de repos de l'application : une salle juste avant le lever de rideau.
  Deux pans de velours qui respirent, une poursuite qui balaie la scène, et la
  troupe qui attend en coulisses au-dessus de l'enseigne. Tout est dessiné en
  CSS pour rester net à toute taille.
-->
<div class="curtain">
  <div class="backdrop" aria-hidden="true">
    <span class="spot"></span>
    <span class="drape left"></span>
    <span class="drape right"></span>
    <span class="valance"></span>
    <span class="boards"></span>
  </div>

  <div class="stage">
    {#if troupe.length > 0}
      <div class="troupe" aria-hidden="true">
        {#each troupe as p, i (p.id)}
          <span class="actor" style:--i={i}>
            <Avatar size={52} personaId={p.id} />
          </span>
        {/each}
      </div>
    {:else}
      <div class="mask" aria-hidden="true">🎭</div>
    {/if}

    <div class="marquee">
      <span class="bulbs top" aria-hidden="true">
        {#each Array(BULBS) as _, i}<i style:--i={i}></i>{/each}
      </span>
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
          <button class="btn primary big" onclick={() => (app.view = "new-chat")}>
            <span aria-hidden="true">✦</span>
            {s.curtain.raiseCurtain}
          </button>
          <button class="btn ghost" onclick={() => (app.view = "personas")}>
            {s.sidebar.characters}
          </button>
        {:else}
          <button class="btn primary big" onclick={() => (app.view = "personas")}>
            <span aria-hidden="true">✦</span>
            {s.curtain.createCharacter}
          </button>
        {/if}
      </div>
      {#if app.conversations.length > 0}
        <p class="past">{s.curtain.available(app.conversations.length)}</p>
      {/if}
      <span class="bulbs bottom" aria-hidden="true">
        {#each Array(BULBS) as _, i}<i style:--i={i}></i>{/each}
      </span>
    </div>
  </div>
</div>

<style>
  .curtain {
    --velvet: #8e1838;
    --velvet-deep: #3a0618;
    --velvet-light: rgba(255, 140, 170, 0.16);
    --rest-surface:
      radial-gradient(60% 70% at 50% 40%, #2a1338, #150a20 70%);
    --rest-spot: rgba(255, 214, 150, 0.2);
    --rest-boards:
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.25) 0 2px, transparent 2px 64px),
      linear-gradient(180deg, #5a3320, #2a160c);
    --rest-card:
      linear-gradient(160deg, rgba(255, 255, 255, 0.06), transparent 40%),
      rgba(24, 12, 30, 0.82);
    --rest-card-border: rgba(255, 191, 71, 0.35);
    --rest-title: #fff3df;
    --rest-copy: #e4cfdc;
    --rest-muted: #b79fbb;
    --rest-ghost-bg: rgba(255, 255, 255, 0.06);
    --rest-ghost-bg-hover: rgba(255, 255, 255, 0.12);
    --rest-ghost-border: rgba(255, 191, 71, 0.4);
    --rest-ghost-text: #f6e2c8;
    --bulb-on: #ffd36b;
    --bulb-off: #6b4a2a;

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
    pointer-events: none;
  }

  /* Poursuite : un cône chaud qui balaie lentement la scène. */
  .spot {
    position: absolute;
    left: 50%;
    top: -10%;
    width: 70%;
    height: 120%;
    transform: translateX(-50%);
    background: radial-gradient(
      50% 60% at 50% 55%,
      var(--rest-spot),
      transparent 70%
    );
    animation: spot-sweep 9s ease-in-out infinite alternate;
  }

  /* Pans de rideau : plis verticaux, ourlet arrondi, léger balancement. */
  .drape {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 22%;
    background:
      repeating-linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.32) 0px,
        transparent 14px,
        var(--velvet-light) 26px,
        transparent 38px,
        rgba(0, 0, 0, 0.32) 52px
      ),
      linear-gradient(180deg, var(--velvet), var(--velvet-deep));
    box-shadow: 0 0 60px rgba(0, 0, 0, 0.55);
  }

  .drape.left {
    left: 0;
    border-bottom-right-radius: 70% 18%;
    transform-origin: top left;
    animation: sway-left 7s ease-in-out infinite;
  }

  .drape.right {
    right: 0;
    border-bottom-left-radius: 70% 18%;
    transform-origin: top right;
    animation: sway-right 7.6s ease-in-out infinite;
  }

  /* Lambrequin : la frise festonnée en haut de la scène. */
  .valance {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 72px;
    background:
      radial-gradient(circle at 50% 0, var(--velvet) 0 30px, transparent 31px)
        0 40px / 64px 32px repeat-x,
      linear-gradient(180deg, var(--velvet-deep), var(--velvet)) 0 0 / 100% 40px
        no-repeat;
    filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.45));
  }

  .valance::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 34px;
    height: 3px;
    background: repeating-linear-gradient(90deg, #ffcf6e 0 10px, #b37a24 10px 14px);
    opacity: 0.8;
  }

  /* Plancher de scène. */
  .boards {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 13%;
    background: var(--rest-boards);
    box-shadow: inset 0 14px 24px -10px rgba(0, 0, 0, 0.6);
  }

  .stage {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    margin-top: 30px;
  }

  /* La troupe passe la tête au-dessus de l'enseigne. */
  .troupe {
    display: flex;
    gap: 6px;
    margin-bottom: -14px;
    z-index: 1;
  }

  .actor {
    display: inline-block;
    animation: bob 2.8s ease-in-out infinite;
    animation-delay: calc(var(--i) * -0.45s);
    transition: transform 0.3s var(--spring);
  }

  .actor:hover {
    transform: translateY(-10px) rotate(-6deg);
  }

  .mask {
    font-size: 56px;
    margin-bottom: -10px;
    z-index: 1;
    animation: bob 2.8s ease-in-out infinite;
    filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.45));
  }

  .marquee {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
    max-width: 48ch;
    padding: 40px 44px 38px;
    border-radius: 26px;
    border: 2px solid var(--rest-card-border);
    background: var(--rest-card);
    backdrop-filter: blur(6px);
    box-shadow:
      0 30px 80px -20px rgba(0, 0, 0, 0.7),
      0 0 0 6px rgba(255, 191, 71, 0.06),
      0 0 60px -10px rgba(255, 143, 90, 0.25);
  }

  /* Ampoules d'enseigne, allumées en chenillard. */
  .bulbs {
    position: absolute;
    left: 26px;
    right: 26px;
    display: flex;
    justify-content: space-between;
  }

  .bulbs.top {
    top: 12px;
  }

  .bulbs.bottom {
    bottom: 12px;
  }

  .bulbs i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--bulb-on);
    box-shadow: 0 0 8px var(--bulb-on);
    animation: chase 1.4s steps(1) infinite;
    animation-delay: calc(var(--i) * 0.1s);
  }

  .bulbs.bottom i {
    animation-direction: reverse;
  }

  h1 {
    font-family: var(--font-stage);
    font-size: 34px;
    font-weight: 700;
    letter-spacing: 0.005em;
    margin: 6px 0 0;
    color: var(--rest-title);
    text-shadow: 0 2px 18px rgba(255, 143, 90, 0.35);
  }

  p {
    color: var(--rest-copy);
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 6px;
  }

  .actions :global(.btn.big) {
    padding: 10px 22px;
    font-size: 15px;
  }

  .actions :global(.btn.ghost) {
    background: var(--rest-ghost-bg);
    border-color: var(--rest-ghost-border);
    color: var(--rest-ghost-text);
  }

  .actions :global(.btn.ghost:hover) {
    background: var(--rest-ghost-bg-hover);
    color: var(--rest-title);
  }

  .past {
    font-size: 12px;
    color: var(--rest-muted);
    margin-bottom: 4px;
  }

  @keyframes spot-sweep {
    from { transform: translateX(-62%) rotate(-3deg); }
    to { transform: translateX(-38%) rotate(3deg); }
  }

  @keyframes sway-left {
    0%, 100% { transform: skewX(0deg); }
    50% { transform: skewX(1.2deg); }
  }

  @keyframes sway-right {
    0%, 100% { transform: skewX(0deg); }
    50% { transform: skewX(-1.2deg); }
  }

  @keyframes bob {
    0%, 100% { translate: 0 0; }
    50% { translate: 0 -6px; }
  }

  @keyframes chase {
    0%, 66% { background: var(--bulb-on); box-shadow: 0 0 8px var(--bulb-on); }
    67%, 100% { background: var(--bulb-off); box-shadow: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .spot,
    .drape,
    .actor,
    .mask,
    .bulbs i {
      animation: none;
    }
  }

  :global(html[data-theme="light"]) .curtain {
    --velvet: #d8456b;
    --velvet-deep: #8e1d42;
    --velvet-light: rgba(255, 200, 215, 0.22);
    --rest-surface:
      radial-gradient(60% 70% at 50% 40%, #fff6ec, #f4e4ea 75%);
    --rest-spot: rgba(255, 196, 100, 0.28);
    --rest-boards:
      repeating-linear-gradient(90deg, rgba(90, 50, 30, 0.12) 0 2px, transparent 2px 64px),
      linear-gradient(180deg, #d9a77a, #b98256);
    --rest-card:
      linear-gradient(160deg, rgba(255, 255, 255, 0.9), rgba(255, 249, 242, 0.92));
    --rest-card-border: rgba(217, 115, 13, 0.35);
    --rest-title: var(--text);
    --rest-copy: var(--text-soft);
    --rest-muted: var(--text-faint);
    --rest-ghost-bg: rgba(255, 255, 255, 0.7);
    --rest-ghost-bg-hover: var(--bg-hover);
    --rest-ghost-border: var(--border);
    --rest-ghost-text: var(--text-soft);
    --bulb-on: #ffb623;
    --bulb-off: #ead6bf;
  }

  :global(html[data-theme="light"]) .curtain h1 {
    text-shadow: none;
  }

  :global(html[data-theme="light"]) .curtain .marquee {
    box-shadow:
      0 30px 70px -24px rgba(140, 60, 90, 0.3),
      0 0 0 6px rgba(249, 168, 37, 0.08);
  }

  @media (max-width: 860px) {
    .drape {
      width: 12%;
    }

    .marquee {
      margin: 0 24px;
      padding: 36px 26px 34px;
    }
  }
</style>
