<script lang="ts">
  import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
  import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
  import { app } from "../state/appState.svelte";
  import {
    exportPersonas,
    importPersonas,
    personaRepo,
  } from "../services/repositories";
  import type { Gender, Persona } from "../types";
  import {
    appearanceFromSeed,
    BUILTIN_AVATAR_IMAGES,
    builtinAvatarIndicesForGender,
    builtinAvatarImage,
    personaAccent,
  } from "../services/avatar";
  import {
    personaTemplates,
    type PersonaTemplate,
  } from "../services/personaTemplates";
  import { t } from "../i18n/ui.svelte";
  import {
    DEFAULT_MAX_OUTPUT_TOKENS,
    RESPONSE_LENGTH_PRESETS,
    responseLengthPreset,
  } from "../services/inference";
  import { backdrop } from "./backdrop";
  import { newId } from "../services/db";

  const s = $derived(t());

  let confirmDelete = $state<{
    persona: Persona;
    solo: number;
    shared: number;
  } | null>(null);
  let dataMessage = $state<string | null>(null);
  let selectedId = $state<string | null>(app.personas[0]?.id ?? null);
  let showAdvanced = $state(false);
  let showAvatarPicker = $state(false);
  let showTemplates = $state(false);
  const selectedPersona = $derived(
    app.personaById(selectedId),
  );

  $effect(() => {
    if (app.personas.length > 0 && !selectedPersona) {
      selectedId = app.personas[0].id;
    }
  });

  /** Seules les valeurs vivent ici ; les libellés suivent la langue de l'interface. */
  const RESPONSE_STYLES = [
    { id: "plain", temperature: 0.35 },
    { id: "natural", temperature: 0.7 },
    { id: "creative", temperature: 1.05 },
  ] as const;

  function closestTemperature(temperature: number): number {
    let closest: number = RESPONSE_STYLES[0].temperature;
    for (const option of RESPONSE_STYLES) {
      if (
        Math.abs(option.temperature - temperature) <
        Math.abs(closest - temperature)
      ) {
        closest = option.temperature;
      }
    }
    return closest;
  }

  /**
   * Édition directe : chaque champ enregistre en quittant le focus. Pas de
   * bouton « Enregistrer », pas de formulaire modal — la page *est* la fiche.
   */
  async function patch(persona: Persona, change: Partial<Persona>) {
    await personaRepo.update({ ...persona, ...change });
    await app.reloadPersonas();
  }

  async function addPersona(template?: PersonaTemplate) {
    const seed = newId();
    const created = await personaRepo.create({
      name: template?.name ?? s.personas.newCharacter,
      description: template?.description ?? null,
      systemPrompt: template?.systemPrompt ?? s.personas.defaultCharacterPrompt,
      stableTraits: template ? [...template.stableTraits] : [],
      defaultModelId: null,
      temperature: template?.temperature ?? 0.7,
      topP: null,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      gender: template?.gender ?? "neutral",
      avatarSetId: null,
      avatarStyle: {
        ...appearanceFromSeed(seed),
        ...(template ? { portrait: template.portrait } : {}),
      },
    });
    if (!app.settings.defaultPersonaId) {
      app.settings.defaultPersonaId = created.id;
      await app.saveSettings();
    }
    await app.reloadPersonas();
    selectedId = created.id;
    showAdvanced = false;
    showAvatarPicker = false;
    showTemplates = false;
    if (template) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      document
        .querySelector(`#name-${created.id}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      // Le nom neuf est le premier champ à corriger : on l'amène sous les yeux.
      await tickToField(created.id);
    }
  }

  async function tickToField(id: string) {
    await new Promise((r) => setTimeout(r, 0));
    const el = document.querySelector<HTMLInputElement>(`#name-${id}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus();
    el?.select();
  }

  async function askDelete(p: Persona) {
    const usage = await personaRepo.usage(p.id);
    confirmDelete = { persona: p, solo: usage.solo, shared: usage.shared };
  }

  async function doDelete() {
    if (!confirmDelete) return;
    const id = confirmDelete.persona.id;
    confirmDelete = null;
    await personaRepo.remove(id);
    if (app.settings.defaultPersonaId === id) {
      app.settings.defaultPersonaId = null;
      await app.saveSettings();
    }
    await app.reloadPersonas();
    await app.reloadConversations();
    if (selectedId === id) selectedId = app.personas[0]?.id ?? null;
  }

  function portraitOf(p: Persona) {
    return builtinAvatarImage(
      p.avatarStyle ?? appearanceFromSeed(p.id),
      p.gender,
    );
  }

  async function choosePortrait(p: Persona, portrait: number) {
    const current = p.avatarStyle ?? appearanceFromSeed(p.id);
    await patch(p, {
      avatarStyle: {
        ...current,
        portrait,
      },
    });
    showAvatarPicker = false;
  }

  function portraitIndexOf(p: Persona): number {
    return BUILTIN_AVATAR_IMAGES.indexOf(portraitOf(p));
  }

  async function doExport() {
    dataMessage = null;
    const path = await saveDialog({
      defaultPath: s.personas.exportFileName,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    await writeTextFile(path, await exportPersonas());
    dataMessage = s.personas.exported(app.personas.length);
  }

  async function doImport() {
    dataMessage = null;
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path || Array.isArray(path)) return;
    try {
      const count = await importPersonas(await readTextFile(path));
      await app.reloadPersonas();
      await app.refreshEmotionalState();
      dataMessage =
        count > 0 ? s.personas.imported(count) : s.personas.nothingImportable;
    } catch (e) {
      dataMessage = String(e);
    }
  }
</script>

<div class="view">
  <div class="view-header">
    <div>
      <h2 class="panel-title">{s.personas.title}</h2>
      <p class="panel-sub">{s.personas.subtitle}</p>
    </div>
    <div class="header-actions">
      <button class="btn" onclick={() => void doImport()}>{s.personas.import}</button>
      <button
        class="btn"
        disabled={app.personas.length === 0}
        onclick={() => void doExport()}
      >
        {s.personas.export}
      </button>
      <button
        class="btn primary"
        class:on={showTemplates}
        aria-expanded={showTemplates}
        onclick={() => (showTemplates = !showTemplates)}
      >
        {s.personas.addCharacter}
      </button>
    </div>
  </div>

  {#if dataMessage}
    <p class="data-msg">{dataMessage}</p>
  {/if}

  {#if showTemplates}
    <section class="template-picker" aria-label={s.personas.newCharacter}>
      <div class="template-heading">
        <div>
          <strong>{s.personas.pickStartingPoint}</strong>
          <span>{s.personas.everythingEditable}</span>
        </div>
        <button
          class="template-close"
          aria-label={s.common.close}
          onclick={() => (showTemplates = false)}
        >✕</button>
      </div>
      <div class="template-grid">
        <button class="template-card blank" onclick={() => void addPersona()}>
          <span class="blank-avatar">+</span>
          <span>
            <strong>{s.personas.blankSheet}</strong>
            <small>{s.personas.createFreely}</small>
          </span>
        </button>
        {#each personaTemplates(app.settings.conversationLanguage) as template (template.id)}
          <button
            class="template-card"
            style={`--template-accent: ${template.accent}`}
            onclick={() => void addPersona(template)}
          >
            <img
              src={BUILTIN_AVATAR_IMAGES[template.portrait]}
              alt={s.personas.portraitOf(template.name)}
            />
            <span>
              <small>{s.personas.templateRoles[template.id]}</small>
              <strong>{template.name}</strong>
              <em>{template.description}</em>
            </span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <div class="me">
    <div>
      <label for="p-username">{s.personas.yourName}</label>
      <span class="hint">{s.personas.yourNameHint}</span>
    </div>
    <input
      id="p-username"
      bind:value={app.settings.userName}
      placeholder={app.pack.scene.userLabel}
      autocomplete="off"
      autocapitalize="words"
      spellcheck="false"
      onchange={() => void app.saveSettings()}
    />
    <div class="genders">
      {#each Object.entries(s.gender) as [value, label] (value)}
        <button class="gender" class:on={app.settings.userGender === value} onclick={() => {
          app.settings.userGender = value as Gender;
          void app.saveSettings();
        }}>{label}</button>
      {/each}
    </div>
  </div>

  {#if app.personas.length > 0}
    <div class="persona-workspace">
      <aside class="persona-list" aria-label={s.personas.characterList}>
        {#each app.personas as p (p.id)}
          <button
            class="persona-list-item"
            class:selected={selectedId === p.id}
            style={`--persona-accent: ${personaAccent(p.id)}`}
            onclick={() => {
              selectedId = p.id;
              showAdvanced = false;
              showAvatarPicker = false;
            }}
          >
            <img src={portraitOf(p)} alt="" />
            <span>
              <strong>{p.name}</strong>
              <small>{p.description ?? s.personas.noDescription}</small>
            </span>
          </button>
        {/each}
      </aside>

      {#if selectedPersona}
        {@const p = selectedPersona}
        <article class="card" style={`--persona-accent: ${personaAccent(p.id)}`}>
      <div class="card-head">
        <img class="portrait" src={portraitOf(p)} alt={s.personas.portraitOf(p.name)} />
        <div class="identity">
          <input
            id="name-{p.id}"
            class="name-input"
            value={p.name}
            placeholder={s.personas.namePlaceholder}
            onchange={(e) => void patch(p, { name: e.currentTarget.value.trim() || p.name })}
          />
          <input
            class="desc-input"
            value={p.description ?? ""}
            placeholder={s.personas.descriptionPlaceholder}
            onchange={(e) =>
              void patch(p, { description: e.currentTarget.value.trim() || null })}
          />
          <div class="genders">
            {#each Object.entries(s.gender) as [value, label] (value)}
              <button
                class="gender"
                class:on={p.gender === value}
                title={s.personas.genderTitle}
                onclick={() => void patch(p, { gender: value as Gender })}
              >
                {label}
              </button>
            {/each}
          </div>
        </div>
        <div class="card-actions">
          <button
            class:active-action={showAvatarPicker}
            onclick={() => {
              showAvatarPicker = !showAvatarPicker;
              if (showAvatarPicker) showAdvanced = false;
            }}
            title={s.personas.showAllPortraits}
          >
            {s.personas.choosePortrait}
          </button>
          <button
            onclick={() => {
              showAdvanced = !showAdvanced;
              if (showAdvanced) showAvatarPicker = false;
            }}
            title={s.personas.responseStyleTitle}
          >
            {showAdvanced ? s.personas.closeSettings : s.personas.responseStyle}
          </button>
          <button class="danger-link" onclick={() => void askDelete(p)}>
            {s.common.delete}
          </button>
        </div>
      </div>

      {#if showAvatarPicker}
        <section class="avatar-picker" aria-label={s.personas.choosePortrait}>
          <div class="avatar-picker-head">
            <div>
              <strong>{s.personas.choosePortrait}</strong>
              <span>
                {s.personas.portraitCount(
                  builtinAvatarIndicesForGender(p.gender).length,
                  s.gender[p.gender],
                )}
              </span>
            </div>
            <button aria-label={s.common.close} onclick={() => (showAvatarPicker = false)}>✕</button>
          </div>
          <div class="avatar-grid">
            {#each builtinAvatarIndicesForGender(p.gender) as portrait (portrait)}
              <button
                class="avatar-choice"
                class:selected={portraitIndexOf(p) === portrait}
                aria-label={s.personas.choosePortraitNumber(portrait + 1)}
                aria-pressed={portraitIndexOf(p) === portrait}
                onclick={() => void choosePortrait(p, portrait)}
              >
                <img src={BUILTIN_AVATAR_IMAGES[portrait]} alt="" />
                {#if portraitIndexOf(p) === portrait}<span>✓</span>{/if}
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <textarea
        class="character"
        rows="4"
        value={p.systemPrompt}
        placeholder={s.personas.characterPlaceholder}
        onchange={(e) =>
          void patch(p, { systemPrompt: e.currentTarget.value.trim() || p.systemPrompt })}
      ></textarea>

      {#if showAdvanced}
        <div class="advanced">
          <fieldset>
            <legend>{s.personas.responseTone}</legend>
            <div class="choice-row">
              {#each RESPONSE_STYLES as option (option.id)}
                <button
                  class="setting-choice"
                  class:selected={closestTemperature(p.temperature) === option.temperature}
                  onclick={() => void patch(p, { temperature: option.temperature })}
                >
                  <strong>{s.personas.styles[option.id].label}</strong>
                  <small>{s.personas.styles[option.id].description}</small>
                </button>
              {/each}
            </div>
          </fieldset>

          <fieldset>
            <legend>{s.personas.responseLengthTitle}</legend>
            <div class="choice-row">
              {#each RESPONSE_LENGTH_PRESETS as option (option.id)}
                <button
                  class="setting-choice"
                  class:selected={responseLengthPreset(p.maxOutputTokens).id === option.id}
                  onclick={() => void patch(p, { maxOutputTokens: option.maxTokens })}
                >
                  <strong>{s.responseLength[option.id].label}</strong>
                  <small>{s.responseLength[option.id].description}</small>
                </button>
              {/each}
            </div>
            <p class="setting-explanation">{s.personas.lengthExplanation}</p>
          </fieldset>

          <label class="traits-field">
            <span>
              <strong>{s.personas.stableTraits}</strong>
              <small>{s.personas.stableTraitsHint}</small>
            </span>
            <input
              value={p.stableTraits.join(", ")}
              placeholder={s.personas.traitsPlaceholder}
              onchange={(e) =>
                void patch(p, {
                  stableTraits: e.currentTarget.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })}
            />
          </label>
        </div>
      {/if}
        </article>
      {/if}
    </div>
  {:else}
    <p class="empty">{s.personas.noCharacters}</p>
  {/if}
</div>

{#if confirmDelete}
  <div class="modal-backdrop" role="presentation" {...backdrop(() => (confirmDelete = null))}>
    <div class="modal" role="dialog" tabindex="-1">
      <h3>{s.personas.deleteTitle(confirmDelete.persona.name)}</h3>
      <p>
        {#if confirmDelete.solo > 0}
          {s.personas.deleteSolo(confirmDelete.solo)}
        {/if}
        {#if confirmDelete.shared > 0}
          {s.personas.deleteShared(confirmDelete.shared)}
        {/if}
        {s.personas.deleteEmotion}
      </p>
      <div class="modal-actions">
        <button class="btn" onclick={() => (confirmDelete = null)}>{s.common.cancel}</button>
        <button class="btn danger" onclick={() => void doDelete()}>{s.common.delete}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .view {
    flex: 1;
    overflow-y: auto;
    padding: 28px 36px 48px;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .data-msg {
    font-size: 12.5px;
    color: var(--accent);
    margin: 0 0 14px;
  }

  .template-picker {
    margin: 0 0 18px;
    padding: 14px;
    border: 1px solid var(--template-panel-border);
    border-radius: var(--radius);
    background: var(--template-panel-bg);
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.24);
  }

  .template-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .template-heading > div {
    display: flex;
    flex-direction: column;
  }

  .template-heading strong {
    font-family: var(--font-stage);
    font-size: 16px;
  }

  .template-heading span {
    color: var(--text-faint);
    font-size: 12px;
  }

  .template-close {
    color: var(--text-faint);
    padding: 2px 5px;
  }

  .template-close:hover {
    color: var(--text);
  }

  .template-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(125px, 1fr));
    gap: 9px;
  }

  .template-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    min-height: 76px;
    padding: 9px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--template-accent, var(--border)) 42%, var(--border));
    border-radius: 11px;
    background: color-mix(in srgb, var(--template-accent, var(--bg-panel)) 9%, var(--bg-panel));
    color: var(--text);
    text-align: left;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }

  .template-card::after {
    content: "";
    position: absolute;
    inset: auto -22px -38px auto;
    width: 82px;
    height: 82px;
    border-radius: 50%;
    background: var(--template-accent, transparent);
    opacity: 0.1;
  }

  .template-card:hover {
    z-index: 1;
    transform: translateY(-2px);
    border-color: var(--template-accent, var(--accent));
    background: color-mix(in srgb, var(--template-accent, var(--accent)) 15%, var(--bg-panel));
  }

  .template-card img,
  .blank-avatar {
    width: 48px;
    height: 48px;
    flex: 0 0 48px;
    border-radius: 50%;
  }

  .template-card img {
    object-fit: cover;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--template-accent) 64%, transparent);
  }

  .template-card > span:not(.blank-avatar) {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .template-card strong {
    font-size: 13px;
    line-height: 1.3;
  }

  .template-card small {
    color: var(--template-accent, var(--accent));
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1.35;
    text-transform: uppercase;
  }

  .template-card em {
    display: -webkit-box;
    overflow: hidden;
    color: var(--text-faint);
    font-size: 10px;
    font-style: normal;
    line-height: 1.3;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .template-card.blank {
    --template-accent: var(--accent);
  }

  .blank-avatar {
    display: grid;
    place-items: center;
    border: 1px dashed var(--accent-soft);
    color: var(--accent);
    font-family: var(--font-stage);
    font-size: 28px;
  }

  .me {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(180px, 280px) auto;
    align-items: center;
    gap: 12px;
    background: var(--bg-panel);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    padding: 14px 16px;
    margin-bottom: 18px;
  }

  .me label {
    display: block;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-soft);
  }

  .me input {
    width: 100%;
  }

  .hint {
    font-size: 12px;
    color: var(--text-faint);
    line-height: 1.45;
  }

  .card {
    background: var(--bg-panel);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    padding: 14px 16px;
    min-width: 0;
  }

  .persona-workspace {
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr);
    align-items: start;
    gap: 14px;
  }

  .persona-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--bg-sidebar);
  }

  .persona-list-item {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    padding: 8px;
    border-radius: 9px;
    color: var(--text-soft);
    text-align: left;
  }

  .persona-list-item:hover {
    background: var(--bg-hover);
  }

  .persona-list-item.selected {
    color: var(--text);
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--persona-accent) 18%, var(--bg-active)),
      var(--bg-active)
    );
    box-shadow: inset 3px 0 var(--persona-accent);
  }

  .persona-list-item img {
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    border-radius: 50%;
    object-fit: cover;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--persona-accent) 58%, transparent);
  }

  .persona-list-item > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .persona-list-item strong,
  .persona-list-item small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .persona-list-item strong {
    font-size: 13px;
  }

  .persona-list-item small {
    color: var(--text-faint);
    font-size: 10.5px;
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;
  }

  .portrait {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    flex-shrink: 0;
    object-fit: cover;
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--persona-accent) 68%, transparent),
      0 7px 18px rgba(0, 0, 0, 0.28);
  }

  .identity {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  /* Champs sans chrome : on lit une fiche, on ne remplit pas un formulaire. */
  .name-input,
  .desc-input,
  .character {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 5px 8px;
    width: 100%;
  }

  .name-input {
    font-family: var(--font-stage);
    font-size: 18px;
    font-weight: 600;
  }

  .desc-input {
    font-size: 13px;
    color: var(--text-soft);
  }

  .character {
    font-family: var(--font-stage);
    font-size: 14.5px;
    line-height: 1.6;
    resize: vertical;
  }

  .name-input:hover,
  .desc-input:hover,
  .character:hover {
    border-color: var(--border-soft);
  }

  .name-input:focus,
  .desc-input:focus,
  .character:focus {
    background: var(--input-bg);
    border-color: var(--accent-soft);
  }

  .genders {
    display: flex;
    gap: 5px;
    margin-top: 2px;
  }

  .gender {
    font-size: 11.5px;
    padding: 2px 9px;
    border-radius: 999px;
    border: 1px solid var(--border-soft);
    color: var(--text-faint);
  }

  .gender:hover {
    color: var(--text-soft);
  }

  .gender.on {
    background: var(--bg-active);
    border-color: var(--accent-soft);
    color: var(--text);
  }

  .card-actions {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
    padding-top: 6px;
  }

  .card-actions button {
    font-size: 12px;
    color: var(--text-faint);
  }

  .card-actions button:hover {
    color: var(--accent);
  }

  .card-actions .active-action {
    color: var(--accent);
  }

  .danger-link:hover {
    color: var(--danger) !important;
  }

  .avatar-picker {
    margin: 4px 0 14px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--persona-accent) 36%, var(--border));
    border-radius: 12px;
    background:
      radial-gradient(
        circle at 95% 0%,
        color-mix(in srgb, var(--persona-accent) 14%, transparent),
        transparent 38%
      ),
      #161119;
  }

  .avatar-picker-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .avatar-picker-head > div {
    display: flex;
    flex-direction: column;
  }

  .avatar-picker-head strong {
    font-family: var(--font-stage);
    font-size: 15px;
  }

  .avatar-picker-head span,
  .avatar-picker-head button {
    color: var(--text-faint);
    font-size: 11px;
  }

  .avatar-picker-head button:hover {
    color: var(--text);
  }

  .avatar-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
    gap: 8px;
  }

  .avatar-choice {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: 12px;
    transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
  }

  .avatar-choice:hover {
    transform: translateY(-2px);
    border-color: var(--border);
    background: var(--bg-hover);
  }

  .avatar-choice.selected {
    border-color: var(--persona-accent);
    background: color-mix(in srgb, var(--persona-accent) 14%, var(--bg-active));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--persona-accent) 40%, transparent);
  }

  .avatar-choice img {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar-choice > span {
    position: absolute;
    right: 1px;
    bottom: 1px;
    display: grid;
    width: 18px;
    height: 18px;
    place-items: center;
    border: 2px solid var(--bg-panel);
    border-radius: 50%;
    background: var(--persona-accent);
    color: var(--accent-ink);
    font-size: 10px;
    font-weight: 800;
  }

  .advanced {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-soft);
  }

  .advanced fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .advanced legend {
    margin-bottom: 7px;
    color: var(--text-soft);
    font-size: 12px;
    font-weight: 650;
  }

  .choice-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }

  .setting-choice {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    padding: 8px 10px;
    border: 1px solid var(--border-soft);
    border-radius: 9px;
    background: var(--choice-bg);
    text-align: left;
  }

  .setting-choice:hover {
    border-color: var(--border);
    background: var(--bg-hover);
  }

  .setting-choice.selected {
    border-color: color-mix(in srgb, var(--persona-accent) 65%, var(--border));
    background: color-mix(in srgb, var(--persona-accent) 12%, var(--bg-active));
    box-shadow: inset 3px 0 var(--persona-accent);
  }

  .setting-choice strong {
    color: var(--text);
    font-size: 12px;
  }

  .setting-choice small {
    color: var(--text-faint);
    font-size: 10.5px;
    line-height: 1.35;
  }

  .setting-explanation {
    margin: 7px 1px 0;
    color: var(--text-faint);
    font-size: 10.5px;
  }

  .traits-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding-top: 2px;
  }

  .traits-field > span {
    display: flex;
    flex: 1;
    flex-direction: column;
  }

  .traits-field strong {
    color: var(--text-soft);
    font-size: 12px;
  }

  .traits-field small {
    color: var(--text-faint);
    font-size: 10.5px;
  }

  .traits-field input {
    flex: 1;
    min-width: 0;
    max-width: 420px;
    font-size: 12.5px;
    padding: 6px 9px;
  }

  .empty {
    color: var(--text-faint);
    text-align: center;
    margin-top: 40px;
  }

  @media (max-width: 860px) {
    .view-header {
      flex-direction: column;
    }

    .template-grid {
      grid-template-columns: repeat(2, minmax(150px, 1fr));
    }

    .me {
      grid-template-columns: 1fr;
    }

    .persona-workspace {
      grid-template-columns: 1fr;
    }

    .persona-list {
      flex-direction: row;
      overflow-x: auto;
    }

    .persona-list-item {
      min-width: 190px;
    }

    .card-head {
      flex-wrap: wrap;
    }

    .card-actions {
      width: 100%;
      padding-left: 64px;
    }
  }

  @media (max-width: 560px) {
    .template-grid {
      grid-template-columns: 1fr;
    }

    .choice-row {
      grid-template-columns: 1fr;
    }

    .traits-field {
      align-items: stretch;
      flex-direction: column;
    }

    .traits-field input {
      max-width: none;
    }
  }
</style>
