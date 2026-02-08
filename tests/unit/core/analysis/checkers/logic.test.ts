/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import { logicChecker } from '../../../../../src/core/analysis/checkers/logic.js';
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

function makeContext(specs: ResolvedSpecEntry[]): AnalysisContext {
  return {
    specs,
    graph: emptyGraph(),
    archRegistry: {},
    componentGroups: { 'component-groups': {} },
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

describe('logicChecker', () => {
  describe('metadata', () => {
    it('has correct id, name, and category', () => {
      expect(logicChecker.id).toBe('logic');
      expect(logicChecker.name).toBe('Logic Checker');
      expect(logicChecker.category).toBe('logic');
    });
  });

  describe('LOG-1: Contradictory invariants', () => {
    it('detects contradictory boolean invariants', () => {
      const spec = makeSpec('spec.item.validate', {
        invariants: [
          { condition: 'result.valid === true' },
          { condition: 'result.valid === false' },
        ],
      });
      const issues = logicChecker.check(makeContext([spec]));
      const log1 = issues.filter((i) => i.id === 'LOG-1');

      expect(log1).toHaveLength(1);
      expect(log1[0].severity).toBe('error');
      expect(log1[0].message).toContain('Contradictory');
    });

    it('detects contradictory range invariants', () => {
      const spec = makeSpec('spec.item.score', {
        invariants: [
          { condition: 'score > 10' },
          { condition: 'score < 5' },
        ],
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-1')).toHaveLength(1);
    });

    it('handles string invariants', () => {
      const spec = makeSpec('spec.item.check', {
        invariants: ['active === true', 'active === false'],
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-1')).toHaveLength(1);
    });

    it('does not flag non-contradictory invariants', () => {
      const spec = makeSpec('spec.item.validate', {
        invariants: [
          { condition: 'result.count >= 0' },
          { condition: 'result.total >= result.count' },
        ],
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-1')).toHaveLength(0);
    });

    it('does not flag single invariant', () => {
      const spec = makeSpec('spec.item.validate', {
        invariants: [{ condition: 'result.valid === true' }],
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-1')).toHaveLength(0);
    });
  });

  describe('LOG-2: Unreachable error branches', () => {
    it('warns when error example uses valid enum value without other violations', () => {
      const spec = makeSpec('spec.item.update', {
        inputs: {
          status: { type: 'enum', values: ['active', 'archived'] },
        },
        examples: {
          errors: [
            { name: 'bad status', given: { status: 'active' }, then: { error: 'INVALID' } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      const log2 = issues.filter((i) => i.id === 'LOG-2');

      expect(log2).toHaveLength(1);
      expect(log2[0].severity).toBe('warning');
      expect(log2[0].field).toBe('status');
    });

    it('does not warn when error example uses invalid enum value', () => {
      const spec = makeSpec('spec.item.update', {
        inputs: {
          status: { type: 'enum', values: ['active', 'archived'] },
        },
        examples: {
          errors: [
            { name: 'bad status', given: { status: 'unknown' }, then: { error: 'INVALID' } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-2')).toHaveLength(0);
    });

    it('does not warn when another field in example has a violation', () => {
      const spec = makeSpec('spec.item.update', {
        inputs: {
          status: { type: 'enum', values: ['active', 'archived'] },
          count: { type: 'number', min: 0 },
        },
        examples: {
          errors: [
            { name: 'negative count', given: { status: 'active', count: -1 }, then: { error: 'INVALID' } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-2')).toHaveLength(0);
    });

    it('does not warn for non-enum inputs', () => {
      const spec = makeSpec('spec.item.update', {
        inputs: { name: { type: 'string' } },
        examples: {
          errors: [
            { name: 'bad name', given: { name: 'test' }, then: { error: 'INVALID' } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-2')).toHaveLength(0);
    });
  });

  describe('LOG-3: Missing default handling in examples', () => {
    it('warns when input has default but no example omits it', () => {
      const spec = makeSpec('spec.item.list', {
        inputs: {
          limit: { type: 'number', default: 50 },
        },
        examples: {
          success: [
            { name: 'with limit', given: { limit: 10 }, then: {} },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      const log3 = issues.filter((i) => i.id === 'LOG-3');

      expect(log3).toHaveLength(1);
      expect(log3[0].severity).toBe('warning');
      expect(log3[0].field).toBe('limit');
      expect(log3[0].message).toContain('default');
    });

    it('does not warn when an example omits the field', () => {
      const spec = makeSpec('spec.item.list', {
        inputs: {
          limit: { type: 'number', default: 50 },
          query: { type: 'string' },
        },
        examples: {
          success: [
            { name: 'default limit', given: { query: 'test' }, then: {} },
            { name: 'custom limit', given: { query: 'test', limit: 10 }, then: {} },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-3')).toHaveLength(0);
    });

    it('does not flag inputs without default', () => {
      const spec = makeSpec('spec.item.list', {
        inputs: { query: { type: 'string', required: true } },
        examples: {
          success: [{ name: 'ok', given: { query: 'test' }, then: {} }],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-3')).toHaveLength(0);
    });
  });

  describe('LOG-5: Invariant-example contradiction', () => {
    it('errors when success example contradicts invariant', () => {
      const spec = makeSpec('spec.item.score', {
        invariants: [{ condition: 'result.score >= 10' }],
        outputs: { score: { type: 'number' } },
        examples: {
          success: [
            { name: 'low score', given: {}, then: { 'result.score': 5 } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      const log5 = issues.filter((i) => i.id === 'LOG-5');

      expect(log5).toHaveLength(1);
      expect(log5[0].severity).toBe('error');
      expect(log5[0].message).toContain('contradicting');
      expect(log5[0].message).toContain('score');
    });

    it('does not error when example satisfies invariant', () => {
      const spec = makeSpec('spec.item.score', {
        invariants: [{ condition: 'result.score >= 10' }],
        outputs: { score: { type: 'number' } },
        examples: {
          success: [
            { name: 'high score', given: {}, then: { 'result.score': 15 } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-5')).toHaveLength(0);
    });

    it('does not error for non-numeric assertions', () => {
      const spec = makeSpec('spec.item.check', {
        invariants: [{ condition: 'result.valid >= 1' }],
        outputs: { valid: { type: 'boolean' } },
        examples: {
          success: [
            { name: 'ok', given: {}, then: { 'result.valid': true } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-5')).toHaveLength(0);
    });
  });

  describe('LOG-6: Forall/exists scope errors', () => {
    it('errors when forall references non-existent output', () => {
      const spec = makeSpec('spec.item.list', {
        outputs: { items: { type: 'array' } },
        invariants: [{
          forall: { in: 'result.nonExistent', condition: 'item > 0' },
        }],
      });
      const issues = logicChecker.check(makeContext([spec]));
      const log6 = issues.filter((i) => i.id === 'LOG-6');

      expect(log6).toHaveLength(1);
      expect(log6[0].severity).toBe('error');
      expect(log6[0].message).toContain('nonExistent');
    });

    it('errors when exists references non-existent output', () => {
      const spec = makeSpec('spec.item.list', {
        outputs: { items: { type: 'array' } },
        invariants: [{
          exists: { in: 'result.missing', condition: 'item.active' },
        }],
      });
      const issues = logicChecker.check(makeContext([spec]));
      const log6 = issues.filter((i) => i.id === 'LOG-6');

      expect(log6).toHaveLength(1);
      expect(log6[0].message).toContain('missing');
    });

    it('does not error when output exists', () => {
      const spec = makeSpec('spec.item.list', {
        outputs: { items: { type: 'array' } },
        invariants: [{
          forall: { in: 'result.items', condition: 'item.active === true' },
        }],
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-6')).toHaveLength(0);
    });

    it('validates nested paths', () => {
      const spec = makeSpec('spec.order.calculate', {
        outputs: {
          fees: { type: 'object', properties: { breakdown: { type: 'array' } } },
        },
        invariants: [{
          forall: { in: 'result.fees.breakdown', condition: 'fee > 0' },
        }],
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-6')).toHaveLength(0);
    });

    it('errors for invalid nested paths', () => {
      const spec = makeSpec('spec.order.calculate', {
        outputs: {
          fees: { type: 'object', properties: { total: { type: 'number' } } },
        },
        invariants: [{
          forall: { in: 'result.fees.missing', condition: 'fee > 0' },
        }],
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-6')).toHaveLength(1);
    });
  });

  describe('LOG-7: Output-assertion gap', () => {
    it('warns when output field is never asserted', () => {
      const spec = makeSpec('spec.item.create', {
        outputs: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        examples: {
          success: [
            { name: 'ok', given: {}, then: { 'result.id': '123' } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      const log7 = issues.filter((i) => i.id === 'LOG-7');

      expect(log7).toHaveLength(1);
      expect(log7[0].severity).toBe('warning');
      expect(log7[0].field).toBe('name');
    });

    it('does not warn when all outputs are asserted', () => {
      const spec = makeSpec('spec.item.create', {
        outputs: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        examples: {
          success: [
            { name: 'ok', given: {}, then: { 'result.id': '123', 'result.name': 'Test' } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-7')).toHaveLength(0);
    });

    it('does not warn when nested assertion covers output', () => {
      const spec = makeSpec('spec.item.create', {
        outputs: {
          result: { type: 'object' },
        },
        examples: {
          success: [
            { name: 'ok', given: {}, then: { 'result.result.id': '123' } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-7')).toHaveLength(0);
    });

    it('does not flag specs without outputs', () => {
      const spec = makeSpec('spec.item.delete', {});
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'LOG-7')).toHaveLength(0);
    });
  });

  describe('LOG-8: Required input with default value', () => {
    it('warns when input is both required and has a default', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { limit: { type: 'number', required: true, default: 50 } },
      });
      const issues = logicChecker.check(makeContext([spec]));
      const log8 = issues.filter((i) => i.id === 'LOG-8');
      expect(log8).toHaveLength(1);
      expect(log8[0].severity).toBe('warning');
      expect(log8[0].field).toBe('limit');
      expect(log8[0].message).toContain('contradictory');
    });

    it('does NOT report LOG-8 for required without default', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { name: { type: 'string', required: true } },
      });
      expect(logicChecker.check(makeContext([spec])).filter((i) => i.id === 'LOG-8')).toHaveLength(0);
    });

    it('does NOT report LOG-8 for optional with default', () => {
      const spec = makeSpec('spec.item.list', {
        inputs: { limit: { type: 'number', default: 50 } },
      });
      expect(logicChecker.check(makeContext([spec])).filter((i) => i.id === 'LOG-8')).toHaveLength(0);
    });
  });

  describe('LOG-9: Undocumented error codes (verifier bridge)', () => {
    it('warns when verifier finds extra error codes (aggregated per spec)', () => {
      const spec = makeSpec('spec.item.create', {});
      const verifierResults = new Map([
        ['spec.item.create', {
          extraErrors: ['RATE_LIMITED', 'DUPLICATE_URL'],
          missingOutputs: [],
          extraOutputs: [],
          architectureMismatch: false,
        }],
      ]);
      const context: AnalysisContext = {
        specs: [spec], graph: emptyGraph(), archRegistry: {},
        componentGroups: { 'component-groups': {} }, verifierResults,
      };
      const log9 = logicChecker.check(context).filter((i) => i.id === 'LOG-9');
      expect(log9).toHaveLength(1);
      expect(log9[0].severity).toBe('warning');
      expect(log9[0].message).toContain('RATE_LIMITED');
      expect(log9[0].message).toContain('DUPLICATE_URL');
      expect(log9[0].message).toContain('2 undocumented');
    });

    it('does NOT report LOG-9 without verifier results', () => {
      const spec = makeSpec('spec.item.create', {});
      expect(logicChecker.check(makeContext([spec])).filter((i) => i.id === 'LOG-9')).toHaveLength(0);
    });
  });

  describe('LOG-10: Return shape drift (verifier bridge)', () => {
    it('warns for missing outputs (aggregated per spec)', () => {
      const spec = makeSpec('spec.item.get', {});
      const verifierResults = new Map([
        ['spec.item.get', {
          extraErrors: [],
          missingOutputs: ['description', 'title'],
          extraOutputs: [],
          architectureMismatch: false,
        }],
      ]);
      const context: AnalysisContext = {
        specs: [spec], graph: emptyGraph(), archRegistry: {},
        componentGroups: { 'component-groups': {} }, verifierResults,
      };
      const log10 = logicChecker.check(context).filter((i) => i.id === 'LOG-10');
      expect(log10).toHaveLength(1);
      expect(log10[0].severity).toBe('warning');
      expect(log10[0].message).toContain('description');
      expect(log10[0].message).toContain('title');
    });

    it('does NOT report LOG-10 for extra outputs (verifier regex too noisy)', () => {
      const spec = makeSpec('spec.item.get', {});
      const verifierResults = new Map([
        ['spec.item.get', {
          extraErrors: [],
          missingOutputs: [],
          extraOutputs: ['internalFlag'],
          architectureMismatch: false,
        }],
      ]);
      const context: AnalysisContext = {
        specs: [spec], graph: emptyGraph(), archRegistry: {},
        componentGroups: { 'component-groups': {} }, verifierResults,
      };
      expect(logicChecker.check(context).filter((i) => i.id === 'LOG-10')).toHaveLength(0);
    });
  });

  describe('LOG-11: Invariant unasserted in code (deep)', () => {
    it('warns when invariant keywords are absent from code', () => {
      const spec = makeSpec('spec.item.validate', {
        invariants: [{ description: 'product title must be sanitized before storage' }],
      });
      const implContents = new Map([
        ['spec.item.validate', { content: 'function handler(ctx) { return ctx.db.get(args.id); }', filePath: 'src/test.ts' }],
      ]);
      const context: AnalysisContext = {
        specs: [spec], graph: emptyGraph(), archRegistry: {},
        componentGroups: { 'component-groups': {} }, implementationContents: implContents,
      };
      const log11 = logicChecker.check(context).filter((i) => i.id === 'LOG-11');
      expect(log11).toHaveLength(1);
      expect(log11[0].severity).toBe('warning');
      expect(log11[0].message).toContain('low code coverage');
    });

    it('does NOT report LOG-11 when keywords are present in code', () => {
      const spec = makeSpec('spec.item.validate', {
        invariants: [{ description: 'product title must be sanitized before storage' }],
      });
      const implContents = new Map([
        ['spec.item.validate', { content: 'function handler(ctx) { const product = await ctx.db.get(args.id); sanitize(product.title); await ctx.db.patch(product._id, { title: sanitized }); }', filePath: 'src/test.ts' }],
      ]);
      const context: AnalysisContext = {
        specs: [spec], graph: emptyGraph(), archRegistry: {},
        componentGroups: { 'component-groups': {} }, implementationContents: implContents,
      };
      expect(logicChecker.check(context).filter((i) => i.id === 'LOG-11')).toHaveLength(0);
    });
  });

  describe('LOG-12: Error unreachable (deep)', () => {
    it('reports info when error code not found in implementation', () => {
      const spec = makeSpec('spec.item.delete', {
        examples: { errors: [{ name: 'not found', then: { error: 'ITEM_NOT_FOUND' } }] },
      });
      const implContents = new Map([
        ['spec.item.delete', { content: 'function handler(ctx) { ctx.db.delete(args.id); }', filePath: 'src/test.ts' }],
      ]);
      const context: AnalysisContext = {
        specs: [spec], graph: emptyGraph(), archRegistry: {},
        componentGroups: { 'component-groups': {} }, implementationContents: implContents,
      };
      const log12 = logicChecker.check(context).filter((i) => i.id === 'LOG-12');
      expect(log12).toHaveLength(1);
      expect(log12[0].severity).toBe('info');
    });

    it('does NOT report LOG-12 when error code exists in code', () => {
      const spec = makeSpec('spec.item.delete', {
        examples: { errors: [{ name: 'not found', then: { error: 'ITEM_NOT_FOUND' } }] },
      });
      const implContents = new Map([
        ['spec.item.delete', { content: 'if (!item) throw new ConvexError({ code: "ITEM_NOT_FOUND" });', filePath: 'src/test.ts' }],
      ]);
      const context: AnalysisContext = {
        specs: [spec], graph: emptyGraph(), archRegistry: {},
        componentGroups: { 'component-groups': {} }, implementationContents: implContents,
      };
      expect(logicChecker.check(context).filter((i) => i.id === 'LOG-12')).toHaveLength(0);
    });
  });

  describe('LOG-13: Cross-spec error code collision', () => {
    it('reports info when custom error code is shared across specs', () => {
      const specs = [
        makeSpec('spec.product.create', { examples: { errors: [{ name: 'quota', then: { error: 'QUOTA_EXCEEDED' } }] } }),
        makeSpec('spec.asset.upload', { examples: { errors: [{ name: 'quota', then: { error: 'QUOTA_EXCEEDED' } }] } }),
      ];
      const log13 = logicChecker.check(makeContext(specs)).filter((i) => i.id === 'LOG-13');
      expect(log13).toHaveLength(1);
      expect(log13[0].severity).toBe('info');
      expect(log13[0].message).toContain('QUOTA_EXCEEDED');
    });

    it('does NOT report LOG-13 for common framework errors', () => {
      const specs = [
        makeSpec('spec.product.get', { examples: { errors: [{ name: 'nf', then: { error: 'NOT_FOUND' } }] } }),
        makeSpec('spec.asset.get', { examples: { errors: [{ name: 'nf', then: { error: 'NOT_FOUND' } }] } }),
      ];
      expect(logicChecker.check(makeContext(specs)).filter((i) => i.id === 'LOG-13')).toHaveLength(0);
    });

    it('does NOT report LOG-13 for MISSING_* and INVALID_* validation patterns', () => {
      const specs = [
        makeSpec('spec.product.create', { examples: { errors: [{ name: 'missing', then: { error: 'MISSING_PROJECTROOT' } }] } }),
        makeSpec('spec.asset.upload', { examples: { errors: [{ name: 'missing', then: { error: 'MISSING_PROJECTROOT' } }] } }),
      ];
      expect(logicChecker.check(makeContext(specs)).filter((i) => i.id === 'LOG-13')).toHaveLength(0);
    });

    it('does NOT report LOG-13 for RESOLVE_* infrastructure patterns', () => {
      const specs = [
        makeSpec('spec.docs.adr.all', { examples: { errors: [{ name: 'resolve failed', then: { error: 'RESOLVE_FAILED' } }] } }),
        makeSpec('spec.docs.adr', { examples: { errors: [{ name: 'resolve failed', then: { error: 'RESOLVE_FAILED' } }] } }),
      ];
      expect(logicChecker.check(makeContext(specs)).filter((i) => i.id === 'LOG-13')).toHaveLength(0);
    });
  });

  describe('clean case', () => {
    it('returns no issues for a well-defined spec', () => {
      const spec = makeSpec('spec.item.create', {
        inputs: { name: { type: 'string' } },
        outputs: { id: { type: 'string' } },
        invariants: [{ condition: 'result.id !== null' }],
        examples: {
          success: [
            { name: 'ok', given: { name: 'Test' }, then: { 'result.id': '123' } },
          ],
        },
      });
      const issues = logicChecker.check(makeContext([spec]));
      expect(issues).toHaveLength(0);
    });
  });
});
