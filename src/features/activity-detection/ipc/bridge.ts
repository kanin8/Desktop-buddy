import { ActivityEvent, WindowInfo } from '../detector/types';
import { Category } from '../classifier/types';

export interface ActivityIPC {
  // Main -> Renderer
  onActivityUpdate: (callback: (event: ActivityEvent) => void) => void;

  // Renderer -> Main
  getCurrentActivity: () => Promise<ActivityEvent | null>;
  updateCategory: (identifier: string, category: Category) => Promise<void>;
}
