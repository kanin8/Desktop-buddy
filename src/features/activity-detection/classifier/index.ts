import fs from 'fs';
import path from 'path';
import { WindowInfo } from '../detector/types';
import { Category, ClassifierConfig, ClassificationRule } from './types';

export interface IClassifier {
  classify(info: WindowInfo): Category;
  setOverride(appNameOrUrl: string, category: Category): void;
}

export class ActivityClassifier implements IClassifier {
  private config: ClassifierConfig;
  private overridesPath = path.join(__dirname, 'overrides.json');
  private configPath = path.join(__dirname, 'config.json');

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): ClassifierConfig {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load classifier config:', e);
      return { rules: [] };
    }
  }

  private loadOverrides(): Record<string, Category> {
    try {
      const data = fs.readFileSync(this.overridesPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  }

  classify(info: WindowInfo): Category {
    const overrides = this.loadOverrides();

    // 1. Check User Overrides (highest priority)
    if (info.url && overrides[info.url]) return overrides[info.url];
    if (overrides[info.appName]) return overrides[info.appName];

    // 2. Check Config Rules
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

  setOverride(appNameOrUrl: string, category: Category): void {
    const overrides = this.loadOverrides();
    overrides[appNameOrUrl] = category;
    fs.writeFileSync(this.overridesPath, JSON.stringify(overrides, null, 2));
  }
}
