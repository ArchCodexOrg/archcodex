/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  matchQuery,
  getAllEntries,
  findByArchId,
} from '../../../../src/core/discovery/matcher.js';
import type { Index } from '../../../../src/core/discovery/schema.js';

/**
 * Create a test index with sample entries.
 */
function createTestIndex(): Index {
  return {
    version: 1,
    entries: [
      {
        arch_id: 'domain.payment.processor',
        description: 'Payment processing service',
        keywords: ['payment', 'processor', 'billing', 'stripe', 'transaction'],
      },
      {
        arch_id: 'domain.user.service',
        description: 'User management service',
        keywords: ['user', 'authentication', 'profile', 'account'],
      },
      {
        arch_id: 'domain.order.handler',
        description: 'Order processing handler',
        keywords: ['order', 'shopping', 'cart', 'checkout'],
      },
      {
        arch_id: 'infra.database.repository',
        description: 'Database repository pattern',
        keywords: ['database', 'repository', 'sql', 'persistence'],
      },
    ],
  };
}

describe('discovery matcher', () => {
  describe('matchQuery', () => {
    it('should find exact keyword matches', () => {
      const index = createTestIndex();

      const results = matchQuery(index, 'payment');

      expect(results).toHaveLength(1);
      expect(results[0].entry.arch_id).toBe('domain.payment.processor');
      expect(results[0].score).toBeGreaterThanOrEqual(1); // Score includes coverage bonus
    });

    it('should find multiple keyword matches', () => {
      const index = createTestIndex();

      const results = matchQuery(index, 'payment billing');

      expect(results).toHaveLength(1);
      expect(results[0].entry.arch_id).toBe('domain.payment.processor');
      expect(results[0].matchedKeywords).toContain('payment');
      expect(results[0].matchedKeywords).toContain('billing');
    });

    it('should return multiple matches sorted by score', () => {
      const index = createTestIndex();

      const results = matchQuery(index, 'order checkout');

      // Order handler should match best
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.arch_id).toBe('domain.order.handler');
    });

    it('should handle case-insensitive matching', () => {
      const index = createTestIndex();

      const results = matchQuery(index, 'PAYMENT');

      expect(results).toHaveLength(1);
      expect(results[0].entry.arch_id).toBe('domain.payment.processor');
    });

    it('should return empty array for no matches', () => {
      const index = createTestIndex();

      const results = matchQuery(index, 'xyz123nonexistent');

      expect(results).toHaveLength(0);
    });

    it('should return empty array for empty query', () => {
      const index = createTestIndex();

      const results = matchQuery(index, '');

      expect(results).toHaveLength(0);
    });

    it('should respect limit option', () => {
      const index = createTestIndex();

      const results = matchQuery(index, 'service', { limit: 1 });

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should respect minScore option', () => {
      const index = createTestIndex();

      const resultsLow = matchQuery(index, 'pay', { minScore: 0.1 });
      const resultsHigh = matchQuery(index, 'pay', { minScore: 0.9 });

      expect(resultsLow.length).toBeGreaterThanOrEqual(resultsHigh.length);
    });

    it('should handle partial matches', () => {
      const index = createTestIndex();

      // "data" should partially match "database"
      const results = matchQuery(index, 'database repo');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.arch_id).toBe('infra.database.repository');
    });

    it('should strip special characters from query', () => {
      const index = createTestIndex();

      const results = matchQuery(index, 'payment!@#$%');

      expect(results).toHaveLength(1);
      expect(results[0].entry.arch_id).toBe('domain.payment.processor');
    });
  });

  describe('getAllEntries', () => {
    it('should return all entries', () => {
      const index = createTestIndex();

      const entries = getAllEntries(index);

      expect(entries).toHaveLength(4);
    });

    it('should return a copy of entries', () => {
      const index = createTestIndex();

      const entries = getAllEntries(index);
      entries.pop();

      expect(getAllEntries(index)).toHaveLength(4);
    });
  });

  describe('findByArchId', () => {
    it('should find entry by exact arch_id', () => {
      const index = createTestIndex();

      const entry = findByArchId(index, 'domain.payment.processor');

      expect(entry).toBeDefined();
      expect(entry?.arch_id).toBe('domain.payment.processor');
    });

    it('should return undefined for non-existent arch_id', () => {
      const index = createTestIndex();

      const entry = findByArchId(index, 'nonexistent.arch.id');

      expect(entry).toBeUndefined();
    });

    it('should be case-sensitive', () => {
      const index = createTestIndex();

      const entry = findByArchId(index, 'DOMAIN.PAYMENT.PROCESSOR');

      expect(entry).toBeUndefined();
    });
  });
});
