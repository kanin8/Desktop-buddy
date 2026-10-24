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

  throw new Error(`Unsupported platform: ${platform}`);
}

module.exports = { createDetector };
