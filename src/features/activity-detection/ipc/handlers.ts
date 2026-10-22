import { ipcMain, BrowserWindow } from 'electron';
import { createDetector } from '../detector/index.js';
import { ActivityClassifier } from '../classifier/index.js';
import { ActivityEvent } from '../detector/types.js';

export class ActivityIPCHandlers {
  detector = createDetector();
  classifier = new ActivityClassifier();
  currentActivity = null;
  pollingInterval = null;

  init() {
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
    this.pollingInterval = setInterval(async () => {
      await this.updateLoop();
    }, 2000);
  }

  async updateLoop() {
    try {
      const info = await this.detector.getActiveWindow();
      const category = this.classifier.classify(info);

      const event = {
        app: info.appName,
        domain: info.url ? new URL(info.url).hostname : null,
        title: info.title,
        category: category,
        source: info.source,
        startedAt: Date.now(),
      };

      if (this.hasActivityChanged(event)) {
        this.currentActivity = event;
        this.broadcastActivity(event);
      }
    } catch (e) {
      console.error('Activity detection loop error:', e);
    }
  }

  hasActivityChanged(newEvent) {
    if (!this.currentActivity) return true;
    return (
      newEvent.app !== this.currentActivity.app ||
      newEvent.domain !== this.currentActivity.domain ||
      newEvent.title !== this.currentActivity.title
    );
  }

  broadcastActivity(event) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send('activity:status-update', event);
    });
  }
}
