const { BaseDetector } = require('./platform/base.js');
const { MacOSDetector } = require('./platform/macos.js');
const { WindowsDetector } = require('./platform/windows.js');
const os = require('os');

function createDetector() {
  const platform = os.platform();

  if (platform === 'darwin') {
    return new MacOSDetector();
  } else if (platform === 'win32') {
    return new WindowsDetector();
  }

  // Linux (and any other platform) falls back to the cross-platform base
  // detector. It relies on `active-win`, which works on Linux through
  // xdotool/xprop, so window detection still functions - only the extra
  // browser URL lookup of the platform-specific detectors is unavailable.
  // Throwing here used to abort startup of the whole app.
  return new BaseDetector();
}

module.exports = { createDetector };
