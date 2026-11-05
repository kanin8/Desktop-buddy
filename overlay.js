// Overlay renderer: shows the frog (bottom-right, or where it was dragged),
// plays its sprite animations, shows speech bubbles, runs the hover-to-chat
// interaction for the AI task breakdown, and decides when the overlay should
// let mouse clicks through to the desktop.

const avatar = document.getElementById('avatar');
const bubble = document.getElementById('speech-bubble');
const hoverIndicator = document.getElementById('hover-indicator');
const pill = document.getElementById('buddy-pill');
const pillChatButton = document.getElementById('pill-chat');
const pillTodoButton = document.getElementById('pill-todo');
const pillMoreButton = document.getElementById('pill-more');
const buddyMenu = document.getElementById('buddy-menu');
const chatPanel = document.getElementById('chat-panel');
const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatClose = document.getElementById('chat-close');
const nudgeElement = document.getElementById('nudge');

// Plays the sprite sheet onto the child element; #avatar itself stays the
// invisible box the frog is centred in.
const spriteElement = document.getElementById('avatar-sprite');
const spriteAnimator = new SpriteAnimator(spriteElement);

// What the user actually sees of the frog. Hover uses these instead of the
// larger, empty #avatar box.
const visibleParts = [spriteElement, hoverIndicator];

// Placement and dragging also count the hover pill, even while it's hidden,
// so the frog is kept far enough from the screen edge for the pill to fit.
const placementParts = [spriteElement, hoverIndicator, pill];

// The animation shown while the frog is at rest.
const DEFAULT_IMAGE_ANIMATION = 'idle';

// Chat "speaking" reaction: while the buddy delivers a chat message, play the
// matching talking loop for roughly as long as the message would take to say.
const SPEAKING = window.AVATAR_SPRITE_CONFIG.speaking;

// Decode every sheet up front and keep the Image objects alive. The typing
// loop swaps background images every couple of seconds; an undecoded sheet
// would show as an empty frame for a moment during that swap.
const preloadedSpriteSheets = Object.values(window.AVATAR_SPRITE_CONFIG.animations).map(
  (animation) => {
    const image = new Image();
    image.src = animation.sheet;
    if (image.decode) image.decode().catch(() => {});
    return image;
  },
);

// One-shot reaction played on click; hands back to the rest state when it ends.
// While seated at the desk, the frog glances up instead of doing the standing
// reaction.
const CLICK_ANIMATION = 'standingClicked';
const SEATED_CLICK_ANIMATION = 'deskLookUp';

// The last activity category reported by detection. null until the first
// update, so an already-running category is not mistaken for a transition.
let activityCategory = null;

// True once the frog has sat down at the desk (the first productive
// activity). It stays seated from then on, typing or judging, because there
// is no stand-up animation. Kept apart from activityCategory because an
// uncategorized app leaves the frog where it is.
let isAtDesk = false;

// True while the frog is judging the user for being in leisure. Lets a
// return to productive work play the short stop pair instead of the full
// sitting-down intro.
let isJudging = false;

// True while the frog sits at the desk typing (rather than judging).
function isTyping() {
  return isAtDesk && !isJudging;
}

// True while the seated "chat" pose is holding. Opening the chat at the desk
// starts a look-over loop that only ends when the chat closes, so this flag
// tells `closeChat` whether it owes the user a look-down before typing.
let isChatPoseActive = false;

// Incremented whenever a category sequence starts or is interrupted. Each
// onComplete captures the value it was started with and bails when it is
// stale, so a late callback cannot restart an old sequence.
let sequenceToken = 0;

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
// middle of the frog. While the chat history or a nudge is showing above the
// frog, the bubble goes above that instead, so they don't overlap.
function positionBubble() {
  const anchor = getBubbleAnchorRect();
  const maxLeft = window.innerWidth - bubble.offsetWidth - BUBBLE_GAP;
  const left = Math.max(BUBBLE_GAP, Math.min(anchor.left, maxLeft));
  bubble.style.left = left + 'px';
  bubble.style.top = Math.max(BUBBLE_GAP, anchor.top - bubble.offsetHeight - BUBBLE_GAP) + 'px';

  const anchorCentre = anchor.left + anchor.width / 2 - left;
  const tailX = Math.max(TAIL_EDGE_INSET, Math.min(anchorCentre, bubble.offsetWidth - TAIL_EDGE_INSET));
  bubble.style.setProperty('--bubble-tail-x', tailX + 'px');
}

// What the speech bubble sits on top of: the chat history, the nudge, or
// the frog itself.
function getBubbleAnchorRect() {
  if (isChatOpen()) return chatLog.getBoundingClientRect();
  if (nudge.isVisible()) return nudge.getRect();
  return spriteElement.getBoundingClientRect();
}

// Runs every frame: steps the sprite animation and keeps everything attached
// to the frog in place. Hover is not re-checked here: the frog only moves
// when dragged, and pointer moves already re-check it. Re-checking every
// frame would keep restarting the option's hide timer so it never hides.
function update() {
  spriteAnimator.update(performance.now());
  chatLayout.update();
  // Catch-up while a drag has stalled (see pendingPositionSend): one extra
  // throttled send after the move events stop, then this goes quiet.
  if (isDragging && pendingPositionSend) sendAvatarPosition();
  if (nudge.isVisible()) chatLayout.placeInColumn(nudgeElement);
  // After the chat and nudge, since the bubble goes above them.
  positionBubble();
  controls.positionMenu();
  requestAnimationFrame(update);
}

// --- MESSAGE QUEUE SYSTEM ---
// Items are either a plain string (shown for DEFAULT_BUBBLE_VISIBLE_MS) or an
// object { text, visibleMs } for a message that needs its own timing.
const DEFAULT_BUBBLE_VISIBLE_MS = 4000;
const BUBBLE_FADE_MS = 150;
const messageQueue = [];
let isSpeaking = false;

async function processQueue() {
  if (isSpeaking) return;
  isSpeaking = true;

  while (messageQueue.length > 0) {
    const message = messageQueue.shift();
    const text = typeof message === 'string' ? message : message.text;
    const visibleMs = typeof message === 'string'
      ? DEFAULT_BUBBLE_VISIBLE_MS
      : (message.visibleMs || DEFAULT_BUBBLE_VISIBLE_MS);

    bubble.innerText = text;
    bubble.style.display = 'block';
    bubble.style.opacity = '1';
    await new Promise(resolve => setTimeout(resolve, visibleMs));

    bubble.style.opacity = '0';
    await new Promise(resolve => setTimeout(resolve, BUBBLE_FADE_MS));
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

// True for clicks that land on the hover pill, which sits inside the frog's
// box but isn't the frog.
function isFromControls(event) {
  return Boolean(event.target.closest('[data-no-drag]'));
}

// True when the point is over any visible part of the frog.
function isPointerOverFrog(x, y) {
  return getHitTargets().some((element) => rectsOverlap(x, y, element.getBoundingClientRect()));
}

// --- FROG POSITION FEED ---
// The main process anchors the to-do panel under the frog's feet, so the
// frog's position is forwarded here. The overlay window is frameless and
// pinned to the top-left of the work area, so client coordinates equal
// screen ones (same assumption as the cursor channel in main.js).
//
// Drag frames are throttled (controls/config.js) so they cannot flood IPC;
// a drag's final drop and every non-drag placement are sent immediately.

let lastPositionSend = 0;
// Set when a throttled drag frame was skipped, so update() can send the
// catch-up once the throttle allows: the pointer may stop moving entirely
// well before it stops being held, and the last reported spot would
// otherwise stay behind the frog until the drop.
let pendingPositionSend = false;

// The point under the frog's visible feet, in screen coordinates. Measured
// from the frog's box, whose centre is known to hold the feet exactly one
// --avatar-feet-offset below it (see tokens.css). The slot under the feet is
// not part of the point itself; it is reported separately below.
function frogFeetPosition() {
  const box = avatar.getBoundingClientRect();
  return {
    x: Math.round(box.left + box.width / 2),
    y: Math.round(box.top + box.height / 2 + readLengthToken('--avatar-feet-offset')),
  };
}

// The height of the slot the hover pill occupies just under the feet: the
// gap, then the pill itself. The pill is always laid out (it only hides with
// visibility, see controls.css), so its height can be read at any time. The
// to-do panel anchors below this slot, which keeps the pill-menu above the
// list — and the frog standing on it — whenever the list is open.
function pillSlotClearance() {
  return readLengthToken('--indicator-gap') + pill.offsetHeight;
}

function sendAvatarPosition(force, dragging) {
  // While the chat is open the to-do panel must not chase the feet: the frog
  // lifts above the panel when chatting, and a following panel would be
  // dragged up with it again. Closing the chat settles the frog and sends a
  // forced update, which is where the follow resumes. Exception: while the
  // frog is dragged, the whole arrangement (panel and chat together) rides
  // along, and the drop's send ends the ride right there.
  const isDrop = force === true && dragging === false;
  if (isChatOpen() && dragging !== true && !isDrop) return;
  const now = performance.now();
  if (!force && now - lastPositionSend < window.CONTROLS_CONFIG.frogFollowThrottleMs) {
    pendingPositionSend = true;
    return;
  }
  pendingPositionSend = false;
  lastPositionSend = now;
  window.electronAPI.pushAvatarPosition({
    ...frogFeetPosition(),
    clearance: pillSlotClearance(),
    // Tells the panel's host when to ride rigidly along with the drag
    // instead of re-anchoring. The drop lands through the last callback
    // before the drag state itself clears, so its send already says false.
    dragging: dragging === true,
  });
}

// The overlay's rAF loop runs every frame; the chat fires this from a
// transition end instead, so it is sent deliberately and forced.
const sendAvatarPositionNow = () => sendAvatarPosition(true);

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
avatar.addEventListener('click', (event) => {
  if (isFromControls(event)) return;
  // Seated at work: run the look-up / look-over reaction before typing again.
  // While the chat is open the look-over loop is already holding, so leave it
  // running instead of interrupting it.
  if (isTyping()) {
    if (!isChatOpen()) playSeatedClickReaction();
    return;
  }
  ++sequenceToken;
  spriteAnimator.play(isJudging ? SEATED_CLICK_ANIMATION : CLICK_ANIMATION, {
    onComplete: resumeRestAnimation,
  });
});

// --- AVATAR INTERACTION ---
// The overlay covers the whole screen and is click-through by default, so the
// only interactive region is the frog plus whatever is attached to it: the
// hover affordance, and the chat panel once it is open.
//
// Flow: hover the frog -> the pill (Chat + More) appears in the indicator's
// place -> Chat opens the chat, More opens the menu. Clicking the frog also
// reveals the pill, and so does the keyboard shortcut (see main.js).
// Everything else passes clicks through.
//
// The hover signal comes from the main process (see `onCursorMove`), not from
// DOM mousemove events. A click-through window only receives forwarded mouse
// moves on some platforms, so relying on them left this flow dead on Linux.

const isChatOpen = () => chatPanel.style.display === 'flex';

// The pill and menu. Chat toggles Maike's chat panel; the to-do button and
// the menu items call the main process. See controls/controls.js.
const controls = createBuddyControls(
  { avatar, pill, chatButton: pillChatButton, todoButton: pillTodoButton, moreButton: pillMoreButton, menu: buddyMenu },
  getFrogRect,
  {
    onChat: () => {
      nudge.dismiss();
      if (isChatOpen()) {
        closeChat();
      } else {
        openChat();
      }
    },
    // The pill icon and the menu item switch the panel on and off, like Chat
    // does for its own panel.
    onTodo: () => window.electronAPI.toggleTodoList(),
    onSettings: () => window.electronAPI.showSettings(),
    onSnooze: (choice) => {
      nudge.dismiss();
      if (isChatOpen()) closeChat();
      window.electronAPI.snooze(choice);
    },
    onHidden: () => releaseIfIdle(),
  }
);

// Where the to-do panel window is, mirrored from the main process so the
// chat lift can rise above the list. Null while the panel is hidden. Every
// change lets chatLayout run its deferred post-drop lift re-check against
// the bounds just settled.
let todoPanelRect = null;
window.electronAPI.onTodoPanelPlacement((info) => {
  todoPanelRect = info && info.visible ? info : null;
  chatLayout.notePanelPlacement();
});

// Places the chat around the frog: the input bar under the pill and the
// history above the frog. See chat/chatLayout.js.
const chatLayout = createChatLayout(
  { avatar, history: chatLog, form: chatForm, pill },
  getFrogRect,
  isChatOpen,
  sendAvatarPositionNow,
  () => todoPanelRect
);

// The buddy's proactive message, in the chat history's spot. See
// nudge/nudge.js; what each quick reply does is decided here.
const nudge = createNudge(
  {
    nudge: nudgeElement,
    text: nudgeElement.querySelector('.nudge-text'),
    replies: nudgeElement.querySelector('.nudge-replies'),
    close: nudgeElement.querySelector('.nudge-close'),
  },
  {
    // Every reply is saved to the chat history (nudge text, the clicked label
    // as the user's line, then the buddy's answer). "Not now" and "I'm fine"
    // don't open the chat and both start the quiet period (quietAfterNotNowMs).
    onReply: (id, text, label) => {
      const { helpLine, notFineLine, fineLine } = window.NUDGE_CONFIG;
      if (id === 'yes') {
        acceptNudge(text, label, helpLine);
      } else if (id === 'notFine') {
        acceptNudge(text, label, notFineLine);
      } else if (id === 'notNow') {
        const backOffLine = nudge.showBackOff();
        logNudgeExchange(text, label, backOffLine, false);
        lastNotNowAt = Date.now();
      } else if (id === 'fine') {
        nudge.showBriefly(fineLine);
        logNudgeExchange(text, label, fineLine, false);
        lastNotNowAt = Date.now();
      }
    },
    // Not mid-drag: the overlay must keep catching the mouse until the drop.
    onHidden: () => {
      if (!isDragging) releaseIfIdle();
    },
  }
);

// "Yes, help me!" (or "I'm not"): opens the chat with the exchange already in
// the history (nudge text, the user's reply, followUp), so the user can
// answer straight away in the input. Only followUp is spoken: the nudge text
// was already on screen.
// The chat opens before the nudge closes, so closing it doesn't hand focus
// back to the other app (onHidden -> releaseIfIdle).
function acceptNudge(text, label, followUp) {
  controls.showPill();
  openChat();
  nudge.dismiss();
  logNudgeExchange(text, label, followUp, true);
}

// Adds a nudge exchange to the chat history: the nudge text (buddy, silent),
// the clicked button's label (user), then the buddy's answer. speakFollowUp
// decides whether the answer plays the talking animation; lines saved while
// the chat is closed stay silent.
function logNudgeExchange(text, label, followUp, speakFollowUp) {
  addChatLine(text, 'buddy', { speak: false });
  addChatLine(label, 'user');
  addChatLine(followUp, 'buddy', { speak: speakFollowUp });
}

// A nudge from the main process (--test-nudge) or the judging timer below.
// message: { text, replies }, both optional; without them the default text
// and buttons from nudge/config.js are used.
// The frog plays its cue first so the message doesn't pop up out of nowhere.
// Skipped while the chat or menu is open (the user is already busy with the
// buddy) or while a cooldown is running (canShowNudge). The message waits for
// the cue's length rather than its onComplete, because clicking the frog
// mid-cue restarts the animation with its own callback and the message would
// be lost.
function showNudge(message) {
  if (isChatOpen() || controls.isMenuOpen() || !canShowNudge()) return;
  const { cueAnimation, defaultText } = window.NUDGE_CONFIG;
  const text = message.text || defaultText;
  ++sequenceToken;
  spriteAnimator.play(cueAnimation, {
    onComplete: resumeRestAnimation,
  });
  setTimeout(() => {
    if (isChatOpen() || controls.isMenuOpen()) return;
    nudge.show(text, message.replies);
    recordNudgeShown();
  }, getAnimationLengthMs(cueAnimation));
}

// --- NUDGE TIMING ---
// When the frog starts judging and the user is in leisure, a timer waits
// judgingDelayMs before the frog says one of the judgingLines. Cooldowns keep
// it from getting annoying. All values live in nudge/config.js and are read
// when needed, so they can be tuned from the dev tools while the app runs.

const ONE_HOUR_MS = 60 * 60 * 1000;

let judgingNudgeTimer = null;
// Index into judgingLines of the last line said, so it isn't repeated next.
let lastJudgingLineIndex = -1;
// When each nudge was shown, trimmed to the last hour (for maxPerHour).
let nudgeShownTimes = [];
// When "Not now" or "I'm fine" was last pressed; 0 means never.
let lastNotNowAt = 0;

// Starts the wait before a judging nudge. Does nothing if one is already
// waiting, so going leisure -> uncategorized -> leisure doesn't restart it.
function startJudgingNudgeTimer() {
  if (judgingNudgeTimer) return;
  judgingNudgeTimer = setTimeout(() => {
    judgingNudgeTimer = null;
    showJudgingNudge();
  }, window.NUDGE_CONFIG.judgingDelayMs);
}

function cancelJudgingNudgeTimer() {
  clearTimeout(judgingNudgeTimer);
  judgingNudgeTimer = null;
}

// Says a random judging line (with its own buttons, if it has any), but only
// if the user is still in leisure after the delay.
function showJudgingNudge() {
  if (activityCategory !== 'leisure') return;
  const index = pickJudgingLineIndex();
  lastJudgingLineIndex = index;
  const line = window.NUDGE_CONFIG.judgingLines[index];
  showNudge({ text: line.text, replies: line.replies });
}

// A random index into judgingLines, never the same as the last one (unless
// there is only one line).
function pickJudgingLineIndex() {
  const count = window.NUDGE_CONFIG.judgingLines.length;
  if (count <= 1) return 0;
  let index;
  do {
    index = Math.floor(Math.random() * count);
  } while (index === lastJudgingLineIndex);
  return index;
}

// False while any cooldown is running: too soon after the last nudge, the
// hourly limit is reached, or the user recently said "Not now" / "I'm fine".
function canShowNudge() {
  const { cooldownMs, maxPerHour, quietAfterNotNowMs } = window.NUDGE_CONFIG;
  const now = Date.now();
  nudgeShownTimes = nudgeShownTimes.filter((time) => now - time < ONE_HOUR_MS);
  const lastShownAt = nudgeShownTimes[nudgeShownTimes.length - 1] || 0;

  if (now - lastShownAt < cooldownMs) return false;
  if (nudgeShownTimes.length >= maxPerHour) return false;
  if (now - lastNotNowAt < quietAfterNotNowMs) return false;
  return true;
}

// Counted only once the nudge is actually on screen, so a skipped one doesn't
// use up the cooldown.
function recordNudgeShown() {
  nudgeShownTimes.push(Date.now());
}

// How long one play of a sprite animation takes (avatar/config.js). An
// animation may skip sheet frames, so measure its playback list, not the
// sheet's total frame count.
function getAnimationLengthMs(name) {
  const animation = window.AVATAR_SPRITE_CONFIG.animations[name];
  const frameCount = animation.frames ? animation.frames.length : animation.frameCount;
  return frameCount * animation.frameDurationMs;
}

// True while the frog is seated at the desk (typing or judging), so a message
// should use the seated talking sprite instead of the standing one.
function isSeatedState() {
  return isAtDesk;
}

// Buddy lines added in the same tick (a nudge plus its follow-up, ...) are
// combined so one speaking reaction covers all of them.
let pendingSpeechText = '';
let speechStartTimer = null;

// Queues a buddy chat message for the talking animation. Empty placeholders
// (the reply line starts empty while streaming) are ignored.
function speakMessage(text) {
  const message = String(text || '').trim();
  if (!message) return;

  pendingSpeechText = pendingSpeechText ? pendingSpeechText + ' ' + message : message;
  if (speechStartTimer) return;

  speechStartTimer = setTimeout(() => {
    speechStartTimer = null;
    const combined = pendingSpeechText;
    pendingSpeechText = '';
    startSpeech(combined);
  }, 0);
}

// Plays the talking clip for a length proportional to `message`, then hands
// back to whichever rest state applies (idle, typing, or judging).
function startSpeech(message) {
  const name = isSeatedState() ? SPEAKING.seatedAnimation : SPEAKING.idleAnimation;
  const durationMs = Math.min(
    SPEAKING.maxMs,
    Math.max(SPEAKING.minMs, message.length * SPEAKING.msPerCharacter)
  );
  const cycles = Math.max(1, Math.ceil(durationMs / getAnimationLengthMs(name)));
  const token = ++sequenceToken;

  const step = (remaining) => {
    if (!isCurrentSequence(token)) return;
    if (remaining <= 0) {
      resumeRestAnimation();
      return;
    }
    spriteAnimator.play(name, { onComplete: () => step(remaining - 1) });
  };
  step(cycles);
}

// --- ACTIVITY-DRIVEN ANIMATIONS ---
// Productive work gets a seated entrance and a typing loop. Switching to
// leisure plays a judging sequence (look up, start judging, blink, stare a few
// times) that loops until the user leaves leisure; then the frog stops judging
// and resumes typing. The sequence names live in avatar/config.js; this block
// only decides when to play them.

const {
  productiveIntro,
  productiveLoop,
  judgingIntro,
  judgingBlink,
  judgingStare,
  judgingStareRepeats,
  judgingExit,
  seatedClickIntro,
  seatedClickLook,
  seatedClickLookRepeats,
  seatedClickExit,
} = window.AVATAR_SPRITE_CONFIG.activityAnimations;

function isCurrentSequence(token) {
  return token === sequenceToken;
}

// Plays `names` once each, then calls `onDone`. Stops silently if a newer
// sequence or an interruption has taken over.
function playSequence(names, token, onDone) {
  const playAt = (index) => {
    if (!isCurrentSequence(token)) return;
    spriteAnimator.play(names[index], {
      onComplete: () => {
        if (!isCurrentSequence(token)) return;
        if (index + 1 < names.length) playAt(index + 1);
        else onDone();
      },
    });
  };
  playAt(0);
}

// Alternates the typing and blink sheets forever. The blink sheet is itself a
// full typing cycle with one blink in it, so alternating whole loops keeps the
// frog typing continuously.
function startTypingLoop(token, startWithBlink = false) {
  const [typingName, blinkName] = productiveLoop;
  let showBlink = startWithBlink;

  const step = () => {
    if (!isCurrentSequence(token)) return;
    const name = showBlink ? blinkName : typingName;
    showBlink = !showBlink;
    spriteAnimator.play(name, { onComplete: step });
  };

  step();
}

// Entrance into productive work: sit down, pull in the desk, type once, then
// settle into the typing/blink loop. The intro already ended on the typing
// sheet, so the loop starts with the blink variant to avoid replaying it.
function playProductiveIntro() {
  const token = ++sequenceToken;
  isAtDesk = true;
  isJudging = false;
  playSequence(productiveIntro, token, () => {
    if (!isCurrentSequence(token)) return;
    resumeProductiveRest(token, true);
  });
}

// Seated reaction to a click on the frog (with the chat closed): look up from
// the keyboard, look over at the user for a while, then look back down and
// resume typing.
function playSeatedClickReaction() {
  const token = ++sequenceToken;
  spriteAnimator.play(seatedClickIntro, {
    onComplete: () => {
      if (!isCurrentSequence(token)) return;
      playLookingFix(token, seatedClickLookRepeats);
    },
  });
}

// Replays the look-at-user sheet `remaining` times, then looks back down and
// returns to the typing loop.
function playLookingFix(token, remaining) {
  if (!isCurrentSequence(token)) return;
  if (remaining <= 0) {
    spriteAnimator.play(seatedClickExit, {
      onComplete: () => {
        if (!isCurrentSequence(token)) return;
        startTypingLoop(token);
      },
    });
    return;
  }
  spriteAnimator.play(seatedClickLook, {
    onComplete: () => playLookingFix(token, remaining - 1),
  });
}

// Opening the chat while seated: look up from the keyboard, then hold the
// look-over loop until the chat closes.
function playChatOpenReaction() {
  const token = ++sequenceToken;
  isChatPoseActive = true;
  spriteAnimator.play(seatedClickIntro, {
    onComplete: () => {
      if (!isCurrentSequence(token)) return;
      startSeatedChatLoop(token);
    },
  });
}

// Loops the look-over sheet indefinitely. Used while the chat is open so the
// frog stays turned toward the user instead of typing behind the panel.
function startSeatedChatLoop(token) {
  if (!isCurrentSequence(token)) return;
  spriteAnimator.play(seatedClickLook, {
    onComplete: () => startSeatedChatLoop(token),
  });
}

// Closing the chat while seated: look back down, then resume the typing loop.
function playChatCloseReaction() {
  const token = ++sequenceToken;
  isChatPoseActive = false;
  spriteAnimator.play(seatedClickExit, {
    onComplete: () => {
      if (!isCurrentSequence(token)) return;
      startTypingLoop(token);
    },
  });
}

// Picks the productive rest pose: the look-over loop while the chat is open,
// otherwise the typing loop. Also records that the chat pose is holding so
// `closeChat` knows to play the look-down.
function resumeProductiveRest(token, startWithBlink) {
  if (isChatOpen()) {
    isChatPoseActive = true;
    startSeatedChatLoop(token);
  } else {
    startTypingLoop(token, startWithBlink);
  }
}

// Switching to leisure: look up, start judging, then loop the judge poses
// (blink once, stare a handful of times) until the user leaves leisure.
function playJudgingSequence() {
  const token = ++sequenceToken;
  isJudging = true;

  playSequence(judgingIntro, token, () => {
    playJudgingLoop(token);
  });
}

// One judge cycle: blink once, then stare `judgingStareRepeats` times. Repeats
// forever; a return to productive work or an interruption takes the token.
function playJudgingLoop(token) {
  if (!isCurrentSequence(token)) return;
  spriteAnimator.play(judgingBlink, {
    onComplete: () => {
      if (!isCurrentSequence(token)) return;
      playStare(token, judgingStareRepeats);
    },
  });
}

// Replays the no-blink judge sheet `remaining` times, then starts another
// judge cycle.
function playStare(token, remaining) {
  if (!isCurrentSequence(token)) return;
  if (remaining <= 0) {
    playJudgingLoop(token);
    return;
  }
  spriteAnimator.play(judgingStare, {
    onComplete: () => playStare(token, remaining - 1),
  });
}

// Leaving leisure mid-judge (to productive or uncategorized): stop judging,
// drop the glance, then pick the typing loop back up.
function playLeaveJudging() {
  const token = ++sequenceToken;
  isJudging = false;
  playSequence(judgingExit, token, () => {
    if (!isCurrentSequence(token)) return;
    resumeProductiveRest(token);
  });
}

// The pose shown when no one-off reaction is playing. A click or nudge uses
// this to hand control back to whichever state the category calls for.
function resumeRestAnimation() {
  if (isTyping()) {
    resumeProductiveRest(++sequenceToken);
    return;
  }
  // Judging is itself a rest state: a click or nudge pauses it and hands back
  // to the judge loop, not to idle.
  if (isJudging) {
    playJudgingLoop(++sequenceToken);
    return;
  }
  ++sequenceToken;
  spriteAnimator.play(DEFAULT_IMAGE_ANIMATION);
}

// Reacts only to actual category changes, so switching apps while still in
// the same category does not replay the entrance.
// - productive: sits the frog down the first time, or stops a judge.
// - leisure: starts judging (once the frog is at the desk) and the nudge timer.
// - uncategorized: detection doesn't know what the user is doing, so the frog
//   never judges it. A judge stops and the frog goes back to typing. The
//   nudge timer is left running, so a quick hop leisure -> uncategorized ->
//   leisure doesn't restart the wait (showJudgingNudge only speaks in leisure).
function setActivityCategory(next) {
  if (!next || next === activityCategory) return;
  activityCategory = next;

  if (next === 'productive') {
    cancelJudgingNudgeTimer();
    if (isJudging) playLeaveJudging();
    else if (!isAtDesk) playProductiveIntro();
  } else if (next === 'leisure') {
    if (isAtDesk && !isJudging) playJudgingSequence();
    if (isJudging) startJudgingNudgeTimer();
  } else if (isJudging) {
    playLeaveJudging();
  }
}

window.electronAPI.onNudge(showNudge);

// Activity detection pushes the active window's category; the overlay turns
// it into the seated/typing behaviour above.
window.electronAPI.onActivityUpdate((event) => setActivityCategory(event.category));

// The overlay can load after the first broadcast, so seed the category once.
window.electronAPI.getActivity().then((activity) => {
  if (activity) setActivityCategory(activity.category);
});

// Opening the menu makes room for it: the nudge would sit right beside it.
pillMoreButton.addEventListener('click', () => nudge.dismiss());

// Once nothing is open (no pill, menu or chat), hands the mouse and keyboard
// straight back to the other apps. Without this the overlay stayed focused,
// and stayed in the way of clicks until the pointer happened to move.
// Doesn't check the pointer: if it's on the frog, the next move makes the frog
// clickable again (handlePointerAt).
function releaseIfIdle() {
  if (controls.isPillVisible() || controls.isMenuOpen() || isChatOpen()) return;
  window.electronAPI.setIgnoreMouse(true);
  window.electronAPI.releaseFocus();
}

function rectsOverlap(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isOverInteractiveArea(x, y) {
  if (isPointerOverFrog(x, y)) return true;
  if (controls.isPillVisible() && rectsOverlap(x, y, pill.getBoundingClientRect())) return true;
  if (controls.isMenuOpen() && rectsOverlap(x, y, buddyMenu.getBoundingClientRect())) return true;
  if (isChatOpen() && rectsOverlap(x, y, chatLog.getBoundingClientRect())) return true;
  if (isChatOpen() && rectsOverlap(x, y, chatForm.getBoundingClientRect())) return true;
  if (nudge.isVisible() && rectsOverlap(x, y, nudge.getRect())) return true;
  return false;
}

// The pill stays while a function is in use (chat or menu open), or while the
// pointer is on something clickable.
function shouldKeepPillOpen() {
  return isChatOpen() || controls.isMenuOpen() || isOverInteractiveArea(lastX, lastY);
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

  const over = isOverInteractiveArea(x, y);
  // Keep the overlay interactive only while the pointer is over something the
  // user can actually click; everywhere else stays click-through. Only sent
  // here (not on every animation frame) so a still pointer does not spam IPC.
  window.electronAPI.setIgnoreMouse(!over);

  // Lights up the hover indicator under the frog.
  avatar.classList.toggle('is-hovered', isPointerOverFrog(x, y));

  // A nudge doesn't fade away while the pointer is on it.
  nudge.setPointerOver(nudge.isVisible() && rectsOverlap(x, y, nudge.getRect()));

  reevaluateHover();
}

// Shows the pill while the pointer is on the frog, and starts the delayed hide
// once it's on nothing clickable. Never touches IPC.
function reevaluateHover() {
  if (isDragging) return;

  if (isPointerOverFrog(lastX, lastY)) {
    controls.showPill();
  } else if (!isOverInteractiveArea(lastX, lastY)) {
    controls.hidePillSoon(shouldKeepPillOpen);
  }
}

// --- APPEARANCE ---
// The theme switches by itself (prefers-color-scheme in styles/tokens.css).
// Message transparency is a user setting, so the overlay applies it here.

// Sets how solid the buddy's messages and menus are. An inline style on the
// root, because the value comes from Settings and can't live in a stylesheet.
function applyAppearance(settings) {
  document.documentElement.style.setProperty('--surface-opacity', settings.surfaceOpacity);
}

window.electronAPI.getAppearance().then(applyAppearance);
window.electronAPI.onAppearanceChanged(applyAppearance);

// --- AI CHAT ---
// Stream listeners are registered once at startup rather than per message, so
// repeated exchanges cannot leak handlers. They read this state:

let activeReply = null;   // element showing the reply being streamed
let activeReplyText = ''; // raw streamed text, before em dashes are replaced
let activePending = null; // "..." placeholder shown until the first token

// Adds a line to the chat history. Buddy lines are "spoken" (talking
// animation) unless options.speak is false, e.g. for lines saved while the
// chat is closed.
function addChatLine(text, kind, options = {}) {
  const { speak = true } = options;
  const el = document.createElement('div');
  el.className = 'chat-entry ' + kind;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  // Spoken buddy lines play standing when idle, seated at the desk.
  if (kind === 'buddy' && speak) speakMessage(text);
  return el;
}

function removeChatLine(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// Removes unconsumed confirmation buttons, so an old yes cannot add a
// breakdown whose pending entry was already dropped in the main process.
function removeQuickReplies() {
  chatLog.querySelectorAll('.chat-quick-replies').forEach((row) => removeChatLine(row));
}

// Shows the breakdown steps plus two quick replies. Nothing lands on the
// list until the user clicks one of them; the wording is fixed so testing
// knows exactly what was shown (docs/voice-and-behaviour.md, section 4).
function showTaskConfirmation(parentText, subtasks) {
  removeQuickReplies();
  const steps = subtasks.map((step, i) => (i + 1) + '. ' + step).join('\n');
  addChatLine('Okay, here\'s a way in for "' + parentText + '":\n' + steps, 'buddy');
  addChatLine('Should I add these to your list?', 'buddy');
  showConfirmButtons('Add them', 'Not now');
}

// Asks before removing tasks, since a removed task can't be brought back.
// Same yes/no flow as the breakdown: nothing is removed without "Remove".
function showRemovalConfirmation(taskTexts) {
  removeQuickReplies();
  const tasks = taskTexts.map((text) => '- ' + text).join('\n');
  addChatLine('Remove ' + (taskTexts.length === 1 ? 'this' : 'these') + ' from your list?\n' + tasks, 'buddy');
  showConfirmButtons('Remove', 'Keep');
}

// Adds the yes/no quick replies for whatever change is pending in the main
// process. Yes applies it (confirmAITasks), no drops it (declineAITasks).
function showConfirmButtons(yesLabel, noLabel) {
  const row = document.createElement('div');
  row.className = 'chat-quick-replies';

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'chat-quick-reply is-primary';
  yes.textContent = yesLabel;
  yes.addEventListener('click', () => {
    removeQuickReplies();
    window.electronAPI.confirmAITasks();
  });

  const no = document.createElement('button');
  no.type = 'button';
  no.className = 'chat-quick-reply';
  no.textContent = noLabel;
  no.addEventListener('click', () => {
    removeQuickReplies();
    window.electronAPI.declineAITasks();
  });

  row.appendChild(yes);
  row.appendChild(no);
  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Chat line kinds the AI should remember, and the role each speaks as.
// Errors and the "..." placeholder are left out: they aren't part of the talk.
const CHAT_HISTORY_ROLES = { user: 'user', buddy: 'assistant' };

// The conversation so far as [{ role, content }], oldest first, read from the
// chat log itself. The log already holds everything the user saw: typed
// messages, replies, nudges and the button the user pressed. So the AI
// remembers exactly what's on screen, with no second copy to keep in sync.
// The main process trims it to the configured length.
function getChatHistory() {
  const history = [];
  for (const el of chatLog.querySelectorAll('.chat-entry')) {
    const kind = Object.keys(CHAT_HISTORY_ROLES).find((name) => el.classList.contains(name));
    const content = el.textContent.trim();
    if (kind && content) history.push({ role: CHAT_HISTORY_ROLES[kind], content });
  }
  return history;
}

// The voice guide bans em dashes, but models still slip them in. Replaces each
// one, and the spaces around it, with ", ".
function replaceEmDashes(text) {
  return text.replace(/\s*—\s*/g, ', ');
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
  activeReplyText = '';
  chatSend.disabled = false;
}

function openChat() {
  controls.setChatActive(true);
  chatPanel.style.display = 'flex';
  chatInput.focus();
  // The chat is open, so the overlay must stay interactive even before the
  // pointer moves again.
  window.electronAPI.setIgnoreMouse(false);
  // Seated at the desk: turn toward the user and keep the look-over loop alive
  // for as long as the chat is open.
  if (isTyping()) playChatOpenReaction();
}

function closeChat() {
  window.electronAPI.cancelAI();
  endExchange();
  controls.setChatActive(false);
  chatPanel.style.display = 'none';
  chatInput.value = '';
  // Seated chats owe a look back down (and a return to typing); chats opened
  // while standing or judging just close.
  if (isChatPoseActive) {
    if (isTyping()) {
      playChatCloseReaction();
    } else {
      isChatPoseActive = false;
    }
  }
  releaseIfIdle();
}

// Greets the user once when the overlay starts, using the speech bubble above
// the frog. The chat stays closed; the greeting is just a message.
let hasGreetedOnStartup = false;

function greetOnStartup() {
  if (hasGreetedOnStartup) return;
  hasGreetedOnStartup = true;

  const { startupGreetingText, startupGreetingVisibleMs } = window.CHAT_CONFIG;
  if (!startupGreetingText) return;

  // Play the talking animation while the speech bubble shows the greeting.
  speakMessage(startupGreetingText);
  messageQueue.push({ text: startupGreetingText, visibleMs: startupGreetingVisibleMs });
  processQueue();
}

function submitChat(e) {
  e.preventDefault();
  const goal = chatInput.value.trim();
  if (!goal) return;

  // Read before the new line is added: the history is what came before it.
  const history = getChatHistory();
  addChatLine(goal, 'user');
  chatInput.value = '';
  chatSend.disabled = true;
  activePending = addChatLine('...', 'pending');
  // An unconfirmed breakdown is stale from the moment a new message is sent.
  removeQuickReplies();

  window.electronAPI.askAI(goal, history);
}

window.electronAPI.onAIStream(() => { ensureReplyElement(); });

// Cleans the whole text so far, not each token: the spaces around a dash can
// arrive in a different token than the dash itself.
window.electronAPI.onAIStream((token) => {
  activeReplyText += token;
  ensureReplyElement().textContent = replaceEmDashes(activeReplyText);
  chatLog.scrollTop = chatLog.scrollHeight;
});

window.electronAPI.onAIStreamEnd((reply) => {
  // A model can finish without emitting content; show what it did send.
  if (!activeReply && reply) {
    addChatLine(reply, 'buddy');
  } else if (activeReply) {
    // The streamed reply was appended to an existing line, so speak the final
    // text here (addChatLine only saw the empty placeholder).
    speakMessage(activeReply.textContent);
  }
  endExchange();
});

window.electronAPI.onAIError((message) => {
  addChatLine(message, 'error');
  endExchange();
});

window.electronAPI.onAIBreakdown((info) => showTaskConfirmation(info.parentText, info.subtasks));

window.electronAPI.onAITasksAdded(() => {
  addChatLine("Done, it's on your list.", 'buddy');
});

// One line per edit, worded by the app, so the chat always says exactly what
// changed (the buddy's own reply only reacts to it).
window.electronAPI.onAITasksEdited((lines) => {
  if (lines && lines.length) addChatLine(lines.join('\n'), 'buddy');
});

window.electronAPI.onAIConfirmRemoval((taskTexts) => showRemovalConfirmation(taskTexts));

window.electronAPI.onAITasksFailed((message) => {
  addChatLine('Could not break that down: ' + message, 'error');
});

// Clicking the frog is a hover-independent way to reveal the pill, not to open
// the chat directly, so an accidental click doesn't pop the chat open.
avatar.addEventListener('click', (event) => {
  if (!isFromControls(event)) controls.showPill();
});
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

// Escape closes one level at a time: snooze choices -> menu -> chat -> pill.
// Hiding the pill releases the mouse and keyboard (onHidden -> releaseIfIdle).
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (controls.handleEscape()) return;
  if (nudge.isVisible()) nudge.dismiss();
  else if (isChatOpen()) closeChat();
  else if (controls.isPillVisible()) controls.hidePill();
});

// The keyboard shortcut (registered in main.js) opens the pill without
// hovering, or jumps to the nudge's replies while one is showing. main.js has
// already focused the overlay.
window.electronAPI.onOpenControls(() => {
  if (nudge.isVisible()) nudge.focus();
  else controls.openPinned();
  window.electronAPI.setIgnoreMouse(false);
});

// Clicking anywhere outside the overlay moves focus away: close the menu and a
// pill that was opened by the shortcut. An open chat stays, as before.
window.addEventListener('blur', () => {
  controls.closeMenu();
  if (controls.isPinned() && !isChatOpen()) controls.hidePill();
});

// Re-place on resize (e.g. a resolution change) so the frog can't end up off
// screen; it keeps its saved spot when that still fits.
window.addEventListener('resize', () => {
  placeAvatar(avatar, placementParts);
  sendAvatarPositionNow();
});

enableAvatarDrag(avatar, placementParts, (dragging) => {
  isDragging = dragging;
  chatLayout.setDragging(dragging);
  // Dragging mid-chat: the drop spot wins over sliding back afterwards.
  if (dragging) chatLayout.forgetRestPosition();
  // Moving the frog away counts as brushing the nudge off.
  if (dragging) nudge.dismiss();
  // First position of the ride: reported unthrottled so the panel (and the
  // chat's rigid ride in chatLayout) capture the baseline before any move.
  if (dragging) sendAvatarPositionNow();
}, (_position, isFinal) => sendAvatarPosition(isFinal, isDragging && !isFinal));

// The sprite must have its size before placing, since placement measures it.
spriteAnimator.play(DEFAULT_IMAGE_ANIMATION);
placeAvatar(avatar, placementParts);
sendAvatarPositionNow();
update();

// After the frog is placed and the first frame has run, wait the configured
// delay, then show the greeting in the speech bubble above the frog.
setTimeout(greetOnStartup, window.CHAT_CONFIG.startupGreetingDelayMs);
