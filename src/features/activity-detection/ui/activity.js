const currentAppEl = document.getElementById('currentApp');
const currentDomainEl = document.getElementById('currentDomain');
const currentCategoryEl = document.getElementById('currentCategory');
const eventListEl = document.getElementById('eventList');

let currentActivityId = '';

function textElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

// History row: activity name, domain (or window title) and time.
function eventInfoElement(event, time) {
  const info = textElement('div', 'event-info', '');
  info.append(
    textElement('strong', '', event.app),
    textElement('span', '', event.domain || event.title),
    textElement('span', 'event-time', time),
  );
  return info;
}

function categoryBadgeElement(category) {
  return textElement('div', 'category-badge cat-' + category, category);
}

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
  // Built with textContent, not innerHTML: app names and titles come from
  // window titles, which any website can set.
  li.append(eventInfoElement(event, time), categoryBadgeElement(event.category));

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
