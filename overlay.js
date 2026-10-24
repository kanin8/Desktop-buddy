// Overlay renderer: shows the frog (bottom-right, or where it was dragged),
// plays its sprite animations, shows speech bubbles, runs the hover-to-chat
// interaction for the AI task breakdown, and decides when the overlay should
// let mouse clicks through to the desktop.

const avatar = document.getElementById('avatar');
const bubble = document.getElementById('speech-bubble');
const hoverIndicator = document.getElementById('hover-indicator');
const bubbleOption = document.getElementById('bubble-option');
const chatPanel = document.getElementById('chat-panel');
const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatClose = document.getElementById('chat-close');

// Plays the sprite sheet onto the child element; #avatar itself stays the
// invisible box the frog is centred in.
const spriteElement = document.getElementById('avatar-sprite');
const spriteAnimator = new SpriteAnimator(spriteElement);

// What the user actually sees of the frog. Hover, dragging and placement use
// these instead of the larger, empty #avatar box.
const visibleParts = [spriteElement, hoverIndicator];

// The animation shown while the frog is at rest.
const DEFAULT_IMAGE_ANIMATION = 'idle';

// One-shot reaction played on click; hands back to the idle loop when it ends.
const CLICK_ANIMATION = 'standingClicked';

// Gap between the top of the frog and the speech bubble, and between the
// bubble and the screen edge.
const BUBBLE_GAP = 12;

// How far the bubble's tail must stay from the bubble's sides, so it never
// lands on a rounded corner (--radius is 16px).
const TAIL_EDGE_INSET = 24;

// True while the frog is being dragged (see controls/drag.js).
let isDragging = false;

// Keeps the speech bubble just above the frog, pulled left if it would
// otherwise run off the right edge of the screen, with its tail above the
// middle of the frog.
function positionBubble() {
  const frog = spriteElement.getBoundingClientRect();
  const maxLeft = window.innerWidth - bubble.offsetWidth - BUBBLE_GAP;
  const left = Math.max(BUBBLE_GAP, Math.min(frog.left, maxLeft));
  bubble.style.left = left + 'px';
  bubble.style.top = (frog.top - bubble.offsetHeight - BUBBLE_GAP) + 'px';

  const frogCentre = frog.left + frog.width / 2 - left;
  const tailX = Math.max(TAIL_EDGE_INSET, Math.min(frogCentre, bubble.offsetWidth - TAIL_EDGE_INSET));
  bubble.style.setProperty('--bubble-tail-x', tailX + 'px');
}

// Keeps the "Ask the buddy" option just above the frog's head, on screen.
function positionOption() {
  const frog = spriteElement.getBoundingClientRect();
  const maxLeft = window.innerWidth - bubbleOption.offsetWidth - BUBBLE_GAP;
  bubbleOption.style.left = Math.max(BUBBLE_GAP, Math.min(frog.left, maxLeft)) + 'px';
  bubbleOption.style.top = (frog.top - bubbleOption.offsetHeight - BUBBLE_GAP) + 'px';
}

// Keeps the chat panel above the frog, flipping below it when there is no
// room above, and clamped to the screen.
function positionChat() {
  const frog = spriteElement.getBoundingClientRect();
  const margin = getScreenMargin();
  const panelH = chatPanel.offsetHeight || 0;
  const panelW = chatPanel.offsetWidth || 0;
  const above = frog.top - panelH - BUBBLE_GAP;
  const below = frog.bottom + BUBBLE_GAP;
  const top = above < margin ? Math.min(below, window.innerHeight - panelH - margin) : above;
  const left = Math.max(margin, Math.min(frog.left, window.innerWidth - panelW - margin));

  chatPanel.style.left = left + 'px';
  chatPanel.style.top = top + 'px';
}

// Runs every frame: steps the sprite animation and keeps everything attached
// to the frog in place. Hover is not re-checked here: the frog only moves
// when dragged, and pointer moves already re-check it. Re-checking every
// frame would keep restarting the option's hide timer so it never hides.
function update() {
  spriteAnimator.update(performance.now());
  positionBubble();
  positionOption();
  positionChat();
  requestAnimationFrame(update);
}

// --- MESSAGE QUEUE SYSTEM ---
const messageQueue = [];
let isSpeaking = false;

async function processQueue() {
  if (isSpeaking) return;
  isSpeaking = true;

  while (messageQueue.length > 0) {
    const text = messageQueue.shift();
    bubble.innerText = text;
    bubble.style.display = 'block';
    await new Promise(resolve => setTimeout(resolve, 4000));
    bubble.style.display = 'none';
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  isSpeaking = false;
}

window.electronAPI.speak((text) => {
  messageQueue.push(text);
  processQueue();
});

window.electronAPI.setScreenGrayscale((enabled) => {
  document.body.style.backgroundColor = enabled ? 'rgba(0,0,0,0.4)' : 'transparent';
  avatar.style.filter = enabled ? 'grayscale(100%)' : 'none';
});

// The elements the pointer should actually be tested against, so hover and
// clicks land on the visible frog (or its indicator) rather than on the empty
// corners of its box.
function getHitTargets() {
  // Before the sheet has loaded the sprite has no size, so fall back to the
  // full box rather than leaving the avatar briefly unclickable.
  return spriteElement.offsetWidth > 0 ? visibleParts : [avatar];
}

// True when the point is over any visible part of the frog.
function isPointerOverFrog(x, y) {
  return getHitTargets().some((element) => rectsOverlap(x, y, element.getBoundingClientRect()));
}

// The smallest rectangle around the visible frog.
function getFrogRect() {
  const rects = getHitTargets().map((element) => element.getBoundingClientRect());
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

// Reacts to a click on the frog by playing the reaction animation once, then
// returning to the idle loop. Clicking again mid-reaction restarts it from the
// top, which feels more responsive than queueing or ignoring it.
// The listener sits on #avatar because #avatar-sprite is pointer-events: none.
avatar.addEventListener('click', () => {
  spriteAnimator.play(CLICK_ANIMATION, {
    onComplete: () => spriteAnimator.play(DEFAULT_IMAGE_ANIMATION),
  });
});

// --- AVATAR INTERACTION ---
// The overlay covers the whole screen and is click-through by default, so the
// only interactive region is the frog plus whatever is attached to it: the
// hover affordance, and the chat panel once it is open.
//
// Flow: hover the frog -> a clickable option appears -> click it -> the chat
// opens. Clicking the frog also reveals the option (not the chat), so the
// feature is reachable even when the pointer never triggers the hover.
// Everything else passes clicks through.
//
// The hover signal comes from the main process (see `onCursorMove`), not from
// DOM mousemove events. A click-through window only receives forwarded mouse
// moves on some platforms, so relying on them left this flow dead on Linux.

const isChatOpen = () => chatPanel.style.display === 'flex';
// Compared against 'flex' rather than "not none": the hidden state comes from
// the stylesheet, so a never-toggled element has an empty inline display and
// would otherwise look visible.
const isOptionVisible = () => bubbleOption.style.display === 'flex';

// The pointer needs a moment to travel from the frog up to the option, so the
// option is given a short grace period before it disappears.
const OPTION_GRACE_MS = 400;
let optionHideTimer = null;

function rectsOverlap(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// The option sits just above the frog's head. Without treating the strip
// between them as interactive, the pointer crosses dead space on its way up and
// the option vanishes before it can be clicked.
function isInBridge(x, y) {
  if (isChatOpen() || !isOptionVisible()) return false;
  const frogRect = getFrogRect();
  const optionRect = bubbleOption.getBoundingClientRect();
  if (!optionRect.height) return false;
  const left = Math.min(frogRect.left, optionRect.left);
  const right = Math.max(frogRect.right, optionRect.right);
  return x >= left && x <= right && y >= optionRect.bottom && y <= frogRect.top;
}

function isOverInteractiveArea(x, y) {
  if (isPointerOverFrog(x, y)) return true;
  if (isOptionVisible() && rectsOverlap(x, y, bubbleOption.getBoundingClientRect())) return true;
  if (isChatOpen() && rectsOverlap(x, y, chatPanel.getBoundingClientRect())) return true;
  return false;
}

function showOption() {
  if (optionHideTimer) { clearTimeout(optionHideTimer); optionHideTimer = null; }
  if (!isChatOpen() && !isOptionVisible()) bubbleOption.style.display = 'flex';
}

function hideOptionSoon() {
  if (optionHideTimer) clearTimeout(optionHideTimer);
  optionHideTimer = setTimeout(() => {
    optionHideTimer = null;
    if (!isChatOpen() && !isOverInteractiveArea(lastX, lastY)) bubbleOption.style.display = 'none';
  }, OPTION_GRACE_MS);
}

// Last known pointer position, so the grace timer can re-check where the pointer
// actually is by the time it fires.
let lastX = -1, lastY = -1;

// Single source of truth for "where is the pointer, and what should be shown".
// Both the polled cursor position and any forwarded DOM mousemove feed it, so
// the behaviour is identical whichever signal actually arrives.
function handlePointerAt(x, y) {
  lastX = x;
  lastY = y;

  // Mid-drag the overlay must keep catching the mouse: a fast drag can get
  // ahead of the frog, and turning click-through on then would drop it.
  if (isDragging) return;

  const over = isOverInteractiveArea(x, y) || isInBridge(x, y);
  // Keep the overlay interactive only while the pointer is over something the
  // user can actually click; everywhere else stays click-through. Only sent
  // here (not on every animation frame) so a still pointer does not spam IPC.
  window.electronAPI.setIgnoreMouse(!over);

  // Lights up the hover indicator under the frog.
  avatar.classList.toggle('is-hovered', isPointerOverFrog(x, y));

  reevaluateHover();
}

// Recomputes the hover affordance from the last known pointer position. Safe to
// call every frame: it only touches the option's visibility, never IPC.
function reevaluateHover() {
  if (isChatOpen() || isDragging) return;

  const over = isOverInteractiveArea(lastX, lastY) || isInBridge(lastX, lastY);
  const overFrog = isPointerOverFrog(lastX, lastY);

  if (over) {
    if (optionHideTimer) { clearTimeout(optionHideTimer); optionHideTimer = null; }
    if (overFrog) showOption();
  } else if (isOptionVisible()) {
    hideOptionSoon();
  }
}

// --- AI CHAT ---
// Stream listeners are registered once at startup rather than per message, so
// repeated exchanges cannot leak handlers. They read this state:

let activeReply = null;   // element showing the reply being streamed
let activePending = null; // "..." placeholder shown until the first token

function addChatLine(text, kind) {
  const el = document.createElement('div');
  el.className = 'chat-entry ' + kind;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

function removeChatLine(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// Called on the first token of a reply, so the placeholder is replaced exactly
// once no matter how the events interleave.
function ensureReplyElement() {
  if (activeReply) return activeReply;
  removeChatLine(activePending);
  activePending = null;
  activeReply = addChatLine('', 'buddy');
  return activeReply;
}

function endExchange() {
  removeChatLine(activePending);
  activePending = null;
  activeReply = null;
  chatSend.disabled = false;
}

function openChat() {
  bubbleOption.style.display = 'none';
  if (optionHideTimer) { clearTimeout(optionHideTimer); optionHideTimer = null; }
  chatPanel.style.display = 'flex';
  chatInput.focus();
  // The chat is open, so the overlay must stay interactive even before the
  // pointer moves again.
  window.electronAPI.setIgnoreMouse(false);
}

function closeChat() {
  window.electronAPI.cancelAI();
  endExchange();
  chatPanel.style.display = 'none';
  chatInput.value = '';
}

function submitChat(e) {
  e.preventDefault();
  const goal = chatInput.value.trim();
  if (!goal) return;

  addChatLine(goal, 'user');
  chatInput.value = '';
  chatSend.disabled = true;
  activePending = addChatLine('...', 'pending');

  window.electronAPI.askAI(goal);
}

window.electronAPI.onAIStream(() => { ensureReplyElement(); });

window.electronAPI.onAIStream((token) => {
  ensureReplyElement().textContent += token;
  chatLog.scrollTop = chatLog.scrollHeight;
});

window.electronAPI.onAIStreamEnd((reply) => {
  // A model can finish without emitting content; show what it did send.
  if (!activeReply && reply) addChatLine(reply, 'buddy');
  endExchange();
});

window.electronAPI.onAIError((message) => {
  addChatLine(message, 'error');
  endExchange();
});

window.electronAPI.onAITasksAdded((info) => {
  addChatLine(
    info.count > 0
      ? 'Added ' + info.count + ' subtask' + (info.count === 1 ? '' : 's') + ' to your list.'
      : 'Added it to your list.',
    'buddy'
  );
});

window.electronAPI.onAITasksFailed((message) => {
  addChatLine('Could not break that down: ' + message, 'error');
});

bubbleOption.addEventListener('click', openChat);
// Clicking the frog is a hover-independent way to reveal the affordance, not
// to open the chat directly, so an accidental click doesn't pop the chat open.
// The deliberate second click is on the option.
avatar.addEventListener('click', showOption);
chatClose.addEventListener('click', closeChat);
chatForm.addEventListener('submit', submitChat);

// Primary hover source: the cursor position polled by the main process. This is
// the only signal guaranteed to arrive on a click-through overlay. It arrives in
// screen coordinates, so it is shifted by the window's own position: on macOS
// the overlay starts below the menu bar, not at the top of the screen.
window.electronAPI.onCursorMove((pos) => handlePointerAt(pos.x - window.screenX, pos.y - window.screenY));

// Secondary source: forwarded DOM mouse moves, when the platform provides them.
// Feeding both through one handler keeps the interaction consistent everywhere.
window.addEventListener('mousemove', (e) => handlePointerAt(e.clientX, e.clientY));

// Escape closes the chat from anywhere in the overlay.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isChatOpen()) closeChat();
});

// Re-place on resize (e.g. a resolution change) so the frog can't end up off
// screen; it keeps its saved spot when that still fits.
window.addEventListener('resize', () => placeAvatar(avatar, visibleParts));

enableAvatarDrag(avatar, visibleParts, (dragging) => {
  isDragging = dragging;
});

// The sprite must have its size before placing, since placement measures it.
spriteAnimator.play(DEFAULT_IMAGE_ANIMATION);
placeAvatar(avatar, visibleParts);
update();
