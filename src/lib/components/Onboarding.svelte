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
  <span class="glow one" aria-hidden="true"></span>
  <span class="glow two" aria-hidden="true"></span>
  <div class="card">
    <div class="hero" aria-hidden="true">🎭</div>
    <div class="steps" aria-hidden="true">
      <i class:on={step >= 1}></i><i class:on={step >= 2}></i>
    </div>
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
    overflow: hidden;
    background: var(--body-background);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  /* Deux projecteurs colorés qui dérivent derrière la carte. */
  .glow {
    position: absolute;
    width: 46vmax;
    height: 46vmax;
    border-radius: 50%;
    filter: blur(60px);
    opacity: 0.32;
    pointer-events: none;
  }

  .glow.one {
    left: -12vmax;
    top: -14vmax;
    background: var(--accent-2);
    animation: drift 14s ease-in-out infinite alternate;
  }

  .glow.two {
    right: -14vmax;
    bottom: -16vmax;
    background: var(--accent-3);
    animation: drift 17s ease-in-out infinite alternate-reverse;
  }

  .card {
    position: relative;
    background:
      radial-gradient(90% 40% at 50% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%),
      var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 26px;
    padding: 34px 34px 30px;
    width: min(500px, 92vw);
    max-height: 94vh;
    overflow-y: auto;
    box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.55);
    animation: card-in 0.6s var(--spring) both;
  }

  .hero {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    margin-bottom: 14px;
    border-radius: 20px;
    background: var(--accent-gradient);
    box-shadow: 0 12px 28px -10px var(--accent-glow);
    font-size: 34px;
    animation: hero-wave 3.2s ease-in-out 0.6s infinite;
  }

  .steps {
    position: absolute;
    top: 34px;
    right: 34px;
    display: flex;
    gap: 6px;
  }

  .steps i {
    width: 22px;
    height: 6px;
    border-radius: 999px;
    background: var(--bg-hover);
    transition: background 0.3s;
  }

  .steps i.on {
    background: var(--accent-gradient);
  }

  h1 {
    margin: 0 0 10px;
    font-family: var(--font-stage);
    font-size: 28px;
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
    border-radius: 999px;
    background: transparent;
    color: var(--text-soft);
    font-size: 13.5px;
    font-weight: 600;
    transition:
      background 0.2s,
      transform 0.25s var(--spring);
  }

  .choice:hover {
    background: var(--bg-hover);
    transform: translateY(-1px);
  }

  .choice.selected {
    border-color: transparent;
    background: var(--accent-gradient);
    color: var(--accent-ink);
  }

  @keyframes card-in {
    from { opacity: 0; transform: translateY(24px) scale(0.96); }
  }

  @keyframes hero-wave {
    0%, 60%, 100% { transform: rotate(0); }
    70% { transform: rotate(-12deg) scale(1.06); }
    80% { transform: rotate(10deg) scale(1.06); }
    90% { transform: rotate(-4deg); }
  }

  @keyframes drift {
    to { transform: translate(8vmax, 6vmax) scale(1.1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .glow,
    .card,
    .hero {
      animation: none;
    }
  }
</style>
