/**
 * Electron wiring for the to-do task store: IPC channels, the on-disk location,
 * and broadcasting changes to every open panel.
 *
 * The store itself (todoStore.js) knows nothing about Electron, so the split
 * keeps the task logic unit testable and this file purely about plumbing.
 */

const { app, ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const { createTodoStore } = require('./todoStore');

let store = null;

function getStore() {
  if (store) return store;
  store = createTodoStore({ filePath: path.join(app.getPath('userData'), 'todos.json') });
  store.load();
  return store;
}

/** Pushes the authoritative list to every panel window that is currently open. */
function broadcastItems(items) {
  BrowserWindow.getAllWindows().forEach(function (win) {
    if (!win.isDestroyed()) win.webContents.send('todo-list-changed', items);
  });
}

function getWindowOf(event) {
  return event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
}

/**
 * Legacy localStorage migration. A renderer cannot read the main process's
 * filesystem, so the panel hands over its old array on first load.
 */
function migrateLegacy(legacyItems) {
  const current = getStore();
  const before = current.getItems().length;
  if (before > 0 || !Array.isArray(legacyItems)) return false;

  const added = legacyItems.filter(function (it) {
    return it && typeof it.text === 'string' && it.text.trim();
  });
  if (!added.length) return false;

  // Legacy items were stored newest-first, so replay them back to front so the
  // original visual order survives.
  added.slice().reverse().forEach(function (it) {
    current.add({ text: it.text });
  });
  // Re-apply the done flags: add() always inserts an open task.
  added.forEach(function (it) {
    if (!it.done) return;
    const match = current.getItems().filter(function (x) { return x.text === it.text.trim(); })[0];
    if (match) current.toggle(match.id, true);
  });
  return true;
}

/**
 * Registers the `todo-*` channels once at module load, so toggling the panel on
 * and off cannot stack duplicate listeners on ipcMain.
 */
function registerTodoIpc() {
  ipcMain.handle('todo-get', () => getStore().getItems());

  ipcMain.handle('todo-add', (_event, payload) => getStore().add(payload || {}));

  ipcMain.handle('todo-toggle', (_event, id, checked) => getStore().toggle(id, checked));

  ipcMain.handle('todo-toggle-expanded', (_event, id) => getStore().toggleExpanded(id));

  ipcMain.handle('todo-remove', (_event, id) => getStore().remove(id));

  ipcMain.handle('todo-clear-completed', () => getStore().clearCompleted());

  ipcMain.handle('todo-move', (_event, id, intent) => getStore().move(id, intent || {}));

  ipcMain.handle('todo-shift', (_event, id, direction) => getStore().shift(id, direction));

  ipcMain.handle('todo-undo-insert', () => getStore().undoLastInsert());

  ipcMain.handle('todo-can-undo', () => getStore().canUndo());

  ipcMain.handle('todo-migrate-legacy', (_event, legacyItems) => migrateLegacy(legacyItems));

  getStore().onChange(broadcastItems);
}

/** Flushes any debounced write; called when the app is about to quit. */
function flushStore() {
  if (store) store.flush();
}

module.exports = { registerTodoIpc, getStore, broadcastItems, migrateLegacy, flushStore };