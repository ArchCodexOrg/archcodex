/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import { dataChecker } from '../../../../../src/core/analysis/checkers/data.js';
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

describe('dataChecker', () => {
  describe('metadata', () => {
    it('has correct id, name, and category', () => {
      expect(dataChecker.id).toBe('data');
      expect(dataChecker.name).toBe('Data Checker');
      expect(dataChecker.category).toBe('data');
    });
  });

  describe('DAT-1: Sensitive data leakage', () => {
    it('errors when sensitive input appears in outputs', () => {
      const spec = makeSpec('spec.user.update', {
        inputs: { password: { type: 'string' } },
        outputs: { password: { type: 'string' } },
      });
      const issues = dataChecker.check(makeContext([spec]));
      const dat1 = issues.filter((i) => i.id === 'DAT-1');

      expect(dat1).toHaveLength(1);
      expect(dat1[0].severity).toBe('error');
      expect(dat1[0].field).toBe('password');
      expect(dat1[0].message).toContain('Sensitive');
    });

    it('detects various sensitive field patterns', () => {
      const fields = ['apiKey', 'api_key', 'secret', 'token', 'credential', 'privateKey'];
      for (const field of fields) {
        const spec = makeSpec(`spec.auth.${field}`, {
          inputs: { [field]: { type: 'string' } },
          outputs: { [field]: { type: 'string' } },
        });
        const issues = dataChecker.check(makeContext([spec]));
        const dat1 = issues.filter((i) => i.id === 'DAT-1');
        expect(dat1.length).toBeGreaterThan(0);
      }
    });

    it('does not error when sensitive input is not in outputs', () => {
      const spec = makeSpec('spec.user.update', {
        inputs: { password: { type: 'string' } },
        outputs: { success: { type: 'boolean' } },
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-1')).toHaveLength(0);
    });

    it('does not error for non-sensitive fields in both', () => {
      const spec = makeSpec('spec.user.update', {
        inputs: { name: { type: 'string' } },
        outputs: { name: { type: 'string' } },
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-1')).toHaveLength(0);
    });
  });

  describe('DAT-2: Missing cascade effects', () => {
    it('warns when delete may orphan references from other specs', () => {
      const graph = emptyGraph();
      graph.tableToReaders.set('users', [
        { specId: 'spec.product.list', inputField: 'userId' },
      ]);

      const spec = makeSpec('spec.user.delete', {
        effects: [{ database: { table: 'users', operation: 'delete' } }],
      });
      const issues = dataChecker.check(makeContext([spec], graph));
      const dat2 = issues.filter((i) => i.id === 'DAT-2');

      expect(dat2).toHaveLength(1);
      expect(dat2[0].severity).toBe('warning');
      expect(dat2[0].field).toBe('users');
      expect(dat2[0].message).toContain('orphan');
      expect(dat2[0].relatedSpecs).toContain('spec.product.list');
    });

    it('does not warn when no other specs reference the table', () => {
      const spec = makeSpec('spec.temp.delete', {
        effects: [{ database: { table: 'temp_data', operation: 'delete' } }],
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-2')).toHaveLength(0);
    });

    it('does not count self-references', () => {
      const graph = emptyGraph();
      graph.tableToReaders.set('items', [
        { specId: 'spec.item.delete', inputField: 'itemId' },
      ]);

      const spec = makeSpec('spec.item.delete', {
        effects: [{ database: { table: 'items', operation: 'delete' } }],
      });
      const issues = dataChecker.check(makeContext([spec], graph));
      expect(issues.filter((i) => i.id === 'DAT-2')).toHaveLength(0);
    });
  });

  describe('DAT-4: Missing timestamp effects', () => {
    it('warns when database update has no updatedAt in outputs', () => {
      const spec = makeSpec('spec.item.update', {
        outputs: { name: { type: 'string' } },
        effects: [{ database: { table: 'items', operation: 'update' } }],
      });
      const issues = dataChecker.check(makeContext([spec]));
      const dat4 = issues.filter((i) => i.id === 'DAT-4');

      expect(dat4).toHaveLength(1);
      expect(dat4[0].severity).toBe('warning');
      expect(dat4[0].message).toContain('updatedAt');
    });

    it('does not warn when updatedAt is in outputs', () => {
      const spec = makeSpec('spec.item.update', {
        outputs: { updatedAt: { type: 'number' } },
        effects: [{ database: { table: 'items', operation: 'update' } }],
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-4')).toHaveLength(0);
    });

    it('does not warn when updated_at is in outputs', () => {
      const spec = makeSpec('spec.item.update', {
        outputs: { updated_at: { type: 'number' } },
        effects: [{ database: { table: 'items', operation: 'update' } }],
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-4')).toHaveLength(0);
    });

    it('does not warn for insert operations', () => {
      const spec = makeSpec('spec.item.create', {
        outputs: { id: { type: 'string' } },
        effects: [{ database: { table: 'items', operation: 'insert' } }],
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-4')).toHaveLength(0);
    });
  });

  describe('DAT-6: Nullable output without coverage', () => {
    it('warns when nullable output has no null test', () => {
      // The checker only flags DAT-6 when examples exist but none reference
      // the nullable field at all (neither null nor non-null assertions).
      const spec = makeSpec('spec.item.get', {
        outputs: { description: { type: 'string', nullable: true } },
        examples: {
          success: [
            { name: 'found', given: {}, then: { 'result.id': '123' } },
          ],
        },
      });
      const issues = dataChecker.check(makeContext([spec]));
      const dat6 = issues.filter((i) => i.id === 'DAT-6');

      expect(dat6).toHaveLength(1);
      expect(dat6[0].severity).toBe('warning');
      expect(dat6[0].field).toBe('description');
    });

    it('does not warn when example tests null case', () => {
      const spec = makeSpec('spec.item.get', {
        outputs: { description: { type: 'string', nullable: true } },
        examples: {
          success: [
            { name: 'with desc', given: {}, then: { 'result.description': 'hello' } },
            { name: 'no desc', given: {}, then: { 'result.description': null } },
          ],
        },
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-6')).toHaveLength(0);
    });

    it('does not warn when example uses @undefined placeholder', () => {
      const spec = makeSpec('spec.item.get', {
        outputs: { description: { type: 'string', optional: true } },
        examples: {
          success: [
            { name: 'absent', given: {}, then: { 'result.description': '@undefined' } },
          ],
        },
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-6')).toHaveLength(0);
    });

    it('does not warn for non-nullable outputs', () => {
      const spec = makeSpec('spec.item.get', {
        outputs: { name: { type: 'string' } },
        examples: {
          success: [{ name: 'ok', given: {}, then: { 'result.name': 'test' } }],
        },
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-6')).toHaveLength(0);
    });

    it('does not warn when spec has no examples at all', () => {
      const spec = makeSpec('spec.item.get', {
        outputs: { description: { type: 'string', nullable: true } },
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-6')).toHaveLength(0);
    });
  });

  describe('DAT-7: Authenticated mutation without audit trail', () => {
    it('warns when authenticated mutation lacks audit_log effect', () => {
      const spec = makeSpec('spec.item.update', {
        security: { authentication: 'required' },
        effects: [{ database: { table: 'items', operation: 'update' } }],
      });
      const issues = dataChecker.check(makeContext([spec]));
      const dat7 = issues.filter((i) => i.id === 'DAT-7');

      expect(dat7).toHaveLength(1);
      expect(dat7[0].severity).toBe('warning');
      expect(dat7[0].message).toContain('audit_log');
    });

    it('does not warn when audit_log effect is present', () => {
      const spec = makeSpec('spec.item.update', {
        security: { authentication: 'required' },
        effects: [
          { database: { table: 'items', operation: 'update' } },
          { audit_log: { action: 'item.update' } },
        ],
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-7')).toHaveLength(0);
    });

    it('does not warn when auth is not required', () => {
      const spec = makeSpec('spec.public.submit', {
        security: { authentication: 'none' },
        effects: [{ database: { table: 'submissions', operation: 'insert' } }],
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-7')).toHaveLength(0);
    });

    it('does not warn when no database effects', () => {
      const spec = makeSpec('spec.item.validate', {
        security: { authentication: 'required' },
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-7')).toHaveLength(0);
    });
  });

  describe('DAT-3: Denormalization drift', () => {
    it('warns when invariant claims count increment but no update effect', () => {
      const spec = makeSpec('spec.tag.create', {
        invariants: [
          { condition: 'project.tagCount should be incremented by 1' },
        ],
        effects: [{ database: { table: 'tags', operation: 'insert' } }],
      });
      const issues = dataChecker.check(makeContext([spec]));
      const dat3 = issues.filter((i) => i.id === 'DAT-3');

      expect(dat3).toHaveLength(1);
      expect(dat3[0].severity).toBe('warning');
      expect(dat3[0].message).toContain('count');
    });

    it('does not warn when update effect exists for count', () => {
      const spec = makeSpec('spec.tag.create', {
        invariants: [
          { condition: 'project.tagCount should be incremented by 1' },
        ],
        effects: [
          { database: { table: 'tags', operation: 'insert' } },
          { database: { table: 'projects', operation: 'update' } },
        ],
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'DAT-3')).toHaveLength(0);
    });
  });

  describe('DAT-5: Cross-spec type mismatch', () => {
    it('errors when input table mismatches dependency output table', () => {
      const specs: ResolvedSpecEntry[] = [
        makeSpec('spec.user.create', {
          outputs: { userId: { type: 'id', table: 'users' } },
        }),
        makeSpec('spec.product.create', {
          inputs: { userId: { type: 'id', table: 'accounts' } },
          depends_on: ['spec.user.create'],
        } as Partial<SpecNode>),
      ];
      const issues = dataChecker.check(makeContext(specs));
      const dat5 = issues.filter((i) => i.id === 'DAT-5');

      expect(dat5).toHaveLength(1);
      expect(dat5[0].severity).toBe('error');
      expect(dat5[0].message).toContain('Type mismatch');
    });
  });

  describe('DAT-8: Partial write (deep)', () => {
    function makeDeepContext(specs: ResolvedSpecEntry[], implMap: Map<string, { content: string; filePath: string }>): AnalysisContext {
      return { specs, graph: emptyGraph(), archRegistry: {}, componentGroups: emptyComponentGroups(), implementationContents: implMap };
    }

    it('warns when early return exists between two effects', () => {
      const spec = makeSpec('spec.item.transfer', {
        effects: [
          { database: { table: 'items', operation: 'update' } },
          { database: { table: 'logs', operation: 'insert' } },
        ],
      });
      const code = `
        async function handler(ctx, args) {
          await ctx.db.patch(args.id, { owner: args.newOwner });
          if (!args.logTransfer) return;
          await ctx.db.insert('logs', { action: 'transfer' });
        }
      `;
      const implMap = new Map([['spec.item.transfer', { content: code, filePath: 'src/test.ts' }]]);
      const dat8 = dataChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'DAT-8');
      expect(dat8).toHaveLength(1);
      expect(dat8[0].severity).toBe('warning');
      expect(dat8[0].message).toContain('Early return');
    });

    it('does NOT report DAT-8 when no early return between effects', () => {
      const spec = makeSpec('spec.item.create', {
        effects: [
          { database: { table: 'items', operation: 'insert' } },
          { audit_log: { action: 'item.create' } },
        ],
      });
      const code = `
        async function handler(ctx, args) {
          if (!args.name) return;
          const id = await ctx.db.insert('items', { name: args.name });
          await ctx.scheduler.runAfter(0, 'audit', { action: 'create', id });
        }
      `;
      const implMap = new Map([['spec.item.create', { content: code, filePath: 'src/test.ts' }]]);
      expect(dataChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'DAT-8')).toHaveLength(0);
    });
  });

  describe('DAT-9: Unique constraint without error example', () => {
    it('warns when uniqueness invariant has no already_exists error', () => {
      const spec = makeSpec('spec.product.create', {
        invariants: [{ description: 'URL must be unique within the project' }],
        examples: { success: [{ name: 'ok', given: { url: 'https://example.com' }, then: {} }] },
      });
      const dat9 = dataChecker.check(makeContext([spec])).filter((i) => i.id === 'DAT-9');
      expect(dat9).toHaveLength(1);
      expect(dat9[0].severity).toBe('warning');
      expect(dat9[0].message).toContain('uniqueness');
    });

    it('does NOT report DAT-9 with ALREADY_EXISTS error example', () => {
      const spec = makeSpec('spec.product.create', {
        invariants: [{ description: 'URL must be unique within the project' }],
        examples: {
          success: [{ name: 'ok', given: { url: 'https://example.com' }, then: {} }],
          errors: [{ name: 'dup', given: { url: 'https://existing.com' }, then: { error: 'ALREADY_EXISTS' } }],
        },
      });
      expect(dataChecker.check(makeContext([spec])).filter((i) => i.id === 'DAT-9')).toHaveLength(0);
    });

    it('does NOT report DAT-9 without uniqueness invariant', () => {
      const spec = makeSpec('spec.product.create', {
        invariants: [{ condition: 'result.id !== null' }],
      });
      expect(dataChecker.check(makeContext([spec])).filter((i) => i.id === 'DAT-9')).toHaveLength(0);
    });
  });

  describe('DAT-10: Enum mismatch', () => {
    it('warns when success example uses value not in enum', () => {
      const spec = makeSpec('spec.item.update', {
        inputs: { status: { type: 'enum', values: ['active', 'archived', 'draft'] } },
        examples: {
          success: [{ name: 'typo', given: { status: 'actve' }, then: {} }],
        },
      });
      const dat10 = dataChecker.check(makeContext([spec])).filter((i) => i.id === 'DAT-10');
      expect(dat10).toHaveLength(1);
      expect(dat10[0].severity).toBe('warning');
      expect(dat10[0].field).toBe('status');
      expect(dat10[0].message).toContain('actve');
    });

    it('does NOT report DAT-10 for valid enum values', () => {
      const spec = makeSpec('spec.item.update', {
        inputs: { status: { type: 'enum', values: ['active', 'archived'] } },
        examples: {
          success: [{ name: 'ok', given: { status: 'active' }, then: {} }],
        },
      });
      expect(dataChecker.check(makeContext([spec])).filter((i) => i.id === 'DAT-10')).toHaveLength(0);
    });

    it('does NOT report DAT-10 for error examples (may intentionally use invalid values)', () => {
      const spec = makeSpec('spec.item.update', {
        inputs: { status: { type: 'enum', values: ['active', 'archived'] } },
        examples: {
          errors: [{ name: 'invalid', given: { status: 'invalid_status' }, then: { error: 'INVALID' } }],
        },
      });
      expect(dataChecker.check(makeContext([spec])).filter((i) => i.id === 'DAT-10')).toHaveLength(0);
    });
  });

  describe('DAT-11: Cross-spec input drift', () => {
    it('warns when same input has different types across entity specs', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('product', ['spec.product.create', 'spec.product.update']);
      const specs = [
        makeSpec('spec.product.create', { inputs: { url: { type: 'string', max: 2000 } } }),
        makeSpec('spec.product.update', { inputs: { url: { type: 'number' } } }),
      ];
      const context: AnalysisContext = { specs, graph, archRegistry: {}, componentGroups: emptyComponentGroups() };
      const dat11 = dataChecker.check(context).filter((i) => i.id === 'DAT-11');
      expect(dat11.length).toBeGreaterThanOrEqual(1);
      expect(dat11[0].severity).toBe('warning');
      expect(dat11[0].message).toContain('type');
    });

    it('warns when same input has different max constraints', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('product', ['spec.product.create', 'spec.product.update']);
      const specs = [
        makeSpec('spec.product.create', { inputs: { url: { type: 'string', max: 2000 } } }),
        makeSpec('spec.product.update', { inputs: { url: { type: 'string', max: 500 } } }),
      ];
      const context: AnalysisContext = { specs, graph, archRegistry: {}, componentGroups: emptyComponentGroups() };
      const dat11 = dataChecker.check(context).filter((i) => i.id === 'DAT-11');
      expect(dat11.length).toBeGreaterThanOrEqual(1);
      expect(dat11[0].message).toContain('max');
    });

    it('does NOT report DAT-11 when inputs are consistent', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('product', ['spec.product.create', 'spec.product.update']);
      const specs = [
        makeSpec('spec.product.create', { inputs: { url: { type: 'string', max: 2000 } } }),
        makeSpec('spec.product.update', { inputs: { url: { type: 'string', max: 2000 } } }),
      ];
      const context: AnalysisContext = { specs, graph, archRegistry: {}, componentGroups: emptyComponentGroups() };
      expect(dataChecker.check(context).filter((i) => i.id === 'DAT-11')).toHaveLength(0);
    });

    it('does NOT report DAT-11 for same-named inputs in different sub-entities', () => {
      // specs with different middle paths (e.g., test.calculator vs test) are separate entities
      const graph = emptyGraph();
      graph.entityToSpecs.set('test.calculator', ['spec.test.calculator.add']);
      graph.entityToSpecs.set('test', ['spec.test.directParams']);
      const specs = [
        makeSpec('spec.test.calculator.add', { inputs: { a: { type: 'number' } } }),
        makeSpec('spec.test.directParams', { inputs: { a: { type: 'string' } } }),
      ];
      const context: AnalysisContext = { specs, graph, archRegistry: {}, componentGroups: emptyComponentGroups() };
      expect(dataChecker.check(context).filter((i) => i.id === 'DAT-11')).toHaveLength(0);
    });
  });

  describe('clean case', () => {
    it('returns no issues for a well-defined spec', () => {
      const spec = makeSpec('spec.item.update', {
        security: { authentication: 'required' },
        inputs: { name: { type: 'string' } },
        outputs: {
          id: { type: 'string' },
          updatedAt: { type: 'number' },
        },
        effects: [
          { database: { table: 'items', operation: 'update' } },
          { audit_log: { action: 'item.update' } },
        ],
        examples: {
          success: [{ name: 'ok', given: {}, then: { 'result.id': '1' } }],
        },
      });
      const issues = dataChecker.check(makeContext([spec]));
      expect(issues).toHaveLength(0);
    });
  });
});
