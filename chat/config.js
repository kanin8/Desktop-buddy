// Tunable wording and numbers for the chat's startup greeting, placement and
// history fading, kept in one place so they can be adjusted without hunting
// through the code.

window.CHAT_CONFIG = {
  // The buddy's first line when the app starts, shown in the speech bubble
  // above the frog.
  startupGreetingText: 'Hi! Are you planning to get some work done today?',

  // How long to wait after startup before playing the greeting, so the frog
  // settles in before it speaks.
  startupGreetingDelayMs: 3000,

  // How long the startup greeting stays in the speech bubble before fading.
  startupGreetingVisibleMs: 10000,

  // Below this much free space above the frog (in pixels), the history moves
  // beside the frog instead, so it never shrinks to a uselessly thin strip.
  historyMinHeightPx: 120,

  // How long the faded history stays fully visible after the user scrolls
  // it, so older messages can be read while scrolling back.
  revealAfterScrollMs: 1500,
};
