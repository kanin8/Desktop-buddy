// Settings window: avatar appearance, movement style, the to-do panel toggle,
// and the AI task-breakdown configuration.
const toggleBtn = document.getElementById('toggleBtn');
const colorGrid = document.getElementById('colorGrid');
const colorCube = document.getElementById('colorCube');
const personalityInputs = document.querySelectorAll('input[name="personality"]');
const avatarTypeInputs = document.querySelectorAll('input[name="avatarType"]');
const statusBar = document.getElementById('statusBar');
const todoToggle = document.getElementById('todoToggle');

// AI task-breakdown settings. The API key is write-only: the main process
// reports whether a key exists, but never sends the stored value back here.
// Supports both provider selection (ollama/openai/etc) and model hints.
const aiProvider = document.getElementById('aiProvider');
const aiToggle = document.getElementById('aiToggle');
const aiBaseUrl = document.getElementById('aiBaseUrl');
const aiEndpoint = document.getElementById('aiEndpoint');
const aiModel = document.getElementById('aiModel');
const aiApiKey = document.getElementById('aiApiKey');
const aiModelHints = document.getElementById('aiModelHints');
const aiKeyHint = document.getElementById('aiKeyHint');
const aiStatus = document.getElementById('aiStatus');
const saveAiBtn = document.getElementById('saveAiBtn');


let currentState = 'running';
let currentPersonality = 'balanced';
let currentColor = 'black';

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

  // Sync AI config
  const aiConfig = await window.electronAPI.getAIConfig();
  if (aiConfig) {
    aiProvider.value = aiConfig.provider;
    aiApiKey.value = aiConfig.apiKey;
    aiModel.value = aiConfig.model;
    aiEndpoint.value = aiConfig.endpoint;
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
  el.innerHTML = `<span style="color: ${color}; font-weight: bold;">${currentActivity.category.toUpperCase()}</span>: ${currentActivity.app} ${currentActivity.domain ? `(${currentActivity.domain})` : ''}`;
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

  // Update cube color
  const faces = colorCube.querySelectorAll('.cube-face');
  faces.forEach(face => face.style.backgroundColor = currentColor);

  // Update status text
  statusBar.textContent = `Status: ${currentState.charAt(0).toUpperCase() + currentState.slice(1)} | Personality: ${currentPersonality.charAt(0).toUpperCase() + currentPersonality.slice(1)} | Color: ${currentColor}`;
}

toggleBtn.addEventListener('click', () => {
  currentState = currentState === 'running' ? 'stopped' : 'running';
  window.electronAPI.toggleRunning();
  updateUI();
});

colorGrid.addEventListener('click', (e) => {
  const swatch = e.target.closest('.swatch');
  if (!swatch) return;

  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
  swatch.classList.add('active');

  currentColor = swatch.dataset.color;
  window.electronAPI.setColor(currentColor);
  updateUI();
});

personalityInputs.forEach(input => {
  input.addEventListener('change', () => {
    currentPersonality = input.value;
    window.electronAPI.setPersonality(currentPersonality);
    updateUI();
  });
});

avatarTypeInputs.forEach(input => {
  input.addEventListener('change', () => {
    window.electronAPI.setAvatarType(input.value);
  });
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

// --- AI TASK BREAKDOWN ---

function renderAiStatus(ai) {
  if (ai.hasApiKey) {
    aiKeyHint.textContent = ai.keyEnvVar + ' is set, so that key is used.';
  } else {
    aiKeyHint.textContent = 'The key is stored in your user data folder, never in the repo.';
  }
  aiStatus.textContent = ai.configured
    ? 'Ready — ' + ai.model
    : 'Add an API key to enable AI breakdown.';
}

async function syncAiSettings() {
  const ai = await window.electronAPI.getAISettings();
  aiToggle.checked = ai.enabled;
  aiBaseUrl.value = ai.baseUrl;
  aiModel.value = ai.model;

  // Clear the field so a stored key is never rendered back into the DOM.
  aiApiKey.value = '';

  aiModelHints.innerHTML = '';
  ai.modelHints.forEach((model) => {
    const option = document.createElement('option');
    option.value = model;
    aiModelHints.appendChild(option);
  });
  renderAiStatus(ai);
}

// Sends only the fields the user actually edited; a blank key field is ignored
// by the main process so it cannot wipe an existing key.
function pushAiSettings() {
  const patch = { enabled: aiToggle.checked };
  if (aiBaseUrl.value.trim()) patch.baseUrl = aiBaseUrl.value.trim();
  if (aiModel.value.trim()) patch.model = aiModel.value.trim();
  if (aiApiKey.value.trim()) patch.apiKey = aiApiKey.value.trim();

  return window.electronAPI.setAISettings(patch).then((ai) => {
    aiApiKey.value = '';
    renderAiStatus(ai);
  });
}

// Auto-sync for quick toggles (enabled, baseUrl, model)
[aiToggle, aiBaseUrl, aiModel].forEach((el) => el.addEventListener('change', pushAiSettings));
aiApiKey.addEventListener('change', pushAiSettings);

// Manual save for provider/endpoint (requires explicit confirmation)
saveAiBtn.addEventListener('click', async () => {
  const config = {
    provider: aiProvider.value,
    apiKey: aiApiKey.value,
    model: aiModel.value,
    endpoint: aiEndpoint.value
  };

  const result = await window.electronAPI.saveAIConfig(config);
  if (result.success) {
    alert('AI Settings saved and synced!');
  } else {
    alert('Failed to save AI settings.');
  }
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
