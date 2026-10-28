import { IDetector } from './types';
import { BaseDetector } from './platform/base';
import { MacOSDetector } from './platform/macos';
import { WindowsDetector } from './platform/windows';
import os from 'os';

/**
 * Factory to create the appropriate detector based on the OS.
 */
export function createDetector(): IDetector {
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
