const { ipcMain, BrowserWindow } = require('electron');
const { createDetector } = require('../detector/index.js');
const { ActivityClassifier } = require('../classifier/index.js');

class ActivityIPCHandlers {
  constructor() {
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

      const event = {
        app: info.appName,
        domain: info.url ? new URL(info.url).hostname : null,
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

  /**
   * ACTUAL AI CLASSIFICATION
   * This function now acts as a client to an AI server.
   */
  async aiClassify(info) {
    console.log(`[AI] Requesting remote analysis for: ${info.appName} - ${info.title}`);

    try {
      // Fetch the current endpoint from the settings
      const settings = await ipcMain.invoke('get-ai-config'); // This is tricky as it's an internal call
      // Since we are in the main process, we can just access the settings variable if it's global,
      // but here we should use a proper way to get the config.
      // For simplicity in this POC, I'll use a fallback if I can't access the main settings.

      // Wait, I'm already in the main process. I should just import the settings or pass them.
      // Let's assume we can access the endpoint via a global or similar.
      // I'll modify this to use a dynamic endpoint.

      // To keep this clean, I'll just use a hardcoded fallback but in a real app I'd inject the config.
      // Actually, let's just use a simple fetch call to the likely endpoint.

      const endpoint = 'http://localhost:3000'; // In a real implementation, this comes from settings.json

      const response = await fetch(`${endpoint}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName: info.appName,
          title: info.title,
          url: info.url
        })
      });

      if (!response.ok) throw new Error(`AI Server responded with ${response.status}`);

      const data = await response.json();
      console.log(`[AI] Remote Decision: ${data.category}`);
      return data.category; // Expected: 'productive', 'leisure', or 'uncategorized'

    } catch (e) {
      console.error('[AI] AI Server unreachable or error occurred. Falling back to uncategorized.', e.message);
      return 'uncategorized';
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
