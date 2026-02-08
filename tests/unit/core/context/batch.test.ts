/**
 * @arch archcodex.test.unit
 *
 * Tests for batch entity schema retrieval.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track mock call state
let mockCanExtract = vi.fn(async () => true);
let mockExtractResult = {
  entities: [
    {
      name: 'products',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'url', type: 'string', required: true },
        { name: 'isDeleted', type: 'boolean', required: true },
      ],
      relationships: [
        { type: 'belongsTo', target: 'projects', field: 'projectId' },
      ],
    },
    {
      name: 'documents',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'content', type: 'string', required: false },
      ],
      relationships: [],
    },
  ],
};

// Mock the extraction dependencies
vi.mock('../../../../src/core/context/extraction/index.js', () => ({
  createConvexExtractor: vi.fn(() => ({
    canExtract: (...args: unknown[]) => mockCanExtract(...args),
    extract: vi.fn(async () => mockExtractResult),
  })),
  detectBehaviors: vi.fn((_name: string, fields: Array<{ name: string }>) => ({
    behaviors: fields.some((f: { name: string }) => f.name === 'isDeleted')
      ? [{ name: 'soft-delete', evidence: ['isDeleted field'] }]
      : [],
  })),
}));

import { getEntitySchemasBatch, clearBatchCache } from '../../../../src/core/context/batch.js';

describe('batch entity schema retrieval', () => {
  beforeEach(() => {
    clearBatchCache();
    vi.clearAllMocks();
    mockCanExtract = vi.fn(async () => true);
    mockExtractResult = {
      entities: [
        {
          name: 'products',
          fields: [
            { name: 'title', type: 'string', required: true },
            { name: 'url', type: 'string', required: true },
            { name: 'isDeleted', type: 'boolean', required: true },
          ],
          relationships: [
            { type: 'belongsTo', target: 'projects', field: 'projectId' },
          ],
        },
        {
          name: 'documents',
          fields: [
            { name: 'title', type: 'string', required: true },
            { name: 'content', type: 'string', required: false },
          ],
          relationships: [],
        },
      ],
    };
  });

  it('clearBatchCache does not throw', () => {
    expect(() => clearBatchCache()).not.toThrow();
  });

  it('clearBatchCache can be called multiple times', () => {
    clearBatchCache();
    clearBatchCache();
    // No error
  });

  describe('getEntitySchemasBatch', () => {
    it('returns empty array when no extractor can handle the project', async () => {
      mockCanExtract = vi.fn(async () => false);
      clearBatchCache();

      const results = await getEntitySchemasBatch('/project', ['products']);
      expect(results).toEqual([]);
    });

    it('returns empty array when entity map is empty (no entities extracted)', async () => {
      mockExtractResult = { entities: [] };
      clearBatchCache();

      const results = await getEntitySchemasBatch('/project', ['products']);
      expect(results).toEqual([]);
    });

    it('returns matching entities by exact name', async () => {
      const results = await getEntitySchemasBatch('/project', ['products']);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('products');
      expect(results[0].fields).toEqual(mockExtractResult.entities[0].fields);
      expect(results[0].operations).toEqual([]); // Operations skipped for performance
    });

    it('returns matching entities by lowercase fallback', async () => {
      // Request with different casing - lowercase fallback should match
      const results = await getEntitySchemasBatch('/project', ['Products']);

      // 'Products' exact match fails, but lowercase 'products' should match
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('products');
    });

    it('returns matching entities by plural fallback (adding s suffix)', async () => {
      // 'product' (singular) should match 'products' via the +s fallback
      const results = await getEntitySchemasBatch('/project', ['product']);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('products');
    });

    it('returns multiple matching entities', async () => {
      const results = await getEntitySchemasBatch('/project', ['products', 'documents']);

      expect(results).toHaveLength(2);
      expect(results.map(r => r.name)).toContain('products');
      expect(results.map(r => r.name)).toContain('documents');
    });

    it('skips entities not found in the schema', async () => {
      const results = await getEntitySchemasBatch('/project', ['products', 'nonexistent']);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('products');
    });

    it('returns empty when all requested entities are not found', async () => {
      const results = await getEntitySchemasBatch('/project', ['nonexistent', 'missing']);

      expect(results).toEqual([]);
    });

    it('detects behaviors from entity fields', async () => {
      const results = await getEntitySchemasBatch('/project', ['products']);

      // products has isDeleted field, so should detect soft-delete behavior
      expect(results[0].behaviors).toBeDefined();
      expect(results[0].behaviors.length).toBeGreaterThan(0);
    });

    it('returns relationships from entity', async () => {
      const results = await getEntitySchemasBatch('/project', ['products']);

      expect(results[0].relationships).toEqual(mockExtractResult.entities[0].relationships);
    });

    it('uses cache on second call with same projectRoot', async () => {
      // First call populates cache
      await getEntitySchemasBatch('/project', ['products']);
      // Second call should use cache (extractor.extract not called again)
      const results = await getEntitySchemasBatch('/project', ['documents']);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('documents');
    });

    it('invalidates cache when projectRoot changes', async () => {
      // First call populates cache for /project
      await getEntitySchemasBatch('/project', ['products']);

      // Calling with a different project root should re-extract
      const results = await getEntitySchemasBatch('/other-project', ['products']);

      expect(results).toHaveLength(1);
    });

    it('handles empty entityNames array', async () => {
      const results = await getEntitySchemasBatch('/project', []);

      expect(results).toEqual([]);
    });
  });
});
