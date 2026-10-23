// Lets the user drag the frog around the screen and remembers where it was
// dropped. Short pointer movements still count as clicks, so the click
// reaction keeps working.

// Sets up dragging on the #avatar box.
// - visibleParts: the elements that make up the visible frog, used to keep it
//   fully on screen.
// - onDragStateChange(isDragging): told when a drag starts and ends, so the
//   overlay doesn't make itself click-through in the middle of a drag.
function enableAvatarDrag(avatar, visibleParts, onDragStateChange) {
  const { dragStartThresholdPx } = window.CONTROLS_CONFIG;

  let pointerStart = null; // where the button went down; null when not pressed
  let boxStart = null;     // where the box was at that moment
  let currentPosition = null;
  let isDragging = false;
  let shouldSwallowClick = false;

  avatar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    // Capturing keeps the move events coming even when a fast drag gets ahead
    // of the frog and the pointer is briefly outside it.
    avatar.setPointerCapture(event.pointerId);
    pointerStart = { x: event.clientX, y: event.clientY };
    const box = avatar.getBoundingClientRect();
    boxStart = { left: box.left, top: box.top };
  });

  avatar.addEventListener('pointermove', (event) => {
    if (!pointerStart) return;

    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;

    if (!isDragging) {
      if (Math.hypot(dx, dy) < dragStartThresholdPx) return;
      startDrag();
    }

    const offsets = getVisibleOffsets(avatar, visibleParts);
    currentPosition = clampToScreen({ left: boxStart.left + dx, top: boxStart.top + dy }, offsets);
    moveAvatarTo(avatar, currentPosition);
  });

  avatar.addEventListener('pointerup', () => {
    if (isDragging) {
      savePosition(currentPosition);
      // The browser follows this pointerup with a click; that click belongs
      // to the drag, not to the frog. Reset right after in case it never comes.
      shouldSwallowClick = true;
      setTimeout(() => { shouldSwallowClick = false; }, 0);
    }
    endPointer();
  });

  // The system took the pointer away (e.g. a notification grabbed focus).
  avatar.addEventListener('pointercancel', () => {
    if (isDragging) savePosition(currentPosition);
    endPointer();
  });

  // Runs before overlay.js's click listener (capture phase) and stops it, so
  // dropping the frog doesn't also play the click reaction.
  avatar.addEventListener('click', (event) => {
    if (!shouldSwallowClick) return;
    shouldSwallowClick = false;
    event.stopImmediatePropagation();
  }, true);

  function startDrag() {
    isDragging = true;
    avatar.classList.add('is-dragging');
    onDragStateChange(true);
  }

  function endPointer() {
    if (isDragging) {
      avatar.classList.remove('is-dragging');
      onDragStateChange(false);
    }
    pointerStart = null;
    isDragging = false;
  }
}
