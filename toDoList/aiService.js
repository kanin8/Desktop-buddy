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
const { describeList, resolveActions, applyEdits } = require('./taskEdits');

let settings = null;
// In-flight request per requesting window, so a closed overlay can cancel work.
const inFlight = new Map();
// List changes waiting for the user's yes, keyed like inFlight: a task
// breakdown, or tasks the user asked to remove. Each entry is { apply }.
// Neither happens before the user confirms.
const pendingConfirmations = new Map();
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
 * Runs one exchange: work out what the message wants (chat, a goal to break
 * down, or list edits), make any list edits, stream an in-character reply
 * that knows what changed, then offer a breakdown for a goal.
 * Classifying first costs a moment before the reply starts, but means the
 * buddy never talks about an edit that didn't happen.
 * `history` is the chat before `text` as [{ role, content }].
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
  // A new message makes an unconfirmed breakdown or removal stale.
  pendingConfirmations.delete(eventKey(win));
  const base = Object.assign(config.connection(), { signal: controller.signal });

  try {
    const list = describeList(getStore().getItems(), CONFIG.MAX_CONTEXT_ITEMS);
    const intent = await classifyMessage(goal, list.text, history, base);
    const listUpdate = intent.type === 'edit' ? applyListEdits(win, intent.actions, list.idsByNumber) : null;

    const replied = await streamBuddyReply(win, goal, history, listUpdate, base);
    // Shown even if the reply failed: the edits already happened.
    if (listUpdate) announceListUpdate(win, listUpdate);
    if (replied && intent.type === 'task') await offerBreakdown(win, goal, base);
  } finally {
    inFlight.delete(eventKey(win));
  }
}

/** Classifies the message. Any failure counts as chat, so nothing changes by accident. */
async function classifyMessage(goal, listText, history, base) {
  try {
    const intent = await ai.classifyInput(Object.assign({ text: goal, listText: listText, history: history }, base));
    console.log('[AI] Classification result:', JSON.stringify(intent), 'for:', goal);
    return intent;
  } catch (e) {
    console.warn('[AI] Classification failed:', e);
    return { type: 'chat' };
  }
}

/**
 * Makes the list edits the AI found. Removals are held back until the user
 * confirms (ai-confirm-tasks), since a removed task can't be brought back.
 * Side effect: changes the store, and may set a pending confirmation.
 * Returns { doneLines, removalTexts } for the reply and the chat.
 */
function applyListEdits(win, actions, idsByNumber) {
  const store = getStore();
  const edits = resolveActions(actions, idsByNumber, store.getItems());
  const removals = edits.filter((edit) => edit.op === 'delete');
  const doneLines = applyEdits(store, edits.filter((edit) => edit.op !== 'delete'));

  const removalTexts = removals
    .map((edit) => (store.getItems().find((item) => item.id === edit.id) || {}).text)
    .filter(Boolean);
  if (removalTexts.length) {
    pendingConfirmations.set(eventKey(win), {
      apply: () => send(win, 'ai-tasks-edited', applyEdits(getStore(), removals)),
    });
  }
  return { doneLines: doneLines, removalTexts: removalTexts };
}

/**
 * Tells the reply what the list looks like and what the app just did to it,
 * so the buddy can react without claiming it made the change itself.
 */
function describeListForReply(listUpdate) {
  const listText = describeList(getStore().getItems(), CONFIG.MAX_CONTEXT_ITEMS).text;
  const parts = [listText ? 'The user\'s to-do list right now:\n' + listText : 'The user\'s to-do list is empty.'];
  if (!listUpdate) return parts[0];

  if (listUpdate.doneLines.length) {
    parts.push('For their latest message the app has just made these changes: ' + listUpdate.doneLines.join(' '));
  }
  if (listUpdate.removalTexts.length) {
    parts.push('The app is asking the user to confirm removing: "' + listUpdate.removalTexts.join('", "') + '".');
  }
  if (!listUpdate.doneLines.length && !listUpdate.removalTexts.length) {
    parts.push('They asked to change the list, but the app could not tell which task they meant. Briefly ask which one.');
  } else {
    parts.push('The app shows its own confirmation, so react in a few words and don\'t repeat the details.');
  }
  return parts.join('\n\n');
}

/**
 * Streams the in-character reply into the chat. Returns whether it finished;
 * on failure the error is already shown.
 */
async function streamBuddyReply(win, goal, history, listUpdate, base) {
  try {
    // Only the visible reply gets the voice guide: the classify and breakdown
    // calls need strict JSON, and the guide would add ~4k tokens to each.
    const reply = await ai.streamReply(Object.assign({
      text: goal,
      voiceGuide: voiceGuide,
      history: history,
      listContext: describeListForReply(listUpdate),
      onToken: (token) => send(win, 'ai-stream', token),
    }, base));
    send(win, 'ai-stream-end', reply || '');
    return true;
  } catch (e) {
    send(win, 'ai-error', friendlyError(e));
    return false;
  }
}

/** Shows the fixed confirmation lines for the edits, and asks about removals. */
function announceListUpdate(win, listUpdate) {
  if (listUpdate.doneLines.length) send(win, 'ai-tasks-edited', listUpdate.doneLines);
  if (listUpdate.removalTexts.length) send(win, 'ai-confirm-removal', listUpdate.removalTexts);
}

/**
 * Breaks a goal into steps and shows them for confirmation; a goal without
 * steps goes straight onto the list.
 */
async function offerBreakdown(win, goal, base) {
  // Only unfinished tasks are sent, so the model can avoid re-suggesting them.
  const openItems = getStore().getItems()
    .filter(function (it) { return !it.done; })
    .slice(0, CONFIG.MAX_CONTEXT_ITEMS)
    .map(function (it) { return it.text; });

  try {
    const breakdown = await ai.breakdownGoal(Object.assign({ text: goal, openItems: openItems }, base));
    const parentText = (breakdown.parent || goal).trim();
    if (breakdown.subtasks.length) {
      // Steps are shown with quick replies first; only the user's confirm
      // (ai-confirm-tasks) adds them to the list.
      pendingConfirmations.set(eventKey(win), {
        apply: () => addBreakdown(win, parentText, breakdown.subtasks),
      });
      send(win, 'ai-breakdown', { parentText: parentText, subtasks: breakdown.subtasks });
      return;
    }
    // No steps to confirm: the plain goal goes straight onto the list.
    addBreakdown(win, parentText, []);
  } catch (e) {
    // The reply already streamed fine, so this is a partial success: tell the
    // user the goal could not be broken down rather than failing the whole turn.
    send(win, 'ai-tasks-failed', friendlyError(e));
  }
}

/** Adds a goal and its steps to the list and tells the chat. */
function addBreakdown(win, parentText, subtasks) {
  const inserted = getStore().addSubtasks({ parentText: parentText, subtasks: subtasks });
  if (inserted) {
    broadcastItems(getStore().getItems());
    send(win, 'ai-tasks-added');
  }
}

/**
 * Applies the change the user has just confirmed for this window (a
 * breakdown or a removal). Returns whether one was pending; without one the
 * click is simply ignored, since the user saw nothing to confirm.
 */
function confirmPendingTasks(win) {
  const pending = pendingConfirmations.get(eventKey(win));
  pendingConfirmations.delete(eventKey(win));
  if (!pending) return false;
  pending.apply();
  return true;
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

  // Confirmation of a shown breakdown or removal: "Add them" / "Remove" go
  // here, "Not now" / "Keep" just drop the pending entry, so nothing is added
  // or removed without a yes.
  ipcMain.handle('ai-confirm-tasks', (event) => confirmPendingTasks(overlayOf(event)));
  ipcMain.handle('ai-cancel-tasks', (event) => {
    pendingConfirmations.delete(eventKey(overlayOf(event)));
    return true;
  });

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