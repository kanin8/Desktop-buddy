// Watches how long the user has gone without typing or moving the mouse, and
// calls back once per idle stretch (used for the level 1 "still there?" nudge).

class IdleWatcher {
  // getIdleSeconds(): seconds since the last keyboard/mouse input, system-wide.
  //   Passed in so this file stays free of Electron and OS-specific APIs.
  // onIdle(): called once when the idle time first reaches thresholdMs. It is
  //   not called again until the user has been active in between.
  // thresholdMs / pollMs: how long counts as idle, and how often to check.
  constructor({ getIdleSeconds, onIdle, thresholdMs, pollMs }) {
    this.getIdleSeconds = getIdleSeconds;
    this.onIdle = onIdle;
    this.thresholdMs = thresholdMs;
    this.pollMs = pollMs;
    this.hasFiredThisStretch = false;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.check(), this.pollMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // One check: any input since the last one re-arms the watcher; crossing the
  // threshold calls onIdle, once.
  check() {
    const idleMs = this.getIdleSeconds() * 1000;
    if (idleMs < this.thresholdMs) {
      this.hasFiredThisStretch = false;
      return;
    }
    if (this.hasFiredThisStretch) return;
    this.hasFiredThisStretch = true;
    this.onIdle();
  }
}

module.exports = { IdleWatcher };
