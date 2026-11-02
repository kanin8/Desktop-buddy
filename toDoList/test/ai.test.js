// Unit tests for the remote AI layer. No network: fetch is stubbed.
// Run with: node --test toDoList/test/ai.test.js
const test = require('node:test');
const assert = require('node:assert');

const ai = require('../ai');
const CONFIG = require('../config');

/** Builds a Response-like object whose body streams the given SSE text. */
function sseResponse(chunks, { ok = true, status = 200 } = {}) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok,
    status,
    body: {
      getReader() {
        return {
          read() {
            if (index >= chunks.length) return Promise.resolve({ done: true, value: undefined });
            const value = encoder.encode(chunks[index++]);
            return Promise.resolve({ done: false, value });
          },
        };
      },
    },
    async text() { return 'provider error body'; },
    async json() { return {}; },
  };
}

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    body: null,
    async text() { return JSON.stringify(payload); },
    async json() { return payload; },
  };
}

/** Installs a fetch stub for one test and restores the real one afterwards. */
function withFetch(stub, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  return Promise.resolve()
    .then(fn)
    .finally(() => { globalThis.fetch = original; });
}

const chatPayload = (content) => ({ choices: [{ message: { content } }] });

// ------------------------------------------------------------- prompts ---

test('buildReplyMessages asks for short prose and no JSON', () => {
  const messages = ai.buildReplyMessages('  write my thesis  ');
  assert.strictEqual(messages[0].role, 'system');
  assert.match(messages[0].content, /two short sentences/i);
  assert.strictEqual(messages[1].content, 'write my thesis');
  assert.ok(!messages.some((m) => /json/i.test(m.content)), 'reply must not be JSON');
});

test('buildReplyMessages puts the voice guide before the persona', () => {
  const messages = ai.buildReplyMessages('hi', 'Talk like a friendly frog.');
  assert.match(messages[0].content, /^Talk like a friendly frog\./);
  assert.match(messages[0].content, /two short sentences/i);
});

test('buildBreakdownMessages requests the expected shape and a cap', () => {
  const messages = ai.buildBreakdownMessages('write my thesis', ['buy milk', 'pay bills']);
  assert.match(messages[0].content, /"parent"/);
  assert.match(messages[0].content, new RegExp(String(CONFIG.MAX_SUBTASKS)));
  assert.match(messages[1].content, /write my thesis/);
  assert.match(messages[1].content, /- buy milk/);
  assert.match(messages[1].content, /do not duplicate/i);
});

test('buildBreakdownMessages omits the context block when nothing is open', () => {
  const messages = ai.buildBreakdownMessages('goal', []);
  assert.ok(!/already has these open tasks/.test(messages[1].content));
});

// -------------------------------------------------------------- parsing ---

test('parseBreakdown reads a clean response', () => {
  const parsed = ai.parseBreakdown('{"parent":"Write thesis","subtasks":["Outline","Draft"]}');
  assert.deepStrictEqual(parsed, { parent: 'Write thesis', subtasks: ['Outline', 'Draft'] });
});

test('parseBreakdown unwraps a code fence', () => {
  const parsed = ai.parseBreakdown('```json\n{"parent":"Goal","subtasks":["Step"]}\n```');
  assert.deepStrictEqual(parsed, { parent: 'Goal', subtasks: ['Step'] });
});

test('parseBreakdown finds JSON embedded in prose', () => {
  const parsed = ai.parseBreakdown('Sure! Here you go: {"parent":"Goal","subtasks":["A"]} Hope that helps.');
  assert.deepStrictEqual(parsed, { parent: 'Goal', subtasks: ['A'] });
});

test('parseBreakdown tolerates a brace inside a subtask string', () => {
  const parsed = ai.parseBreakdown('{"parent":"Goal","subtasks":["write {draft} intro"]}');
  assert.deepStrictEqual(parsed.subtasks, ['write {draft} intro']);
});

test('parseBreakdown handles escaped quotes', () => {
  const parsed = ai.parseBreakdown('{"parent":"Goal","subtasks":["say \\"hi\\" to Sam"]}');
  assert.deepStrictEqual(parsed.subtasks, ['say "hi" to Sam']);
});

test('parseBreakdown strips list markers and numbering', () => {
  const parsed = ai.parseBreakdown('{"parent":"Goal","subtasks":["1. Outline","- Draft","* Revise"]}');
  assert.deepStrictEqual(parsed.subtasks, ['Outline', 'Draft', 'Revise']);
});

test('parseBreakdown drops empties and duplicates', () => {
  const parsed = ai.parseBreakdown('{"parent":"G","subtasks":["Step","  ","step","STEP"]}');
  assert.deepStrictEqual(parsed.subtasks, ['Step']);
});

test('parseBreakdown caps the number of subtasks', () => {
  const many = Array.from({ length: 30 }, (_, i) => `"Step ${i}"`).join(',');
  const parsed = ai.parseBreakdown(`{"parent":"G","subtasks":[${many}]}`);
  assert.strictEqual(parsed.subtasks.length, CONFIG.MAX_SUBTASKS);
});

test('parseBreakdown truncates over-long subtasks', () => {
  const long = 'x'.repeat(500);
  const parsed = ai.parseBreakdown(`{"parent":"G","subtasks":["${long}"]}`);
  assert.strictEqual(parsed.subtasks[0].length, CONFIG.MAX_ITEM_LENGTH);
});

test('parseBreakdown returns null for unusable output', () => {
  assert.strictEqual(ai.parseBreakdown('not json at all'), null);
  assert.strictEqual(ai.parseBreakdown(''), null);
  assert.strictEqual(ai.parseBreakdown(null), null);
  assert.strictEqual(ai.parseBreakdown('{"subtasks":["no parent key"]}').parent, '');
});

test('parseBreakdown keeps a parent with no subtasks', () => {
  const parsed = ai.parseBreakdown('{"parent":"Solo goal","subtasks":[]}');
  assert.deepStrictEqual(parsed, { parent: 'Solo goal', subtasks: [] });
});

test('firstJsonObject returns null when braces never balance', () => {
  assert.strictEqual(ai.firstJsonObject('{"parent":"x"'), null);
});

// ------------------------------------------------------------ transport ---

test('streamReply emits each token and returns the whole text', async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"You "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"can do"}}]}\n\n',
    'data: [DONE]\n\n',
  ];
  const tokens = [];
  const full = await withFetch(
    async () => sseResponse(chunks),
    () => ai.streamReply({
      baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'hi', onToken: (t) => tokens.push(t),
    })
  );
  assert.deepStrictEqual(tokens, ['You ', 'can do']);
  assert.strictEqual(full, 'You can do');
});

test('streamReply reassembles frames split across reads', async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"conte',
    'nt":"split "}}]}\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',
  ];
  const tokens = [];
  await withFetch(async () => sseResponse(chunks), () => ai.streamReply({
    baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'hi', onToken: (t) => tokens.push(t),
  }));
  assert.deepStrictEqual(tokens, ['split ', 'ok']);
});

test('streamReply skips keep-alive and unparsable frames', async () => {
  const chunks = [
    ': keep-alive\n\n',
    'data: not-json\n\n',
    'data: {"choices":[{"delta":{}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
  ];
  const tokens = [];
  await withFetch(async () => sseResponse(chunks), () => ai.streamReply({
    baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'hi', onToken: (t) => tokens.push(t),
  }));
  assert.deepStrictEqual(tokens, ['ok']);
});

test('callChatApi sends the bearer key and json mode only when not streaming', async () => {
  const calls = [];
  const stub = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (JSON.parse(options.body).stream) {
      return sseResponse(['data: [DONE]\n\n']);
    }
    return jsonResponse(chatPayload('{"parent":"G","subtasks":[]}'), {});
  };

  await withFetch(stub, () => ai.callChatApi({
    baseUrl: 'https://example.test/v1/', apiKey: 'secret', model: 'm',
    messages: [{ role: 'user', content: 'x' }], json: true,
  }));

  assert.strictEqual(calls[0].url, 'https://example.test/v1/chat/completions');
  assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer secret');
  assert.deepStrictEqual(calls[0].body.response_format, { type: 'json_object' });
  assert.strictEqual(calls[0].body.stream, false);

  await withFetch(stub, () => ai.callChatApi({
    baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'm',
    messages: [{ role: 'user', content: 'x' }], json: true, stream: true,
  }));
  assert.strictEqual(calls[1].body.response_format, undefined,
    'streaming prose must not request JSON');
});

test('callChatApi reports the provider error body', async () => {
  const failing = { ok: false, status: 401, async text() { return 'invalid api key'; } };
  await assert.rejects(
    () => withFetch(async () => failing, () => ai.callChatApi({
      baseUrl: 'https://example.test/v1', apiKey: 'bad', model: 'm', messages: [], json: true,
    })),
    /401.*invalid api key/
  );
});

test('callChatApi omits the header when no key is configured', async () => {
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push(options);
    return jsonResponse(chatPayload('{"parent":"G","subtasks":[]}'), {});
  }, () => ai.callChatApi({  // eslint-disable-line
    baseUrl: 'https://example.test/v1', model: 'm', messages: [], json: true,
  }));
  assert.strictEqual(calls[0].headers.Authorization, undefined);
});

// ----------------------------------------------------------- breakdown ---

test('breakdownGoal parses a good first response', async () => {
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push(JSON.parse(options.body));
    return jsonResponse(chatPayload('{"parent":"Write thesis","subtasks":["Outline","Draft"]}'), {});
  }, () => ai.breakdownGoal({
    baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'thesis', openItems: [],
  }));
  assert.strictEqual(calls.length, 1, 'no retry needed');
});

test('breakdownGoal retries once when the first reply is unusable', async () => {
  let attempts = 0;
  const result = await withFetch(async () => {
    attempts++;
    if (attempts === 1) return jsonResponse(chatPayload('sorry, no json here'), {});
    return jsonResponse(chatPayload('```json\n{"parent":"Goal","subtasks":["A"]}\n```'), {});
  }, () => ai.breakdownGoal({
    baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'goal', openItems: [],
  }));
  assert.strictEqual(attempts, 2, 'retried exactly once');
  assert.deepStrictEqual(result, { parent: 'Goal', subtasks: ['A'] });
});

test('breakdownGoal falls back to the goal itself when nothing parses', async () => {
  const result = await withFetch(async () => jsonResponse(chatPayload('nope'), {}), () => ai.breakdownGoal({
    baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'my goal', openItems: [],
  }));
  assert.deepStrictEqual(result, { parent: 'my goal', subtasks: [] });
});

test('breakdownGoal surfaces a persistent failure', async () => {
  await assert.rejects(
    () => withFetch(async () => jsonResponse({}, { ok: false, status: 500 }), () => ai.breakdownGoal({
      baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'goal', openItems: [],
    })),
    /500/
  );
});

test('breakdownGoal includes open tasks for de-duplication', async () => {
  let sent = null;
  await withFetch(async (url, options) => {
    sent = JSON.parse(options.body);
    return jsonResponse(chatPayload('{"parent":"G","subtasks":[]}'), {});
  }, () => ai.breakdownGoal({
    baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'goal',
    openItems: ['buy milk', 'pay bills'],
  }));
  const userMessage = sent.messages.find((m) => m.role === 'user').content;
  assert.match(userMessage, /buy milk/);
  assert.match(userMessage, /pay bills/);
});

test('breakdownGoal stops immediately when the caller aborts', async () => {
  const controller = new AbortController();
  let attempts = 0;
  await assert.rejects(() => withFetch(async () => {
    attempts++;
    controller.abort();
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  }, () => ai.breakdownGoal({
    baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'goal',
    openItems: [], signal: controller.signal,
  })), /abort/i);
  assert.strictEqual(attempts, 1, 'no retry after an abort');
});

// ----------------------------------------------------------- classification ---

test('buildClassifyMessages asks for JSON classification', () => {
  const messages = ai.buildClassifyMessages('write my thesis');
  assert.strictEqual(messages[0].role, 'system');
  assert.match(messages[0].content, /task.*chat|chat.*task/);
  assert.match(messages[0].content, /JSON/);
  assert.strictEqual(messages[1].content, 'write my thesis');
});

test('parseClassification reads a clean task response', () => {
  const parsed = ai.parseClassification('{"type":"task"}');
  assert.deepStrictEqual(parsed, { type: 'task' });
});

test('parseClassification reads a clean chat response', () => {
  const parsed = ai.parseClassification('{"type":"chat"}');
  assert.deepStrictEqual(parsed, { type: 'chat' });
});

test('parseClassification unwraps a code fence', () => {
  const parsed = ai.parseClassification('```json\n{"type":"task"}\n```');
  assert.deepStrictEqual(parsed, { type: 'task' });
});

test('parseClassification finds JSON embedded in prose', () => {
  const parsed = ai.parseClassification('The answer is {"type":"chat"} for you.');
  assert.deepStrictEqual(parsed, { type: 'chat' });
});

test('parseClassification returns null for unusable output', () => {
  assert.strictEqual(ai.parseClassification('not json at all'), null);
  assert.strictEqual(ai.parseClassification(''), null);
  assert.strictEqual(ai.parseClassification(null), null);
  assert.strictEqual(ai.parseClassification('{"type":"invalid"}'), null);
  assert.strictEqual(ai.parseClassification('{"other":"key"}'), null);
});

test('classifyInput returns task for a task-like goal', async () => {
  await withFetch(async () => jsonResponse({ choices: [{ message: { content: '{"type":"task"}' } }] }, {}), () => {
    return ai.classifyInput({
      baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'write my thesis',
    });
  }).then((result) => {
    assert.deepStrictEqual(result, { type: 'task' });
  });
});

test('classifyInput returns chat for casual input', async () => {
  await withFetch(async () => jsonResponse({ choices: [{ message: { content: '{"type":"chat"}' } }] }, {}), () => {
    return ai.classifyInput({
      baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'hello there',
    });
  }).then((result) => {
    assert.deepStrictEqual(result, { type: 'chat' });
  });
});

test('classifyInput defaults to chat when parsing fails', async () => {
  await withFetch(async () => jsonResponse({ choices: [{ message: { content: 'not json' } }] }, {}), () => {
    return ai.classifyInput({
      baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', text: 'something',
    });
  }).then((result) => {
    assert.deepStrictEqual(result, { type: 'chat' });
  });
});