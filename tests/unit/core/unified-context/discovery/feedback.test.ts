/**
 * @arch archcodex.test.unit
 *
 * Tests for feedback storage and learning-to-rank.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock better-sqlite3 and crypto before importing
vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'abcdef1234567890abcdef1234567890'),
  })),
}));

import {
  initializeFeedbackSchema,
  recordFeedback,
  getKeywordStats,
  calculateFeedbackBoost,
  getAllFeedback,
  cleanupOldFeedback,
  getCoSelectionPatterns,
} from '../../../../../src/core/unified-context/discovery/feedback.js';

describe('feedback', () => {
  let mockDb: {
    exec: ReturnType<typeof vi.fn>;
    prepare: ReturnType<typeof vi.fn>;
  };
  let mockStmt: {
    run: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStmt = {
      run: vi.fn(() => ({ changes: 0 })),
      all: vi.fn(() => []),
    };
    mockDb = {
      exec: vi.fn(),
      prepare: vi.fn(() => mockStmt),
    };
  });

  describe('initializeFeedbackSchema', () => {
    it('executes CREATE TABLE SQL', () => {
      initializeFeedbackSchema(mockDb as never);
      expect(mockDb.exec).toHaveBeenCalledTimes(1);
      const sql = mockDb.exec.mock.calls[0][0] as string;
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS discovery_feedback');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
    });
  });

  describe('recordFeedback', () => {
    it('inserts a feedback row', () => {
      recordFeedback(
        mockDb as never,
        'add product feature',
        ['product', 'feature'],
        ['src/domain/products/'],
        ['src/domain/products/', 'src/components/products/'],
      );

      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalledTimes(1);

      const args = mockStmt.run.mock.calls[0];
      expect(args[0]).toBeDefined(); // task hash
      expect(JSON.parse(args[1] as string)).toEqual(['product', 'feature']); // keywords
      expect(JSON.parse(args[2] as string)).toEqual(['src/domain/products/']); // selected
      expect(JSON.parse(args[3] as string)).toEqual(['src/components/products/']); // ignored
    });
  });

  describe('getKeywordStats', () => {
    it('returns stats per module', () => {
      mockStmt.all.mockReturnValue([
        {
          selected_modules: JSON.stringify(['mod-a', 'mod-b']),
          ignored_modules: JSON.stringify(['mod-c']),
        },
        {
          selected_modules: JSON.stringify(['mod-a']),
          ignored_modules: JSON.stringify(['mod-b']),
        },
      ]);

      const stats = getKeywordStats(mockDb as never, 'product');

      expect(stats.get('mod-a')).toEqual({ selected: 2, ignored: 0 });
      expect(stats.get('mod-b')).toEqual({ selected: 1, ignored: 1 });
      expect(stats.get('mod-c')).toEqual({ selected: 0, ignored: 1 });
    });

    it('returns empty map when no rows', () => {
      const stats = getKeywordStats(mockDb as never, 'unknown');
      expect(stats.size).toBe(0);
    });
  });

  describe('calculateFeedbackBoost', () => {
    it('returns 0 when no feedback exists', () => {
      const boost = calculateFeedbackBoost(mockDb as never, ['keyword'], 'mod-a');
      expect(boost).toBe(0);
    });

    it('returns positive boost for frequently selected modules', () => {
      mockStmt.all.mockReturnValue([
        {
          selected_modules: JSON.stringify(['mod-a']),
          ignored_modules: JSON.stringify([]),
        },
      ]);

      const boost = calculateFeedbackBoost(mockDb as never, ['keyword'], 'mod-a');
      // selection rate = 1/1 = 1.0, boost = (1.0 - 0.5) * 0.2 = 0.1
      expect(boost).toBeCloseTo(0.1);
    });

    it('returns negative boost for frequently ignored modules', () => {
      mockStmt.all.mockReturnValue([
        {
          selected_modules: JSON.stringify([]),
          ignored_modules: JSON.stringify(['mod-a']),
        },
      ]);

      const boost = calculateFeedbackBoost(mockDb as never, ['keyword'], 'mod-a');
      // selection rate = 0/1 = 0.0, boost = (0.0 - 0.5) * 0.2 = -0.1
      expect(boost).toBeCloseTo(-0.1);
    });
  });

  describe('getAllFeedback', () => {
    it('returns parsed feedback entries', () => {
      mockStmt.all.mockReturnValue([
        {
          task_hash: 'hash1',
          keywords: JSON.stringify(['product']),
          selected_modules: JSON.stringify(['mod-a']),
          ignored_modules: JSON.stringify(['mod-b']),
          timestamp: 1000,
        },
      ]);

      const feedback = getAllFeedback(mockDb as never);
      expect(feedback).toHaveLength(1);
      expect(feedback[0].taskHash).toBe('hash1');
      expect(feedback[0].keywords).toEqual(['product']);
      expect(feedback[0].selectedModules).toEqual(['mod-a']);
      expect(feedback[0].ignoredModules).toEqual(['mod-b']);
      expect(feedback[0].timestamp).toBe(1000);
    });
  });

  describe('cleanupOldFeedback', () => {
    it('deletes old entries and returns count', () => {
      mockStmt.run.mockReturnValue({ changes: 5 });
      const deleted = cleanupOldFeedback(mockDb as never);
      expect(deleted).toBe(5);
    });
  });

  describe('getCoSelectionPatterns', () => {
    it('returns bidirectional co-selection pairs', () => {
      mockStmt.all.mockReturnValue([
        { selected_modules: JSON.stringify(['mod-a', 'mod-b', 'mod-c']) },
      ]);

      const patterns = getCoSelectionPatterns(mockDb as never);
      expect(patterns.get('mod-a')).toContain('mod-b');
      expect(patterns.get('mod-a')).toContain('mod-c');
      expect(patterns.get('mod-b')).toContain('mod-a');
    });

    it('returns empty map when no multi-selections', () => {
      const patterns = getCoSelectionPatterns(mockDb as never);
      expect(patterns.size).toBe(0);
    });
  });
});
