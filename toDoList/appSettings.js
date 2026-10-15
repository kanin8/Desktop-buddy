/**
 * Main-process settings for the AI feature (enable flag, endpoint, model, key).
 *
 * Stored in Electron's userData directory, never in the repo. The API key is
 * write-only from a renderer's point of view: `read()` reports whether a key
 * exists but not its value, so the key cannot leak into a window's JS context.
 */

const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const DEFAULTS = {
  enabled: false,
  baseUrl: CONFIG.AI_DEFAULT_BASE_URL,
  model: CONFIG.AI_DEFAULT_MODEL,
  apiKey: '',
};

function createSettingsStore({ filePath }) {
  let settings = Object.assign({}, DEFAULTS);

  function load() {
    try {
      var raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (raw && typeof raw === 'object') {
        settings.enabled = !!raw.enabled;
        settings.baseUrl = typeof raw.baseUrl === 'string' && raw.baseUrl.trim()
          ? raw.baseUrl.trim()
          : DEFAULTS.baseUrl;
        settings.model = typeof raw.model === 'string' && raw.model.trim()
          ? raw.model.trim()
          : DEFAULTS.model;
        if (typeof raw.apiKey === 'string') settings.apiKey = raw.apiKey;
      }
    } catch (e) {
      settings = Object.assign({}, DEFAULTS);
    }
  }

  function save() {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      var tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
      fs.renameSync(tmp, filePath);
    } catch (e) {
      // Best-effort: settings failing to persist must not break the app.
    }
  }

  /**
   * The key to actually use. An environment variable wins so a developer or CI
   * run never has to write a secret to disk.
   */
  function resolveApiKey() {
    return process.env[CONFIG.AI_KEY_ENV_VAR] || settings.apiKey || '';
  }

  /** Renderer-safe view: never includes the key itself. */
  function read() {
    return {
      enabled: settings.enabled,
      baseUrl: settings.baseUrl,
      model: settings.model,
      hasApiKey: !!resolveApiKey(),
      keyEnvVar: CONFIG.AI_KEY_ENV_VAR,
      modelHints: CONFIG.AI_FREE_MODEL_HINTS,
      configured: isConfigured(),
    };
  }

  /** True when the AI can actually be used right now. */
  function isConfigured() {
    return !!(resolveApiKey() && settings.baseUrl && settings.model);
  }

  /** `patch.apiKey` is ignored when empty, so a blank field cannot wipe the key. */
  function update(patch) {
    patch = patch || {};
    if (typeof patch.enabled === 'boolean') settings.enabled = patch.enabled;
    if (typeof patch.baseUrl === 'string' && patch.baseUrl.trim()) settings.baseUrl = patch.baseUrl.trim();
    if (typeof patch.model === 'string' && patch.model.trim()) settings.model = patch.model.trim();
    if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) settings.apiKey = patch.apiKey.trim();
    save();
    return read();
  }

  return { load, save, read, update, isConfigured, resolveApiKey };
}

module.exports = { createSettingsStore, DEFAULTS };