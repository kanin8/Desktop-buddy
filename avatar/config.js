// Sprite-sheet layout and timing for the avatar's animated appearances.
// Kept in one file so frame geometry and playback speed can be tuned without
// touching the animation logic in spriteAnimator.js.
//
// Adding a new behaviour (walk, sleep, ...) means adding an entry to
// `animations` and calling SpriteAnimator.play('<name>') -- no other changes.

window.AVATAR_SPRITE_CONFIG = {
  // On-screen size of a single frame, in CSS pixels. These are deliberately
  // integers: Chromium rounds background-position to whole device pixels, and
  // fractional values make seams appear between adjacent frames.
  // The value matches the footprint the old static Frog_avatar.png occupied
  // (~75x125), so swapping in an animated sheet did not move the avatar
  // within its movement bounds.
  frameDisplay: {
    width: 80,
    height: 126,
  },

  animations: {
    idle: {
      // Path is relative to overlay.html, which sits at the project root.
      sheet: 'avatar/idle.png',

      // Measured from the 1960x3080 sheet: a uniform 5x5 grid of 392x616
      // cells, laid out left-to-right then top-to-bottom. Row count is
      // derived from frameCount / columns rather than stored separately.
      frameWidth: 392,
      frameHeight: 616,
      columns: 5,
      frameCount: 25,

      // ~12fps over the 25-frame loop, giving a ~2.1s cycle. Raising this to
      // 100 makes the idle loop 2.5s and calms down the blink, which is
      // roughly half a second of the current cycle.
      frameDurationMs: 83,
    },
  },
};