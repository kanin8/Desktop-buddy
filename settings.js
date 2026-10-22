const toggleBtn = document.getElementById('toggleBtn');
const colorGrid = document.getElementById('colorGrid');
const colorCube = document.getElementById('colorCube');
const personalityInputs = document.querySelectorAll('input[name="personality"]');
const statusBar = document.getElementById('statusBar');

// AI Settings elements
const aiProvider = document.getElementById('aiProvider');
const aiApiKey = document.getElementById('aiApiKey');
const aiModel = document.getElementById('aiModel');
const aiEndpoint = document.getElementById('aiEndpoint');
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

// Initial UI state
syncState();
updateUI();

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

// Listen for activity updates in real-time
window.electronAPI.onActivityUpdate((event) => {
  currentActivity = event;
  updateActivityUI();
});
