<script lang="ts">
  import { app } from "../state/appState.svelte";
  import {
    listModels,
    testConnection,
    type ModelInfo,
  } from "../services/llmClient";
  import { personaRepo } from "../services/repositories";
  import { appearanceFromSeed } from "../services/avatar";
  import { DEFAULT_MAX_OUTPUT_TOKENS } from "../services/inference";
  import { firstPersonaSeed } from "../services/personaTemplates";
  import { LOCALES, LOCALE_LABELS } from "../i18n/locales";
  import { setUiLocale, t } from "../i18n/ui.svelte";
  import { DEFAULT_TIMEOUT_MS } from "../types";

  const s = $derived(t());

  let step = $state<1 | 2>(1);
  let baseUrl = $state(
    app.activeConnection?.baseUrl ?? "http://localhost:8080/v1",
  );
  let testing = $state(false);
  let error = $state<string | null>(null);
  let models = $state<ModelInfo[]>([]);

  let userName = $state("");
  /**
   * Le personnage proposé suit la langue de jeu tant que l'utilisateur n'a rien
   * saisi : changer de langue à l'étape 1 doit reproposer un prompt cohérent,
   * sans jamais écraser un texte déjà écrit à la main.
   */
  let personaEdited = $state(false);
  const seed = $derived(firstPersonaSeed(app.settings.conversationLanguage));
  let personaName = $state("");
  let personaDescription = $state("");
  let personaPrompt = $state("");
  const effectiveName = $derived(personaName || seed.name);
  const effectiveDescription = $derived(
    personaEdited ? personaDescription : seed.description,
  );
  const effectivePrompt = $derived(personaEdited ? personaPrompt : seed.systemPrompt);

  function setUiLanguage(locale: (typeof LOCALES)[number]) {
    app.settings.uiLocale = locale;
    setUiLocale(locale);
  }

  /** Le premier lancement ne configure qu'un serveur local. */
  const localTarget = $derived({
    id: app.activeConnection?.id ?? "",
    baseUrl,
    allowRemoteHosts: false,
    timeoutMs: app.activeConnection?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  async function connect() {
    testing = true;
    error = null;
    try {
      await testConnection(localTarget);
      models = await listModels(localTarget);
      if (models.length === 0) {
        error = s.onboarding.noModelLoaded;
        return;
      }
      step = 2;
    } catch (e) {
      error = String(e);
    } finally {
      testing = false;
    }
  }

  async function finish() {
    const connection = app.activeConnection;
    if (connection) {
      await app.updateConnection({ ...connection, baseUrl });
    }
    // Vide reste vide : le libellé générique de la langue prend le relais.
    app.settings.userName = userName.trim();
    const name = effectiveName.trim() || seed.name;
    const persona = await personaRepo.create({
      name,
      description: effectiveDescription.trim() || null,
      systemPrompt: effectivePrompt.trim(),
      stableTraits: seed.stableTraits,
      defaultModelId: null,
      temperature: 0.7,
      topP: null,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      gender: "neutral",
      avatarSetId: null,
      avatarStyle: appearanceFromSeed(name),
    });
    app.settings.defaultPersonaId = persona.id;
    app.settings.onboarded = true;
    await app.saveSettings();
    await app.reloadPersonas();
    await app.refreshEmotionalState();
    app.connected = true;
    app.models = models;
    // On arrive rideau baissé : le premier salon reste à composer.
    app.view = "chat";
  }
</script>

<div class="onboarding">
  <div class="card">
    <h1>{s.onboarding.welcome}</h1>
    {#if step === 1}
      <p>{s.onboarding.intro}</p>
      <div class="field">
        <span class="field-label">{s.settings.uiLanguage}</span>
        <div class="choices">
          {#each LOCALES as locale (locale)}
            <button
              class="choice"
              class:selected={app.settings.uiLocale === locale}
              onclick={() => setUiLanguage(locale)}
            >
              {LOCALE_LABELS[locale]}
            </button>
          {/each}
        </div>
      </div>
      <div class="field">
        <span class="field-label">{s.settings.conversationLanguage}</span>
        <div class="choices">
          {#each LOCALES as locale (locale)}
            <button
              class="choice"
              class:selected={app.settings.conversationLanguage === locale}
              onclick={() => (app.settings.conversationLanguage = locale)}
            >
              {LOCALE_LABELS[locale]}
            </button>
          {/each}
        </div>
        <span class="hint">{s.settings.conversationLanguageHint}</span>
      </div>
      <div class="field">
        <label for="ob-url">{s.onboarding.serverAddress}</label>
        <input id="ob-url" bind:value={baseUrl} />
      </div>
      {#if error}
        <p class="error">{error}</p>
        <p class="hint">{s.onboarding.connectionHint}</p>
      {/if}
      <button class="btn primary" disabled={testing} onclick={() => void connect()}>
        {testing ? s.onboarding.connecting : s.onboarding.testConnection}
      </button>
    {:else}
      <p>{s.onboarding.createFirstCharacter}</p>
      <div class="field">
        <label for="ob-user">{s.onboarding.whatShouldWeCallYou}</label>
        <input
          id="ob-user"
          bind:value={userName}
          placeholder={s.onboarding.namePlaceholder}
          autocomplete="off"
          autocapitalize="words"
          spellcheck="false"
        />
        <span class="hint">{s.onboarding.userNameHint}</span>
      </div>
      <div class="field">
        <label for="ob-name">{s.persona.name}</label>
        <input id="ob-name" value={effectiveName} oninput={(e) => (personaName = e.currentTarget.value)} />
      </div>
      <div class="field">
        <label for="ob-desc">{s.persona.description}</label>
        <input
          id="ob-desc"
          value={effectiveDescription}
          oninput={(e) => {
            personaEdited = true;
            personaDescription = e.currentTarget.value;
          }}
        />
      </div>
      <div class="field">
        <label for="ob-prompt">{s.persona.personalityPrompt}</label>
        <textarea
          id="ob-prompt"
          rows="4"
          value={effectivePrompt}
          oninput={(e) => {
            personaEdited = true;
            personaPrompt = e.currentTarget.value;
          }}
        ></textarea>
      </div>
      <div class="actions">
        <button class="btn" onclick={() => (step = 1)}>{s.common.back}</button>
        <button
          class="btn primary"
          disabled={!effectiveName.trim() || !effectivePrompt.trim()}
          onclick={() => void finish()}
        >
          {s.onboarding.continue}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .onboarding {
    position: fixed;
    inset: 0;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px;
    width: min(480px, 92vw);
    box-shadow: 0 26px 70px rgba(0, 0, 0, 0.55);
  }

  h1 {
    margin: 0 0 10px;
    font-size: 24px;
  }

  p {
    color: var(--text-soft);
  }

  .error {
    color: var(--danger);
    font-size: 13px;
  }

  .hint {
    font-size: 12.5px;
    color: var(--text-faint);
  }

  .actions {
    display: flex;
    justify-content: space-between;
    margin-top: 18px;
  }

  /* Le choix de langue arrive avant tout le reste : il conditionne la lecture
     de l'écran suivant, et celle des répliques. */
  .field-label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--text-soft);
  }

  .choices {
    display: flex;
    gap: 8px;
  }

  .choice {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: transparent;
    color: var(--text-soft);
    font-size: 13.5px;
  }

  .choice:hover {
    background: var(--bg-hover);
  }

  .choice.selected {
    border-color: var(--accent);
    background: var(--bg-active);
    color: var(--text);
  }
</style>
