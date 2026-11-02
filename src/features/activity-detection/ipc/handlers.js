const { ipcMain, BrowserWindow } = require('electron');
const { createDetector } = require('../detector/index.js');
const { ActivityClassifier } = require('../classifier/index.js');

class ActivityIPCHandlers {
  // `aiClassify(info)` resolves a category for windows the rule list does not
  // know. It is passed in so this feature does not depend on a specific AI
  // backend.
  constructor({ aiClassify } = {}) {
    this.aiClassify = aiClassify || (async () => 'uncategorized');
    this.detector = createDetector();
    this.classifier = new ActivityClassifier();
    this.currentActivity = null;
    this.pollingInterval = null;

    // Procrastination tracking
    this.leisureStartTime = null;
    this.PROCRASTINATION_THRESHOLD = 15000; // 15 seconds
  }

  init() {
    console.log('[Activity] Initializing IPC Handlers...');
    ipcMain.handle('activity:get-current', () => {
      return this.currentActivity;
    });

    ipcMain.handle('activity:update-override', async (_, identifier, category) => {
      this.classifier.setOverride(identifier, category);
      await this.updateLoop();
      return { success: true };
    });

    this.startPolling();
  }

  startPolling() {
    // Changed loop time to 1 minute (60,000ms)
    console.log('[Activity] Starting polling loop (every 60 seconds)...');
    this.pollingInterval = setInterval(async () => {
      await this.updateLoop();
    }, 60000);
  }

  async updateLoop() {
    try {
      const info = await this.detector.getActiveWindow();
      let category = this.classifier.classify(info);

      if (category === 'uncategorized') {
        category = await this.aiClassify(info);
      }

      // For a browser on a known site, the site is the activity
      // ("YouTube"), and the browser is kept separately.
      const event = {
        app: info.site || info.appName,
        browser: info.site ? info.appName : null,
        domain: info.url ? new URL(info.url).hostname : (info.domain || null),
        title: info.title,
        category: category,
        source: info.source,
        startedAt: Date.now(),
      };

      if (this.hasActivityChanged(event)) {
        console.log(`[Activity] Activity changed to: ${event.app} (${event.category})`);
        this.currentActivity = event;
        this.broadcastActivity(event);
      }

      this.trackProcrastination(event);
    } catch (e) {
      console.error('[Activity] CRITICAL ERROR in updateLoop:', e);
    }
  }

  trackProcrastination(event) {
    if (event.category === 'leisure') {
      if (!this.leisureStartTime) {
        this.leisureStartTime = Date.now();
      } else {
        const elapsed = Date.now() - this.leisureStartTime;
        if (elapsed >= this.PROCRASTINATION_THRESHOLD) {
          this.triggerNudge(event);
          this.leisureStartTime = Date.now();
        }
      }
    } else {
      this.leisureStartTime = null;
    }
  }

  triggerNudge(event) {
    console.log(`[Activity] PROCRASTINATION DETECTED: ${event.app}`);
    // Note: Avatar speak removed as per previous request
  }

  hasActivityChanged(newEvent) {
    if (!this.currentActivity) return true;
    return (
      newEvent.app !== this.currentActivity.app ||
      newEvent.domain !== this.currentActivity.domain ||
      newEvent.title !== this.currentActivity.title ||
      newEvent.category !== this.currentActivity.category
    );
  }

  broadcastActivity(event) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send('activity:status-update', event);
    });
  }
}

module.exports = { ActivityIPCHandlers };
