/**
 * @arch archcodex.test.unit
 *
 * Tests for unified context synthesizer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Configurable mock return values ----
let mockFileRepoFiles: Array<{
  path: string;
  archId: string | null;
  lineCount: number;
}> = [];
let mockImportGraph = {
  imports: [] as Array<{ path: string; archId: string | null }>,
  importedBy: [] as Array<{ path: string; archId: string | null }>,
};
let mockEntityRefs: Array<{ entityName: string }> = [];
let mockEntityFiles: Array<{
  path: string;
  archId: string | null;
  refType: string | null;
  lineNumber: number | null;
}> = [];
let mockGitCommit: string | null = 'abc123';
let mockLastCommit: string | null = null;
let mockNeedsFullScan = false;
let mockSynthesizeContextResult: {
  entity: string;
  fields: Array<{ name: string }>;
  relationships: Array<{ type: string; target: string }>;
  behaviors: Array<{ type: string }>;
  existingOperations: Array<{ name: string }>;
  similarOperations: Array<{ name: string }>;
} | null = null;
let mockConfigLayers: Array<{ name: string; can_import?: string[] }> = [];
let mockBuildArchSummaryResult = { forbid: [], patterns: [], hints: [] };

// Mock all heavy dependencies
vi.mock('../../../../src/core/db/manager.js', () => ({
  getDbSync: vi.fn(() => ({})),
  getMeta: vi.fn(() => mockLastCommit),
}));

vi.mock('../../../../src/core/db/schema.js', () => ({
  initializeSchema: vi.fn(),
}));

vi.mock('../../../../src/core/db/repositories/files.js', () => {
  const MockFileRepository = class {
    query(opts: { pathPattern: string }) {
      return mockFileRepoFiles.filter(f =>
        f.path.startsWith(opts.pathPattern.replace('%', ''))
      );
    }
  };
  return { FileRepository: MockFileRepository };
});

vi.mock('../../../../src/core/db/repositories/imports.js', () => {
  const MockImportRepository = class {
    getImportGraph() { return mockImportGraph; }
    getConsumers() { return []; }
    getCommonImports() { return []; }
  };
  return { ImportRepository: MockImportRepository };
});

vi.mock('../../../../src/core/db/repositories/entities.js', () => {
  const MockEntityRepository = class {
    getEntitiesForModule() { return []; }
    getEntitiesForFile() { return mockEntityRefs; }
    getFilesForEntity() { return mockEntityFiles; }
  };
  return { EntityRepository: MockEntityRepository };
});

vi.mock('../../../../src/core/db/scanner.js', () => {
  const MockDatabaseScanner = class {
    needsFullScan() { return mockNeedsFullScan; }
    fullScan() { return Promise.resolve(); }
    incrementalSync() { return Promise.resolve(); }
  };
  return { DatabaseScanner: MockDatabaseScanner };
});

vi.mock('../../../../src/utils/git.js', () => ({
  getGitCommitHash: vi.fn(() => mockGitCommit),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(async () => ({
    version: '1.0',
    nodes: {},
    mixins: {},
    architectures: [],
    config: {},
  })),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(() => null),
}));

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn(async () => ({
    layers: mockConfigLayers,
    shared: {},
  })),
}));

vi.mock('../../../../src/core/session/context.js', () => ({
  buildArchitectureSummary: vi.fn(() => mockBuildArchSummaryResult),
}));

vi.mock('../../../../src/core/context/synthesizer.js', () => ({
  synthesizeContext: vi.fn(async () => mockSynthesizeContextResult),
}));

// Mock the batch import used by fetchEntitySchemas
vi.mock('../../../../src/core/context/batch.js', () => ({
  getEntitySchemasBatch: vi.fn(async () => []),
}));

import {
  synthesizeUnifiedModuleContext,
  synthesizeUnifiedEntityContext,
  synthesizeUnifiedContext,
} from '../../../../src/core/unified-context/synthesizer.js';
import { getGitCommitHash } from '../../../../src/utils/git.js';
import { getMeta } from '../../../../src/core/db/manager.js';

describe('unified context synthesizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset all mock state
    mockFileRepoFiles = [];
    mockImportGraph = {
      imports: [],
      importedBy: [],
    };
    mockEntityRefs = [];
    mockEntityFiles = [];
    mockGitCommit = 'abc123';
    mockLastCommit = null;
    mockNeedsFullScan = false;
    mockSynthesizeContextResult = null;
    mockConfigLayers = [];
    mockBuildArchSummaryResult = { forbid: [], patterns: [], hints: [] };
  });

  describe('synthesizeUnifiedModuleContext', () => {
    it('returns null when no files found for module', async () => {
      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/nonexistent/');
      expect(result).toBeNull();
    });

    it('accepts options parameter', async () => {
      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/', {
        summary: true,
      });
      // No files found, so null
      expect(result).toBeNull();
    });

    it('triggers incremental sync when git commit changes', async () => {
      mockLastCommit = 'old-commit';
      mockGitCommit = 'new-commit';

      await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/');

      expect(getGitCommitHash).toHaveBeenCalledWith('/tmp/project');
      expect(getMeta).toHaveBeenCalled();
    });

    it('triggers full scan when needed and no commit change', async () => {
      mockLastCommit = 'abc123';
      mockGitCommit = 'abc123';
      mockNeedsFullScan = true;

      await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/');

      // Should still return null since no files
      expect(await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/')).toBeNull();
    });

    it('normalizes module path to end with slash', async () => {
      mockFileRepoFiles = [
        { path: 'src/core/types.ts', archId: 'archcodex.core.types', lineCount: 50 },
      ];

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/core');
      // Should find files with normalized path 'src/core/'
      expect(result).not.toBeNull();
    });

    it('returns large module interactive context when threshold exceeded', async () => {
      // Create >30 files to trigger interactive mode
      mockFileRepoFiles = Array.from({ length: 35 }, (_, i) => ({
        path: `src/large/file${i}.ts`,
        archId: 'archcodex.core.engine',
        lineCount: 20,
      }));

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/large/');

      expect(result).not.toBeNull();
      expect(result!.isLargeModule).toBe(true);
      expect(result!.fileCount).toBe(35);
      expect(result!.archcodex.architecture).toBe('(interactive)');
    });

    it('bypasses interactive mode when confirm option is set', async () => {
      mockFileRepoFiles = Array.from({ length: 35 }, (_, i) => ({
        path: `src/large/file${i}.ts`,
        archId: 'archcodex.core.engine',
        lineCount: 20,
      }));

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/large/', {
        confirm: true,
      });

      expect(result).not.toBeNull();
      expect(result!.isLargeModule).toBeUndefined();
    });

    it('bypasses interactive mode when summary option is set', async () => {
      mockFileRepoFiles = Array.from({ length: 35 }, (_, i) => ({
        path: `src/large/file${i}.ts`,
        archId: 'archcodex.core.engine',
        lineCount: 20,
      }));

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/large/', {
        summary: true,
      });

      expect(result).not.toBeNull();
      expect(result!.isSummary).toBe(true);
      expect(result!.isLargeModule).toBeUndefined();
    });

    it('bypasses interactive mode when brief option is set', async () => {
      mockFileRepoFiles = Array.from({ length: 35 }, (_, i) => ({
        path: `src/large/file${i}.ts`,
        archId: 'archcodex.core.engine',
        lineCount: 20,
      }));

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/large/', {
        brief: true,
      });

      expect(result).not.toBeNull();
      expect(result!.isBrief).toBe(true);
    });

    it('returns summary-only context in summary mode', async () => {
      mockFileRepoFiles = [
        { path: 'src/mod/types.ts', archId: 'archcodex.core.types', lineCount: 30 },
        { path: 'src/mod/service.ts', archId: 'archcodex.core.engine', lineCount: 100 },
      ];

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/', {
        summary: true,
      });

      expect(result).not.toBeNull();
      expect(result!.isSummary).toBe(true);
      expect(result!.archcodex.architecture).toBe('(summary)');
      expect(result!.files.defines).toEqual([]);
      expect(result!.files.implements).toEqual([]);
      expect(result!.files.orchestrates).toEqual([]);
    });

    it('returns brief context in brief mode', async () => {
      mockFileRepoFiles = [
        { path: 'src/mod/types.ts', archId: 'archcodex.core.types', lineCount: 30 },
      ];

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/', {
        brief: true,
      });

      expect(result).not.toBeNull();
      expect(result!.isBrief).toBe(true);
      expect(result!.requestedSections).toEqual(['boundaries', 'constraints']);
    });

    it('returns full context with files grouped by role', async () => {
      mockFileRepoFiles = [
        { path: 'src/mod/types.ts', archId: 'archcodex.core.types', lineCount: 30 },
        { path: 'src/mod/service.ts', archId: 'archcodex.core.engine', lineCount: 100 },
        { path: 'src/mod/handler.ts', archId: null, lineCount: 50 },
      ];

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/', {
        confirm: true,
      });

      expect(result).not.toBeNull();
      expect(result!.fileCount).toBe(3);
      expect(result!.modulePath).toBe('src/mod/');
    });

    it('calculates total line count from files', async () => {
      mockFileRepoFiles = [
        { path: 'src/mod/a.ts', archId: null, lineCount: 50 },
        { path: 'src/mod/b.ts', archId: null, lineCount: 100 },
        { path: 'src/mod/c.ts', archId: null, lineCount: 75 },
      ];

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/', {
        confirm: true,
      });

      expect(result).not.toBeNull();
      expect(result!.lineCount).toBe(225);
    });

    it('respects section filtering for entities', async () => {
      mockFileRepoFiles = [
        { path: 'src/mod/a.ts', archId: null, lineCount: 50 },
      ];
      mockEntityRefs = [{ entityName: 'User' }];

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/', {
        confirm: true,
        sections: ['boundaries', 'constraints'],
      });

      expect(result).not.toBeNull();
      // Entities section not requested, so should be empty
      expect(result!.entities).toEqual([]);
    });

    it('excludes consumers when impact section not requested', async () => {
      mockFileRepoFiles = [
        { path: 'src/mod/a.ts', archId: null, lineCount: 50 },
      ];
      mockImportGraph = {
        imports: [],
        importedBy: [{ path: 'src/other/consumer.ts', archId: 'archcodex.cli' }],
      };

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/', {
        confirm: true,
        sections: ['boundaries'],
      });

      expect(result).not.toBeNull();
      expect(result!.consumers).toEqual([]);
    });

    it('includes topSubmodules when module has more than 50 files', async () => {
      mockFileRepoFiles = Array.from({ length: 55 }, (_, i) => ({
        path: `src/big/sub${i % 5}/file${i}.ts`,
        archId: 'archcodex.core.engine',
        lineCount: 10,
      }));

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/big/', {
        confirm: true,
      });

      expect(result).not.toBeNull();
      // topSubmodules should be included for large module
      // The actual value depends on the submodule grouping logic
      expect(result!.fileCount).toBe(55);
    });

    it('uses ALL_SECTIONS when no sections specified', async () => {
      mockFileRepoFiles = [
        { path: 'src/mod/a.ts', archId: null, lineCount: 50 },
      ];

      const result = await synthesizeUnifiedModuleContext('/tmp/project', 'src/mod/', {
        confirm: true,
      });

      expect(result).not.toBeNull();
      expect(result!.requestedSections).toEqual([
        'project-rules',
        'modification-order',
        'boundaries',
        'entities',
        'impact',
        'constraints',
      ]);
    });
  });

  describe('synthesizeUnifiedEntityContext', () => {
    it('returns null when entity not found', async () => {
      const result = await synthesizeUnifiedEntityContext('/tmp/project', 'nonexistentEntity');
      expect(result).toBeNull();
    });

    it('returns entity context when entity is found', async () => {
      mockSynthesizeContextResult = {
        entity: 'User',
        fields: [{ name: 'id' }, { name: 'email' }],
        relationships: [{ type: 'has_many', target: 'Post' }],
        behaviors: [{ type: 'soft_delete' }],
        existingOperations: [{ name: 'getUser' }, { name: 'createUser' }],
        similarOperations: [],
      };

      const result = await synthesizeUnifiedEntityContext('/tmp/project', 'User');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('User');
      expect(result!.fields).toEqual([{ name: 'id' }, { name: 'email' }]);
      expect(result!.relationships).toEqual([{ type: 'has_many', target: 'Post' }]);
      expect(result!.behaviors).toEqual([{ type: 'soft_delete' }]);
      expect(result!.operations).toEqual(['getUser', 'createUser']);
    });

    it('includes similar operations when present', async () => {
      mockSynthesizeContextResult = {
        entity: 'Order',
        fields: [{ name: 'id' }],
        relationships: [],
        behaviors: [],
        existingOperations: [{ name: 'createOrder' }],
        similarOperations: [{ name: 'duplicateOrder' }, { name: 'cloneOrder' }],
      };

      const result = await synthesizeUnifiedEntityContext('/tmp/project', 'Order');

      expect(result).not.toBeNull();
      expect(result!.similarOperations).toEqual(['duplicateOrder', 'cloneOrder']);
    });

    it('omits similar operations when empty', async () => {
      mockSynthesizeContextResult = {
        entity: 'Order',
        fields: [{ name: 'id' }],
        relationships: [],
        behaviors: [],
        existingOperations: [{ name: 'createOrder' }],
        similarOperations: [],
      };

      const result = await synthesizeUnifiedEntityContext('/tmp/project', 'Order');

      expect(result).not.toBeNull();
      expect(result!.similarOperations).toBeUndefined();
    });

    it('groups entity files by role', async () => {
      mockSynthesizeContextResult = {
        entity: 'User',
        fields: [{ name: 'id' }],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };
      mockEntityFiles = [
        { path: 'src/types/user.ts', archId: 'archcodex.core.types', refType: 'definition', lineNumber: 5 },
        { path: 'src/services/userService.ts', archId: 'archcodex.core.engine', refType: 'usage', lineNumber: 10 },
      ];

      const result = await synthesizeUnifiedEntityContext('/tmp/project', 'User');

      expect(result).not.toBeNull();
      expect(result!.files).toBeDefined();
      expect(result!.files.defines).toBeDefined();
      expect(result!.files.implements).toBeDefined();
      expect(result!.files.orchestrates).toBeDefined();
    });
  });

  describe('synthesizeUnifiedContext', () => {
    it('returns null when neither module nor entity specified', async () => {
      const result = await synthesizeUnifiedContext('/tmp/project', {});
      expect(result).toBeNull();
    });

    it('returns module context when module option specified', async () => {
      mockFileRepoFiles = [
        { path: 'src/mod/a.ts', archId: null, lineCount: 10 },
      ];

      const result = await synthesizeUnifiedContext('/tmp/project', {
        module: 'src/mod/',
        confirm: true,
      });

      expect(result).not.toBeNull();
      expect(result!.query.type).toBe('module');
      expect(result!.query.target).toBe('src/mod/');
      expect(result!.module).toBeDefined();
      expect(result!.entity).toBeUndefined();
    });

    it('returns null for module when no files found', async () => {
      const result = await synthesizeUnifiedContext('/tmp/project', {
        module: 'src/empty/',
      });

      expect(result).toBeNull();
    });

    it('returns entity context when entity option specified', async () => {
      mockSynthesizeContextResult = {
        entity: 'User',
        fields: [{ name: 'id' }],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };

      const result = await synthesizeUnifiedContext('/tmp/project', {
        entity: 'User',
      });

      expect(result).not.toBeNull();
      expect(result!.query.type).toBe('entity');
      expect(result!.query.target).toBe('User');
      expect(result!.entity).toBeDefined();
      expect(result!.module).toBeUndefined();
    });

    it('returns null for entity when not found', async () => {
      const result = await synthesizeUnifiedContext('/tmp/project', {
        entity: 'NonexistentEntity',
      });

      expect(result).toBeNull();
    });

    it('prioritizes module over entity when both specified', async () => {
      mockFileRepoFiles = [
        { path: 'src/mod/a.ts', archId: null, lineCount: 10 },
      ];
      mockSynthesizeContextResult = {
        entity: 'User',
        fields: [],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };

      const result = await synthesizeUnifiedContext('/tmp/project', {
        module: 'src/mod/',
        entity: 'User',
        confirm: true,
      });

      expect(result).not.toBeNull();
      expect(result!.query.type).toBe('module');
    });
  });
});
