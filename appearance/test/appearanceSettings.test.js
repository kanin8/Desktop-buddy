// Unit tests for the appearance store: defaults, saving, and rejecting or
// clamping bad values so a broken file can't break the theme or opacity.
// Run with: node --test appearance/test/appearanceSettings.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAppearanceStore, DEFAULTS } = require('../appearanceSettings');
const CONFIG = require('../../config');

// Creates a store backed by a fresh temp file, optionally pre-filled.
function makeStore(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-'));
  const filePath = path.join(dir, 'appearance.json');
  if (initial !== undefined) fs.writeFileSync(filePath, typeof initial === 'string' ? initial : JSON.stringify(initial));
  const store = createAppearanceStore({ filePath });
  store.load();
  return { store, filePath };
}

test('starts with the defaults when there is no file', () => {
  const { store } = makeStore();
  assert.deepStrictEqual(store.read(), DEFAULTS);
  assert.strictEqual(store.read().theme, 'system');
});

test('falls back to the defaults when the file is broken', () => {
  const { store } = makeStore('{not json');
  assert.deepStrictEqual(store.read(), DEFAULTS);
});

test('saves a change and loads it again', () => {
  const { store, filePath } = makeStore();
  store.update({ theme: 'light', surfaceOpacity: 1 });

  const reloaded = createAppearanceStore({ filePath });
  reloaded.load();
  assert.deepStrictEqual(reloaded.read(), { theme: 'light', surfaceOpacity: 1 });
});

test('a partial change keeps the other setting', () => {
  const { store } = makeStore({ theme: 'dark', surfaceOpacity: 0.8 });
  store.update({ surfaceOpacity: 0.75 });
  assert.deepStrictEqual(store.read(), { theme: 'dark', surfaceOpacity: 0.75 });
});

test('ignores an unknown theme', () => {
  const { store } = makeStore({ theme: 'purple' });
  assert.strictEqual(store.read().theme, DEFAULTS.theme);
  store.update({ theme: 'neon' });
  assert.strictEqual(store.read().theme, DEFAULTS.theme);
});

test('clamps opacity to the allowed range', () => {
  const { store } = makeStore();
  store.update({ surfaceOpacity: 0.1 });
  assert.strictEqual(store.read().surfaceOpacity, CONFIG.SURFACE_OPACITY_MIN);
  store.update({ surfaceOpacity: 5 });
  assert.strictEqual(store.read().surfaceOpacity, CONFIG.SURFACE_OPACITY_MAX);
});

test('ignores an opacity that is not a number', () => {
  const { store } = makeStore({ surfaceOpacity: 'solid' });
  assert.strictEqual(store.read().surfaceOpacity, DEFAULTS.surfaceOpacity);
  store.update({ surfaceOpacity: NaN });
  assert.strictEqual(store.read().surfaceOpacity, DEFAULTS.surfaceOpacity);
});
