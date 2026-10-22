// Tunable layout/timing constants for the to-do list window.
// Kept in one file so geometry and re-assert timing can be adjusted without
// hunting through the window logic.

module.exports = {
  // Panel geometry
  WINDOW_WIDTH: 320,      // fixed width; the panel grows vertically only
  DEFAULT_HEIGHT: 120,    // height on first paint, before the renderer reports its own
  MIN_HEIGHT: 60,         // floor so the header row is never clipped
  SCREEN_MARGIN: 16,      // gap between the panel and the screen edges

  // Stacking
  TOP_REASSERT_MS: 5000,  // how often to re-assert always-on-top (see todoWindow.js)
};