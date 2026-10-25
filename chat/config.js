// Tunable numbers for the chat's placement and history fading, kept in one
// place so they can be adjusted without hunting through the code.

window.CHAT_CONFIG = {
  // Below this much free space above the frog (in pixels), the history moves
  // beside the frog instead, so it never shrinks to a uselessly thin strip.
  historyMinHeightPx: 120,

  // How long the faded history stays fully visible after the user scrolls
  // it, so older messages can be read while scrolling back.
  revealAfterScrollMs: 1500,
};
