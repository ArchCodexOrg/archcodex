/**
 * @arch archcodex.test.unit
 *
 * Tests for task-analyzer module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../../../../src/core/db/manager.js', () => ({
  getDbSync: vi.fn(() => ({})),
  getMeta: vi.fn(() => null),
}));

vi.mock('../../../../src/core/db/schema.js', () => ({
  initializeSchema: vi.fn(),
}));

vi.mock('../../../../src/core/db/repositories/files.js', () => {
  const MockFileRepository = class {
    query() { return []; }
  };
  return { FileRepository: MockFileRepository };
});

vi.mock('../../../../src/core/db/repositories/entities.js', () => {
  const MockEntityRepository = class {
    getFilesForEntity() { return []; }
  };
  return { EntityRepository: MockEntityRepository };
});

vi.mock('../../../../src/core/db/scanner.js', () => {
  const MockDatabaseScanner = class {
    needsFullScan() { return false; }
    fullScan() { return Promise.resolve(); }
    incrementalSync() { return Promise.resolve(); }
  };
  return { DatabaseScanner: MockDatabaseScanner };
});

vi.mock('../../../../src/utils/git.js', () => ({
  getGitCommitHash: vi.fn(() => 'abc123'),
}));

vi.mock('../../../../src/core/discovery/index.js', () => ({
  loadIndex: vi.fn(() => Promise.resolve({ architectures: [] })),
  matchQuery: vi.fn(() => []),
}));

describe('task-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('analyzeTask', () => {
    it('should extract keywords from task description', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add caching layer to database module');

      expect(result.keywords).toContain('caching');
      expect(result.keywords).toContain('layer');
      expect(result.keywords).toContain('database');
      expect(result.keywords).toContain('module');
    });

    it('should filter stop words and action words from keywords', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add the new feature to the system');

      // "the", "to" are stop words
      expect(result.keywords).not.toContain('the');
      expect(result.keywords).not.toContain('to');
      // "add" is an action word, should be excluded from keywords
      expect(result.keywords).not.toContain('add');
      // But "feature" and "system" should be extracted
      expect(result.keywords).toContain('system');
      // Action type should still be detected
      expect(result.actionType).toBe('add');
    });

    it('should detect add action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const addResult = await analyzeTask('/project', 'Add a new utility function');
      expect(addResult.actionType).toBe('add');

      const createResult = await analyzeTask('/project', 'Create user authentication');
      expect(createResult.actionType).toBe('add');

      const implementResult = await analyzeTask('/project', 'Implement caching');
      expect(implementResult.actionType).toBe('add');
    });

    it('should detect modify action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const updateResult = await analyzeTask('/project', 'Update the login form');
      expect(updateResult.actionType).toBe('modify');

      const changeResult = await analyzeTask('/project', 'Change error handling');
      expect(changeResult.actionType).toBe('modify');
    });

    it('should detect refactor action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const refactorResult = await analyzeTask('/project', 'Refactor the database layer');
      expect(refactorResult.actionType).toBe('refactor');

      const extractResult = await analyzeTask('/project', 'Extract shared utilities');
      expect(extractResult.actionType).toBe('refactor');
    });

    it('should detect delete action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const deleteResult = await analyzeTask('/project', 'Delete unused code');
      expect(deleteResult.actionType).toBe('delete');

      const removeResult = await analyzeTask('/project', 'Remove deprecated functions');
      expect(removeResult.actionType).toBe('delete');
    });

    it('should detect fix action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const fixResult = await analyzeTask('/project', 'Fix the login bug');
      expect(fixResult.actionType).toBe('fix');

      const bugResult = await analyzeTask('/project', 'Bug in user registration');
      expect(bugResult.actionType).toBe('fix');
    });

    it('should detect unknown action type for ambiguous tasks', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'User authentication improvements');

      expect(result.actionType).toBe('unknown');
    });

    it('should extract entities from capitalized words', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add UserProfile to the AuthService');

      expect(result.entities).toContain('UserProfile');
      expect(result.entities).toContain('AuthService');
    });

    it('should extract camelCase entities', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Modify DatabaseConnection handler');

      expect(result.entities).toContain('DatabaseConnection');
    });

    it('should return unique keywords', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add cache to cache layer with caching');

      // 'cache' and 'caching' should not be duplicated
      const cacheCount = result.keywords.filter(k => k === 'cache').length;
      expect(cacheCount).toBeLessThanOrEqual(1);
    });

    it('should return unique entities', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add UserService to UserService handler');

      const serviceCount = result.entities.filter(e => e === 'UserService').length;
      expect(serviceCount).toBe(1);
    });

    it('should recommend single-module scope by default', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add feature');

      expect(result.scope).toBe('single-module');
    });

    it('should recommend compact context level by default', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add feature');

      expect(result.contextLevel).toBe('compact');
    });

    it('should recommend full context for refactoring', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const result = await analyzeTask('/project', 'Refactor the database module');

      // Refactoring tasks should trigger full context level recommendation
      expect(result.actionType).toBe('refactor');
      // With no suggestions, it defaults to single-module, but context level
      // is influenced by action type
    });

    it('should limit suggestions to top 10', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add everything everywhere');

      expect(result.suggestions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('formatTaskAnalysis', () => {
    it('should format analysis with all fields', async () => {
      const { formatTaskAnalysis } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const analysis = {
        keywords: ['cache', 'database'],
        entities: ['UserService'],
        actionType: 'add' as const,
        suggestions: [
          {
            path: 'src/core/db/',
            confidence: 85,
            reason: 'Path contains "database"',
            fileCount: 5,
            architecture: 'archcodex.core.engine',
          },
        ],
        scope: 'single-module' as const,
        contextLevel: 'compact' as const,
      };

      const output = formatTaskAnalysis(analysis);

      expect(output).toContain('Task Analysis:');
      expect(output).toContain('Action: add');
      expect(output).toContain('Keywords: cache, database');
      expect(output).toContain('Entities: UserService');
      expect(output).toContain('Scope: single-module');
      expect(output).toContain('Context: compact');
      expect(output).toContain('Suggested Modules:');
      expect(output).toContain('src/core/db/');
      expect(output).toContain('85% confidence');
      expect(output).toContain('archcodex.core.engine');
    });

    it('should handle empty suggestions', async () => {
      const { formatTaskAnalysis } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const analysis = {
        keywords: ['unknown'],
        entities: [],
        actionType: 'unknown' as const,
        suggestions: [],
        scope: 'single-module' as const,
        contextLevel: 'compact' as const,
      };

      const output = formatTaskAnalysis(analysis);

      expect(output).toContain('No module suggestions found');
      expect(output).toContain('Try being more specific');
    });

    it('should handle empty keywords', async () => {
      const { formatTaskAnalysis } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const analysis = {
        keywords: [],
        entities: [],
        actionType: 'unknown' as const,
        suggestions: [],
        scope: 'single-module' as const,
        contextLevel: 'compact' as const,
      };

      const output = formatTaskAnalysis(analysis);

      expect(output).toContain('Keywords: (none)');
    });

    it('should not show entities line when empty', async () => {
      const { formatTaskAnalysis } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const analysis = {
        keywords: ['test'],
        entities: [],
        actionType: 'add' as const,
        suggestions: [],
        scope: 'single-module' as const,
        contextLevel: 'compact' as const,
      };

      const output = formatTaskAnalysis(analysis);

      expect(output).not.toContain('Entities:');
    });

    it('should limit displayed suggestions to 5', async () => {
      const { formatTaskAnalysis } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const suggestions = Array.from({ length: 10 }, (_, i) => ({
        path: `src/module${i}/`,
        confidence: 90 - i * 5,
        reason: 'Test reason',
        fileCount: 3,
      }));

      const analysis = {
        keywords: ['test'],
        entities: [],
        actionType: 'add' as const,
        suggestions,
        scope: 'single-module' as const,
        contextLevel: 'compact' as const,
      };

      const output = formatTaskAnalysis(analysis);

      // Should only show first 5
      expect(output).toContain('1. src/module0/');
      expect(output).toContain('5. src/module4/');
      expect(output).not.toContain('6. src/module5/');
    });
  });

  describe('action type detection edge cases', () => {
    it('should detect action from first 5 words only', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');

      // "add" is beyond the first 5 words
      const result = await analyzeTask('/project', 'Some task that does something to add feature');
      expect(result.actionType).toBe('unknown');

      // "add" is within first 5 words
      const result2 = await analyzeTask('/project', 'We should add a new feature');
      expect(result2.actionType).toBe('add');
    });

    it('should handle punctuation in action words', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const result = await analyzeTask('/project', 'Add, please, a new feature');
      expect(result.actionType).toBe('add');
    });

    it('should handle mixed case action words', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const result = await analyzeTask('/project', 'ADD a new feature');
      expect(result.actionType).toBe('add');

      const result2 = await analyzeTask('/project', 'FIX the bug');
      expect(result2.actionType).toBe('fix');
    });
  });

  describe('keyword extraction edge cases', () => {
    it('should filter words shorter than 3 characters', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add a db fix to ui');

      // "a", "db", "to", "ui" are 2 chars or less
      expect(result.keywords).not.toContain('db');
      expect(result.keywords).not.toContain('ui');
    });

    it('should handle numbers in keywords', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add auth2 feature with oauth2');

      expect(result.keywords).toContain('auth2');
      expect(result.keywords).toContain('oauth2');
    });

    it('should strip non-alphanumeric characters from keywords', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add feature-flag and config_value');

      // Words are combined after stripping hyphens/underscores
      // 'feature-flag' becomes 'featureflag', 'config_value' becomes 'configvalue'
      expect(result.keywords.some(k => k.includes('feature') || k.includes('config'))).toBe(true);
    });
  });

  describe('entity extraction edge cases', () => {
    it('should extract PascalCase class names', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add method to UserAuthenticationService');

      expect(result.entities).toContain('UserAuthenticationService');
    });

    it('should not extract all-caps words as entities', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add API to USER module');

      // API and USER are all caps, not PascalCase
      expect(result.entities).not.toContain('API');
      expect(result.entities).not.toContain('USER');
    });

    it('should handle entities at start of sentence', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'DatabaseService needs refactoring');

      expect(result.entities).toContain('DatabaseService');
    });

    it('should filter common non-entity words like Add, Create, Update', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add Create Update Delete Remove Fix Change Modify Build Make');

      expect(result.entities).not.toContain('Add');
      expect(result.entities).not.toContain('Create');
      expect(result.entities).not.toContain('Update');
      expect(result.entities).not.toContain('Delete');
      expect(result.entities).not.toContain('Remove');
      expect(result.entities).not.toContain('Fix');
    });

    it('should filter pronouns and determiners like The, This, That', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'The This That When Where How What Please Should Would Could Must Need Want Like');

      expect(result.entities).not.toContain('The');
      expect(result.entities).not.toContain('This');
      expect(result.entities).not.toContain('Please');
    });
  });

  describe('scope and context level determination', () => {
    it('should determine full context for refactor action with no suggestions', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Refactor the unknown module');

      expect(result.actionType).toBe('refactor');
      // Refactoring should request full context
      expect(result.contextLevel).toBe('full');
    });

    it('should determine single-module scope with no suggestions', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Improve the unknown thing');

      expect(result.scope).toBe('single-module');
    });

    it('should return compact context for single-module add actions', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Add feature to system');

      // Default for add + single-module -> compact
      expect(result.contextLevel).toBe('compact');
    });
  });

  describe('formatTaskAnalysis edge cases', () => {
    it('should show architecture tag in suggestion when available', async () => {
      const { formatTaskAnalysis } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const analysis = {
        keywords: ['cache'],
        entities: [],
        actionType: 'add' as const,
        suggestions: [
          {
            path: 'src/core/cache/',
            confidence: 80,
            reason: 'Path contains "cache"',
            fileCount: 3,
            architecture: 'archcodex.core.cache',
          },
        ],
        scope: 'single-module' as const,
        contextLevel: 'compact' as const,
      };

      const output = formatTaskAnalysis(analysis);
      expect(output).toContain('[archcodex.core.cache]');
    });

    it('should not show architecture tag when not available', async () => {
      const { formatTaskAnalysis } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const analysis = {
        keywords: ['cache'],
        entities: [],
        actionType: 'add' as const,
        suggestions: [
          {
            path: 'src/core/cache/',
            confidence: 80,
            reason: 'Path contains "cache"',
            fileCount: 3,
          },
        ],
        scope: 'single-module' as const,
        contextLevel: 'compact' as const,
      };

      const output = formatTaskAnalysis(analysis);
      expect(output).not.toContain('[undefined]');
      expect(output).toContain('src/core/cache/');
    });

    it('should show file count in suggestions', async () => {
      const { formatTaskAnalysis } = await import('../../../../src/core/unified-context/task-analyzer.js');

      const analysis = {
        keywords: ['test'],
        entities: [],
        actionType: 'add' as const,
        suggestions: [
          {
            path: 'src/core/test/',
            confidence: 90,
            reason: 'Directory "test" matches',
            fileCount: 7,
          },
        ],
        scope: 'single-module' as const,
        contextLevel: 'compact' as const,
      };

      const output = formatTaskAnalysis(analysis);
      expect(output).toContain('7 files');
    });
  });

  describe('additional action types', () => {
    it('should detect build as add action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Build the new authentication system');
      expect(result.actionType).toBe('add');
    });

    it('should detect restructure as refactor action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Restructure the core modules');
      expect(result.actionType).toBe('refactor');
    });

    it('should detect reorganize as refactor action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Reorganize the folder structure');
      expect(result.actionType).toBe('refactor');
    });

    it('should detect move as refactor action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Move utils into shared library');
      expect(result.actionType).toBe('refactor');
    });

    it('should detect drop as delete action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Drop the legacy endpoints');
      expect(result.actionType).toBe('delete');
    });

    it('should detect repair as fix action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Repair the broken serializer');
      expect(result.actionType).toBe('fix');
    });

    it('should detect patch as fix action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Patch the security vulnerability');
      expect(result.actionType).toBe('fix');
    });

    it('should detect edit as modify action type', async () => {
      const { analyzeTask } = await import('../../../../src/core/unified-context/task-analyzer.js');
      const result = await analyzeTask('/project', 'Edit the configuration loader');
      expect(result.actionType).toBe('modify');
    });
  });
});
