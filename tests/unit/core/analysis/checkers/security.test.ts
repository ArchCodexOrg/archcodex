/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import { securityChecker } from '../../../../../src/core/analysis/checkers/security.js';
import type { AnalysisContext, CrossReferenceGraph, ResolvedSpecEntry } from '../../../../../src/core/analysis/types.js';
import type { SpecNode } from '../../../../../src/core/spec/schema.js';

function emptyGraph(): CrossReferenceGraph {
  return { entityToSpecs: new Map(), tableToWriters: new Map(), tableToReaders: new Map(), specDependents: new Map(), archToSpecs: new Map() };
}

function makeContext(specs: ResolvedSpecEntry[]): AnalysisContext {
  return { specs, graph: emptyGraph(), archRegistry: {}, componentGroups: { 'component-groups': {} } };
}

function makeSpec(specId: string, node: Partial<SpecNode>): ResolvedSpecEntry {
  return { specId, node: { type: 'leaf', ...node } as SpecNode };
}

/** Test-only patterns — exercises deep rules with sample regex. Not production defaults. */
const testDeepPatterns = {
  auth_check: ['ctx\\.userId\\b', 'ctx\\.user\\b', 'makeAuth(?:Query|Mutation|Action)', 'requireAuth'],
  ownership_check: ['\\.userId\\s*[!=]==?\\s*', 'canAccess\\w*\\('],
  permission_call: "canAccess\\w*\\([^)]*,\\s*['\"]([\\w]+)['\"]\\s*\\)",
  soft_delete_filter: ['isDeleted', 'deletedFilter', "\\.eq\\s*\\(\\s*['\"]isDeleted['\"]"],
  db_query: ['ctx\\.db\\.query\\s*\\(', '\\.filter\\s*\\('],
  db_get: ['ctx\\.db\\.get\\s*\\('],
};

describe('securityChecker', () => {
  it('has correct metadata', () => {
    expect(securityChecker.id).toBe('security');
    expect(securityChecker.name).toBe('Security Checker');
    expect(securityChecker.category).toBe('security');
  });

  describe('SEC-1: unauthenticated database write', () => {
    it('reports error when auth is none with database insert', () => {
      const spec = makeSpec('spec.test.createUser', { security: { authentication: 'none' }, effects: [{ database: { table: 'users', operation: 'insert' } }] });
      const sec1 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-1');
      expect(sec1).toHaveLength(1);
      expect(sec1[0].severity).toBe('error');
      expect(sec1[0].specId).toBe('spec.test.createUser');
      expect(sec1[0].message).toContain('Unauthenticated database write');
    });

    it('reports error when auth is undefined with database update', () => {
      const spec = makeSpec('spec.test.updateItem', { effects: [{ database: { table: 'items', operation: 'update' } }] });
      const sec1 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-1');
      expect(sec1).toHaveLength(1);
      expect(sec1[0].message).toContain('unset');
    });

    it('reports error with auth none and database delete', () => {
      const spec = makeSpec('spec.test.removeItem', { security: { authentication: 'none' }, effects: [{ database: { table: 'items', operation: 'delete' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-1')).toHaveLength(1);
    });

    it('does NOT report SEC-1 when auth is required', () => {
      const spec = makeSpec('spec.test.securedWrite', { security: { authentication: 'required' }, effects: [{ database: { table: 'users', operation: 'insert' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-1')).toHaveLength(0);
    });

    it('does NOT report SEC-1 when no database write effects', () => {
      const spec = makeSpec('spec.test.publicRead', { security: { authentication: 'none' }, effects: [{ database: { table: 'logs', operation: 'read' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-1')).toHaveLength(0);
    });
  });

  describe('SEC-2: public endpoint without rate limit', () => {
    it('reports warning when auth none no rate_limit no effects', () => {
      const spec = makeSpec('spec.test.pub', { security: { authentication: 'none' } });
      const sec2 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-2');
      expect(sec2).toHaveLength(1);
      expect(sec2[0].severity).toBe('warning');
    });

    it('reports error when auth none no rate_limit with effects', () => {
      const spec = makeSpec('spec.test.pubM', { security: { authentication: 'none' }, effects: [{ scheduler: { action: 'send' } }] });
      const sec2 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-2');
      expect(sec2).toHaveLength(1);
      expect(sec2[0].severity).toBe('error');
    });

    it('reports issue when auth is optional no rate_limit', () => {
      const spec = makeSpec('spec.test.opt', { security: { authentication: 'optional' } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-2')).toHaveLength(1);
    });

    it('does NOT report SEC-2 when rate_limit defined', () => {
      const spec = makeSpec('spec.test.rl', { security: { authentication: 'none', rate_limit: { requests: 60, window: '15m' } } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-2')).toHaveLength(0);
    });

    it('does NOT report SEC-2 when auth required', () => {
      const spec = makeSpec('spec.test.authed', { security: { authentication: 'required' } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-2')).toHaveLength(0);
    });
  });

  describe('SEC-3: delete without admin/delete permission', () => {
    it('reports error when delete with only edit permission', () => {
      const spec = makeSpec('spec.test.del', { security: { authentication: 'required', permissions: ['edit'] }, effects: [{ database: { table: 'products', operation: 'delete' } }] });
      const sec3 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-3');
      expect(sec3).toHaveLength(1);
      expect(sec3[0].severity).toBe('error');
    });

    it('does NOT report SEC-3 with admin permission', () => {
      const spec = makeSpec('spec.test.del2', { security: { authentication: 'required', permissions: ['admin'] }, effects: [{ database: { table: 'b', operation: 'delete' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-3')).toHaveLength(0);
    });

    it('does NOT report SEC-3 with delete permission', () => {
      const spec = makeSpec('spec.test.del3', { security: { authentication: 'required', permissions: ['delete'] }, effects: [{ database: { table: 'b', operation: 'delete' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-3')).toHaveLength(0);
    });

    it('does NOT report SEC-3 when no permissions defined', () => {
      const spec = makeSpec('spec.test.del4', { security: { authentication: 'required' }, effects: [{ database: { table: 'b', operation: 'delete' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-3')).toHaveLength(0);
    });
  });

  describe('SEC-4: unsanitized string input stored to DB', () => {
    it('reports warning for unsanitized string inputs', () => {
      const spec = makeSpec('spec.test.cp', { security: { authentication: 'required' }, inputs: { title: { type: 'string', required: true }, body: { type: 'string', required: true } }, effects: [{ database: { table: 'posts', operation: 'insert' } }] });
      const sec4 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-4');
      expect(sec4).toHaveLength(2);
      expect(sec4[0].severity).toBe('warning');
      expect(sec4.map((i) => i.field)).toContain('title');
      expect(sec4.map((i) => i.field)).toContain('body');
    });

    it('does NOT report SEC-4 with validate', () => {
      const spec = makeSpec('spec.test.cp1', { security: { authentication: 'required' }, inputs: { email: { type: 'string', required: true, validate: 'email' } }, effects: [{ database: { table: 'u', operation: 'insert' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-4')).toHaveLength(0);
    });

    it('does NOT report SEC-4 with pattern', () => {
      const spec = makeSpec('spec.test.cp2', { security: { authentication: 'required' }, inputs: { slug: { type: 'string', required: true, pattern: '^[a-z]+$' } }, effects: [{ database: { table: 'p', operation: 'insert' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-4')).toHaveLength(0);
    });

    it('does NOT report SEC-4 with sanitization', () => {
      const spec = makeSpec('spec.test.cp3', { security: { authentication: 'required', sanitization: ['html_escape'] }, inputs: { title: { type: 'string', required: true } }, effects: [{ database: { table: 'p', operation: 'insert' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-4')).toHaveLength(0);
    });

    it('does NOT report SEC-4 for non-string inputs', () => {
      const spec = makeSpec('spec.test.cp4', { security: { authentication: 'required' }, inputs: { count: { type: 'number', required: true } }, effects: [{ database: { table: 'p', operation: 'insert' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-4')).toHaveLength(0);
    });

    it('does NOT report SEC-4 without DB write effects', () => {
      const spec = makeSpec('spec.test.ro', { security: { authentication: 'required' }, inputs: { q: { type: 'string', required: true } } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-4')).toHaveLength(0);
    });
  });

  describe('SEC-5: missing NOT_AUTHENTICATED error example', () => {
    it('reports warning when auth required but no auth error example', () => {
      const spec = makeSpec('spec.test.sa', { security: { authentication: 'required' }, examples: { success: [{ name: 'w', given: { user: { id: '1' } }, then: { result: 'ok' } }] } });
      const sec5 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-5');
      expect(sec5).toHaveLength(1);
      expect(sec5[0].severity).toBe('warning');
    });

    it('does NOT report SEC-5 with NOT_AUTHENTICATED error', () => {
      const spec = makeSpec('spec.test.sa1', { security: { authentication: 'required' }, examples: { errors: [{ name: 'u', given: {}, then: { error: 'NOT_AUTHENTICATED' } }] } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-5')).toHaveLength(0);
    });

    it('does NOT report SEC-5 with case-insensitive unauthenticated', () => {
      const spec = makeSpec('spec.test.sa2', { security: { authentication: 'required' }, examples: { errors: [{ name: 'u', given: {}, then: { error: 'Unauthenticated request' } }] } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-5')).toHaveLength(0);
    });

    it('does NOT report SEC-5 when auth is none', () => {
      const spec = makeSpec('spec.test.pa', { security: { authentication: 'none' } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-5')).toHaveLength(0);
    });
  });

  describe('SEC-6: overly broad permissions on read-only spec', () => {
    it('reports warning with admin on read-only spec', () => {
      const spec = makeSpec('spec.test.gs', { security: { authentication: 'required', permissions: ['admin'] } });
      const sec6 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-6');
      expect(sec6).toHaveLength(1);
      expect(sec6[0].severity).toBe('warning');
      expect(sec6[0].message).toContain('Overly broad permissions');
    });

    it('reports warning with wildcard on read-only spec', () => {
      const spec = makeSpec('spec.test.la', { security: { authentication: 'required', permissions: ['*'] } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-6')).toHaveLength(1);
    });

    it('does NOT report SEC-6 with effects', () => {
      const spec = makeSpec('spec.test.ad', { security: { authentication: 'required', permissions: ['admin'] }, effects: [{ database: { table: 'u', operation: 'delete' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-6')).toHaveLength(0);
    });

    it('does NOT report SEC-6 with view permission', () => {
      const spec = makeSpec('spec.test.gi', { security: { authentication: 'required', permissions: ['view'] } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-6')).toHaveLength(0);
    });
  });

  describe('SEC-7: scheduler effect without rate limit', () => {
    it('reports warning with scheduler but no rate_limit', () => {
      const spec = makeSpec('spec.test.sj', { security: { authentication: 'required' }, effects: [{ scheduler: { action: 'pq' } }] });
      const sec7 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-7');
      expect(sec7).toHaveLength(1);
      expect(sec7[0].severity).toBe('warning');
    });

    it('does NOT report SEC-7 with rate_limit', () => {
      const spec = makeSpec('spec.test.sj2', { security: { authentication: 'required', rate_limit: { requests: 10, window: '1m' } }, effects: [{ scheduler: { action: 'pq' } }] });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-7')).toHaveLength(0);
    });
  });

  describe('SEC-8: missing NOT_FOUND error for ID input', () => {
    it('reports warning for ID input with table but no NOT_FOUND', () => {
      const spec = makeSpec('spec.test.gb', { inputs: { productId: { type: 'id', table: 'products', required: true } }, examples: { success: [{ name: 'f', given: { productId: '1' }, then: { title: 'T' } }] } });
      const sec8 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-8');
      expect(sec8).toHaveLength(1);
      expect(sec8[0].severity).toBe('warning');
      expect(sec8[0].field).toBe('productId');
      expect(sec8[0].message).toContain('NOT_FOUND');
    });

    it('does NOT report SEC-8 with NOT_FOUND error', () => {
      const spec = makeSpec('spec.test.gb1', { inputs: { productId: { type: 'id', table: 'products', required: true } }, examples: { errors: [{ name: 'nf', given: { productId: 'x' }, then: { error: 'NOT_FOUND' } }] } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-8')).toHaveLength(0);
    });

    it('does NOT report SEC-8 with table-specific NOT_FOUND', () => {
      const spec = makeSpec('spec.test.gb2', { inputs: { productId: { type: 'id', table: 'products', required: true } }, examples: { errors: [{ name: 'nf', given: { productId: 'x' }, then: { error: 'PRODUCTS_NOT_FOUND' } }] } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-8')).toHaveLength(0);
    });

    it('does NOT report SEC-8 without table on ID input', () => {
      const spec = makeSpec('spec.test.gi2', { inputs: { itemId: { type: 'id', required: true } } });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-8')).toHaveLength(0);
    });

    it('reports SEC-8 for each ID input missing NOT_FOUND', () => {
      const spec = makeSpec('spec.test.tr', { inputs: { sourceId: { type: 'id', table: 'accounts', required: true }, targetId: { type: 'id', table: 'accounts', required: true } } });
      const sec8 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-8');
      expect(sec8).toHaveLength(2);
      expect(sec8.map((i) => i.field)).toContain('sourceId');
      expect(sec8.map((i) => i.field)).toContain('targetId');
    });
  });

  describe('clean spec: no issues', () => {
    it('returns no issues for well-configured spec', () => {
      const spec = makeSpec('spec.test.ub', { security: { authentication: 'required', rate_limit: { requests: 100, window: '15m' }, permissions: ['admin'], sanitization: ['html_escape'] }, inputs: { productId: { type: 'id', table: 'products', required: true }, title: { type: 'string', required: true } }, outputs: { success: { type: 'boolean' } }, effects: [{ database: { table: 'products', operation: 'update' } }], examples: { success: [{ name: 'w', given: { productId: '1', title: 'N' }, then: { success: true } }], errors: [{ name: 'ua', given: { user: null }, then: { error: 'NOT_AUTHENTICATED' } }, { name: 'nf', given: { productId: 'b' }, then: { error: 'NOT_FOUND' } }] } });
      expect(securityChecker.check(makeContext([spec]))).toHaveLength(0);
    });
  });

  describe('multiple specs', () => {
    it('checks all specs combined', () => {
      const pw = makeSpec('spec.test.pw', { security: { authentication: 'none' }, effects: [{ database: { table: 'l', operation: 'insert' } }] });
      const ra = makeSpec('spec.test.ra', { security: { authentication: 'required', permissions: ['admin'] } });
      const issues = securityChecker.check(makeContext([pw, ra]));
      expect(issues.filter((i) => i.specId === 'spec.test.pw').some((i) => i.id === 'SEC-1')).toBe(true);
      expect(issues.filter((i) => i.specId === 'spec.test.pw').some((i) => i.id === 'SEC-2')).toBe(true);
      expect(issues.filter((i) => i.specId === 'spec.test.ra').some((i) => i.id === 'SEC-6')).toBe(true);
    });
  });

  describe('SEC-9: unbounded bulk operation', () => {
    it('warns when array input has no max with database writes', () => {
      const spec = makeSpec('spec.test.bulk', {
        security: { authentication: 'required' },
        inputs: { ids: { type: 'array', required: true } },
        effects: [{ database: { table: 'items', operation: 'delete' } }],
      });
      const sec9 = securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-9');
      expect(sec9).toHaveLength(1);
      expect(sec9[0].severity).toBe('warning');
      expect(sec9[0].field).toBe('ids');
      expect(sec9[0].message).toContain('Unbounded');
    });

    it('does NOT report SEC-9 when array has max', () => {
      const spec = makeSpec('spec.test.bulk2', {
        security: { authentication: 'required' },
        inputs: { ids: { type: 'array', required: true, max: 100 } },
        effects: [{ database: { table: 'items', operation: 'delete' } }],
      });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-9')).toHaveLength(0);
    });

    it('does NOT report SEC-9 for non-array inputs', () => {
      const spec = makeSpec('spec.test.single', {
        security: { authentication: 'required' },
        inputs: { id: { type: 'id', required: true } },
        effects: [{ database: { table: 'items', operation: 'delete' } }],
      });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-9')).toHaveLength(0);
    });

    it('does NOT report SEC-9 for array without database writes', () => {
      const spec = makeSpec('spec.test.read', {
        security: { authentication: 'required' },
        inputs: { tags: { type: 'array', required: true } },
      });
      expect(securityChecker.check(makeContext([spec])).filter((i) => i.id === 'SEC-9')).toHaveLength(0);
    });
  });

  describe('SEC-10: auth required but unchecked in code (deep)', () => {
    function makeDeepContext(specs: ResolvedSpecEntry[], implMap: Map<string, { content: string; filePath: string }>): AnalysisContext {
      return { specs, graph: emptyGraph(), archRegistry: {}, componentGroups: { 'component-groups': {} }, implementationContents: implMap, deepPatterns: testDeepPatterns };
    }

    it('reports error when auth required but code never checks user', () => {
      const spec = makeSpec('spec.test.noAuth', { security: { authentication: 'required' } });
      const implMap = new Map([['spec.test.noAuth', { content: 'export function handler(ctx) { return ctx.db.get(args.id); }', filePath: 'src/test.ts' }]]);
      const sec10 = securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-10');
      expect(sec10).toHaveLength(1);
      expect(sec10[0].severity).toBe('error');
    });

    it('does NOT report SEC-10 when code uses makeAuthMutation', () => {
      const spec = makeSpec('spec.test.auth', { security: { authentication: 'required' } });
      const implMap = new Map([['spec.test.auth', { content: 'export const handler = makeAuthMutation(async (ctx) => { });', filePath: 'src/test.ts' }]]);
      expect(securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-10')).toHaveLength(0);
    });

    it('does NOT report SEC-10 when code checks ctx.userId', () => {
      const spec = makeSpec('spec.test.auth2', { security: { authentication: 'required' } });
      const implMap = new Map([['spec.test.auth2', { content: 'if (!ctx.userId) throw new Error("no auth"); return ctx.db.get(args.id);', filePath: 'src/test.ts' }]]);
      expect(securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-10')).toHaveLength(0);
    });

    it('does NOT report SEC-10 when no implementation data', () => {
      const spec = makeSpec('spec.test.noImpl', { security: { authentication: 'required' } });
      expect(securityChecker.check(makeDeepContext([spec], new Map())).filter((i) => i.id === 'SEC-10')).toHaveLength(0);
    });
  });

  describe('SEC-11: owner bypass (deep)', () => {
    function makeDeepContext(specs: ResolvedSpecEntry[], implMap: Map<string, { content: string; filePath: string }>): AnalysisContext {
      return { specs, graph: emptyGraph(), archRegistry: {}, componentGroups: { 'component-groups': {} }, implementationContents: implMap, deepPatterns: testDeepPatterns };
    }

    it('reports error when owner invariant exists but no owner check in code', () => {
      const spec = makeSpec('spec.test.own', {
        invariants: [{ description: 'user can only update own resources' }],
      });
      const implMap = new Map([['spec.test.own', { content: 'const item = await ctx.db.get(args.id); await ctx.db.patch(args.id, { title: args.title });', filePath: 'src/test.ts' }]]);
      const sec11 = securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-11');
      expect(sec11).toHaveLength(1);
      expect(sec11[0].severity).toBe('error');
    });

    it('does NOT report SEC-11 when code has canAccess helper', () => {
      const spec = makeSpec('spec.test.own2', {
        invariants: [{ description: 'user can only update own resources' }],
      });
      const implMap = new Map([['spec.test.own2', { content: 'const item = await ctx.db.get(args.id); await canAccessProduct(ctx, args.id, "edit");', filePath: 'src/test.ts' }]]);
      expect(securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-11')).toHaveLength(0);
    });

    it('does NOT report SEC-11 without owner invariant', () => {
      const spec = makeSpec('spec.test.noOwn', { invariants: [{ condition: 'result.count >= 0' }] });
      const implMap = new Map([['spec.test.noOwn', { content: 'const item = await ctx.db.get(args.id);', filePath: 'src/test.ts' }]]);
      expect(securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-11')).toHaveLength(0);
    });
  });

  describe('SEC-12: cross-spec permission inconsistency', () => {
    it('warns when same entity has different permission models', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('product', ['spec.product.create', 'spec.product.delete']);
      const specs = [
        makeSpec('spec.product.create', { security: { authentication: 'required', permissions: ['project.edit'] } }),
        makeSpec('spec.product.delete', { security: { authentication: 'required', permissions: ['product.delete'] } }),
      ];
      const context: AnalysisContext = { specs, graph, archRegistry: {}, componentGroups: { 'component-groups': {} } };
      const sec12 = securityChecker.check(context).filter((i) => i.id === 'SEC-12');
      expect(sec12).toHaveLength(1);
      expect(sec12[0].severity).toBe('warning');
      expect(sec12[0].message).toContain('Permission model');
    });

    it('does NOT report SEC-12 when permissions are consistent', () => {
      const graph = emptyGraph();
      graph.entityToSpecs.set('product', ['spec.product.create', 'spec.product.update']);
      const specs = [
        makeSpec('spec.product.create', { security: { authentication: 'required', permissions: ['project.edit'] } }),
        makeSpec('spec.product.update', { security: { authentication: 'required', permissions: ['project.edit'] } }),
      ];
      const context: AnalysisContext = { specs, graph, archRegistry: {}, componentGroups: { 'component-groups': {} } };
      expect(securityChecker.check(context).filter((i) => i.id === 'SEC-12')).toHaveLength(0);
    });
  });

  describe('SEC-13: permission drift (deep)', () => {
    function makeDeepContext(specs: ResolvedSpecEntry[], implMap: Map<string, { content: string; filePath: string }>): AnalysisContext {
      return { specs, graph: emptyGraph(), archRegistry: {}, componentGroups: { 'component-groups': {} }, implementationContents: implMap, deepPatterns: testDeepPatterns };
    }

    it('reports error when code checks different permission than spec', () => {
      const spec = makeSpec('spec.test.perm', { security: { authentication: 'required', permissions: ['project.edit'] } });
      const implMap = new Map([['spec.test.perm', { content: 'await canAccessProduct(ctx, id, "admin");', filePath: 'src/test.ts' }]]);
      const sec13 = securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-13');
      expect(sec13).toHaveLength(1);
      expect(sec13[0].severity).toBe('error');
      expect(sec13[0].message).toContain('admin');
    });

    it('does NOT report SEC-13 when code permission matches spec', () => {
      const spec = makeSpec('spec.test.perm2', { security: { authentication: 'required', permissions: ['project.edit'] } });
      const implMap = new Map([['spec.test.perm2', { content: 'await canAccessProject(ctx, id, "edit");', filePath: 'src/test.ts' }]]);
      expect(securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-13')).toHaveLength(0);
    });
  });

  describe('SEC-14: soft-delete leak (deep)', () => {
    function makeDeepContext(specs: ResolvedSpecEntry[], implMap: Map<string, { content: string; filePath: string }>): AnalysisContext {
      return { specs, graph: emptyGraph(), archRegistry: {}, componentGroups: { 'component-groups': {} }, implementationContents: implMap, deepPatterns: testDeepPatterns };
    }

    it('warns when soft-delete entity queried without isDeleted filter', () => {
      const spec = makeSpec('spec.test.softdel', {
        invariants: ['soft-deleted records must not appear in results'],
      });
      const implMap = new Map([['spec.test.softdel', { content: 'const items = await ctx.db.query("products").filter(q => q.eq(q.field("projectId"), args.projectId)).collect();', filePath: 'src/test.ts' }]]);
      const sec14 = securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-14');
      expect(sec14).toHaveLength(1);
      expect(sec14[0].severity).toBe('warning');
    });

    it('does NOT report SEC-14 when code uses deletedFilter', () => {
      const spec = makeSpec('spec.test.softdel2', {
        invariants: ['soft-deleted records must not appear in results'],
      });
      const implMap = new Map([['spec.test.softdel2', { content: 'const items = await ctx.db.query("products").filter(deletedFilter(q)).collect();', filePath: 'src/test.ts' }]]);
      expect(securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-14')).toHaveLength(0);
    });

    it('does NOT report SEC-14 when spec has no soft-delete signal', () => {
      const spec = makeSpec('spec.test.nosoftdel', {
        invariants: ['results must be paginated'],
      });
      const implMap = new Map([['spec.test.nosoftdel', { content: 'const items = await ctx.db.query("products").filter(q => q.eq(q.field("projectId"), args.projectId)).collect();', filePath: 'src/test.ts' }]]);
      expect(securityChecker.check(makeDeepContext([spec], implMap)).filter((i) => i.id === 'SEC-14')).toHaveLength(0);
    });
  });

  describe('configurable deep patterns', () => {
    function makeDeepContextWithPatterns(
      specs: ResolvedSpecEntry[],
      implMap: Map<string, { content: string; filePath: string }>,
      deepPatterns: Record<string, unknown>,
    ): AnalysisContext {
      return { specs, graph: emptyGraph(), archRegistry: {}, componentGroups: { 'component-groups': {} }, implementationContents: implMap, deepPatterns: deepPatterns as AnalysisContext['deepPatterns'] };
    }

    it('SEC-10 uses custom auth_check patterns', () => {
      const spec = makeSpec('spec.test.auth', { security: { authentication: 'required' } });
      // Code uses Express-style req.user instead of Convex ctx.userId
      const code = 'export function handler(req, res) { if (!req.user) throw new Error("unauth"); }';
      const implMap = new Map([['spec.test.auth', { content: code, filePath: 'src/test.ts' }]]);

      // Default patterns should NOT match req.user
      const defaultResult = securityChecker.check(makeDeepContextWithPatterns([spec], implMap, {
        auth_check: ['ctx\\.userId\\b', 'makeAuth'],
        ownership_check: ['\\.userId\\s*[!=]==?\\s*'],
        permission_call: "canAccess\\w*\\([^)]*,\\s*['\"]([\\w]+)['\"]\\s*\\)",
        soft_delete_filter: ['isDeleted'],
        db_query: ['ctx\\.db\\.query\\s*\\('],
        db_get: ['ctx\\.db\\.get\\s*\\('],
      }));
      expect(defaultResult.filter((i) => i.id === 'SEC-10')).toHaveLength(1);

      // Custom patterns SHOULD match req.user
      const customResult = securityChecker.check(makeDeepContextWithPatterns([spec], implMap, {
        auth_check: ['req\\.user\\b', 'authenticate\\('],
        ownership_check: ['\\.userId\\s*[!=]==?\\s*'],
        permission_call: "checkPermission\\([^)]*,\\s*['\"]([\\w]+)['\"]\\s*\\)",
        soft_delete_filter: ['deletedAt'],
        db_query: ['prisma\\.\\w+\\.findMany'],
        db_get: ['prisma\\.\\w+\\.findUnique'],
      }));
      expect(customResult.filter((i) => i.id === 'SEC-10')).toHaveLength(0);
    });

    it('SEC-14 uses custom soft_delete_filter and db_query patterns', () => {
      const spec = makeSpec('spec.test.query', {
        inherits: 'spec.query',
        invariants: ['soft-deleted records must be excluded'],
      });
      // Prisma-style query without deletedAt filter
      const code = 'const items = await prisma.user.findMany({ where: { active: true } });';
      const implMap = new Map([['spec.test.query', { content: code, filePath: 'src/test.ts' }]]);

      const customPatterns = {
        auth_check: ['req\\.user'],
        ownership_check: ['\\.userId\\s*==='],
        permission_call: "checkPerm\\([^)]*,\\s*['\"]([\\w]+)['\"]\\s*\\)",
        soft_delete_filter: ['deletedAt', 'whereNotDeleted'],
        db_query: ['prisma\\.\\w+\\.findMany'],
        db_get: ['prisma\\.\\w+\\.findUnique'],
      };

      const result = securityChecker.check(makeDeepContextWithPatterns([spec], implMap, customPatterns));
      expect(result.filter((i) => i.id === 'SEC-14')).toHaveLength(1);

      // Now with the filter present
      const code2 = 'const items = await prisma.user.findMany({ where: { active: true, deletedAt: null } });';
      const implMap2 = new Map([['spec.test.query', { content: code2, filePath: 'src/test.ts' }]]);
      const result2 = securityChecker.check(makeDeepContextWithPatterns([spec], implMap2, customPatterns));
      expect(result2.filter((i) => i.id === 'SEC-14')).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('returns no issues for empty spec list', () => {
      expect(securityChecker.check(makeContext([]))).toHaveLength(0);
    });

    it('returns no issues for minimal spec', () => {
      expect(securityChecker.check(makeContext([makeSpec('spec.test.m', {})]))).toHaveLength(0);
    });
  });
});
