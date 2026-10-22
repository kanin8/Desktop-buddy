import { IDetector } from './types';
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

  // Fallback for other platforms (though only Win/Mac are targets)
  throw new Error(`Unsupported platform: ${platform}`);
}
