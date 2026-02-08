/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import { consistencyChecker } from '../../../../../src/core/analysis/checkers/consistency.js';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('consistencyChecker', () => {
  describe('metadata', () => {
    it('has correct id, name, and category', () => {
      expect(consistencyChecker.id).toBe('consistency');
      expect(consistencyChecker.name).toBe('Consistency Checker');
      expect(consistencyChecker.category).toBe('consistency');
    });
  });

  describe('CON-1: Architecture-spec security mismatch', () => {
    it('warns when spec requires auth but architecture has no auth constraints', () => {
      const spec = makeSpec('spec.myApp.createUser', {
        security: { authentication: 'required' },
        architectures: ['core.engine'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.engine': {
          description: 'Core engine layer',
          constraints: [
            { rule: 'forbid_import', value: 'chalk' },
          ],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con1 = issues.filter((i) => i.id === 'CON-1');

      expect(con1).toHaveLength(1);
      expect(con1[0].severity).toBe('warning');
      expect(con1[0].specId).toBe('spec.myApp.createUser');
      expect(con1[0].archId).toBe('core.engine');
      expect(con1[0].message).toContain('authentication');
      expect(con1[0].message).toContain('core.engine');
    });

    it('does not warn when architecture has auth-related require_import constraint', () => {
      const spec = makeSpec('spec.myApp.createUser', {
        security: { authentication: 'required' },
        architectures: ['core.engine'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.engine': {
          description: 'Core engine layer',
          constraints: [
            { rule: 'require_import', value: 'makeAuthMutation' },
          ],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con1 = issues.filter((i) => i.id === 'CON-1');
      expect(con1).toHaveLength(0);
    });

    it('does not warn when architecture has auth-related require_call constraint', () => {
      const spec = makeSpec('spec.myApp.createUser', {
        security: { authentication: 'required' },
        architectures: ['core.engine'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.engine': {
          description: 'Core engine layer',
          constraints: [
            { rule: 'require_call', value: 'checkAuth' },
          ],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con1 = issues.filter((i) => i.id === 'CON-1');
      expect(con1).toHaveLength(0);
    });

    it('does not warn when spec does not require authentication', () => {
      const spec = makeSpec('spec.myApp.publicEndpoint', {
        security: { authentication: 'none' },
        architectures: ['core.engine'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.engine': { description: 'No auth constraints', constraints: [] },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con1 = issues.filter((i) => i.id === 'CON-1');
      expect(con1).toHaveLength(0);
    });
  });

  describe('CON-2: Component group vs touchpoints mismatch', () => {
    it('errors when spec has fewer touchpoints than component group components', () => {
      const spec = makeSpec('spec.myApp.duplicateEntry', {
        ui: {
          touchpoints: [
            { component: 'TaskCard', location: 'context menu' },
          ],
        },
      });

      const componentGroups = {
        'component-groups': {
          'order-cards': {
            components: [
              { path: 'src/components/orders/TaskCard.tsx' },
              { path: 'src/components/orders/NoteCard.tsx' },
              { path: 'src/components/orders/DecisionCard.tsx' },
            ],
            triggers: { entities: ['orders'] },
          },
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], {}, componentGroups));
      const con2 = issues.filter((i) => i.id === 'CON-2');

      expect(con2).toHaveLength(1);
      expect(con2[0].severity).toBe('error');
      expect(con2[0].specId).toBe('spec.myApp.duplicateEntry');
      expect(con2[0].message).toContain('touchpoints');
      expect(con2[0].message).toContain('order-cards');
      expect(con2[0].suggestion).toContain('NoteCard');
      expect(con2[0].suggestion).toContain('DecisionCard');
    });

    it('does not error when touchpoints cover all components', () => {
      const spec = makeSpec('spec.myApp.duplicateEntry', {
        ui: {
          touchpoints: [
            { component: 'TaskCard', location: 'context menu' },
            { component: 'NoteCard', location: 'context menu' },
          ],
        },
      });

      const componentGroups = {
        'component-groups': {
          'order-cards': {
            components: [
              { path: 'src/components/orders/TaskCard.tsx' },
              { path: 'src/components/orders/NoteCard.tsx' },
            ],
            triggers: { entities: ['entries'] },
          },
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], {}, componentGroups));
      const con2 = issues.filter((i) => i.id === 'CON-2');
      expect(con2).toHaveLength(0);
    });

    it('does not error when spec has no touchpoints at all', () => {
      const spec = makeSpec('spec.myApp.backendOnly', {});

      const componentGroups = {
        'component-groups': {
          'order-cards': {
            components: [
              { path: 'src/components/orders/TaskCard.tsx' },
            ],
            triggers: { entities: ['entries'] },
          },
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], {}, componentGroups));
      const con2 = issues.filter((i) => i.id === 'CON-2');
      expect(con2).toHaveLength(0);
    });
  });

  describe('CON-4: Layer-effect alignment (effects in pure layer)', () => {
    it('warns when spec has effects but architecture description mentions pure', () => {
      const spec = makeSpec('spec.myApp.formatDate', {
        effects: [{ database: { table: 'logs', operation: 'insert' } }],
        architectures: ['utils.formatter'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'utils.formatter': {
          description: 'Pure formatting utilities',
          constraints: [],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con4 = issues.filter((i) => i.id === 'CON-4');

      expect(con4).toHaveLength(1);
      expect(con4[0].severity).toBe('warning');
      expect(con4[0].specId).toBe('spec.myApp.formatDate');
      expect(con4[0].archId).toBe('utils.formatter');
      expect(con4[0].message).toContain('pure/utility');
    });

    it('warns when architecture description mentions utility', () => {
      const spec = makeSpec('spec.myApp.helpers', {
        effects: [{ scheduler: { job: 'cleanup' } }],
        architectures: ['core.helpers'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.helpers': {
          description: 'Utility helpers for data transformation',
          constraints: [],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con4 = issues.filter((i) => i.id === 'CON-4');

      expect(con4).toHaveLength(1);
      expect(con4[0].severity).toBe('warning');
    });

    it('warns when architecture id contains util', () => {
      const spec = makeSpec('spec.myApp.helpers', {
        effects: [{ database: { table: 'items', operation: 'insert' } }],
        architectures: ['project.util'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'project.util': {
          description: 'General helper layer',
          constraints: [],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con4 = issues.filter((i) => i.id === 'CON-4');

      expect(con4).toHaveLength(1);
    });

    it('does not warn when spec has no effects', () => {
      const spec = makeSpec('spec.myApp.pureHelper', {
        architectures: ['utils.formatter'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'utils.formatter': {
          description: 'Pure formatting utilities',
          constraints: [],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con4 = issues.filter((i) => i.id === 'CON-4');
      expect(con4).toHaveLength(0);
    });

    it('does not warn when architecture is not a pure/utility layer', () => {
      const spec = makeSpec('spec.myApp.createItem', {
        effects: [{ database: { table: 'items', operation: 'insert' } }],
        architectures: ['core.engine'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.engine': {
          description: 'Core engine for orchestration',
          constraints: [],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con4 = issues.filter((i) => i.id === 'CON-4');
      expect(con4).toHaveLength(0);
    });
  });

  describe('CON-7: Deprecated architecture usage', () => {
    it('warns when spec uses architecture with deprecated_from field', () => {
      const spec = makeSpec('spec.myApp.oldFeature', {
        architectures: ['legacy.handler'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'legacy.handler': {
          description: 'Old handler pattern',
          deprecated_from: '2024-06-01',
          migration_guide: 'Use core.engine instead',
          constraints: [],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con7 = issues.filter((i) => i.id === 'CON-7');

      expect(con7).toHaveLength(1);
      expect(con7[0].severity).toBe('warning');
      expect(con7[0].specId).toBe('spec.myApp.oldFeature');
      expect(con7[0].archId).toBe('legacy.handler');
      expect(con7[0].message).toContain('deprecated');
      expect(con7[0].message).toContain('2024-06-01');
      expect(con7[0].suggestion).toBe('Use core.engine instead');
    });

    it('uses default suggestion when no migration_guide is provided', () => {
      const spec = makeSpec('spec.myApp.oldFeature', {
        architectures: ['old.pattern'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'old.pattern': {
          description: 'Old pattern',
          deprecated_from: '2024-01-01',
          constraints: [],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con7 = issues.filter((i) => i.id === 'CON-7');

      expect(con7).toHaveLength(1);
      expect(con7[0].suggestion).toBe('Migrate to a supported architecture');
    });

    it('does not warn when architecture is not deprecated', () => {
      const spec = makeSpec('spec.myApp.feature', {
        architectures: ['core.engine'],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.engine': {
          description: 'Active architecture',
          constraints: [],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con7 = issues.filter((i) => i.id === 'CON-7');
      expect(con7).toHaveLength(0);
    });
  });

  describe('CON-8: Architecture requires import that parent forbids', () => {
    it('errors when child architecture requires import forbidden by parent', () => {
      const archRegistry: Record<string, Record<string, unknown>> = {
        'base.layer': {
          description: 'Base layer',
          constraints: [
            { rule: 'forbid_import', value: 'chalk' },
            { rule: 'forbid_import', value: 'ora' },
          ],
        },
        'child.layer': {
          description: 'Child layer',
          inherits: 'base.layer',
          constraints: [
            { rule: 'require_import', value: 'chalk' },
          ],
        },
      };

      const issues = consistencyChecker.check(makeContext([], archRegistry));
      const con8 = issues.filter((i) => i.id === 'CON-8');

      expect(con8).toHaveLength(1);
      expect(con8[0].severity).toBe('error');
      expect(con8[0].archId).toBe('child.layer');
      expect(con8[0].message).toContain('chalk');
      expect(con8[0].message).toContain('base.layer');
    });

    it('errors for each conflicting import separately', () => {
      const archRegistry: Record<string, Record<string, unknown>> = {
        'base.layer': {
          description: 'Base layer',
          constraints: [
            { rule: 'forbid_import', value: ['chalk', 'ora'] },
          ],
        },
        'child.layer': {
          description: 'Child layer',
          inherits: 'base.layer',
          constraints: [
            { rule: 'require_import', value: 'chalk' },
            { rule: 'require_import', value: 'ora' },
          ],
        },
      };

      const issues = consistencyChecker.check(makeContext([], archRegistry));
      const con8 = issues.filter((i) => i.id === 'CON-8');

      expect(con8).toHaveLength(2);
      const messages = con8.map((i) => i.message);
      expect(messages.some((m) => m.includes('chalk'))).toBe(true);
      expect(messages.some((m) => m.includes('ora'))).toBe(true);
    });

    it('does not error when there are no conflicting constraints', () => {
      const archRegistry: Record<string, Record<string, unknown>> = {
        'base.layer': {
          description: 'Base layer',
          constraints: [
            { rule: 'forbid_import', value: 'chalk' },
          ],
        },
        'child.layer': {
          description: 'Child layer',
          inherits: 'base.layer',
          constraints: [
            { rule: 'require_import', value: 'zod' },
          ],
        },
      };

      const issues = consistencyChecker.check(makeContext([], archRegistry));
      const con8 = issues.filter((i) => i.id === 'CON-8');
      expect(con8).toHaveLength(0);
    });

    it('does not error when architecture has no parent', () => {
      const archRegistry: Record<string, Record<string, unknown>> = {
        'standalone.layer': {
          description: 'Standalone',
          constraints: [
            { rule: 'require_import', value: 'chalk' },
          ],
        },
      };

      const issues = consistencyChecker.check(makeContext([], archRegistry));
      const con8 = issues.filter((i) => i.id === 'CON-8');
      expect(con8).toHaveLength(0);
    });
  });

  describe('CON-9: Architecture pattern drift', () => {
    it('warns when minority of specs diverges from majority auth pattern', () => {
      const specs = [
        makeSpec('spec.book.create', { security: { authentication: 'required' }, architectures: ['core.engine'] }),
        makeSpec('spec.book.update', { security: { authentication: 'required' }, architectures: ['core.engine'] }),
        makeSpec('spec.book.list', { security: { authentication: 'none' }, architectures: ['core.engine'] }),
      ];
      const graph = emptyGraph();
      graph.archToSpecs.set('core.engine', ['spec.book.create', 'spec.book.update', 'spec.book.list']);

      const issues = consistencyChecker.check(makeContext(specs, {}, emptyComponentGroups(), graph));
      const con9 = issues.filter((i) => i.id === 'CON-9');

      expect(con9.length).toBeGreaterThanOrEqual(1);
      expect(con9[0].severity).toBe('warning');
      expect(con9[0].message).toContain('diverges');
      expect(con9[0].archId).toBe('core.engine');
    });

    it('does NOT report CON-9 when all specs have uniform auth', () => {
      const specs = [
        makeSpec('spec.book.create', { security: { authentication: 'required' }, architectures: ['core.engine'] }),
        makeSpec('spec.book.update', { security: { authentication: 'required' }, architectures: ['core.engine'] }),
        makeSpec('spec.book.delete', { security: { authentication: 'required' }, architectures: ['core.engine'] }),
      ];
      const graph = emptyGraph();
      graph.archToSpecs.set('core.engine', ['spec.book.create', 'spec.book.update', 'spec.book.delete']);

      const issues = consistencyChecker.check(makeContext(specs, {}, emptyComponentGroups(), graph));
      const con9auth = issues.filter((i) => i.id === 'CON-9' && i.message.includes('Auth'));
      expect(con9auth).toHaveLength(0);
    });

    it('does NOT report CON-9 when fewer than 3 specs share architecture', () => {
      const specs = [
        makeSpec('spec.book.create', { security: { authentication: 'required' }, architectures: ['core.engine'] }),
        makeSpec('spec.book.list', { security: { authentication: 'none' }, architectures: ['core.engine'] }),
      ];
      const graph = emptyGraph();
      graph.archToSpecs.set('core.engine', ['spec.book.create', 'spec.book.list']);

      const issues = consistencyChecker.check(makeContext(specs, {}, emptyComponentGroups(), graph));
      expect(issues.filter((i) => i.id === 'CON-9')).toHaveLength(0);
    });
  });

  describe('CON-10: Architecture mismatch (verifier bridge)', () => {
    it('warns when verifier detects architecture mismatch', () => {
      const spec = makeSpec('spec.myApp.handler', { architectures: ['core.engine'] });
      const verifierResults = new Map([
        ['spec.myApp.handler', {
          extraErrors: [],
          missingOutputs: [],
          extraOutputs: [],
          architectureMismatch: true,
          missingArchTag: 'core.engine',
          actualArchTag: 'cli.command',
        }],
      ]);
      const context: AnalysisContext = {
        specs: [spec],
        graph: emptyGraph(),
        archRegistry: {},
        componentGroups: emptyComponentGroups(),
        verifierResults,
      };
      const con10 = consistencyChecker.check(context).filter((i) => i.id === 'CON-10');
      expect(con10).toHaveLength(1);
      expect(con10[0].severity).toBe('warning');
      expect(con10[0].message).toContain('core.engine');
      expect(con10[0].message).toContain('cli.command');
    });

    it('does NOT report CON-10 without verifier results', () => {
      const spec = makeSpec('spec.myApp.handler', { architectures: ['core.engine'] });
      const issues = consistencyChecker.check(makeContext([spec]));
      expect(issues.filter((i) => i.id === 'CON-10')).toHaveLength(0);
    });
  });

  describe('CON-11: Layer leak', () => {
    it('warns when implementation path mismatches architecture layer', () => {
      const spec = makeSpec('spec.myApp.uiHelper', {
        implementation: 'src/cli/commands/helper.ts#run',
        architectures: ['core.engine'],
      } as Partial<SpecNode>);
      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.engine': { description: 'Core engine', layer: 'core', constraints: [] },
      };
      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      const con11 = issues.filter((i) => i.id === 'CON-11');
      expect(con11).toHaveLength(1);
      expect(con11[0].severity).toBe('warning');
      expect(con11[0].message).toContain('wrong layer');
    });

    it('does NOT report CON-11 when path matches layer', () => {
      const spec = makeSpec('spec.myApp.engine', {
        implementation: 'src/core/analysis/engine.ts#analyze',
        architectures: ['core.engine'],
      } as Partial<SpecNode>);
      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.engine': { description: 'Core engine', layer: 'core', constraints: [] },
      };
      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      expect(issues.filter((i) => i.id === 'CON-11')).toHaveLength(0);
    });

    it('does NOT report CON-11 without implementation path', () => {
      const spec = makeSpec('spec.myApp.noImpl', { architectures: ['core.engine'] });
      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.engine': { description: 'Core engine', layer: 'core', constraints: [] },
      };
      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      expect(issues.filter((i) => i.id === 'CON-11')).toHaveLength(0);
    });
  });

  describe('clean case', () => {
    it('returns no issues for a consistent spec', () => {
      const spec = makeSpec('spec.myApp.listItems', {
        security: { authentication: 'required' },
        architectures: ['core.engine'],
        effects: [],
      });

      const archRegistry: Record<string, Record<string, unknown>> = {
        'core.engine': {
          description: 'Core engine for business logic',
          constraints: [
            { rule: 'require_call', value: 'checkAuthToken' },
          ],
        },
      };

      const issues = consistencyChecker.check(makeContext([spec], archRegistry));
      expect(issues).toHaveLength(0);
    });
  });
});
