// Tunable constants for the Desktop-buddy host app (everything outside the
// to-do panel, which keeps its own config in toDoList/config.js).
// Kept in one file so ports and timings can be adjusted in a single place.

module.exports = {
  // Auxiliary helper that lets check_spelling.py push text into the avatar's
  // speech bubble. Purely additive: the app is fully usable without it.
  SPELLING_SERVER_PORT: 5000,
  SPELLING_SERVER_HOST: '127.0.0.1',   // loopback only; never expose externally

  BEDTIME_CHECK_MS: 60000,             // how often the clock is polled
};