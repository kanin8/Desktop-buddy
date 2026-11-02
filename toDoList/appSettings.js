/**
 * Main-process settings for every AI feature (on/off, provider, endpoint,
 * model, key). The chat, task breakdown and activity classification all read
 * from this one store.
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
  provider: CONFIG.AI_DEFAULT_PROVIDER,
  baseUrl: CONFIG.AI_DEFAULT_BASE_URL,
  model: CONFIG.AI_DEFAULT_MODEL,
  apiKey: '',
};

function isKnownProvider(provider) {
  return typeof provider === 'string' && Object.prototype.hasOwnProperty.call(CONFIG.AI_PROVIDERS, provider);
}

/**
 * Files saved before providers existed only have a URL. Picks the preset that
 * URL belongs to, or 'custom' so an unknown endpoint keeps working.
 */
function providerForBaseUrl(baseUrl) {
  var match = Object.keys(CONFIG.AI_PROVIDERS).find(function (id) {
    return id !== 'custom' && CONFIG.AI_PROVIDERS[id].baseUrl === baseUrl;
  });
  return match || 'custom';
}

/** Returns `value` trimmed, or `fallback` when it is not a non-empty string. */
function nonEmptyString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function createSettingsStore({ filePath }) {
  let settings = Object.assign({}, DEFAULTS);

  function load() {
    try {
      var raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (raw && typeof raw === 'object') {
        settings.enabled = !!raw.enabled;
        settings.baseUrl = nonEmptyString(raw.baseUrl, DEFAULTS.baseUrl);
        settings.provider = isKnownProvider(raw.provider)
          ? raw.provider
          : providerForBaseUrl(settings.baseUrl);
        settings.model = nonEmptyString(raw.model, DEFAULTS.model);
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

  function needsApiKey() {
    return CONFIG.AI_PROVIDERS[settings.provider].needsApiKey;
  }

  /** True when every field the provider needs is filled in. */
  function isConfigured() {
    var hasKey = !needsApiKey() || !!resolveApiKey();
    return !!(hasKey && settings.baseUrl && settings.model);
  }

  /** True when AI features should run: switched on and fully configured. */
  function isActive() {
    return settings.enabled && isConfigured();
  }

  /** Connection details for `ai.js` calls. Main process only: includes the key. */
  function connection() {
    return { provider: settings.provider, baseUrl: settings.baseUrl, apiKey: resolveApiKey(), model: settings.model };
  }

  /** Renderer-safe view: never includes the key itself. */
  function read() {
    return {
      enabled: settings.enabled,
      provider: settings.provider,
      providers: CONFIG.AI_PROVIDERS,
      baseUrl: settings.baseUrl,
      model: settings.model,
      hasApiKey: !!resolveApiKey(),
      keyFromEnv: !!process.env[CONFIG.AI_KEY_ENV_VAR],
      keyEnvVar: CONFIG.AI_KEY_ENV_VAR,
      needsApiKey: needsApiKey(),
      configured: isConfigured(),
    };
  }

  /** `patch.apiKey` is ignored when empty, so a blank field cannot wipe the key. */
  function update(patch) {
    patch = patch || {};
    if (typeof patch.enabled === 'boolean') settings.enabled = patch.enabled;
    if (isKnownProvider(patch.provider)) settings.provider = patch.provider;
    settings.baseUrl = nonEmptyString(patch.baseUrl, settings.baseUrl);
    settings.model = nonEmptyString(patch.model, settings.model);
    settings.apiKey = nonEmptyString(patch.apiKey, settings.apiKey);
    save();
    return read();
  }

  return { load, save, read, update, isConfigured, isActive, connection, resolveApiKey };
}

module.exports = { createSettingsStore, DEFAULTS };
