// Places the AI chat around the frog: the input bar under the hover pill and
// the message history above the frog's head (beside it near the top of the
// screen). The buddy's nudge uses the same spot. Only handles where things go
// and how they look; sending and receiving messages is Maike's chat logic in
// overlay.js.

// Sets up the chat layout and returns the functions the overlay uses.
// - elements: { avatar, history, form, pill }
// - getFrogRect(): the visible frog's rectangle
// - isChatOpen(): whether the chat is currently shown
// - onAvatarSettled(): optional. Runs when the frog's lift slide ends, so
//   followers (the to-do panel) can anchor to the frog's rest position while
//   it is lifted.
// - getTodoPanelRect(): optional. The to-do panel's bounds while it is open
//   (its window, mirrored through the main process), or null. The chat uses
//   the panel's top edge as the ceiling the chat stack must stay above, and
//   the frog slides wherever needed — up or down, whenever the panel's
//   placement settles — so the pill's slot under its feet rests on the list.
function createChatLayout(elements, getFrogRect, isChatOpen, onAvatarSettled, getTodoPanelRect) {
  const { avatar, history, form, pill } = elements;
  const { historyMinHeightPx, revealAfterScrollMs } = window.CHAT_CONFIG;

  let wasOpen = false;
  // Where the frog was before it slid up to make room for the input bar;
  // null when it hasn't been lifted.
  let restPosition = null;
  // Where the frog sits with no panel lift (its natural spot), kept while the
  // pill's slot rests on the list's top edge so closing the list can put the
  // frog back. Null when the panel isn't lifting it.
  let panelBaseTop = null;
  let wasPanelOpen = false;
  // The panel's top edge from the frame last acted on. A differing value
  // while the panel is open means it moved — opened, dragged, or resized —
  // and the pill-to-list alignment must be reviewed once it holds still.
  let lastPanelY = null;
  let pendingPanelReview = false;
  // True while a slide is animating: the pill's measured bottom would be
  // half-way, so placement reviews wait until the frog settles.
  let isSliding = false;
  // True while the user drags the frog: the drag owns the position (and
  // re-anchors the panel through the position feed), so reviews must not
  // fight it mid-flight.
  let dragging = false;
  // While the frog is dragged with the chat open, the history and the input
  // bar ride along rigidly: they translate by the frog's movement instead of
  // being re-placed and clamped, so the whole arrangement can be carried
  // anywhere. { box, form, history } as captured on drag start, null when
  // there is nothing to ride (closed chat, no chat open when it began).
  let dragRide = null;
  // Set when a drag ends with the chat open: the input bar's headroom over
  // the panel must be re-checked, but only against the SETTLED placement —
  // the placement mirror still holds the mid-drag position when the drop
  // fires, so the immediate check would measure the wrong panel edge. Run
  // on the next placement update instead; see notePanelPlacement.
  let pendingLiftRecheck = false;
  let revealTimer = null;

  // Runs every frame from the overlay's update loop. Notices the chat and
  // the to-do panel opening or closing by themselves, so neither logic has
  // to call in.
  function update() {
    const isOpen = isChatOpen();
    if (isOpen && !wasOpen) liftFrogIfNeeded();
    if (!isOpen && wasOpen) {
      lowerFrog();
      // The list may still be open: once the chat no longer needs the room
      // above it, settle the frog back onto the list's top edge.
      if (getTodoPanelRect && getTodoPanelRect()) pendingPanelReview = true;
    }
    wasOpen = isOpen;
    // A deferred lift re-check only makes sense while the chat it is for is
    // still open.
    if (!isOpen && pendingLiftRecheck) pendingLiftRecheck = false;
    reviewPanelPlacement();
    // Mid-drag the ride owns the chat's position: re-placing would clamp it
    // back while the frog is off the screen edge. Normal placement resumes
    // on the drop, so the arrangement tightens up as usual — that only
    // differs from the captured one when the drop spot needs the clamps.
    if (dragging && dragRide) applyDragRide();
    else if (isOpen) placeChat();
  }

  // Keeps the pill's slot resting on the list's top edge, wherever the
  // panel currently is. The panel anchors under the pill slot by clearance,
  // so a mismatch happens only when the list had to be pushed up to stay
  // whole on screen: the pill (and the frog above it) then slides up by
  // exactly the gap. Runs once per settled placement; a new placement first
  // marks the review pending again.
  function reviewPanelPlacement() {
    const panel = getTodoPanelRect ? getTodoPanelRect() : null;
    if (!panel) {
      if (wasPanelOpen) {
        // Closing the list while chatting may let the frog come back down,
        // but only as far as the chat alone needs. Its natural spot then
        // becomes the chat's rest, so a later chat close doesn't settle on a
        // spot that was only lifted for the list.
        if (isChatOpen()) {
          if (panelBaseTop !== null) {
            if (restPosition) restPosition = { left: restPosition.left, top: panelBaseTop };
            else restPosition = { left: avatar.getBoundingClientRect().left, top: panelBaseTop };
            panelBaseTop = null;
          }
          liftFrogIfNeeded();
        } else {
          lowerForPanel();
        }
        lastPanelY = null;
        pendingPanelReview = false;
      }
      wasPanelOpen = false;
      return;
    }
    if (!wasPanelOpen) {
      lastPanelY = panel.y;
      pendingPanelReview = true;
    } else if (panel.y !== lastPanelY) {
      lastPanelY = panel.y;
      pendingPanelReview = true;
    }
    wasPanelOpen = true;
    if (
      pendingPanelReview && !dragging && !isSliding &&
      panel.y === lastPanelY
    ) {
      pendingPanelReview = false;
      if (isChatOpen()) {
        // The list opened or moved under an already-open chat: lift the frog
        // (and the chat with it) above the panel. The panel stays put while
        // the chat owns the position, so this must not slide for the panel.
        liftFrogIfNeeded();
      } else {
        slideForPanel();
      }
    }
  }

  // --- FROG LIFT ---

  // Near the bottom of the screen there's no room for the input bar under
  // the pill, so the frog slides up just enough while chatting. With the
  // to-do list open it must also clear the panel's top edge: the chat (the
  // history above the head and the input bar under the pill) may never run
  // into the list, which stays where it is, so the frog rises further (this
  // is why the panel stops following the feet while the chat is open). Called
  // when the chat opens and again whenever the list opens, moves or closes
  // while chatting, so opening the list after the chat can never cover it.
  // The frog's original spot is kept in restPosition and is never undershot:
  // a negative overlap (the list closed again) only lowers back to what the
  // chat alone needs, never below the resting spot.
  function liftFrogIfNeeded() {
    const margin = getScreenMargin();
    const gap = readLengthToken('--space-2');
    // The lowest place the input bar may end: the screen bottom, or — with
    // the list open — the panel's top edge, minus a gap.
    let ceiling = window.innerHeight - margin;
    const panel = getTodoPanelRect ? getTodoPanelRect() : null;
    if (panel) ceiling = Math.min(ceiling, panel.y - gap);
    const formBottom = pill.getBoundingClientRect().bottom + gap + form.offsetHeight;
    const overlap = formBottom - ceiling;

    const box = avatar.getBoundingClientRect();
    // Capture the resting spot once, before the first lift: later calls (the
    // list opening or closing mid-chat) must not overwrite it with a lifted
    // position, or the frog would drift upward or settle too high.
    if (!restPosition) {
      if (overlap <= 0) return;
      restPosition = { left: box.left, top: box.top };
    }
    const targetTop = Math.min(restPosition.top, box.top - overlap);
    if (Math.abs(targetTop - box.top) < 1) return;
    slideAvatarTo({ left: box.left, top: targetTop });
  }

  // Puts the frog back where it was before the chat lifted it.
  function lowerFrog() {
    if (!restPosition) return;
    slideAvatarTo(restPosition);
    restPosition = null;
  }

  // While the list is open the panel's top edge is where the pill's slot
  // rests: the pill-menu is what stands on the list. Aim straight at that
  // edge (rather than nudging by a measured delta) so a list that moved while
  // the chat was open still ends up with the slot exactly on it. The frog's
  // unlifted spot is remembered the first time, for lowerForPanel. Skipped
  // while the chat is open — its lift already keeps the pill above the panel,
  // and a second slider mid-chat would break its rest bookkeeping.
  function slideForPanel() {
    if (isChatOpen()) return;
    const panel = getTodoPanelRect && getTodoPanelRect();
    if (!panel) return;
    const box = avatar.getBoundingClientRect();
    if (panelBaseTop === null) panelBaseTop = box.top;
    const pillOffset = pill.getBoundingClientRect().bottom - box.top;
    const targetTop = panel.y - pillOffset;
    if (Math.abs(targetTop - box.top) < 1) return;
    slideAvatarTo({ left: box.left, top: targetTop });
  }

  // Puts the frog back on its unlifted spot when the list closes. Skipped
  // while the chat is open: the chat lowers to its rest (which has already
  // been moved to the unlifted spot when the list closed) on its own.
  function lowerForPanel() {
    if (isChatOpen() || panelBaseTop === null) return;
    const box = avatar.getBoundingClientRect();
    slideAvatarTo({ left: box.left, top: panelBaseTop });
    panelBaseTop = null;
  }

  // Moves the frog with the short slide from chat.css (.is-sliding). The
  // slide is dropped again when it ends, so dragging stays instant.
  function slideAvatarTo(position) {
    isSliding = true;
    avatar.classList.add('is-sliding');
    moveAvatarTo(avatar, position);
  }

  function stopSliding() {
    isSliding = false;
    avatar.classList.remove('is-sliding');
  }

  // True from slideAvatarTo() until that slide's transitionend fires. The
  // to-do panel must not follow the chat's bottom edge between those
  // points: the input bar would sit inside a still-moving chat window, so
  // an extent push uses the settled value instead (see overlay.js).
  function isChatSliding() {
    return isSliding;
  }

  // Only the frog box's own slide counts: fades inside it (e.g. the hover
  // indicator) also send transitionend up to it.
  avatar.addEventListener('transitionend', (event) => {
    if (event.target === avatar && event.propertyName === 'top') {
      stopSliding();
      if (onAvatarSettled) onAvatarSettled();
    }
  });

  // Called when the user starts dragging the frog mid-chat: wherever they
  // drop it wins, so it shouldn't slide back to the old spot afterwards.
  // A drag also owns the position outright while the panel is open, so the
  // pending panel review and lower are dropped with it.
  function forgetRestPosition() {
    restPosition = null;
    panelBaseTop = null;
    pendingPanelReview = false;
    lastPanelY = null;
    stopSliding();
  }

  // Told about drag state from the overlay. Placement reviews hold off
  // mid-drag ("owns the position" above) and resume after the drop. A drag
  // with the chat open also captures the rigid ride here, before the frog
  // has moved: the elements' offsets are what the ride preserves.
  function setDragging(value) {
    const wasDragging = dragging;
    dragging = value;
    dragRide = null;
    if (value && isChatOpen()) {
      const box = avatar.getBoundingClientRect();
      dragRide = {
        box: { left: box.left, top: box.top },
        form: {
          left: form.getBoundingClientRect().left,
          top: form.getBoundingClientRect().top,
        },
        history: {
          left: history.getBoundingClientRect().left,
          top: history.getBoundingClientRect().top,
        },
      };
      return;
    }
    // Dropping with the chat open: the frog landed wherever the user left
    // it, but the input bar still needs its headroom over the panel.
    // Without a panel there is nothing to wait for; with one, defer to the
    // settled placement (see pendingLiftRecheck above) — the mirror still
    // holds the mid-drag bounds when the drop fires here.
    if (!value && wasDragging && isChatOpen()) {
      if (!getTodoPanelRect()) liftFrogIfNeeded();
      else pendingLiftRecheck = true;
    }
  }

  // The overlay calls this whenever the to-do panel's placement mirror
  // changes, so placement-dependent work can piggyback on authoritative
  // bounds. Currently the deferred post-drop lift re-check; see
  // pendingLiftRecheck.
  function notePanelPlacement() {
    if (!pendingLiftRecheck) return;
    pendingLiftRecheck = false;
    if (isChatOpen()) liftFrogIfNeeded();
  }

  // Moves the chat parts by the frog's movement since the ride was captured,
  // so the whole arrangement (history, frog, input bar) shifts as one.
  function applyDragRide() {
    const box = avatar.getBoundingClientRect();
    const dx = box.left - dragRide.box.left;
    const dy = box.top - dragRide.box.top;
    form.style.left = (dragRide.form.left + dx) + 'px';
    form.style.top = (dragRide.form.top + dy) + 'px';
    history.style.left = (dragRide.history.left + dx) + 'px';
    history.style.top = (dragRide.history.top + dy) + 'px';
  }

  // --- PLACEMENT ---

  // Input bar centred under the pill; history in the column spot (see
  // getColumnSpot). Both are kept inside the screen margins, and the input
  // bar also stays above the to-do list while it is open.
  function placeChat() {
    const frog = getFrogRect();
    const margin = getScreenMargin();
    const gap = readLengthToken('--space-2');
    const panel = getTodoPanelRect ? getTodoPanelRect() : null;
    // Ceiling for the input bar's top edge: nothing may run into the panel.
    const formCeiling = panel
      ? panel.y - gap - form.offsetHeight
      : window.innerHeight - form.offsetHeight - margin;

    const formTop = Math.min(pill.getBoundingClientRect().bottom + gap, formCeiling);
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
    setDragging,
    notePanelPlacement,
    placeInColumn,
    isChatSliding,
  };
}
