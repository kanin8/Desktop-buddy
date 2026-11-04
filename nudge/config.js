// Tunable timings and wording for the buddy's proactive messages (nudges),
// kept in one place so they can be adjusted without hunting through the code.
// The lines are approved examples from docs/voice-and-behaviour.md.

window.NUDGE_CONFIG = {
  // How long an ignored nudge stays before it fades out by itself. A starting
  // value to test (see ui-spec.md, Open questions). Hovering or focusing the
  // nudge pauses it, so it never disappears while the user is reading.
  autoHideMs: 60000,

  // How long the back-off line ("Not now") or fineLine stays before it fades.
  // Same as the speech bubble's 4 s in overlay.js.
  backOffVisibleMs: 4000,

  // The frog animation played just before a nudge appears, so the message
  // doesn't pop up out of nowhere. A placeholder until the artists make a
  // "looks up" or "talking" sprite: add it to avatar/config.js and name it here.
  cueAnimation: 'standingClicked',

  // Shown when a nudge arrives without its own text (e.g. --test-nudge).
  // Level 1 idle check-in.
  defaultText: 'Hey, still there? Wanna pick one tiny thing to start with?',

  // How long the user must stay in leisure after the frog starts judging
  // before it says anything. A quick look at something else shouldn't
  // trigger a nudge.
  judgingDelayMs: 180000,

  // Minimum time between two nudges, so they never pile up.
  cooldownMs: 600000,

  // At most this many nudges in any rolling hour.
  maxPerHour: 3,

  // After "Not now" (or "I'm fine"), the buddy stays quiet this long. The user
  // said no, so it respects that for a good while.
  quietAfterNotNowMs: 2700000,

  // Said when the frog has been judging for judgingDelayMs. Picked at random,
  // never the same line twice in a row. A line with its own replies uses those
  // buttons; the rest use the default replies below. Playful, a bit dramatic,
  // never guilt-tripping (see docs/voice-and-behaviour.md).
  judgingLines: [
    { text: "I'm not judging. Okay, I'm judging a little. Wanna pick one tiny thing?" },
    { text: 'Quick break or long break? No pressure, just checking.' },
    { text: "I've been sitting here alone for minutes. Could you please get back to work?" },
    { text: 'A frog can only stare dramatically for so long. Need a hand getting started?' },
    { text: "Hopping in to check, how's it going?" },
    {
      text: "This is fine. I'm fine. Are you fine?",
      replies: [
        { id: 'fine', label: "I'm fine", style: 'secondary' },
        { id: 'notFine', label: "I'm not", style: 'accent' },
      ],
    },
  ],

  // Added to the chat after the nudge text when the user picks "Yes, help me!".
  helpLine: "Want me to split this into a few small steps? Just tell me what you're working on.",

  // Added to the chat after the nudge text when the user picks "I'm not".
  notFineLine:
    "Fair. Some days are like that. Want to just pick one really small thing, or talk about what's in the way?",

  // Shown briefly after "I'm fine", then it fades like the back-off line.
  fineLine: "Great. We're both fine. Totally fine.",

  // Shown briefly after "Not now" (level 4, back off). One is picked at random.
  backOffLines: [
    "Cool, carry on, I'm just here vibing.",
    'Ok ok, zipping it. Shout if you need me.',
    'Say no more. Pretending I was never here.',
  ],

  // The default quick-reply buttons, left to right, for nudges without their
  // own. style is 'accent' or 'secondary'. More can be added here later (e.g.
  // the level 3 routing replies); the overlay decides what each id does.
  replies: [
    { id: 'yes', label: 'Yes, help me!', style: 'accent' },
    { id: 'notNow', label: 'Not now', style: 'secondary' },
  ],
};
