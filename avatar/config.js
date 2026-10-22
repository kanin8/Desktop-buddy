// Sprite-sheet layout and timing for the avatar's animated appearances.
// Kept in one file so frame geometry and playback speed can be tuned without
// touching the animation logic in spriteAnimator.js.
//
// Adding a new behaviour (walk, sleep, ...) means adding an entry to
// `animations` and calling SpriteAnimator.play('<name>') -- no other changes.

window.AVATAR_SPRITE_CONFIG = {
  // Fallback on-screen size of a single frame, in CSS pixels, for animations
  // that do not specify their own `display`. These are deliberately integers:
  // Chromium rounds background-position to whole device pixels, and fractional
  // values make seams appear between adjacent frames.
  // The idle value matches the footprint the old static Frog_avatar.png
  // occupied (~75x125), so swapping in an animated sheet did not move the
  // avatar within its movement bounds.
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

      loop: true,
      offsetY: 0,
    },

    // One-shot click reaction, played from the idle loop and handed back to it
    // when the last frame lands. See overlay.js for the click wiring.
    standingClicked: {
      sheet: 'avatar/standingClicked.png',

      // Measured from the 1810x2571 sheet: a 5x3 grid of 362x857 cells. This
      // sheet is much taller per cell than idle (aspect 0.42 vs 0.64) and its
      // character sits smaller inside the cell, so it carries its own
      // `display` -- reusing idle's would stretch the frog horizontally.
      frameWidth: 362,
      frameHeight: 857,
      columns: 5,
      frameCount: 15,

      // ~14fps over the 15 frames, giving a ~1.05s reaction. Tune by eye.
      frameDurationMs: 70,

      loop: false,

      // Scales this sheet up so its standing frames (~76x122) match idle's
      // footprint (~75x125) instead of rendering the frog smaller.
      display: {
        width: 84,
        height: 198,
      },

      // The feet rest at 86.1% down this sheet's cells but 99.7% down idle's,
      // so centring both in the same box would dip the frog ~9px on click.
      // This shifts it back up. Expressed as a plain offset so it can be
      // eyeballed and tuned here rather than recomputed.
      offsetY: -9,
    },
  },
};