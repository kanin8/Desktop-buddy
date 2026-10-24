export type Category = 'productive' | 'leisure' | 'uncategorized';

export interface ClassificationRule {
  pattern: string;
  category: Category;
  type: 'url' | 'app' | 'title';
}

export interface ClassifierConfig {
  rules: ClassificationRule[];
}
