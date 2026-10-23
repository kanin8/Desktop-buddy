// Decides where the frog sits on screen: bottom-right by default, or where
// the user last dragged it. Also keeps it on screen and saves its position.
//
// "Position" here always means the top-left corner of the #avatar box. The
// box is bigger than the visible frog, so placement works from the frog's
// visible parts (sprite + indicator) instead of the box edges.

// Returns the area covered by the frog's visible parts, measured from the
// top-left corner of the #avatar box.
function getVisibleOffsets(avatar, visibleParts) {
  const box = avatar.getBoundingClientRect();
  const rects = visibleParts.map(part => part.getBoundingClientRect());

  return {
    left: Math.min(...rects.map(rect => rect.left)) - box.left,
    top: Math.min(...rects.map(rect => rect.top)) - box.top,
    right: Math.max(...rects.map(rect => rect.right)) - box.left,
    bottom: Math.max(...rects.map(rect => rect.bottom)) - box.top,
  };
}

// Reads the corner margin from the theme file, so the gap is set in one place.
function getScreenMargin() {
  const rootStyles = getComputedStyle(document.documentElement);
  return parseFloat(rootStyles.getPropertyValue('--buddy-screen-margin'));
}

// The box position that puts the visible frog in the bottom-right corner.
function getBottomRightPosition(offsets) {
  const margin = getScreenMargin();
  return {
    left: window.innerWidth - margin - offsets.right,
    top: window.innerHeight - margin - offsets.bottom,
  };
}

// Limits a box position so the visible frog stays fully on screen. The empty
// edges of the box may go off screen; nobody can see them.
function clampToScreen(position, offsets) {
  return {
    left: Math.min(Math.max(position.left, -offsets.left), window.innerWidth - offsets.right),
    top: Math.min(Math.max(position.top, -offsets.top), window.innerHeight - offsets.bottom),
  };
}

// True when the whole visible frog would be on screen at this position.
function isOnScreen(position, offsets) {
  const clamped = clampToScreen(position, offsets);
  return clamped.left === position.left && clamped.top === position.top;
}

// Moves the #avatar box. Inline styles are fine here: the value changes
// with every drag, so it can't live in a stylesheet.
function moveAvatarTo(avatar, position) {
  avatar.style.left = position.left + 'px';
  avatar.style.top = position.top + 'px';
}

// Returns the position saved by the last drag, or null if there is none or it
// can't be read (e.g. storage blocked or the saved value is broken).
function loadSavedPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(window.CONTROLS_CONFIG.positionStorageKey));
    const isValid = saved && Number.isFinite(saved.left) && Number.isFinite(saved.top);
    return isValid ? saved : null;
  } catch (error) {
    return null;
  }
}

// Saves a position for next launch. Failing to save only means the frog
// starts bottom-right next time, so errors are logged and otherwise ignored.
function savePosition(position) {
  try {
    localStorage.setItem(window.CONTROLS_CONFIG.positionStorageKey, JSON.stringify(position));
  } catch (error) {
    console.warn('Could not save the frog position:', error);
  }
}

// Puts the frog where it should start: the saved spot if the frog still fits
// fully on this screen there, otherwise the bottom-right corner. Call after
// the sprite has its size (i.e. after the first spriteAnimator.play()).
function placeAvatar(avatar, visibleParts) {
  const offsets = getVisibleOffsets(avatar, visibleParts);
  const saved = loadSavedPosition();
  const position = saved && isOnScreen(saved, offsets) ? saved : getBottomRightPosition(offsets);
  moveAvatarTo(avatar, position);
}
