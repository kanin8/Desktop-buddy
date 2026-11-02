// Unit tests for the Claude transport. No network: fetch is stubbed.
// Run with: node --test toDoList/test/anthropicClient.test.js
const test = require('node:test');
const assert = require('node:assert');

const { callClaudeApi, toClaudeMessages, textOf } = require('../anthropicClient');
const ai = require('../ai');
const CONFIG = require('../config');

/** Installs a fetch stub that records the request and answers with `message`. */
async function withClaudeReply(message, fn) {
  const original = globalThis.fetch;
  const seen = {};
  globalThis.fetch = async (url, init) => {
    seen.url = String(url);
    seen.body = JSON.parse(init.body);
    return new Response(JSON.stringify(message), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
  return seen;
}

const claudeMessage = (content) => ({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-haiku-5-5',
  content: content, stop_reason: 'end_turn', stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

test('toClaudeMessages moves system text out of the turns', () => {
  const split = toClaudeMessages([
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'hi' },
  ]);
  assert.strictEqual(split.system, 'Be brief.');
  assert.deepStrictEqual(split.messages, [{ role: 'user', content: 'hi' }]);
});

test('textOf skips thinking blocks', () => {
  const text = textOf({ content: [
    { type: 'thinking', thinking: '', signature: 'x' },
    { type: 'text', text: 'leisure' },
  ] });
  assert.strictEqual(text, 'leisure');
});

test('callClaudeApi sends Haiku-safe settings: no temperature, effort, room to think', async () => {
  let reply;
  const seen = await withClaudeReply(claudeMessage([{ type: 'text', text: 'productive' }]), async () => {
    reply = await callClaudeApi({
      apiKey: 'sk-ant-test',
      model: 'claude-haiku-5-5',
      temperature: 0.7,
      messages: [{ role: 'system', content: 'Classify.' }, { role: 'user', content: 'VS Code' }],
    });
  });
  assert.strictEqual(reply, 'productive');
  assert.match(seen.url, /api\.anthropic\.com\/v1\/messages/);
  assert.strictEqual(seen.body.model, 'claude-haiku-5-5');
  assert.strictEqual(seen.body.system, 'Classify.');
  assert.strictEqual(seen.body.temperature, undefined);
  assert.strictEqual(seen.body.output_config.effort, CONFIG.AI_CLAUDE_EFFORT);
  assert.strictEqual(seen.body.max_tokens, CONFIG.AI_CLAUDE_MAX_TOKENS);
});

test('classifyActivity goes through Claude when the provider is anthropic', async () => {
  let category;
  const seen = await withClaudeReply(claudeMessage([{ type: 'text', text: 'Leisure.' }]), async () => {
    category = await ai.classifyActivity({
      // A new key gets a new SDK client, which picks up this test's fetch stub.
      provider: 'anthropic', apiKey: 'sk-ant-test-2', model: 'claude-haiku-5-5',
      appName: 'Chrome', title: 'Funny cats',
    });
  });
  assert.strictEqual(category, 'leisure');
  assert.match(seen.url, /anthropic/);
});

test('Anthropic with Haiku is the default provider', () => {
  assert.strictEqual(CONFIG.AI_DEFAULT_PROVIDER, 'anthropic');
  assert.strictEqual(CONFIG.AI_PROVIDERS.anthropic.model, 'claude-haiku-5-5');
});
