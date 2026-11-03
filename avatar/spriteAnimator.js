// Plays a sprite-sheet animation onto a DOM element by stepping the CSS
// background-position across the sheet's frames.
//
// Timing is driven by the caller's requestAnimationFrame loop rather than a
// loop of its own, so there is a single clock for movement and animation.

class SpriteAnimator {
  // Creates an animator bound to a DOM element. The element is expected to be
  // an empty block that fills a single frame; play() is what gives it a
  // background image and a size.
  constructor(element) {
    this.element = element;
    this.animation = null;
    this.display = null;
    this.frames = null;
    this.onComplete = null;
    this.frameIndex = 0;
    this.lastFrameAt = 0;
  }

  // Starts (or restarts) the named animation from its first frame.
  // Unknown names are logged and ignored so a typo leaves the avatar blank
  // rather than throwing inside the render loop.
  // `onComplete` fires only for animations with loop: false, after the last
  // frame has been shown; looping animations never call it.
  play(name, { onComplete = null } = {}) {
    const config = window.AVATAR_SPRITE_CONFIG;
    const animation = config.animations[name];

    if (!animation) {
      console.error(`Unknown avatar animation: ${name}`);
      return;
    }

    this.animation = animation;
    this.display = animation.display || config.frameDisplay;
    // Optional explicit sheet-frame order, so an export with blank or torn
    // frames can leave them out without editing the PNG.
    this.frames = animation.frames && animation.frames.length ? animation.frames : null;
    this.onComplete = onComplete;
    this.frameIndex = 0;
    this.lastFrameAt = performance.now();

    this.applySheet(animation);
    this.applyFrame();
  }

  // Advances the animation to whatever frame the elapsed time calls for.
  // Call once per animation frame with the same timestamp the caller already
  // has; a no-op when nothing is playing.
  update(now) {
    if (!this.animation) return;

    const elapsed = now - this.lastFrameAt;
    if (elapsed < this.animation.frameDurationMs) return;

    // Step by whole frames rather than one frame per tick: a long stall (or a
    // throttled hidden window) should skip ahead, not replay every frame.
    const steps = Math.floor(elapsed / this.animation.frameDurationMs);

    if (this.hasReachedEnd(steps)) {
      this.finish();
      return;
    }

    this.frameIndex = (this.frameIndex + steps) % this.getFrameCount();

    // Advance the clock by the frames consumed instead of snapping it to `now`,
    // which keeps the loop in phase and stops rounding error accumulating.
    this.lastFrameAt += steps * this.animation.frameDurationMs;

    this.applyFrame();
  }

  // Clears the sprite and returns the element to an empty block, so the
  // plain colour avatar can show through.
  stop() {
    this.animation = null;
    this.display = null;
    this.frames = null;
    // Dropped so a reaction interrupted by a mode switch cannot fire its
    // callback later and yank the sprite back.
    this.onComplete = null;
    this.frameIndex = 0;
    this.lastFrameAt = 0;

    this.element.style.backgroundImage = 'none';
    this.element.style.backgroundSize = 'auto';
    this.element.style.backgroundPosition = '0 0';
    this.element.style.transform = '';
    this.element.style.width = '';
    this.element.style.height = '';
  }

  // Number of frames this playback actually shows. Animations may list
  // explicit sheet frames; otherwise every frame in the sheet is used.
  getFrameCount() {
    return this.frames ? this.frames.length : this.animation.frameCount;
  }

  // Reports whether advancing `steps` frames would overshoot the last frame of
  // a one-shot animation. Looping animations wrap and so never end.
  hasReachedEnd(steps) {
    return !this.animation.loop && this.frameIndex + steps >= this.getFrameCount();
  }

  // Ends a one-shot: parks on the final frame, drops all playback state, then
  // hands control back to the caller. State is cleared before the callback so
  // a callback that starts another animation starts from a clean slate.
  finish() {
    this.frameIndex = this.getFrameCount() - 1;
    this.lastFrameAt = performance.now();
    this.applyFrame();

    const onComplete = this.onComplete;
    this.animation = null;
    this.display = null;
    this.frames = null;
    this.onComplete = null;
    this.frameIndex = 0;

    if (onComplete) onComplete();
  }

  // Sizes the element to one frame and scales the whole sheet to match, so the
  // background tiles line up exactly one frame apart.
  applySheet(animation) {
    const rowCount = Math.ceil(animation.frameCount / animation.columns);

    this.element.style.width = `${this.display.width}px`;
    this.element.style.height = `${this.display.height}px`;
    this.element.style.backgroundImage = `url('${animation.sheet}')`;
    this.element.style.backgroundSize =
      `${animation.columns * this.display.width}px ${rowCount * this.display.height}px`;
  }

  // Nudges the sprite onto the shared feet baseline. A number is a fixed
  // offset; `{ from, to }` ramps across the playback so a pose whose feet
  // drift within the sheet stays planted. `offsetX` shifts horizontally the
  // same way. Applied as a transform so it does not disturb the parent's
  // centring, and so the element's bounding rect (used for click/hover)
  // follows the shift.
  applyOffset() {
    const offsetY = this.animation.offsetY;
    let value = offsetY;

    if (offsetY && typeof offsetY === 'object') {
      const frameCount = this.getFrameCount();
      const progress = frameCount > 1 ? this.frameIndex / (frameCount - 1) : 0;
      value = offsetY.from + (offsetY.to - offsetY.from) * progress;
    }

    const offsetX = this.animation.offsetX || 0;
    this.element.style.transform = `translate(${offsetX}px, ${value || 0}px)`;
  }

  // Moves the background to the current frame. Offsets are negative to pull the
  // sheet up and left under the element. `frameIndex` walks the playback list,
  // which may skip sheet frames; `sheetIndex` is the actual cell to show.
  applyFrame() {
    const sheetIndex = this.frames ? this.frames[this.frameIndex] : this.frameIndex;
    const column = sheetIndex % this.animation.columns;
    const row = Math.floor(sheetIndex / this.animation.columns);

    this.element.style.backgroundPosition =
      `${-column * this.display.width}px ${-row * this.display.height}px`;

    this.applyOffset();
  }
}

window.SpriteAnimator = SpriteAnimator;