// Avatar overlay: movement animation, the speech bubble, and the hover-to-chat
// interaction that drives the AI task-breakdown chat.
const avatar = document.getElementById('avatar');
const bubble = document.getElementById('speech-bubble');
const bubbleOption = document.getElementById('bubble-option');
const chatPanel = document.getElementById('chat-panel');
const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatClose = document.getElementById('chat-close');

// --- GLOBAL CONSTANTS ---
const BOX_SIZE = 200;
const SCREEN_MARGIN = 30;

// --- MOVEMENT PARAMETERS ---
const BIRD = {
  horizontalSpeed: 1.2,
  launchStrength: 2.0,
  nudgeStrength: 0.6,
  floatFallSpeed: 0.4,
  longGlideSpeed: 1.0,
  highThreshold: 80,
  lowThreshold: 0.6, // Percentage of screen height
  launchDuration: 15,
  nudgeCount: 3,
  nudgeDuration: 10,
  fallDuration: 40,
  glideChance: 0.002,
  glideDuration: 120,
  turnChance: 0.001,
  smoothing: 0.05, // For a floaty, eased feel
};

const ROCK = {
  joltChance: 0.001,
  joltMax: 10,
  fallSpeed: 3.0,
};

const GROUND_WALK_SPEED = 0.6;

const WORM = {
  baseSpeed: GROUND_WALK_SPEED,
  pulseFreq: 0.002,
  wiggleAmp: 0.2,
  wiggleFreq: 0.005,
  pauseChance: 0.001,
  pauseDuration: 1000,
  fallSpeed: 1.0,
};

const KANGAROO = {
  hopSpeed: 3,
  hopHeight: 50,
  hopDuration: 60, // frames
  pauseDuration: 20, // frames
  fallSpeed: 2.0,
};

// --- STATE ---
let currentAvatarType = 'color';
let currentMode = 'worm';
let posX = SCREEN_MARGIN + Math.random() * (window.innerWidth - BOX_SIZE - 2 * SCREEN_MARGIN);
let posY = SCREEN_MARGIN + Math.random() * (window.innerHeight - BOX_SIZE - 2 * SCREEN_MARGIN);
let velX = 0;
let velY = 0;
// True while the chat panel is open, so the avatar stops crawling and the
// panel stays under the user's cursor.
let movementPaused = false;

// Mode-specific state
let modeState = {
  worm: { pausedUntil: 0 },
  bird: {
    phase: 0,
    subPhase: 0,
    glideUntil: 0,
    currentDirection: 1,
    targetDirection: 1,
    isLongGliding: false
  },
  rock: {},
  kangaroo: { phase: 0, direction: 1, isPausing: false },
};

function update() {
  const now = performance.now();

  // The chat panel is anchored to the avatar, so it drifts while you type and
  // can slide out from under the cursor. Freezing movement while it is open
  // keeps the text box still.
  if (!movementPaused) {
    switch (currentMode) {
      case 'worm':
        updateWorm(now);
        break;
      case 'bird':
        updateBird();
        break;
      case 'rock':
        updateRock();
        break;
      case 'kangaroo':
        updateKangaroo();
        break;
    }

    // Boundary Handling
    const minX = SCREEN_MARGIN;
    const maxX = window.innerWidth - BOX_SIZE - SCREEN_MARGIN;
    const minY = SCREEN_MARGIN;
    const maxY = window.innerHeight - BOX_SIZE - SCREEN_MARGIN;

    if (posX <= minX || posX >= maxX) {
      if (currentMode === 'bird') {
        modeState.bird.targetDirection *= -1;
      }
      if (currentMode === 'kangaroo') {
        modeState.kangaroo.direction *= -1;
      }
      if (currentMode !== 'worm') {
        velX *= -1;
      }
    }
    if (posY <= minY) {
      velY *= -1;
    } else if (posY >= maxY) {
      if (currentMode === 'bird') {
        velY *= -1;
      } else if (currentMode === 'kangaroo') {
        if (velY > 0) velY = 0;
      } else {
        velY = 0;
      }
    }

    posX += velX;
    posY += velY;

    // Constrain to screen
    posX = Math.max(minX, Math.min(posX, maxX));
    posY = Math.max(minY, Math.min(posY, maxY));
  }

  // Apply a 50px downward offset for rendering
  const renderY = posY + 50;

  avatar.style.left = posX + 'px';
  avatar.style.top = renderY + 'px';

  // Position bubble relative to avatar
  bubble.style.left = posX + 'px';
  bubble.style.top = (renderY - 40) + 'px';
  bubbleOption.style.left = posX + 'px';
  bubbleOption.style.top = (renderY - 48) + 'px';
  positionChat(renderY);

  // The avatar crawls under a possibly stationary cursor, so re-evaluate the
  // hover state each frame using the last known pointer position. Without this
  // the option would only appear once the pointer itself moved.
  if (lastX >= 0 && lastY >= 0) reevaluateHover();

  requestAnimationFrame(update);
}

// Keeps the chat panel above the avatar, flipping below it and clamping to the
// viewport when the avatar is too close to an edge to fit it there.
function positionChat(renderY) {
  const panelH = chatPanel.offsetHeight || 0;
  const panelW = chatPanel.offsetWidth || 280;
  const above = renderY - 48 - panelH - 12;
  const below = renderY + BOX_SIZE + 12;
  const top = above < SCREEN_MARGIN ? Math.min(below, window.innerHeight - panelH - SCREEN_MARGIN) : above;
  const left = Math.max(SCREEN_MARGIN,
    Math.min(posX, window.innerWidth - panelW - SCREEN_MARGIN));

  chatPanel.style.left = left + 'px';
  chatPanel.style.top = top + 'px';
}

function updateWorm(now) {
  const minX = SCREEN_MARGIN;
  const maxX = window.innerWidth - BOX_SIZE - SCREEN_MARGIN;
  const minY = SCREEN_MARGIN;
  const maxY = window.innerHeight - BOX_SIZE - SCREEN_MARGIN;

  const isOnRoof = posY <= minY;
  const isOnBottom = posY >= maxY;
  const isOnLeft = posX <= minX;
  const isOnRight = posX >= maxX;

  if (isOnRoof || isOnBottom || isOnLeft || isOnRight) {
    if (now < modeState.worm.pausedUntil) {
      velX = 0;
      velY = 0;
      return;
    }

    if (Math.random() < WORM.pauseChance) {
      modeState.worm.pausedUntil = now + WORM.pauseDuration;
      return;
    }

    const pulse = 1 + 0.5 * Math.sin(now * WORM.pulseFreq);
    const speed = WORM.baseSpeed * pulse;

    // Circuit Logic: Bottom -> Right -> Top -> Left -> Bottom
    if (isOnRight && isOnRoof) {
      velX = -speed;
      velY = 0;
    } else if (isOnLeft && isOnRoof) {
      velX = 0;
      velY = speed;
    } else if (isOnLeft && isOnBottom) {
      velX = speed;
      velY = 0;
    } else if (isOnRight && isOnBottom) {
      velX = 0;
      velY = -speed;
    } else if (isOnRight && velX >= 0) {
      velX = 0;
      velY = -speed; // Turn Up
    } else if (isOnRoof && velY <= 0) {
      velX = -speed;
      velY = 0; // Turn Left
    } else if (isOnLeft && velX <= 0) {
      velX = 0;
      velY = speed; // Turn Down
    } else if (isOnBottom && velY >= 0) {
      velX = speed;
      velY = 0; // Turn Right
    } else {
      if (Math.abs(velX) > 0) {
        velY = 0;
        velX = (velX > 0 ? 1 : -1) * speed;
      } else if (Math.abs(velY) > 0) {
        velX = 0;
        velY = (velY > 0 ? 1 : -1) * speed;
      } else {
        if (isOnBottom) { velX = speed; velY = 0; }
        else if (isOnRight) { velX = 0; velY = -speed; }
        else if (isOnRoof) { velX = -speed; velY = 0; }
        else { velX = 0; velY = speed; }
      }
    }
    return;
  } else {
    velX = 0;
    velY = WORM.fallSpeed;
  }
}

function updateBird() {
  const s = modeState.bird;
  const now = performance.now();

  s.currentDirection += (s.targetDirection - s.currentDirection) * BIRD.smoothing;
  velX = BIRD.horizontalSpeed * s.currentDirection;

  if (!s.isLongGliding && posY < BIRD.highThreshold) {
    s.isLongGliding = true;
  }

  if (s.isLongGliding && posY > window.innerHeight * BIRD.lowThreshold) {
    s.isLongGliding = false;
    s.phase = 0;
    s.subPhase = 0;
  }

  let targetVelY = BIRD.floatFallSpeed;

  if (s.isLongGliding) {
    targetVelY = BIRD.longGlideSpeed;
  } else if (now < s.glideUntil) {
    targetVelY = BIRD.floatFallSpeed;
    s.phase = 0;
    s.subPhase = 0;
  } else {
    s.subPhase++;

    if (s.phase === 0) {
      if (s.subPhase < BIRD.launchDuration) {
        const progress = s.subPhase / BIRD.launchDuration;
        targetVelY = -BIRD.launchStrength * (1 - progress);
      } else {
        s.phase = 1;
        s.subPhase = 0;
      }
    }
    else if (s.phase === 1) {
      const nudgeIdx = Math.floor(s.subPhase / BIRD.nudgeDuration);
      if (nudgeIdx < BIRD.nudgeCount) {
        const nudgeProgress = (s.subPhase % BIRD.nudgeDuration) / BIRD.nudgeDuration;
        targetVelY = -BIRD.nudgeStrength * Math.sin(nudgeProgress * Math.PI);
      } else {
        s.phase = 2;
        s.subPhase = 0;
      }
    }
    else if (s.phase === 2) {
      if (s.subPhase < BIRD.fallDuration) {
        const progress = s.subPhase / BIRD.fallDuration;
        targetVelY = BIRD.floatFallSpeed * progress;
      } else {
        s.phase = 0;
        s.subPhase = 0;
      }
    }
  }

  velY += (targetVelY - velY) * BIRD.smoothing;

  if (!s.isLongGliding && Math.random() < BIRD.glideChance) {
    s.glideUntil = now + BIRD.glideDuration;
  }
  if (Math.random() < BIRD.turnChance) {
    s.targetDirection *= -1;
  }
}

function updateRock() {
  const maxY = window.innerHeight - BOX_SIZE - SCREEN_MARGIN;
  if (posY < maxY) {
    velX = 0;
    velY = ROCK.fallSpeed;
  } else {
    velY = 0;
    velX = 0;
  }

  if (Math.random() < ROCK.joltChance) {
    posX += (Math.random() - 0.5) * 2 * ROCK.joltMax;
    posY += (Math.random() - 0.5) * 2 * ROCK.joltMax;
  }
}

function updateKangaroo() {
  const s = modeState.kangaroo;
  const maxY = window.innerHeight - BOX_SIZE - SCREEN_MARGIN;
  const isOnGround = posY >= maxY;

  if (!isOnGround && s.phase === 0 && !s.isPausing) {
    velX = 0;
    velY = KANGAROO.fallSpeed;
    return;
  }

  if (s.isPausing) {
    velX = 0;
    velY = 0;
    s.phase++;
    if (s.phase >= KANGAROO.pauseDuration) {
      s.isPausing = false;
      s.phase = 0;
    }
    return;
  }

  s.phase++;
  if (s.phase < KANGAROO.hopDuration) {
    velX = KANGAROO.hopSpeed * s.direction;
    const t = s.phase / KANGAROO.hopDuration;
    const vFactor = (0.5 - t);
    velY = -vFactor * 15;
  } else {
    s.isPausing = true;
    s.phase = 0;
  }
}

window.electronAPI.updateColor((color) => {
  if (currentAvatarType === 'color') {
    avatar.style.backgroundColor = color;
    avatar.style.backgroundImage = 'none';
  }
});

window.electronAPI.updatePersonality((name) => {
  currentMode = name;
  modeState.bird.phase = 0;
  modeState.bird.subPhase = 0;
  modeState.bird.glideUntil = 0;
  modeState.bird.currentDirection = 1;
  modeState.bird.targetDirection = 1;
  modeState.bird.isLongGliding = false;
  modeState.kangaroo.phase = 0;
  modeState.kangaroo.isPausing = false;

  if (currentMode === 'worm') {
    velX = 0;
    velY = WORM.fallSpeed;
  } else if (currentMode === 'bird') {
    velX = BIRD.horizontalSpeed;
    velY = 0;
  } else if (currentMode === 'rock') {
    velX = 0;
    velY = ROCK.fallSpeed;
  } else if (currentMode === 'kangaroo') {
    velX = 0;
    velY = KANGAROO.fallSpeed;
  }
});

window.electronAPI.updateAvatarType((type) => {
  currentAvatarType = type;
  if (type === 'image') {
    avatar.style.backgroundImage = "url('Avatar/Frog_avatar.png')";
    avatar.style.backgroundSize = 'contain';
    avatar.style.backgroundRepeat = 'no-repeat';
    avatar.style.backgroundPosition = 'center';
    avatar.style.backgroundColor = 'transparent';
  } else {
    avatar.style.backgroundImage = 'none';
  }
});

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

// --- AVATAR INTERACTION ---
// The overlay covers the whole screen and is click-through by default, so the
// only interactive region is the avatar plus whatever is attached to it: the
// hover affordance, and the chat panel once it is open.
//
// Flow: hover the avatar -> a clickable option appears -> click it -> the chat
// opens. Clicking the avatar also reveals the option (not the chat), so the
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

// The avatar keeps crawling while you reach for the option, so the option is
// given a short grace period before it disappears.
const OPTION_GRACE_MS = 400;
let optionHideTimer = null;

function rectsOverlap(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// The option sits just above the avatar's top edge. Without treating the strip
// between them as interactive, the pointer crosses dead space on its way up and
// the option vanishes before it can be clicked.
function isInBridge(x, y) {
  if (isChatOpen() || !isOptionVisible()) return false;
  const avatarRect = avatar.getBoundingClientRect();
  const optionRect = bubbleOption.getBoundingClientRect();
  if (!optionRect.height) return false;
  const left = Math.min(avatarRect.left, optionRect.left);
  const right = Math.max(avatarRect.right, optionRect.right);
  return x >= left && x <= right && y >= optionRect.bottom && y <= avatarRect.top;
}

function isOverInteractiveArea(x, y) {
  if (rectsOverlap(x, y, avatar.getBoundingClientRect())) return true;
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

  const over = isOverInteractiveArea(x, y) || isInBridge(x, y);
  // Keep the overlay interactive only while the pointer is over something the
  // user can actually click; everywhere else stays click-through. Only sent
  // here (not on every animation frame) so a still pointer does not spam IPC.
  window.electronAPI.setIgnoreMouse(!over);

  reevaluateHover();
}

// Recomputes the hover affordance from the last known pointer position. Safe to
// call every frame: it only touches the option's visibility, never IPC.
function reevaluateHover() {
  if (isChatOpen()) return;

  const over = isOverInteractiveArea(lastX, lastY) || isInBridge(lastX, lastY);
  const overAvatar = rectsOverlap(lastX, lastY, avatar.getBoundingClientRect());

  if (over) {
    if (optionHideTimer) { clearTimeout(optionHideTimer); optionHideTimer = null; }
    if (overAvatar) showOption();
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
  movementPaused = true;
  chatInput.focus();
  // The chat is open, so the overlay must stay interactive even before the
  // pointer moves again.
  window.electronAPI.setIgnoreMouse(false);
}

function closeChat() {
  window.electronAPI.cancelAI();
  endExchange();
  movementPaused = false;
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
// Clicking the avatar is a hover-independent way to reveal the affordance, not
// to open the chat directly: the avatar crawls constantly, so an immediate open
// would fire on accidental clicks. The deliberate second click is on the pill.
avatar.addEventListener('click', showOption);
chatClose.addEventListener('click', closeChat);
chatForm.addEventListener('submit', submitChat);

// Primary hover source: the cursor position polled by the main process. This is
// the only signal guaranteed to arrive on a click-through overlay.
window.electronAPI.onCursorMove((pos) => handlePointerAt(pos.x, pos.y));

// Secondary source: forwarded DOM mouse moves, when the platform provides them.
// Feeding both through one handler keeps the interaction consistent everywhere.
window.addEventListener('mousemove', (e) => handlePointerAt(e.clientX, e.clientY));

// Escape closes the chat from anywhere in the overlay.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isChatOpen()) closeChat();
});

update();
