// Unit tests for the AI settings store: provider presets, the on/off switch,
// and keeping the API key out of the renderer view.
// Run with: node --test toDoList/test/appSettings.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createSettingsStore } = require('../appSettings');
const CONFIG = require('../config');

/** Creates a store backed by a fresh temp file, optionally pre-filled. */
function makeStore(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-settings-'));
  const filePath = path.join(dir, 'settings.json');
  if (initial) fs.writeFileSync(filePath, JSON.stringify(initial));
  const store = createSettingsStore({ filePath });
  store.load();
  return { store, filePath };
}

// The env var would override the stored key and skew every test.
delete process.env[CONFIG.AI_KEY_ENV_VAR];

test('AI is inactive until switched on, even when configured', () => {
  const { store } = makeStore();
  store.update({ apiKey: 'sk-test' });
  assert.strictEqual(store.isConfigured(), true);
  assert.strictEqual(store.isActive(), false);
  store.update({ enabled: true });
  assert.strictEqual(store.isActive(), true);
});

test('Ollama works without an API key', () => {
  const { store } = makeStore();
  const ollama = CONFIG.AI_PROVIDERS.ollama;
  store.update({ enabled: true, provider: 'ollama', baseUrl: ollama.baseUrl, model: ollama.model });
  assert.strictEqual(store.read().needsApiKey, false);
  assert.strictEqual(store.isActive(), true);
});

test('an unknown provider is ignored', () => {
  const { store } = makeStore();
  store.update({ provider: 'not-a-provider' });
  assert.strictEqual(store.read().provider, CONFIG.AI_DEFAULT_PROVIDER);
});

test('read() never exposes the key, connection() does', () => {
  const { store } = makeStore();
  store.update({ apiKey: 'sk-secret' });
  assert.ok(!JSON.stringify(store.read()).includes('sk-secret'));
  assert.strictEqual(store.read().hasApiKey, true);
  assert.strictEqual(store.connection().apiKey, 'sk-secret');
});

test('a blank key in an update keeps the saved key', () => {
  const { store } = makeStore();
  store.update({ apiKey: 'sk-keep' });
  store.update({ apiKey: '   ' });
  assert.strictEqual(store.connection().apiKey, 'sk-keep');
});

test('settings saved before providers existed get a provider from their URL', () => {
  const { store: known } = makeStore({ baseUrl: CONFIG.AI_PROVIDERS.ollama.baseUrl, model: 'gemma:2b' });
  assert.strictEqual(known.read().provider, 'ollama');
  const { store: other } = makeStore({ baseUrl: 'https://api.groq.com/openai/v1', model: 'x' });
  assert.strictEqual(other.read().provider, 'custom');
});
