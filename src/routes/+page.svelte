<script lang="ts">
  import "../lib/app.css";
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { app } from "../lib/state/appState.svelte";
  import { applyUiAppearance } from "../lib/services/uiAppearance";
  import Sidebar from "../lib/components/Sidebar.svelte";
  import ChatView from "../lib/components/ChatView.svelte";
  import CastPanel from "../lib/components/CastPanel.svelte";
  import NewChatView from "../lib/components/NewChatView.svelte";
  import PersonasView from "../lib/components/PersonasView.svelte";
  import SettingsView from "../lib/components/SettingsView.svelte";
  import Onboarding from "../lib/components/Onboarding.svelte";
  import CurtainView from "../lib/components/CurtainView.svelte";
  import { t } from "../lib/i18n/ui.svelte";

  const s = $derived(t());

  let initError = $state<string | null>(null);
  // Le thème sombre évite un flash clair avant la première lecture de la
  // préférence système ; `syncSystemTheme` corrige la valeur dès le montage.
  let systemPrefersDark = $state(true);

  $effect(() => {
    applyUiAppearance(
      app.settings.interfaceTheme,
      app.settings.chatTextSize,
      app.settings.interfaceDensity,
      systemPrefersDark,
    );
  });

  onMount(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => (systemPrefersDark = colorScheme.matches);
    syncSystemTheme();
    colorScheme.addEventListener("change", syncSystemTheme);
    app.init().catch((e) => {
      initError = String(e);
      // Consigné sur disque : sans console, un échec au démarrage serait
      // invisible dès que la fenêtre est fermée.
      void invoke("log_client_error", {
        message: `[${new Date().toISOString()}] init: ${initError}\n${
          e instanceof Error ? (e.stack ?? "") : ""
        }`,
      }).catch(() => {});
    });
    return () => colorScheme.removeEventListener("change", syncSystemTheme);
  });
</script>

{#if initError}
  <div class="fatal">
    <h2>{s.fatal.dbUnavailable}</h2>
    <p>{s.fatal.dbUnavailableBody(initError)}</p>
  </div>
{:else if !app.loaded}
  <div class="loading">{s.common.loading}</div>
{:else if !app.settings.onboarded}
  <Onboarding />
{:else}
  <div class="shell">
    <Sidebar />
    {#if app.view === "chat"}
      {#if app.currentConversationId}
        <ChatView />
        {#if app.castPanelOpen}
          <CastPanel />
        {/if}
      {:else}
        <CurtainView />
      {/if}
    {:else if app.view === "new-chat"}
      <NewChatView />
    {:else if app.view === "personas"}
      <PersonasView />
    {:else}
      <SettingsView />
    {/if}
  </div>
{/if}

<style>
  .shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  .loading,
  .fatal {
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-soft);
    padding: 24px;
    text-align: center;
  }
</style>
