// Settings window: start/stop, current activity, the to-do panel toggle,
// and the AI configuration shared by every AI feature.
const toggleBtn = document.getElementById('toggleBtn');
const statusBar = document.getElementById('statusBar');
const todoToggle = document.getElementById('todoToggle');

// AI settings. The API key is write-only: the main process reports whether a
// key exists, but never sends the stored value back here.
const aiToggle = document.getElementById('aiToggle');
const aiProvider = document.getElementById('aiProvider');
const aiBaseUrlRow = document.getElementById('aiBaseUrlRow');
const aiBaseUrl = document.getElementById('aiBaseUrl');
const aiModel = document.getElementById('aiModel');
const aiModelHints = document.getElementById('aiModelHints');
const aiApiKeyRow = document.getElementById('aiApiKeyRow');
const aiApiKey = document.getElementById('aiApiKey');
const aiKeyHint = document.getElementById('aiKeyHint');
const aiStatus = document.getElementById('aiStatus');


let currentState = 'running';

// Activity state
let currentActivity = null;

async function syncState() {
  const state = await window.electronAPI.getAvatarState();
  currentState = state;

  // Sync initial activity
  const activity = await window.electronAPI.getActivity();
  if (activity) {
    currentActivity = activity;
    updateActivityUI();
  }

  updateUI();
}

function updateActivityUI() {

  const el = document.getElementById('activityStatus');
  if (!currentActivity) {
    el.textContent = 'Detecting...';
    return;
  }

  const categoryColors = {
    productive: '#2c7a7b',
    leisure: '#b7791f',
    uncategorized: '#4a5568'
  };

  const color = categoryColors[currentActivity.category] || '#333';
  // Built with textContent, not innerHTML: for browser tabs `app` comes from
  // the page title, which any website controls.
  const categoryEl = document.createElement('span');
  categoryEl.style.color = color;
  categoryEl.style.fontWeight = 'bold';
  categoryEl.textContent = currentActivity.category.toUpperCase();
  el.replaceChildren(categoryEl, ': ' + currentActivity.app);
}

function updateUI() {
  // Update button
  if (currentState === 'running') {
    toggleBtn.textContent = 'STOP';
    toggleBtn.className = 'btn-stop';
  } else {
    toggleBtn.textContent = 'START';
    toggleBtn.className = 'btn-start';
  }

  // Update status text
  statusBar.textContent = `Status: ${currentState.charAt(0).toUpperCase() + currentState.slice(1)}`;
}

toggleBtn.addEventListener('click', () => {
  currentState = currentState === 'running' ? 'stopped' : 'running';
  window.electronAPI.toggleRunning();
  updateUI();
});

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

function renderAiStatus(ai) {
  if (!ai.enabled) {
    aiStatus.textContent = 'AI is off.';
  } else if (!ai.configured) {
    aiStatus.textContent = ai.needsApiKey ? 'Add an API key to start.' : 'Fill in the endpoint and model.';
  } else {
    aiStatus.textContent = 'Ready: ' + ai.model;
  }
}

// Redraws the whole section from the main process's view of the settings.
function renderAiSettings(ai) {
  aiSettings = ai;
  renderProviderOptions(ai.providers);
  aiToggle.checked = ai.enabled;
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
syncState();
syncTodoState();
syncAiSettings();
updateUI();

// Listen for activity updates in real-time
window.electronAPI.onActivityUpdate((event) => {
  currentActivity = event;
  updateActivityUI();
});
