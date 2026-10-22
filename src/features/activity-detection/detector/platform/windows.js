const { BaseDetector } = require('./base.js');

/**
 * Windows implementation of activity detection.
 * Currently falls back to BaseDetector while UI Automation logic is integrated.
 */
class WindowsDetector extends BaseDetector {
  async getActiveWindow() {
    return super.getActiveWindow();
  }
}

module.exports = { WindowsDetector };
