/**
 * Task tree store for the to-do list — the single source of truth.
 *
 * Items are kept in a flat array in depth-first order, so a task and all of its
 * subtasks are always one contiguous slice. That makes every tree operation a
 * pair of splices and keeps persistence trivial (the array IS the document).
 *
 * Deliberately free of Electron imports: `filePath` is injected so the store can
 * be unit tested against a temp directory. See todoService.js for the Electron
 * wiring (IPC channels, broadcasting to windows).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CONFIG = require('./config');

// Insertion intents. `move` uses these against an explicit target; `shift`
// resolves them against the item's current siblings.
const MODE_BEFORE = 'before';
const MODE_AFTER = 'after';
const MODE_CHILD = 'childLast';

const DIRECTIONS = {
  up: MODE_BEFORE,
  down: MODE_AFTER,
  indent: MODE_CHILD,
  outdent: MODE_AFTER,
};

function createTodoStore({ filePath, debounceMs = CONFIG.STORE_DEBOUNCE_MS } = {}) {
  /** Depth-first ordered tasks. Each: { id, text, done, parentId, collapsed, createdAt }. */
  let items = [];
  /** Parent id of the most recent AI insert, so the panel can undo it in one step. */
  let lastInsertId = null;
  /** Callbacks invoked after every mutation that changed something. */
  const listeners = [];
  let writeTimer = null;

  // ---------------------------------------------------------------- ids ---

  function generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  // --------------------------------------------------------- tree helpers ---

  function indexOfId(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
    return -1;
  }

  function findById(id) {
    var i = indexOfId(id);
    return i < 0 ? null : items[i];
  }

  /** Number of ancestors above an item. Also guards against a corrupt parent cycle. */
  function depthOf(item) {
    var depth = 0, cur = item, seen = {};
    while (cur && cur.parentId && !seen[cur.parentId]) {
      seen[cur.parentId] = true;
      cur = findById(cur.parentId);
      if (!cur) break;
      depth++;
    }
    return depth;
  }

  /**
   * Range of the subtree rooted at `id`. The array is depth-first, so the subtree
   * runs until the first following row that is not deeper than the root.
   */
  function subtreeRange(id) {
    var start = indexOfId(id);
    if (start < 0) return null;
    var rootDepth = depthOf(items[start]);
    var end = start;
    for (var i = start + 1; i < items.length; i++) {
      if (depthOf(items[i]) <= rootDepth) break;
      end = i;
    }
    return { start: start, end: end };
  }

  function isAncestor(ancestorId, nodeId) {
    var range = subtreeRange(ancestorId);
    var index = indexOfId(nodeId);
    if (!range || index < 0) return false;
    return index >= range.start && index <= range.end;
  }

  /** Ids of every sibling at one level, in display order. */
  function siblingIds(parentId) {
    return items.filter(function (it) { return it.parentId === (parentId || null); })
      .map(function (it) { return it.id; });
  }

  /** Ids of a task's direct children, in display order. */
  function childIds(parentId) {
    return items.filter(function (it) { return it.parentId === parentId; })
      .map(function (it) { return it.id; });
  }

  function firstDoneIndex(list) {
    for (var i = 0; i < list.length; i++) if (list[i].done) return i;
    return -1;
  }

  // ------------------------------------------------------------ mutation ---

  function notify() {
    var snapshot = getItems();
    listeners.forEach(function (fn) { fn(snapshot); });
  }

  function markChanged() {
    scheduleWrite();
    notify();
  }

  /**
   * Splice a block into the list at `base`, keeping completed tasks below open
   * ones. A block that would cross that boundary lands on it instead, as a
   * top-level task, so the tree stays valid.
   */
  function spliceBlock(block, base) {
    var rest = block.rest;
    var clamped = false;
    var firstDone = firstDoneIndex(rest);

    if (block.root.done) {
      if (firstDone < 0 || base < firstDone) { base = rest.length; clamped = true; }
    } else if (firstDone >= 0 && base > firstDone) {
      base = firstDone; clamped = true;
    }
    if (clamped) block.root.parentId = null;

    items = rest.slice(0, base).concat(block.slice, rest.slice(base));
    return clamped;
  }

  /** Move a task (and its subtree) relative to an explicit target. */
  function move(id, { kind, targetId }) {
    if (!id || !targetId || id === targetId) return false;
    if (isAncestor(id, targetId)) return false;  // cannot drop a task into itself

    var range = subtreeRange(id);
    if (!range) return false;
    var slice = items.slice(range.start, range.end + 1);
    var rest = items.slice(0, range.start).concat(items.slice(range.end + 1));

    var targetIndex = -1;
    for (var t = 0; t < rest.length; t++) if (rest[t].id === targetId) targetIndex = t;
    if (targetIndex < 0) return false;
    var target = rest[targetIndex];
    var base;

    if (kind === MODE_CHILD) {
      var targetRange = subtreeRangeIn(rest, targetId);
      base = targetRange.end + 1;
      slice[0].parentId = targetId;
    } else if (kind === MODE_AFTER) {
      // Must land after the target's whole subtree, not between it and its
      // first subtask, or the array stops being depth-first.
      var afterRange = subtreeRangeIn(rest, targetId);
      base = afterRange.end + 1;
      slice[0].parentId = target.parentId;
    } else {
      base = targetIndex;
      slice[0].parentId = target.parentId;
    }

    spliceBlock({ slice: slice, root: slice[0], rest: rest }, base);
    markChanged();
    return true;
  }

  /** Like move(), but resolves the target from the item's current position. */
  function shift(id, direction) {
    var item = findById(id);
    if (!item) return false;
    var mode = DIRECTIONS[direction];
    if (!mode) return false;

    var siblings = siblingIds(item.parentId);
    var pos = siblings.indexOf(id);

    if (direction === 'outdent') {
      if (!item.parentId) return false;
      return move(id, { kind: MODE_AFTER, targetId: item.parentId });
    }
    if (direction === 'indent') {
      if (pos <= 0) return false;
      return move(id, { kind: MODE_CHILD, targetId: siblings[pos - 1] });
    }
    if (direction === 'up') {
      if (pos <= 0) return false;
      return move(id, { kind: MODE_BEFORE, targetId: siblings[pos - 1] });
    }
    if (direction === 'down') {
      if (pos >= siblings.length - 1) return false;
      return move(id, { kind: MODE_AFTER, targetId: siblings[pos + 1] });
    }
    return false;
  }

  /**
   * Complete / reopen a task.
   *  - A top-level task completes its whole subtree and parks that block at the
   *    end; reopening restores it to the slot it came from.
   *  - A subtask stays where it is under its parent, so it never disappears
   *    from the task it belongs to.
   */
  function toggle(id, checked) {
    var item = findById(id);
    if (!item || item.done === !!checked) return false;

    if (item.parentId) {
      item.done = !!checked;
      markChanged();
      return true;
    }

    var range = subtreeRange(id);
    var block = items.slice(range.start, range.end + 1);
    var rest = items.slice(0, range.start).concat(items.slice(range.end + 1));

    if (checked) {
      block.forEach(function (x) { x.done = true; });
      block[0].origIndex = range.start;
      items = rest.concat(block);
    } else {
      block.forEach(function (x) { x.done = false; });
      var at = typeof block[0].origIndex === 'number' ? block[0].origIndex : 0;
      if (at < 0 || at > rest.length) at = rest.length;
      var firstDone = firstDoneIndex(rest);
      if (firstDone >= 0 && at > firstDone) at = firstDone;
      block[0].origIndex = null;
      items = rest.slice(0, at).concat(block, rest.slice(at));
    }
    markChanged();
    return true;
  }

  /** Adds one task. New tasks go to the top until they are dragged elsewhere. */
  function add({ text, parentId }) {
    var value = String(text == null ? '' : text).trim().slice(0, CONFIG.MAX_ITEM_LENGTH);
    if (!value) return null;
    var item = {
      id: generateId(),
      text: value,
      done: false,
      parentId: parentId || null,
      collapsed: false,
      createdAt: Date.now(),
    };
    if (parentId) {
      var parent = findById(parentId);
      if (!parent) return null;
      var range = subtreeRange(parentId);
      items = items.slice(0, range.end + 1).concat([item], items.slice(range.end + 1));
    } else {
      items.unshift(item);
    }
    markChanged();
    return item;
  }

  /**
   * Inserts an AI-generated goal as a parent task plus its subtasks.
   * Returns the ids that were created so they can be reported or undone.
   */
  function addSubtasks({ parentText, subtasks }) {
    var parent = add({ text: parentText });
    if (!parent) return null;

    // Set before the children are added: each add() broadcasts, and a panel that
    // asks "can I undo?" mid-insert must already be told yes.
    lastInsertId = parent.id;

    var created = [];
    subtasks.forEach(function (text) {
      var child = add({ text: text, parentId: parent.id });
      if (child) created.push(child.id);
    });

    // Final broadcast so the panel redraws once with the complete tree.
    markChanged();
    return { parentId: parent.id, itemIds: [parent.id].concat(created) };
  }

  /** Removes the last AI insert (parent and subtasks). One step only. */
  function undoLastInsert() {
    if (!lastInsertId) return false;
    var removed = remove(lastInsertId);
    lastInsertId = null;
    return removed;
  }

  function canUndo() {
    return !!lastInsertId;
  }

  /** Deletes a task and everything nested under it. */
  function remove(id) {
    var range = subtreeRange(id);
    if (!range) return false;
    // Forget the undo pointer if the insert being undone just got deleted anyway.
    var undoIndex = lastInsertId ? indexOfId(lastInsertId) : -1;
    if (undoIndex >= range.start && undoIndex <= range.end) lastInsertId = null;
    items = items.slice(0, range.start).concat(items.slice(range.end + 1));
    markChanged();
    return true;
  }

  function clearCompleted() {
    var before = items.length;
    items = items.filter(function (it) { return !it.done; });
    if (items.length === before) return false;
    markChanged();
    return true;
  }

  /** Changes a task's wording. Blank text is rejected, so a task is never emptied. */
  function rename(id, text) {
    var item = findById(id);
    var value = String(text == null ? '' : text).trim().slice(0, CONFIG.MAX_ITEM_LENGTH);
    if (!item || !value || item.text === value) return false;
    item.text = value;
    markChanged();
    return true;
  }

  function toggleExpanded(id) {
    var item = findById(id);
    if (!item) return false;
    item.collapsed = !item.collapsed;
    markChanged();
    return true;
  }

  /** subtreeRange against an arbitrary list, used while a block is detached. */
  function subtreeRangeIn(list, id) {
    var index = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) index = i;
    if (index < 0) return null;

    var byId = {};
    list.forEach(function (it) { byId[it.id] = it; });
    function depthIn(item) {
      var depth = 0, cur = item, seen = {};
      while (cur && cur.parentId && !seen[cur.parentId]) {
        seen[cur.parentId] = true;
        cur = byId[cur.parentId];
        if (!cur) break;
        depth++;
      }
      return depth;
    }
    var rootDepth = depthIn(list[index]);
    var end = index;
    for (var j = index + 1; j < list.length; j++) {
      if (depthIn(list[j]) <= rootDepth) break;
      end = j;
    }
    return { start: index, end: end };
  }

  // -------------------------------------------------------- persistence ---

  function serialize() {
    return JSON.stringify({
      version: 1,
      lastInsertId: lastInsertId,
      items: items.map(function (it) {
        return {
          id: it.id,
          text: it.text,
          done: it.done,
          parentId: it.parentId,
          collapsed: !!it.collapsed,
          createdAt: it.createdAt || 0,
          origIndex: typeof it.origIndex === 'number' ? it.origIndex : null,
        };
      }),
    }, null, 2);
  }

  /** Writes via a temp file + rename so a crash mid-write cannot truncate the list. */
  function writeNow() {
    if (!filePath) return;
    var tmp = filePath + '.tmp';
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(tmp, serialize(), 'utf8');
      fs.renameSync(tmp, filePath);
    } catch (e) {
      // Persistence is best-effort: a failure here must not break the UI.
    }
  }

  function scheduleWrite() {
    if (!filePath || !debounceMs) { writeNow(); return; }
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(function () { writeTimer = null; writeNow(); }, debounceMs);
  }

  /** Coerces anything read off disk into valid items, dropping unusable rows. */
  function normalize(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    return list.filter(function (it) {
      if (!it || typeof it !== 'object' || typeof it.text !== 'string') return false;
      if (!it.id) it.id = generateId();
      while (seen[it.id]) it.id = generateId();
      seen[it.id] = true;
      it.done = !!it.done;
      it.parentId = it.parentId || null;
      it.collapsed = !!it.collapsed;
      if (it.text.length > CONFIG.MAX_ITEM_LENGTH) it.text = it.text.slice(0, CONFIG.MAX_ITEM_LENGTH);
      return true;
    });
  }

  /** Re-roots subtasks whose parent is missing, rather than losing the task. */
  function dropOrphans() {
    items = items.filter(function (it) {
      if (!it.parentId) return true;
      if (findById(it.parentId)) return true;
      it.parentId = null;
      return true;
    });
  }

  function load() {
    if (!filePath) return;
    try {
      var raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      items = normalize(raw && raw.items);
      lastInsertId = (raw && raw.lastInsertId) || null;
    } catch (e) {
      items = [];
      lastInsertId = null;
    }
    dropOrphans();
  }

  function flush() {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    writeNow();
  }

  // ------------------------------------------------------------- reads ---

  /** Plain snapshot for renderers; callers must not mutate it. */
  function getItems() {
    return items.map(function (it) { return Object.assign({}, it); });
  }

  function onChange(fn) { listeners.push(fn); }

  return {
    load,
    flush,
    getItems,
    add,
    addSubtasks,
    toggle,
    rename,
    toggleExpanded,
    remove,
    clearCompleted,
    move,
    shift,
    undoLastInsert,
    canUndo,
    onChange,
    // exposed for tests
    _depthOf: depthOf,
    _siblingIds: siblingIds,
    _childIds: childIds,
  };
}

module.exports = { createTodoStore, MODE_BEFORE, MODE_AFTER, MODE_CHILD };