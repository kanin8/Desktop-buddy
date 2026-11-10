// The Pomodoro timer: once the user joins, every 25-minute work round earns a
// 5-minute break, every fourth round earns a 30-minute long break, and a
// 5-minute break earns a "ready to keep working?" question. Answering no
// repeats that question every 3 minutes until the user is ready.
//
// The work countdown is wall-clock time, so it keeps running when the user
// leaves productive apps. Timing and state only: every visible effect (nudge
// bubble, frog pose) is a callback, so the whole flow can be tested with fake
// timers in study/test/studyBreak.test.js.
//
// Callbacks:
// - onSuggest(breakKind): show the break offer. Return true only if it is on screen.
// - onAskReady(): show the "ready?" question. Return true only if it is on screen.
// - onBreakStart(breakKind), onOverrunStart(): set the frog's break / waiting pose.
// - onBreakEnd(): hand the frog back to its normal rest pose.
//
// options (all optional, for tests):
// - setTimer(fn, ms), clearTimer(id), now()
function createStudyBreak(callbacks, options = {}) {
  const config = () => window.STUDY_CONFIG;
  const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer || ((id) => clearTimeout(id));
  const now = options.now || Date.now;

  // 'off' (not joined, or disabled for the session), 'work' (the 25-minute
  // round), 'offer' (round finished, break offer waiting to be answered),
  // 'break', or 'overrun' (break over, buddy keeps asking).
  let state = 'off';
  // Which question is waiting for an answer: 'suggestion', 'ready', or null.
  let pendingQuestion = null;
  // True while the active window is productive work. This only feeds the frog
  // pose and the AI status; the Pomodoro clock itself runs continuously.
  let isWorking = false;
  // True once the user accepts the Pomodoro invitation.
  let joined = false;
  let phaseTimer = null;
  // When the current work, break or overrun phase ends, for getStatus().
  let phaseEndsAt = null;
  let retryTimer = null;
  // Session kill switch ("Not today").
  let isDisabled = false;
  // Completed 25-minute work rounds in this session.
  let completedPomodoros = 0;
  // The break chosen for the current offer/break. 'short' or 'long'.
  let pendingBreakKind = null;
  let currentBreakKind = null;

  function clearPhaseTimer() {
    if (phaseTimer !== null) {
      clearTimer(phaseTimer);
      phaseTimer = null;
    }
    phaseEndsAt = null;
  }

  function clearRetryTimer() {
    if (retryTimer === null) return;
    clearTimer(retryTimer);
    retryTimer = null;
  }

  // Starts the next wall-clock work round. Called when the user joins and
  // whenever a break, offer, or overrun ends.
  function startWorkRound() {
    clearRetryTimer();
    clearPhaseTimer();
    if (!joined || isDisabled) {
      state = 'off';
      return;
    }
    state = 'work';
    pendingQuestion = null;
    pendingBreakKind = null;
    currentBreakKind = null;
    phaseEndsAt = now() + config().workSessionMs;
    phaseTimer = setTimer(() => {
      phaseTimer = null;
      phaseEndsAt = null;
      completeWorkRound();
    }, config().workSessionMs);
  }

  // The 25-minute round is over. Count it, choose the break length, and offer
  // the break. The count happens even if the user declines, because the work
  // itself is done.
  function completeWorkRound() {
    if (isDisabled || !joined || state !== 'work') return;
    completedPomodoros += 1;
    pendingBreakKind = completedPomodoros % config().longBreakEvery === 0 ? 'long' : 'short';
    state = 'offer';
    offerBreak();
  }

  function offerBreak() {
    if (isDisabled || !joined || state !== 'offer' || pendingQuestion || retryTimer !== null) return;
    if (!callbacks.onSuggest(pendingBreakKind)) {
      retryTimer = setTimer(() => {
        retryTimer = null;
        offerBreak();
      }, config().retryWhenBlockedMs);
      return;
    }
    pendingQuestion = 'suggestion';
  }

  function askReady() {
    if (isDisabled || pendingQuestion) return;
    if (state !== 'break' && state !== 'overrun') return;
    if (!callbacks.onAskReady()) {
      retryTimer = setTimer(() => {
        retryTimer = null;
        askReady();
      }, config().retryWhenBlockedMs);
      return;
    }
    pendingQuestion = 'ready';
  }

  function startBreak(kind) {
    clearRetryTimer();
    clearPhaseTimer();
    const lengthMs = kind === 'long' ? config().longBreakMs : config().shortBreakMs;
    state = 'break';
    pendingQuestion = null;
    pendingBreakKind = null;
    currentBreakKind = kind;
    callbacks.onBreakStart(kind);
    phaseEndsAt = now() + lengthMs;
    phaseTimer = setTimer(() => {
      phaseTimer = null;
      phaseEndsAt = null;
      askReady();
    }, lengthMs);
  }

  function enterOverrun() {
    clearRetryTimer();
    clearPhaseTimer();
    if (state !== 'overrun') {
      state = 'overrun';
      callbacks.onOverrunStart();
    }
    phaseEndsAt = now() + config().overrunMs;
    phaseTimer = setTimer(() => {
      phaseTimer = null;
      phaseEndsAt = null;
      askReady();
    }, config().overrunMs);
  }

  function endBreak() {
    clearRetryTimer();
    clearPhaseTimer();
    currentBreakKind = null;
    callbacks.onBreakEnd();
    if (joined && !isDisabled) startWorkRound();
    else state = 'off';
  }

  // The user accepts the Pomodoro invitation. Starts the first work round.
  function joinPomodoro() {
    if (joined || isDisabled) return false;
    joined = true;
    completedPomodoros = 0;
    startWorkRound();
    return true;
  }

  // Records whether the active window is productive. The Pomodoro timer is
  // continuous, so this does not pause or resume the countdown.
  function setWorking(value) {
    isWorking = Boolean(value);
  }

  // Yes to the break offer: start the short or long break chosen when the
  // work round completed. Returns the kind so the overlay can pick its line.
  function acceptBreak() {
    if (pendingQuestion !== 'suggestion') return null;
    const kind = pendingBreakKind || 'short';
    startBreak(kind);
    return kind;
  }

  // No to the break offer: start a fresh work round.
  function declineBreak() {
    if (pendingQuestion !== 'suggestion') return;
    pendingQuestion = null;
    pendingBreakKind = null;
    startWorkRound();
  }

  // Yes to "ready?": end the break and start a fresh work round.
  function acceptReady() {
    if (pendingQuestion !== 'ready') return;
    pendingQuestion = null;
    endBreak();
  }

  // No to "ready?": keep the judge pose and ask again in overrunMs.
  function declineReady() {
    if (pendingQuestion !== 'ready') return;
    pendingQuestion = null;
    enterOverrun();
  }

  // A "ready" chat message ends a break or the overrun cycle immediately.
  function endBreakEarly() {
    if (isDisabled || (state !== 'break' && state !== 'overrun')) return false;
    pendingQuestion = null;
    endBreak();
    return true;
  }

  // Called when a question bubble hides. An ignored suggestion starts a fresh
  // work round; an ignored "ready?" counts as No, so the overrun cycle runs.
  function noteQuestionHidden() {
    if (!pendingQuestion) return;
    const kind = pendingQuestion;
    pendingQuestion = null;
    clearRetryTimer();
    if (kind === 'suggestion') {
      pendingBreakKind = null;
      startWorkRound();
      return;
    }
    enterOverrun();
  }

  // "Not today": stop all Pomodoro timers and hand the frog back to its rest
  // pose if a break was running.
  function disable() {
    const wasShowingBreakPose = state === 'break' || state === 'overrun';
    isDisabled = true;
    joined = false;
    pendingQuestion = null;
    pendingBreakKind = null;
    currentBreakKind = null;
    clearPhaseTimer();
    clearRetryTimer();
    state = 'off';
    if (wasShowingBreakPose) callbacks.onBreakEnd();
  }

  // True when a chat message says the user is ready to work again.
  function looksReady(message) {
    const text = String(message || '').trim();
    if (!text) return false;
    const { readyPatterns, notReadyPatterns } = config();
    if (notReadyPatterns.some((pattern) => pattern.test(text))) return false;
    return readyPatterns.some((pattern) => pattern.test(text));
  }

  // Snapshot for the AI prompt and the clock: where the timer is, how long is
  // left in the current phase, and which work round the user is on.
  function getStatus() {
    const remainingMs = phaseEndsAt === null ? null : Math.max(0, phaseEndsAt - now());
    const nextBreakKind = (completedPomodoros + 1) % config().longBreakEvery === 0 ? 'long' : 'short';
    return {
      phase: state,
      joined,
      isWorking,
      remainingMs,
      pendingQuestion,
      disabled: isDisabled,
      breakKind: currentBreakKind || pendingBreakKind,
      completedPomodoros,
      roundNumber: completedPomodoros + 1,
      nextBreakKind,
    };
  }

  return {
    joinPomodoro,
    setWorking,
    acceptBreak,
    declineBreak,
    acceptReady,
    declineReady,
    endBreakEarly,
    noteQuestionHidden,
    disable,
    looksReady,
    getStatus,
    isJoined: () => joined,
    isActive: () => state === 'offer' || state === 'break' || state === 'overrun',
    isInBreak: () => state === 'break',
    isInOverrun: () => state === 'overrun',
  };
}

// Test hook: Node's require() gets the factory; the browser just keeps the
// global function.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createStudyBreak };
}
