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

    if (info.url && overrides[info.url]) return overrides[info.url];
    if (overrides[info.appName]) return overrides[info.appName];

    for (const rule of this.config.rules) {
      if (rule.type === 'url' && info.url && info.url.includes(rule.pattern)) {
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
