// Formats the Pomodoro clock as mm:ss. Kept separate from the timer and the
// overlay so the rounding rules can be unit tested without a browser.

function formatClock(ms) {
  if (!Number.isFinite(ms)) return '--:--';
  const totalSeconds = Math.max(0, Math.ceil(Number(ms) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

window.STUDY_CLOCK = { formatClock };

// Test hook: Node's require() gets the function; the browser keeps the global.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatClock };
}
