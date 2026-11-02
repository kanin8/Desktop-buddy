/**
 * Claude transport for `ai.js`, built on Anthropic's official SDK.
 *
 * Takes the same options as `callChatApi` (OpenAI-style messages) so `ai.js`
 * can swap transports by provider without changing its prompts. Main process
 * only: it receives the API key.
 */

const Anthropic = require('@anthropic-ai/sdk').default;
const CONFIG = require('./config');

// One client per key, so the SDK's connection pool is reused across calls.
let cachedClient = null;
let cachedKey = null;

function clientFor(apiKey) {
  if (!cachedClient || cachedKey !== apiKey) {
    // maxRetries 0: the app already treats a failed call as "try again later",
    // and SDK retries would stretch a timeout far past AI_TIMEOUT_MS.
    cachedClient = new Anthropic({ apiKey: apiKey, maxRetries: 0 });
    cachedKey = apiKey;
  }
  return cachedClient;
}

/**
 * Splits OpenAI-style messages into Claude's shape: system text goes in the
 * top-level `system` field, the rest stay as user/assistant turns.
 */
function toClaudeMessages(messages) {
  const system = messages
    .filter(function (m) { return m.role === 'system'; })
    .map(function (m) { return m.content; })
    .join('\n\n');
  const turns = messages.filter(function (m) { return m.role !== 'system'; });
  return { system: system, messages: turns };
}

/** Joins the text blocks of a reply. Claude can put thinking blocks before the text. */
function textOf(message) {
  return message.content
    .filter(function (block) { return block.type === 'text'; })
    .map(function (block) { return block.text; })
    .join('');
}

/**
 * Single request to Claude. Streams text through `onToken` when `stream` is set.
 * Sampling settings (`temperature`) are not sent: current Claude models reject
 * non-default values. `effort` replaces them as the speed/depth control, and
 * `max_tokens` must leave room for the model's thinking.
 */
async function callClaudeApi(options) {
  const { apiKey, model, messages, stream, onToken, signal } = options;
  const client = clientFor(apiKey);
  const split = toClaudeMessages(messages);

  const params = {
    model: model || CONFIG.AI_PROVIDERS.anthropic.model,
    max_tokens: CONFIG.AI_CLAUDE_MAX_TOKENS,
    output_config: { effort: CONFIG.AI_CLAUDE_EFFORT },
    messages: split.messages,
  };
  if (split.system) params.system = split.system;

  const requestOptions = { timeout: CONFIG.AI_TIMEOUT_MS };
  if (signal) requestOptions.signal = signal;

  if (!stream) {
    return textOf(await client.messages.create(params, requestOptions));
  }

  const response = client.messages.stream(params, requestOptions);
  for await (const event of response) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && onToken) {
      onToken(event.delta.text);
    }
  }
  return textOf(await response.finalMessage());
}

/**
 * A user-facing message for an SDK error, or null when `e` is not one.
 * Uses the SDK's typed errors instead of matching on message text.
 */
function describeClaudeError(e) {
  if (e instanceof Anthropic.APIUserAbortError || e instanceof Anthropic.APIConnectionTimeoutError) {
    return 'The AI request timed out.';
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return 'The Claude API key was rejected. Check it in Settings.';
  }
  if (e instanceof Anthropic.NotFoundError) return 'Claude does not know that model name. Check it in Settings.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by Anthropic. Try again shortly.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Check your internet connection.';
  if (e instanceof Anthropic.APIError) return 'Claude request failed: ' + String(e.message).slice(0, 200);
  return null;
}

module.exports = { callClaudeApi, describeClaudeError, toClaudeMessages, textOf };
