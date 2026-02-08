/**
 * @arch archcodex.test.unit
 */
import { describe, it, expect } from 'vitest';
import {
  formatEntityResults,
  formatArchitectureResults,
  formatImportGraph,
  formatOverview,
  formatModuleContext,
} from '../../../../src/core/db/formatters.js';

describe('formatEntityResults', () => {
  it('should format entity results with files (compact)', () => {
    const result = formatEntityResults('UserService', [
      { path: 'src/services/user.ts', archId: 'archcodex.core.domain', refType: 'type', lineNumber: 10 },
    ]);
    expect(result).toContain('UserService');
    expect(result).toContain('src/services/user.ts');
    expect(result).toContain('1 file');
  });

  it('should handle empty results', () => {
    const result = formatEntityResults('UnknownEntity', []);
    expect(result).toContain('UnknownEntity');
    expect(result).toContain('No files');
  });

  it('should support full verbose output', () => {
    const result = formatEntityResults('UserService', [
      { path: 'src/services/user.ts', archId: 'archcodex.core.domain', refType: 'type', lineNumber: 10 },
    ], { full: true });
    expect(result).toContain('Entity: UserService');
    expect(result).toContain('(type)');
    expect(result).toContain('archcodex.core.domain');
  });

  it('should support markdown output with full', () => {
    const result = formatEntityResults('UserService', [
      { path: 'src/services/user.ts', archId: 'archcodex.core.domain', refType: 'type', lineNumber: 10 },
    ], { markdown: true, full: true });
    expect(result).toContain('# Files Related to Entity');
    expect(result).toContain('## archcodex.core.domain');
  });

  it('should group files by architecture', () => {
    const result = formatEntityResults('UserService', [
      { path: 'src/a.ts', archId: 'arch.one', refType: 'type', lineNumber: 1 },
      { path: 'src/b.ts', archId: 'arch.two', refType: 'type', lineNumber: 2 },
      { path: 'src/c.ts', archId: 'arch.one', refType: 'type', lineNumber: 3 },
    ]);
    expect(result).toContain('arch.one');
    expect(result).toContain('arch.two');
  });

  it('should handle files with no arch tag (compact shows untagged)', () => {
    const result = formatEntityResults('UserService', [
      { path: 'src/a.ts', archId: null, refType: 'type', lineNumber: 1 },
    ]);
    expect(result).toContain('(untagged)');
  });

  it('should handle files with no arch tag (full shows no @arch tag)', () => {
    const result = formatEntityResults('UserService', [
      { path: 'src/a.ts', archId: null, refType: 'type', lineNumber: 1 },
    ], { full: true });
    expect(result).toContain('(untagged)');
  });
});

describe('formatArchitectureResults', () => {
  it('should format architecture results (compact)', () => {
    const result = formatArchitectureResults('archcodex.core.domain', [
      { path: 'src/core/user.ts', lineCount: 100 },
    ]);
    expect(result).toContain('archcodex.core.domain');
    expect(result).toContain('src/core/user.ts');
    expect(result).toContain('1 file');
  });

  it('should handle empty results', () => {
    const result = formatArchitectureResults('archcodex.unknown', []);
    expect(result).toContain('No files');
  });

  it('should support full verbose output', () => {
    const result = formatArchitectureResults('archcodex.core.domain', [
      { path: 'src/core/user.ts', lineCount: 100 },
    ], { full: true });
    expect(result).toContain('Architecture: archcodex.core.domain');
    expect(result).toContain('(100 lines)');
    expect(result).toContain('Total: 1 file');
  });

  it('should support markdown output with full', () => {
    const result = formatArchitectureResults('archcodex.core.domain', [
      { path: 'src/core/user.ts', lineCount: 100 },
    ], { markdown: true, full: true });
    expect(result).toContain('# Files in Architecture');
  });

  it('should not show line counts in compact mode', () => {
    const result = formatArchitectureResults('test.arch', [
      { path: 'src/a.ts', lineCount: 10 },
      { path: 'src/b.ts', lineCount: 20 },
    ]);
    expect(result).not.toContain('lines');
  });

  it('should show file count in full mode', () => {
    const result = formatArchitectureResults('test.arch', [
      { path: 'src/a.ts', lineCount: 10 },
      { path: 'src/b.ts', lineCount: 20 },
    ], { full: true });
    expect(result).toContain('Total: 2 files');
  });
});

describe('formatImportGraph', () => {
  it('should format import graph (compact)', () => {
    const result = formatImportGraph(
      'src/index.ts',
      { archId: 'archcodex.core.barrel' },
      { imports: [], importedBy: [] },
      [],
      []
    );
    expect(result).toContain('src/index.ts');
    expect(result).toContain('Imports (0)');
    expect(result).toContain('Imported by (0)');
  });

  it('should handle null file info', () => {
    const result = formatImportGraph(
      'src/unknown.ts',
      null,
      { imports: [], importedBy: [] },
      [],
      []
    );
    expect(result).toContain('src/unknown.ts');
    expect(result).toContain('(none)');
  });

  it('should show transitive dependencies only in full mode', () => {
    const compactResult = formatImportGraph(
      'src/index.ts',
      { archId: 'test' },
      { imports: [{ path: 'src/a.ts', archId: 'test' }], importedBy: [] },
      ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      []
    );
    expect(compactResult).not.toContain('Transitive Dependencies');

    const fullResult = formatImportGraph(
      'src/index.ts',
      { archId: 'test' },
      { imports: [{ path: 'src/a.ts', archId: 'test' }], importedBy: [] },
      ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      [],
      { full: true }
    );
    expect(fullResult).toContain('Transitive Dependencies');
    expect(fullResult).toContain('src/b.ts');
  });

  it('should show transitive importers only in full mode', () => {
    const compactResult = formatImportGraph(
      'src/index.ts',
      { archId: 'test' },
      { imports: [], importedBy: [{ path: 'src/x.ts', archId: 'test' }] },
      [],
      ['src/x.ts', 'src/y.ts', 'src/z.ts']
    );
    expect(compactResult).not.toContain('Transitive Dependents');

    const fullResult = formatImportGraph(
      'src/index.ts',
      { archId: 'test' },
      { imports: [], importedBy: [{ path: 'src/x.ts', archId: 'test' }] },
      [],
      ['src/x.ts', 'src/y.ts', 'src/z.ts'],
      { full: true }
    );
    expect(fullResult).toContain('Transitive Dependents');
    expect(fullResult).toContain('src/y.ts');
  });

  it('should support markdown output with full', () => {
    const result = formatImportGraph(
      'src/index.ts',
      { archId: 'test' },
      { imports: [{ path: 'src/a.ts', archId: 'test' }], importedBy: [] },
      [],
      [],
      { markdown: true, full: true }
    );
    expect(result).toContain('# Import Graph');
    expect(result).toContain('**Architecture**');
  });
});

describe('formatOverview', () => {
  it('should format overview (compact)', () => {
    const result = formatOverview(
      [{ archId: 'archcodex.core.domain', fileCount: 5 }],
      { fileCount: 10, importCount: 20, entityRefCount: 30, lastScan: '2024-01-01' }
    );
    expect(result).toContain('archcodex.core.domain');
    expect(result).toContain('5');
    expect(result).toContain('10 files');
  });

  it('should handle empty summary', () => {
    const result = formatOverview(
      [],
      { fileCount: 0, importCount: 0, entityRefCount: 0, lastScan: null }
    );
    expect(result).toContain('No files with @arch tags found');
  });

  it('should support full verbose output', () => {
    const result = formatOverview(
      [{ archId: 'archcodex.core.domain', fileCount: 5 }],
      { fileCount: 10, importCount: 20, entityRefCount: 30, lastScan: '2024-01-01' },
      { full: true }
    );
    expect(result).toContain('Architecture Map Overview');
    expect(result).toContain('Total files tracked: 10');
    expect(result).toContain('Query Options');
  });

  it('should support markdown output with full', () => {
    const result = formatOverview(
      [{ archId: 'archcodex.core.domain', fileCount: 5 }],
      { fileCount: 10, importCount: 20, entityRefCount: 30, lastScan: '2024-01-01' },
      { markdown: true, full: true }
    );
    expect(result).toContain('# Architecture Map Overview');
    expect(result).toContain('**Total files tracked**');
  });

  it('should not show query options in compact mode', () => {
    const result = formatOverview(
      [{ archId: 'test', fileCount: 1 }],
      { fileCount: 1, importCount: 0, entityRefCount: 0, lastScan: '2024-01-15T10:00:00Z' }
    );
    expect(result).not.toContain('Query Options');
  });

  it('should show last scan date in full mode', () => {
    const result = formatOverview(
      [{ archId: 'test', fileCount: 1 }],
      { fileCount: 1, importCount: 0, entityRefCount: 0, lastScan: '2024-01-15T10:00:00Z' },
      { full: true }
    );
    expect(result).toContain('2024-01-15');
  });
});

describe('formatModuleContext', () => {
  it('should format module with files (compact)', () => {
    const result = formatModuleContext({
      modulePath: 'src/core/db/',
      files: [
        { path: 'src/core/db/manager.ts', archId: 'archcodex.core.engine', lineCount: 100 },
        { path: 'src/core/db/schema.ts', archId: 'archcodex.core.engine', lineCount: 50 },
      ],
      internalImports: [
        { from: 'src/core/db/manager.ts', to: 'src/core/db/schema.ts' },
      ],
      externalDeps: [
        { path: 'src/utils/file-system.ts', archId: 'archcodex.util' },
      ],
      externalConsumers: [
        { path: 'src/cli/commands/map.ts', archId: 'archcodex.cli.command' },
      ],
      entities: [
        { name: 'Database', count: 5 },
      ],
    });
    expect(result).toContain('src/core/db/');
    expect(result).toContain('2 files');
    expect(result).toContain('150 lines');
    // Compact mode doesn't show internal deps or entities
    expect(result).not.toContain('Internal Dependencies');
    expect(result).not.toContain('Database');
    // But does show external deps/consumers
    expect(result).toContain('Dependencies');
    expect(result).toContain('Used by');
  });

  it('should show full details in full mode', () => {
    const result = formatModuleContext({
      modulePath: 'src/core/db/',
      files: [
        { path: 'src/core/db/manager.ts', archId: 'archcodex.core.engine', lineCount: 100 },
      ],
      internalImports: [
        { from: 'src/core/db/manager.ts', to: 'src/core/db/schema.ts' },
      ],
      externalDeps: [],
      externalConsumers: [],
      entities: [
        { name: 'Database', count: 5 },
      ],
    }, { full: true });
    expect(result).toContain('Internal Dependencies');
    expect(result).toContain('Entities Referenced');
    expect(result).toContain('Database');
  });

  it('should handle empty module (compact)', () => {
    const result = formatModuleContext({
      modulePath: 'nonexistent/',
      files: [],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    });
    expect(result).toContain('not found');
  });

  it('should handle empty module (full mode shows tips)', () => {
    const result = formatModuleContext({
      modulePath: 'nonexistent/',
      files: [],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    }, { full: true });
    expect(result).toContain('Module Not Found');
    expect(result).toContain('No files found');
    expect(result).toContain('Tips');
  });

  it('should show available modules when provided', () => {
    const result = formatModuleContext({
      modulePath: 'nonexistent/',
      files: [],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    }, { availableModules: ['src/core/', 'src/cli/', 'src/utils/'] });
    expect(result).toContain('Available');
    expect(result).toContain('src/core/');
    expect(result).toContain('src/cli/');
  });

  it('should support markdown output with full', () => {
    const result = formatModuleContext({
      modulePath: 'src/core/db/',
      files: [
        { path: 'src/core/db/manager.ts', archId: 'archcodex.core.engine', lineCount: 100 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    }, { markdown: true, full: true });
    expect(result).toContain('# Module:');
    expect(result).toContain('**');
  });

  it('should format empty module with markdown and full', () => {
    const result = formatModuleContext({
      modulePath: 'nonexistent/',
      files: [],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    }, { markdown: true, full: true });
    expect(result).toContain('# Module Not Found');
    expect(result).toContain('**Tips:**');
  });

  it('should limit available modules in compact mode', () => {
    const manyModules = Array.from({ length: 15 }, (_, i) => `src/module${i}/`);
    const result = formatModuleContext({
      modulePath: 'nonexistent/',
      files: [],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    }, { availableModules: manyModules });
    expect(result).toContain('+10 more');
  });

  it('should limit available modules to 10 in full mode', () => {
    const manyModules = Array.from({ length: 15 }, (_, i) => `src/module${i}/`);
    const result = formatModuleContext({
      modulePath: 'nonexistent/',
      files: [],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    }, { availableModules: manyModules, full: true });
    expect(result).toContain('... and 5 more');
  });

  it('should limit entities to 15 in full mode', () => {
    const manyEntities = Array.from({ length: 20 }, (_, i) => ({ name: `Entity${i}`, count: i }));
    const result = formatModuleContext({
      modulePath: 'src/core/',
      files: [{ path: 'src/core/test.ts', archId: 'test', lineCount: 10 }],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: manyEntities,
    }, { full: true });
    expect(result).toContain('... and 5 more');
  });

  it('should group files by architecture', () => {
    const result = formatModuleContext({
      modulePath: 'src/core/',
      files: [
        { path: 'src/core/a.ts', archId: 'arch.one', lineCount: 10 },
        { path: 'src/core/b.ts', archId: 'arch.two', lineCount: 20 },
        { path: 'src/core/c.ts', archId: 'arch.one', lineCount: 30 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    });
    expect(result).toContain('arch.one');
    expect(result).toContain('arch.two');
  });

  it('should handle files with no arch tag', () => {
    const result = formatModuleContext({
      modulePath: 'src/core/',
      files: [
        { path: 'src/core/a.ts', archId: null, lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    });
    expect(result).toContain('(untagged)');
  });

  // Role-based grouping tests
  describe('role-based grouping', () => {
    it('should display files grouped by role when hasRoles is true', () => {
      const result = formatModuleContext({
        modulePath: 'src/core/db/',
        files: [
          { path: 'src/core/db/types.ts', archId: 'core.types', lineCount: 50, role: 'defines', roleReason: 'type definitions' },
          { path: 'src/core/db/repository.ts', archId: 'core.engine', lineCount: 100, role: 'implements', roleReason: 'repository - data access' },
          { path: 'src/core/db/scanner.ts', archId: 'core.engine', lineCount: 200, role: 'orchestrates', roleReason: 'coordinates multiple components' },
        ],
        internalImports: [],
        externalDeps: [],
        externalConsumers: [],
        entities: [],
        hasRoles: true,
      });
      expect(result).toContain('DEFINES');
      expect(result).toContain('IMPLEMENTS');
      expect(result).toContain('ORCHESTRATES');
      expect(result).toContain('type definitions');
      expect(result).toContain('repository - data access');
      expect(result).toContain('coordinates multiple components');
    });

    it('should show role hints in compact mode', () => {
      const result = formatModuleContext({
        modulePath: 'src/core/db/',
        files: [
          { path: 'src/core/db/types.ts', archId: 'core.types', lineCount: 50, role: 'defines', roleReason: 'type definitions' },
        ],
        internalImports: [],
        externalDeps: [],
        externalConsumers: [],
        entities: [],
        hasRoles: true,
      });
      expect(result).toContain('modify first');
    });

    it('should show external consumers in CONSUMES section when hasRoles is true', () => {
      const result = formatModuleContext({
        modulePath: 'src/core/db/',
        files: [
          { path: 'src/core/db/types.ts', archId: 'core.types', lineCount: 50, role: 'defines', roleReason: 'type definitions' },
        ],
        internalImports: [],
        externalDeps: [],
        externalConsumers: [
          { path: 'src/cli/commands/map.ts', archId: 'cli.command' },
        ],
        entities: [],
        hasRoles: true,
      });
      expect(result).toContain('CONSUMES');
      expect(result).toContain('src/cli/commands/map.ts');
    });

    it('should fall back to architecture grouping when hasRoles is false', () => {
      const result = formatModuleContext({
        modulePath: 'src/core/db/',
        files: [
          { path: 'src/core/db/types.ts', archId: 'core.types', lineCount: 50 },
          { path: 'src/core/db/manager.ts', archId: 'core.engine', lineCount: 100 },
        ],
        internalImports: [],
        externalDeps: [],
        externalConsumers: [],
        entities: [],
        hasRoles: false,
      });
      expect(result).not.toContain('DEFINES');
      expect(result).toContain('core.types');
      expect(result).toContain('core.engine');
    });

    it('should show line counts in full mode with roles', () => {
      const result = formatModuleContext({
        modulePath: 'src/core/db/',
        files: [
          { path: 'src/core/db/types.ts', archId: 'core.types', lineCount: 50, role: 'defines', roleReason: 'type definitions' },
        ],
        internalImports: [],
        externalDeps: [],
        externalConsumers: [],
        entities: [],
        hasRoles: true,
      }, { full: true });
      expect(result).toContain('(50 lines)');
    });

    it('should order roles correctly: defines, implements, orchestrates', () => {
      const result = formatModuleContext({
        modulePath: 'src/core/db/',
        files: [
          { path: 'src/core/db/scanner.ts', archId: 'core.engine', lineCount: 200, role: 'orchestrates', roleReason: 'orchestrator' },
          { path: 'src/core/db/repository.ts', archId: 'core.engine', lineCount: 100, role: 'implements', roleReason: 'impl' },
          { path: 'src/core/db/types.ts', archId: 'core.types', lineCount: 50, role: 'defines', roleReason: 'types' },
        ],
        internalImports: [],
        externalDeps: [],
        externalConsumers: [],
        entities: [],
        hasRoles: true,
      });
      const definesIndex = result.indexOf('DEFINES');
      const implementsIndex = result.indexOf('IMPLEMENTS');
      const orchestratesIndex = result.indexOf('ORCHESTRATES');
      expect(definesIndex).toBeLessThan(implementsIndex);
      expect(implementsIndex).toBeLessThan(orchestratesIndex);
    });

    it('should show @arch tag compliance indicator', () => {
      const result = formatModuleContext({
        modulePath: 'src/core/db/',
        files: [
          { path: 'src/core/db/types.ts', archId: 'core.types', lineCount: 50, role: 'defines', roleReason: 'types' },
          { path: 'src/core/db/untagged.ts', archId: null, lineCount: 30, role: 'implements', roleReason: 'impl' },
        ],
        internalImports: [],
        externalDeps: [],
        externalConsumers: [],
        entities: [],
        hasRoles: true,
      });
      expect(result).toContain('[core.types]');
      expect(result).toContain('[no @arch]');
    });

    it('should show change impact indicator', () => {
      const result = formatModuleContext({
        modulePath: 'src/core/db/',
        files: [
          {
            path: 'src/core/db/types.ts',
            archId: 'core.types',
            lineCount: 50,
            role: 'defines',
            roleReason: 'types',
            impact: { directDependents: 5, impactChain: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'] },
          },
        ],
        internalImports: [],
        externalDeps: [],
        externalConsumers: [],
        entities: [],
        hasRoles: true,
      });
      expect(result).toContain('breaks: 5');
    });

    it('should show dependency direction indicators', () => {
      const result = formatModuleContext({
        modulePath: 'src/core/db/',
        files: [
          {
            path: 'src/core/db/scanner.ts',
            archId: 'core.engine',
            lineCount: 200,
            role: 'orchestrates',
            roleReason: 'coordinator',
            dependencies: { external: 3, internal: 4 },
          },
        ],
        internalImports: [],
        externalDeps: [],
        externalConsumers: [],
        entities: [],
        hasRoles: true,
      }, { full: true });
      expect(result).toContain('↑3 ext');
      expect(result).toContain('↔4 int');
    });

    it('should show impact chain in full mode for high-impact files', () => {
      const result = formatModuleContext({
        modulePath: 'src/core/db/',
        files: [
          {
            path: 'src/core/db/schema.ts',
            archId: 'core.engine',
            lineCount: 100,
            role: 'defines',
            roleReason: 'schema',
            impact: { directDependents: 4, impactChain: ['manager.ts', 'scanner.ts', 'map.ts', 'handler.ts'] },
          },
        ],
        internalImports: [],
        externalDeps: [],
        externalConsumers: [],
        entities: [],
        hasRoles: true,
      }, { full: true });
      expect(result).toContain('→ manager.ts');
      expect(result).toContain('scanner.ts');
    });
  });
});
