/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import { otherChecker } from '../../../../../src/core/analysis/checkers/other.js';
import type {
  AnalysisContext,
  CrossReferenceGraph,
  ResolvedSpecEntry,
} from '../../../../../src/core/analysis/types.js';
import type { SpecNode } from '../../../../../src/core/spec/schema.js';

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
  archRegistry: Record<string, Record<string, unknown>> = {},
  componentGroups = emptyComponentGroups(),
  graph = emptyGraph(),
): AnalysisContext {
  return { specs, graph, archRegistry, componentGroups };
}

function makeSpec(specId: string, overrides: Partial<SpecNode> = {}): ResolvedSpecEntry {
  return {
    specId,
    node: { type: 'leaf', ...overrides } as SpecNode,
  };
}

describe('otherChecker', () => {
  describe('metadata', () => {
    it('has correct id, name, and category', () => {
      expect(otherChecker.id).toBe('other');
      expect(otherChecker.name).toBe('Other Checker');
      expect(otherChecker.category).toBe('other');
    });
  });

  describe('OTH-1: Effect chain complexity', () => {
    it('errors when spec has >= 8 effects (excessive chain)', () => {
      const effects = Array.from({ length: 8 }, (_, i) => ({
        database: { table: 'table_' + i, operation: 'insert' },
      }));
      const spec = makeSpec('spec.myApp.megaOperation', { effects });
      const issues = otherChecker.check(makeContext([spec]));
      const oth1 = issues.filter((i) => i.id === 'OTH-1');
      expect(oth1).toHaveLength(1);
      expect(oth1[0].severity).toBe('error');
      expect(oth1[0].specId).toBe('spec.myApp.megaOperation');
      expect(oth1[0].message).toContain('Excessive');
      expect(oth1[0].message).toContain('8');
    });

    it('warns when spec has 5-7 effects (complex chain)', () => {
      const effects = Array.from({ length: 6 }, (_, i) => ({
        database: { table: 'table_' + i, operation: 'insert' },
      }));
      const spec = makeSpec('spec.myApp.complexOp', { effects });
      const issues = otherChecker.check(makeContext([spec]));
      const oth1 = issues.filter((i) => i.id === 'OTH-1');
      expect(oth1).toHaveLength(1);
      expect(oth1[0].severity).toBe('warning');
      expect(oth1[0].message).toContain('Complex');
      expect(oth1[0].message).toContain('6');
    });

    it('does not flag when spec has < 5 effects', () => {
      const spec = makeSpec('spec.myApp.normalOp', {
        effects: [
          { database: { table: 'items', operation: 'insert' } },
          { audit_log: { action: 'create' } },
          { scheduler: { job: 'notify' } },
          { cache: { invalidate: 'items' } },
        ],
      });
      const issues = otherChecker.check(makeContext([spec]));
      const oth1 = issues.filter((i) => i.id === 'OTH-1');
      expect(oth1).toHaveLength(0);
    });

    it('does not flag when spec has no effects', () => {
      const spec = makeSpec('spec.myApp.simpleQuery', {});
      const issues = otherChecker.check(makeContext([spec]));
      const oth1 = issues.filter((i) => i.id === 'OTH-1');
      expect(oth1).toHaveLength(0);
    });
  });

  describe('OTH-3: High-impact specs', () => {
    it('flags info when spec has >= 5 dependents', () => {
      const graph = emptyGraph();
      graph.specDependents.set('spec.core.baseEntity', [
        'spec.app.users', 'spec.app.items', 'spec.app.orders',
        'spec.app.payments', 'spec.app.notifications',
      ]);
      const spec = makeSpec('spec.core.baseEntity', {});
      const issues = otherChecker.check(makeContext([spec], {}, emptyComponentGroups(), graph));
      const oth3 = issues.filter((i) => i.id === 'OTH-3');
      expect(oth3).toHaveLength(1);
      expect(oth3[0].severity).toBe('info');
      expect(oth3[0].specId).toBe('spec.core.baseEntity');
      expect(oth3[0].message).toContain('High-impact');
      expect(oth3[0].message).toContain('5');
      expect(oth3[0].relatedSpecs).toHaveLength(5);
    });

    it('does not flag when spec has < 5 dependents', () => {
      const graph = emptyGraph();
      graph.specDependents.set('spec.core.helper', ['spec.app.users', 'spec.app.items']);
      const spec = makeSpec('spec.core.helper', {});
      const issues = otherChecker.check(makeContext([spec], {}, emptyComponentGroups(), graph));
      const oth3 = issues.filter((i) => i.id === 'OTH-3');
      expect(oth3).toHaveLength(0);
    });
  });

  describe('OTH-4: Scheduler without idempotency', () => {
    it('warns when spec has scheduler effect but no idempotency invariant', () => {
      const spec = makeSpec('spec.myApp.scheduleJob', {
        effects: [{ scheduler: { job: 'sendReminder', delay: '1h' } }],
        invariants: [{ 'result.success': true }],
      });
      const issues = otherChecker.check(makeContext([spec]));
      const oth4 = issues.filter((i) => i.id === 'OTH-4');
      expect(oth4).toHaveLength(1);
      expect(oth4[0].severity).toBe('warning');
      expect(oth4[0].message).toContain('idempotency');
    });

    it('does not warn when spec has string idempotency invariant', () => {
      const spec = makeSpec('spec.myApp.scheduleJob', {
        effects: [{ scheduler: { job: 'sendReminder', delay: '1h' } }],
        invariants: ['Scheduled job is idempotent (safe to retry)'],
      });
      const issues = otherChecker.check(makeContext([spec]));
      const oth4 = issues.filter((i) => i.id === 'OTH-4');
      expect(oth4).toHaveLength(0);
    });

    it('does not warn when spec has structured idempotency invariant with condition', () => {
      const spec = makeSpec('spec.myApp.scheduleJob', {
        effects: [{ scheduler: { job: 'sendReminder', delay: '1h' } }],
        invariants: [{ condition: 'job execution is idempotent', description: 'Safe to retry' }],
      });
      const issues = otherChecker.check(makeContext([spec]));
      const oth4 = issues.filter((i) => i.id === 'OTH-4');
      expect(oth4).toHaveLength(0);
    });

    it('does not warn when spec has structured idempotency invariant with description', () => {
      const spec = makeSpec('spec.myApp.scheduleJob', {
        effects: [{ scheduler: { job: 'sendReminder', delay: '1h' } }],
        invariants: [{ description: 'must be idempotent', condition: 'retries safe' }],
      });
      const issues = otherChecker.check(makeContext([spec]));
      const oth4 = issues.filter((i) => i.id === 'OTH-4');
      expect(oth4).toHaveLength(0);
    });

    it('does not warn when spec has no scheduler effect', () => {
      const spec = makeSpec('spec.myApp.createItem', {
        effects: [{ database: { table: 'items', operation: 'insert' } }],
      });
      const issues = otherChecker.check(makeContext([spec]));
      const oth4 = issues.filter((i) => i.id === 'OTH-4');
      expect(oth4).toHaveLength(0);
    });
  });

  describe('OTH-5: Webhook without error handling', () => {
    it('warns when spec has webhook effect but no external error example', () => {
      const spec = makeSpec('spec.myApp.sendWebhook', {
        effects: [{ webhook: { url: 'https://api.example.com/notify' } }],
        examples: {
          success: [{ name: 'webhook sent', given: {}, then: { 'result.sent': true } }],
          errors: [{ name: 'invalid payload', then: { error: 'VALIDATION_ERROR' } }],
        },
      });
      const issues = otherChecker.check(makeContext([spec]));
      const oth5 = issues.filter((i) => i.id === 'OTH-5');
      expect(oth5).toHaveLength(1);
      expect(oth5[0].severity).toBe('warning');
      expect(oth5[0].message).toContain('Webhook');
    });

    it('does not warn when spec has error example with external keyword', () => {
      const spec = makeSpec('spec.myApp.sendWebhook', {
        effects: [{ webhook: { url: 'https://api.example.com/notify' } }],
        examples: { errors: [{ name: 'ext fail', then: { error: 'EXTERNAL_ERROR' } }] },
      });
      const issues = otherChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'OTH-5')).toHaveLength(0);
    });

    it('does not warn when spec has error example with timeout keyword', () => {
      const spec = makeSpec('spec.myApp.sendWebhook', {
        effects: [{ webhook: { url: 'https://api.example.com/notify' } }],
        examples: { errors: [{ name: 'timeout', then: { error: 'TIMEOUT_ERROR' } }] },
      });
      const issues = otherChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'OTH-5')).toHaveLength(0);
    });

    it('does not warn when spec has error example with network keyword', () => {
      const spec = makeSpec('spec.myApp.sendWebhook', {
        effects: [{ webhook: { url: 'https://api.example.com/notify' } }],
        examples: { errors: [{ name: 'net issue', then: { error: 'NETWORK_ERROR' } }] },
      });
      const issues = otherChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'OTH-5')).toHaveLength(0);
    });

    it('does not warn when spec has no webhook effect', () => {
      const spec = makeSpec('spec.myApp.dbWrite', {
        effects: [{ database: { table: 'items', operation: 'insert' } }],
      });
      const issues = otherChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'OTH-5')).toHaveLength(0);
    });
  });

  describe('OTH-8: Mixin parameter validation', () => {
    it('errors when logs_audit mixin is missing required params', () => {
      const spec = makeSpec('spec.myApp.auditedOp', {
        mixins: [{ logs_audit: { action: 'create' } }],
      });
      const issues = otherChecker.check(makeContext([spec]));
      const oth8 = issues.filter((i) => i.id === 'OTH-8');
      expect(oth8).toHaveLength(1);
      expect(oth8[0].severity).toBe('error');
      expect(oth8[0].field).toBe('mixins.logs_audit');
      expect(oth8[0].message).toContain("'resource'");
    });

    it('errors for each missing required param separately', () => {
      const spec = makeSpec('spec.myApp.auditedOp', {
        mixins: [{ logs_audit: {} }],
      });
      const issues = otherChecker.check(makeContext([spec]));
      const oth8 = issues.filter((i) => i.id === 'OTH-8');
      expect(oth8).toHaveLength(2);
      const messages = oth8.map((i) => i.message);
      expect(messages.some((m) => m.includes("'action'"))).toBe(true);
      expect(messages.some((m) => m.includes("'resource'"))).toBe(true);
    });

    it('does not error when logs_audit mixin has all required params', () => {
      const spec = makeSpec('spec.myApp.auditedOp', {
        mixins: [{ logs_audit: { action: 'create', resource: 'product' } }],
      });
      const issues = otherChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'OTH-8')).toHaveLength(0);
    });

    it('does not error for string-only mixins', () => {
      const spec = makeSpec('spec.myApp.authedOp', { mixins: ['requires_auth'] });
      const issues = otherChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'OTH-8')).toHaveLength(0);
    });

    it('validates rate_limited mixin required params', () => {
      const spec = makeSpec('spec.myApp.rateLimited', {
        mixins: [{ rate_limited: { requests: 100 } }],
      });
      const issues = otherChecker.check(makeContext([spec]));
      const oth8 = issues.filter((i) => i.id === 'OTH-8');
      expect(oth8).toHaveLength(1);
      expect(oth8[0].message).toContain("'window'");
    });

    it('does not error for unknown mixin names', () => {
      const spec = makeSpec('spec.myApp.customMixin', {
        mixins: [{ custom_mixin: { foo: 'bar' } }],
      });
      const issues = otherChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'OTH-8')).toHaveLength(0);
    });
  });
});
