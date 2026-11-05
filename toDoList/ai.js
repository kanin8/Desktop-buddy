/**
 * Remote AI layer for the chat reply, task breakdown and activity
 * classification.
 *
 * Claude goes through Anthropic's SDK (anthropicClient.js). Every other
 * provider uses any OpenAI-compatible `/chat/completions` endpoint (OpenAI,
 * Ollama, OpenRouter, Groq, a self-hosted vLLM). Requests are made from the
 * main process so the API key never reaches a renderer.
 *
 * Free of Electron imports and of any live network call at module scope, so the
 * helpers and the transport can be unit tested with a stubbed `fetch`.
 */

const CONFIG = require('./config');
const { callClaudeApi } = require('./anthropicClient');

// Length and format rule for the in-character reply. Persona and tone live in
// the voice guide; this only keeps the bubble short, and lets the guide's
// fixed messages (e.g. tier 3, three sentences) through the length limit.
const PERSONA =
  'Keep replies short, usually one or two sentences. No lists or markdown. ' +
  'If you have been given a message to send word for word, send exactly that. ' +
  'If the user asks you to open their to-do list, say you are opening it for them.';

// Classification prompt: determines if user input is a task/goal (needs subtasks)
// or casual chat (question, greeting, follow-up, venting). It also spots a
// request to open the to-do list, so the buddy can do that for the user.
const CLASSIFY_PERSONA =
  'Classify the user\'s message as "task" (goal, plan, or request to break into steps) ' +
  'or "chat" (greeting, question, follow-up, venting, casual talk). ' +
  'If the user asks to open, show or view their to-do list, add "action":"open-todo". ' +
  'Examples: "plan a website"->{"type":"task"}, "write a script"->{"type":"task"}, ' +
  '"hello"->{"type":"chat"}, "how are you"->{"type":"chat"}, ' +
  '"open my to-do list"->{"type":"chat","action":"open-todo"}. ' +
  'Reply with JSON only, in the shape {"type": "task"} or {"type": "chat"}; ' +
  'add "action":"open-todo" only when the user asks to open the list.';

// Activity prompt: decides whether the window the user is looking at is work
// or entertainment. Only used for apps the local rule list does not know.
const ACTIVITY_PERSONA =
  'You are a strict productivity classifier. Classify the activity as "productive" or "leisure".\n' +
  'Productive: work/study apps (VS Code, IntelliJ, Word, Excel, PowerPoint, Notion, Obsidian, ' +
  'Terminal, Docker, Figma, Jira), research articles, university portals, digital libraries, ' +
  'tutorials and documentation.\n' +
  'Leisure: entertainment (YouTube vlogs/gaming/music, Netflix, Twitch, Disney+), social media ' +
  '(Twitter, Instagram, Reddit, Facebook), games and game launchers, shopping, general news.\n' +
  'Examples: "App: Visual Studio Code, Title: index.ts" -> productive; ' +
  '"App: Chrome, Title: arXiv.org - Quantum Computing Paper" -> productive; ' +
  '"App: Chrome, Title: PewDiePie - Funny Moments" -> leisure; ' +
  '"App: Spotify, Title: Gaming Beats" -> leisure.\n' +
  'Reply with ONLY the word productive or leisure. No explanation, no punctuation.';

// Put in front of a history that starts with the buddy (e.g. a nudge), because
// the conversation must open with a user turn (Claude rejects it otherwise).
var BUDDY_SPOKE_FIRST = '(The buddy started this conversation.)';

/**
 * Cleans the chat history sent by the overlay: keeps only user/assistant
 * lines that have text, shortens each to CONFIG.AI_CHAT_HISTORY_MAX_CHARS and
 * keeps the last CONFIG.AI_CHAT_HISTORY_MESSAGES. It comes from a renderer, so
 * it isn't trusted to be well formed.
 */
function cleanChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(function (line) {
      return line && (line.role === 'user' || line.role === 'assistant') && typeof line.content === 'string';
    })
    .map(function (line) {
      return { role: line.role, content: line.content.trim().slice(0, CONFIG.AI_CHAT_HISTORY_MAX_CHARS) };
    })
    .filter(function (line) { return line.content; })
    .slice(-CONFIG.AI_CHAT_HISTORY_MESSAGES);
}

/**
 * Joins back-to-back lines from the same speaker into one turn (a nudge and
 * the buddy's follow-up are two buddy lines in a row), so every provider gets
 * alternating turns. Opens with a user turn if the buddy spoke first.
 */
function toAlternatingTurns(lines) {
  var turns = [];
  lines.forEach(function (line) {
    var last = turns[turns.length - 1];
    if (last && last.role === line.role) {
      last.content += '\n\n' + line.content;
    } else {
      turns.push({ role: line.role, content: line.content });
    }
  });
  if (turns.length && turns[0].role === 'assistant') {
    turns.unshift({ role: 'user', content: BUDDY_SPOKE_FIRST });
  }
  return turns;
}

/**
 * Messages for the streamed in-character reply.
 * No JSON mode: the tokens are shown live, so they must be readable prose.
 * `voiceGuide` (optional) is the team's voice guide; it goes first and PERSONA
 * last, so the length/format rule is the final instruction the model reads.
 * `history` (optional) is the chat so far as [{ role, content }], oldest
 * first, including nudges and the user's button replies, so the buddy knows
 * what it just asked.
 * `listContext` (optional) describes the to-do list and what the app just did
 * to it, so the buddy can talk about the tasks without claiming edits itself.
 */
function buildReplyMessages(text, voiceGuide, history, listContext) {
  var parts = [voiceGuide, listContext, PERSONA].filter(Boolean);
  var systemPrompt = parts.join('\n\n');
  var lines = cleanChatHistory(history).concat([
    { role: 'user', content: String(text || '').trim() },
  ]);
  return [{ role: 'system', content: systemPrompt }].concat(toAlternatingTurns(lines));
}

/**
 * Messages for input classification.
 * `listText` (optional) is the numbered to-do list from taskEdits.describeList.
 * `history` (optional) is the chat before `text`; only the last few lines are
 * sent, enough to know what "that one" refers to.
 * With neither, the user turn is just the message.
 */
function buildClassifyMessages(text, listText, history) {
  var message = String(text || '').trim();
  var recent = cleanChatHistory(history).slice(-CONFIG.AI_CLASSIFY_HISTORY_MESSAGES)
    .map(function (line) { return (line.role === 'user' ? 'User: ' : 'Buddy: ') + line.content; })
    .join('\n');

  var context = [];
  if (recent) context.push('Recent chat:\n' + recent);
  if (listText !== undefined) context.push('To-do list:\n' + (listText || '(empty)'));
  var content = context.length ? context.join('\n\n') + '\n\nLatest message: ' + message : message;

  return [
    { role: 'system', content: CLASSIFY_PERSONA },
    { role: 'user', content: content },
  ];
}

/** Messages for activity classification of one window. */
function buildActivityMessages({ appName, title, url }) {
  return [
    { role: 'system', content: ACTIVITY_PERSONA },
    {
      role: 'user',
      content: 'App: ' + (appName || 'unknown') + '\nTitle: ' + (title || '') + '\nURL: ' + (url || 'N/A'),
    },
  ];
}

/**
 * Messages for the structured breakdown.
 * `openItems` are the user's unfinished tasks: sent so the model does not
 * re-suggest work that is already on the list.
 */
function buildBreakdownMessages(text, openItems) {
  var context = (openItems || [])
    .map(function (t) { return '- ' + t; })
    .join('\n');

  return [
    {
      role: 'system',
      content:
        'You turn a goal into concrete to-do subtasks. Reply with JSON only, in the shape ' +
        '{"parent": "<short task title>", "subtasks": ["<step>", "<step>"]}. ' +
        'Produce between 2 and ' + CONFIG.MAX_SUBTASKS + ' subtasks. Each subtask must be a ' +
        'single actionable step, under 80 characters, imperative mood, no numbering. ' +
        'Do not repeat the goal as a subtask.',
    },
    {
      role: 'user',
      content:
        'Goal: ' + String(text || '').trim() +
        (context ? '\n\nThe user already has these open tasks; do not duplicate them:\n' + context : ''),
    },
  ];
}

/** Strips a ```json fence, if the model wrapped its output in one. */
function stripCodeFences(raw) {
  var text = String(raw == null ? '' : raw).trim();
  var fence = text.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1].trim() : text;
}

/**
 * Extracts the first balanced JSON object from a string.
 * Brace counting is quote-aware so a brace inside a subtask string does not
 * end the object early.
 */
function firstJsonObject(text) {
  var start = text.indexOf('{');
  if (start < 0) return null;
  var depth = 0, inString = false, escaped = false;

  for (var i = start; i < text.length; i++) {
    var ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Turns a raw model response into { parent, subtasks }.
 * Tolerant by design: models wrap JSON in prose, fences, or trailing commas, so
 * every step falls back instead of throwing. Returns null when nothing usable
 * survives, which the caller treats as "insert the goal as a single task".
 */
function parseBreakdown(raw) {
  var candidate = stripCodeFences(raw);
  var json = firstJsonObject(candidate);
  if (!json) return null;

  var parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  var parent = typeof parsed.parent === 'string' ? parsed.parent.trim() : '';
  var rawSubtasks = Array.isArray(parsed.subtasks) ? parsed.subtasks : [];

  var seen = {};
  var subtasks = [];
  rawSubtasks.forEach(function (entry) {
    if (subtasks.length >= CONFIG.MAX_SUBTASKS) return;
    if (typeof entry !== 'string') return;
    var text = entry.trim().replace(/^[-*\d.)\s]+/, '').slice(0, CONFIG.MAX_ITEM_LENGTH);
    if (!text) return;
    var key = text.toLowerCase();
    if (seen[key]) return;                    // de-duplicate model repetition
    seen[key] = true;
    subtasks.push(text);
  });

  if (!parent && !subtasks.length) return null;
  return { parent: parent, subtasks: subtasks };
}

/** Splits an SSE byte stream into decoded text, tolerating split multi-byte chars. */
function createStreamDecoder() {
  var decoder = new TextDecoder();
  return function (bytes) { return decoder.decode(bytes, { stream: true }); };
}

/**
 * Reads a chat-completions SSE response, invoking `onToken` for each content
 * fragment. Resolves with the full concatenated text.
 */
async function readSseStream(response, onToken) {
  var decode = createStreamDecoder();
  var reader = response.body.getReader();
  var buffer = '';
  var full = '';

  function handleLine(line) {
    if (!line || line.slice(0, 5) !== 'data:') return;
    var payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    var chunk;
    try {
      chunk = JSON.parse(payload);
    } catch (e) {
      return;  // keep-alive comment or malformed frame: skip it
    }
    var delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
    var content = delta && delta.content;
    if (typeof content === 'string' && content) {
      full += content;
      if (onToken) onToken(content);
    }
  }

  for (;;) {
    var result = await reader.read();
    if (result.done) break;
    buffer += decode(result.value);

    // Frames are separated by a blank line; a frame can span several reads.
    var lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(handleLine);
  }
  buffer += decode();
  buffer.split('\n').forEach(handleLine);

  return full;
}

/** Single POST to /chat/completions. Handles both streaming and JSON replies. */
async function callChatApi(options) {
  var { baseUrl, apiKey, model, messages, stream, json, temperature, maxTokens, timeoutMs, onToken, signal } = options;

  var url = String(baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
  var headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

  var body = {
    model: model || CONFIG.AI_DEFAULT_MODEL,
    messages: messages,
    stream: !!stream,
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens) body.max_tokens = maxTokens;
  // Only ask for JSON when we are not streaming: a streamed JSON response would
  // show raw braces in the bubble instead of readable prose.
  if (json && !stream) body.response_format = { type: 'json_object' };

  var controller = new AbortController();
  var timer = timeoutMs ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
  var onExternalAbort = function () { controller.abort(); };
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort);
  }

  try {
    var response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Surface the provider's own error text; it is usually the only clue
      // (bad key, wrong model name, quota).
      var detail = '';
      try { detail = (await response.text()).slice(0, 300); } catch (e) { /* ignore */ }
      throw new Error('AI request failed (' + response.status + ')' + (detail ? ': ' + detail : ''));
    }

    if (stream) return await readSseStream(response, onToken);

    var payload = await response.json();
    return payload.choices && payload.choices[0] && payload.choices[0].message
      ? payload.choices[0].message.content || ''
      : '';
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Sends one request to the configured provider. Claude goes through
 * Anthropic's SDK; every other provider through the OpenAI-compatible API.
 * Both take the same options and resolve with the reply text.
 */
function callModel(options) {
  var preset = CONFIG.AI_PROVIDERS[options.provider];
  if (preset && preset.usesClaudeSdk) return callClaudeApi(options);
  return callChatApi(options);
}

/** Streamed reply for the speech bubble. */
async function streamReply({ provider, baseUrl, apiKey, model, text, voiceGuide, history, listContext, onToken, signal }) {
  return callModel({
    provider: provider,
    baseUrl: baseUrl,
    apiKey: apiKey,
    model: model,
    messages: buildReplyMessages(text, voiceGuide, history, listContext),
    stream: true,
    temperature: CONFIG.AI_TEMPERATURE,
    maxTokens: CONFIG.AI_MAX_TOKENS,
    timeoutMs: CONFIG.AI_TIMEOUT_MS,
    onToken: onToken,
    signal: signal,
  });
}

/**
 * Task breakdown, with one retry: a single flaky JSON response should not cost
 * the user their subtasks. Falls back to the raw text as the parent task when
 * no JSON survives, so the goal is never silently dropped.
 */
async function breakdownGoal({ provider, baseUrl, apiKey, model, text, openItems, signal }) {
  var messages = buildBreakdownMessages(text, openItems);

  var raw = '';
  var lastError = null;
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      raw = await callModel({
        provider: provider,
        baseUrl: baseUrl,
        apiKey: apiKey,
        model: model,
        messages: messages,
        stream: false,
        json: true,
        temperature: attempt === 0 ? CONFIG.AI_TEMPERATURE : 0.2,
        timeoutMs: CONFIG.AI_TIMEOUT_MS,
        signal: signal,
      });
      var parsed = parseBreakdown(raw);
      if (parsed) return parsed;
    } catch (e) {
      lastError = e;
      if (signal && signal.aborted) throw e;
    }
  }
  if (lastError) throw lastError;
  return { parent: String(text || '').trim(), subtasks: [] };
}

// List edits the classifier may ask for (see CLASSIFY_PERSONA). open_list and
// close_list show or hide the panel instead of changing tasks.
var EDIT_OPS = ['complete', 'reopen', 'rename', 'delete', 'add', 'open_list', 'close_list'];

/**
 * Parses the classification response into { type: 'task' | 'chat', action? }.
 * `action` is 'open-todo' when the user asked to see the list. Returns null if
 * there is nothing usable.
 */
function parseClassification(raw) {
  var candidate = stripCodeFences(raw);
  var json = firstJsonObject(candidate);
  if (!json) return null;

  var parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  var type = typeof parsed.type === 'string' ? parsed.type.toLowerCase() : '';
  var action = typeof parsed.action === 'string' ? parsed.action.toLowerCase() : '';

  var result = {};
  if (type === 'task' || type === 'chat') result.type = type;
  if (action === 'open-todo') result.action = 'open-todo';
  if (!result.type && !result.action) return null;
  // An action on its own still means chat, so the turn stays conversational.
  result.type = result.type || 'chat';
  return result;
}

/**
 * Classifies user input as 'task' (wants subtasks), 'chat' (casual) or 'edit'
 * (changes to the to-do list). `listText` and `history` are explained at
 * buildClassifyMessages. Uses a fast, low-temperature call to avoid latency.
 */
async function classifyInput({ provider, baseUrl, apiKey, model, text, listText, history, signal }) {
  var messages = buildClassifyMessages(text, listText, history);

  var raw = await callModel({
    provider: provider,
    baseUrl: baseUrl,
    apiKey: apiKey,
    model: model,
    messages: messages,
    stream: false,
    json: true,
    temperature: CONFIG.AI_CLASSIFY_TEMPERATURE,
    maxTokens: CONFIG.AI_CLASSIFY_MAX_TOKENS,
    timeoutMs: CONFIG.AI_TIMEOUT_MS,
    signal: signal,
  });

  console.log('[AI] Raw classification response:', raw);

  var parsed = parseClassification(raw);
  if (parsed) return parsed;

  // Fallback: if classification fails, assume chat to avoid unwanted subtasks
  console.warn('[AI] Classification parse failed, defaulting to chat');
  return { type: 'chat' };
}

/**
 * Maps a model's answer to 'productive', 'leisure' or 'uncategorized'.
 * Models sometimes add punctuation or a sentence, so this matches the keyword
 * anywhere in the reply.
 */
function parseActivityCategory(raw) {
  var text = String(raw == null ? '' : raw).toLowerCase();
  if (text.includes('productive')) return 'productive';
  if (text.includes('leisure')) return 'leisure';
  return 'uncategorized';
}

/** Classifies the active window as productive or leisure. */
async function classifyActivity({ provider, baseUrl, apiKey, model, appName, title, url, signal }) {
  var raw = await callModel({
    provider: provider,
    baseUrl: baseUrl,
    apiKey: apiKey,
    model: model,
    messages: buildActivityMessages({ appName: appName, title: title, url: url }),
    stream: false,
    temperature: CONFIG.AI_ACTIVITY_TEMPERATURE,
    maxTokens: CONFIG.AI_ACTIVITY_MAX_TOKENS,
    timeoutMs: CONFIG.AI_TIMEOUT_MS,
    signal: signal,
  });
  return parseActivityCategory(raw);
}

module.exports = {
  buildReplyMessages,
  buildBreakdownMessages,
  buildClassifyMessages,
  buildActivityMessages,
  parseBreakdown,
  parseClassification,
  parseActivityCategory,
  classifyActivity,
  stripCodeFences,
  firstJsonObject,
  readSseStream,
  callChatApi,
  callModel,
  streamReply,
  breakdownGoal,
  classifyInput,
};