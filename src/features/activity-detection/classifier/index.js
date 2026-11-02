const fs = require('fs');
const path = require('path');

class ActivityClassifier {
  constructor() {
    this.configPath = path.join(__dirname, 'config.json');
    this.overridesPath = path.join(__dirname, 'overrides.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load classifier config:', e);
      return { rules: [] };
    }
  }

  loadOverrides() {
    try {
      const data = fs.readFileSync(this.overridesPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  }

  /**
   * Classifies activity.
   * If the result is 'uncategorized', the caller can trigger an AI fallback.
   */
  classify(info) {
    const overrides = this.loadOverrides();

    // `domain` comes from the window title when the URL cannot be read, so
    // url rules and overrides match either.
    const address = info.url || info.domain;

    if (address && overrides[address]) return overrides[address];
    // The UI shows the site name for browser tabs, so a user override for an
    // unlisted site is saved under that name.
    if (info.site && overrides[info.site]) return overrides[info.site];
    if (overrides[info.appName]) return overrides[info.appName];

    for (const rule of this.config.rules) {
      if (rule.type === 'url' && address && address.includes(rule.pattern)) {
        return rule.category;
      }
      if (rule.type === 'app' && info.appName.includes(rule.pattern)) {
        return rule.category;
      }
      if (rule.type === 'title' && info.title.includes(rule.pattern)) {
        return rule.category;
      }
    }

    return 'uncategorized';
  }

  setOverride(appNameOrUrl, category) {
    const overrides = this.loadOverrides();
    overrides[appNameOrUrl] = category;
    fs.writeFileSync(this.overridesPath, JSON.stringify(overrides, null, 2));
  }
}

module.exports = { ActivityClassifier };
