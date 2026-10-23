// Overlay renderer: shows the frog in the bottom-right corner, plays its
// sprite animations, shows speech bubbles, and decides when the overlay
// should let mouse clicks through to the desktop.

const avatar = document.getElementById('avatar');
const bubble = document.getElementById('speech-bubble');

// Plays the sprite sheet onto the child element; #avatar itself stays the
// 200x200 box the frog is centred in.
const spriteElement = document.getElementById('avatar-sprite');
const spriteAnimator = new SpriteAnimator(spriteElement);

// The animation shown while the frog is at rest.
const DEFAULT_IMAGE_ANIMATION = 'idle';

// One-shot reaction played on click; hands back to the idle loop when it ends.
const CLICK_ANIMATION = 'standingClicked';

// --- PLACEMENT ---
const BOX_SIZE = 200;
const SCREEN_MARGIN = 30;
// The frog is centred in its box, so the box is drawn this far below its
// margin to rest the frog's feet near the bottom of the screen.
const RENDER_OFFSET_Y = 50;
// How far above the box the speech bubble sits.
const BUBBLE_OFFSET_Y = 40;

// Places the frog in the bottom-right corner of the overlay. Called on start
// and whenever the overlay is resized (e.g. a screen resolution change).
function placeAvatarBottomRight() {
  const left = window.innerWidth - BOX_SIZE - SCREEN_MARGIN;
  const top = window.innerHeight - BOX_SIZE - SCREEN_MARGIN + RENDER_OFFSET_Y;
  avatar.style.left = left + 'px';
  avatar.style.top = top + 'px';
}

// Keeps the speech bubble just above the frog's box.
function positionBubble() {
  const rect = avatar.getBoundingClientRect();
  bubble.style.left = rect.left + 'px';
  bubble.style.top = (rect.top - BUBBLE_OFFSET_Y) + 'px';
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

// The element the pointer should actually be tested against, so hover and
// clicks land on the visible frog rather than on the empty corners of its
// 200x200 box.
function getHitTarget() {
  // Before the sheet has loaded the sprite has no size, so fall back to the
  // full box rather than leaving the avatar briefly unclickable.
  return spriteElement.offsetWidth > 0 ? spriteElement : avatar;
}

window.addEventListener('mousemove', (e) => {
  const rect = getHitTarget().getBoundingClientRect();
  const isOver = (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  );
  window.electronAPI.setIgnoreMouse(!isOver);
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

window.addEventListener('resize', placeAvatarBottomRight);

placeAvatarBottomRight();
spriteAnimator.play(DEFAULT_IMAGE_ANIMATION);
update();
