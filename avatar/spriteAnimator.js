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
    this.frameIndex = 0;
    this.lastFrameAt = 0;
  }

  // Starts (or restarts) the named animation from its first frame.
  // Unknown names are logged and ignored so a typo leaves the avatar blank
  // rather than throwing inside the render loop.
  play(name) {
    const config = window.AVATAR_SPRITE_CONFIG;
    const animation = config.animations[name];

    if (!animation) {
      console.error(`Unknown avatar animation: ${name}`);
      return;
    }

    this.animation = animation;
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
    this.frameIndex = (this.frameIndex + steps) % this.animation.frameCount;

    // Advance the clock by the frames consumed instead of snapping it to `now`,
    // which keeps the loop in phase and stops rounding error accumulating.
    this.lastFrameAt += steps * this.animation.frameDurationMs;

    this.applyFrame();
  }

  // Clears the sprite and returns the element to an empty block, so the
  // plain colour avatar can show through.
  stop() {
    this.animation = null;
    this.frameIndex = 0;
    this.lastFrameAt = 0;

    this.element.style.backgroundImage = 'none';
    this.element.style.backgroundSize = 'auto';
    this.element.style.backgroundPosition = '0 0';
    this.element.style.width = '';
    this.element.style.height = '';
  }

  // Sizes the element to one frame and scales the whole sheet to match, so the
  // background tiles line up exactly one frame apart.
  applySheet(animation) {
    const { width, height } = window.AVATAR_SPRITE_CONFIG.frameDisplay;
    const rowCount = Math.ceil(animation.frameCount / animation.columns);

    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    this.element.style.backgroundImage = `url('${animation.sheet}')`;
    this.element.style.backgroundSize = `${animation.columns * width}px ${rowCount * height}px`;
  }

  // Moves the background to the current frame. Offsets are negative to pull the
  // sheet up and left under the element.
  applyFrame() {
    const { width, height } = window.AVATAR_SPRITE_CONFIG.frameDisplay;
    const column = this.frameIndex % this.animation.columns;
    const row = Math.floor(this.frameIndex / this.animation.columns);

    this.element.style.backgroundPosition = `${-column * width}px ${-row * height}px`;
  }
}

window.SpriteAnimator = SpriteAnimator;