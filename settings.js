// Settings window: buddy and to-do switches, current activity, quit, and
// the AI configuration shared by every AI feature.
const avatarToggle = document.getElementById('avatarToggle');
const todoToggle = document.getElementById('todoToggle');
const activityStatus = document.getElementById('activityStatus');
const quitBtn = document.getElementById('quitBtn');

// AI settings. The API key is write-only: the main process reports whether a
// key exists, but never sends the stored value back here.
const aiToggle = document.getElementById('aiToggle');
const aiBadge = document.getElementById('aiBadge');
const aiFields = document.getElementById('aiFields');
const aiProvider = document.getElementById('aiProvider');
const aiBaseUrlRow = document.getElementById('aiBaseUrlRow');
const aiBaseUrl = document.getElementById('aiBaseUrl');
const aiModel = document.getElementById('aiModel');
const aiModelHints = document.getElementById('aiModelHints');
const aiApiKeyRow = document.getElementById('aiApiKeyRow');
const aiApiKey = document.getElementById('aiApiKey');
const aiKeyHint = document.getElementById('aiKeyHint');
const aiStatus = document.getElementById('aiStatus');

// --- BUDDY ---

// Sets the switch from the main process's state ('running' or 'stopped').
function renderAvatarState(state) {
  avatarToggle.checked = state === 'running';
}

async function syncAvatarState() {
  renderAvatarState(await window.electronAPI.getAvatarState());
}

// The buddy can also be shown or hidden from the tray, the shortcut or a
// snooze, so the main process pushes the real state after every change.
window.electronAPI.onAvatarStateChanged(renderAvatarState);

avatarToggle.addEventListener('change', () => {
  window.electronAPI.toggleRunning();
});

// --- CURRENT ACTIVITY ---

// Categories the badge has a colour for; anything else shows as uncategorized.
const KNOWN_CATEGORIES = ['productive', 'leisure', 'uncategorized'];

// Shows the category as a coloured badge next to the app or website name.
// Built with textContent, not innerHTML: for browser tabs `app` comes from
// the page title, which any website controls.
function renderActivity(activity) {
  if (!activity) {
    activityStatus.textContent = 'Detecting…';
    return;
  }

  const category = KNOWN_CATEGORIES.includes(activity.category) ? activity.category : 'uncategorized';
  const badge = document.createElement('span');
  badge.className = 'badge is-' + category;
  badge.textContent = category.charAt(0).toUpperCase() + category.slice(1);

  const app = document.createElement('span');
  app.className = 'activity-app';
  app.textContent = activity.app;

  activityStatus.replaceChildren(badge, app);
}

async function syncActivity() {
  renderActivity(await window.electronAPI.getActivity());
}

window.electronAPI.onActivityUpdate(renderActivity);

// --- QUIT ---

quitBtn.addEventListener('click', () => {
  window.electronAPI.quitApp();
});

// --- TO-DO LIST ---

// Syncs the to-do list checkbox with the actual panel state in the main
// process. The panel can also be toggled from the tray menu, so the checkbox
// must reflect reality rather than just what was last clicked here.
async function syncTodoState() {
  const todoState = await window.electronAPI.getTodoListState();
  todoToggle.checked = todoState === 'running';
}

// The main process reports the real state after every change, including
// tray-menu toggles this window never initiated.
window.electronAPI.onTodoListStateChanged((todoState) => {
  todoToggle.checked = todoState === 'running';
});

todoToggle.addEventListener('change', () => {
  window.electronAPI.toggleTodoList();
  // Re-read rather than trusting the click: the toggle is asynchronous and a
  // stale panel state would otherwise leave the checkbox lying.
  syncTodoState();
});

// --- APPEARANCE ---
// Theme and message opacity. Both save as soon as they change; the main
// process applies them and pushes the result to every window.
const themeSelect = document.getElementById('themeSelect');
const opacityRange = document.getElementById('opacityRange');
const opacityValue = document.getElementById('opacityValue');

// Shows an opacity (0.7–1) as a whole percentage, e.g. "90%".
function formatOpacity(opacity) {
  return Math.round(opacity * 100) + '%';
}

// Redraws the section from the main process's settings, including the
// slider limits (they live in config.js, which this window can't read).
function renderAppearance(appearance) {
  const { min, max, step } = appearance.surfaceOpacityRange;
  themeSelect.value = appearance.theme;
  opacityRange.min = min;
  opacityRange.max = max;
  opacityRange.step = step;
  opacityRange.value = appearance.surfaceOpacity;
  opacityValue.textContent = formatOpacity(appearance.surfaceOpacity);
}

async function syncAppearance() {
  renderAppearance(await window.electronAPI.getAppearance());
}

window.electronAPI.onAppearanceChanged(renderAppearance);

themeSelect.addEventListener('change', () => {
  window.electronAPI.setAppearance({ theme: themeSelect.value });
});

// 'input' rather than 'change', so the buddy's messages update while the
// slider is still being dragged.
opacityRange.addEventListener('input', () => {
  opacityValue.textContent = formatOpacity(Number(opacityRange.value));
  window.electronAPI.setAppearance({ surfaceOpacity: Number(opacityRange.value) });
});

// --- AI ---
// One section configures every AI feature. Fields save as soon as they change.

// Latest settings from the main process, so a provider switch can look up its preset.
let aiSettings = null;

// Fills the provider dropdown once from the presets in toDoList/config.js.
function renderProviderOptions(providers) {
  if (aiProvider.options.length) return;
  Object.keys(providers).forEach((id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = providers[id].label;
    aiProvider.appendChild(option);
  });
}

// Shows the model suggestions and placeholders for the selected provider.
// Claude's SDK has a fixed address, so its endpoint row is hidden.
function renderProviderHints(preset) {
  aiBaseUrlRow.hidden = !!preset.usesClaudeSdk;
  aiBaseUrl.placeholder = preset.baseUrl || 'https://your-endpoint/v1';
  aiModel.placeholder = preset.model || 'model name';
  aiModelHints.innerHTML = '';
  preset.modelHints.forEach((model) => {
    const option = document.createElement('option');
    option.value = model;
    aiModelHints.appendChild(option);
  });
}

function renderKeyHint(ai) {
  aiApiKeyRow.hidden = !ai.needsApiKey;
  if (!ai.needsApiKey) {
    aiKeyHint.textContent = 'No API key needed: Ollama runs on this computer.';
  } else if (ai.keyFromEnv) {
    aiKeyHint.textContent = ai.keyEnvVar + ' is set, so that key is used.';
  } else if (ai.hasApiKey) {
    aiKeyHint.textContent = 'A key is saved. Type a new one to replace it.';
  } else if (ai.providers[ai.provider].usesClaudeSdk) {
    aiKeyHint.textContent = 'Create a Claude key at console.anthropic.com. It is stored in your user data folder, never in the repo.';
  } else {
    aiKeyHint.textContent = 'The key is stored in your user data folder, never in the repo.';
  }
}

// Short badge next to "Enable AI", plus a line under the fields saying
// what is still missing (or which model is in use). While AI is off the
// switch already says so, so the badge is left empty (and hidden).
function renderAiStatus(ai) {
  if (!ai.enabled) {
    aiBadge.textContent = '';
    aiStatus.textContent = '';
  } else if (!ai.configured) {
    aiBadge.textContent = 'Needs setup';
    aiBadge.className = 'badge is-needs-setup';
    aiStatus.textContent = ai.needsApiKey ? 'Add an API key to start.' : 'Fill in the endpoint and model.';
  } else {
    aiBadge.textContent = 'Ready';
    aiBadge.className = 'badge is-ready';
    aiStatus.textContent = 'Using ' + ai.model + '.';
  }
}

// Redraws the whole section from the main process's view of the settings.
function renderAiSettings(ai) {
  aiSettings = ai;
  renderProviderOptions(ai.providers);
  aiToggle.checked = ai.enabled;
  // The fields only matter once AI is on, so they stay out of the way until then.
  aiFields.hidden = !ai.enabled;
  aiProvider.value = ai.provider;
  aiBaseUrl.value = ai.baseUrl;
  aiModel.value = ai.model;
  // Clear the field so a stored key is never rendered back into the DOM.
  aiApiKey.value = '';
  aiApiKey.placeholder = ai.hasApiKey ? '•••••••• (saved)' : 'Paste your API key';
  renderProviderHints(ai.providers[ai.provider]);
  renderKeyHint(ai);
  renderAiStatus(ai);
}

async function syncAiSettings() {
  renderAiSettings(await window.electronAPI.getAISettings());
}

// Sends a partial update; the main process ignores a blank key so it cannot
// wipe a saved one.
async function pushAiSettings(patch) {
  renderAiSettings(await window.electronAPI.setAISettings(patch));
}

aiToggle.addEventListener('change', () => pushAiSettings({ enabled: aiToggle.checked }));
aiBaseUrl.addEventListener('change', () => pushAiSettings({ baseUrl: aiBaseUrl.value }));
aiModel.addEventListener('change', () => pushAiSettings({ model: aiModel.value }));
aiApiKey.addEventListener('change', () => pushAiSettings({ apiKey: aiApiKey.value }));

// Switching provider loads that provider's default endpoint and model, so the
// user only has to add a key. "Other" keeps the current values to edit.
aiProvider.addEventListener('change', () => {
  const preset = aiSettings.providers[aiProvider.value];
  pushAiSettings({
    provider: aiProvider.value,
    baseUrl: preset.baseUrl,
    model: preset.model,
  });
});

// Initial UI state
syncAvatarState();
syncTodoState();
syncAiSettings();
syncActivity();
syncAppearance();
