/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP architecture-map handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleArchitectureMap } from '../../../../src/mcp/handlers/architecture-map.js';

// Mock dependencies
vi.mock('../../../../src/core/db/manager.js', () => ({
  getDbSync: vi.fn(),
  getMeta: vi.fn(),
}));

vi.mock('../../../../src/core/db/schema.js', () => ({
  initializeSchema: vi.fn(),
}));

vi.mock('../../../../src/core/db/repositories/files.js', () => ({
  FileRepository: vi.fn(function () {
    return {
      query: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue(null),
      getArchitectureSummary: vi.fn().mockReturnValue([]),
      getAllPaths: vi.fn().mockReturnValue([]),
    };
  }),
}));

vi.mock('../../../../src/core/db/repositories/imports.js', () => ({
  ImportRepository: vi.fn(function () {
    return {
      getImportGraph: vi.fn().mockReturnValue({ imports: [], importedBy: [] }),
      getTransitiveImports: vi.fn().mockReturnValue([]),
      getTransitiveImporters: vi.fn().mockReturnValue([]),
    };
  }),
}));

vi.mock('../../../../src/core/db/repositories/entities.js', () => ({
  EntityRepository: vi.fn(function () {
    return {
      getFilesForEntity: vi.fn().mockReturnValue([]),
      getEntitiesForFile: vi.fn().mockReturnValue([]),
    };
  }),
}));

vi.mock('../../../../src/core/db/scanner.js', () => ({
  DatabaseScanner: vi.fn(function () {
    return {
      needsFullScan: vi.fn().mockReturnValue(false),
      fullScan: vi.fn().mockResolvedValue(undefined),
      incrementalSync: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockReturnValue({ files: 0, imports: 0, entities: 0 }),
    };
  }),
}));

vi.mock('../../../../src/core/db/formatters.js', () => ({
  formatEntityResults: vi.fn(),
  formatArchitectureResults: vi.fn(),
  formatImportGraph: vi.fn(),
  formatOverview: vi.fn(),
  formatModuleContext: vi.fn(),
}));

vi.mock('../../../../src/mcp/utils.js', () => ({
  isProjectInitialized: vi.fn(),
  findNearbyProject: vi.fn(),
}));

vi.mock('../../../../src/utils/git.js', () => ({
  getGitCommitHash: vi.fn(),
}));

import { getDbSync, getMeta } from '../../../../src/core/db/manager.js';
import { FileRepository } from '../../../../src/core/db/repositories/files.js';
import { ImportRepository } from '../../../../src/core/db/repositories/imports.js';
import { EntityRepository } from '../../../../src/core/db/repositories/entities.js';
import { DatabaseScanner } from '../../../../src/core/db/scanner.js';
import {
  formatEntityResults,
  formatArchitectureResults,
  formatImportGraph,
  formatOverview,
  formatModuleContext,
} from '../../../../src/core/db/formatters.js';
import { isProjectInitialized, findNearbyProject } from '../../../../src/mcp/utils.js';
import { getGitCommitHash } from '../../../../src/utils/git.js';

describe('MCP Architecture Map Handler', () => {
  const projectRoot = '/test/project';
  const mockDb = { prepare: vi.fn(), exec: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isProjectInitialized).mockResolvedValue(true);
    vi.mocked(findNearbyProject).mockResolvedValue(null);
    vi.mocked(getDbSync).mockReturnValue(mockDb);
    vi.mocked(getMeta).mockReturnValue('abc123');
    vi.mocked(getGitCommitHash).mockReturnValue('abc123');
  });

  describe('handleArchitectureMap', () => {
    it('should return error when project is not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);

      const result = await handleArchitectureMap(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not initialized');
      expect(result.content[0].text).toContain(projectRoot);
    });

    it('should suggest nearby project when not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue('/nearby/project');

      const result = await handleArchitectureMap(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('/nearby/project');
      expect(result.content[0].text).toContain('archcodex_map');
    });

    it('should suggest init when not initialized and no nearby project', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue(null);

      const result = await handleArchitectureMap(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('archcodex init');
    });

    it('should return overview when no options provided', async () => {
      vi.mocked(formatOverview).mockReturnValue('# Architecture Overview\n10 files');

      const result = await handleArchitectureMap(projectRoot);

      expect(formatOverview).toHaveBeenCalled();
      expect(result.content[0].text).toBe('# Architecture Overview\n10 files');
      expect(result.isError).toBeUndefined();
    });

    it('should query entity and return results', async () => {
      const mockGetFilesForEntity = vi.fn().mockReturnValue([
        { path: 'src/models/user.ts', archId: 'core.model' },
      ]);
      vi.mocked(EntityRepository).mockImplementation(function () {
        return {
          getFilesForEntity: mockGetFilesForEntity,
          getEntitiesForFile: vi.fn().mockReturnValue([]),
        } as unknown as EntityRepository;
      });
      vi.mocked(formatEntityResults).mockReturnValue('Entity: User\n- src/models/user.ts');

      const result = await handleArchitectureMap(projectRoot, { entity: 'User' });

      expect(mockGetFilesForEntity).toHaveBeenCalledWith('User');
      expect(formatEntityResults).toHaveBeenCalledWith('User', expect.anything(), { markdown: true });
      expect(result.content[0].text).toContain('Entity: User');
    });

    it('should query architecture by exact ID', async () => {
      const mockQuery = vi.fn().mockReturnValue([
        { path: 'src/core/service.ts', lineCount: 120 },
        { path: 'src/core/handler.ts', lineCount: 80 },
      ]);
      vi.mocked(FileRepository).mockImplementation(function () {
        return {
          query: mockQuery,
          get: vi.fn(),
          getArchitectureSummary: vi.fn().mockReturnValue([]),
          getAllPaths: vi.fn().mockReturnValue([]),
        } as unknown as FileRepository;
      });
      vi.mocked(formatArchitectureResults).mockReturnValue('Architecture: core.service');

      const result = await handleArchitectureMap(projectRoot, { architecture: 'core.service' });

      expect(mockQuery).toHaveBeenCalledWith({ archId: 'core.service' });
      expect(formatArchitectureResults).toHaveBeenCalledWith(
        'core.service',
        [{ path: 'src/core/service.ts', lineCount: 120 }, { path: 'src/core/handler.ts', lineCount: 80 }],
        { markdown: true },
      );
      expect(result.content[0].text).toBe('Architecture: core.service');
    });

    it('should query architecture by pattern', async () => {
      const mockQuery = vi.fn().mockReturnValue([]);
      vi.mocked(FileRepository).mockImplementation(function () {
        return {
          query: mockQuery,
          get: vi.fn(),
          getArchitectureSummary: vi.fn().mockReturnValue([]),
          getAllPaths: vi.fn().mockReturnValue([]),
        } as unknown as FileRepository;
      });
      vi.mocked(formatArchitectureResults).mockReturnValue('No files');

      await handleArchitectureMap(projectRoot, { architecture: 'core.%' });

      expect(mockQuery).toHaveBeenCalledWith({ archPattern: 'core.%' });
    });

    it('should query file and return import graph', async () => {
      const mockGet = vi.fn().mockReturnValue({
        path: 'src/core/db.ts',
        archId: 'core.db',
        lineCount: 200,
      });
      const mockGetImportGraph = vi.fn().mockReturnValue({
        imports: [{ path: 'src/utils/log.ts', archId: 'util' }],
        importedBy: [{ path: 'src/core/service.ts', archId: 'core.service' }],
      });
      const mockGetTransitiveImports = vi.fn().mockReturnValue([
        'src/utils/log.ts',
        'src/utils/config.ts',
      ]);
      const mockGetTransitiveImporters = vi.fn().mockReturnValue([
        'src/core/service.ts',
        'src/cli/main.ts',
      ]);

      vi.mocked(FileRepository).mockImplementation(function () {
        return {
          query: vi.fn().mockReturnValue([]),
          get: mockGet,
          getArchitectureSummary: vi.fn().mockReturnValue([]),
          getAllPaths: vi.fn().mockReturnValue([]),
        } as unknown as FileRepository;
      });
      vi.mocked(ImportRepository).mockImplementation(function () {
        return {
          getImportGraph: mockGetImportGraph,
          getTransitiveImports: mockGetTransitiveImports,
          getTransitiveImporters: mockGetTransitiveImporters,
        } as unknown as ImportRepository;
      });
      vi.mocked(formatImportGraph).mockReturnValue('Import graph for src/core/db.ts');

      const result = await handleArchitectureMap(projectRoot, { file: 'src/core/db.ts' });

      expect(mockGet).toHaveBeenCalledWith('src/core/db.ts');
      expect(mockGetImportGraph).toHaveBeenCalledWith('src/core/db.ts');
      expect(mockGetTransitiveImports).toHaveBeenCalledWith('src/core/db.ts', 2);
      expect(mockGetTransitiveImporters).toHaveBeenCalledWith('src/core/db.ts', 2);
      expect(result.content[0].text).toBe('Import graph for src/core/db.ts');
    });

    it('should use custom depth for file import graph', async () => {
      const mockGetTransitiveImports = vi.fn().mockReturnValue([]);
      const mockGetTransitiveImporters = vi.fn().mockReturnValue([]);

      vi.mocked(FileRepository).mockImplementation(function () {
        return {
          query: vi.fn().mockReturnValue([]),
          get: vi.fn().mockReturnValue(null),
          getArchitectureSummary: vi.fn().mockReturnValue([]),
          getAllPaths: vi.fn().mockReturnValue([]),
        } as unknown as FileRepository;
      });
      vi.mocked(ImportRepository).mockImplementation(function () {
        return {
          getImportGraph: vi.fn().mockReturnValue({ imports: [], importedBy: [] }),
          getTransitiveImports: mockGetTransitiveImports,
          getTransitiveImporters: mockGetTransitiveImporters,
        } as unknown as ImportRepository;
      });
      vi.mocked(formatImportGraph).mockReturnValue('');

      await handleArchitectureMap(projectRoot, { file: 'src/test.ts', depth: 5 });

      expect(mockGetTransitiveImports).toHaveBeenCalledWith('src/test.ts', 5);
      expect(mockGetTransitiveImporters).toHaveBeenCalledWith('src/test.ts', 5);
    });

    it('should query module and return context', async () => {
      const mockQuery = vi.fn().mockReturnValue([
        { path: 'src/core/types.ts', archId: 'core.types', lineCount: 50 },
        { path: 'src/core/service.ts', archId: 'core.service', lineCount: 120 },
      ]);
      const mockGetImportGraph = vi.fn()
        .mockReturnValueOnce({
          imports: [],
          importedBy: [{ path: 'src/core/service.ts', archId: 'core.service' }],
        })
        .mockReturnValueOnce({
          imports: [{ path: 'src/core/types.ts', archId: 'core.types' }],
          importedBy: [{ path: 'src/cli/main.ts', archId: 'cli.main' }],
        });
      const mockGetEntitiesForFile = vi.fn().mockReturnValue([]);

      vi.mocked(FileRepository).mockImplementation(function () {
        return {
          query: mockQuery,
          get: vi.fn(),
          getArchitectureSummary: vi.fn().mockReturnValue([]),
          getAllPaths: vi.fn().mockReturnValue([]),
        } as unknown as FileRepository;
      });
      vi.mocked(ImportRepository).mockImplementation(function () {
        return {
          getImportGraph: mockGetImportGraph,
          getTransitiveImports: vi.fn().mockReturnValue([]),
          getTransitiveImporters: vi.fn().mockReturnValue([]),
        } as unknown as ImportRepository;
      });
      vi.mocked(EntityRepository).mockImplementation(function () {
        return {
          getFilesForEntity: vi.fn().mockReturnValue([]),
          getEntitiesForFile: mockGetEntitiesForFile,
        } as unknown as EntityRepository;
      });
      vi.mocked(formatModuleContext).mockReturnValue('# Module: src/core/');

      const result = await handleArchitectureMap(projectRoot, { module: 'src/core/' });

      expect(mockQuery).toHaveBeenCalledWith({ pathPattern: 'src/core/%' });
      expect(formatModuleContext).toHaveBeenCalled();
      expect(result.content[0].text).toBe('# Module: src/core/');
    });

    it('should normalize module path by adding trailing slash', async () => {
      const mockQuery = vi.fn().mockReturnValue([]);
      vi.mocked(FileRepository).mockImplementation(function () {
        return {
          query: mockQuery,
          get: vi.fn(),
          getArchitectureSummary: vi.fn().mockReturnValue([]),
          getAllPaths: vi.fn().mockReturnValue(['src/core/service.ts']),
        } as unknown as FileRepository;
      });
      vi.mocked(formatModuleContext).mockReturnValue('');

      await handleArchitectureMap(projectRoot, { module: 'src/core' });

      // Should add trailing slash
      expect(mockQuery).toHaveBeenCalledWith({ pathPattern: 'src/core/%' });
    });

    it('should provide available modules hint when module has no files', async () => {
      const mockQuery = vi.fn().mockReturnValue([]);
      const mockGetAllPaths = vi.fn().mockReturnValue([
        'src/core/db.ts',
        'src/utils/logger.ts',
      ]);
      vi.mocked(FileRepository).mockImplementation(function () {
        return {
          query: mockQuery,
          get: vi.fn(),
          getArchitectureSummary: vi.fn().mockReturnValue([]),
          getAllPaths: mockGetAllPaths,
        } as unknown as FileRepository;
      });
      vi.mocked(formatModuleContext).mockReturnValue('No files found');

      await handleArchitectureMap(projectRoot, { module: 'src/nonexistent/' });

      expect(formatModuleContext).toHaveBeenCalledWith(
        expect.objectContaining({ files: [] }),
        expect.objectContaining({ availableModules: expect.anything() }),
      );
    });

    it('should force full scan when refresh option is true', async () => {
      const mockFullScan = vi.fn().mockResolvedValue(undefined);
      vi.mocked(DatabaseScanner).mockImplementation(function () {
        return {
          needsFullScan: vi.fn().mockReturnValue(false),
          fullScan: mockFullScan,
          incrementalSync: vi.fn().mockResolvedValue(undefined),
          getStats: vi.fn().mockReturnValue({ files: 0, imports: 0, entities: 0 }),
        } as unknown as DatabaseScanner;
      });
      vi.mocked(formatOverview).mockReturnValue('overview');

      await handleArchitectureMap(projectRoot, { refresh: true });

      expect(mockFullScan).toHaveBeenCalled();
    });

    it('should full scan when database needs initial scan', async () => {
      const mockFullScan = vi.fn().mockResolvedValue(undefined);
      vi.mocked(DatabaseScanner).mockImplementation(function () {
        return {
          needsFullScan: vi.fn().mockReturnValue(true),
          fullScan: mockFullScan,
          incrementalSync: vi.fn().mockResolvedValue(undefined),
          getStats: vi.fn().mockReturnValue({ files: 0, imports: 0, entities: 0 }),
        } as unknown as DatabaseScanner;
      });
      vi.mocked(formatOverview).mockReturnValue('overview');

      await handleArchitectureMap(projectRoot);

      expect(mockFullScan).toHaveBeenCalled();
    });

    it('should incremental sync when git commit changed', async () => {
      vi.mocked(getMeta).mockReturnValue('old-commit');
      vi.mocked(getGitCommitHash).mockReturnValue('new-commit');

      const mockIncrementalSync = vi.fn().mockResolvedValue(undefined);
      vi.mocked(DatabaseScanner).mockImplementation(function () {
        return {
          needsFullScan: vi.fn().mockReturnValue(false),
          fullScan: vi.fn().mockResolvedValue(undefined),
          incrementalSync: mockIncrementalSync,
          getStats: vi.fn().mockReturnValue({ files: 0, imports: 0, entities: 0 }),
        } as unknown as DatabaseScanner;
      });
      vi.mocked(formatOverview).mockReturnValue('overview');

      await handleArchitectureMap(projectRoot);

      expect(mockIncrementalSync).toHaveBeenCalled();
    });

    it('should not sync when git commit has not changed', async () => {
      vi.mocked(getMeta).mockReturnValue('same-commit');
      vi.mocked(getGitCommitHash).mockReturnValue('same-commit');

      const mockFullScan = vi.fn();
      const mockIncrementalSync = vi.fn();
      vi.mocked(DatabaseScanner).mockImplementation(function () {
        return {
          needsFullScan: vi.fn().mockReturnValue(false),
          fullScan: mockFullScan,
          incrementalSync: mockIncrementalSync,
          getStats: vi.fn().mockReturnValue({ files: 0, imports: 0, entities: 0 }),
        } as unknown as DatabaseScanner;
      });
      vi.mocked(formatOverview).mockReturnValue('overview');

      await handleArchitectureMap(projectRoot);

      expect(mockFullScan).not.toHaveBeenCalled();
      expect(mockIncrementalSync).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(getDbSync).mockImplementation(() => {
        throw new Error('Database file corrupted');
      });

      const result = await handleArchitectureMap(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error querying architecture map');
      expect(result.content[0].text).toContain('Database file corrupted');
      expect(result.content[0].text).toContain(projectRoot);
      expect(result.content[0].text).toContain('refresh=true');
    });
  });
});
