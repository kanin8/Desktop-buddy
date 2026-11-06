// Unit tests for the Linux launcher text: the --no-sandbox flag, and quoting
// of paths with spaces or special characters on the Exec line.
// Run with: node --test startMenu/test/linuxShortcuts.test.js
const test = require('node:test');
const assert = require('node:assert');

const { buildDesktopEntry } = require('../linuxShortcuts');

// Default launcher inputs for a development checkout; tests override fields.
function buildEntry(overrides = {}) {
  return buildDesktopEntry({
    electronPath: '/home/sam/buddy/node_modules/electron/dist/electron',
    projectRoot: '/home/sam/buddy',
    isPackaged: false,
    iconPath: '/home/sam/buddy/icon.png',
    wmClass: 'avatar-poc',
    ...overrides,
  });
}

// The value of one key in the launcher text.
function readKey(entry, key) {
  const line = entry.split('\n').find((candidate) => candidate.startsWith(`${key}=`));
  return line && line.slice(key.length + 1);
}

test('starts with the desktop entry header and is an application', () => {
  const entry = buildEntry();
  assert.ok(entry.startsWith('[Desktop Entry]\n'));
  assert.strictEqual(readKey(entry, 'Type'), 'Application');
  assert.strictEqual(readKey(entry, 'Name'), 'Desktop Buddy');
  assert.strictEqual(readKey(entry, 'Icon'), '/home/sam/buddy/icon.png');
});

test('passes --no-sandbox before the project path', () => {
  assert.strictEqual(
    readKey(buildEntry(), 'Exec'),
    '"/home/sam/buddy/node_modules/electron/dist/electron" --no-sandbox "/home/sam/buddy"'
  );
});

test('a packaged build gets no project path', () => {
  assert.strictEqual(
    readKey(buildEntry({ electronPath: '/opt/buddy/buddy', isPackaged: true }), 'Exec'),
    '"/opt/buddy/buddy" --no-sandbox'
  );
});

test('keeps paths with spaces as one argument', () => {
  const exec = readKey(buildEntry({ projectRoot: '/home/sam/My Projects/buddy' }), 'Exec');
  assert.ok(exec.endsWith(' "/home/sam/My Projects/buddy"'));
});

test('escapes quotes, dollar signs, backslashes and percent signs', () => {
  const exec = readKey(buildEntry({ projectRoot: '/home/sam/a"b$c\\d%e' }), 'Exec');
  // Per the desktop entry spec: \" for a quote, \\$ for $, four backslashes
  // for one literal backslash, %% for a percent sign.
  assert.ok(exec.endsWith(' "/home/sam/a\\\\"b\\\\$c\\\\\\\\d%%e"'));
});
