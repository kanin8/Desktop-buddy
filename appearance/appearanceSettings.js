// Stores the user's appearance choices (theme and message transparency) in a
// JSON file. Plain Node only, no Electron, so it can be tested on its own.

const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');

const DEFAULTS = {
  theme: CONFIG.THEME_DEFAULT,
  surfaceOpacity: CONFIG.SURFACE_OPACITY_DEFAULT,
};

function isKnownTheme(theme) {
  return CONFIG.THEME_CHOICES.includes(theme);
}

// Returns opacity limited to the allowed range, or null when it isn't a
// number at all (so a broken value falls back instead of becoming 0.7).
function clampOpacity(opacity) {
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) return null;
  return Math.min(CONFIG.SURFACE_OPACITY_MAX, Math.max(CONFIG.SURFACE_OPACITY_MIN, opacity));
}

// Creates the store for one file. Nothing is read until load() is called.
// - filePath: where the settings live (the app's userData folder).
function createAppearanceStore({ filePath }) {
  let settings = Object.assign({}, DEFAULTS);

  // Reads the file. A missing or broken file just means the defaults.
  function load() {
    settings = Object.assign({}, DEFAULTS);
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (raw && typeof raw === 'object') applyPatch(raw);
    } catch (error) {
      // No file yet, or unreadable: keep the defaults.
    }
  }

  // Writes the file via a temp file, so a crash mid-write can't leave it
  // half-written. Failing to save only means the choice is lost next start.
  function save() {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
      fs.renameSync(tmp, filePath);
    } catch (error) {
      console.error('Could not save appearance settings:', error);
    }
  }

  // Copies the valid fields of patch into settings; anything else is ignored.
  function applyPatch(patch) {
    if (isKnownTheme(patch.theme)) settings.theme = patch.theme;
    const opacity = clampOpacity(patch.surfaceOpacity);
    if (opacity !== null) settings.surfaceOpacity = opacity;
  }

  function read() {
    return Object.assign({}, settings);
  }

  // Applies a partial change ({ theme } and/or { surfaceOpacity }), saves it
  // and returns the new settings.
  function update(patch) {
    applyPatch(patch || {});
    save();
    return read();
  }

  return { load, read, update };
}

module.exports = { createAppearanceStore, DEFAULTS };
