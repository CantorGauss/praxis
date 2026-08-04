<script lang="ts">
  import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
  import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
  import { app } from "../state/appState.svelte";
  import {
    deleteAllData,
    exportAllData,
    importAllData,
    profileRepo,
  } from "../services/repositories";
  import {
    forgetApiKey,
    getApiKey,
    setApiKey,
    testConnection,
  } from "../services/llmClient";
  import { MAX_CONSECUTIVE_AI_TURNS } from "../services/scene";
  import { MODEL_CONTEXT_PRESETS } from "../services/inference";
  import type {
    ChatTextSize,
    Connection,
    ConnectionPreset,
    InterfaceDensity,
    InterfaceTheme,
    ModelProfile,
  } from "../types";
  import { CONNECTION_PRESETS, DEFAULT_TIMEOUT_MS } from "../types";
  import { LOCALES, LOCALE_LABELS, type Locale } from "../i18n/locales";
  import { formatNumber, t } from "../i18n/ui.svelte";
  import { KEEP_RECENT_MESSAGES, SUMMARY_CONTEXT_RATIO } from "../services/summaryService";
  import { backdrop } from "./backdrop";

  const s = $derived(t());

  let apiKey = $state("");
  let apiKeyConnectionId = $state<string | null>(null);
  let apiKeyMessage = $state("");
  let testStatus = $state<"idle" | "testing" | "ok" | "fail">("idle");
  let testMessage = $state("");
  let dataMessage = $state("");
  let confirmWipe = $state(false);
  let showAdvanced = $state(false);
  type SettingsSection =
    | "connections"
    | "conversation"
    | "appearance"
    | "advanced"
    | "data";
  let activeSection = $state<SettingsSection>("connections");
  // Seules les valeurs vivent ici ; les libellés suivent la langue de l'interface.
  const SETTINGS_SECTIONS: SettingsSection[] = [
    "connections",
    "conversation",
    "appearance",
    "advanced",
    "data",
  ];
  const THEME_OPTIONS: InterfaceTheme[] = ["system", "dark", "light"];
  const TEXT_SIZE_OPTIONS: ChatTextSize[] = ["small", "normal", "large"];
  const DENSITY_OPTIONS: InterfaceDensity[] = ["comfortable", "compact"];

  async function setUiLanguage(locale: Locale) {
    app.settings.uiLocale = locale;
    await app.saveSettings();
  }

  async function setConversationLanguage(locale: Locale) {
    app.settings.conversationLanguage = locale;
    await app.saveSettings();
  }

  // Connexions
  const connection = $derived(app.activeConnection);
  let presetKey = $state(CONNECTION_PRESETS[0].key);
  /** Autorisation d'un hôte distant : jamais accordée sans un oui explicite. */
  let confirmRemote = $state<
    { kind: "preset"; preset: ConnectionPreset } | { kind: "toggle" } | null
  >(null);
  let confirmDelete = $state<Connection | null>(null);

  // Profil du modèle actif (section avancée)
  let profile = $state<ModelProfile | null>(null);
  let customParams = $state("");
  let contextWindow = $state("");
  let profileMessage = $state("");
  let capacityMessage = $state("");
  let profileModelId = $state<string | null>(null);
  let customCapacityOpen = $state(false);

  function isContextPreset(value: number): boolean {
    return MODEL_CONTEXT_PRESETS.some((preset) => preset === value);
  }

  const capacitySelection = $derived.by(() => {
    const value = profile?.contextWindow;
    if (customCapacityOpen || (value && !isContextPreset(value))) return "custom";
    return value ? String(value) : "auto";
  });

  /** Ce que Praxis emploiera réellement, et d'où la valeur provient. */
  const capacityBudget = $derived(
    app.activeModelId
      ? app.contextBudgetFor(app.activeModelId, profile?.contextWindow)
      : null,
  );

  const capacityOrigin = $derived.by(() => {
    const budget = capacityBudget;
    if (!budget) return "";
    const tokens = formatNumber(budget.tokens);
    if (budget.source === "manual") return s.settings.capacityManual(tokens);
    if (budget.source === "detected") {
      return s.settings.capacityDetected(
        formatNumber(budget.detected ?? 0),
        tokens,
      );
    }
    return s.settings.capacityFallback(tokens);
  });

  // Filtre de la liste des modèles : un serveur local en expose un, une
  // passerelle comme OpenRouter en expose plusieurs centaines.
  let modelFilter = $state("");
  const filteredModels = $derived.by(() => {
    const needle = modelFilter.trim().toLowerCase();
    const list = needle
      ? app.models.filter((m) => m.id.toLowerCase().includes(needle))
      : app.models;
    return [...list].sort((a, b) => a.id.localeCompare(b.id));
  });

  // La clé affichée est celle de la connexion sélectionnée : changer de
  // serveur ne doit jamais montrer — ni réenregistrer — la clé d'un autre.
  $effect(() => {
    const id = connection?.id ?? null;
    if (id === apiKeyConnectionId) return;
    apiKeyConnectionId = id;
    apiKey = "";
    apiKeyMessage = "";
    testStatus = "idle";
    testMessage = "";
    if (!id) return;
    void getApiKey(id).then((k) => {
      if (apiKeyConnectionId === id) apiKey = k ?? "";
    });
  });

  // La capacité est un réglage de premier niveau : elle est chargée dès que le
  // modèle actif change, sans obliger à ouvrir les paramètres techniques.
  $effect(() => {
    const id = app.activeModelId;
    if (id === profileModelId) return;
    profileModelId = id;
    profile = null;
    contextWindow = "";
    customCapacityOpen = false;
    capacityMessage = "";
    if (id) void loadProfile(id);
  });

  async function persist() {
    await app.saveSettings();
  }

  /** Enregistre une modification de la connexion sélectionnée. */
  function patch(fields: Partial<Connection>) {
    if (!connection) return;
    void app.updateConnection({ ...connection, ...fields });
  }

  async function saveKey() {
    if (!connection) return;
    await setApiKey(connection.id, apiKey);
    apiKeyMessage = apiKey ? s.settings.keySaved : s.settings.keyRemoved;
  }

  function addPreset(preset: ConnectionPreset) {
    void app.addConnection({
      name: preset.name,
      baseUrl: preset.baseUrl,
      allowRemoteHosts: preset.remote,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      selectedModelId: null,
    });
  }

  /** Un serveur distant n'est ajouté qu'après un accord explicite. */
  function requestPreset() {
    const preset = CONNECTION_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    if (preset.remote) confirmRemote = { kind: "preset", preset };
    else addPreset(preset);
  }

  function toggleRemote(next: boolean) {
    if (next) confirmRemote = { kind: "toggle" };
    else patch({ allowRemoteHosts: false });
  }

  function acceptRemote() {
    const pending = confirmRemote;
    confirmRemote = null;
    if (!pending) return;
    if (pending.kind === "preset") addPreset(pending.preset);
    else patch({ allowRemoteHosts: true });
  }

  async function doDelete() {
    const target = confirmDelete;
    confirmDelete = null;
    if (target) await app.removeConnection(target.id);
  }

  async function doTest() {
    if (!connection) return;
    testStatus = "testing";
    testMessage = "";
    try {
      await setApiKey(connection.id, apiKey);
      await testConnection(connection);
      testStatus = "ok";
      testMessage = s.settings.connectionOk;
      await app.refreshModels();
      app.connected = true;
    } catch (e) {
      testStatus = "fail";
      testMessage = String(e);
      app.connected = false;
    }
  }

  async function doExport() {
    dataMessage = "";
    const path = await saveDialog({
      defaultPath: s.settings.exportFileName,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    const json = await exportAllData();
    await writeTextFile(path, json);
    dataMessage = s.settings.exportDone;
  }

  async function doImport() {
    dataMessage = "";
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path || Array.isArray(path)) return;
    try {
      const json = await readTextFile(path);
      await importAllData(json);
      dataMessage = s.settings.importDone;
      location.reload();
    } catch (e) {
      dataMessage = s.settings.importFailed(String(e));
    }
  }

  async function doWipe() {
    confirmWipe = false;
    // Le coffre du système n'est pas dans la base : chaque clé se retire à part.
    for (const c of app.connections) await forgetApiKey(c.id);
    await deleteAllData();
    location.reload();
  }

  async function loadProfile(modelId: string | null = app.activeModelId) {
    if (!modelId) return;
    const loaded = await profileRepo.get(modelId);
    if (app.activeModelId !== modelId) return;
    profile = loaded;
    const safeCustom = { ...(loaded.customParameters ?? {}) };
    delete safeCustom.reasoning;
    delete safeCustom.include_reasoning;
    customParams = Object.keys(safeCustom).length ? JSON.stringify(safeCustom) : "";
    contextWindow = loaded.contextWindow?.toString() ?? "";
    customCapacityOpen = Boolean(
      loaded.contextWindow && !isContextPreset(loaded.contextWindow),
    );
  }

  async function saveModelCapacity(value: number | undefined) {
    const modelId = app.activeModelId;
    if (!modelId) return;
    capacityMessage = "";
    try {
      const current =
        profile?.modelId === modelId ? profile : await profileRepo.get(modelId);
      const updated: ModelProfile = { ...current, contextWindow: value };
      await profileRepo.save(updated);
      profile = updated;
      contextWindow = value?.toString() ?? "";
      capacityMessage = value
        ? s.settings.capacitySaved(Math.round(value / 1024))
        : s.settings.capacityReturned;
      app.lastPromptTokens = null;
      app.lastPromptContextTokens = null;
      app.lastReplyTokenBudget = null;
    } catch (e) {
      capacityMessage = `Enregistrement impossible : ${e}`;
    }
  }

  function chooseModelCapacity(raw: string) {
    capacityMessage = "";
    if (raw === "custom") {
      customCapacityOpen = true;
      contextWindow =
        profile?.contextWindow?.toString() ??
        app.settings.logicalContextTokens.toString();
      return;
    }
    customCapacityOpen = false;
    void saveModelCapacity(raw === "auto" ? undefined : Number(raw));
  }

  async function saveCustomCapacity() {
    const value = Number.parseInt(contextWindow, 10);
    if (!Number.isFinite(value) || value < 2048) {
      capacityMessage = s.settings.capacityTooSmall;
      return;
    }
    await saveModelCapacity(value);
  }

  async function saveProfile() {
    const modelId = app.activeModelId;
    if (!modelId) return;
    profileMessage = "";
    try {
      const parsedCustom: Record<string, unknown> | undefined = customParams.trim()
        ? JSON.parse(customParams)
        : undefined;
      if (
        parsedCustom &&
        (typeof parsedCustom !== "object" || Array.isArray(parsedCustom))
      ) {
        throw new Error(s.settings.parametersMustBeObject);
      }
      if (parsedCustom) {
        delete parsedCustom.reasoning;
        delete parsedCustom.include_reasoning;
      }
      const saved: ModelProfile = {
        ...(profile?.modelId === modelId ? profile : { modelId }),
        modelId,
        contextWindow: profile?.contextWindow,
        customParameters: parsedCustom,
      };
      await profileRepo.save(saved);
      profile = saved;
      profileMessage = s.settings.profileSaved;
    } catch (e) {
      profileMessage = `JSON invalide : ${e}`;
    }
  }
</script>

<div class="view">
  <h2 class="panel-title">{s.settings.title}</h2>
  <p class="panel-sub">Tout reste sur votre machine.</p>

  <nav class="settings-tabs" aria-label={s.settings.sectionsAria}>
    {#each SETTINGS_SECTIONS as id (id)}
      <button
        class:active={activeSection === id}
        onclick={() => (activeSection = id)}
      >{s.settings.tabs[id]}</button>
    {/each}
  </nav>

  {#if activeSection === "connections"}
  <section>
    <h3>{s.settings.connections}</h3>
    <p class="hint" style="margin-top: -6px">{s.settings.connectionsHint}</p>

    <div class="conn-tabs">
      {#each app.connections as c (c.id)}
        <button
          class="conn-tab"
          class:on={connection?.id === c.id}
          onclick={() => void app.useConnection(c.id)}
          title={c.baseUrl}
        >
          {c.name}
          {#if c.allowRemoteHosts}<span class="tag">{s.settings.remoteTag}</span>{/if}
        </button>
      {/each}
    </div>

    <div class="row">
      <select bind:value={presetKey} aria-label={s.settings.serverTypeAria}>
        {#each CONNECTION_PRESETS as p (p.key)}
          <option value={p.key}>{p.name}</option>
        {/each}
      </select>
      <button class="btn" onclick={requestPreset}>{s.common.add}</button>
      <button
        class="btn"
        disabled={!connection}
        onclick={() => connection && void app.duplicateConnection(connection.id)}
      >
        {s.common.duplicate}
      </button>
      <button
        class="btn danger"
        disabled={!connection || app.connections.length <= 1}
        title={app.connections.length <= 1
          ? s.settings.keepOneConnection
          : s.settings.deleteConnectionTitle}
        onclick={() => (confirmDelete = connection)}
      >
        {s.common.delete}
      </button>
    </div>
    <span class="hint">{s.settings.presetHints[presetKey]}</span>

    {#if connection}
      <div class="conn-detail">
        <div class="field">
          <label for="s-name">{s.persona.name}</label>
          <input
            id="s-name"
            value={connection.name}
            onchange={(e) =>
              patch({ name: e.currentTarget.value.trim() || s.settings.unnamed })}
          />
        </div>
        <div class="field">
          <label for="s-url">{s.settings.baseUrl}</label>
          <input
            id="s-url"
            value={connection.baseUrl}
            onchange={(e) => patch({ baseUrl: e.currentTarget.value.trim() })}
          />
          <span class="hint">{s.settings.baseUrlHint}</span>
        </div>
        <div class="field">
          <label for="s-key">{s.settings.apiKey}</label>
          <input
            id="s-key"
            type="password"
            bind:value={apiKey}
            onchange={() => void saveKey()}
          />
          <span class="hint">
            {s.settings.apiKeyHint}
            {#if apiKeyMessage}<strong>{apiKeyMessage}</strong>{/if}
          </span>
        </div>
        <div class="field">
          <label for="s-timeout">{s.settings.timeout}</label>
          <input
            id="s-timeout"
            type="number"
            min="5"
            value={Math.round(connection.timeoutMs / 1000)}
            onchange={(e) =>
              patch({
                timeoutMs: Math.max(5, Number(e.currentTarget.value)) * 1000,
              })}
          />
        </div>
        <div class="field checkbox">
          <label>
            <input
              type="checkbox"
              checked={connection.allowRemoteHosts}
              onchange={(e) => {
                const next = e.currentTarget.checked;
                // L'état visuel est rendu par la connexion elle-même : on
                // remet la case dans son état réel tant que rien n'est validé.
                e.currentTarget.checked = connection.allowRemoteHosts;
                toggleRemote(next);
              }}
            />
            {s.settings.allowRemote}
          </label>
        </div>
        {#if connection.allowRemoteHosts}
          <span class="hint warn">{s.settings.remoteWarning}</span>
        {/if}
        <div class="row">
          <button
            class="btn"
            onclick={() => void doTest()}
            disabled={testStatus === "testing"}
          >
            {testStatus === "testing" ? s.settings.testing : s.settings.testConnection}
          </button>
          {#if testMessage}
            <span
              class="test-msg"
              class:ok={testStatus === "ok"}
              class:fail={testStatus === "fail"}
            >
              {testMessage}
            </span>
          {/if}
        </div>
        <div class="field" style="margin-top: 14px">
          <label for="s-model">{s.settings.modelForConnection}</label>
          <div class="row">
            <input
              class="grow"
              placeholder={s.settings.filterModels}
              bind:value={modelFilter}
            />
            <button class="btn" onclick={() => void app.refreshModels()}>
              {s.settings.refresh}
            </button>
          </div>
          <select
            id="s-model"
            class="model-list"
            size={Math.min(Math.max(filteredModels.length + 1, 3), 10)}
            value={connection.selectedModelId ?? ""}
            onchange={(e) => void app.selectModel(e.currentTarget.value || null)}
          >
            <option value="">{s.settings.automaticFirstModel}</option>
            {#each filteredModels as m (m.id)}
              <option value={m.id}>{m.id}</option>
            {/each}
          </select>
          <div class="row" style="margin-top: 8px">
            <span class="detected">{app.activeModelId ?? s.settings.noModel}</span>
          </div>
          {#if app.models.length === 0}
            <span class="hint">{s.settings.noModelsAnnounced}</span>
          {:else if app.selectedModelMissing}
            <span class="hint warn">
              {s.settings.modelGone(connection.selectedModelId ?? "")}
            </span>
          {:else}
            <span class="hint">{s.settings.modelsAnnounced(app.models.length)}</span>
          {/if}
        </div>
        {#if app.activeModelId}
          <div class="capacity-card">
            <div class="capacity-heading">
              <div>
                <strong>{s.settings.modelCapacity}</strong>
                <small>{app.activeModelId}</small>
              </div>
              <select
                aria-label={s.settings.modelCapacity}
                value={capacitySelection}
                onchange={(e) => chooseModelCapacity(e.currentTarget.value)}
              >
                <option value="auto">
                  {#if capacityBudget?.detected}
                    {s.settings.automaticDetected(Math.round(capacityBudget.detected / 1024))}
                  {:else}
                    {s.settings.automaticFallback(Math.round(app.settings.logicalContextTokens / 1024))}
                  {/if}
                </option>
                {#each MODEL_CONTEXT_PRESETS as tokens (tokens)}
                  <option value={String(tokens)}>{Math.round(tokens / 1024)}K</option>
                {/each}
                <option value="custom">{s.settings.custom}</option>
              </select>
            </div>
            <p class="hint">{s.settings.capacityExplanation}</p>
            {#if capacityOrigin}<p class="hint capacity-origin">{capacityOrigin}</p>{/if}
            {#if capacitySelection === "custom"}
              <div class="custom-capacity">
                <label for="s-cw">{s.settings.customCapacity}</label>
                <input
                  id="s-cw"
                  type="number"
                  min="2048"
                  step="1024"
                  bind:value={contextWindow}
                  placeholder="8192"
                />
                <button class="btn" onclick={() => void saveCustomCapacity()}>
                  {s.common.save}
                </button>
              </div>
            {/if}
            {#if capacityMessage}<p class="hint capacity-message">{capacityMessage}</p>{/if}
          </div>
        {/if}
      </div>
    {/if}
  </section>
  {/if}

  {#if activeSection === "advanced"}
  <section>
    <h3>{s.settings.advancedInference}</h3>
    <button class="btn" onclick={() => { showAdvanced = !showAdvanced; if (!showAdvanced) profileMessage = ""; else void loadProfile(); }}>
      {showAdvanced ? s.settings.hide : s.settings.show} {s.settings.technicalParameters}
    </button>
    {#if showAdvanced}
      <div class="advanced">
        <div class="field">
          <label for="s-ctx">{s.settings.fallbackCapacity}</label>
          <input
            id="s-ctx"
            type="number"
            min="2048"
            step="1024"
            bind:value={app.settings.logicalContextTokens}
            onchange={() => void persist()}
          />
          <span class="hint">{s.settings.fallbackCapacityHint}</span>
        </div>
        {#if !app.activeModelId}
          <p class="hint">{s.settings.selectModelFirst}</p>
        {:else}
          <p class="hint">{s.settings.technicalProfileOf(app.activeModelId)}</p>
          <div class="no-thinking-card">
            <strong>{s.settings.reasoningOff}</strong>
            <p>{s.settings.reasoningOffBody}</p>
            <code>{'{"reasoning_effort":"none","chat_template_kwargs":{"enable_thinking":false}}'}</code>
          </div>
          <div class="field">
            <label for="s-custom">{s.settings.otherCustomParameters}</label>
            <input id="s-custom" bind:value={customParams} placeholder={'{"repeat_penalty":1.1}'} />
            <span class="hint">{s.settings.reasoningKeyManaged}</span>
          </div>
          <div class="row">
            <button class="btn primary" onclick={() => void saveProfile()}>
              {s.settings.saveProfile}
            </button>
            {#if profileMessage}<span class="hint">{profileMessage}</span>{/if}
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <section>
    <h3>{s.settings.performance}</h3>
    <div class="field">
      <label for="s-window">{s.settings.historyWindow}</label>
      <input
        id="s-window"
        type="number"
        min="8"
        step="2"
        bind:value={app.settings.historyWindowMessages}
        onchange={() => void persist()}
      />
      <span class="hint">
        {s.settings.historyWindowHint(
          KEEP_RECENT_MESSAGES,
          Math.round(SUMMARY_CONTEXT_RATIO * 100),
        )}
      </span>
    </div>
  </section>
  {/if}

  {#if activeSection === "conversation"}
  <section>
    <h3>{s.settings.groupConversation}</h3>
    <div class="field">
      <label for="s-director">{s.settings.whoSpeaks}</label>
      <select
        id="s-director"
        value={app.settings.sceneDirector}
        onchange={(e) => {
          app.settings.sceneDirector = e.currentTarget.value as "round" | "model";
          void persist();
        }}
      >
        <option value="round">{s.settings.roundRobin}</option>
        <option value="model">{s.settings.modelDecides}</option>
      </select>
      <span class="hint">{s.settings.whoSpeaksHint}</span>
    </div>
    <div class="field">
      <label for="s-auto-rounds">{s.settings.autoRounds}</label>
      <select
        id="s-auto-rounds"
        value={app.settings.sceneAutoRounds}
        onchange={(e) => {
          app.settings.sceneAutoRounds = Number(e.currentTarget.value);
          void persist();
        }}
      >
        <option value={0}>{s.settings.autoRoundsNone}</option>
        <option value={1}>{s.settings.autoRoundsN(1)}</option>
        <option value={2}>{s.settings.autoRoundsN(2)}</option>
        <option value={3}>{s.settings.autoRoundsN(3)}</option>
      </select>
      <span class="hint">{s.settings.autoRoundsHint(MAX_CONSECUTIVE_AI_TURNS)}</span>
    </div>
    <div class="field">
      <label for="s-idle">{s.settings.idleResume}</label>
      <input
        id="s-idle"
        type="number"
        min="0"
        step="5"
        bind:value={app.settings.idleChatterSeconds}
        onchange={() => void persist()}
      />
      <span class="hint">{s.settings.idleResumeHint}</span>
    </div>
  </section>
  <section>
    <h3>{s.settings.characterBehaviour}</h3>
    <div class="field">
      <label for="s-persona">{s.settings.defaultPersona}</label>
      <select
        id="s-persona"
        bind:value={app.settings.defaultPersonaId}
        onchange={() => {
          void persist();
          void app.refreshEmotionalState();
        }}
      >
        <option value={null}>{s.settings.noneOption}</option>
        {#each app.personas as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </div>
    <div class="field checkbox">
      <label>
        <input
          type="checkbox"
          bind:checked={app.settings.emotionEnabled}
          onchange={() => {
            void persist();
            void app.refreshEmotionalState();
          }}
        />
        {s.settings.keepEmotion}
      </label>
    </div>
    <div class="field checkbox">
      <label>
        <input
          type="checkbox"
          bind:checked={app.settings.emotionAnalysisEnabled}
          onchange={() => void persist()}
          disabled={!app.settings.emotionEnabled}
        />
        {s.settings.analyseReaction}
      </label>
      <span class="hint">{s.settings.analyseReactionHint}</span>
    </div>
    <div class="field checkbox">
      <label>
        <input
          type="checkbox"
          bind:checked={app.settings.avatarsEnabled}
          onchange={() => void persist()}
        />
        {s.settings.varyAvatars}
      </label>
    </div>
    {#if app.settings.emotionEnabled && app.personas.length > 0}
      <div class="row">
        {#each app.personas as p (p.id)}
          <button class="btn" onclick={() => void app.resetEmotionalState(p.id)}>
            {s.settings.reset(p.name)}
          </button>
        {/each}
      </div>
    {/if}
  </section>
  {/if}

  {#if activeSection === "appearance"}
  <section>
    <h3>{s.settings.theme}</h3>
    <p class="section-intro">{s.settings.themeIntro}</p>
    <div class="preference-grid themes">
      {#each THEME_OPTIONS as value (value)}
        <button
          class="preference-choice theme-choice {value}"
          class:selected={app.settings.interfaceTheme === value}
          aria-pressed={app.settings.interfaceTheme === value}
          onclick={() => {
            app.settings.interfaceTheme = value;
            void persist();
          }}
        >
          <span class="theme-swatch" aria-hidden="true">
            <i></i><b></b>
          </span>
          <strong>{s.settings.themes[value].label}</strong>
          <small>{s.settings.themes[value].description}</small>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h3>{s.settings.language}</h3>
    <p class="section-intro">{s.settings.languageIntro}</p>
    <div class="appearance-group">
      <div>
        <strong>{s.settings.uiLanguage}</strong>
      </div>
      <div class="preference-grid">
        {#each LOCALES as locale (locale)}
          <button
            class="preference-choice"
            class:selected={app.settings.uiLocale === locale}
            aria-pressed={app.settings.uiLocale === locale}
            onclick={() => void setUiLanguage(locale)}
          >
            <strong>{LOCALE_LABELS[locale]}</strong>
          </button>
        {/each}
      </div>
    </div>
    <div class="appearance-group">
      <div>
        <strong>{s.settings.conversationLanguage}</strong>
        <small>{s.settings.conversationLanguageHint}</small>
      </div>
      <div class="preference-grid">
        {#each LOCALES as locale (locale)}
          <button
            class="preference-choice"
            class:selected={app.settings.conversationLanguage === locale}
            aria-pressed={app.settings.conversationLanguage === locale}
            onclick={() => void setConversationLanguage(locale)}
          >
            <strong>{LOCALE_LABELS[locale]}</strong>
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section>
    <h3>{s.settings.readingComfort}</h3>
    <div class="appearance-group">
      <div>
        <strong>{s.settings.conversationTextSize}</strong>
        <small>{s.settings.conversationTextSizeHint}</small>
      </div>
      <div class="preference-grid">
        {#each TEXT_SIZE_OPTIONS as value (value)}
          <button
            class="preference-choice"
            class:selected={app.settings.chatTextSize === value}
            aria-pressed={app.settings.chatTextSize === value}
            onclick={() => {
              app.settings.chatTextSize = value;
              void persist();
            }}
          >
            <strong>{s.settings.textSizes[value].label}</strong>
            <small>{s.settings.textSizes[value].description}</small>
          </button>
        {/each}
      </div>
    </div>
    <div class="appearance-group">
      <div>
        <strong>{s.settings.threadSpacing}</strong>
        <small>{s.settings.threadSpacingHint}</small>
      </div>
      <div class="preference-grid density-grid">
        {#each DENSITY_OPTIONS as value (value)}
          <button
            class="preference-choice"
            class:selected={app.settings.interfaceDensity === value}
            aria-pressed={app.settings.interfaceDensity === value}
            onclick={() => {
              app.settings.interfaceDensity = value;
              void persist();
            }}
          >
            <strong>{s.settings.densities[value].label}</strong>
            <small>{s.settings.densities[value].description}</small>
          </button>
        {/each}
      </div>
    </div>
  </section>
  {/if}

  {#if activeSection === "data"}
  <section>
    <h3>{s.settings.data}</h3>
    <div class="row">
      <button class="btn" onclick={() => void doExport()}>
        {s.settings.exportAll}
      </button>
      <button class="btn" onclick={() => void doImport()}>
        {s.settings.importBackup}
      </button>
      <button class="btn danger" onclick={() => (confirmWipe = true)}>
        {s.settings.deleteAll}
      </button>
    </div>
    {#if dataMessage}<p class="hint">{dataMessage}</p>{/if}
  </section>
  {/if}
</div>

{#if confirmRemote}
  <div class="modal-backdrop" role="presentation" {...backdrop(() => (confirmRemote = null))}>
    <div class="modal" role="dialog" tabindex="-1">
      <h3>{s.settings.allowRemoteTitle}</h3>
      <p>
        {#if confirmRemote.kind === "preset"}
          {s.settings.allowRemotePreset(
            confirmRemote.preset.name,
            confirmRemote.preset.baseUrl,
          )}
        {/if}
        {s.settings.allowRemoteBody}
      </p>
      <div class="modal-actions">
        <button class="btn" onclick={() => (confirmRemote = null)}>{s.common.cancel}</button>
        <button class="btn primary" onclick={acceptRemote}>
          {s.settings.allowThisConnection}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if confirmDelete}
  <div class="modal-backdrop" role="presentation" {...backdrop(() => (confirmDelete = null))}>
    <div class="modal" role="dialog" tabindex="-1">
      <h3>{s.settings.deleteConnectionModal(confirmDelete.name)}</h3>
      <p>{s.settings.deleteConnectionBody}</p>
      <div class="modal-actions">
        <button class="btn" onclick={() => (confirmDelete = null)}>{s.common.cancel}</button>
        <button class="btn danger" onclick={() => void doDelete()}>{s.common.delete}</button>
      </div>
    </div>
  </div>
{/if}

{#if confirmWipe}
  <div class="modal-backdrop" role="presentation" {...backdrop(() => (confirmWipe = false))}>
    <div class="modal" role="dialog" tabindex="-1">
      <h3>{s.settings.wipeTitle}</h3>
      <p>{s.settings.wipeBody}</p>
      <div class="modal-actions">
        <button class="btn" onclick={() => (confirmWipe = false)}>{s.common.cancel}</button>
        <button class="btn danger" onclick={() => void doWipe()}>
          {s.settings.wipeConfirm}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .field-label {
    font-size: 13px;
    color: var(--text-soft);
    margin-bottom: 4px;
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .conn-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }

  .conn-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 11px;
    font-size: 13px;
    color: var(--text-soft);
    background: var(--bg-sidebar);
    border: 1px solid var(--border-soft);
    border-radius: 999px;
    cursor: pointer;
  }

  .conn-tab.on {
    color: var(--text);
    border-color: var(--accent, var(--border));
    background: var(--bg-panel);
    font-weight: 600;
  }

  .tag {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--border-soft);
    color: var(--text-faint);
  }

  .conn-detail {
    margin-top: 14px;
    border-top: 1px dashed var(--border);
    padding-top: 14px;
  }

  .model-list {
    margin-top: 8px;
    width: 100%;
    padding: 4px;
    font-size: 13px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .model-list option {
    padding: 3px 6px;
    border-radius: 5px;
  }

  .hint.warn {
    color: var(--danger);
  }

  .detected {
    flex: 1;
    font-size: 13px;
    padding: 7px 10px;
    border-radius: 8px;
    background: var(--bg-sidebar);
    border: 1px solid var(--border-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .capacity-card {
    margin-bottom: 14px;
    padding: 14px;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: var(--bg-sidebar);
  }

  .capacity-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .capacity-heading > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .capacity-heading strong {
    color: var(--text);
    font-size: 13.5px;
  }

  .capacity-heading small {
    overflow: hidden;
    color: var(--text-faint);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .capacity-heading select {
    width: min(270px, 48%);
  }

  .capacity-card > .hint {
    display: block;
    margin: 10px 0 0;
  }

  .custom-capacity {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 7px 8px;
    align-items: center;
    margin-top: 12px;
  }

  .custom-capacity label {
    grid-column: 1 / -1;
    color: var(--text-soft);
    font-size: 12px;
    font-weight: 600;
  }

  .custom-capacity input {
    width: 100%;
  }

  .capacity-message {
    color: var(--accent) !important;
  }

  /* D'où vient le chiffre : détection, saisie ou repli. */
  .capacity-origin {
    margin-top: 6px;
    font-variant-numeric: tabular-nums;
  }

  .section-intro {
    margin: -6px 0 14px;
    color: var(--text-faint);
    font-size: 12.5px;
  }

  .preference-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .preference-grid.density-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .preference-choice {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 10px 11px;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: var(--choice-bg);
    text-align: left;
  }

  .preference-choice:hover {
    border-color: var(--border);
    background: var(--bg-hover);
  }

  .preference-choice.selected {
    border-color: var(--accent-soft);
    background: var(--bg-active);
    box-shadow: inset 3px 0 var(--accent);
  }

  .preference-choice strong {
    color: var(--text);
    font-size: 12.5px;
  }

  .preference-choice small {
    color: var(--text-faint);
    font-size: 10.5px;
    line-height: 1.35;
  }

  .theme-choice {
    padding: 8px;
  }

  .theme-swatch {
    position: relative;
    width: 100%;
    height: 54px;
    margin-bottom: 6px;
    overflow: hidden;
    border: 1px solid rgba(110, 91, 83, 0.22);
    border-radius: 7px;
  }

  .theme-swatch::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 28%;
    background: var(--swatch-sidebar);
  }

  .theme-swatch i,
  .theme-swatch b {
    position: absolute;
    left: 36%;
    right: 8%;
    display: block;
    border-radius: 999px;
  }

  .theme-swatch i {
    top: 12px;
    height: 9px;
    background: var(--swatch-bubble-a);
  }

  .theme-swatch b {
    top: 29px;
    left: 49%;
    height: 11px;
    background: var(--swatch-bubble-b);
  }

  .theme-choice.dark .theme-swatch {
    background: #100c12;
    --swatch-sidebar: #19131c;
    --swatch-bubble-a: #33263a;
    --swatch-bubble-b: #d2a44d;
  }

  .theme-choice.light .theme-swatch {
    background: #f8f3ec;
    --swatch-sidebar: #e8ded2;
    --swatch-bubble-a: #eee1d2;
    --swatch-bubble-b: #9b6b18;
  }

  .theme-choice.system .theme-swatch {
    background: linear-gradient(90deg, #100c12 50%, #f8f3ec 50%);
    --swatch-sidebar: linear-gradient(90deg, #19131c 50%, #e8ded2 50%);
    --swatch-bubble-a: linear-gradient(90deg, #33263a 50%, #eee1d2 50%);
    --swatch-bubble-b: linear-gradient(90deg, #d2a44d 50%, #9b6b18 50%);
  }

  .appearance-group {
    display: grid;
    grid-template-columns: minmax(170px, 0.65fr) minmax(0, 1.35fr);
    gap: 18px;
    align-items: center;
    padding: 14px 0;
    border-top: 1px solid var(--border-soft);
  }

  .appearance-group:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  .appearance-group > div:first-child {
    display: flex;
    flex-direction: column;
  }

  .appearance-group > div:first-child > strong {
    color: var(--text);
    font-size: 13px;
  }

  .appearance-group > div:first-child > small {
    color: var(--text-faint);
    font-size: 11px;
  }

  .view {
    flex: 1;
    overflow-y: auto;
    padding: 28px 36px;
    width: min(860px, 100%);
  }

  .settings-tabs {
    display: flex;
    gap: 4px;
    margin: -4px 0 18px;
    padding: 4px;
    overflow-x: auto;
    border: 1px solid var(--border-soft);
    border-radius: 11px;
    background: var(--bg-sidebar);
  }

  .settings-tabs button {
    flex: 1;
    min-width: max-content;
    padding: 7px 11px;
    border-radius: 8px;
    color: var(--text-faint);
    font-size: 12.5px;
  }

  .settings-tabs button:hover {
    color: var(--text-soft);
    background: var(--bg-hover);
  }

  .settings-tabs button.active {
    color: var(--text);
    background: var(--bg-active);
  }

  section {
    background: var(--bg-panel);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    padding: 18px 20px;
    margin-bottom: 16px;
  }

  section h3 {
    margin: 0 0 14px;
    font-size: 15px;
  }

  .row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .field.checkbox label {
    font-weight: 400;
    color: var(--text);
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 13.5px;
  }

  .test-msg {
    font-size: 13px;
  }

  .test-msg.ok {
    color: var(--ok);
  }

  .test-msg.fail {
    color: var(--danger);
  }

  .advanced {
    margin-top: 14px;
    border-top: 1px dashed var(--border);
    padding-top: 14px;
  }

  .no-thinking-card {
    margin: 12px 0 16px;
    padding: 13px 14px;
    border: 1px solid color-mix(in srgb, var(--ok) 38%, var(--border));
    border-radius: 10px;
    background: color-mix(in srgb, var(--ok) 7%, var(--choice-bg));
  }

  .no-thinking-card strong {
    color: var(--text);
  }

  .no-thinking-card p {
    margin: 4px 0 10px;
    color: var(--text-soft);
    font-size: 12px;
  }

  .no-thinking-card code {
    display: block;
    overflow-x: auto;
    padding: 8px 10px;
    border-radius: 7px;
    background: var(--input-bg);
    color: var(--accent);
    font-size: 11.5px;
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    .preference-grid,
    .appearance-group {
      grid-template-columns: 1fr;
    }

    .preference-grid.density-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
