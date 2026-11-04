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

    // Depth of a collapsed task: everything nested below it is skipped until we
    // come back out to its own level.
    var skipBelow = -1;

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var depth = depthOf(it);
      if (skipBelow >= 0) {
        if (depth > skipBelow) continue;
        skipBelow = -1;
      }
      if (it.collapsed) skipBelow = depth;

      var kids = childIds(it.id);
      var row = document.createElement('li');
      row.className = 'item' + (it.done ? ' done' : '');
      row.draggable = true;
      row.tabIndex = 0;
      row.setAttribute('aria-grabbed', 'false');
      row.setAttribute('data-id', it.id);
      row.style.setProperty('--depth', String(depth));

      // Only tasks with subtasks get a disclosure toggle and a progress count.
      var twisty = null;
      if (kids.length) {
        twisty = document.createElement('button');
        twisty.className = 'twisty';
        twisty.type = 'button';
        twisty.setAttribute('aria-expanded', it.collapsed ? 'false' : 'true');
        twisty.setAttribute('aria-label',
          (it.collapsed ? 'Expand subtasks of ' : 'Collapse subtasks of ') + it.text);
      }

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = it.done;
      cb.setAttribute('aria-label', (it.done ? 'Reopen: ' : 'Complete: ') + it.text);

      var text = document.createElement('span');
      text.className = 't';
      text.textContent = it.text;

      if (kids.length) {
        var doneKids = kids.filter(function (cid) { return findById(cid).done; }).length;
        var progress = document.createElement('span');
        progress.className = 'progress';
        progress.textContent = doneKids + '/' + kids.length;
        progress.setAttribute('aria-label', doneKids + ' of ' + kids.length + ' subtasks done');
      }

      var del = document.createElement('button');
      del.className = 'icon del';
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete: ' + it.text + (kids.length ? ' and its subtasks' : ''));

      if (twisty) row.appendChild(twisty);
      row.appendChild(cb); row.appendChild(text);
      if (kids.length) row.appendChild(progress);
      row.appendChild(del);
      list.appendChild(row);
    }

    var open = pendingCount();
    count.textContent = items.length ? open + ' left' : '';
    clearBtn.hidden = open === items.length;
    undoBtn.hidden = !canUndo;

    if (grab.id) restoreGrab();
  }

  /** Applies a fresh authoritative list from the main process. */
  function setItems(next) {
    items = Array.isArray(next) ? next : [];
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
    var row = rowFromEvent(e);
    if (!row) return;
    var id = row.getAttribute('data-id');
    if (e.target.classList.contains('del')) window.todoApp.remove(id);
    else if (e.target.classList.contains('twisty')) window.todoApp.toggleExpanded(id);
  }, false);

  function setCollapsed(v) {
    body.hidden = v;
    collapseBtn.textContent = v ? '+' : '–';
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