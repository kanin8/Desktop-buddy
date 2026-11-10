// Unit tests for the Pomodoro clock formatter.
// Run with: node --test study/test/clock.test.js
const test = require('node:test');
const assert = require('node:assert');

global.window = {};
const { formatClock } = require('../clock');

test('formats whole minutes as mm:ss', () => {
  assert.strictEqual(formatClock(25 * 60 * 1000), '25:00');
  assert.strictEqual(formatClock(5 * 60 * 1000), '05:00');
  assert.strictEqual(formatClock(30 * 60 * 1000), '30:00');
  assert.strictEqual(formatClock(0), '00:00');
});

test('rounds partial seconds up so the clock shows 00:01 until it reaches zero', () => {
  assert.strictEqual(formatClock(1), '00:01');
  assert.strictEqual(formatClock(999), '00:01');
  assert.strictEqual(formatClock(1000), '00:01');
  assert.strictEqual(formatClock(1001), '00:02');
  assert.strictEqual(formatClock(59 * 1000 + 1), '01:00');
});

test('never shows a negative countdown', () => {
  assert.strictEqual(formatClock(-1), '00:00');
  assert.strictEqual(formatClock(-60 * 1000), '00:00');
});

test('falls back to a placeholder for non-finite values', () => {
  assert.strictEqual(formatClock(NaN), '--:--');
  assert.strictEqual(formatClock(Infinity), '--:--');
});
