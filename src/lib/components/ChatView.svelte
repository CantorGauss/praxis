<script lang="ts">
  import { app } from "../state/appState.svelte";
  import ChatComposer from "./ChatComposer.svelte";
  import ChatHeader from "./ChatHeader.svelte";
  import ChatTranscript from "./ChatTranscript.svelte";

  let composerHeight = $state(0);
</script>

<div class="chat">
  <ChatHeader />

  {#if app.errorBanner}
    <div class="banner error">
      {app.errorBanner}
      <button onclick={() => (app.errorBanner = null)}>✕</button>
    </div>
  {/if}
  {#if app.notice}
    <div class="banner notice">
      {app.notice}
      <button onclick={() => (app.notice = null)}>✕</button>
    </div>
  {/if}

  <ChatTranscript bottomOffset={composerHeight} />
  <ChatComposer bind:height={composerHeight} />
</div>

<style>
  .chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    position: relative;
    isolation: isolate;
    background: var(--bg);
  }

  .banner {
    padding: 8px 16px;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .banner.error {
    background: var(--banner-error-bg);
    color: var(--danger);
  }

  .banner.notice {
    background: var(--banner-notice-bg);
    color: var(--text-soft);
  }
</style>
