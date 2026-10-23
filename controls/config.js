// Tunable numbers for the buddy's controls (dragging now, hover pill and menu
// from step 3), kept in one place so they can be adjusted without hunting.

window.CONTROLS_CONFIG = {
  // How far (in screen pixels) the pointer must move with the button held
  // before it counts as a drag. Anything shorter is a click, so the frog's
  // click reaction still plays when the hand wobbles slightly.
  dragStartThresholdPx: 4,

  // Name under which the dragged position is saved between launches.
  positionStorageKey: 'buddy.avatarPosition',
};
