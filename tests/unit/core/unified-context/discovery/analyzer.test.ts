/**
 * @arch archcodex.test.unit
 *
 * Tests for enhanced task analyzer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all heavy dependencies
vi.mock('../../../../../src/core/db/manager.js', () => ({
  getDbSync: vi.fn(() => ({
    exec: vi.fn(),
    prepare: vi.fn(() => ({ run: vi.fn(), all: vi.fn(() => []) })),
  })),
  getMeta: vi.fn(() => null),
}));

vi.mock('../../../../../src/core/db/schema.js', () => ({
  initializeSchema: vi.fn(),
}));

vi.mock('../../../../../src/core/db/repositories/files.js', () => {
  const MockFileRepository = class {
    query() { return []; }
  };
  return { FileRepository: MockFileRepository };
});

vi.mock('../../../../../src/core/db/repositories/entities.js', () => {
  const MockEntityRepository = class {
    getFilesForEntity() { return []; }
  };
  return { EntityRepository: MockEntityRepository };
});

vi.mock('../../../../../src/core/db/scanner.js', () => {
  const MockDatabaseScanner = class {
    needsFullScan() { return false; }
    fullScan() { return Promise.resolve(); }
    incrementalSync() { return Promise.resolve(); }
  };
  return { DatabaseScanner: MockDatabaseScanner };
});

vi.mock('../../../../../src/utils/git.js', () => ({
  getGitCommitHash: vi.fn(() => 'abc123'),
}));

vi.mock('../../../../../src/core/discovery/index.js', () => ({
  loadIndex: vi.fn(() => Promise.resolve({ architectures: [] })),
  matchQuery: vi.fn(() => []),
}));

vi.mock('../../../../../src/core/unified-context/discovery/feedback.js', () => ({
  initializeFeedbackSchema: vi.fn(),
  calculateFeedbackBoost: vi.fn(() => 0),
  recordFeedback: vi.fn(),
}));

import {
  analyzeTaskEnhanced,
  refineWithAnswers,
  recordSelection,
  formatEnhancedAnalysis,
} from '../../../../../src/core/unified-context/discovery/analyzer.js';
import type { EnhancedTaskAnalysis } from '../../../../../src/core/unified-context/discovery/types.js';

describe('analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeTaskEnhanced', () => {
    it('returns analysis with keywords and action type', async () => {
      const result = await analyzeTaskEnhanced('/tmp/project', 'add product tagging feature');

      expect(result.task).toBe('add product tagging feature');
      expect(result.actionType).toBe('add');
      expect(result.keywords).toContain('product');
      expect(result.keywords).toContain('tagging');
    });

    it('detects fix action type', async () => {
      const result = await analyzeTaskEnhanced('/tmp/project', 'fix the login bug');
      expect(result.actionType).toBe('fix');
    });

    it('detects refactor action type', async () => {
      const result = await analyzeTaskEnhanced('/tmp/project', 'refactor the auth module');
      expect(result.actionType).toBe('refactor');
    });

    it('returns unknown for unrecognized actions', async () => {
      const result = await analyzeTaskEnhanced('/tmp/project', 'investigate the orders');
      expect(result.actionType).toBe('unknown');
    });

    it('filters stop words from keywords', async () => {
      const result = await analyzeTaskEnhanced('/tmp/project', 'add the new product feature');
      expect(result.keywords).not.toContain('the');
      expect(result.keywords).not.toContain('new');
    });

    it('detects PascalCase entities', async () => {
      const result = await analyzeTaskEnhanced('/tmp/project', 'add Order entry duplication');
      expect(result.entities).toContain('Order');
    });

    it('generates clarifying questions by default', async () => {
      const result = await analyzeTaskEnhanced('/tmp/project', 'add product feature');
      // Should at least have scope question for 'add' action
      expect(result.clarifyingQuestions).toBeDefined();
    });

    it('respects limit option', async () => {
      const result = await analyzeTaskEnhanced('/tmp/project', 'add feature', { limit: 3 });
      expect(result.suggestions.length).toBeLessThanOrEqual(3);
    });
  });

  describe('refineWithAnswers', () => {
    it('applies boosts from answers and clears clarification', () => {
      const analysis: EnhancedTaskAnalysis = {
        task: 'add feature',
        keywords: ['feature'],
        entities: [],
        actionType: 'add',
        suggestions: [
          {
            path: 'src/components/',
            confidence: 50,
            signals: [{ type: 'path', score: 0.5, reason: 'component match' }],
            primaryReason: 'component match',
            fileCount: 3,
          },
        ],
        clarifyingQuestions: [{
          id: 'scope',
          question: 'Scope?',
          category: 'scope',
          options: [
            { id: 'ui-only', label: 'UI only', boostKeywords: ['component'], boostPaths: ['components'] },
          ],
        }],
        scope: 'single-module',
        needsClarification: true,
      };

      const refined = refineWithAnswers(analysis, 'a');
      expect(refined.analysis.needsClarification).toBe(false);
      expect(refined.analysis.clarifyingQuestions).toHaveLength(0);
      expect(refined.selectedScope).toBe('ui-only');
    });
  });

  describe('recordSelection', () => {
    it('does not throw', () => {
      expect(() => recordSelection(
        '/tmp/project',
        'add feature',
        ['feature'],
        ['mod-a'],
        ['mod-a', 'mod-b'],
      )).not.toThrow();
    });
  });

  describe('formatEnhancedAnalysis', () => {
    it('formats analysis for display', () => {
      const analysis: EnhancedTaskAnalysis = {
        task: 'add product feature',
        keywords: ['product'],
        entities: ['Product'],
        actionType: 'add',
        suggestions: [{
          path: 'src/domain/products/',
          confidence: 85,
          signals: [{ type: 'path', score: 0.9, reason: 'Direct match' }],
          primaryReason: 'Direct match',
          fileCount: 5,
          architecture: 'core.domain',
        }],
        clarifyingQuestions: [],
        scope: 'single-module',
        needsClarification: false,
      };

      const output = formatEnhancedAnalysis(analysis);
      expect(output).toContain('Action: add');
      expect(output).toContain('product');
      expect(output).toContain('Entities: Product');
      expect(output).toContain('src/domain/products/');
      expect(output).toContain('85%');
    });

    it('shows no suggestions message when empty', () => {
      const analysis: EnhancedTaskAnalysis = {
        task: 'test',
        keywords: [],
        entities: [],
        actionType: 'unknown',
        suggestions: [],
        clarifyingQuestions: [],
        scope: 'single-module',
        needsClarification: false,
      };

      const output = formatEnhancedAnalysis(analysis);
      expect(output).toContain('No module suggestions found');
    });
  });
});
