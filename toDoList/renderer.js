// To-do panel renderer: renders the task tree and owns all pointer + keyboard
// reordering.
//
// This file owns no task data. The main process is the single source of truth
// (toDoList/todoStore.js): mutations are sent as intents over IPC and the
// authoritative list arrives back on 'todo-list-changed', which re-renders. That
// keeps the panel in step with AI inserts made from the avatar chat.

(function () {
  var LEGACY_KEY = 'todo-helper-items';
  var COLLAPSE_KEY = 'todo-helper-collapsed';

  // How a dragged block is inserted relative to the row it was dropped on.
  var MODE_BEFORE = 'before';
  var MODE_AFTER = 'after';
  var MODE_CHILD = 'childLast';

  // Vertical drop zones as a fraction of the target row height.
  var BEFORE_ZONE = 0.33;
  var AFTER_ZONE = 0.66;

  // Pixels of auto-scroll per drag event near the edge of the scroll port.
  var EDGE_SCROLL_ZONE = 24;
  var EDGE_SCROLL_STEP = 10;

  var items = [];
  var hasLiveItems = false;   // true once a push from the store has been seen
  var drag = { id: null, targetId: null, mode: null };
  var grab = { id: null };
  // Collapsed by default and not remembered between opens: the section is
  // space-saving on the way in ("13 left" matters), but the user looks in it
  // rarely enough that starting open would waste room instead.
  var groupOpen = false;
  // Ids waiting for their row to appear so it can flash teal once, for
  // example after being added or completed. Applied in buildRow, which is
  // also where the entry is consumed: a row inside a closed section keeps
  // the flash pending until its section is opened.
  var flashIds = {};
  var announceTimer = null;
  var canUndo = false;

  var $ = function (id) { return document.getElementById(id); };
  var list = $('list'), input = $('in'), count = $('count'), clearBtn = $('clear'),
      body = $('body'), app = $('app'), collapseBtn = $('collapse'), sr = $('sr'),
      undoBtn = $('undo');

  // ----------------------------------------------------------- tree reads ---
  // Only the read-only helpers the view needs; every mutation is the store's job.

  function findById(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function childIds(parentId) {
    var out = [];
    for (var i = 0; i < items.length; i++) if (items[i].parentId === parentId) out.push(items[i].id);
    return out;
  }

  // Number of ancestors above an item; drives the indentation.
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

  function pendingCount() {
    return items.filter(function (it) { return !it.done; }).length;
  }

  /** True when `id` and everything nested under it are done. Such a task
   * moves into the "Done" group whole; a checked task with undone subtasks
   * stays in the main list so its remaining work keeps its context. */
  function isFullyDoneSubtree(id) {
    var it = findById(id);
    if (!it || !it.done) return false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id !== id && isSelfOrDescendant(id, items[i].id) && !items[i].done) return false;
    }
    return true;
  }

  // ----------------------------------------------------------------- text ---

  // Human label for announcements, e.g. "Buy milk (2 of 3 done)".
  function describe(id) {
    var it = findById(id);
    if (!it) return 'task';
    var kids = childIds(id).length;
    if (!kids) return it.text;
    return it.text + ' (' + childIds(id).filter(function (cid) { return findById(cid).done; }).length +
      ' of ' + kids + ' done)';
  }

  function announce(msg) {
    if (!sr) return;
    sr.textContent = '';
    if (announceTimer) clearTimeout(announceTimer);
    announceTimer = setTimeout(function () {
      sr.textContent = msg;
      announceTimer = setTimeout(function () { sr.textContent = ''; }, 1600);
    }, 30);
  }

  // --------------------------------------------------------------- render ---

  function render() {
    list.innerHTML = '';
    if (!items.length) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Nothing to do yet. Add a task above.';
      list.appendChild(empty);
    }

    // Finished top-level tasks collect in a collapsible section at the bottom.
    // Everything not in that section renders first, then the group header,
    // then the group's rows when it is open.
    // Counted from top-level members only: their fully done subtasks render
    // inside the group, so counting every done item would double them up.
    var groupCount = 0;
    renderMain(list);
    var groupHeader = null;
    for (var g = 0; g < items.length; g++) {
      if (!items[g].parentId && items[g].done && isFullyDoneSubtree(items[g].id)) {
        groupCount += subtreeSize(items[g].id);
      }
    }
    if (groupCount) {
      groupHeader = buildGroupHeader(groupCount);
      list.appendChild(groupHeader);
      if (groupOpen) renderGroup(list);
    }

    var open = pendingCount();
    count.textContent = items.length ? open + ' left' : '';
    clearBtn.hidden = open === items.length;
    undoBtn.hidden = !canUndo;

    if (grab.id) restoreGrab();
  }

  /** Builds one task row: checkbox, text and delete on the parent's line;
   * tasks with subtasks get a second line inside the same li holding the
   * disclosure arrow and the "Subtasks n/x" progress. */
  function buildRow(it) {
    var kids = childIds(it.id);
    var row = document.createElement('li');
    row.className = 'item' + (it.done ? ' done' : '');
    if (flashIds[it.id]) {
      row.classList.add('is-flash');
      delete flashIds[it.id];
    }
    row.draggable = true;
    row.tabIndex = 0;
    row.setAttribute('aria-grabbed', 'false');
    row.setAttribute('data-id', it.id);
    row.style.setProperty('--depth', String(depthOf(it)));

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = it.done;
    cb.setAttribute('aria-label', (it.done ? 'Reopen: ' : 'Complete: ') + it.text);
    row.appendChild(cb);

    var text = document.createElement('span');
    text.className = 't';
    text.textContent = it.text;
    row.appendChild(text);

    var del = document.createElement('button');
    del.className = 'icon del';
    del.type = 'button';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Delete: ' + it.text + (kids.length ? ' and its subtasks' : ''));
    row.appendChild(del);

    // Tasks with subtasks carry their disclosure on a line of its own, directly
    // under the parent task (CSS wrap puts .twist-line there): the arrow and
    // the "Subtasks n/x" count. Inside the same li, so it stays within the
    // parent's row for dragging and indenting.
    if (kids.length) {
      var twist = document.createElement('div');
      twist.className = 'twist-line';

      var twisty = document.createElement('button');
      twisty.className = 'twisty';
      twisty.type = 'button';
      twisty.setAttribute('aria-expanded', it.collapsed ? 'false' : 'true');
      twisty.setAttribute('aria-label',
        (it.collapsed ? 'Expand subtasks of ' : 'Collapse subtasks of ') + it.text);
      twist.appendChild(twisty);

      var doneKids = kids.filter(function (cid) { return findById(cid).done; }).length;
      var progress = document.createElement('span');
      progress.className = 'progress';
      progress.textContent = 'Subtasks ' + doneKids + '/' + kids.length;
      progress.setAttribute('aria-label', doneKids + ' of ' + kids.length + ' subtasks done');
      twist.appendChild(progress);

      row.appendChild(twist);
    }
    return row;
  }

  /** A "member" of the Done group: a top-level task whose whole subtree is
   * finished. Descent rows live in the group too, but they are found by
   * walking with the member as root (renderGroup keeps the last member's
   * id), not by this check. */
  function isGroupMember(it) {
    return !!it.parentId === false && it.done === true && isFullyDoneSubtree(it.id);
  }

  /** Renders the main list: everything except whole subtrees that live in
   * the Done group. Walk order mirrors the flat store order, where subtasks
   * directly follow their parents, and rows below a collapsed task are
   * skipped until depth comes back out (`skipBelow`). */
  function renderMain(container) {
    var skipBelow = -1;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var depth = depthOf(it);
      if (skipBelow >= 0) {
        if (depth > skipBelow) continue;
        skipBelow = -1;
      }
      // A task bound for the Done group also leaves its subtree behind:
      // none of its rows belong in the main flow.
      if (!it.parentId && isGroupMember(it)) {
        skipBelow = depth;
        continue;
      }
      if (it.collapsed) skipBelow = depth;
      container.appendChild(buildRow(it));
    }
  }

  /** Renders the Done group's rows under its header: each top-level done
   * task with a fully done subtree, followed by the rest of its subtree. */
  function renderGroup(container) {
    var skipBelow = -1;
    var memberRoot = null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var depth = depthOf(it);
      if (skipBelow >= 0) {
        if (depth > skipBelow) continue;
        skipBelow = -1;
      }
      memberRoot = (!it.parentId && isGroupMember(it)) ? it.id : (it.parentId ? memberRoot : null);
      if (it.collapsed) skipBelow = depth;
      if (memberRoot) container.appendChild(buildRow(it));
    }
  }

  function buildGroupHeader(groupCount) {
    var header = document.createElement('li');
    header.className = 'done-group';

    var toggle = document.createElement('button');
    toggle.className = 'done-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', groupOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', 'Finished tasks: ' + groupCount);

    var caret = document.createElement('span');
    caret.className = 'twisty';
    caret.setAttribute('aria-hidden', 'true');

    var label = document.createElement('span');
    label.className = 'done-label';
    label.textContent = 'Done (' + groupCount + ')';

    toggle.appendChild(caret);
    toggle.appendChild(label);
    header.appendChild(toggle);
    return header;
  }

  /** Rows under a group member, the member itself included. */
  function subtreeSize(id) {
    var size = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id || isSelfOrDescendant(id, items[i].id)) size++;
    }
    return size;
  }

  // Flags tasks for a one-time flash by comparing the incoming list against
  // the previous one: a task that is new, or that changed from not done to
  // done, flashes teal. Skipped on first paint, or a fresh panel would light
  // up its whole list.
  function rememberFlashes(before, after) {
    if (!before.length) return;
    var state = {};
    for (var b = 0; b < before.length; b++) state[before[b].id] = before[b].done;
    for (var a = 0; a < after.length; a++) {
      if (!(after[a].id in state)) flashIds[after[a].id] = true;
      else if (!state[after[a].id] && after[a].done) flashIds[after[a].id] = true;
    }
  }

  /** Applies a fresh authoritative list from the main process. */
  function setItems(next) {
    var incoming = Array.isArray(next) ? next : [];
    rememberFlashes(items, incoming);
    items = incoming;
    // A grabbed task may have been deleted underneath us.
    if (grab.id && !findById(grab.id)) grab.id = null;
    render();
  }

  function refreshUndoState() {
    window.todoApp.canUndo().then(function (value) {
      canUndo = !!value;
      undoBtn.hidden = !canUndo;
    });
  }

  // ------------------------------------------------------------ drag/drop ---

  function rowFromEvent(e) {
    var node = e.target;
    while (node && node !== list) {
      if (node.classList && node.classList.contains('item')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function clearDropIndicators() {
    var rows = list.querySelectorAll('.drag-over');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.remove('drag-over');
      rows[i].removeAttribute('data-insert-mode');
    }
  }

  // Top third drops above, bottom third drops below, middle nests as a subtask.
  function modeForPointer(e, row) {
    var rect = row.getBoundingClientRect();
    if (!rect.height) return MODE_BEFORE;
    var ratio = (e.clientY - rect.top) / rect.height;
    if (ratio < BEFORE_ZONE) return MODE_BEFORE;
    if (ratio > AFTER_ZONE) return MODE_AFTER;
    return MODE_CHILD;
  }

  // Scroll the list when dragging near its edges, so long lists stay reachable.
  function autoScroll(clientY) {
    var box = list.getBoundingClientRect();
    if (clientY < box.top + EDGE_SCROLL_ZONE) list.scrollTop -= EDGE_SCROLL_STEP;
    else if (clientY > box.bottom - EDGE_SCROLL_ZONE) list.scrollTop += EDGE_SCROLL_STEP;
  }

  function onDragStart(e) {
    var row = rowFromEvent(e);
    if (!row) return;
    var id = row.getAttribute('data-id');
    drag.id = id;
    drag.targetId = null;
    drag.mode = null;
    row.classList.add('is-dragging');
    row.setAttribute('aria-grabbed', 'true');
    e.dataTransfer.effectAllowed = 'move';
    // Chromium refuses to start a drag with an empty payload.
    e.dataTransfer.setData('text/plain', id);
    announce('Dragging ' + describe(id));
  }

  function onDragOver(e) {
    if (!drag.id) return;
    var row = rowFromEvent(e);
    if (!row) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    autoScroll(e.clientY);

    var id = row.getAttribute('data-id');
    // Dropping a task into its own subtree would detach the cycle; refuse it.
    var blocked = id === drag.id || isSelfOrDescendant(drag.id, id);
    var mode = blocked ? null : modeForPointer(e, row);

    if (mode !== drag.mode || id !== drag.targetId) {
      clearDropIndicators();
      if (mode) {
        row.classList.add('drag-over');
        row.setAttribute('data-insert-mode', mode);
        drag.targetId = id;
        drag.mode = mode;
      } else {
        drag.targetId = null;
        drag.mode = null;
      }
    }
  }

  /** True when `candidateId` is `ancestorId` itself or nested under it. */
  function isSelfOrDescendant(ancestorId, candidateId) {
    var cur = findById(candidateId);
    var seen = {};
    while (cur && cur.parentId && !seen[cur.parentId]) {
      if (cur.parentId === ancestorId) return true;
      seen[cur.parentId] = true;
      cur = findById(cur.parentId);
    }
    return false;
  }

  function onDrop(e) {
    if (!drag.id) return;
    e.preventDefault();
    var id = drag.id, target = drag.targetId, mode = drag.mode;
    clearDropIndicators();
    drag.id = drag.targetId = null;
    drag.mode = null;
    if (mode && target) window.todoApp.move(id, { kind: mode, targetId: target });
  }

  function onDragEnd() {
    clearDropIndicators();
    var rows = list.querySelectorAll('.is-dragging');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.remove('is-dragging');
      rows[i].setAttribute('aria-grabbed', 'false');
    }
    drag.id = drag.targetId = null;
    drag.mode = null;
  }

  // ---------------------------------------------------------------- keys ---

  // Re-grab after a rebuild: render() replaces the row element, so the grabbed
  // task has to be re-decorated and refocused.
  function restoreGrab() {
    if (!grab.id) return;
    var row = list.querySelector('.item[data-id="' + grab.id + '"]');
    if (!row) { grab.id = null; return; }
    row.classList.add('is-grabbed');
    row.setAttribute('aria-grabbed', 'true');
    row.focus();
  }

  function releaseGrab() {
    var rows = list.querySelectorAll('.is-grabbed');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.remove('is-grabbed');
      rows[i].setAttribute('aria-grabbed', 'false');
    }
    grab.id = null;
  }

  var MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

  // Maps a key to the store's relative moves: up/down reorder among siblings,
  // right indents under the previous sibling, left outdents next to the parent.
  function directionFor(key) {
    if (key === 'ArrowUp') return 'up';
    if (key === 'ArrowDown') return 'down';
    if (key === 'ArrowRight') return 'indent';
    if (key === 'ArrowLeft') return 'outdent';
    if (key === 'Home') return 'up';
    if (key === 'End') return 'down';
    return null;
  }

  function onKeyDown(e) {
    var row = rowFromEvent(e);
    if (!row) return;
    var id = row.getAttribute('data-id');
    var key = e.key;

    if (key === ' ' || key === 'Enter' || key === 'Spacebar') {
      // The row itself holds no button, so Enter/Space is the grab key. The
      // row's own buttons keep their native activation behaviour.
      if (e.target !== row) return;
      e.preventDefault();
      if (grab.id === id) { releaseGrab(); announce('Dropped ' + describe(id)); }
      else {
        grab.id = id;
        restoreGrab();
        announce('Grabbed ' + describe(id) +
          '. Arrow keys move it, left and right change its level, Escape cancels.');
      }
      return;
    }

    if (key === 'Escape' && grab.id) {
      e.preventDefault();
      releaseGrab();
      announce('Move cancelled');
      return;
    }

    if (grab.id !== id || MOVE_KEYS.indexOf(key) === -1) return;
    e.preventDefault();

    if (key === 'Home' || key === 'End') {
      // Jump to the edge of the current level by repeated relative moves.
      window.todoApp.getItems().then(function (current) {
        var siblings = current.filter(function (it) { return it.parentId === findById(id).parentId; })
          .map(function (it) { return it.id; });
        var pos = siblings.indexOf(id);
        var edge = key === 'Home' ? 0 : siblings.length - 1;
        var steps = Math.abs(edge - pos);
        for (var i = 0; i < steps; i++) {
          window.todoApp.shift(id, key === 'Home' ? 'up' : 'down');
        }
        announce('Moved ' + describe(id));
      });
      return;
    }

    window.todoApp.shift(id, directionFor(key)).then(function (moved) {
      if (!moved) { announce('Cannot move further'); return; }
      restoreGrab();
      announce('Moved ' + describe(id));
    });
  }

  // ---------------------------------------------------------------- shell ---

  list.addEventListener('dragstart', onDragStart, false);
  list.addEventListener('dragover', onDragOver, false);
  list.addEventListener('drop', onDrop, false);
  list.addEventListener('dragend', onDragEnd, false);
  list.addEventListener('keydown', onKeyDown, false);
  list.addEventListener('change', function (e) {
    var row = rowFromEvent(e);
    if (row && e.target.type === 'checkbox') window.todoApp.toggle(row.getAttribute('data-id'), e.target.checked);
  }, false);
  list.addEventListener('click', function (e) {
    // The Done header opens and closes its section.
    var toggle = e.target.closest ? e.target.closest('.done-toggle') : null;
    if (toggle) {
      groupOpen = !groupOpen;
      announce(groupOpen ? 'Showing finished tasks' : 'Hiding finished tasks');
      render();
      return;
    }
    var row = rowFromEvent(e);
    if (!row) return;
    var id = row.getAttribute('data-id');
    if (e.target.classList.contains('del')) window.todoApp.remove(id);
    else if (e.target.closest && e.target.closest('.twist-line')) window.todoApp.toggleExpanded(id);
  }, false);

  // The collapsed state's icon is the expand-arrows glyph, drawn as an inline
  // SVG like the – and × (not a font glyph), so it does not depend on the
  // system font. Two shafts with L-shaped heads point NE and SW, the common
  // "expand window" look, in currentColor to match the row.
  var EXPAND_ARROWS =
    '<svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M7 6 L10.5 2.5 M10.5 2.5 h-2.5 M10.5 2.5 v2.5"/>' +
    '<path d="M6 7 L2.5 10.5 M2.5 10.5 h2.5 M2.5 10.5 v-2.5"/>' +
    '</svg>';

  function setCollapsed(v) {
    body.hidden = v;
    if (v) collapseBtn.innerHTML = EXPAND_ARROWS;
    else collapseBtn.textContent = '–';
    collapseBtn.title = collapseBtn.ariaLabel = v ? 'Expand' : 'Collapse';
    try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch (e) {}
    if (!v) input.focus();
  }

  $('f').onsubmit = function (e) {
    e.preventDefault();
    var value = input.value.trim();
    if (!value) return;
    window.todoApp.add({ text: value });
    input.value = '';
    input.focus();
  };
  clearBtn.onclick = function () { window.todoApp.clearCompleted(); };
  undoBtn.onclick = function () { window.todoApp.undoInsert(); };
  collapseBtn.onclick = function () { setCollapsed(!body.hidden); };
  $('quit').onclick = function () { window.todoApp.close(); };

  window.todoApp.onItemsChanged(function (next) {
    hasLiveItems = true;
    setItems(next);
    refreshUndoState();
  });

  /**
   * One-time hand-over of tasks saved by an older build, which kept them in the
   * renderer's localStorage where the main process cannot see them. The store
   * ignores the migration once it has data of its own.
   */
  function migrateLegacyItems() {
    var legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch (e) { legacy = null; }
    if (!Array.isArray(legacy) || !legacy.length) return;
    window.todoApp.migrateLegacy(legacy).then(function (migrated) {
      if (migrated) {
        try { localStorage.removeItem(LEGACY_KEY); } catch (e) {}
        announce('Moved ' + legacy.length + ' tasks to the new store');
      }
    });
  }

  // Keep the window height equal to the content height.
  new ResizeObserver(function () { window.todoApp.resize(app.offsetHeight); }).observe(app);

  window.todoApp.getItems().then(function (initial) {
    // A broadcast can land before this snapshot resolves; applying the older
    // snapshot would then wipe out the newer list.
    if (hasLiveItems) return;
    setItems(initial);
    refreshUndoState();
    migrateLegacyItems();
  });
  try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); } catch (e) {}
})();