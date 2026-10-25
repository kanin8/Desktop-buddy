// The buddy's proactive message (nudge): one bubble with the text, a × and
// quick-reply buttons. Handles showing, the back-off line, and fading out when
// ignored. Where it sits is chat/chatLayout.js; what the replies do is up to
// the overlay (onReply).

// Sets up the nudge and returns the functions the overlay uses.
// - elements: { nudge, text, replies, close }
// - actions: { onReply(id, text), onHidden }
//   onHidden runs every time the nudge hides, however it was closed.
function createNudge(elements, actions) {
  const { nudge, text, replies, close } = elements;
  // nudge/config.js is read each time it's needed, so its values can be
  // tuned while the app runs (e.g. from the dev tools).
  const config = () => window.NUDGE_CONFIG;

  let hideTimer = null;
  // How long the current hide timer runs: the full time for a nudge, shorter
  // for the back-off line.
  let hideAfterMs = config().autoHideMs;
  // The timer waits while the user is looking at the nudge.
  let isPointerOver = false;
  let isFocusInside = false;

  const isVisible = () => nudge.classList.contains('is-visible');

  // Shows a nudge with the configured reply buttons. Doesn't take keyboard
  // focus: the user may be typing in another app. Screen readers still
  // announce the text (aria-live on the text).
  function show(message) {
    nudge.classList.add('is-visible');
    text.textContent = message;
    renderReplies(config().replies);
    restartHideTimer(config().autoHideMs);
  }

  // "Not now": a short back-off line, no buttons, then it fades.
  function showBackOff() {
    // Checked before the buttons go: the focused one is about to be removed.
    const hadFocus = nudge.contains(document.activeElement);
    text.textContent = config().backOffLine;
    renderReplies([]);
    // Keep focus in the nudge so Escape still works.
    if (hadFocus) close.focus();
    restartHideTimer(config().backOffVisibleMs);
  }

  function dismiss() {
    if (!isVisible()) return;
    clearTimeout(hideTimer);
    hideTimer = null;
    // Don't leave focus on a button that is fading out.
    if (nudge.contains(document.activeElement)) document.activeElement.blur();
    isFocusInside = false;
    nudge.classList.remove('is-visible');
    actions.onHidden();
  }

  // Focuses the first reply (or × when there are none), for the keyboard
  // shortcut.
  function focus() {
    (replies.querySelector('button') || close).focus();
  }

  function getRect() {
    return nudge.getBoundingClientRect();
  }

  function renderReplies(list) {
    replies.replaceChildren(...list.map(createReplyButton));
    replies.hidden = list.length === 0;
  }

  function createReplyButton(reply) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nudge-reply is-' + reply.style;
    button.textContent = reply.label;
    button.addEventListener('click', () => actions.onReply(reply.id, text.textContent));
    return button;
  }

  // --- FADING OUT WHEN IGNORED ---

  function restartHideTimer(ms) {
    hideAfterMs = ms;
    clearTimeout(hideTimer);
    hideTimer = null;
    if (!isPointerOver && !isFocusInside) hideTimer = setTimeout(dismiss, hideAfterMs);
  }

  // Pauses the timer while the user is looking at the nudge; it starts over
  // from the full time when they leave, so it never vanishes mid-read.
  function updatePause() {
    if (!isVisible()) return;
    if (isPointerOver || isFocusInside) {
      clearTimeout(hideTimer);
      hideTimer = null;
    } else if (!hideTimer) {
      restartHideTimer(hideAfterMs);
    }
  }

  // Called by the overlay with every pointer move. The overlay is
  // click-through most of the time, so DOM mouseenter can't be relied on.
  function setPointerOver(isOver) {
    if (isOver === isPointerOver) return;
    isPointerOver = isOver;
    updatePause();
  }

  nudge.addEventListener('focusin', () => {
    isFocusInside = true;
    updatePause();
  });

  nudge.addEventListener('focusout', (event) => {
    isFocusInside = nudge.contains(event.relatedTarget);
    updatePause();
  });

  close.addEventListener('click', dismiss);

  return {
    show,
    showBackOff,
    dismiss,
    focus,
    isVisible,
    getRect,
    setPointerOver,
  };
}
