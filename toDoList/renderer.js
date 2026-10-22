(function () {
  var KEY = 'todo-helper-items';
  var COLLAPSE_KEY = 'todo-helper-collapsed';
  var items = [];
  try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { items = []; }
  if (!Array.isArray(items)) items = [];

  var $ = function (id) { return document.getElementById(id); };
  var list = $('list'), input = $('in'), count = $('count'), clearBtn = $('clear'),
      body = $('body'), app = $('app'), collapseBtn = $('collapse');

  function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} }

  function render() {
    list.innerHTML = '';
    if (!items.length) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Nothing to do yet. Add a task above.';
      list.appendChild(empty);
    }
    var ordered = items.filter(function (x) { return !x.done; })
      .concat(items.filter(function (x) { return x.done; }));
    ordered.forEach(function (it) {
      var li = document.createElement('li');
      if (it.done) li.className = 'done';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.done;
      cb.setAttribute('aria-label', 'Mark done: ' + it.text);
      cb.onchange = function () { it.done = cb.checked; save(); render(); };

      var t = document.createElement('span');
      t.className = 't';
      t.textContent = it.text;

      var d = document.createElement('button');
      d.className = 'icon del';
      d.type = 'button';
      d.textContent = '\u00d7';
      d.setAttribute('aria-label', 'Delete: ' + it.text);
      d.onclick = function () { items = items.filter(function (x) { return x !== it; }); save(); render(); };

      li.appendChild(cb); li.appendChild(t); li.appendChild(d);
      list.appendChild(li);
    });

    var open = items.filter(function (x) { return !x.done; }).length;
    count.textContent = items.length ? open + ' left' : '';
    clearBtn.hidden = open === items.length;
  }

  function setCollapsed(v) {
    body.hidden = v;
    collapseBtn.textContent = v ? '+' : '\u2013';
    collapseBtn.title = collapseBtn.ariaLabel = v ? 'Expand' : 'Collapse';
    try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch (e) {}
    if (!v) input.focus();
  }

  $('f').onsubmit = function (e) {
    e.preventDefault();
    var v = input.value.trim();
    if (!v) return;
    items.unshift({ text: v, done: false });
    input.value = '';
    save(); render(); input.focus();
  };
  clearBtn.onclick = function () { items = items.filter(function (x) { return !x.done; }); save(); render(); };
  collapseBtn.onclick = function () { setCollapsed(!body.hidden); };
  $('quit').onclick = function () { window.todoApp.close(); };

  // Keep the window height equal to the content height.
  new ResizeObserver(function () { window.todoApp.resize(app.offsetHeight); }).observe(app);

  render();
  try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); } catch (e) {}
})();
