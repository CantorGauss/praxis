<script lang="ts">
  import { tick } from "svelte";
  import { app } from "../state/appState.svelte";
  import Avatar from "./Avatar.svelte";
  import { t } from "../i18n/ui.svelte";
  import { personaAccent } from "../services/avatar";
  import {
    computeAwards,
    MIN_LINES_FOR_REVIEW,
    sceneStats,
  } from "../services/review";

  const s = $derived(t());
  let sheetEl = $state<HTMLDivElement | null>(null);

  const stats = $derived(sceneStats(app.messages));
  const awards = $derived(computeAwards(app.messages, app.sceneCast));
  const entry = $derived(
    app.currentConversationId ? app.reviews[app.currentConversationId] : undefined,
  );
  const review = $derived(entry?.review ?? null);
  const tooEarly = $derived(stats.lines < MIN_LINES_FOR_REVIEW);

  function nameOf(id: string): string {
    return app.sceneCast.find((p) => p.id === id)?.name ?? "?";
  }

  $effect(() => {
    if (app.curtainCallOpen) void tick().then(() => sheetEl?.focus());
  });

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && app.curtainCallOpen) app.raiseCurtain();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if app.curtainCallOpen}
  <div class="curtain-overlay">
    <button class="scrim" aria-label={s.curtainCall.close} onclick={() => app.raiseCurtain()}></button>
    <span class="drape left" aria-hidden="true"></span>
    <span class="drape right" aria-hidden="true"></span>

    <div
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="curtain-title"
      tabindex="-1"
      bind:this={sheetEl}
    >
      <header>
        <div>
          <span class="kicker">{s.curtainCall.kicker}</span>
          <h2 id="curtain-title">{s.curtainCall.title}</h2>
          <span class="stats">{s.curtainCall.stats(stats.lines, stats.narrations, stats.twists, stats.asides)}</span>
        </div>
        <button class="close" onclick={() => app.raiseCurtain()} aria-label={s.curtainCall.close}>✕</button>
      </header>

      <div class="scroll">
        <!-- La critique : une coupure de presse, un peu de travers. -->
        <article class="clipping" class:loading={entry?.status === "loading" && !review}>
          {#if tooEarly}
            <p class="placeholder">{s.curtainCall.tooEarly(MIN_LINES_FOR_REVIEW)}</p>
          {:else if review}
            <div class="masthead">{review.newspaper ?? s.curtainCall.defaultPaper}</div>
            {#if review.stars !== null}
              <div class="stars" role="img" aria-label={s.curtainCall.starsAria(review.stars)}>
                {#each Array(5) as _, i}
                  <span class="star" class:lit={i < review.stars} style:--i={i}>★</span>
                {/each}
              </div>
            {/if}
            {#if review.headline}<h3>{review.headline}</h3>{/if}
            <p class="body">{review.body}</p>
          {:else if entry?.status === "failed"}
            <p class="placeholder">{s.curtainCall.reviewFailed}</p>
          {:else}
            <p class="placeholder pencil">
              <span aria-hidden="true">✍️</span> {s.curtainCall.reviewLoading}
            </p>
          {/if}
        </article>

        {#if !tooEarly}
          <div class="review-actions">
            {#if entry?.status === "loading" && review}
              <span class="pencil small"><span aria-hidden="true">✍️</span> {s.curtainCall.reviewLoading}</span>
            {/if}
            <button
              class="btn"
              disabled={entry?.status === "loading"}
              onclick={() => void app.requestReview()}
            >
              {review ? s.curtainCall.rewrite : s.curtainCall.retry}
            </button>
          </div>
        {/if}

        <h3 class="awards-title"><span aria-hidden="true">🏆</span> {s.curtainCall.awardsTitle}</h3>
        {#if awards.length === 0}
          <p class="placeholder">{s.curtainCall.noAwards}</p>
        {:else}
          <ul class="awards">
            {#each awards as award, i (award.id)}
              {@const text = s.curtainCall.awards[award.id]}
              <li style:--i={i} style:--c={award.winnerIds[0] ? personaAccent(award.winnerIds[0]) : "var(--accent)"}>
                <span class="trophy" aria-hidden="true">{text.icon}</span>
                <div class="award-copy">
                  <span class="award-title">{text.title}</span>
                  <span class="winners">
                    {#if award.winnerIds.length === 0}
                      {s.curtainCall.director}
                    {:else}
                      {#each award.winnerIds as id (id)}
                        <span class="winner"><Avatar size={22} personaId={id} fallbackName={nameOf(id)} />{nameOf(id)}</span>
                      {/each}
                    {/if}
                  </span>
                  {#if award.quote}
                    <q>{award.quote}</q>
                  {:else}
                    <small>{text.detail(award.count)}</small>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .curtain-overlay {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 28px;
    overflow: hidden;
  }

  .scrim {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: rgba(7, 4, 8, 0.78);
    backdrop-filter: blur(5px);
    cursor: default;
  }

  /* Deux pans de velours qui tombent de part et d'autre de la feuille. */
  .drape {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 13%;
    pointer-events: none;
    background:
      repeating-linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.28) 0 6px,
        transparent 6px 22px
      ),
      linear-gradient(180deg, #7a1424, #4a0a15);
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.6);
  }

  .drape.left {
    left: 0;
    border-bottom-right-radius: 60% 12%;
  }

  .drape.right {
    right: 0;
    border-bottom-left-radius: 60% 12%;
  }

  .sheet {
    position: relative;
    width: min(640px, 100%);
    max-height: min(84vh, 820px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(197, 149, 75, 0.32);
    border-radius: 16px;
    background: var(--summary-bg);
    box-shadow: 0 32px 90px rgba(0, 0, 0, 0.72);
  }

  .sheet > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding: 20px 24px 14px;
    border-bottom: 1px solid var(--border-soft);
  }

  .kicker {
    color: var(--accent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h2 {
    margin: 5px 0 3px;
    color: var(--text);
    font-family: var(--font-stage);
    font-size: 22px;
    font-weight: 600;
  }

  .stats {
    color: var(--text-faint);
    font-size: 11.5px;
  }

  .close {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--text-soft);
    background: color-mix(in srgb, var(--text) 4%, transparent);
  }

  .scroll {
    overflow-y: auto;
    padding: 22px 24px 26px;
  }

  /* Coupure de presse : papier jauni, légèrement de travers. */
  .clipping {
    padding: 18px 22px 20px;
    border-radius: 3px;
    background: #f4ecd8;
    color: #2a2118;
    font-family: var(--font-stage);
    box-shadow:
      0 1px 0 rgba(0, 0, 0, 0.08),
      0 14px 34px -14px rgba(0, 0, 0, 0.6);
    transform: rotate(-0.8deg);
  }

  .masthead {
    padding-bottom: 6px;
    margin-bottom: 10px;
    border-bottom: 3px double rgba(42, 33, 24, 0.55);
    text-align: center;
    font-size: 21px;
    font-weight: 700;
    letter-spacing: 0.04em;
    font-variant: small-caps;
  }

  .stars {
    text-align: center;
    font-size: 22px;
    letter-spacing: 3px;
    line-height: 1;
    margin-bottom: 8px;
  }

  .star {
    color: rgba(42, 33, 24, 0.2);
    display: inline-block;
  }

  .star.lit {
    color: #c5952f;
  }

  .clipping h3 {
    margin: 0 0 8px;
    font-size: 18px;
    line-height: 1.3;
    font-style: italic;
  }

  .body {
    margin: 0;
    font-size: 14.5px;
    line-height: 1.65;
    text-align: justify;
    hyphens: auto;
  }

  .placeholder {
    margin: 0;
    text-align: center;
    font-style: italic;
    color: inherit;
    opacity: 0.75;
    font-size: 13.5px;
  }

  .awards-title + .placeholder {
    color: var(--text-faint);
  }

  .review-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    margin-top: 14px;
  }

  .pencil.small {
    color: var(--text-faint);
    font-size: 12px;
    font-style: italic;
  }

  .awards-title {
    margin: 22px 0 12px;
    color: var(--text);
    font-family: var(--font-stage);
    font-size: 17px;
    font-weight: 600;
  }

  .awards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 10px;
  }

  .awards li {
    display: flex;
    gap: 12px;
    padding: 11px 13px;
    border: 1px solid var(--border-soft);
    border-left: 3px solid var(--c);
    border-radius: 12px;
    background: color-mix(in srgb, var(--c) 7%, var(--bg-panel));
  }

  .trophy {
    font-size: 26px;
    line-height: 1.1;
  }

  .award-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .award-title {
    color: var(--accent);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .winners {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    color: var(--text);
    font-weight: 600;
    font-size: 14px;
  }

  .winner {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .award-copy small {
    color: var(--text-faint);
    font-size: 11.5px;
  }

  .award-copy q {
    color: var(--text-soft);
    font-family: var(--font-stage);
    font-style: italic;
    font-size: 12.5px;
    line-height: 1.45;
  }

  @media (prefers-reduced-motion: no-preference) {
    .drape.left {
      animation: drape-fall-left 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }

    .drape.right {
      animation: drape-fall-right 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }

    .sheet {
      animation: sheet-in 0.55s 0.25s var(--spring) both;
    }

    .star.lit {
      animation: star-pop 0.45s var(--spring) both;
      animation-delay: calc(0.55s + var(--i) * 0.12s);
    }

    .awards li {
      animation: award-in 0.45s var(--spring) both;
      animation-delay: calc(0.6s + var(--i) * 0.08s);
    }

    .pencil > span {
      display: inline-block;
      animation: scribble 0.6s ease-in-out infinite alternate;
    }
  }

  @keyframes drape-fall-left {
    from { transform: translateX(-100%); }
  }

  @keyframes drape-fall-right {
    from { transform: translateX(100%); }
  }

  /* Mouvements seuls, jamais d'opacité : une fenêtre en arrière-plan fige
     les animations, et la critique doit rester lisible quoi qu'il arrive. */
  @keyframes sheet-in {
    from { transform: translateY(18px) scale(0.97); }
  }

  @keyframes star-pop {
    0% { transform: scale(0.6) rotate(-40deg); }
    100% { transform: scale(1) rotate(0); }
  }

  @keyframes award-in {
    from { transform: translateY(10px) scale(0.96); }
  }

  @keyframes scribble {
    from { transform: translateX(-2px) rotate(-8deg); }
    to { transform: translateX(3px) rotate(6deg); }
  }
</style>
