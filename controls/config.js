// Tunable numbers for the buddy's controls (dragging now, hover pill and menu
// from step 3), kept in one place so they can be adjusted without hunting.

window.CONTROLS_CONFIG = {
  // How far (in screen pixels) the pointer must move with the button held
  // before it counts as a drag. Anything shorter is a click, so the frog's
  // click reaction still plays when the hand wobbles slightly.
  dragStartThresholdPx: 4,

  // Name under which the dragged position is saved between launches.
  positionStorageKey: 'buddy.avatarPosition',

  // How long the hover pill stays after the pointer leaves the frog, so the
  // pointer can travel to it (or to the menu) without it vanishing.
  pillHideDelayMs: 400,

  // How often the frog's position is pushed to the main process while being
  // dragged. The to-do panel is anchored under the frog's feet, and sending
  // every pointermove would flood IPC: ~60 ms keeps the panel glued to the
  // frog without a message per animation frame.
  frogFollowThrottleMs: 60,
};
