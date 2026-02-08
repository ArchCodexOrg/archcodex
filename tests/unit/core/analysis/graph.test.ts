/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import { buildCrossReferenceGraph } from '../../../../src/core/analysis/graph.js';
import type { SpecNode } from '../../../../src/core/spec/schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<SpecNode> = {}): SpecNode {
  return { type: 'leaf', ...overrides } as SpecNode;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildCrossReferenceGraph', () => {
  describe('entityToSpecs', () => {
    it('groups specs by entity prefix', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.user.create': makeNode(),
        'spec.user.delete': makeNode(),
        'spec.tag.create': makeNode(),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.entityToSpecs.get('user')).toEqual([
        'spec.user.create',
        'spec.user.delete',
      ]);
      expect(graph.entityToSpecs.get('tag')).toEqual(['spec.tag.create']);
    });

    it('excludes base specs from entity grouping', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.user.create': makeNode(),
        'spec.user.base': makeNode({ type: 'base' }),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.entityToSpecs.get('user')).toEqual(['spec.user.create']);
    });

    it('ignores specs with fewer than 3 parts', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.base': makeNode(),
        'spec.user.create': makeNode(),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.entityToSpecs.has('base')).toBe(false);
      expect(graph.entityToSpecs.get('user')).toEqual(['spec.user.create']);
    });

    it('uses full middle path for multi-level spec IDs', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.test.calculator.add': makeNode(),
        'spec.test.calculator.subtract': makeNode(),
        'spec.test.directParams': makeNode(),
      };

      const graph = buildCrossReferenceGraph(nodes);

      // 4-part IDs group by "test.calculator", not just "test"
      expect(graph.entityToSpecs.get('test.calculator')).toEqual([
        'spec.test.calculator.add',
        'spec.test.calculator.subtract',
      ]);
      // 3-part ID groups by "test"
      expect(graph.entityToSpecs.get('test')).toEqual(['spec.test.directParams']);
    });
  });

  describe('tableToWriters', () => {
    it('maps database effects to table writers', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.user.create': makeNode({
          effects: [
            { database: { table: 'users', operation: 'insert' } },
          ],
        }),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.tableToWriters.get('users')).toEqual([
        { specId: 'spec.user.create', operation: 'insert' },
      ]);
    });

    it('collects multiple writers for the same table', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.user.create': makeNode({
          effects: [{ database: { table: 'users', operation: 'insert' } }],
        }),
        'spec.user.update': makeNode({
          effects: [{ database: { table: 'users', operation: 'update' } }],
        }),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.tableToWriters.get('users')).toHaveLength(2);
    });

    it('skips effects without database table or operation', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.user.notify': makeNode({
          effects: [
            { scheduler: { job: 'sendEmail' } },
            { database: { table: 'logs' } }, // missing operation
          ],
        }),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.tableToWriters.has('logs')).toBe(false);
    });
  });

  describe('tableToReaders', () => {
    it('maps id-typed inputs to table readers', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.product.get': makeNode({
          inputs: {
            productId: { type: 'id', table: 'products' },
          },
        }),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.tableToReaders.get('products')).toEqual([
        { specId: 'spec.product.get', inputField: 'productId' },
      ]);
    });

    it('ignores inputs without id type', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.user.search': makeNode({
          inputs: {
            query: { type: 'string' },
          },
        }),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.tableToReaders.size).toBe(0);
    });
  });

  describe('specDependents', () => {
    it('builds reverse depends_on lookup', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.user.create': makeNode(),
        'spec.user.notify': makeNode({
          depends_on: ['spec.user.create'],
        } as Partial<SpecNode>),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.specDependents.get('spec.user.create')).toEqual([
        'spec.user.notify',
      ]);
    });

    it('collects multiple dependents', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.base.mutation': makeNode(),
        'spec.user.create': makeNode({
          depends_on: ['spec.base.mutation'],
        } as Partial<SpecNode>),
        'spec.tag.create': makeNode({
          depends_on: ['spec.base.mutation'],
        } as Partial<SpecNode>),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.specDependents.get('spec.base.mutation')).toHaveLength(2);
    });
  });

  describe('archToSpecs', () => {
    it('maps architectures to specs', () => {
      const nodes: Record<string, SpecNode> = {
        'spec.user.create': makeNode({
          architectures: ['core.engine'],
        }),
        'spec.user.delete': makeNode({
          architectures: ['core.engine', 'cli.command'],
        }),
      };

      const graph = buildCrossReferenceGraph(nodes);

      expect(graph.archToSpecs.get('core.engine')).toEqual([
        'spec.user.create',
        'spec.user.delete',
      ]);
      expect(graph.archToSpecs.get('cli.command')).toEqual([
        'spec.user.delete',
      ]);
    });
  });

  describe('empty input', () => {
    it('returns empty maps for empty nodes', () => {
      const graph = buildCrossReferenceGraph({});

      expect(graph.entityToSpecs.size).toBe(0);
      expect(graph.tableToWriters.size).toBe(0);
      expect(graph.tableToReaders.size).toBe(0);
      expect(graph.specDependents.size).toBe(0);
      expect(graph.archToSpecs.size).toBe(0);
    });
  });
});
