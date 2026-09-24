const avatar = document.getElementById('avatar');
const bubble = document.getElementById('speech-bubble');

// --- GLOBAL CONSTANTS ---
const BOX_SIZE = 40;
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
let currentMode = 'worm';
let posX = SCREEN_MARGIN + Math.random() * (window.innerWidth - BOX_SIZE - 2 * SCREEN_MARGIN);
let posY = SCREEN_MARGIN + Math.random() * (window.innerHeight - BOX_SIZE - 2 * SCREEN_MARGIN);
let velX = 0;
let velY = 0;

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

  avatar.style.left = posX + 'px';
  avatar.style.top = posY + 'px';

  // Position bubble relative to avatar
  bubble.style.left = posX + 'px';
  bubble.style.top = (posY - 40) + 'px';

  requestAnimationFrame(update);
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
    // We check corners first to ensure smooth transitions
    if (isOnRight && isOnRoof) {
      // Top-Right corner: must move Left
      velX = -speed;
      velY = 0;
    } else if (isOnLeft && isOnRoof) {
      // Top-Left corner: must move Down
      velX = 0;
      velY = speed;
    } else if (isOnLeft && isOnBottom) {
      // Bottom-Left corner: must move Right
      velX = speed;
      velY = 0;
    } else if (isOnRight && isOnBottom) {
      // Bottom-Right corner: must move Up
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
      // Maintain current direction if not turning
      if (Math.abs(velX) > 0) {
        velY = 0;
        velX = (velX > 0 ? 1 : -1) * speed;
      } else if (Math.abs(velY) > 0) {
        velX = 0;
        velY = (velY > 0 ? 1 : -1) * speed;
      } else {
        // Initial state if stopped on border
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

  // 1. Curved Horizontal Movement
  s.currentDirection += (s.targetDirection - s.currentDirection) * BIRD.smoothing;
  velX = BIRD.horizontalSpeed * s.currentDirection;

  // 2. Long Glide Trigger (Too high on screen)
  if (!s.isLongGliding && posY < BIRD.highThreshold) {
    s.isLongGliding = true;
  }

  // Exit long glide when low enough
  if (s.isLongGliding && posY > window.innerHeight * BIRD.lowThreshold) {
    s.isLongGliding = false;
    s.phase = 0;
    s.subPhase = 0;
  }

  // 3. Vertical Cycle Logic
  let targetVelY = BIRD.floatFallSpeed;

  if (s.isLongGliding) {
    targetVelY = BIRD.longGlideSpeed;
  } else if (now < s.glideUntil) {
    targetVelY = BIRD.floatFallSpeed;
    s.phase = 0;
    s.subPhase = 0;
  } else {
    s.subPhase++;

    // Launch phase
    if (s.phase === 0) {
      if (s.subPhase < BIRD.launchDuration) {
        const progress = s.subPhase / BIRD.launchDuration;
        targetVelY = -BIRD.launchStrength * (1 - progress);
      } else {
        s.phase = 1;
        s.subPhase = 0;
      }
    }
    // Nudge phase
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
    // Fall phase
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

  // Smoothing vertical velocity for a buoyant feel
  velY += (targetVelY - velY) * BIRD.smoothing;

  // 4. Random Events
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
    // Parabolic hop
    // X is linear
    velX = KANGAROO.hopSpeed * s.direction;

    // Y is a parabola: y = -a*t^2 + v0*t
    // We want peak height at hopDuration/2
    const t = s.phase / KANGAROO.hopDuration;
    const heightFactor = 4 * t * (1 - t); // 0 at 0, 1 at 0.5, 0 at 1

    // Instead of calculating absolute posY, we can use velocity
    // v_y = -2at + v0
    // v_y = - (constant) * (t - 0.5)
    const vFactor = (0.5 - t);
    velY = -vFactor * 15; // Increased scale for a more visible jump
  } else {
    s.isPausing = true;
    s.phase = 0;
  }
}

window.electronAPI.updateColor((color) => {
  avatar.style.backgroundColor = color;
});

window.electronAPI.updatePersonality((name) => {
  currentMode = name;
  // Reset mode states when switching
  modeState.bird.phase = 0;
  modeState.bird.subPhase = 0;
  modeState.bird.glideUntil = 0;
  modeState.bird.currentDirection = 1;
  modeState.bird.targetDirection = 1;
  modeState.bird.isLongGliding = false;
  modeState.kangaroo.phase = 0;
  modeState.kangaroo.isPausing = false;

  // Initialize velocities based on mode
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

// --- MESSAGE QUEUE SYSTEM ---
const messageQueue = [];
let isSpeaking = false;

async function processQueue() {
  if (isSpeaking) return;
  isSpeaking = true;

  while (messageQueue.length > 0) {
    const text = messageQueue.shift();
    console.log(`Processing message: ${text}`);

    bubble.innerText = text;
    bubble.style.display = 'block';

    // Display each message for 4 seconds
    await new Promise(resolve => setTimeout(resolve, 4000));

    bubble.style.display = 'none';

    // Small gap between messages
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('Queue empty, stopping speech.');
  isSpeaking = false;
}

window.electronAPI.speak((text) => {
  messageQueue.push(text);
  processQueue();
});

window.electronAPI.setScreenGrayscale((enabled) => {
  // OS-level grayscale is not possible via CSS in Electron.
  // Instead, we create a "bedtime" atmosphere:
  // 1. Dim the screen with a darker overlay
  // 2. Grayscale the avatar itself
  document.body.style.backgroundColor = enabled ? 'rgba(0,0,0,0.4)' : 'transparent';
  avatar.style.filter = enabled ? 'grayscale(100%)' : 'none';
});

window.addEventListener('mousemove', (e) => {
  const rect = avatar.getBoundingClientRect();
  const isOver = (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  );
  window.electronAPI.setIgnoreMouse(!isOver);
});

update();
