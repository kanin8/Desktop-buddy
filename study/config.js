// Tunable timings, wording and reply ids for the Pomodoro timer: a 25-minute
// work round, a 5-minute short break, a 30-minute long break every 4 rounds,
// then a 3-minute re-ask cycle until the user is ready. Kept in one place so
// the cadence and lines are easy to adjust without touching the timer logic.

window.STUDY_CONFIG = {
  // How long the frog waits after the startup greeting settles before offering
  // to follow Pomodoro with the user.
  inviteDelayMs: 25 * 1000,

  // Length of one continuous Pomodoro work round. This is wall-clock time: it
  // keeps running even when the user leaves productive apps.
  workSessionMs: 25 * 60 * 1000,

  // Length of a normal break before the buddy asks whether the user is ready.
  shortBreakMs: 5 * 60 * 1000,

  // Every fourth completed work round earns a longer break instead.
  longBreakEvery: 4,
  longBreakMs: 30 * 60 * 1000,

  // How often the buddy asks again while the user is not ready to continue.
  overrunMs: 3 * 60 * 1000,

  // When a question cannot be shown (chat/menu open, another nudge showing,
  // overlay hidden), try again this much later instead of dropping the flow.
  retryWhenBlockedMs: 15 * 1000,

  lines: {
    pomodoroInvite: "I'm planning to follow the Pomodoro technique today, would you like to join?",
    pomodoroAccepted: "Nice! We'll do 25 minutes of work, then a 5 minute break.",
    pomodoroDeclined: "No worries, I'll keep it to myself then.",
    suggestion: "Hey, we've been working for a while now, it might be time for a little break.",
    longBreakSuggestion: "That's four rounds done. Want to take a longer break?",
    breakAccepted: "Great! Let's do a 5 minute break.",
    longBreakAccepted: "Great work! Let's take a 30 minute break.",
    breakDeclined: "Alright, let's keep working then.",
    readyQuestion: 'Are you ready to keep working?',
    readyAccepted: "Great, let's continue then.",
    readyDeclined: 'Alright, but we should continue soon.',
    pomodoroStopped: 'Okay, stopping the timer.',
  },

  // Quick-reply ids dispatched in overlay.js, with the labels the user sees.
  replyIds: {
    pomodoroYes: 'pomodoroYes',
    pomodoroNo: 'pomodoroNo',
    breakYes: 'studyBreakYes',
    breakNo: 'studyBreakNo',
    readyYes: 'studyReadyYes',
    readyNo: 'studyReadyNo',
    stop: 'studyStop',
  },
  pomodoroReplies: [
    { id: 'pomodoroYes', label: 'Yes', style: 'accent' },
    { id: 'pomodoroNo', label: 'No', style: 'secondary' },
  ],
  breakReplies: [
    { id: 'studyBreakYes', label: 'Yes', style: 'accent' },
    { id: 'studyBreakNo', label: 'No', style: 'secondary' },
    { id: 'studyStop', label: 'Stop timer', style: 'secondary' },
  ],
  readyReplies: [
    { id: 'studyReadyYes', label: 'Yes', style: 'accent' },
    { id: 'studyReadyNo', label: 'No', style: 'secondary' },
    { id: 'studyStop', label: 'Stop timer', style: 'secondary' },
  ],

  // A chat message matching any of these asks to stop or (re)start the
  // Pomodoro timer. Both an action and a timer word are required, so normal
  // conversation ("I can't stop scrolling") doesn't match. "Break" is left out
  // on purpose: break messages belong to the readiness flow below.
  stopPatterns: [
    /\b(stop|end|quit|leave|cancel|exit|turn off)\b.{0,12}\b(pomodoro|timer|clock|session)\b/i,
    /\b(pomodoro|timer|clock|session)\b.{0,12}\b(stop|end|quit|leave|cancel|exit|off)\b/i,
  ],
  startPatterns: [
    /\b(start|begin|resume|restart|join|rejoin|turn on)\b.{0,12}\b(pomodoro|timer|clock|session)\b/i,
    /\b(pomodoro|timer|clock|session)\b.{0,12}\b(start|begin|resume|restart|join|rejoin)\b/i,
  ],

  // A chat message matching any of these means the user is ready to work
  // again, so a break or the "still coming?" cycle ends early. These also
  // let the user undo "Not today" by saying they want to start working.
  readyPatterns: [
    /\bready\b/i,
    /\bkeep (on )?working\b/i,
    /\bback to work\b/i,
    /\breturning to work\b/i,
    /\bcontinue\b/i,
    /\blet'?s (continue|work|get back to work)\b/i,
    /\bi(?:'ll| will) (start|begin) work(ing)?\b/i,
    /\bi(?:'m| am) (going to|gonna) (start )?work(ing)?\b/i,
    /\bi want to (start )?work(ing)?\b/i,
    /\bi need to (start )?work(ing)?\b/i,
    /\bi have to (start )?work(ing)?\b/i,
    /\btime to (start )?work(ing)?\b/i,
    /\b(done|finished) with (my|the) break\b/i,
    /\bmy break('?s| is) over\b/i,
    /\bbreak (is )?(done|over)\b/i,
    /\bbreak'?s over\b/i,
    /\bi'?m back\b/i,
  ],

  // Checked first, so "not ready" does not match the plain "ready" pattern.
  notReadyPatterns: [
    /\bnot ready\b/i,
    /\bnot done\b/i,
    /\b(can'?t|cannot|won'?t|not going to|don'?t want to)\b.{0,20}\bwork(ing)?\b/i,
  ],
};
