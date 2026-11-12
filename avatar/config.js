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

    // Standing "talking" loop, played while the buddy is delivering a chat
    // message. Same 5x5 layout as idle, so it shares idle's default display.
    idleSpeak: {
      sheet: 'avatar/IdleSpeak.png',
      frameWidth: 392,
      frameHeight: 616,
      columns: 5,
      frameCount: 25,
      frameDurationMs: 83,
      loop: false,
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
      // The ramp keeps the first frame on idle's baseline and lifts the final
      // landing frame back onto it, so the handoff to idle does not drift.
      offsetY: { from: -9, to: -6 },
    },

    // --- Category-driven poses ---
    // These sheets are drawn at different source resolutions, so each
    // `display` is scaled so the visible sprite is about as tall as idle
    // (~125px). Scaling by the raw source ratio instead would make the frog
    // shrink to half size in the standing poses.
    //
    // The seated poses are then scaled down another 10%: matching idle's
    // height left them looking a little larger than the standing frog, since
    // they also carry the chair and desk. The desk and typing poses are 5%
    // smaller again, as they still read slightly large beside the others.
    // offsetY keeps transitions planted: standing poses land on idle's
    // baseline (box centre + --avatar-feet-offset), and the intro clips chain
    // onto the seated baseline instead of jumping partway through.
    sittingDown: {
      sheet: 'avatar/sittingDown.png',
      frameWidth: 338,
      frameHeight: 604,
      columns: 5,
      frameCount: 25,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 80,
        height: 143,
      },
      // Starts where idle's feet end, then settles onto the seated baseline.
      offsetY: -5,
    },

    sittingGettingDesk: {
      sheet: 'avatar/sittingGettingDesk.png',
      frameWidth: 896,
      frameHeight: 504,
      columns: 5,
      // `frameCount` stays 25: it describes the 5x5 sheet grid used to size
      // the background. `frames` is the playback order.
      frameCount: 25,
      // Frames 14-16 of the export are almost empty, so the frog vanishes for
      // about 250ms mid-animation. Skip them and play the surrounding frames
      // back-to-back instead.
      frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 20, 21, 22, 23, 24],
      frameDurationMs: 83,
      loop: false,
      // Wide scene: the frog sits well inside the cell while the desk is
      // pulled into frame.
      display: {
        width: 276,
        height: 155,
      },
      // Bridges sittingDown's end and sittingTyping's start.
      offsetY: 7,
    },

    sittingTyping: {
      sheet: 'avatar/sittingTyping.png',
      frameWidth: 428,
      frameHeight: 474,
      columns: 5,
      frameCount: 25,
      frameDurationMs: 83,
      // One-shot at the animator level: overlay.js chains this and the blink
      // sheet into an endless loop.
      loop: false,
      display: {
        width: 96,
        height: 105,
      },
      offsetY: 9,
    },

    sittingTypingBlink: {
      sheet: 'avatar/sittingTypingBlink.png',
      frameWidth: 428,
      frameHeight: 474,
      columns: 5,
      frameCount: 25,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 96,
        height: 105,
      },
      offsetY: 9,
    },

    deskLookUp: {
      sheet: 'avatar/DeskLookUp.png',
      // A single row of five frames, so there are no rows to derive.
      frameWidth: 350,
      frameHeight: 420,
      columns: 5,
      frameCount: 5,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 103,
        height: 123,
      },
      offsetX: 4,
      offsetY: 3,
    },

    // Alternative look-up sheet used by the judging sequence. Same 5x1 layout
    // and framing as DeskLookUp, so it shares its display and offset.
    deskLookUp2: {
      sheet: 'avatar/DeskLookUp2.png',
      frameWidth: 350,
      frameHeight: 420,
      columns: 5,
      frameCount: 5,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 103,
        height: 123,
      },
      offsetX: 4,
      offsetY: 3,
    },

    // --- Judging the user's focus ---
    // Played when the user switches to leisure: the frog looks up from the
    // desk, judges them, then loops (blink once, stare five times) until they
    // leave leisure. `judgingExit` reverses it back to typing.
    //
    // These scenes are drawn wider than the look-up pair, so their `display`
    // is scaled to keep the frog about the same size. The cells are ~396x402,
    // hence a slightly shorter box than DeskLookUp's 350x420.
    sittingJudgeStart: {
      sheet: 'avatar/SittingJudgeStart.png',
      // A single row of five frames, so there are no rows to derive.
      frameWidth: 396,
      frameHeight: 404,
      columns: 5,
      frameCount: 5,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 104,
        height: 106,
      },
      // Matches deskLookUp2/deskLookDown (offsetX 4, feet on the shared
      // baseline) so the judge scene does not jump up/left when it starts.
      offsetX: 4,
      offsetY: 10.5,
    },

    sittingJudgeBlink: {
      sheet: 'avatar/SittingJudgeBlink.png',
      // 5x4 grid. The bottom row is a few pixels short (1609px tall), so
      // frameHeight is rounded; the animator scales by row count anyway.
      frameWidth: 396,
      frameHeight: 402,
      columns: 5,
      frameCount: 20,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 104,
        height: 106,
      },
      offsetX: 4,
      offsetY: 10.5,
    },

    sittingJudgeNoBlink: {
      sheet: 'avatar/SittingJudgeNoBlink.png',
      frameWidth: 396,
      frameHeight: 405,
      columns: 5,
      frameCount: 5,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 104,
        height: 106,
      },
      offsetX: 4,
      offsetY: 10.5,
    },

    sittingJudgeStop: {
      sheet: 'avatar/SittingJudgeStop.png',
      frameWidth: 396,
      frameHeight: 405,
      columns: 5,
      frameCount: 5,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 104,
        height: 106,
      },
      offsetX: 4,
      offsetY: 10.5,
    },

    deskLookDown: {
      sheet: 'avatar/DeskLookDown.png',
      // Same 5x1 layout and framing as DeskLookUp, so it shares its display
      // and offset.
      frameWidth: 350,
      frameHeight: 420,
      columns: 5,
      frameCount: 5,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 103,
        height: 123,
      },
      offsetX: 4,
      offsetY: 3,
    },

    // Reaction while seated and typing: the frog looks over at the user. Loops
    // a few times before DeskLookDown returns it to the keyboard.
    sittingLookingFix: {
      sheet: 'avatar/SittingLookingFix.png',
      // 5x5 grid of 396x402 cells, matching the judge scenes' framing.
      frameWidth: 396,
      frameHeight: 402,
      columns: 5,
      frameCount: 25,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 102,
        height: 104,
      },
      offsetX: 3,
      offsetY: 11,
    },

    // Seated "talking" loop, played while the buddy delivers a chat message
    // from the desk. Mirrors SittingLookingFix's grid and framing.
    sittingLooking1Speak: {
      sheet: 'avatar/SittingLooking1speak.png',
      frameWidth: 396,
      frameHeight: 402,
      columns: 5,
      frameCount: 25,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 102,
        height: 104,
      },
      offsetX: 3,
      offsetY: 11,
    },

    // One-shot seated stretch, played when the user accepts a study break.
    sittingStretch: {
      sheet: 'avatar/SittingStretch.png',
      frameWidth: 492,
      frameHeight: 524,
      columns: 5,
      frameCount: 25,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 120,
        height: 128,
      },
      offsetY: 9,
    },

    closeComputer: {
      sheet: 'avatar/CloseComputer_2.png',
      frameWidth: 242,
      frameHeight: 264,
      columns: 5,
      frameCount: 25,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 103,
        height: 112,
      },
      offsetY: 6,
    },

    standUp: {
      sheet: 'avatar/StandUp.png',
      frameWidth: 170,
      frameHeight: 275,
      columns: 5,
      frameCount: 25,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 83,
        height: 134,
      },
      // The feet sit high in the first cells and drift ~30px down the sheet as
      // the frog stands. Ramp the whole sprite up across the clip so the feet
      // stay planted, ending on idle's baseline.
      offsetY: { from: 28, to: -1 },
    },
  },

  // Sequence names for the category-driven behaviour in overlay.js. Kept
  // here so a new pose can be slotted in without changing the state machine.
  activityAnimations: {
    productiveIntro: ['sittingDown', 'sittingGettingDesk', 'sittingTyping'],
    productiveLoop: ['sittingTyping', 'sittingTypingBlink'],
    judgingIntro: ['deskLookUp2', 'sittingJudgeStart'],
    judgingBlink: 'sittingJudgeBlink',
    judgingStare: 'sittingJudgeNoBlink',
    judgingStareRepeats: 5,
    judgingExit: ['sittingJudgeStop', 'deskLookDown'],
    seatedClickIntro: 'deskLookUp',
    seatedClickLook: 'sittingLookingFix',
    seatedClickLookRepeats: 10,
    seatedClickExit: 'deskLookDown',
  },

  // How the avatar "speaks" a chat or nudge message: the standing sheet while
  // idle, the seated one at the desk. Nudges while seated look up from the
  // keyboard first. The clip is held for a length proportional to the message,
  // clamped so short lines still read and long ones don't drag on.
  speaking: {
    idleAnimation: 'idleSpeak',
    seatedAnimation: 'sittingLooking1Speak',
    seatedIntroAnimation: 'deskLookUp2',
    msPerCharacter: 55,
    minMs: 1200,
    maxMs: 12000,
  },
};