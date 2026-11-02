// Tunable constants for the to-do list window and the AI task-breakdown feature.
// Kept in one file so geometry, timing, and AI settings can be adjusted without
// hunting through the window and AI logic.

module.exports = {
  // Panel geometry
  WINDOW_WIDTH: 320,      // fixed width; the panel grows vertically only
  DEFAULT_HEIGHT: 120,    // height on first paint, before the renderer reports its own
  MIN_HEIGHT: 60,         // floor so the header row is never clipped
  SCREEN_MARGIN: 16,      // gap between the panel and the screen edges

  // Stacking
  TOP_REASSERT_MS: 5000,  // how often to re-assert always-on-top (see todoWindow.js)

  // Store persistence
  STORE_DEBOUNCE_MS: 200, // coalesce rapid edits into one write

  // AI backend (remote, OpenAI-compatible chat-completions API)
  // Anything speaking /v1/chat/completions works: OpenAI, OpenRouter, Groq,
  // Together, a self-hosted vLLM. Cheapest usable defaults come first.
  AI_DEFAULT_BASE_URL: 'https://api.openai.com/v1',
  AI_DEFAULT_MODEL: 'gpt-4o-mini',       // inexpensive, fast, reliable JSON output
  AI_FREE_MODEL_HINTS: [                 // cheap/free options offered in Settings
    'gpt-4o-mini',
    'llama-3.1-8b-instant',               // Groq free tier
    'gpt-3.5-turbo',
  ],
  AI_KEY_ENV_VAR: 'DESKTOP_BUDDY_AI_KEY', // env var checked before the stored key
  AI_TIMEOUT_MS: 30000,                  // aborts a stalled request
  AI_MAX_TOKENS: 400,                    // caps cost of the in-character reply
  AI_TEMPERATURE: 0.7,
  // Voice guide sent as the reply's system message. Relative to this folder;
  // aiService.js resolves it against __dirname so the launch directory never matters.
  VOICE_GUIDE_PATH: '../docs/voice-and-behaviour.md',

  // Input classification (task vs chat)
  AI_CLASSIFY_TEMPERATURE: 0.1,
  AI_CLASSIFY_MAX_TOKENS: 50,

  // Task breakdown shaping
  MAX_SUBTASKS: 7,          // hard cap on generated subtasks
  MAX_CONTEXT_ITEMS: 50,    // open task texts sent for de-duplication
  MAX_ITEM_LENGTH: 200,     // matches the panel's input maxlength
};