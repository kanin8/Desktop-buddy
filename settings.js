const toggleBtn = document.getElementById('toggleBtn');
const statusBar = document.getElementById('statusBar');
const todoToggle = document.getElementById('todoToggle');


let currentState = 'running';

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

todoToggle.addEventListener('change', () => {
  window.electronAPI.toggleTodoList();
});

// Initial UI state
syncState();
syncTodoState();
updateUI();
