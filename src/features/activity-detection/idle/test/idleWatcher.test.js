// Unit tests for the idle check-in watcher.
// Run with: node --test "src/features/activity-detection/idle/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');

const { IdleWatcher } = require('../idleWatcher');

// A watcher whose idle time is set by the test instead of the OS.
function createWatcher() {
  const state = { idleSeconds: 0, calls: 0 };
  const watcher = new IdleWatcher({
    getIdleSeconds: () => state.idleSeconds,
    onIdle: () => { state.calls++; },
    thresholdMs: 300000,
    pollMs: 5000,
  });
  return { watcher, state };
}

test('does nothing while the user is active', () => {
  const { watcher, state } = createWatcher();
  state.idleSeconds = 299;
  watcher.check();
  assert.strictEqual(state.calls, 0);
});

test('fires once the threshold is reached, and only once per idle stretch', () => {
  const { watcher, state } = createWatcher();
  state.idleSeconds = 300;
  watcher.check();
  state.idleSeconds = 600;
  watcher.check();
  assert.strictEqual(state.calls, 1);
});

test('fires again after the user has been active in between', () => {
  const { watcher, state } = createWatcher();
  state.idleSeconds = 300;
  watcher.check();
  state.idleSeconds = 2;
  watcher.check();
  state.idleSeconds = 300;
  watcher.check();
  assert.strictEqual(state.calls, 2);
});
