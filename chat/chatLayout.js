// Places the AI chat around the frog: the input bar under the hover pill and
// the message history above the frog's head (beside it near the top of the
// screen). The buddy's nudge uses the same spot. Only handles where things go
// and how they look; sending and receiving messages is Maike's chat logic in
// overlay.js.

// Sets up the chat layout and returns the functions the overlay uses.
// - elements: { avatar, history, form, pill }
// - getFrogRect(): the visible frog's rectangle
// - isChatOpen(): whether the chat is currently shown
function createChatLayout(elements, getFrogRect, isChatOpen) {
  const { avatar, history, form, pill } = elements;
  const { historyMinHeightPx, revealAfterScrollMs } = window.CHAT_CONFIG;

  let wasOpen = false;
  // Where the frog was before it slid up to make room for the input bar;
  // null when it hasn't been lifted.
  let restPosition = null;
  let revealTimer = null;

  // Runs every frame from the overlay's update loop. Notices the chat
  // opening or closing by itself, so the chat logic doesn't have to call in.
  function update() {
    const isOpen = isChatOpen();
    if (isOpen && !wasOpen) liftFrogIfNeeded();
    if (!isOpen && wasOpen) lowerFrog();
    wasOpen = isOpen;
    if (isOpen) placeChat();
  }

  // --- FROG LIFT ---

  // Near the bottom of the screen there's no room for the input bar under
  // the pill, so the frog slides up just enough while chatting. The lifted
  // spot is never saved; the frog's real spot is remembered in restPosition.
  function liftFrogIfNeeded() {
    const margin = getScreenMargin();
    const gap = readLengthToken('--space-2');
    const formBottom = pill.getBoundingClientRect().bottom + gap + form.offsetHeight;
    const overlap = formBottom - (window.innerHeight - margin);
    if (overlap <= 0) return;

    const box = avatar.getBoundingClientRect();
    restPosition = { left: box.left, top: box.top };
    slideAvatarTo({ left: box.left, top: box.top - overlap });
  }

  // Puts the frog back where it was before the chat lifted it.
  function lowerFrog() {
    if (!restPosition) return;
    slideAvatarTo(restPosition);
    restPosition = null;
  }

  // Moves the frog with the short slide from chat.css (.is-sliding). The
  // slide is dropped again when it ends, so dragging stays instant.
  function slideAvatarTo(position) {
    avatar.classList.add('is-sliding');
    moveAvatarTo(avatar, position);
  }

  function stopSliding() {
    avatar.classList.remove('is-sliding');
  }

  // Only the frog box's own slide counts: fades inside it (e.g. the hover
  // indicator) also send transitionend up to it.
  avatar.addEventListener('transitionend', (event) => {
    if (event.target === avatar && event.propertyName === 'top') stopSliding();
  });

  // Called when the user starts dragging the frog mid-chat: wherever they
  // drop it wins, so it shouldn't slide back to the old spot afterwards.
  function forgetRestPosition() {
    restPosition = null;
    stopSliding();
  }

  // --- PLACEMENT ---

  // Input bar centred under the pill; history in the column spot (see
  // getColumnSpot). Both are kept inside the screen margins.
  function placeChat() {
    const frog = getFrogRect();
    const margin = getScreenMargin();
    const gap = readLengthToken('--space-2');

    const formTop = Math.min(
      pill.getBoundingClientRect().bottom + gap,
      window.innerHeight - form.offsetHeight - margin
    );
    form.style.left = getColumnLeft(frog, margin) + 'px';
    form.style.top = formTop + 'px';

    placeHistory(getColumnSpot(history));
  }

  // Where something in the history column goes, for the history itself and
  // the buddy's nudge: just above the frog's head, lined up with the input
  // bar, or beside the frog when there's too little room above. Returns
  // { left, bottom, room }: room is the most height available.
  function getColumnSpot(element) {
    const frog = getFrogRect();
    const margin = getScreenMargin();
    const gap = readLengthToken('--space-2');

    const roomAbove = frog.top - gap - margin;
    if (roomAbove >= historyMinHeightPx) {
      return { left: getColumnLeft(frog, margin), bottom: frog.top - gap, room: roomAbove };
    }
    return getSpotBesideFrog(element, frog, margin, gap);
  }

  // The column is centred on the frog, as wide as the input bar. Read from
  // the theme, because the input bar is hidden while only a nudge shows.
  function getColumnLeft(frog, margin) {
    const width = readLengthToken('--chat-width');
    const frogCentre = (frog.left + frog.right) / 2;
    return clamp(frogCentre - width / 2, margin, window.innerWidth - width - margin);
  }

  // Beside the frog (left if it fits, otherwise right), with its bottom
  // level with the frog's feet so the newest message stays close to it.
  function getSpotBesideFrog(element, frog, margin, gap) {
    const width = element.offsetWidth;
    let left = frog.left - gap - width;
    if (left < margin) left = frog.right + gap;
    left = clamp(left, margin, window.innerWidth - width - margin);
    return { left, bottom: frog.bottom, room: frog.bottom - margin };
  }

  // Positions the history by its bottom edge, so it grows upward as
  // messages arrive. The tallest it may get is the room available, capped
  // by the theme's maximum height.
  function placeHistory({ left, bottom, room }) {
    const maxHeight = Math.min(room, readLengthToken('--chat-history-max-height')) + 'px';
    if (history.style.maxHeight !== maxHeight) {
      // The column got taller or shorter (frog moved): keep the newest
      // message in view instead of staying scrolled to an older spot.
      history.style.maxHeight = maxHeight;
      history.scrollTop = history.scrollHeight;
    }
    history.style.left = left + 'px';
    history.style.top = (bottom - history.offsetHeight) + 'px';
  }

  // Puts another element (the nudge) in the history's spot, bottom edge
  // first, never above the top screen margin.
  function placeInColumn(element) {
    const { left, bottom } = getColumnSpot(element);
    const top = Math.max(getScreenMargin(), bottom - element.offsetHeight);
    element.style.left = left + 'px';
    element.style.top = top + 'px';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  // --- REVEAL WHILE SCROLLING ---
  // Hover and keyboard focus reveal the faded history in CSS. Scrolling
  // reveals it here, for a moment after the last scroll. Only the user's own
  // scrolling counts (wheel, keys, scrollbar), not the automatic scroll to
  // each new message, or a streaming reply would keep it revealed.
  function revealForAMoment() {
    history.classList.add('is-revealed');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => history.classList.remove('is-revealed'), revealAfterScrollMs);
  }

  history.addEventListener('wheel', revealForAMoment, { passive: true });
  history.addEventListener('pointerdown', revealForAMoment);
  history.addEventListener('keydown', revealForAMoment);

  return {
    update,
    forgetRestPosition,
    placeInColumn,
  };
}
