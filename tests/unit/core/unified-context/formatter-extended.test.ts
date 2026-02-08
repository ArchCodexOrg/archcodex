/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Extended tests for unified context formatter - targeting uncovered branches.
 */
import { describe, it, expect } from 'vitest';
import { formatUnifiedContext } from '../../../../src/core/unified-context/formatter.js';
import type {
  UnifiedContext,
  UnifiedModuleContext,
  UnifiedEntityContext,
} from '../../../../src/core/unified-context/types.js';

describe('unified context formatter - extended coverage', () => {
  const makeModuleContext = (overrides: Partial<UnifiedModuleContext> = {}): UnifiedModuleContext => ({
    modulePath: 'src/core/audit/',
    fileCount: 3,
    lineCount: 450,
    entityCount: 0,
    files: {
      defines: [{ path: 'src/core/audit/types.ts', archId: 'archcodex.core.types', breaks: 2, role: 'defines' as const, roleReason: 'type definitions' }],
      implements: [{ path: 'src/core/audit/engine.ts', archId: 'archcodex.core.engine', breaks: 0, role: 'implements' as const }],
      orchestrates: [{ path: 'src/core/audit/handler.ts', archId: 'archcodex.cli.handler', breaks: 0, role: 'orchestrates' as const, roleReason: 'coordinates multiple components' }],
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
    ],
    relationships: [
      { name: 'project', type: 'belongs_to', target: 'projects', field: 'projectId' },
    ],
    behaviors: [
      { type: 'soft-delete', fields: ['isDeleted'] },
    ],
    operations: ['createProduct', 'updateProduct'],
    files: {
      defines: [{ path: 'src/schema.ts', archId: 'core.schema', breaks: 0, role: 'defines' as const }],
      implements: [],
      orchestrates: [],
    },
    ...overrides,
  });

  describe('compact format - boundaries section', () => {
    it('shows boundaries with canImport and cannotImport', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          boundaries: {
            layer: 'core',
            canImport: ['utils', 'validators'],
            cannotImport: ['cli', 'llm'],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('layer: core');
      expect(output).toContain('CAN import: [utils, validators]');
      expect(output).toContain('CANNOT import: [cli, llm]');
    });

    it('shows common imports when available', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          boundaries: {
            layer: 'core',
            canImport: ['utils'],
            cannotImport: [],
            commonImports: [
              { path: 'src/utils/errors.ts', exports: ['ArchCodexError', 'ErrorCodes'] },
            ],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Common: import { ArchCodexError, ErrorCodes }');
    });

    it('omits boundaries section when not in requested sections', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          boundaries: {
            layer: 'core',
            canImport: ['utils'],
            cannotImport: ['cli'],
          },
        }),
      };
      const output = formatUnifiedContext(context, {
        format: 'compact',
        sections: ['constraints'],
      });

      expect(output).not.toContain('layer: core');
    });
  });

  describe('compact format - consumers section', () => {
    it('shows consumers list', () => {
      const consumers = [
        { path: 'src/cli/commands/check.ts', archId: 'archcodex.cli.command' },
        { path: 'src/mcp/handlers/context.ts', archId: 'archcodex.cli.mcp.handler' },
      ];
      const context: UnifiedContext = {
        module: makeModuleContext({ consumers }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Impact');
      expect(output).toContain('Consumers (will break if you change exports)');
      expect(output).toContain('src/cli/commands/check.ts');
      expect(output).toContain('src/mcp/handlers/context.ts');
    });

    it('truncates consumers beyond 10 with count', () => {
      const consumers = Array.from({ length: 15 }, (_, i) => ({
        path: `src/consumer${i}.ts`,
        archId: null,
      }));
      const context: UnifiedContext = {
        module: makeModuleContext({ consumers }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('... +5 more');
    });
  });

  describe('compact format - entity schemas section', () => {
    it('shows entity schemas with relationships and behaviors', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          entityCount: 1,
          entities: [{
            name: 'bookmarks',
            fields: ['title', 'url', 'tags'],
            relationships: ['project (belongs_to)'],
            behaviors: ['soft-delete'],
            operations: ['createBookmark', 'updateBookmark'],
          }],
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Entity Schemas');
      expect(output).toContain('bookmarks:');
      expect(output).toContain('fields: [title, url, tags]');
      expect(output).toContain('rels: project (belongs_to)');
      expect(output).toContain('behaviors: soft-delete');
      expect(output).toContain('ops: createBookmark, updateBookmark');
    });

    it('shows "none" when entity has no behaviors', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          entityCount: 1,
          entities: [{
            name: 'tags',
            fields: ['name'],
            operations: [],
          }],
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('behaviors: none');
    });
  });

  describe('compact format - constraints section', () => {
    it('shows require constraints', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          archcodex: {
            architecture: 'archcodex.core.engine',
            require: ['dispose()'],
            hints: ['Keep it focused'],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('require: [dispose()]');
    });

    it('shows single hint without list format', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          archcodex: {
            architecture: 'archcodex.core.engine',
            hints: ['Single hint here'],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('hint: Single hint here');
    });

    it('shows multiple hints as list', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          archcodex: {
            architecture: 'archcodex.core.engine',
            hints: ['Hint one', 'Hint two', 'Hint three'],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('hints:');
      expect(output).toContain('  - Hint one');
      expect(output).toContain('  - Hint two');
      expect(output).toContain('  - Hint three');
    });

    it('shows no constraints label when no forbid/patterns/require', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          archcodex: {
            architecture: 'archcodex.core.engine',
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('architecture: archcodex.core.engine');
      expect(output).not.toContain('constraints:');
    });
  });

  describe('compact format - ORCHESTRATES section', () => {
    it('shows orchestrates files', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context);

      expect(output).toContain('ORCHESTRATES');
      expect(output).toContain('handler.ts');
    });
  });

  describe('compact format - file break indicators', () => {
    it('shows red indicator for 3+ breaks', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          files: {
            defines: [{ path: 'types.ts', archId: 'core.types', breaks: 5, role: 'defines' as const, roleReason: 'types' }],
            implements: [],
            orchestrates: [],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('5');
    });

    it('shows no indicator for 0 breaks', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          files: {
            defines: [{ path: 'types.ts', archId: 'core.types', breaks: 0, role: 'defines' as const }],
            implements: [],
            orchestrates: [],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      // Should not have break indicator characters around types.ts
      const typesLine = output.split('\n').find(l => l.includes('types.ts'));
      expect(typesLine).toBeDefined();
      expect(typesLine).not.toMatch(/\d+.*types\.ts/);
    });

    it('shows [no @arch] for files without archId', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          files: {
            defines: [{ path: 'types.ts', archId: null, breaks: 0, role: 'defines' as const }],
            implements: [],
            orchestrates: [],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('[no @arch]');
    });
  });

  describe('full format - verbose sections', () => {
    it('includes full file info with role reasons in non-markdown', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context, { format: 'full' });

      expect(output).toContain('DEFINES');
      expect(output).toContain('type definitions');
    });

    it('includes full file info with role reasons in markdown', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context, { format: 'full', markdown: true });

      expect(output).toContain('### DEFINES');
      expect(output).toContain('type definitions');
    });

    it('shows boundaries in full format', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          boundaries: {
            layer: 'core',
            canImport: ['utils'],
            cannotImport: ['cli'],
          },
        }),
      };
      const output = formatUnifiedContext(context, { format: 'full' });

      expect(output).toContain('Layer Boundaries');
      expect(output).toContain('Layer: core');
    });

    it('shows entities in full format without markdown', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          entityCount: 1,
          entities: [{
            name: 'users',
            fields: ['name', 'email'],
            relationships: ['org (belongs_to)'],
            behaviors: ['soft-delete'],
            operations: ['createUser'],
          }],
        }),
      };
      const output = formatUnifiedContext(context, { format: 'full' });

      expect(output).toContain('users:');
      expect(output).toContain('Fields: name, email');
      expect(output).toContain('Relationships: org (belongs_to)');
      expect(output).toContain('Behaviors: soft-delete');
      expect(output).toContain('Operations: createUser');
    });

    it('shows entities in full format with markdown', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          entityCount: 1,
          entities: [{
            name: 'users',
            fields: ['name'],
            operations: [],
          }],
        }),
      };
      const output = formatUnifiedContext(context, { format: 'full', markdown: true });

      expect(output).toContain('### users');
      expect(output).toContain('## Entity Schemas');
    });

    it('shows consumers with archId in full format', () => {
      const consumers = [
        { path: 'src/cli/check.ts', archId: 'archcodex.cli.command' },
      ];
      const context: UnifiedContext = {
        module: makeModuleContext({ consumers }),
      };
      const output = formatUnifiedContext(context, { format: 'full', markdown: true });

      expect(output).toContain('## External Consumers');
      expect(output).toContain('src/cli/check.ts');
      expect(output).toContain('[archcodex.cli.command]');
    });

    it('shows consumers without archId in full non-markdown format', () => {
      const consumers = [
        { path: 'src/other/file.ts', archId: null },
      ];
      const context: UnifiedContext = {
        module: makeModuleContext({ consumers }),
      };
      const output = formatUnifiedContext(context, { format: 'full' });

      expect(output).toContain('External Consumers');
      expect(output).toContain('src/other/file.ts');
    });

    it('shows constraints in full non-markdown format', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          archcodex: {
            architecture: 'archcodex.core.engine',
            forbid: ['commander'],
            patterns: ['explicit any'],
            require: ['dispose()'],
            hints: ['Keep focused'],
          },
        }),
      };
      const output = formatUnifiedContext(context, { format: 'full' });

      expect(output).toContain('ArchCodex Constraints');
      expect(output).toContain('Architecture: archcodex.core.engine');
      expect(output).toContain('Forbid: commander');
      expect(output).toContain('Patterns: explicit any');
      expect(output).toContain('Require: dispose()');
      expect(output).toContain('Hint: Keep focused');
    });

    it('shows multiple hints in full format', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          archcodex: {
            architecture: 'archcodex.core.engine',
            hints: ['Hint A', 'Hint B'],
          },
        }),
      };
      const output = formatUnifiedContext(context, { format: 'full' });

      expect(output).toContain('Hints:');
      expect(output).toContain('  - Hint A');
      expect(output).toContain('  - Hint B');
    });

    it('shows project rules in full non-markdown', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          projectRules: {
            layers: [
              { name: 'utils', canImport: [] },
              { name: 'core', canImport: ['utils'] },
            ],
            shared: {
              forbid: ['chalk'],
              patterns: ['console.log'],
              hints: ['SRP', 'KISS'],
            },
          },
        }),
      };
      const output = formatUnifiedContext(context, { format: 'full' });

      expect(output).toContain('Project Rules');
      expect(output).toContain('Shared Constraints:');
      expect(output).toContain('Forbid: chalk');
      expect(output).toContain('Patterns: console.log');
      expect(output).toContain('Hints: SRP; KISS');
    });

    it('shows project rules in full markdown', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          projectRules: {
            layers: [
              { name: 'utils', canImport: [] },
            ],
          },
        }),
      };
      const output = formatUnifiedContext(context, { format: 'full', markdown: true });

      expect(output).toContain('## Project Rules');
    });

    it('handles full format with section filtering', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          boundaries: {
            layer: 'core',
            canImport: ['utils'],
            cannotImport: ['cli'],
          },
        }),
      };
      const output = formatUnifiedContext(context, { format: 'full', sections: ['boundaries'] });

      expect(output).toContain('Layer Boundaries');
      expect(output).not.toContain('Modification Order');
    });

    it('shows break indicator in full markdown format', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          files: {
            defines: [{ path: 'types.ts', archId: 'core.types', breaks: 4, role: 'defines' as const, roleReason: 'types' }],
            implements: [],
            orchestrates: [],
          },
        }),
      };
      const output = formatUnifiedContext(context, { format: 'full', markdown: true });

      expect(output).toContain('breaks: 4');
    });
  });

  describe('full entity format', () => {
    it('formats entity with markdown', () => {
      const context: UnifiedContext = { entity: makeEntityContext() };
      const output = formatUnifiedContext(context, { format: 'full', markdown: true });

      expect(output).toContain('Entity: products');
    });
  });

  describe('available actions footer', () => {
    it('shows excluded sections hint when not all sections included', () => {
      const context: UnifiedContext = { module: makeModuleContext() };
      const output = formatUnifiedContext(context, {
        format: 'compact',
        sections: ['constraints', 'modification-order'],
      });

      expect(output).toContain('Excluded:');
      expect(output).toContain('Request specific sections');
    });

    it('shows submodule suggestions for large modules', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          fileCount: 80,
          topSubmodules: [
            { path: 'src/core/audit/checks/', fileCount: 20 },
            { path: 'src/core/audit/report/', fileCount: 15 },
            { path: 'src/core/audit/utils/', fileCount: 10 },
            { path: 'src/core/audit/extra/', fileCount: 5 },
          ],
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Large module (80 files)');
      expect(output).toContain('src/core/audit/checks/');
    });

    it('shows parent module tip for deeply nested modules', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          modulePath: 'src/core/audit/checks/',
          fileCount: 5,
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('For broader context');
      expect(output).toContain('src/core/audit/');
    });

    it('shows entity suggestions when entities exist', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          entityCount: 2,
          entities: [
            { name: 'bookmarks', fields: ['title'], operations: [] },
            { name: 'tags', fields: ['name'], operations: [] },
          ],
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('For entity details');
      expect(output).toContain('"bookmarks"');
    });
  });

  describe('project rules compact format', () => {
    it('shows layer hierarchy with leaf layers', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          projectRules: {
            layers: [
              { name: 'utils', canImport: [] },
            ],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('utils');
      expect(output).toContain('(leaf)');
    });

    it('shows shared forbid constraints', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          projectRules: {
            layers: [],
            shared: {
              forbid: ['commander', 'chalk'],
            },
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('forbid: commander, chalk');
    });

    it('shows shared patterns', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          projectRules: {
            layers: [],
            shared: {
              patterns: ['console.log', 'explicit any'],
            },
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('patterns: console.log, explicit any');
    });

    it('truncates shared hints beyond 3', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          projectRules: {
            layers: [],
            shared: {
              hints: ['Hint 1', 'Hint 2', 'Hint 3', 'Hint 4', 'Hint 5'],
            },
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Hint 1');
      expect(output).toContain('Hint 3');
      expect(output).toContain('+2 more hints');
    });
  });

  describe('summary mode - extended', () => {
    it('shows project rules layer boundaries in summary', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          isSummary: true,
          projectRules: {
            layers: [
              { name: 'utils', canImport: [] },
              { name: 'core', canImport: ['utils'] },
            ],
            shared: {
              forbid: ['chalk'],
              patterns: ['console.log'],
            },
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Layer Boundaries');
      expect(output).toContain('Shared Constraints');
      expect(output).toContain('forbid: chalk');
    });

    it('shows submodule with mixed architecture', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          isSummary: true,
          topSubmodules: [
            { path: 'src/core/audit/checks/', fileCount: 5 },
          ],
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('(mixed)');
    });

    it('includes full output option in summary', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          isSummary: true,
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('"confirm": true');
    });
  });

  describe('brief mode - extended', () => {
    it('shows forbidden items from forbid and patterns', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          isBrief: true,
          boundaries: {
            layer: 'core',
            canImport: ['utils'],
            cannotImport: ['cli'],
          },
          archcodex: {
            architecture: 'archcodex.core.engine',
            forbid: ['commander'],
            patterns: ['explicit any'],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Forbidden: commander, explicit any');
    });

    it('shows common imports in brief', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          isBrief: true,
          boundaries: {
            layer: 'core',
            canImport: ['utils'],
            cannotImport: [],
            commonImports: [
              { path: 'src/utils/errors.ts', exports: ['ArchCodexError'] },
            ],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Common:');
      expect(output).toContain("import { ArchCodexError } from '../../utils/errors.js'");
    });

    it('shows full context link in brief footer', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          isBrief: true,
          boundaries: {
            layer: 'core',
            canImport: [],
            cannotImport: [],
          },
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('Full context:');
      expect(output).toContain('src/core/audit/');
    });
  });

  describe('interactive menu - extended', () => {
    it('shows archInfo for submodules with dominant architecture', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          isLargeModule: true,
          fileCount: 50,
          topSubmodules: [
            { path: 'src/core/db/repos/', fileCount: 10, dominantArch: 'core.domain' },
          ],
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('core.domain');
    });

    it('shows summary option in interactive menu', () => {
      const context: UnifiedContext = {
        module: makeModuleContext({
          isLargeModule: true,
          fileCount: 100,
          topSubmodules: [],
        }),
      };
      const output = formatUnifiedContext(context);

      expect(output).toContain('"summary": true');
    });
  });
});
