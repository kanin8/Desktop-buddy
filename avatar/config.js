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
  // Used by idle and idleSpeak, whose size every other pose is matched to
  // (see "Sizing and alignment" below). To make the whole frog bigger or
  // smaller, re-fit all poses rather than changing only this.
  frameDisplay: {
    width: 94,
    height: 147,
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
      // Keeps the feet on the hover indicator's baseline
      // (box centre + --avatar-feet-offset).
      offsetY: -10.5,
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
      offsetY: -10.5,
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

      // Scales this sheet so its standing frog is as tall as idle's.
      display: {
        width: 100,
        height: 237,
      },

      // The feet rest at 86.1% down this sheet's cells but 99.7% down idle's,
      // so centring both in the same box would dip the frog on click.
      // The ramp keeps the first frame on idle's baseline and lifts the final
      // landing frame back onto it, so the handoff to idle does not drift.
      offsetX: { from: -1.5, to: -1 },
      offsetY: { from: -23, to: -19.5 },
    },

    // --- Sizing and alignment ---
    // Every pose draws the frog at the same size and spot, so it doesn't
    // grow, shrink or jump when one clip hands over to the next. The values
    // were measured from the sheets, not set by eye, as a chain from idle:
    // - sittingDown's first frame matches idle (height, centre, feet), with
    //   one fixed offsetX so the frog sits down in place without sliding.
    // - sittingGettingDesk's first frame matches sittingDown's last.
    // - sittingTyping's desk matches sittingGettingDesk's final desk, and
    //   every other desk pose is scaled and moved so its desk sits exactly
    //   on sittingTyping's.
    // - standUp starts on closeComputer's last frame and ends on idle. Its
    //   sheet draws the standing frog ~6% larger relative to the seated one
    //   than the other sheets do, so it ramps `scale` to match both ends.
    // - standingClicked starts and ends on idle.
    sittingDown: {
      sheet: 'avatar/sittingDown.png',
      frameWidth: 338,
      frameHeight: 604,
      columns: 5,
      frameCount: 25,
      frameDurationMs: 83,
      loop: false,
      display: {
        width: 93,
        height: 166,
      },
      // Starts exactly on idle; the feet stay on the baseline as it sits.
      offsetX: -1,
      offsetY: { from: -16.5, to: -14.5 },
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
        width: 327,
        height: 184,
      },
      // Starts exactly where sittingDown ends.
      offsetX: -4.5,
      offsetY: -0.5,
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
        width: 111,
        height: 123,
      },
      offsetX: -13,
      offsetY: 3,
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
        width: 111,
        height: 123,
      },
      offsetX: -13,
      offsetY: 3,
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
        width: 120,
        height: 144,
      },
      offsetX: -8.5,
      offsetY: -4,
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
        width: 120,
        height: 144,
      },
      offsetX: -8.5,
      offsetY: -4,
    },

    // --- Judging the user's focus ---
    // Played when the user switches to leisure: the frog looks up from the
    // desk, judges them, then loops (blink once, stare five times) until they
    // leave leisure. `judgingExit` reverses it back to typing.
    //
    // These scenes are drawn wider than the look-up pair, so their `display`
    // is scaled to keep the desk the same size (see "Sizing and alignment").
    // The cells are ~396x402, hence a shorter box than DeskLookUp's 350x420.
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
        width: 121,
        height: 123,
      },
      // Desk on sittingTyping's desk, like deskLookUp2 before it, so the
      // judge scene does not jump when it starts.
      offsetX: -8,
      offsetY: 4,
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
        width: 121,
        height: 123,
      },
      offsetX: -8,
      offsetY: 3,
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
        width: 121,
        height: 123,
      },
      offsetX: -8,
      offsetY: 4,
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
        width: 121,
        height: 123,
      },
      offsetX: -8,
      offsetY: 4.5,
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
        width: 120,
        height: 144,
      },
      offsetX: -8.5,
      offsetY: -4,
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
        width: 121,
        height: 123,
      },
      offsetX: -8,
      offsetY: 3.5,
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
        width: 121,
        height: 123,
      },
      offsetX: -8,
      offsetY: 3.5,
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
      // This sheet draws the desk smaller within its cell than the others,
      // so it needs a larger box for the frog and desk to match sittingTyping.
      display: {
        width: 163,
        height: 173,
      },
      offsetX: -7,
      offsetY: 2.5,
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
        width: 116,
        height: 127,
      },
      offsetX: -13,
      offsetY: 3,
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
        width: 97,
        height: 157,
      },
      // The feet sit high in the first cells and drift ~30px down the sheet as
      // the frog stands. Ramp the whole sprite up across the clip so the feet
      // stay planted, ending on idle's baseline. It also moves from where
      // closeComputer leaves the seated frog to idle's centre, and grows
      // slightly (scale) to end at idle's size (see "Sizing and alignment").
      offsetX: { from: -7, to: -0.5 },
      offsetY: { from: 22.5, to: -10 },
      scale: { from: 1.059, to: 1 },
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