<script lang="ts">
  import { fade } from "svelte/transition";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { app } from "../state/appState.svelte";
  import {
    builtinAvatarImage,
    builtinAvatarSvg,
    MOOD_COLORS,
    resolveAvatar,
  } from "../services/avatar";
  import { buildTemporalContext } from "../services/temporal";
  import { MOOD_LABELS_BY_LOCALE } from "../i18n/moods";
  import { t, uiLocale } from "../i18n/ui.svelte";
  import type { Mood } from "../types";

  const s = $derived(t());

  let {
    size = 40,
    /** Personnage représenté ; par défaut la persona principale de la scène. */
    personaId = null,
    /** Nom de repli quand la persona n'existe plus (message d'un personnage supprimé). */
    fallbackName = null,
  }: {
    size?: number;
    personaId?: string | null;
    fallbackName?: string | null;
  } = $props();

  let failedSources = $state<string[]>([]);

  const persona = $derived(
    personaId
      ? app.personaById(personaId)
      : app.activePersona,
  );
  const seed = $derived(persona?.id ?? fallbackName ?? "");
  const name = $derived(persona?.name ?? fallbackName ?? s.avatar.fallbackName);

  const period = $derived(buildTemporalContext(new Date(), null).dayPeriod);
  const emotionVisible = $derived(
    app.settings.emotionEnabled && app.settings.avatarsEnabled,
  );
  const mood = $derived<Mood>(
    emotionVisible ? (app.stateFor(persona?.id)?.mood ?? "neutral") : "neutral",
  );
  const variant = $derived(
    app.settings.avatarsEnabled
      ? resolveAvatar(app.variantsFor(persona?.id), { mood }, period)
      : undefined,
  );
  const importedSrc = $derived(
    variant ? convertFileSrc(variant.assetPath) : null,
  );
  const portraitSrc = $derived(
    builtinAvatarImage(
      persona?.avatarStyle ?? seed,
      persona?.gender ?? "neutral",
    ),
  );
  const svgFallback = $derived(
    builtinAvatarSvg(mood, period, persona?.avatarStyle ?? seed),
  );
  const src = $derived(
    [importedSrc, portraitSrc, svgFallback]
      .filter((candidate): candidate is string => Boolean(candidate))
      .find((candidate) => !failedSources.includes(candidate)) ?? svgFallback,
  );
  const ring = $derived(emotionVisible ? MOOD_COLORS[mood] : null);
  const reactionIntensity = $derived(
    emotionVisible ? (app.reactionFor(persona?.id)?.intensity ?? 0) : 0,
  );
  const glowAlpha = $derived(
    Math.round((0.2 + reactionIntensity * 0.5) * 255)
      .toString(16)
      .padStart(2, "0"),
  );
</script>

<span
  class="avatar-wrap"
  style:width="{size}px"
  style:height="{size}px"
  style:--ring={ring ?? "var(--border-soft)"}
  style:--glow={ring ? `${ring}${glowAlpha}` : "transparent"}
  style:--glow-size="{Math.max(6, Math.round(size / 5 + reactionIntensity * size * 0.35))}px"
  title={ring
    ? s.avatar.moodTitle(
        name,
        MOOD_LABELS_BY_LOCALE[uiLocale()][mood],
        reactionIntensity > 0 ? Math.round(reactionIntensity * 100) : null,
      )
    : name}
>
  {#key src}
    <img
      class="avatar"
      src={src}
      alt={s.avatar.altText(name)}
      transition:fade={{ duration: 400 }}
      onerror={() => (failedSources = [...failedSources, src])}
    />
  {/key}
</span>

<style>
  .avatar-wrap {
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--bg-panel);
    box-shadow:
      0 0 0 1px rgba(233, 223, 210, 0.14),
      0 0 0 3px var(--ring),
      0 0 var(--glow-size) 1px var(--glow),
      0 8px 22px rgba(0, 0, 0, 0.38);
    transition: box-shadow 0.8s ease;
  }

  .avatar-wrap::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    border-radius: 50%;
    box-shadow:
      inset 0 0 0 1px rgba(255, 241, 218, 0.08),
      inset 0 -10px 18px rgba(8, 5, 9, 0.18);
  }

  .avatar {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  @media (prefers-reduced-motion: reduce) {
    .avatar-wrap {
      transition: none;
    }
  }
</style>
