/**
 * Types for activity detection.
 */
export interface IDetector {
  getActiveWindow(): Promise<WindowInfo>;
}

export type DetectionSource = 'url' | 'title' | 'app';

export interface WindowInfo {
  title: string;
  appName: string;
  url?: string;
  source: DetectionSource;
}

export interface ActivityEvent {
  app: string;
  domain: string | null;
  title: string;
  category: string;
  source: DetectionSource;
  startedAt: number;
  endedAt?: number;
}
