/**
 * @arch archcodex.test.unit
 *
 * Tests for unified context formatter.
 */
import { describe, it, expect } from 'vitest';
import { formatUnifiedContext } from '../../../../src/core/unified-context/formatter.js';
import type {
  UnifiedContext,
  UnifiedModuleContext,
  UnifiedEntityContext,
} from '../../../../src/core/unified-context/types.js';

describe('unified context formatter', () => {
  const makeModuleContext = (overrides: Partial<UnifiedModuleContext> = {}): UnifiedModuleContext => ({
    modulePath: 'src/core/audit/',
    fileCount: 3,
    lineCount: 450,
    entityCount: 0,
    files: {
      defines: [{ path: 'src/core/audit/types.ts', archId: 'archcodex.core.types', breaks: 2, role: 'defines' as const, roleReason: 'type definitions' }],
      implements: [{ path: 'src/core/audit/engine.ts', archId: 'archcodex.core.engine', breaks: 0, role: 'implements' as const }],
      orchestrates: [],
    },
    entities: [],
    consumers: [],
    archcodex: {
      architecture: 'archcodex.core.engine',
      forbid: ['commander', 'chalk'],
      patterns: ['explicit any type'],
      hints: ['Core modules should be framework-agnostic'],
    },
    ...overrides,
  });

  const makeEntityContext = (overrides: Partial<UnifiedEntityContext> = {}): UnifiedEntityContext => ({
    name: 'products',
    fields: [
      { name: 'title', type: 'string', optional: false },
      { name: 'url', type: 'string', optional: false },
      { name: 'tags', type: 'string[]', optional: true },
    ],
    relationships: [
      { name: 'project', type: 'belongs_to', target: 'projects', field: 'projectId' },
    ],
    behaviors: [
      { type: 'soft-delete', fields: ['isDeleted'] },
    ],
    operations: ['createProduct', 'updateProduct', 'deleteProduct'],
    files: {
      defines: [{ path: 'src/schema.ts', archId: 'core.schema', breaks: 0, role: 'defines' as const }],
      implements: [{ path: 'src/domain/products/mutations.ts', archId: 'core.domain', breaks: 1, role: 'implements' as const }],
      orchestrates: [],
    },
    ...overrides,
  });

  describe('compact format (default)', () => {
    it('includes module header with file and entity counts', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context);

      expect(output).toContain('src/core/audit/');
      expect(output).toContain('3 files');
      expect(output).toContain('0 entities');
    });

    it('includes modification order sections', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Modification Order');
      expect(output).toContain('DEFINES');
      expect(output).toContain('types.ts');
      expect(output).toContain('IMPLEMENTS');
      expect(output).toContain('engine.ts');
    });

    it('shows architecture constraints', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context);

      expect(output).toContain('ArchCodex');
      expect(output).toContain('archcodex.core.engine');
      expect(output).toContain('forbid: [commander, chalk]');
      expect(output).toContain('patterns: [explicit any type]');
    });

    it('shows break indicators', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context);

      // types.ts has breaks: 2 (yellow indicator)
      expect(output).toMatch(/types\.ts.*2/);
    });

    it('shows validation command footer', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context);

      expect(output).toContain('archcodex_check');
    });
  });

  describe('compact entity format', () => {
    it('includes entity name and schema', () => {
      const context: UnifiedContext = { entity: makeEntityContext() };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Entity: products');
      expect(output).toContain('title');
      expect(output).toContain('url');
    });

    it('shows relationships with short type notation', () => {
      const context: UnifiedContext = { entity: makeEntityContext() };
      const output = formatUnifiedContext(context);

      expect(output).toContain('N:1');
      expect(output).toContain('projects');
    });

    it('shows behaviors', () => {
      const context: UnifiedContext = { entity: makeEntityContext() };
      const output = formatUnifiedContext(context);

      expect(output).toContain('soft-delete');
    });

    it('shows operations', () => {
      const context: UnifiedContext = { entity: makeEntityContext() };
      const output = formatUnifiedContext(context);

      expect(output).toContain('createProduct');
      expect(output).toContain('updateProduct');
    });
  });

  describe('json format', () => {
    it('returns valid JSON', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context, { format: 'json' });
      const parsed = JSON.parse(output);

      expect(parsed.module.modulePath).toBe('src/core/audit/');
    });
  });

  describe('full format', () => {
    it('includes verbose section headers for modules', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context, { format: 'full' });

      expect(output).toContain('Module: src/core/audit/');
      expect(output).toContain('Modification Order');
    });

    it('supports markdown mode', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context, { format: 'full', markdown: true });

      expect(output).toContain('# Module: src/core/audit/');
      expect(output).toContain('## Modification Order');
    });

    it('formats entity in full mode', () => {
      const context: UnifiedContext = { entity: makeEntityContext() };
      const output = formatUnifiedContext(context, { format: 'full' });

      expect(output).toContain('Entity: products');
      expect(output).toContain('Fields');
      expect(output).toContain('Relationships');
      expect(output).toContain('Detected Behaviors');
    });
  });

  describe('interactive menu', () => {
    it('shows menu for large modules', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          fileCount: 50,
          isLargeModule: true,
          topSubmodules: [
            { path: 'src/core/audit/checks/', fileCount: 12, dominantArch: 'core.engine' },
            { path: 'src/core/audit/report/', fileCount: 8, dominantArch: 'core.domain' },
          ],
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('contains 50 files');
      expect(output).toContain('Submodules');
      expect(output).toContain('src/core/audit/checks/');
      expect(output).toContain('12 files');
      expect(output).toContain('"confirm": true');
    });
  });

  describe('summary mode', () => {
    it('shows structure table', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          isSummary: true,
          topSubmodules: [
            { path: 'src/core/audit/checks/', fileCount: 12, dominantArch: 'core.engine' },
          ],
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Structure Summary');
      expect(output).toContain('src/core/audit/checks/');
    });
  });

  describe('brief mode', () => {
    it('shows minimal info', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          isBrief: true,
          boundaries: {
            layer: 'core',
            canImport: ['utils'],
            cannotImport: ['cli'],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('@arch: archcodex.core.engine');
      expect(output).toContain('CAN import: [utils]');
      expect(output).toContain('CANNOT import: [cli]');
    });
  });

  describe('section filtering', () => {
    it('only includes requested sections', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context, {
        format: 'compact',
        sections: ['constraints'],
      });

      expect(output).toContain('ArchCodex');
      expect(output).not.toContain('Modification Order');
    });
  });

  describe('project rules', () => {
    it('shows layer hierarchy when project rules present', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          projectRules: {
            layers: [
              { name: 'utils', canImport: [] },
              { name: 'core', canImport: ['utils'] },
              { name: 'cli', canImport: ['core', 'utils'] },
            ],
            shared: {
              forbid: ['console' + '.log'],
              hints: ['Keep it simple'],
            },
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Project Rules');
      expect(output).toContain('Layer Hierarchy');
      expect(output).toContain('utils');
      expect(output).toContain('core');
      expect(output).toContain('Shared Constraints');
    });
  });
});
