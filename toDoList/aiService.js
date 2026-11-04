/**
 * Electron wiring for every AI feature: the overlay chat, task breakdown and
 * activity classification.
 *
 * Owns the `ai-*` IPC surface: it runs the remote calls (so the API key stays in
 * this process), streams the reply tokens back to the overlay, and writes the
 * resulting task tree through the store.
 */

const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const ai = require('./ai');
const { describeClaudeError } = require('./anthropicClient');
const CONFIG = require('./config');
const { createSettingsStore } = require('./appSettings');
const fs = require('fs');
const { getStore, broadcastItems } = require('./todoService');

let settings = null;
// In-flight request per requesting window, so a closed overlay can cancel work.
const inFlight = new Map();
// Voice guide text, read once at startup. Empty means "fall back to the short persona".
let voiceGuide = '';

/**
 * Reads the voice guide from disk and logs how much was loaded.
 * A missing or unreadable file is not fatal: the buddy still replies, just
 * without the guide, so the warning is the only signal.
 */
function loadVoiceGuide() {
  const guidePath = path.join(__dirname, CONFIG.VOICE_GUIDE_PATH);
  try {
    const text = fs.readFileSync(guidePath, 'utf8').trim();
    console.log('[AI] Loaded voice guide: ' + text.length + ' characters from ' + guidePath);
    return text;
  } catch (e) {
    console.warn('[AI] Could not load voice guide from ' + guidePath + ':', e.message);
    return '';
  }
}

function getSettings() {
  if (settings) return settings;
  settings = createSettingsStore({ filePath: path.join(require('electron').app.getPath('userData'), 'settings.json') });
  settings.load();
  return settings;
}

/** Overlay window (the avatar chat) — the only window that talks to the AI. */
function overlayOf(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win && !win.isDestroyed() ? win : null;
}

function send(win, channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/**
 * Runs one exchange: stream an in-character reply into the bubble, then classify
 * the input. If it's a task/goal, break it down and insert subtasks.
 * `history` is the chat before `text` as [{ role, content }]; only the reply
 * uses it (ai.js cleans and trims it).
 */
async function askAndBreakdown(win, text, history) {
  const config = getSettings();
  const goal = String(text || '').trim();
  if (!goal) return;

  if (!config.isActive()) {
    send(win, 'ai-error', 'Turn on AI and finish its setup in Settings to chat with the buddy.');
    return;
  }

  const controller = new AbortController();
  inFlight.set(eventKey(win), controller);
  const base = Object.assign(config.connection(), { signal: controller.signal });

  try {
    // Only the visible reply gets the voice guide: the classify and breakdown
    // calls need strict JSON, and the guide would add ~4k tokens to each.
    const reply = await ai.streamReply(Object.assign({ text: goal, voiceGuide: voiceGuide, history: history, onToken: t => send(win, 'ai-stream', t) }, base));
    send(win, 'ai-stream-end', reply || '');
  } catch (e) {
    send(win, 'ai-error', friendlyError(e));
    inFlight.delete(eventKey(win));
    return;
  }

  // Classify the input: only break down if it's a task/goal, not casual chat.
  let classification;
  try {
    classification = await ai.classifyInput(Object.assign({ text: goal }, base));
    console.log('[AI] Classification result:', classification, 'for:', goal);
  } catch (e) {
    // If classification fails, assume chat to avoid unwanted subtasks
    console.warn('[AI] Classification failed:', e);
    classification = { type: 'chat' };
  }

  if (classification.type !== 'task') {
    // Casual chat - reply was already streamed, nothing more to do
    inFlight.delete(eventKey(win));
    return;
  }

  // Only unfinished tasks are sent, so the model can avoid re-suggesting them.
  const openItems = getStore().getItems()
    .filter(function (it) { return !it.done; })
    .slice(0, CONFIG.MAX_CONTEXT_ITEMS)
    .map(function (it) { return it.text; });

  try {
    const breakdown = await ai.breakdownGoal(Object.assign({ text: goal, openItems: openItems }, base));
    const parentText = (breakdown.parent || goal).trim();
    const inserted = getStore().addSubtasks({ parentText: parentText, subtasks: breakdown.subtasks });
    if (inserted) {
      broadcastItems(getStore().getItems());
      send(win, 'ai-tasks-added', { parentText: parentText, count: inserted.itemIds.length - 1 });
    }
  } catch (e) {
    // The reply already streamed fine, so this is a partial success: tell the
    // user the goal could not be broken down rather than failing the whole turn.
    send(win, 'ai-tasks-failed', friendlyError(e));
  } finally {
    inFlight.delete(eventKey(win));
  }
}

function eventKey(win) {
  return win ? win.id : 0;
}

/** Turns a network failure into something worth showing a user. */
function friendlyError(e) {
  const claudeMessage = describeClaudeError(e);
  if (claudeMessage) return claudeMessage;

  const message = String((e && e.message) || e);
  if (/abort/i.test(message)) return 'The AI request timed out.';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(message)) {
    return 'Could not reach the AI endpoint. Check the URL in Settings.';
  }
  if (/401|403/.test(message)) return 'The API key was rejected. Check it in Settings.';
  if (/429/.test(message)) return 'Rate limited by the AI provider. Try again shortly.';
  return message.slice(0, 200);
}

/**
 * Asks the AI whether a window is productive or leisure. Used by the activity
 * detector for apps its rule list does not know. Resolves 'uncategorized' when
 * AI is off or the request fails, so detection keeps running without AI.
 */
async function classifyActivity(info) {
  const config = getSettings();
  if (!config.isActive()) return 'uncategorized';

  try {
    return await ai.classifyActivity(Object.assign(config.connection(), {
      appName: info.appName,
      title: info.title,
      // Windows/Linux cannot read browser URLs; the title-derived domain is the next best hint.
      url: info.url || info.domain,
    }));
  } catch (e) {
    console.warn('[AI] Activity classification failed:', friendlyError(e));
    return 'uncategorized';
  }
}

/** Registers the `ai-*` channels. Called once by the host app's main.js. */
function registerAiIpc() {
  voiceGuide = loadVoiceGuide();

  ipcMain.handle('ai-ask', (event, text, history) => askAndBreakdown(overlayOf(event), text, history));

  ipcMain.handle('ai-get-settings', () => getSettings().read());

  ipcMain.handle('ai-set-settings', (_event, patch) => getSettings().update(patch || {}));

  // Cancels the pending exchange for the calling window (chat closed mid-reply).
  ipcMain.handle('ai-cancel', (event) => {
    const key = eventKey(overlayOf(event));
    const controller = inFlight.get(key);
    if (controller) {
      controller.abort();
      inFlight.delete(key);
    }
    return true;
  });
}

module.exports = { registerAiIpc, getSettings, friendlyError, classifyActivity };