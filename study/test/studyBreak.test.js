// Unit tests for the continuous Pomodoro timer.
// Run with: node --test study/test/studyBreak.test.js
const test = require('node:test');
const assert = require('node:assert');

global.window = {};
require('../config');
const { createStudyBreak } = require('../studyBreak');
const CONFIG = global.window.STUDY_CONFIG;

// A tiny fake scheduler, so a 25-minute round runs instantly and the tests
// stay independent of real time.
function createClock() {
  let nextId = 1;
  let current = 0;
  const timers = new Map();

  function setTimer(fn, ms) {
    const id = nextId++;
    timers.set(id, { at: current + Math.max(0, ms), fn });
    return id;
  }

  function clearTimer(id) {
    timers.delete(id);
  }

  function advance(ms) {
    const target = current + Math.max(0, ms);
    for (;;) {
      let next = null;
      for (const [id, timer] of timers) {
        if (timer.at <= target && (!next || timer.at < next.timer.at)) {
          next = { id, timer };
        }
      }
      if (!next) break;
      timers.delete(next.id);
      current = next.timer.at;
      next.timer.fn();
    }
    current = target;
  }

  return { setTimer, clearTimer, now: () => current, advance };
}

// Builds the machine with a fake clock and records the callbacks it fires.
// `canShow` controls whether the questions are "on screen".
function makeStudy(canShow = {}) {
  const clock = createClock();
  const events = [];
  const suggestedKinds = [];
  const shown = { suggest: true, ready: true, ...canShow };
  const study = createStudyBreak(
    {
      onSuggest: (breakKind) => {
        events.push('suggest');
        suggestedKinds.push(breakKind);
        return shown.suggest;
      },
      onAskReady: () => {
        events.push('askReady');
        return shown.ready;
      },
      onBreakStart: () => events.push('breakStart'),
      onOverrunStart: () => events.push('overrunStart'),
      onBreakEnd: () => events.push('breakEnd'),
    },
    { setTimer: clock.setTimer, clearTimer: clock.clearTimer, now: clock.now }
  );
  return { study, clock, events, shown, suggestedKinds };
}

function count(events, name) {
  return events.filter((event) => event === name).length;
}

// Runs one complete short-break cycle: work -> offer -> break -> ready.
function completeShortRound(study, clock) {
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();
  clock.advance(CONFIG.shortBreakMs);
  study.acceptReady();
}

test('the timer stays off until the user joins', () => {
  const { study, clock, events } = makeStudy();
  study.setWorking(true);

  clock.advance(CONFIG.workSessionMs);
  assert.deepStrictEqual(events, []);
  assert.strictEqual(study.isJoined(), false);
  assert.strictEqual(study.getStatus().phase, 'off');
});

test('joining starts a 25-minute round and offers a short break', () => {
  const { study, clock, events, suggestedKinds } = makeStudy();
  assert.strictEqual(study.joinPomodoro(), true);
  assert.strictEqual(study.joinPomodoro(), false);

  clock.advance(CONFIG.workSessionMs - 1);
  assert.deepStrictEqual(events, []);

  clock.advance(1);
  assert.deepStrictEqual(events, ['suggest']);
  assert.deepStrictEqual(suggestedKinds, ['short']);
  assert.strictEqual(study.isActive(), true);
});

test('the work countdown keeps running through leisure', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  study.setWorking(true);
  clock.advance(CONFIG.workSessionMs / 2);

  study.setWorking(false);
  clock.advance(CONFIG.workSessionMs / 2);
  assert.deepStrictEqual(events, ['suggest']);
  assert.strictEqual(study.getStatus().isWorking, false);
});

test('accepting the short break starts it, then asks ready after 5 minutes', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);

  assert.strictEqual(study.acceptBreak(), 'short');
  assert.strictEqual(study.isInBreak(), true);
  assert.deepStrictEqual(events, ['suggest', 'breakStart']);

  clock.advance(CONFIG.shortBreakMs - 1);
  assert.strictEqual(count(events, 'askReady'), 0);

  clock.advance(1);
  assert.strictEqual(count(events, 'askReady'), 1);
});

test('declining the break starts a fresh work round', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);

  study.declineBreak();
  assert.strictEqual(study.isInBreak(), false);
  assert.strictEqual(study.getStatus().phase, 'work');
  assert.strictEqual(count(events, 'suggest'), 1);

  clock.advance(CONFIG.workSessionMs);
  assert.strictEqual(count(events, 'suggest'), 2);
});

test('every fourth completed round earns a 30-minute long break', () => {
  const { study, clock, suggestedKinds } = makeStudy();
  study.joinPomodoro();

  for (let round = 0; round < 3; round++) {
    completeShortRound(study, clock);
    assert.strictEqual(suggestedKinds[suggestedKinds.length - 1], 'short');
  }
  assert.strictEqual(study.getStatus().completedPomodoros, 3);

  clock.advance(CONFIG.workSessionMs);
  assert.strictEqual(suggestedKinds[suggestedKinds.length - 1], 'long');
  assert.strictEqual(study.acceptBreak(), 'long');

  const onLongBreak = study.getStatus();
  assert.strictEqual(onLongBreak.phase, 'break');
  assert.strictEqual(onLongBreak.breakKind, 'long');
  assert.strictEqual(onLongBreak.completedPomodoros, 4);
  assert.strictEqual(onLongBreak.remainingMs, CONFIG.longBreakMs);

  clock.advance(CONFIG.longBreakMs);
  study.acceptReady();

  clock.advance(CONFIG.workSessionMs);
  assert.strictEqual(suggestedKinds[suggestedKinds.length - 1], 'short');
});

test('declining the long break does not grant it again on round 5', () => {
  const { study, clock, suggestedKinds } = makeStudy();
  study.joinPomodoro();

  for (let round = 0; round < 3; round++) {
    completeShortRound(study, clock);
  }
  clock.advance(CONFIG.workSessionMs);
  assert.strictEqual(suggestedKinds[suggestedKinds.length - 1], 'long');

  study.declineBreak();
  assert.strictEqual(study.getStatus().phase, 'work');
  assert.strictEqual(study.getStatus().completedPomodoros, 4);

  clock.advance(CONFIG.workSessionMs);
  assert.strictEqual(suggestedKinds[suggestedKinds.length - 1], 'short');
});

test('declining ready enters overrun and asks again every 3 minutes', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();
  clock.advance(CONFIG.shortBreakMs);

  study.declineReady();
  assert.strictEqual(study.isInOverrun(), true);
  assert.strictEqual(count(events, 'overrunStart'), 1);
  assert.strictEqual(count(events, 'askReady'), 1);

  clock.advance(CONFIG.overrunMs);
  assert.strictEqual(count(events, 'askReady'), 2);
});

test('accepting ready ends the break and starts a fresh work round', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();
  clock.advance(CONFIG.shortBreakMs);

  study.acceptReady();
  assert.strictEqual(study.isActive(), false);
  assert.strictEqual(count(events, 'breakEnd'), 1);

  clock.advance(CONFIG.workSessionMs);
  assert.strictEqual(count(events, 'suggest'), 2);
});

test('ignoring the ready question counts as No', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();
  clock.advance(CONFIG.shortBreakMs);

  study.noteQuestionHidden();
  assert.strictEqual(study.isInOverrun(), true);

  clock.advance(CONFIG.overrunMs);
  assert.strictEqual(count(events, 'askReady'), 2);
});

test('ignoring the break offer starts a fresh work round', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);

  study.noteQuestionHidden();
  assert.strictEqual(study.isActive(), false);

  clock.advance(CONFIG.workSessionMs);
  assert.strictEqual(count(events, 'suggest'), 2);
});

test('a blocked question is retried instead of dropped', () => {
  const { study, clock, events, shown } = makeStudy({ suggest: false });
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  assert.deepStrictEqual(events, ['suggest']);

  clock.advance(CONFIG.retryWhenBlockedMs);
  assert.deepStrictEqual(events, ['suggest', 'suggest']);

  shown.suggest = true;
  clock.advance(CONFIG.retryWhenBlockedMs);
  assert.strictEqual(count(events, 'suggest'), 3);

  clock.advance(CONFIG.retryWhenBlockedMs);
  assert.strictEqual(count(events, 'suggest'), 3);
});

test('readiness phrases are recognised, including "done with my break"', () => {
  const { study } = makeStudy();

  assert.strictEqual(study.looksReady("I'm done with my break"), true);
  assert.strictEqual(study.looksReady('Im done with my break'), true);
  assert.strictEqual(study.looksReady('my break is over'), true);
  assert.strictEqual(study.looksReady("break's over"), true);
  assert.strictEqual(study.looksReady("I'm back"), true);
  assert.strictEqual(study.looksReady('ready to work'), true);
  assert.strictEqual(study.looksReady("I'm not ready yet"), false);
  assert.strictEqual(study.looksReady('what is a break'), false);
  assert.strictEqual(study.looksReady(''), false);
});

test('work-intent phrases count as ready', () => {
  const { study } = makeStudy();

  assert.strictEqual(study.looksReady("I'll start working"), true);
  assert.strictEqual(study.looksReady('I want to work now'), true);
  assert.strictEqual(study.looksReady("let's get back to work"), true);
  assert.strictEqual(study.looksReady("I can't start working"), false);
  assert.strictEqual(study.looksReady("I don't want to work"), false);
  assert.strictEqual(study.looksReady('how do I start working on this?'), false);
});

test('stop and start commands are recognised', () => {
  const { study } = makeStudy();

  assert.strictEqual(study.looksLikeStop('stop the pomodoro'), true);
  assert.strictEqual(study.looksLikeStop('can you end the timer?'), true);
  assert.strictEqual(study.looksLikeStop('turn off the pomodoro'), true);
  assert.strictEqual(study.looksLikeStop('I want to start working'), false);
  assert.strictEqual(study.looksLikeStop('I cannot stop scrolling'), false);
  assert.strictEqual(study.looksLikeStop('stop by the store'), false);
  assert.strictEqual(study.looksLikeStop('I want to end my break'), false);

  assert.strictEqual(study.looksLikeStart('start the pomodoro'), true);
  assert.strictEqual(study.looksLikeStart('please rejoin the timer'), true);
  assert.strictEqual(study.looksLikeStart('what is the timer for'), false);
  assert.strictEqual(study.looksLikeStart('I want to start working on the timer'), false);
  assert.strictEqual(study.looksLikeStart(''), false);
});

test('a readiness message ends a break or the overrun cycle', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();

  assert.strictEqual(study.endBreakEarly(), true);
  assert.strictEqual(study.isActive(), false);
  assert.strictEqual(count(events, 'breakEnd'), 1);

  assert.strictEqual(study.endBreakEarly(), false);
});

test('disable stops the timers and ends an active break', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();

  study.disable();
  assert.strictEqual(study.isActive(), false);
  const eventCount = events.length;

  clock.advance(CONFIG.shortBreakMs + CONFIG.overrunMs);
  assert.strictEqual(events.length, eventCount);
});

test('disable before a break prevents the offer', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  study.disable();

  clock.advance(CONFIG.workSessionMs);
  assert.deepStrictEqual(events, []);
});

test('stopPomodoro stops the timer without disabling proactive nudges', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs / 2);

  assert.strictEqual(study.stopPomodoro(), true);
  assert.strictEqual(study.isJoined(), false);
  assert.strictEqual(study.getStatus().phase, 'off');
  assert.strictEqual(study.getStatus().disabled, false);

  const eventCount = events.length;
  clock.advance(CONFIG.workSessionMs);
  assert.strictEqual(events.length, eventCount);
});

test('stopPomodoro ends an active break pose', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();

  assert.strictEqual(study.stopPomodoro(), true);
  assert.strictEqual(count(events, 'breakEnd'), 1);
  assert.strictEqual(study.getStatus().disabled, false);
});

test('stopPomodoro from a break offer does not fire onBreakEnd', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);

  study.stopPomodoro();
  assert.strictEqual(count(events, 'breakEnd'), 0);
  assert.strictEqual(study.getStatus().phase, 'off');
});

test('the timer can be joined again after stopping', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  study.stopPomodoro();

  assert.strictEqual(study.joinPomodoro(), true);
  clock.advance(CONFIG.workSessionMs);
  assert.strictEqual(count(events, 'suggest'), 1);
});

test('an explicit join clears the Not today kill switch', () => {
  const { study, clock } = makeStudy();
  study.joinPomodoro();
  study.disable();
  assert.strictEqual(study.getStatus().disabled, true);

  assert.strictEqual(study.joinPomodoro(), true);
  assert.strictEqual(study.getStatus().disabled, false);
  assert.strictEqual(study.getStatus().phase, 'work');

  clock.advance(CONFIG.workSessionMs);
  assert.strictEqual(study.getStatus().phase, 'offer');
});

test('enable clears Not today without starting the timer', () => {
  const { study, clock, events } = makeStudy();
  study.disable();
  study.enable();

  assert.strictEqual(study.getStatus().disabled, false);
  assert.strictEqual(study.getStatus().phase, 'off');

  clock.advance(CONFIG.workSessionMs);
  assert.deepStrictEqual(events, []);
});

test('getStatus reports the continuous work countdown and round details', () => {
  const { study, clock } = makeStudy();
  study.joinPomodoro();
  study.setWorking(true);
  clock.advance(CONFIG.workSessionMs / 2);
  study.setWorking(false);

  const status = study.getStatus();
  assert.strictEqual(status.phase, 'work');
  assert.strictEqual(status.joined, true);
  assert.strictEqual(status.isWorking, false);
  assert.strictEqual(status.remainingMs, CONFIG.workSessionMs / 2);
  assert.strictEqual(status.pendingQuestion, null);
  assert.strictEqual(status.disabled, false);
  assert.strictEqual(status.breakKind, null);
  assert.strictEqual(status.completedPomodoros, 0);
  assert.strictEqual(status.roundNumber, 1);
  assert.strictEqual(status.nextBreakKind, 'short');
});

test('getStatus reports the short and long break countdowns', () => {
  const { study, clock } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();

  let status = study.getStatus();
  assert.strictEqual(status.phase, 'break');
  assert.strictEqual(status.breakKind, 'short');
  assert.strictEqual(status.remainingMs, CONFIG.shortBreakMs);

  clock.advance(CONFIG.shortBreakMs / 2);
  status = study.getStatus();
  assert.strictEqual(status.remainingMs, CONFIG.shortBreakMs / 2);
  assert.strictEqual(status.pendingQuestion, null);

  clock.advance(CONFIG.shortBreakMs / 2);
  status = study.getStatus();
  assert.strictEqual(status.pendingQuestion, 'ready');
  assert.strictEqual(status.remainingMs, null);

  study.declineReady();
  status = study.getStatus();
  assert.strictEqual(status.phase, 'overrun');
  assert.strictEqual(status.remainingMs, CONFIG.overrunMs);
  assert.strictEqual(status.breakKind, 'short');

  clock.advance(CONFIG.overrunMs / 2);
  assert.strictEqual(study.getStatus().remainingMs, CONFIG.overrunMs / 2);
});

test('getStatus describes the long-break offer before it is accepted', () => {
  const { study, clock } = makeStudy();
  study.joinPomodoro();

  for (let round = 0; round < 3; round++) {
    completeShortRound(study, clock);
  }
  clock.advance(CONFIG.workSessionMs);

  const status = study.getStatus();
  assert.strictEqual(status.phase, 'offer');
  assert.strictEqual(status.remainingMs, null);
  assert.strictEqual(status.breakKind, 'long');
  assert.strictEqual(status.completedPomodoros, 4);
  assert.strictEqual(status.roundNumber, 5);
  assert.strictEqual(status.nextBreakKind, 'short');
});

test('getStatus says the timer is off after disable', () => {
  const { study, clock } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs / 2);
  study.disable();

  const status = study.getStatus();
  assert.strictEqual(status.phase, 'off');
  assert.strictEqual(status.joined, false);
  assert.strictEqual(status.disabled, true);
  assert.strictEqual(status.remainingMs, null);
});

test('pause freezes the countdown and resume continues it', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(10 * 60 * 1000);

  assert.strictEqual(study.pause(), true);
  assert.strictEqual(study.pause(), false);
  clock.advance(CONFIG.workSessionMs);
  assert.deepStrictEqual(events, []);
  assert.strictEqual(study.getStatus().isPaused, true);
  assert.strictEqual(study.getStatus().remainingMs, 15 * 60 * 1000);

  assert.strictEqual(study.resume(), true);
  assert.strictEqual(study.getStatus().isPaused, false);
  clock.advance(15 * 60 * 1000 - 1);
  assert.deepStrictEqual(events, []);
  clock.advance(1);
  assert.deepStrictEqual(events, ['suggest']);
});

test('a paused break asks "ready?" only after it resumes and runs out', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();
  study.pause();
  clock.advance(CONFIG.shortBreakMs * 2);
  assert.strictEqual(count(events, 'askReady'), 0);

  study.resume();
  clock.advance(CONFIG.shortBreakMs);
  assert.strictEqual(count(events, 'askReady'), 1);
});

test('pause and resume do nothing when the timer is off', () => {
  const { study } = makeStudy();
  assert.strictEqual(study.pause(), false);
  assert.strictEqual(study.resume(), false);
  assert.strictEqual(study.skipPhase(), null);
});

test('skipping a work round counts it and asks whether the user wants a break', () => {
  const { study, events, suggestedKinds } = makeStudy();
  study.joinPomodoro();

  assert.strictEqual(study.skipPhase(), 'offer');
  assert.deepStrictEqual(events, ['suggest']);
  assert.deepStrictEqual(suggestedKinds, ['short']);
  const status = study.getStatus();
  assert.strictEqual(status.phase, 'offer');
  assert.strictEqual(status.pendingQuestion, 'suggestion');
  assert.strictEqual(status.completedPomodoros, 1);
});

test('the fourth skipped work round offers a long break', () => {
  const { study, suggestedKinds } = makeStudy();
  study.joinPomodoro();
  for (let round = 1; round < CONFIG.longBreakEvery; round += 1) {
    study.skipPhase();
    study.declineBreak();
  }
  study.skipPhase();
  assert.strictEqual(suggestedKinds[suggestedKinds.length - 1], 'long');
});

test('skipping a break asks whether the user is ready to keep working', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();
  clock.advance(60 * 1000);

  assert.strictEqual(study.skipPhase(), 'ready');
  assert.deepStrictEqual(events, ['suggest', 'breakStart', 'askReady']);
  assert.strictEqual(study.getStatus().pendingQuestion, 'ready');
  assert.strictEqual(study.getStatus().remainingMs, null);

  // The break timer is gone, so it doesn't ask a second time on its own.
  clock.advance(CONFIG.shortBreakMs);
  assert.strictEqual(count(events, 'askReady'), 1);
});

test('skipping the overrun wait asks the ready question again now', () => {
  const { study, clock, events } = makeStudy();
  study.joinPomodoro();
  clock.advance(CONFIG.workSessionMs);
  study.acceptBreak();
  clock.advance(CONFIG.shortBreakMs);
  study.declineReady();

  assert.strictEqual(study.skipPhase(), 'ready');
  assert.strictEqual(count(events, 'askReady'), 2);
});

test('a skipped question that cannot be shown retries like a normal one', () => {
  const { study, clock, events } = makeStudy({ suggest: false });
  study.joinPomodoro();
  study.skipPhase();
  assert.strictEqual(count(events, 'suggest'), 1);
  clock.advance(CONFIG.retryWhenBlockedMs);
  assert.strictEqual(count(events, 'suggest'), 2);
});

test('skipping while paused clears the pause', () => {
  const { study } = makeStudy();
  study.joinPomodoro();
  study.pause();
  study.skipPhase();
  assert.strictEqual(study.getStatus().isPaused, false);
});

test('stopping while paused clears the pause', () => {
  const { study } = makeStudy();
  study.joinPomodoro();
  study.pause();
  study.stopPomodoro();
  const status = study.getStatus();
  assert.strictEqual(status.isPaused, false);
  assert.strictEqual(status.remainingMs, null);
});
