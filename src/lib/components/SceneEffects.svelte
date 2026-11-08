<script lang="ts">
  import { tick } from "svelte";
  import { app } from "../state/appState.svelte";
  import { sceneFx } from "../state/sceneFx.svelte";
  import { bubbleTone } from "../services/bubbleTone";
  import { personaAccent } from "../services/avatar";
  import {
    effectsForMessage,
    newUnanimousAgreements,
    type SceneEffect,
  } from "../services/sceneEffects";
  import { t } from "../i18n/ui.svelte";
  import type { Message } from "../types";

  const s = $derived(t());

  // Comme les entrées de bulles : seul ce qui naît sous les yeux de
  // l'utilisateur a droit à son effet. Rouvrir une scène ne rejoue rien.
  let conversationId: string | null = null;
  let openedAt = Date.now();
  const handled = new Set<string>();
  const celebrated = new Set<string>();

  $effect(() => {
    sceneFx.enabled = app.settings.sceneEffects;
  });

  function anchorOf(message: Message): { x: number; y: number; right: number } | null {
    const row = document.getElementById(`message-${message.id}`);
    const target = row?.querySelector<HTMLElement>(".bubble") ?? row;
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height / 2, 28), right: rect.right };
  }

  function play(message: Message, effect: SceneEffect) {
    if (effect.kind === "shake") {
      sceneFx.shake(effect.strength);
      return;
    }
    const anchor = anchorOf(message);
    if (!anchor) return;
    if (effect.kind === "burst") sceneFx.burst(anchor.right - 8, anchor.y - 18, effect.emoji);
    else if (effect.kind === "laugh") sceneFx.laugh(anchor.x, anchor.y - 10);
    else sceneFx.spotlight(anchor.x, anchor.y);
  }

  $effect(() => {
    const id = app.currentConversationId;
    const messages = app.messages;
    const proposals = app.proposals;
    const emotion = app.settings.emotionEnabled;
    if (id !== conversationId) {
      conversationId = id;
      openedAt = Date.now();
      handled.clear();
      celebrated.clear();
    }

    const fresh = messages.filter((m) => Date.parse(m.createdAt) >= openedAt - 500);
    const ready: Message[] = [];
    for (const message of fresh) {
      if (handled.has(message.id) || message.status === "streaming") continue;
      handled.add(message.id);
      if (message.status === "complete" && message.content.trim()) ready.push(message);
    }

    const agreed = newUnanimousAgreements(
      proposals,
      celebrated,
      new Set(fresh.map((m) => m.id)),
    );
    for (const proposal of agreed) celebrated.add(proposal.id);

    if (ready.length === 0 && agreed.length === 0) return;
    // Après le rendu : il faut la bulle à l'écran pour savoir d'où partir.
    void tick().then(() => {
      for (const message of ready) {
        const tone = bubbleTone(message.content, emotion ? message.reaction : null);
        for (const effect of effectsForMessage(message, tone)) play(message, effect);
      }
      for (const proposal of agreed) {
        sceneFx.rain({ colors: [...proposal.participantIds.map((pid) => personaAccent(pid)), "#f2c14e"] });
        const text = proposal.text.length > 60 ? `${proposal.text.slice(0, 60).trimEnd()}…` : proposal.text;
        sceneFx.banner(s.effects.unanimous(text));
      }
    });
  });
</script>

<!-- Calque des effets : par-dessus tout, et transparent aux clics. -->
<div class="fx-layer" aria-hidden="true">
  {#each sceneFx.particles as p (p.id)}
    <span
      class="p {p.kind}"
      class:paper={p.text === null && p.kind === "fall"}
      class:round={p.round}
      style:left="{p.x}px"
      style:top="{p.y}px"
      style:--dx="{p.dx}px"
      style:--dy="{p.dy}px"
      style:--rot="{p.rotate}deg"
      style:--c={p.color}
      style:--size="{p.size}px"
      style:animation-delay="{p.delay}ms"
      style:animation-duration="{p.duration}ms"
    >{p.text ?? ""}</span>
  {/each}
</div>

<style>
  .fx-layer {
    position: fixed;
    inset: 0;
    z-index: 100;
    pointer-events: none;
    overflow: hidden;
  }

  .p {
    position: absolute;
    display: block;
    line-height: 1;
    font-size: var(--size);
    white-space: nowrap;
    animation-fill-mode: both;
    will-change: transform, opacity;
  }

  /* Confettis et pluies d'objets : chute en tournoyant. */
  .fall {
    animation-name: fall;
    animation-timing-function: cubic-bezier(0.3, 0.2, 0.6, 1);
  }

  .fall.paper {
    width: var(--size);
    height: calc(var(--size) * 0.45);
    background: var(--c);
    border-radius: 2px;
  }

  .fall.paper.round {
    height: var(--size);
    border-radius: 50%;
  }

  /* Gerbe : jaillit, grossit un instant, puis s'éteint. */
  .fly {
    animation-name: fly;
    animation-timing-function: cubic-bezier(0.15, 0.8, 0.3, 1);
  }

  /* Rires : montent en zigzag. */
  .rise {
    color: var(--c);
    font-family: var(--font-stage);
    font-weight: 700;
    font-style: italic;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
    animation-name: rise;
    animation-timing-function: ease-out;
  }

  /* Projecteur : un halo chaud qui s'allume puis se retire. */
  .flash {
    width: 560px;
    height: 560px;
    margin: -280px 0 0 -280px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(255, 226, 150, 0.34),
      rgba(255, 200, 110, 0.12) 40%,
      transparent 70%
    );
    animation-name: flash;
    animation-timing-function: ease-out;
  }

  .banner {
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 999px;
    border: 1px solid rgba(242, 193, 78, 0.55);
    background: linear-gradient(135deg, #3a1d4a, #5a1f35);
    color: #fff3d6;
    font-family: var(--font-stage);
    font-size: 15px;
    font-weight: 600;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    animation-name: banner;
    animation-timing-function: ease-out;
  }

  @keyframes fall {
    0% { transform: translate(0, 0) rotate(0); }
    100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); }
  }

  @keyframes fly {
    0% { transform: translate(0, 0) scale(0.5) rotate(0); opacity: 1; }
    45% { transform: translate(calc(var(--dx) * 0.8), calc(var(--dy) * 0.8)) scale(1.2) rotate(var(--rot)); opacity: 1; }
    100% { transform: translate(var(--dx), calc(var(--dy) + 14px)) scale(0.85) rotate(var(--rot)); opacity: 0; }
  }

  @keyframes rise {
    0% { transform: translate(0, 0) rotate(0) scale(0.8); opacity: 1; }
    30% { transform: translate(calc(var(--dx) * -0.5), calc(var(--dy) * 0.3)) rotate(var(--rot)) scale(1.1); }
    65% { transform: translate(calc(var(--dx) * 0.6), calc(var(--dy) * 0.7)) rotate(calc(var(--rot) * -1)); opacity: 1; }
    100% { transform: translate(var(--dx), var(--dy)) rotate(0); opacity: 0; }
  }

  @keyframes flash {
    0% { opacity: 0; transform: scale(0.6); }
    25% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.15); }
  }

  @keyframes banner {
    0% { transform: translateX(-50%) translateY(-6px) scale(0.85); }
    12% { transform: translateX(-50%) translateY(0) scale(1.05); }
    20% { transform: translateX(-50%) scale(1); }
    85% { opacity: 1; }
    100% { transform: translateX(-50%) translateY(-10px); opacity: 0; }
  }
</style>
