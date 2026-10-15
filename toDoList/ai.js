/**
 * Remote AI layer for task breakdown.
 *
 * Targets any OpenAI-compatible `/chat/completions` endpoint (OpenAI,
 * OpenRouter, Groq, Together, a self-hosted vLLM). Requests are made from the
 * main process so the API key never reaches a renderer.
 *
 * Free of Electron imports and of any live network call at module scope, so the
 * helpers and the transport can be unit tested with a stubbed `fetch`.
 */

const CONFIG = require('./config');

// Persona used for the in-character reply. Kept short: it is the visible bubble
// text, and it costs tokens.
const PERSONA =
  'You are a small, encouraging desk buddy. Reply in at most two short sentences. ' +
  'Be warm and concrete, never use lists or markdown.';

/**
 * Messages for the streamed in-character reply.
 * No JSON mode: the tokens are shown live, so they must be readable prose.
 */
function buildReplyMessages(text) {
  return [
    { role: 'system', content: PERSONA },
    { role: 'user', content: String(text || '').trim() },
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

/** Streamed reply for the speech bubble. */
async function streamReply({ baseUrl, apiKey, model, text, onToken, signal }) {
  return callChatApi({
    baseUrl: baseUrl,
    apiKey: apiKey,
    model: model,
    messages: buildReplyMessages(text),
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
async function breakdownGoal({ baseUrl, apiKey, model, text, openItems, signal }) {
  var messages = buildBreakdownMessages(text, openItems);

  var raw = '';
  var lastError = null;
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      raw = await callChatApi({
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

module.exports = {
  buildReplyMessages,
  buildBreakdownMessages,
  parseBreakdown,
  stripCodeFences,
  firstJsonObject,
  readSseStream,
  callChatApi,
  streamReply,
  breakdownGoal,
};