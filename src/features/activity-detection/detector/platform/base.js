/**
 * Base detector implementation using active-win for baseline window detection.
 */
class BaseDetector {
  async getActiveWindow() {
    try {
      console.log('[Detector] Attempting to get active window...');
      const { default: activeWin } = await import('active-win');
      const window = await activeWin();

      console.log('[Detector] Active window found:', window ? window.title : 'null');

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
    } catch (e) {
      console.error('[Detector] CRITICAL ERROR in BaseDetector:', e);
      return {
        title: 'Error',
        appName: 'Detection Error',
        source: 'app'
      };
    }
  }
}

module.exports = { BaseDetector };
