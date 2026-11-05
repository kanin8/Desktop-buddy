// Tunable constants for the Desktop-buddy host app (everything outside the
// to-do panel, which keeps its own config in toDoList/config.js).
// Kept in one file so ports and timings can be adjusted in a single place.

module.exports = {
  // Auxiliary helper that lets check_spelling.py push text into the avatar's
  // speech bubble. Purely additive: the app is fully usable without it.
  SPELLING_SERVER_PORT: 5000,
  SPELLING_SERVER_HOST: '127.0.0.1',   // loopback only; never expose externally

  BEDTIME_CHECK_MS: 60000,             // how often the clock is polled

  // How often the active window is sampled to detect the user's activity
  // category. Shorter means the avatar reacts sooner, at the cost of more
  // active-window lookups. AI answers are cached per app/site, so a short
  // interval doesn't mean an AI call every few seconds.
  ACTIVITY_POLL_MS: 4000,

  // Wait this long after startup before the first activity check, so the
  // buddy doesn't immediately classify whatever app is already open.
  ACTIVITY_STARTUP_DELAY_MS: 20 * 1000,

  // When the AI couldn't classify a window (AI off, request failed), wait this
  // long before asking about the same window again.
  AI_ACTIVITY_RETRY_MS: 60000,

  // Level 1 idle check-in: after this long without keyboard or mouse input
  // (also counted from startup if nothing has happened yet), the buddy asks
  // "still there?". Fires once per idle stretch.
  IDLE_CHECK_IN_AFTER_MS: 5 * 60 * 1000,

  // How often the system idle time is read for the check-in above.
  IDLE_POLL_MS: 5000,

  // The overlay relies on the cursor position to reveal the "Ask the buddy"
  // option. Electron only forwards mouse moves into a click-through window on
  // some platforms, and screen.getCursorScreenPoint() itself goes stale on
  // X11 (it only reflects motion events the app has received, which a
  // click-through fullscreen overlay never gets). So on X11 the main process
  // streams the pointer from `xinput test-xi2 --root` instead and pushes it to
  // the renderer. These control the fallback poll used where the stream is
  // unavailable.
  CURSOR_POLL_MS: 16,

  // Absolute path to the xinput binary used for the live cursor stream on X11.
  // Overridable so the path can be tuned without a code change; an empty value
  // disables the stream and forces the getCursorScreenPoint fallback poll.
  XINPUT_BIN: '/usr/bin/xinput',

  // Global shortcut that opens the buddy's controls without hovering
  // (Electron accelerator syntax). Control rather than Command on macOS:
  // Cmd+Option+B is already "bookmarks" in Safari and Chrome.
  CONTROLS_SHORTCUT: 'Control+Alt+B',

  // Snooze choices offered in the buddy's More menu, in milliseconds.
  SNOOZE_DURATIONS_MS: {
    '30min': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
  },
  // "Until tomorrow" wakes the buddy at this hour the next day (local time,
  // 24-hour clock).
  SNOOZE_TOMORROW_HOUR: 8,
};