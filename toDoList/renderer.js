// To-do panel renderer: owns the task tree, rendering, and drag/drop + keyboard reordering.
// Storage shape: a flat array kept in depth-first order, so a subtree is always a
// contiguous slice. Item = { id, text, done, parentId, collapsed } (+ runtime-only
// origIndex used to restore a block to where it came from when unchecked again).

(function () {
  var KEY = 'todo-helper-items';
  var COLLAPSE_KEY = 'todo-helper-collapsed';

  // How a dragged block is inserted relative to the row it was dropped on.
  var MODE_BEFORE = 'before';
  var MODE_AFTER = 'after';
  var MODE_CHILD = 'childLast';

  // Vertical drop zones as a fraction of the target row height.
  var BEFORE_ZONE = 0.33;
  var AFTER_ZONE = 0.66;

  // Pixels of auto-scroll applied per drag event near the edge of the scroll port.
  var EDGE_SCROLL_ZONE = 24;
  var EDGE_SCROLL_STEP = 10;

  var items = [];
  try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { items = []; }
  if (!Array.isArray(items)) items = [];
  items = migrate(items);

  var drag = { id: null, targetId: null, mode: null };
  var grab = { id: null };
  var announceTimer = null;

  var $ = function (id) { return document.getElementById(id); };
  var list = $('list'), input = $('in'), count = $('count'), clearBtn = $('clear'),
      body = $('body'), app = $('app'), collapseBtn = $('collapse'), sr = $('sr');

  // ---------------------------------------------------------------- state ---

  // Give every item an id/parent/collapsed so older saved lists keep working.
  function migrate(listIn) {
    var seen = {};
    for (var i = 0; i < listIn.length; i++) {
      var it = listIn[i];
      if (!it || typeof it !== 'object') { listIn[i] = null; continue; }
      if (!it.id) it.id = generateId();
      while (seen[it.id]) it.id = generateId();
      seen[it.id] = true;
      if (typeof it.text !== 'string') it.text = '';
      it.done = !!it.done;
      it.parentId = it.parentId || null;
      it.collapsed = !!it.collapsed;
    }
    return listIn.filter(Boolean);
  }

  // Unique-enough id: timestamp plus a random suffix, no dependency needed.
  function generateId() {
    return 't' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
  }

  // Drops the runtime-only origIndex so it never reaches localStorage.
  function save() {
    var plain = items.map(function (it) {
      return { id: it.id, text: it.text, done: it.done, parentId: it.parentId, collapsed: it.collapsed };
    });
    try { localStorage.setItem(KEY, JSON.stringify(plain)); } catch (e) {}
  }

  // ------------------------------------------------------------ tree utils ---

  function findIndexById(id, arr) {
    arr = arr || items;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return i;
    return -1;
  }

  function findById(id, arr) {
    var i = findIndexById(id, arr);
    return i < 0 ? null : (arr || items)[i];
  }

  // Number of ancestors above this item; also our cycle guard when walking up.
  function depthOf(it, arr) {
    arr = arr || items;
    var depth = 0, cur = it, seen = {};
    while (cur && cur.parentId && !seen[cur.parentId]) {
      seen[cur.parentId] = true;
      cur = findById(cur.parentId, arr);
      if (!cur) break;
      depth++;
    }
    return depth;
  }

  // A subtree is a contiguous slice because the array is stored depth-first.
  // End at the first following row that is not deeper than the root.
  function subtreeRange(id, arr) {
    arr = arr || items;
    var start = findIndexById(id, arr);
    if (start < 0) return null;
    var rootDepth = depthOf(arr[start], arr);
    var end = start;
    for (var i = start + 1; i < arr.length; i++) {
      if (depthOf(arr[i], arr) <= rootDepth) break;
      end = i;
    }
    return { start: start, end: end };
  }

  function isAncestor(ancestorId, nodeId, arr) {
    var range = subtreeRange(ancestorId, arr);
    if (!range) return false;
    return findIndexById(nodeId, arr) >= range.start && findIndexById(nodeId, arr) <= range.end;
  }

  // Sibling ids in display order (all children of one parent, or all top-level).
  function siblingIds(parentId) {
    return items.filter(function (it) { return it.parentId === parentId; })
      .map(function (it) { return it.id; });
  }

  function firstDoneIndex(arr) {
    for (var i = 0; i < arr.length; i++) if (arr[i].done) return i;
    return -1;
  }

  function pendingCount() {
    return items.filter(function (it) { return !it.done; }).length;
  }

  // ----------------------------------------------------------------- text ---

  // Human label for announcements, e.g. "Buy milk (3 subtasks)".
  function describe(id) {
    var it = findById(id);
    if (!it) return 'task';
    var kids = siblingIds(it.id).length;
    return kids ? it.text + ' (' + kids + ' subtasks)' : it.text;
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

  // ------------------------------------------------------------- mutations ---

  // Insert a task above everything else; it stays there until dragged away.
  function addTask(text) {
    var v = String(text || '').trim();
    if (!v) return;
    items.unshift({ id: generateId(), text: v, done: false, parentId: null, collapsed: false });
    save(); render();
    announce('Added ' + v);
  }

  // Deleting a task deletes its subtasks too: they cannot exist without a parent.
  function deleteTask(id) {
    var range = subtreeRange(id);
    if (!range) return;
    var removed = range.end - range.start;
    var text = findById(id).text;
    items = items.slice(0, range.start).concat(items.slice(range.end + 1));
    save(); render();
    announce(removed ? 'Deleted ' + text + ' and ' + removed + ' subtasks' : 'Deleted ' + text);
  }

  // Hide/show a task's subtasks without touching their data or order.
  function toggleExpanded(id) {
    var it = findById(id);
    if (!it) return;
    it.collapsed = !it.collapsed;
    save(); render();
    announce(it.collapsed ? 'Collapsed subtasks of ' + it.text : 'Expanded subtasks of ' + it.text);
  }

  function clearCompleted() {
    var removed = items.filter(function (it) { return it.done; }).length;
    if (!removed) return;
    items = items.filter(function (it) { return !it.done; });
    save(); render();
    announce('Cleared ' + removed + ' completed');
  }

  // Checking a top-level task completes its whole subtree and parks that block at
  // the end of the list. Checking a subtask leaves it under its parent where it is,
  // because breaking the parent/child grouping would hide it from its parent.
  function toggleDone(id, checked) {
    var it = findById(id);
    if (!it || it.done === !!checked) return;
    var isSubtask = !!it.parentId;

    if (isSubtask) {
      it.done = !!checked;
      save(); render();
      announce((checked ? 'Completed ' : 'Reopened ') + describe(id));
      return;
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
    save(); render();
    announce(checked ? 'Completed ' + describe(id) + ' and moved it to the end'
                     : 'Reopened ' + describe(id) + ' and restored its position');
  }

  // Move the dragged block (root + descendants) relative to targetId. Returns a
  // short description of what happened, or null when the move is not allowed.
  function moveBlock(dragId, mode, targetId) {
    if (!dragId || !targetId || dragId === targetId) return null;
    if (isAncestor(dragId, targetId)) return null;      // dropping a block into itself

    var range = subtreeRange(dragId);
    if (!range) return null;
    var block = items.slice(range.start, range.end + 1);
    var rest = items.slice(0, range.start).concat(items.slice(range.end + 1));

    var targetIndex = findIndexById(targetId, rest);
    if (targetIndex < 0) return null;
    var target = rest[targetIndex];
    var base, clamped = false;

    if (mode === MODE_CHILD) {
      var targetRange = subtreeRange(targetId, rest);
      base = targetRange.end + 1;
      block[0].parentId = targetId;
    } else {
      base = mode === MODE_AFTER ? targetIndex + 1 : targetIndex;
      block[0].parentId = target.parentId;
    }

    // Completed blocks always live at the bottom, pending ones always above them.
    // A drop that would cross that line lands on the line instead, as a top-level
    // task, so the tree stays valid.
    var firstDone = firstDoneIndex(rest);
    if (block[0].done) {
      if (firstDone < 0 || base < firstDone) { base = rest.length; clamped = true; }
    } else if (firstDone >= 0 && base > firstDone) {
      base = firstDone; clamped = true;
    }
    if (clamped) block[0].parentId = null;

    items = rest.slice(0, base).concat(block, rest.slice(base));
    save(); render();
    return describe(dragId) + (clamped ? ' moved to the edge of the completed tasks' : '');
  }

  // ----------------------------------------------------------- drag & drop ---

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
    drag.id = row.getAttribute('data-id');
    drag.targetId = null;
    drag.mode = null;
    row.classList.add('is-dragging');
    row.setAttribute('aria-grabbed', 'true');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', drag.id);
    announce('Dragging ' + describe(drag.id));
  }

  function onDragOver(e) {
    if (!drag.id) return;
    var row = rowFromEvent(e);
    if (!row) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    autoScroll(e.clientY);

    var id = row.getAttribute('data-id');
    var mode = (id === drag.id || isAncestor(drag.id, id)) ? null : modeForPointer(e, row);
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

  function onDrop(e) {
    if (!drag.id) return;
    e.preventDefault();
    var result = drag.mode ? moveBlock(drag.id, drag.mode, drag.targetId) : null;
    clearDropIndicators();
    drag.id = drag.targetId = null;
    drag.mode = null;
    if (result) announce('Dropped: ' + result);
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
  // item has to be re-decorated and refocused.
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

  function grabTask(id) {
    grab.id = id;
    restoreGrab();
    announce('Grabbed ' + describe(id) +
      '. Use arrow keys to move it, left and right arrow to change its level, Escape to cancel.');
  }

  // Keyboard reordering maps onto the same moveBlock() the pointer uses, so both
  // input methods produce identical ordering.
  function moveGrabbedByKey(key) {
    var id = grab.id;
    var it = findById(id);
    if (!it) return false;
    var siblings = siblingIds(it.parentId);
    var pos = siblings.indexOf(id);
    var result = null;

    if (key === 'ArrowUp') {
      if (pos > 0) result = moveBlock(id, MODE_BEFORE, siblings[pos - 1]);
    } else if (key === 'ArrowDown') {
      if (pos < siblings.length - 1) result = moveBlock(id, MODE_AFTER, siblings[pos + 1]);
    } else if (key === 'ArrowRight') {
      if (pos > 0) result = moveBlock(id, MODE_CHILD, siblings[pos - 1]);
    } else if (key === 'ArrowLeft') {
      if (it.parentId) result = moveBlock(id, MODE_AFTER, it.parentId);
    } else if (key === 'Home' || key === 'End') {
      if (siblings.length < 2) return false;
      var edge = key === 'Home' ? siblings[0] : siblings[siblings.length - 1];
      result = moveBlock(id, key === 'Home' ? MODE_BEFORE : MODE_AFTER, edge);
    }
    if (!result) return false;
    restoreGrab();
    announce('Moved ' + describe(id));
    return true;
  }

  function onKeyDown(e) {
    var row = rowFromEvent(e);
    if (!row) return;
    var id = row.getAttribute('data-id');
    var key = e.key;

    if (key === ' ' || key === 'Enter' || key === 'Spacebar') {
      // The row itself holds no button, so Enter/Space is the grab key. Row buttons
      // keep their native activation behaviour.
      if (e.target !== row) return;
      e.preventDefault();
      if (grab.id === id) { releaseGrab(); announce('Dropped ' + describe(id)); }
      else grabTask(id);
      return;
    }

    if (key === 'Escape' && grab.id) {
      e.preventDefault();
      releaseGrab();
      announce('Move cancelled');
      return;
    }

    if (grab.id === id) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(key) === -1) return;
      e.preventDefault();
      if (moveGrabbedByKey(key)) return;
      announce('Cannot move further');
    }
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

      var row = document.createElement('li');
      row.className = 'item' + (it.done ? ' done' : '');
      row.draggable = true;
      row.tabIndex = 0;
      row.setAttribute('aria-grabbed', 'false');
      row.setAttribute('data-id', it.id);
      row.style.setProperty('--depth', String(depth));

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = it.done;
      cb.setAttribute('aria-label', (it.done ? 'Reopen: ' : 'Complete: ') + it.text);

      // Only tasks that actually have subtasks get a disclosure toggle.
      var twisty = null;
      if (siblingIds(it.id).length) {
        twisty = document.createElement('button');
        twisty.className = 'twisty';
        twisty.type = 'button';
        twisty.textContent = it.collapsed ? '▸' : '▾';
        twisty.setAttribute('aria-expanded', it.collapsed ? 'false' : 'true');
        twisty.setAttribute('aria-label',
          (it.collapsed ? 'Expand subtasks of ' : 'Collapse subtasks of ') + it.text);
      }

      var text = document.createElement('span');
      text.className = 't';
      text.textContent = it.text;

      var del = document.createElement('button');
      del.className = 'icon del';
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete: ' + it.text + (it.parentId ? '' : ' and its subtasks'));

      if (twisty) row.appendChild(twisty);
      row.appendChild(cb); row.appendChild(text); row.appendChild(del);
      list.appendChild(row);
    }

    var open = pendingCount();
    count.textContent = items.length ? open + ' left' : '';
    clearBtn.hidden = open === items.length;

    if (grab.id) restoreGrab();
  }

  // ---------------------------------------------------------------- shell ---

  list.addEventListener('dragstart', onDragStart, false);
  list.addEventListener('dragover', onDragOver, false);
  list.addEventListener('drop', onDrop, false);
  list.addEventListener('dragend', onDragEnd, false);
  list.addEventListener('keydown', onKeyDown, false);
  list.addEventListener('change', function (e) {
    var row = rowFromEvent(e);
    if (row && e.target.type === 'checkbox') toggleDone(row.getAttribute('data-id'), e.target.checked);
  }, false);
  list.addEventListener('click', function (e) {
    var row = rowFromEvent(e);
    if (!row) return;
    var id = row.getAttribute('data-id');
    if (e.target.classList.contains('del')) deleteTask(id);
    else if (e.target.classList.contains('twisty')) toggleExpanded(id);
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
    addTask(input.value);
    input.value = '';
    input.focus();
  };
  clearBtn.onclick = clearCompleted;
  collapseBtn.onclick = function () { setCollapsed(!body.hidden); };
  $('quit').onclick = function () { window.todoApp.close(); };

  // Keep the window height equal to the content height.
  new ResizeObserver(function () { window.todoApp.resize(app.offsetHeight); }).observe(app);

  render();
  try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); } catch (e) {}
})();