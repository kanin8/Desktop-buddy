const toggleBtn = document.getElementById('toggleBtn');
const colorGrid = document.getElementById('colorGrid');
const colorCube = document.getElementById('colorCube');
const personalityInputs = document.querySelectorAll('input[name="personality"]');
const statusBar = document.getElementById('statusBar');


let currentState = 'running';
let currentPersonality = 'balanced';
let currentColor = 'black';

async function syncState() {
  const state = await window.electronAPI.getAvatarState();
  currentState = state;
  updateUI();
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
