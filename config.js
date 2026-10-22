// Tunable constants for the Desktop-buddy host app (everything outside the
// to-do panel, which keeps its own config in toDoList/config.js).
// Kept in one file so ports and timings can be adjusted in a single place.

module.exports = {
  // Auxiliary helper that lets check_spelling.py push text into the avatar's
  // speech bubble. Purely additive: the app is fully usable without it.
  SPELLING_SERVER_PORT: 5000,
  SPELLING_SERVER_HOST: '127.0.0.1',   // loopback only; never expose externally

  BEDTIME_CHECK_MS: 60000,             // how often the clock is polled

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
};