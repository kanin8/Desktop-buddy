// Overlay renderer: shows the frog (bottom-right, or where it was dragged),
// plays its sprite animations, shows speech bubbles, and decides when the
// overlay should let mouse clicks through to the desktop.

const avatar = document.getElementById('avatar');
const bubble = document.getElementById('speech-bubble');
const hoverIndicator = document.getElementById('hover-indicator');

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

// True while the frog is being dragged (see controls/drag.js).
let isDragging = false;

// Keeps the speech bubble just above the frog, pulled left if it would
// otherwise run off the right edge of the screen.
function positionBubble() {
  const frog = spriteElement.getBoundingClientRect();
  const maxLeft = window.innerWidth - bubble.offsetWidth - BUBBLE_GAP;
  bubble.style.left = Math.max(BUBBLE_GAP, Math.min(frog.left, maxLeft)) + 'px';
  bubble.style.top = (frog.top - bubble.offsetHeight - BUBBLE_GAP) + 'px';
}

// Runs every frame: steps the sprite animation and keeps the bubble in place.
function update() {
  spriteAnimator.update(performance.now());
  positionBubble();
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

// True when the pointer is over any visible part of the frog.
function isPointerOverFrog(e) {
  return getHitTargets().some((element) => {
    const rect = element.getBoundingClientRect();
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  });
}

// Lets clicks through to the desktop everywhere except on the frog, and lights
// up the hover indicator while the pointer is on it. Skipped mid-drag: a fast
// drag can get ahead of the frog, and turning click-through on then would drop it.
window.addEventListener('mousemove', (e) => {
  if (isDragging) return;

  const isOver = isPointerOverFrog(e);
  window.electronAPI.setIgnoreMouse(!isOver);
  avatar.classList.toggle('is-hovered', isOver);
});

// Reacts to a click on the frog by playing the reaction animation once, then
// returning to the idle loop. Clicking again mid-reaction restarts it from the
// top, which feels more responsive than queueing or ignoring it.
// The listener sits on #avatar because #avatar-sprite is pointer-events: none.
avatar.addEventListener('click', () => {
  spriteAnimator.play(CLICK_ANIMATION, {
    onComplete: () => spriteAnimator.play(DEFAULT_IMAGE_ANIMATION),
  });
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
