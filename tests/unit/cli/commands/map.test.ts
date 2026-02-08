/**
 * @arch archcodex.test.unit
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMapCommand } from '../../../../src/cli/commands/map.js';

// Mutable mock instances so tests can configure per-test behavior
let mockFileRepoInstance: Record<string, ReturnType<typeof vi.fn>>;
let mockImportRepoInstance: Record<string, ReturnType<typeof vi.fn>>;
let mockEntityRepoInstance: Record<string, ReturnType<typeof vi.fn>>;
let mockScannerInstance: Record<string, ReturnType<typeof vi.fn>>;
let mockNeedsFullScan: boolean;

// Mock the database modules
vi.mock('../../../../src/core/db/manager.js', () => ({
  getDbSync: vi.fn(() => ({})),
  getMeta: vi.fn(() => null),
}));

vi.mock('../../../../src/core/db/schema.js', () => ({
  initializeSchema: vi.fn(),
}));

vi.mock('../../../../src/core/db/repositories/files.js', () => ({
  FileRepository: vi.fn().mockImplementation(function() { return mockFileRepoInstance; }),
}));

vi.mock('../../../../src/core/db/repositories/imports.js', () => ({
  ImportRepository: vi.fn().mockImplementation(function() { return mockImportRepoInstance; }),
}));

vi.mock('../../../../src/core/db/repositories/entities.js', () => ({
  EntityRepository: vi.fn().mockImplementation(function() { return mockEntityRepoInstance; }),
}));

vi.mock('../../../../src/core/db/scanner.js', () => ({
  DatabaseScanner: vi.fn().mockImplementation(function() { return mockScannerInstance; }),
}));

vi.mock('../../../../src/core/db/formatters.js', () => ({
  formatEntityResults: vi.fn((_entity: string, _files: unknown[]) => 'entity-output'),
  formatArchitectureResults: vi.fn(() => 'arch-output'),
  formatImportGraph: vi.fn(() => 'import-graph-output'),
  formatOverview: vi.fn(() => 'overview-output'),
  formatModuleContext: vi.fn(() => 'module-context-output'),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/git.js', () => ({
  getGitCommitHash: vi.fn(() => null),
}));

describe('map command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNeedsFullScan = false;

    mockFileRepoInstance = {
      query: vi.fn(() => []),
      get: vi.fn(() => null),
      getArchitectureSummary: vi.fn(() => []),
      getAllPaths: vi.fn(() => []),
    };

    mockImportRepoInstance = {
      getImportGraph: vi.fn(() => ({ imports: [], importedBy: [] })),
      getTransitiveImports: vi.fn(() => []),
      getTransitiveImporters: vi.fn(() => []),
    };

    mockEntityRepoInstance = {
      getFilesForEntity: vi.fn(() => []),
      getEntitiesForFile: vi.fn(() => []),
    };

    mockScannerInstance = {
      needsFullScan: vi.fn(() => mockNeedsFullScan),
      fullScan: vi.fn(async () => ({ filesScanned: 10, filesWithArch: 5 })),
      incrementalSync: vi.fn(async () => ({ incrementalUpdates: 0 })),
      getStats: vi.fn(() => ({ fileCount: 10, importCount: 20, entityRefCount: 5, lastScan: '2024-01-01' })),
    };

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createMapCommand', () => {
    it('should create the command with correct name', () => {
      const command = createMapCommand();
      expect(command.name()).toBe('map');
    });

    it('should have required options', () => {
      const command = createMapCommand();
      const options = command.options.map(o => o.long);

      expect(options).toContain('--entity');
      expect(options).toContain('--architecture');
      expect(options).toContain('--file');
      expect(options).toContain('--depth');
      expect(options).toContain('--refresh');
      expect(options).toContain('--json');
    });

    it('should have proper description', () => {
      const command = createMapCommand();
      expect(command.description()).toContain('architecture map');
    });

    it('should have --module option', () => {
      const command = createMapCommand();
      const options = command.options.map(o => o.long);
      expect(options).toContain('--module');
    });

    it('should have --full option', () => {
      const command = createMapCommand();
      const options = command.options.map(o => o.long);
      expect(options).toContain('--full');
    });

    it('should default depth to 2', () => {
      const command = createMapCommand();
      const depthOption = command.options.find(o => o.long === '--depth');
      expect(depthOption?.defaultValue).toBe('2');
    });
  });

  describe('runMap - default overview', () => {
    it('should show overview when no specific query option is provided', async () => {
      const { formatOverview } = await import('../../../../src/core/db/formatters.js');

      const command = createMapCommand();
      await command.parseAsync(['node', 'test']);

      expect(vi.mocked(formatOverview)).toHaveBeenCalled();
    });

    it('should output JSON overview when --json is provided', async () => {
      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output).toHaveProperty('totalFiles');
      expect(output).toHaveProperty('architectures');
    });
  });

  describe('runMap - entity query', () => {
    it('should query entity files when --entity is provided', async () => {
      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--entity', 'User']);

      expect(mockEntityRepoInstance.getFilesForEntity).toHaveBeenCalledWith('User');
    });

    it('should format entity results for human output', async () => {
      const { formatEntityResults } = await import('../../../../src/core/db/formatters.js');

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--entity', 'User']);

      expect(vi.mocked(formatEntityResults)).toHaveBeenCalledWith('User', expect.anything(), expect.objectContaining({ full: false }));
    });

    it('should output entity results as JSON when --json is provided', async () => {
      mockEntityRepoInstance.getFilesForEntity.mockReturnValue([{ path: 'src/user.ts' }]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--entity', 'User', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.entity).toBe('User');
      expect(output.files).toBeDefined();
    });

    it('should pass full option when --full is provided', async () => {
      const { formatEntityResults } = await import('../../../../src/core/db/formatters.js');

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--entity', 'User', '--full']);

      expect(vi.mocked(formatEntityResults)).toHaveBeenCalledWith('User', expect.anything(), expect.objectContaining({ full: true }));
    });
  });

  describe('runMap - architecture query', () => {
    it('should query files by architecture ID', async () => {
      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--architecture', 'core.domain']);

      expect(mockFileRepoInstance.query).toHaveBeenCalledWith({ archId: 'core.domain' });
    });

    it('should use archPattern when architecture contains wildcard %', async () => {
      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--architecture', 'core.%']);

      expect(mockFileRepoInstance.query).toHaveBeenCalledWith({ archPattern: 'core.%' });
    });

    it('should output architecture results as JSON when --json is provided', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/core/engine.ts', lineCount: 100 },
      ]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--architecture', 'core.domain', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.architecture).toBe('core.domain');
      expect(output.files).toHaveLength(1);
      expect(output.files[0].path).toBe('src/core/engine.ts');
    });

    it('should format architecture results for human output', async () => {
      const { formatArchitectureResults } = await import('../../../../src/core/db/formatters.js');

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--architecture', 'core.domain']);

      expect(vi.mocked(formatArchitectureResults)).toHaveBeenCalled();
    });
  });

  describe('runMap - file query', () => {
    it('should query import graph for a file', async () => {
      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--file', 'src/engine.ts']);

      expect(mockFileRepoInstance.get).toHaveBeenCalledWith('src/engine.ts');
      expect(mockImportRepoInstance.getImportGraph).toHaveBeenCalledWith('src/engine.ts');
      expect(mockImportRepoInstance.getTransitiveImports).toHaveBeenCalledWith('src/engine.ts', 2);
      expect(mockImportRepoInstance.getTransitiveImporters).toHaveBeenCalledWith('src/engine.ts', 2);
    });

    it('should use custom depth when --depth is provided', async () => {
      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--file', 'src/engine.ts', '--depth', '5']);

      expect(mockImportRepoInstance.getTransitiveImports).toHaveBeenCalledWith('src/engine.ts', 5);
      expect(mockImportRepoInstance.getTransitiveImporters).toHaveBeenCalledWith('src/engine.ts', 5);
    });

    it('should output file query results as JSON when --json is provided', async () => {
      mockFileRepoInstance.get.mockReturnValue({ archId: 'core.domain' });
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [{ path: 'dep.ts' }], importedBy: [] });

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--file', 'src/engine.ts', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.file).toBe('src/engine.ts');
      expect(output.archId).toBe('core.domain');
    });

    it('should format import graph for human output', async () => {
      const { formatImportGraph } = await import('../../../../src/core/db/formatters.js');

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--file', 'src/engine.ts']);

      expect(vi.mocked(formatImportGraph)).toHaveBeenCalled();
    });
  });

  describe('runMap - module query', () => {
    it('should query module context', async () => {
      const { formatModuleContext } = await import('../../../../src/core/db/formatters.js');

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/core/db/']);

      expect(vi.mocked(formatModuleContext)).toHaveBeenCalled();
    });

    it('should provide available modules hint when no files found in module', async () => {
      const { formatModuleContext } = await import('../../../../src/core/db/formatters.js');
      mockFileRepoInstance.query.mockReturnValue([]);
      mockFileRepoInstance.getAllPaths.mockReturnValue(['src/core/db/manager.ts', 'src/cli/commands/map.ts']);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'nonexistent/']);

      expect(vi.mocked(formatModuleContext)).toHaveBeenCalledWith(
        expect.objectContaining({ files: [] }),
        expect.objectContaining({ availableModules: expect.arrayContaining([]) })
      );
    });

    it('should output module context as JSON when --json is provided', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/core/db/manager.ts', archId: 'core.domain', lineCount: 50 },
      ]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/core/db/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.modulePath).toBe('src/core/db/');
    });

    it('should normalize module path to end with /', async () => {
      mockFileRepoInstance.query.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/core/db', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.modulePath).toBe('src/core/db/');
    });
  });

  describe('runMap - refresh and sync', () => {
    it('should perform full scan when --refresh is provided', async () => {
      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--refresh']);

      expect(mockScannerInstance.fullScan).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Scanning project'))).toBe(true);
    });

    it('should perform full scan when database needs initial scan', async () => {
      mockNeedsFullScan = true;
      mockScannerInstance.needsFullScan.mockReturnValue(true);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockScannerInstance.fullScan).toHaveBeenCalled();
    });

    it('should perform incremental sync when git commit changed', async () => {
      const { getMeta } = await import('../../../../src/core/db/manager.js');
      const { getGitCommitHash } = await import('../../../../src/utils/git.js');

      vi.mocked(getMeta).mockReturnValue('abc123');
      vi.mocked(getGitCommitHash).mockReturnValue('def456');
      mockScannerInstance.incrementalSync.mockResolvedValue({ incrementalUpdates: 3 });

      const command = createMapCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockScannerInstance.incrementalSync).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Synced 3 changed files'))).toBe(true);
    });

    it('should skip sync output when no incremental updates', async () => {
      const { getMeta } = await import('../../../../src/core/db/manager.js');
      const { getGitCommitHash } = await import('../../../../src/utils/git.js');

      vi.mocked(getMeta).mockReturnValue('abc123');
      vi.mocked(getGitCommitHash).mockReturnValue('def456');
      mockScannerInstance.incrementalSync.mockResolvedValue({ incrementalUpdates: 0 });

      const command = createMapCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.every(c => !c.includes('Synced'))).toBe(true);
    });

    it('should skip sync when git commit is null', async () => {
      const { getGitCommitHash } = await import('../../../../src/utils/git.js');
      vi.mocked(getGitCommitHash).mockReturnValue(null);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockScannerInstance.incrementalSync).not.toHaveBeenCalled();
    });

    it('should skip sync when commits match', async () => {
      const { getMeta } = await import('../../../../src/core/db/manager.js');
      const { getGitCommitHash } = await import('../../../../src/utils/git.js');

      vi.mocked(getMeta).mockReturnValue('same-hash');
      vi.mocked(getGitCommitHash).mockReturnValue('same-hash');

      const command = createMapCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockScannerInstance.incrementalSync).not.toHaveBeenCalled();
    });
  });

  describe('runMap - error handling', () => {
    it('should handle errors and exit with code 1', async () => {
      const { getDbSync } = await import('../../../../src/core/db/manager.js');
      vi.mocked(getDbSync).mockImplementationOnce(() => { throw new Error('DB connection failed'); });

      const command = createMapCommand();
      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('DB connection failed');
    });

    it('should handle non-Error exceptions', async () => {
      const { getDbSync } = await import('../../../../src/core/db/manager.js');
      vi.mocked(getDbSync).mockImplementationOnce(() => { throw 'string error'; });

      const command = createMapCommand();
      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('string error');
    });
  });

  describe('runMap - module context internals', () => {
    it('should track internal imports between module files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/types.ts', archId: 'core.types', lineCount: 20 },
        { path: 'src/mod/service.ts', archId: 'core.service', lineCount: 100 },
      ]);
      mockImportRepoInstance.getImportGraph.mockImplementation((filePath: string) => {
        if (filePath === 'src/mod/service.ts') {
          return {
            imports: [{ path: 'src/mod/types.ts', archId: 'core.types' }],
            importedBy: [],
          };
        }
        return {
          imports: [],
          importedBy: [{ path: 'src/mod/service.ts', archId: 'core.service' }],
        };
      });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.internalImports).toBeDefined();
      expect(output.internalImports.length).toBeGreaterThan(0);
    });

    it('should track external dependencies', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/service.ts', archId: 'core.service', lineCount: 100 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({
        imports: [{ path: 'src/utils/logger.ts', archId: 'util' }],
        importedBy: [],
      });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.externalDeps).toBeDefined();
      expect(output.externalDeps.length).toBeGreaterThan(0);
    });

    it('should track external consumers', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/service.ts', archId: 'core.service', lineCount: 100 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({
        imports: [],
        importedBy: [{ path: 'src/cli/commands/cmd.ts', archId: 'cli.command' }],
      });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.externalConsumers).toBeDefined();
      expect(output.externalConsumers.length).toBeGreaterThan(0);
    });

    it('should collect entity references across module files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/service.ts', archId: 'core.service', lineCount: 100 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([
        { entityName: 'User' },
        { entityName: 'User' },
        { entityName: 'Product' },
      ]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.entities).toBeDefined();
      expect(output.entities.length).toBeGreaterThan(0);
    });

    it('should assign defines role to types files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/types.ts', archId: 'core.types', lineCount: 20 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('defines');
    });

    it('should assign defines role to schema files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/schema.ts', archId: 'core.types', lineCount: 30 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('defines');
    });

    it('should assign defines role to index.ts barrel export', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/index.ts', archId: 'core', lineCount: 5 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('defines');
    });

    it('should assign implements role to repository files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/repositories/user.ts', archId: 'core', lineCount: 80 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('implements');
    });

    it('should assign implements role to service files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/user-service.ts', archId: 'core', lineCount: 80 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('implements');
    });

    it('should assign implements role to manager files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/cache-manager.ts', archId: 'core', lineCount: 80 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('implements');
    });

    it('should assign orchestrates role to scanner files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/file-scanner.ts', archId: 'core', lineCount: 80 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('orchestrates');
    });

    it('should assign implements role to formatter files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/output-formatter.ts', archId: 'core', lineCount: 80 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('implements');
    });

    it('should assign defines role to interface files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/user-interface.ts', archId: 'core', lineCount: 30 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('defines');
    });

    it('should assign defines role to foundational files (imported by many, imports none)', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/constants.ts', archId: 'core', lineCount: 10 },
        { path: 'src/mod/a.ts', archId: 'core', lineCount: 50 },
        { path: 'src/mod/b.ts', archId: 'core', lineCount: 50 },
      ]);
      mockImportRepoInstance.getImportGraph.mockImplementation((filePath: string) => {
        if (filePath === 'src/mod/constants.ts') {
          return {
            imports: [],
            importedBy: [
              { path: 'src/mod/a.ts', archId: 'core' },
              { path: 'src/mod/b.ts', archId: 'core' },
            ],
          };
        }
        return {
          imports: [{ path: 'src/mod/constants.ts', archId: 'core' }],
          importedBy: [],
        };
      });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      const constantsFile = output.files.find((f: Record<string, string>) => f.path === 'src/mod/constants.ts');
      expect(constantsFile.role).toBe('defines');
    });

    it('should assign orchestrates role to files importing 3+ internal files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/a.ts', archId: 'core', lineCount: 10 },
        { path: 'src/mod/b.ts', archId: 'core', lineCount: 10 },
        { path: 'src/mod/c.ts', archId: 'core', lineCount: 10 },
        { path: 'src/mod/main.ts', archId: 'core', lineCount: 200 },
      ]);
      mockImportRepoInstance.getImportGraph.mockImplementation((filePath: string) => {
        if (filePath === 'src/mod/main.ts') {
          return {
            imports: [
              { path: 'src/mod/a.ts', archId: 'core' },
              { path: 'src/mod/b.ts', archId: 'core' },
              { path: 'src/mod/c.ts', archId: 'core' },
            ],
            importedBy: [],
          };
        }
        return { imports: [], importedBy: [] };
      });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      const mainFile = output.files.find((f: Record<string, string>) => f.path === 'src/mod/main.ts');
      expect(mainFile.role).toBe('orchestrates');
    });

    it('should assign orchestrates role to files importing 2 internal files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/a.ts', archId: 'core', lineCount: 10 },
        { path: 'src/mod/b.ts', archId: 'core', lineCount: 10 },
        { path: 'src/mod/combo.ts', archId: 'core', lineCount: 50 },
      ]);
      mockImportRepoInstance.getImportGraph.mockImplementation((filePath: string) => {
        if (filePath === 'src/mod/combo.ts') {
          return {
            imports: [
              { path: 'src/mod/a.ts', archId: 'core' },
              { path: 'src/mod/b.ts', archId: 'core' },
            ],
            importedBy: [],
          };
        }
        return { imports: [], importedBy: [] };
      });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      const comboFile = output.files.find((f: Record<string, string>) => f.path === 'src/mod/combo.ts');
      expect(comboFile.role).toBe('orchestrates');
    });

    it('should default to implements role for generic files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/helper.ts', archId: 'core', lineCount: 50 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('implements');
    });

    it('should sort files by role order: defines, implements, orchestrates', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/scanner.ts', archId: 'core', lineCount: 50 },
        { path: 'src/mod/types.ts', archId: 'core', lineCount: 20 },
        { path: 'src/mod/helper.ts', archId: 'core', lineCount: 30 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      const roles = output.files.map((f: Record<string, string>) => f.role);
      expect(roles.indexOf('defines')).toBeLessThan(roles.indexOf('implements'));
      expect(roles.indexOf('implements')).toBeLessThan(roles.indexOf('orchestrates'));
    });
  });

  describe('getAvailableModules', () => {
    it('should extract module paths from file paths', async () => {
      mockFileRepoInstance.query.mockReturnValue([]);
      mockFileRepoInstance.getAllPaths.mockReturnValue([
        'src/core/db/manager.ts',
        'src/core/db/schema.ts',
        'src/cli/commands/map.ts',
      ]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'nonexistent/']);

      const { formatModuleContext } = await import('../../../../src/core/db/formatters.js');
      const call = vi.mocked(formatModuleContext).mock.calls[0];
      const opts = call[1] as { availableModules?: string[] };
      expect(opts.availableModules).toBeDefined();
      expect(opts.availableModules!.length).toBeGreaterThan(0);
    });

    it('should not include single-segment paths', async () => {
      mockFileRepoInstance.query.mockReturnValue([]);
      mockFileRepoInstance.getAllPaths.mockReturnValue(['readme.ts']);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'nonexistent/']);

      const { formatModuleContext } = await import('../../../../src/core/db/formatters.js');
      const call = vi.mocked(formatModuleContext).mock.calls[0];
      const opts = call[1] as { availableModules?: string[] };
      expect(opts.availableModules).toEqual([]);
    });
  });

  describe('runMap - processor role detection', () => {
    it('should assign orchestrates role to processor files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/data-processor.ts', archId: 'core', lineCount: 80 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('orchestrates');
    });
  });

  describe('runMap - .types.ts file extension detection', () => {
    it('should assign defines role to files ending with .types.ts', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/user.types.ts', archId: 'core', lineCount: 20 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('defines');
      expect(output.files[0].roleReason).toBe('type definitions');
    });
  });

  describe('runMap - presenter role detection', () => {
    it('should assign implements role to presenter files', async () => {
      mockFileRepoInstance.query.mockReturnValue([
        { path: 'src/mod/data-presenter.ts', archId: 'core', lineCount: 60 },
      ]);
      mockImportRepoInstance.getImportGraph.mockReturnValue({ imports: [], importedBy: [] });
      mockEntityRepoInstance.getEntitiesForFile.mockReturnValue([]);

      const command = createMapCommand();
      await command.parseAsync(['node', 'test', '--module', 'src/mod/', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0][0]);
      expect(output.files[0].role).toBe('implements');
      expect(output.files[0].roleReason).toBe('formats output');
    });
  });
});
