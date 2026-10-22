const currentAppEl = document.getElementById('currentApp');
const currentDomainEl = document.getElementById('currentDomain');
const currentCategoryEl = document.getElementById('currentCategory');
const eventListEl = document.getElementById('eventList');

let currentActivityId = '';

function updateUI(event) {
  currentAppEl.textContent = event.app;
  currentDomainEl.textContent = event.domain || '-';
  currentCategoryEl.textContent = event.category;

  // Update badge class
  currentCategoryEl.className = 'category-badge ' + `cat-${event.category}`;

  // Add to history
  const li = document.createElement('li');
  li.className = 'event-item';
  const time = new Date(event.startedAt).toLocaleTimeString();
  li.innerHTML = `
    <div class="event-info">
      <strong>${event.app}</strong>
      <span>${event.domain || event.title}</span>
      <span class="event-time">${time}</span>
    </div>
    <div class="category-badge cat-${event.category}">${event.category}</div>
  `;

  eventListEl.prepend(li);
  if (eventListEl.children.length > 20) {
    eventListEl.lastElementChild.remove();
  }

  // Track ID for overrides (use app + domain)
  currentActivityId = event.domain || event.app;
}

window.updateCat = async (category) => {
  if (!currentActivityId) return;
  await window.electronAPI.updateActivityCategory(currentActivityId, category);
};

// Initial fetch
window.electronAPI.getActivity().then(activity => {
  if (activity) updateUI(activity);
});

// Listen for updates
window.electronAPI.onActivityUpdate((event) => {
  updateUI(event);
});
