import activeWin from 'active-win';
import { IDetector } from '../index';
import { WindowInfo } from './types';

/**
 * Base detector implementation using active-win for baseline window detection.
 */
export class BaseDetector implements IDetector {
  async getActiveWindow(): Promise<WindowInfo> {
    const window = await activeWin();

    if (!window) {
      return {
        title: 'Unknown',
        appName: 'Unknown',
        source: 'app'
      };
    }

    return {
      title: window.title || 'Unknown',
      appName: window.owner.name || 'Unknown',
      source: 'app'
    };
  }
}
