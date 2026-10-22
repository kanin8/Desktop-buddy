const { BaseDetector } = require('./base.js');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * macOS implementation of activity detection using AppleScript for browser URLs.
 */
class MacOSDetector extends BaseDetector {
  async getActiveWindow() {
    const baseInfo = await super.getActiveWindow();

    if (this.isBrowser(baseInfo.appName)) {
      try {
        const url = await this.getBrowserUrl(baseInfo.appName);
        if (url) {
          return {
            ...baseInfo,
            url,
            source: 'url'
          };
        }
      } catch (e) {
        console.error('MacOS URL detection failed:', e);
      }
    }

    return baseInfo;
  }

  isBrowser(appName) {
    const browsers = ['Google Chrome', 'Safari', 'Brave Browser', 'Microsoft Edge', 'Arc'];
    return browsers.some(b => appName.includes(b));
  }

  async getBrowserUrl(appName) {
    let script = '';

    if (appName.includes('Safari')) {
      script = 'tell application "Safari" to return URL of front document';
    } else {
      const appNameForScript = appName.includes('Chrome') ? 'Google Chrome' :
                               appName.includes('Brave') ? 'Brave Browser' :
                               appName.includes('Edge') ? 'Microsoft Edge' : 'Arc';
      script = `tell application "${appNameForScript}" to return URL of active tab of first window`;
    }

    const { stdout } = await execAsync(`osascript -e '${script}'`);
    return stdout.trim() || null;
  }
}

module.exports = { MacOSDetector };
