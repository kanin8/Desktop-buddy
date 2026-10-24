import { BaseDetector } from './base';
import { WindowInfo } from '../types';

/**
 * Windows implementation of activity detection.
 * Currently falls back to BaseDetector while UI Automation logic is integrated.
 */
export class WindowsDetector extends BaseDetector {
  async getActiveWindow(): Promise<WindowInfo> {
    // TODO: Implement UI Automation to read address bar for Chrome/Edge/Brave/Firefox
    return super.getActiveWindow();
  }
}
