/**
 * Turns the AI's to-do list edits into store changes: numbers the list so the
 * model can point at tasks, checks each edit it asks for, and applies them.
 *
 * Free of Electron imports (the store is passed in), so it can be unit tested.
 */

const CONFIG = require('./config');

/**
 * Numbers the list for the AI, e.g. "1. Essay" / "   2. (done) Find sources".
 * The model refers to tasks by these numbers instead of ids, so it can't
 * invent an id; `idsByNumber` maps them back. Only the first `maxItems` tasks
 * are numbered, to keep the request small.
 * Returns { text, idsByNumber }; `text` is '' for an empty list.
 */
function describeList(items, maxItems) {
  const byId = {};
  items.forEach((item) => { byId[item.id] = item; });
  const idsByNumber = {};

  const lines = items.slice(0, maxItems).map((item, index) => {
    const number = index + 1;
    idsByNumber[number] = item.id;
    const indent = '   '.repeat(depthOf(item, byId));
    return indent + number + '. ' + (item.done ? '(done) ' : '') + item.text;
  });
  return { text: lines.join('\n'), idsByNumber: idsByNumber };
}

/** Number of ancestors above an item. Stops on a missing parent or a cycle. */
function depthOf(item, byId) {
  let depth = 0;
  let current = item;
  const seen = {};
  while (current && current.parentId && !seen[current.parentId]) {
    seen[current.parentId] = true;
    current = byId[current.parentId];
    depth++;
  }
  return depth;
}

/** Trims edit text to the store's limits; '' means unusable. */
function cleanText(text) {
  return typeof text === 'string' ? text.trim().slice(0, CONFIG.MAX_ITEM_LENGTH) : '';
}

/**
 * Checks one action against the current list. Returns { op, id, parentId,
 * text } with real ids, or null when the action can't be done (unknown
 * number, blank text, already in that state).
 */
function resolveAction(action, idsByNumber, itemsById) {
  if (action.op === 'add') {
    const text = cleanText(action.text);
    if (!text) return null;
    // An unknown parent number still adds the task, just at the top level.
    return { op: 'add', text: text, parentId: idsByNumber[action.task] || null };
  }

  const id = idsByNumber[action.task];
  const item = id && itemsById[id];
  if (!item) return null;

  if (action.op === 'complete') return item.done ? null : { op: 'complete', id: id };
  if (action.op === 'reopen') return item.done ? { op: 'reopen', id: id } : null;
  if (action.op === 'delete') return { op: 'delete', id: id };
  if (action.op === 'rename') {
    const text = cleanText(action.text);
    return text && text !== item.text ? { op: 'rename', id: id, text: text } : null;
  }
  return null;
}

/**
 * Checks the AI's actions against the list. Drops ones that can't be done,
 * repeats, and anything past CONFIG.MAX_EDIT_ACTIONS.
 * Returns the usable edits, in the order the AI gave them.
 */
function resolveActions(actions, idsByNumber, items) {
  const itemsById = {};
  items.forEach((item) => { itemsById[item.id] = item; });
  const seen = {};
  const resolved = [];

  (actions || []).forEach((action) => {
    if (resolved.length >= CONFIG.MAX_EDIT_ACTIONS) return;
    const edit = resolveAction(action, idsByNumber, itemsById);
    if (!edit) return;
    const key = edit.op + ':' + (edit.id || edit.text.toLowerCase());
    if (seen[key]) return;
    seen[key] = true;
    resolved.push(edit);
  });
  return resolved;
}

/** Text of a task by id, read before an edit changes or removes it. */
function textOf(store, id) {
  const item = store.getItems().find((it) => it.id === id);
  return item ? item.text : '';
}

/**
 * Applies one edit to the store. Returns the line the chat shows for it
 * (e.g. 'Crossed off "Read chapter 3".'), or '' when the store refused it,
 * for example a subtask that was already removed with its parent.
 */
function applyEdit(store, edit) {
  if (edit.op === 'add') {
    const parentText = edit.parentId ? textOf(store, edit.parentId) : '';
    const added = store.add({ text: edit.text, parentId: edit.parentId });
    if (!added) return '';
    return parentText ? 'Added "' + edit.text + '" under "' + parentText + '".' : 'Added "' + edit.text + '".';
  }

  const text = textOf(store, edit.id);
  if (!text) return '';
  if (edit.op === 'complete') return store.toggle(edit.id, true) ? 'Crossed off "' + text + '".' : '';
  if (edit.op === 'reopen') return store.toggle(edit.id, false) ? 'Put "' + text + '" back on the list.' : '';
  if (edit.op === 'rename') return store.rename(edit.id, edit.text) ? 'Changed "' + text + '" to "' + edit.text + '".' : '';
  if (edit.op === 'delete') return store.remove(edit.id) ? 'Removed "' + text + '".' : '';
  return '';
}

/**
 * Applies edits in order. Side effect: changes the store.
 * Returns the chat line for each edit that went through.
 */
function applyEdits(store, edits) {
  return edits.map((edit) => applyEdit(store, edit)).filter(Boolean);
}

module.exports = { describeList, resolveActions, applyEdits };
