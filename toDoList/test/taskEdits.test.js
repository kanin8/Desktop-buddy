// Unit tests for turning the AI's list edits into store changes.
// Run with: node --test toDoList/test/taskEdits.test.js
const test = require('node:test');
const assert = require('node:assert');

const { createTodoStore } = require('../todoStore');
const { describeList, resolveActions, applyEdits } = require('../taskEdits');
const CONFIG = require('../config');

/** In-memory store with: 1. Essay, 2. Find sources (under 1), 3. Gym. */
function seeded() {
  const store = createTodoStore({ filePath: null });
  store.add({ text: 'Gym' });
  const essay = store.add({ text: 'Essay' });
  store.add({ text: 'Find sources', parentId: essay.id });
  return store;
}

/** Numbers the list, resolves the actions and applies them, like aiService does. */
function run(store, actions) {
  const list = describeList(store.getItems(), CONFIG.MAX_CONTEXT_ITEMS);
  return applyEdits(store, resolveActions(actions, list.idsByNumber, store.getItems()));
}

const find = (store, text) => store.getItems().find((it) => it.text === text);

test('describeList numbers tasks, indents subtasks and marks done ones', () => {
  const store = seeded();
  store.toggle(find(store, 'Gym').id, true);
  const list = describeList(store.getItems(), 50);
  assert.strictEqual(list.text, '1. Essay\n   2. Find sources\n3. (done) Gym');
  assert.strictEqual(list.idsByNumber[2], find(store, 'Find sources').id);
});

test('describeList only numbers up to the limit', () => {
  const list = describeList(seeded().getItems(), 2);
  assert.strictEqual(Object.keys(list.idsByNumber).length, 2);
});

test('complete crosses a task off and reports it', () => {
  const store = seeded();
  assert.deepStrictEqual(run(store, [{ op: 'complete', task: 3 }]), ['Crossed off "Gym".']);
  assert.strictEqual(find(store, 'Gym').done, true);
});

test('reopen only applies to done tasks', () => {
  const store = seeded();
  assert.deepStrictEqual(run(store, [{ op: 'reopen', task: 3 }]), []);
  store.toggle(find(store, 'Gym').id, true);
  assert.deepStrictEqual(run(store, [{ op: 'reopen', task: 3 }]), ['Put "Gym" back on the list.']);
});

test('rename changes the wording', () => {
  const store = seeded();
  assert.deepStrictEqual(run(store, [{ op: 'rename', task: 1, text: ' Essay draft ' }]),
    ['Changed "Essay" to "Essay draft".']);
  assert.ok(find(store, 'Essay draft'));
});

test('add puts a task at the top, or under the named parent', () => {
  const store = seeded();
  assert.deepStrictEqual(run(store, [{ op: 'add', text: 'Buy milk' }]), ['Added "Buy milk".']);
  assert.strictEqual(store.getItems()[0].text, 'Buy milk');

  // The list is now 1. Buy milk, 2. Essay, ...
  assert.deepStrictEqual(run(store, [{ op: 'add', text: 'Outline', task: 2 }]), ['Added "Outline" under "Essay".']);
  assert.strictEqual(find(store, 'Outline').parentId, find(store, 'Essay').id);
});

test('delete removes the task', () => {
  const store = seeded();
  assert.deepStrictEqual(run(store, [{ op: 'delete', task: 3 }]), ['Removed "Gym".']);
  assert.strictEqual(find(store, 'Gym'), undefined);
});

test('unknown numbers, blank text and repeats are dropped', () => {
  const store = seeded();
  const lines = run(store, [
    { op: 'complete', task: 9 },
    { op: 'rename', task: 1, text: '   ' },
    { op: 'add', text: '' },
    { op: 'complete', task: 3 },
    { op: 'complete', task: 3 },
  ]);
  assert.deepStrictEqual(lines, ['Crossed off "Gym".']);
});

test('an edit on a subtask removed with its parent is skipped', () => {
  const store = seeded();
  const lines = run(store, [{ op: 'delete', task: 1 }, { op: 'complete', task: 2 }]);
  assert.deepStrictEqual(lines, ['Removed "Essay".']);
});

test('no more than MAX_EDIT_ACTIONS edits are kept', () => {
  const actions = Array.from({ length: CONFIG.MAX_EDIT_ACTIONS + 5 }, (_, i) => ({ op: 'add', text: 'Task ' + i }));
  const list = describeList([], 50);
  assert.strictEqual(resolveActions(actions, list.idsByNumber, []).length, CONFIG.MAX_EDIT_ACTIONS);
});
