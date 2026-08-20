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
  import Onboarding from "../lib/components/Onboarding.svelte";
  import CurtainView from "../lib/components/CurtainView.svelte";
  import { t } from "../lib/i18n/ui.svelte";

  const s = $derived(t());

  let initError = $state<string | null>(null);
  // Le thème sombre évite un flash clair avant la première lecture de la
  // préférence système ; `syncSystemTheme` corrige la valeur dès le montage.
  let systemPrefersDark = $state(true);
  let PersonasView = $state<
    typeof import("../lib/components/PersonasView.svelte").default | null
  >(null);
  let SettingsView = $state<
    typeof import("../lib/components/SettingsView.svelte").default | null
  >(null);

  // Ces deux écrans lourds ne participent pas au premier rendu. Vite les place
  // dans des chunks séparés, chargés seulement à leur première ouverture.
  $effect(() => {
    if (app.view === "personas" && !PersonasView) {
      void import("../lib/components/PersonasView.svelte").then(
        (module) => (PersonasView = module.default),
      );
    }
    if (app.view === "settings" && !SettingsView) {
      void import("../lib/components/SettingsView.svelte").then(
        (module) => (SettingsView = module.default),
      );
    }
  });

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
      {#if PersonasView}
        <PersonasView />
      {:else}
        <div class="loading">{s.common.loading}</div>
      {/if}
    {:else}
      {#if SettingsView}
        <SettingsView />
      {:else}
        <div class="loading">{s.common.loading}</div>
      {/if}
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
    flex: 1;
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
