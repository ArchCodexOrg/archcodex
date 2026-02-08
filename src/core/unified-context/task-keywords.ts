/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Shared constants and keyword extraction for task analysis.
 * Used by both task-analyzer.ts (v1) and discovery/analyzer.ts (v2 enhanced).
 */

/** Action type for task classification. */
export type ActionType = 'add' | 'modify' | 'refactor' | 'delete' | 'fix' | 'unknown';

/**
 * Action type patterns for detection from task descriptions.
 */
export const ACTION_PATTERNS: Record<string, ActionType> = {
  add: 'add',
  create: 'add',
  implement: 'add',
  build: 'add',
  new: 'add',
  update: 'modify',
  change: 'modify',
  modify: 'modify',
  edit: 'modify',
  refactor: 'refactor',
  restructure: 'refactor',
  reorganize: 'refactor',
  extract: 'refactor',
  move: 'refactor',
  delete: 'delete',
  remove: 'delete',
  drop: 'delete',
  fix: 'fix',
  bug: 'fix',
  repair: 'fix',
  patch: 'fix',
};

/**
 * Action words from ACTION_PATTERNS - only these core action words are filtered.
 * Other verbs like "duplicate" are kept as they might match actual file/directory names.
 */
export const ACTION_WORDS = new Set(Object.keys(ACTION_PATTERNS));

/**
 * Stop words to filter from keyword extraction.
 */
export const STOP_WORDS = new Set([
  // Articles and prepositions
  'a', 'an', 'the', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from',
  'and', 'or', 'but', 'of', 'as', 'if', 'into', 'onto', 'upon', 'after', 'before',
  // Pronouns and determiners
  'it', 'its', 'that', 'this', 'these', 'those', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'how', 'why',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some', 'any', 'no',
  'not', 'only', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now',
  // Common verbs (non-action)
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'need', 'want', 'like',
  'new', 'use', 'using', 'used', 'make', 'get', 'set', 'let', 'see', 'show',
  // Common task description words (not domain-specific)
  'ability', 'able', 'allow', 'appear', 'below', 'above', 'right', 'left',
  'original', 'copy', 'first', 'last', 'next', 'previous', 'current',
  'user', 'users', 'click', 'button', 'page', 'screen', 'view', 'display',
  'way', 'thing', 'something', 'anything', 'everything', 'nothing',
  'work', 'works', 'working', 'feature', 'functionality',
]);

/**
 * Words that should not be treated as entities even when capitalized.
 * Filters out common verbs/pronouns that appear capitalized at sentence start.
 */
export const NON_ENTITY_WORDS = new Set([
  'Add', 'Create', 'Update', 'Delete', 'Remove', 'Fix', 'Change', 'Modify',
  'Build', 'Make', 'Get', 'Set', 'Use', 'Show', 'Display', 'Allow', 'Enable',
  'Users', 'User', 'The', 'This', 'That', 'When', 'Where', 'How', 'What',
  'Please', 'Should', 'Would', 'Could', 'Must', 'Need', 'Want', 'Like',
]);

/**
 * Extract keywords, entities, and action type from a task description.
 */
export function extractTaskInfo(task: string): {
  keywords: string[];
  entities: string[];
  actionType: ActionType;
} {
  const words = task.toLowerCase().split(/\s+/);
  const keywords: string[] = [];
  let actionType: ActionType = 'unknown';

  // Detect action type from first 5 words
  for (const word of words.slice(0, 5)) {
    const cleanWord = word.replace(/[^a-z]/g, '');
    if (ACTION_PATTERNS[cleanWord]) {
      actionType = ACTION_PATTERNS[cleanWord];
      break;
    }
  }

  // Extract keywords (filter stop words, core action words, and short words)
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z0-9]/g, '');
    if (cleanWord.length >= 3 &&
        !STOP_WORDS.has(cleanWord) &&
        !ACTION_WORDS.has(cleanWord)) {
      keywords.push(cleanWord);
    }
  }

  // Extract entities (PascalCase words)
  const entityPattern = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g;
  const entities: string[] = [];
  let match;
  while ((match = entityPattern.exec(task)) !== null) {
    if (!NON_ENTITY_WORDS.has(match[0])) {
      entities.push(match[0]);
    }
  }

  return {
    keywords: [...new Set(keywords)],
    entities: [...new Set(entities)],
    actionType,
  };
}
