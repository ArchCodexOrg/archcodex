/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import { completenessChecker } from '../../../../../src/core/analysis/checkers/completeness.js';
import type {
  AnalysisContext,
  CrossReferenceGraph,
  ResolvedSpecEntry,
} from '../../../../../src/core/analysis/types.js';
import type { SpecNode } from '../../../../../src/core/spec/schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyGraph(): CrossReferenceGraph {
  return {
    entityToSpecs: new Map(),
    tableToWriters: new Map(),
    tableToReaders: new Map(),
    specDependents: new Map(),
    archToSpecs: new Map(),
  };
}

function emptyComponentGroups() {
  return { 'component-groups': {} };
}

function makeContext(
  specs: ResolvedSpecEntry[],
  graph = emptyGraph(),
): AnalysisContext {
  return {
    specs,
    graph,
    archRegistry: {},
    componentGroups: emptyComponentGroups(),
  };
}

function makeSpec(specId: string, overrides: Partial<SpecNode> = {}): ResolvedSpecEntry {
  return {
    specId,
    node: { type: 'leaf', ...overrides } as SpecNode,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('completenessChecker', () => {
  describe('metadata', () => {
    it('has correct id, name, and category', () => {
      expect(completenessChecker.id).toBe('completeness');
      expect(completenessChecker.name).toBe('Completeness Checker');
      expect(completenessChecker.category).toBe('completeness');
    });
  });

  describe('CMP-1: Missing boundary examples for constrained inputs', () => {
    it('warns when input has max constraint but no boundary examples', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { name: { type: 'string', max: 100 } },
        examples: {
          success: [{ name: 'ok', given: { name: 'Test' }, then: {} }],
        },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      const cmp1 = issues.filter((i) => i.id === 'CMP-1');

      expect(cmp1).toHaveLength(1);
      expect(cmp1[0].severity).toBe('warning');
      expect(cmp1[0].field).toBe('name');
      expect(cmp1[0].message).toContain('boundary');
    });

    it('warns when input has min constraint but no boundary examples', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { count: { type: 'number', min: 0 } },
        examples: { success: [{ name: 'ok', given: { count: 5 }, then: {} }] },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-1')).toHaveLength(1);
    });

    it('does not warn when boundary examples exist', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { name: { type: 'string', max: 100 } },
        examples: {
          boundaries: [{ name: 'max length', given: { name: 'x'.repeat(100) }, then: {} }],
        },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-1')).toHaveLength(0);
    });

    it('does not warn for inputs without constraints', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { name: { type: 'string' } },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-1')).toHaveLength(0);
    });
  });

  describe('CMP-2: Missing mixin effects', () => {
    it('flags info when logs_audit mixin applied but no explicit audit_log effect', () => {
      const spec = makeSpec('spec.item.update', {
        mixins: ['logs_audit'],
        effects: [{ database: { table: 'items', operation: 'update' } }],
      });
      const issues = completenessChecker.check(makeContext([spec]));
      const cmp2 = issues.filter((i) => i.id === 'CMP-2');

      expect(cmp2).toHaveLength(1);
      expect(cmp2[0].severity).toBe('info');
      expect(cmp2[0].message).toContain('logs_audit');
    });

    it('does not flag when audit_log effect is explicitly listed', () => {
      const spec = makeSpec('spec.item.update', {
        mixins: ['logs_audit'],
        effects: [
          { database: { table: 'items', operation: 'update' } },
          { audit_log: { action: 'item.update' } },
        ],
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-2')).toHaveLength(0);
    });

    it('handles object mixin format', () => {
      const spec = makeSpec('spec.item.update', {
        mixins: [{ logs_audit: { action: 'update', resource: 'item' } }],
        effects: [{ database: { table: 'items', operation: 'update' } }],
      });
      const issues = completenessChecker.check(makeContext([spec]));
      const cmp2 = issues.filter((i) => i.id === 'CMP-2');
      expect(cmp2).toHaveLength(1);
    });
  });

  describe('CMP-5: Missing constraint error examples', () => {
    it('warns when input has max constraint but no error example for exceeding it', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { name: { type: 'string', max: 100 } },
        examples: {
          success: [{ name: 'ok', given: { name: 'Test' }, then: {} }],
          errors: [{ name: 'missing', then: { error: 'NOT_FOUND' } }],
        },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      const cmp5 = issues.filter((i) => i.id === 'CMP-5');

      expect(cmp5).toHaveLength(1);
      expect(cmp5[0].severity).toBe('warning');
      expect(cmp5[0].field).toBe('name');
      expect(cmp5[0].message).toContain('max');
    });

    it('does not warn when error example mentions too_long', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { name: { type: 'string', max: 100 } },
        examples: {
          errors: [{ name: 'too long', then: { error: 'TOO_LONG' } }],
        },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-5')).toHaveLength(0);
    });

    it('does not warn when error example mentions the field name', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { title: { type: 'string', max: 200 } },
        examples: {
          errors: [{ name: 'title error', then: { error: 'TITLE_VALIDATION_FAILED' } }],
        },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-5')).toHaveLength(0);
    });

    it('does not warn for inputs without max constraint', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { name: { type: 'string' } },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-5')).toHaveLength(0);
    });
  });

  describe('CMP-6: Mutation without invariants', () => {
    it('warns when mutation spec has no invariants', () => {
      const spec = makeSpec('spec.item.create', {
        inherits: 'spec.mutation',
      });
      const issues = completenessChecker.check(makeContext([spec]));
      const cmp6 = issues.filter((i) => i.id === 'CMP-6');

      expect(cmp6).toHaveLength(1);
      expect(cmp6[0].severity).toBe('warning');
      expect(cmp6[0].message).toContain('invariants');
    });

    it('warns for action specs without invariants', () => {
      const spec = makeSpec('spec.item.process', {
        inherits: 'spec.action',
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-6')).toHaveLength(1);
    });

    it('does not warn when invariants are present', () => {
      const spec = makeSpec('spec.item.create', {
        inherits: 'spec.mutation',
        invariants: [{ condition: 'result.id is not null' }],
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-6')).toHaveLength(0);
    });

    it('does not warn for query specs', () => {
      const spec = makeSpec('spec.item.list', {
        inherits: 'spec.query',
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-6')).toHaveLength(0);
    });
  });

  describe('CMP-7: UI without accessibility', () => {
    it('warns when UI has trigger but no accessibility', () => {
      const spec = makeSpec('spec.item.delete', {
        ui: { trigger: { component: 'DeleteButton', event: 'click' } },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      const cmp7 = issues.filter((i) => i.id === 'CMP-7');

      expect(cmp7).toHaveLength(1);
      expect(cmp7[0].severity).toBe('warning');
      expect(cmp7[0].message).toContain('accessibility');
    });

    it('warns when UI has interaction but no accessibility', () => {
      const spec = makeSpec('spec.item.edit', {
        ui: {
          interaction: { type: 'form', optimistic: false },
        },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-7')).toHaveLength(1);
    });

    it('does not warn when accessibility is present', () => {
      const spec = makeSpec('spec.item.delete', {
        ui: {
          trigger: { component: 'DeleteButton', event: 'click' },
          accessibility: { role: 'button', label: 'Delete item', keyboardNav: true },
        },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-7')).toHaveLength(0);
    });

    it('does not warn for specs without UI', () => {
      const spec = makeSpec('spec.item.validate', {});
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-7')).toHaveLength(0);
    });
  });

  describe('CMP-8: Optimistic UI without feedback', () => {
    it('warns when optimistic UI has no feedback definition', () => {
      const spec = makeSpec('spec.item.toggle', {
        ui: {
          interaction: { optimistic: true },
        },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      const cmp8 = issues.filter((i) => i.id === 'CMP-8');

      expect(cmp8).toHaveLength(1);
      expect(cmp8[0].severity).toBe('warning');
      expect(cmp8[0].message).toContain('Optimistic');
    });

    it('does not warn when feedback is defined', () => {
      const spec = makeSpec('spec.item.toggle', {
        ui: {
          interaction: { optimistic: true },
          feedback: { success: 'Toggled', error: 'Failed to toggle' },
        },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-8')).toHaveLength(0);
    });

    it('does not warn when not optimistic', () => {
      const spec = makeSpec('spec.item.toggle', {
        ui: {
          interaction: { optimistic: false },
        },
      });
      const issues = completenessChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CMP-8')).toHaveLength(0);
    });
  });

  describe('CMP-3: Orphaned specs', () => {
    it('flags info for orphaned spec with no relationships', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('lonely', ['spec.lonely.create']);

      const spec = makeSpec('spec.lonely.create', {});
      const issues = completenessChecker.check(makeContext([spec], graph));
      const cmp3 = issues.filter((i) => i.id === 'CMP-3');

      expect(cmp3).toHaveLength(1);
      expect(cmp3[0].severity).toBe('info');
      expect(cmp3[0].message).toContain('Orphaned');
    });

    it('does not flag specs with dependents', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('user', ['spec.user.create']);
      graph.specDependents.set('spec.user.create', ['spec.user.notify']);

      const spec = makeSpec('spec.user.create', {});
      const issues = completenessChecker.check(makeContext([spec], graph));
      expect(issues.filter((i) => i.id === 'CMP-3')).toHaveLength(0);
    });

    it('does not flag specs with depends_on', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('user', ['spec.user.notify']);

      const spec = makeSpec('spec.user.notify', {
        depends_on: ['spec.user.create'],
      } as Partial<SpecNode>);
      const issues = completenessChecker.check(makeContext([spec], graph));
      expect(issues.filter((i) => i.id === 'CMP-3')).toHaveLength(0);
    });

    it('does not flag base specs', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('base', ['spec.base.entity']);

      const spec = makeSpec('spec.base.entity', { type: 'base' });
      const issues = completenessChecker.check(makeContext([spec], graph));
      expect(issues.filter((i) => i.id === 'CMP-3')).toHaveLength(0);
    });

    it('does not flag test specs', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('product', ['spec.product.share']);

      const spec = makeSpec('spec.product.share', { type: 'test' });
      const issues = completenessChecker.check(makeContext([spec], graph));
      expect(issues.filter((i) => i.id === 'CMP-3')).toHaveLength(0);
    });

    it('does not flag specs in an entity group with multiple specs', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('user', ['spec.user.create', 'spec.user.delete']);

      const spec = makeSpec('spec.user.create', {});
      const issues = completenessChecker.check(makeContext([spec], graph));
      expect(issues.filter((i) => i.id === 'CMP-3')).toHaveLength(0);
    });
  });

  describe('CMP-4: Missing CRUD coverage', () => {
    it('flags info when entity has some CRUD ops but is missing others', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('item', [
        'spec.item.create',
        'spec.item.get',
      ]);

      const issues = completenessChecker.check(makeContext([
        makeSpec('spec.item.create', {}),
        makeSpec('spec.item.get', {}),
      ], graph));
      const cmp4 = issues.filter((i) => i.id === 'CMP-4');

      expect(cmp4).toHaveLength(1);
      expect(cmp4[0].severity).toBe('info');
      expect(cmp4[0].message).toContain('create, get');
      expect(cmp4[0].message).toContain('missing');
    });

    it('does not flag when entity has >= 3 CRUD operations', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('item', [
        'spec.item.create',
        'spec.item.get',
        'spec.item.update',
      ]);

      const issues = completenessChecker.check(makeContext([
        makeSpec('spec.item.create', {}),
        makeSpec('spec.item.get', {}),
        makeSpec('spec.item.update', {}),
      ], graph));
      expect(issues.filter((i) => i.id === 'CMP-4')).toHaveLength(0);
    });

    it('does not flag entities with fewer than 2 specs', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('item', ['spec.item.create']);

      const issues = completenessChecker.check(makeContext([
        makeSpec('spec.item.create', {}),
      ], graph));
      expect(issues.filter((i) => i.id === 'CMP-4')).toHaveLength(0);
    });
  });

  describe('clean case', () => {
    it('returns no issues for a complete spec', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('item', [
        'spec.item.create', 'spec.item.get', 'spec.item.update',
      ]);

      const spec = makeSpec('spec.item.create', {
        inherits: 'spec.mutation',
        inputs: { name: { type: 'string', max: 100 } },
        invariants: [{ condition: 'result.id is defined' }],
        examples: {
          success: [{ name: 'ok', given: { name: 'Test' }, then: {} }],
          errors: [{ name: 'too long', then: { error: 'TOO_LONG' } }],
          boundaries: [{ name: 'max name', given: { name: 'x'.repeat(100) }, then: {} }],
        },
      });
      const issues = completenessChecker.check(makeContext([spec], graph));
      expect(issues).toHaveLength(0);
    });
  });
});
