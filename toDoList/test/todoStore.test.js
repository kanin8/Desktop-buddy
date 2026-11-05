// Unit tests for the main-process task tree store.
// Run with: node --test toDoList/test/todoStore.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createTodoStore } = require('../todoStore');

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-store-'));
  const store = createTodoStore({ filePath: path.join(dir, 'todos.json'), debounceMs: 0 });
  store.load();
  return { store, dir };
}

/**
 * Builds a known tree. `add` puts new tasks at the top, so the resulting order
 * is: Sibling, Parent, Kid one, Kid two — with the two kids nested under Parent.
 */
function seeded() {
  const { store, dir } = tempStore();
  const parent = store.add({ text: 'Parent' });
  const kid1 = store.add({ text: 'Kid one', parentId: parent.id });
  const kid2 = store.add({ text: 'Kid two', parentId: parent.id });
  const sibling = store.add({ text: 'Sibling' });
  return { store, dir, parent, kid1, kid2, sibling };
}

const texts = (store) => store.getItems().map((i) => i.text);
const ids = (store) => store.getItems().map((i) => i.id);
const parentOf = (store, id) => store.getItems().find((i) => i.id === id).parentId;

test('add puts new tasks at the top and returns the item', () => {
  const { store } = tempStore();
  store.add({ text: 'first' });
  store.add({ text: 'second' });
  assert.deepStrictEqual(texts(store), ['second', 'first']);
  assert.match(store.getItems()[0].id, /\S/);
});

test('add rejects blank text and trims input', () => {
  const { store } = tempStore();
  assert.strictEqual(store.add({ text: '   ' }), null);
  assert.strictEqual(texts(store).length, 0);
  store.add({ text: '  padded  ' });
  assert.deepStrictEqual(texts(store), ['padded']);
});

test('add under a parent appends the subtask to that parent block', () => {
  const { store, parent } = seeded();
  store.add({ text: 'Kid three', parentId: parent.id });
  assert.deepStrictEqual(texts(store), ['Sibling', 'Parent', 'Kid one', 'Kid two', 'Kid three']);
});

test('add with an unknown parent is rejected', () => {
  const { store } = seeded();
  assert.strictEqual(store.add({ text: 'orphan', parentId: 'nope' }), null);
});

test('move nests a task under a target as its last subtask', () => {
  const { store, parent, sibling } = seeded();
  assert.ok(store.move(sibling.id, { kind: 'childLast', targetId: parent.id }));
  assert.deepStrictEqual(texts(store), ['Parent', 'Kid one', 'Kid two', 'Sibling']);
  assert.strictEqual(parentOf(store, sibling.id), parent.id);
});

test('move after a task lands past its whole subtree', () => {
  const { store, parent, kid2, sibling } = seeded();
  assert.ok(store.move(sibling.id, { kind: 'after', targetId: kid2.id }));
  // Sibling stays a top-level task and follows Parent's entire block, rather
  // than being wedged between Parent and its first subtask.
  assert.deepStrictEqual(texts(store), ['Parent', 'Kid one', 'Kid two', 'Sibling']);
  // Same level as the drop target, so it becomes a sibling of that subtask.
  assert.strictEqual(parentOf(store, sibling.id), parent.id);
});

test('move after a parent keeps the block contiguous', () => {
  const { store, parent, sibling } = seeded();
  assert.ok(store.move(parent.id, { kind: 'after', targetId: sibling.id }));
  assert.deepStrictEqual(texts(store), ['Sibling', 'Parent', 'Kid one', 'Kid two']);
});

test('move before a subtask inserts at the same level', () => {
  const { store, parent, kid2, sibling } = seeded();
  assert.ok(store.move(sibling.id, { kind: 'before', targetId: kid2.id }));
  assert.deepStrictEqual(texts(store), ['Parent', 'Kid one', 'Sibling', 'Kid two']);
  assert.strictEqual(parentOf(store, sibling.id), parent.id);
});

test('move refuses to drop a task into its own subtree', () => {
  const { store, parent, kid1 } = seeded();
  const before = ids(store);
  assert.strictEqual(store.move(parent.id, { kind: 'childLast', targetId: kid1.id }), false);
  assert.deepStrictEqual(ids(store), before);
});

test('move refuses a no-op move onto itself', () => {
  const { store, parent } = seeded();
  assert.strictEqual(store.move(parent.id, { kind: 'after', targetId: parent.id }), false);
});

test('moving a parent carries its subtasks along', () => {
  const { store, parent, sibling } = seeded();
  assert.ok(store.move(parent.id, { kind: 'before', targetId: sibling.id }));
  assert.deepStrictEqual(texts(store), ['Parent', 'Kid one', 'Kid two', 'Sibling']);
});

test('shift reorders among siblings', () => {
  const { store, sibling } = seeded();
  assert.ok(store.shift(sibling.id, 'down'));
  assert.deepStrictEqual(texts(store), ['Parent', 'Kid one', 'Kid two', 'Sibling']);
  assert.strictEqual(store.shift(sibling.id, 'down'), false, 'already last');
});

test('shift up moves back toward the top', () => {
  const { store, sibling } = seeded();
  store.shift(sibling.id, 'down');
  assert.ok(store.shift(sibling.id, 'up'));
  assert.deepStrictEqual(texts(store), ['Sibling', 'Parent', 'Kid one', 'Kid two']);
  assert.strictEqual(store.shift(sibling.id, 'up'), false, 'already first');
});

test('shift indents under the previous sibling and outdents back', () => {
  const { store, parent, sibling } = seeded();
  store.shift(sibling.id, 'down');                       // Parent, kids, Sibling
  assert.ok(store.shift(sibling.id, 'indent'));           // nest under Parent
  assert.strictEqual(parentOf(store, sibling.id), parent.id);
  assert.deepStrictEqual(texts(store), ['Parent', 'Kid one', 'Kid two', 'Sibling']);
  assert.ok(store.shift(sibling.id, 'outdent'));
  assert.strictEqual(parentOf(store, sibling.id), null);
  assert.deepStrictEqual(texts(store), ['Parent', 'Kid one', 'Kid two', 'Sibling']);
});

test('shift indent needs a previous sibling', () => {
  const { store, sibling } = seeded();
  assert.strictEqual(store.shift(sibling.id, 'indent'), false, 'already first');
});

test('shift outdent is a no-op at the top level', () => {
  const { store, sibling } = seeded();
  assert.strictEqual(store.shift(sibling.id, 'outdent'), false);
});

test('completing a top-level task completes subtasks and parks the block at the end', () => {
  const { store, parent } = seeded();
  assert.ok(store.toggle(parent.id, true));
  assert.deepStrictEqual(texts(store), ['Sibling', 'Parent', 'Kid one', 'Kid two']);
  store.getItems().forEach((i) => {
    assert.strictEqual(i.done, i.text !== 'Sibling', 'only the parent block completed');
  });
});

test('reopening a top-level task restores its original position', () => {
  const { store, parent } = seeded();
  store.toggle(parent.id, true);
  assert.ok(store.toggle(parent.id, false));
  assert.deepStrictEqual(texts(store), ['Sibling', 'Parent', 'Kid one', 'Kid two']);
  assert.ok(store.getItems().every((i) => !i.done));
});

test('reopening a task keeps it above still-completed work', () => {
  const { store, parent, sibling } = seeded();
  store.toggle(sibling.id, true);          // Sibling done, block at the end
  store.toggle(parent.id, true);           // Parent block after Sibling
  store.toggle(sibling.id, false);         // Sibling restored
  const items = store.getItems();
  assert.strictEqual(items[items.length - 1].done, true, 'completed block stays last');
  assert.strictEqual(items.find((i) => i.text === 'Sibling').done, false);
  assert.ok(
    items.findIndex((i) => i.text === 'Sibling') < items.findIndex((i) => i.done),
    'the reopened task sits above the completed work'
  );
});

test('completing a subtask leaves it under its parent, in place', () => {
  const { store, parent, kid1 } = seeded();
  assert.ok(store.toggle(kid1.id, true));
  assert.deepStrictEqual(texts(store), ['Sibling', 'Parent', 'Kid one', 'Kid two']);
  assert.strictEqual(store.getItems().find((i) => i.id === kid1.id).done, true);
  assert.strictEqual(store.getItems().find((i) => i.id === parent.id).done, false);
});

test('completed tasks stay below pending ones after a cross-boundary move', () => {
  const { store, parent, kid2, sibling } = seeded();
  store.toggle(parent.id, true);                       // completed block at the end
  store.move(sibling.id, { kind: 'after', targetId: kid2.id });
  const items = store.getItems();
  assert.strictEqual(items[items.length - 1].text, 'Kid two', 'completed block still last');
  assert.strictEqual(items.find((i) => i.id === sibling.id).done, false, 'still pending');
  assert.strictEqual(parentOf(store, sibling.id), null, 'boundary drop is a clean top-level task');
});

test('toggle is idempotent', () => {
  const { store, sibling } = seeded();
  assert.strictEqual(store.toggle(sibling.id, true), true, 'first toggle changes state');
  assert.strictEqual(store.toggle(sibling.id, true), false, 'already completed');
});

test('remove deletes the task and its subtasks', () => {
  const { store, parent } = seeded();
  assert.ok(store.remove(parent.id));
  assert.deepStrictEqual(texts(store), ['Sibling']);
});

test('clearCompleted removes only completed tasks', () => {
  const { store, kid1 } = seeded();
  store.toggle(kid1.id, true);
  store.clearCompleted();
  assert.deepStrictEqual(texts(store), ['Sibling', 'Parent', 'Kid two']);
});

test('toggleExpanded flips the flag', () => {
  const { store, parent } = seeded();
  store.toggleExpanded(parent.id);
  assert.strictEqual(store.getItems().find((i) => i.id === parent.id).collapsed, true);
});

test('addSubtasks creates a parent plus nested children', () => {
  const { store } = tempStore();
  const result = store.addSubtasks({
    parentText: 'Write my thesis',
    subtasks: ['Outline chapters', 'Draft intro', 'Revise'],
  });
  assert.strictEqual(result.itemIds.length, 4);
  const items = store.getItems();
  assert.strictEqual(items[0].text, 'Write my thesis');
  assert.strictEqual(items[0].parentId, null);
  items.slice(1).forEach((i) => assert.strictEqual(i.parentId, result.parentId));
});

test('addSubtasks with no subtasks still creates the parent', () => {
  const { store } = tempStore();
  const result = store.addSubtasks({ parentText: 'Solo goal', subtasks: [] });
  assert.deepStrictEqual(texts(store), ['Solo goal']);
  assert.strictEqual(result.itemIds.length, 1);
});

test('undo removes the last AI insert and nothing earlier', () => {
  const { store } = tempStore();
  store.add({ text: 'Existing task' });
  store.addSubtasks({ parentText: 'Goal', subtasks: ['one', 'two'] });
  assert.ok(store.canUndo());
  assert.ok(store.undoLastInsert());
  assert.deepStrictEqual(texts(store), ['Existing task']);
  assert.strictEqual(store.canUndo(), false);
});

test('undo is one step only', () => {
  const { store } = tempStore();
  store.addSubtasks({ parentText: 'First goal', subtasks: [] });
  store.addSubtasks({ parentText: 'Second goal', subtasks: ['a'] });
  store.undoLastInsert();
  assert.deepStrictEqual(texts(store), ['First goal']);
});

test('deleting the undone insert clears the undo pointer', () => {
  const { store } = tempStore();
  const inserted = store.addSubtasks({ parentText: 'Goal', subtasks: [] });
  store.remove(inserted.parentId);
  assert.strictEqual(store.canUndo(), false);
});

test('changes notify listeners with a snapshot', () => {
  const { store } = tempStore();
  const seen = [];
  store.onChange((items) => seen.push(items));
  store.add({ text: 'one' });
  store.add({ text: '' });            // no-op: must not notify
  assert.strictEqual(seen.length, 1);
  seen[0].push({ id: 'hack' });        // snapshot must be a copy
  assert.strictEqual(store.getItems().length, 1);
});

test('state survives a reload from disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-persist-'));
  const file = path.join(dir, 'todos.json');

  const first = createTodoStore({ filePath: file, debounceMs: 0 });
  first.load();
  const added = first.add({ text: 'Kept' });
  first.toggleExpanded(added.id);
  first.flush();

  const second = createTodoStore({ filePath: file, debounceMs: 0 });
  second.load();
  assert.deepStrictEqual(texts(second), ['Kept']);
  assert.strictEqual(second.getItems()[0].collapsed, true);
});

test('the undo pointer survives a reload', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-undo-persist-'));
  const file = path.join(dir, 'todos.json');

  const first = createTodoStore({ filePath: file, debounceMs: 0 });
  first.load();
  first.add({ text: 'Existing' });
  first.addSubtasks({ parentText: 'Goal', subtasks: ['step'] });
  first.flush();

  const second = createTodoStore({ filePath: file, debounceMs: 0 });
  second.load();
  assert.ok(second.canUndo());
  assert.ok(second.undoLastInsert());
  assert.deepStrictEqual(texts(second), ['Existing']);
});

test('a corrupt file loads as an empty list instead of throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-corrupt-'));
  const file = path.join(dir, 'todos.json');
  fs.writeFileSync(file, '{not json');
  const store = createTodoStore({ filePath: file, debounceMs: 0 });
  store.load();
  assert.deepStrictEqual(store.getItems(), []);
});

test('malformed rows are dropped and ids are repaired on load', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-bad-'));
  const file = path.join(dir, 'todos.json');
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    items: [
      { text: 'good', done: false },
      { text: 'also good', done: false },
      null,
      { done: false },                  // no text: unusable
      { id: 'same', text: 'dup a' },
      { id: 'same', text: 'dup b' },
    ],
  }));
  const store = createTodoStore({ filePath: file, debounceMs: 0 });
  store.load();
  const items = store.getItems();
  assert.strictEqual(items.length, 4);
  assert.strictEqual(new Set(items.map((i) => i.id)).size, 4, 'ids unique');
});

test('subtasks with a missing parent are re-rooted, not lost', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-orphan-'));
  const file = path.join(dir, 'todos.json');
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    items: [{ id: 'x', text: 'orphan', parentId: 'ghost' }],
  }));
  const store = createTodoStore({ filePath: file, debounceMs: 0 });
  store.load();
  assert.strictEqual(store.getItems()[0].parentId, null);
});

test('random operations keep the tree valid', () => {
  const { store } = tempStore();
  ['a', 'b', 'c', 'd'].forEach((t) => store.add({ text: t }));

  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

  for (let step = 0; step < 250; step++) {
    const live = store.getItems();
    if (!live.length) break;
    const pick = live[rnd(live.length)];
    const op = rnd(4);

    if (op === 0) {
      const other = live[rnd(live.length)];
      if (other.id === pick.id) continue;
      store.move(pick.id, { kind: ['before', 'after', 'childLast'][rnd(3)], targetId: other.id });
    } else if (op === 1) {
      store.shift(pick.id, ['up', 'down', 'indent', 'outdent'][rnd(4)]);
    } else if (op === 2) {
      store.toggle(pick.id, !pick.done);
    } else {
      store.toggleExpanded(pick.id);
    }

    // Invariants that must hold after every single operation.
    const items = store.getItems();
    const pos = new Map(items.map((i, index) => [i.id, index]));
    items.forEach((i) => {
      assert.ok(!i.parentId || pos.has(i.parentId), 'parent exists');
      assert.ok(!i.parentId || pos.get(i.parentId) < pos.get(i.id), 'parent precedes child');
      // Depth-first storage: a subtask must directly follow a block of rows
      // that all belong under it.
      if (i.parentId) {
        let cursor = pos.get(i.id) - 1;
        while (cursor >= 0 && items[cursor].parentId) {
          if (items[cursor].parentId !== i.parentId) break;
          cursor--;
        }
        assert.strictEqual(items[cursor].id, i.parentId, 'subtasks are contiguous under their parent');
      }
    });
    const tops = items.filter((i) => !i.parentId);
    const lastPending = tops.map((i, index) => ({ i, index })).filter((o) => !o.i.done).map((o) => o.index).pop();
    const firstDone = tops.map((i, index) => ({ i, index })).filter((o) => o.i.done).map((o) => o.index)[0];
    if (lastPending !== undefined && firstDone !== undefined) {
      assert.ok(lastPending < firstDone, 'completed tasks below pending ones');
    }
  }
});
test('rename changes the text and rejects blank or unknown tasks', () => {
  const { store, parent } = seeded();
  assert.strictEqual(store.rename(parent.id, '  Renamed  '), true);
  assert.ok(texts(store).includes('Renamed'));
  assert.strictEqual(store.rename(parent.id, '   '), false);
  assert.strictEqual(store.rename('nope', 'x'), false);
});
