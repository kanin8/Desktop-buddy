// Tunable constants for the to-do list window and the AI task-breakdown feature.
// Kept in one file so geometry, timing, and AI settings can be adjusted without
// hunting through the window and AI logic.

module.exports = {
  // Panel geometry
  WINDOW_WIDTH: 320,      // fixed width; the panel grows vertically only
  DEFAULT_HEIGHT: 120,    // height on first paint, before the renderer reports its own
  MIN_HEIGHT: 60,         // floor so the header row is never clipped
  SCREEN_MARGIN: 16,      // gap between the panel and the screen edges
  // 0 keeps the frog entirely above the list: the panel's top edge starts at
  // the frog's feet line, so no part of the frog sits inside the panel (the
  // avatar overlay is also kept above the panel via 'todo-panel-raised' in
  // the host app, so the feet and their hover indicator are never covered).
  // Raise the value to sink the feet into the panel instead.
  FOLLOW_FEET_OVERLAP: 0,

  // Stacking
  TOP_REASSERT_MS: 5000,  // how often to re-assert always-on-top (see todoWindow.js)

  // Store persistence
  STORE_DEBOUNCE_MS: 200, // coalesce rapid edits into one write

  // AI backend
  // Every AI feature (chat, task breakdown, activity classification) shares
  // this one backend. Anthropic goes through its official SDK
  // (anthropicClient.js); the others speak the OpenAI-compatible
  // /v1/chat/completions API.
  AI_PROVIDERS: {
    anthropic: {
      label: 'Anthropic (Claude)',
      baseUrl: 'https://api.anthropic.com', // fixed: the SDK sets it itself
      model: 'claude-haiku-5-5',          // fast and cheap, fits short replies and classification
      modelHints: ['claude-haiku-5-5'],
      needsApiKey: true,
      usesClaudeSdk: true,
    },
    openai: {
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',              // inexpensive, fast, reliable JSON output
      modelHints: ['gpt-4o-mini', 'gpt-3.5-turbo'],
      needsApiKey: true,
    },
    ollama: {
      label: 'Ollama (local)',
      baseUrl: 'http://localhost:11434/v1',
      model: 'gemma:2b',
      modelHints: ['gemma:2b', 'llama3.2', 'qwen2.5'],
      needsApiKey: false,                // runs on this machine, no account
    },
    custom: {
      label: 'Other (OpenAI-compatible)',
      baseUrl: '',                        // e.g. Groq, OpenRouter, a vLLM server
      model: '',
      modelHints: ['llama-3.1-8b-instant'], // Groq free tier
      needsApiKey: true,
    },
  },
  AI_DEFAULT_PROVIDER: 'anthropic',
  AI_DEFAULT_BASE_URL: 'https://api.anthropic.com',
  AI_DEFAULT_MODEL: 'claude-haiku-5-5',
  AI_KEY_ENV_VAR: 'DESKTOP_BUDDY_AI_KEY', // env var checked before the stored key

  // Claude-specific request shaping. Claude rejects temperature settings, so
  // `effort` is the speed control instead. Claude thinks before it answers and
  // that thinking counts toward max_tokens, so the cap is higher than the
  // reply itself needs.
  AI_CLAUDE_EFFORT: 'low',               // short replies and one-word classifications
  AI_CLAUDE_MAX_TOKENS: 2048,
  AI_TIMEOUT_MS: 30000,                  // aborts a stalled request
  AI_MAX_TOKENS: 400,                    // caps cost of the in-character reply
  AI_TEMPERATURE: 0.7,
  // Voice guide sent as the reply's system message. Relative to this folder;
  // aiService.js resolves it against __dirname so the launch directory never matters.
  VOICE_GUIDE_PATH: '../docs/voice-prompt.md',

  // Input classification (task vs chat)
  AI_CLASSIFY_TEMPERATURE: 0.1,
  AI_CLASSIFY_MAX_TOKENS: 50,

  // Activity classification (productive vs leisure for the active window)
  AI_ACTIVITY_TEMPERATURE: 0,            // same window should get the same answer
  AI_ACTIVITY_MAX_TOKENS: 10,            // the answer is a single word

  // Task breakdown shaping
  MAX_SUBTASKS: 7,          // hard cap on generated subtasks
  MAX_CONTEXT_ITEMS: 50,    // open task texts sent for de-duplication
  MAX_ITEM_LENGTH: 200,     // matches the panel's input maxlength
};