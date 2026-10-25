// Tunable timings and wording for the buddy's proactive messages (nudges),
// kept in one place so they can be adjusted without hunting through the code.
// The lines are approved examples from docs/voice-and-behaviour.md.

window.NUDGE_CONFIG = {
  // How long an ignored nudge stays before it fades out by itself. A starting
  // value to test (see ui-spec.md, Open questions). Hovering or focusing the
  // nudge pauses it, so it never disappears while the user is reading.
  autoHideMs: 60000,

  // How long the back-off line ("Not now") stays before it fades. Same as the
  // speech bubble's 4 s in overlay.js.
  backOffVisibleMs: 4000,

  // The frog animation played just before a nudge appears, so the message
  // doesn't pop up out of nowhere. A placeholder until the artists make a
  // "looks up" or "talking" sprite: add it to avatar/config.js and name it here.
  cueAnimation: 'standingClicked',

  // Shown when a nudge arrives without its own text (e.g. --test-nudge).
  // Level 1 idle check-in.
  defaultText: 'Hey, still there? Wanna pick one tiny thing to start with?',

  // Added to the chat after the nudge text when the user picks "Yes, help me!".
  helpLine: "Want me to split this into a few small steps? Just tell me what you're working on.",

  // Shown briefly after "Not now" (level 4, back off).
  backOffLine: "Cool, carry on, I'm just here vibing.",

  // The quick-reply buttons, left to right. style is 'accent' or 'secondary'.
  // More can be added here later (e.g. the level 3 routing replies); the
  // overlay decides what each id does.
  replies: [
    { id: 'yes', label: 'Yes, help me!', style: 'accent' },
    { id: 'notNow', label: 'Not now', style: 'secondary' },
  ],
};
