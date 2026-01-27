/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the init command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInitCommand } from '../../../../src/cli/commands/init.js';

// Module-level mock configuration
let mockFileExistsResult: boolean | ((path: string) => boolean) = false;
let mockWriteFileError: Error | null = null;
let mockEnsureDirError: Error | null = null;

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  writeFile: vi.fn().mockImplementation(async () => {
    if (mockWriteFileError) throw mockWriteFileError;
    return undefined;
  }),
  fileExists: vi.fn().mockImplementation(async (path: string) => {
    if (typeof mockFileExistsResult === 'function') {
      return mockFileExistsResult(path);
    }
    return mockFileExistsResult;
  }),
  ensureDir: vi.fn().mockImplementation(async () => {
    if (mockEnsureDirError) throw mockEnsureDirError;
    return undefined;
  }),
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

vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      green: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
  },
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

// Mock process.cwd
const originalCwd = process.cwd;
vi.spyOn(process, 'cwd').mockReturnValue('/test/project');

// Spy on console.log
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('init command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockFileExistsResult = false;
    mockWriteFileError = null;
    mockEnsureDirError = null;

    // Reset mocks
    const fs = await import('../../../../src/utils/file-system.js');
    vi.mocked(fs.fileExists).mockImplementation(async (path: string) => {
      if (typeof mockFileExistsResult === 'function') {
        return mockFileExistsResult(path);
      }
      return mockFileExistsResult;
    });
    vi.mocked(fs.writeFile).mockImplementation(async () => {
      if (mockWriteFileError) throw mockWriteFileError;
      return undefined;
    });
    vi.mocked(fs.ensureDir).mockImplementation(async () => {
      if (mockEnsureDirError) throw mockEnsureDirError;
      return undefined;
    });
  });

  describe('createInitCommand', () => {
    it('should create a command with correct name', () => {
      const command = createInitCommand();
      expect(command.name()).toBe('init');
    });

    it('should have the correct description', () => {
      const command = createInitCommand();
      expect(command.description()).toContain('Initialize');
    });

    it('should have required options', () => {
      const command = createInitCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--force');
    });
  });

  describe('runInit', () => {
    it('should warn and return if .arch/config.yaml already exists', async () => {
      mockFileExistsResult = true;

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      expect(logger.logger.warn).toHaveBeenCalledWith(
        '.arch/ already exists. Use --force to reinitialize.'
      );
      // Should not create any files
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should create directories and files on successful init', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      // Should create directories
      expect(fs.ensureDir).toHaveBeenCalledWith('/test/project/.arch');
      expect(fs.ensureDir).toHaveBeenCalledWith('/test/project/.arch/registry');
      expect(fs.ensureDir).toHaveBeenCalledWith('/test/project/.arch/docs');
      expect(fs.ensureDir).toHaveBeenCalledWith('/test/project/.arch/templates');

      // Should create config file
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/config.yaml',
        expect.any(String)
      );

      // Should log success for config
      expect(logger.logger.success).toHaveBeenCalledWith('Created .arch/config.yaml');
    });

    it('should create registry files', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      // Should create base.yaml
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/registry/base.yaml',
        expect.any(String)
      );
      expect(logger.logger.success).toHaveBeenCalledWith('Created .arch/registry/base.yaml');

      // Should create _mixins.yaml
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/registry/_mixins.yaml',
        expect.any(String)
      );
      expect(logger.logger.success).toHaveBeenCalledWith('Created .arch/registry/_mixins.yaml');

      // Should create _intents.yaml
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/registry/_intents.yaml',
        expect.any(String)
      );
      expect(logger.logger.success).toHaveBeenCalledWith('Created .arch/registry/_intents.yaml');

      // Should create _actions.yaml
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/registry/_actions.yaml',
        expect.any(String)
      );
      expect(logger.logger.success).toHaveBeenCalledWith('Created .arch/registry/_actions.yaml');

      // Should create _features.yaml
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/registry/_features.yaml',
        expect.any(String)
      );
      expect(logger.logger.success).toHaveBeenCalledWith('Created .arch/registry/_features.yaml');
    });

    it('should create index.yaml', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/index.yaml',
        expect.any(String)
      );
      expect(logger.logger.success).toHaveBeenCalledWith('Created .arch/index.yaml');
    });

    it('should create concepts.yaml', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/concepts.yaml',
        expect.any(String)
      );
      expect(logger.logger.success).toHaveBeenCalledWith('Created .arch/concepts.yaml');
    });

    it('should create service template', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/templates/service.hbs',
        expect.any(String)
      );
      expect(logger.logger.success).toHaveBeenCalledWith('Created .arch/templates/service.hbs');
    });

    it('should create .archignore in project root', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.archignore',
        expect.any(String)
      );
      expect(logger.logger.success).toHaveBeenCalledWith('Created .archignore');
    });

    it('should create CLAUDE.md in project root', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/CLAUDE.md',
        expect.any(String)
      );
      expect(logger.logger.success).toHaveBeenCalledWith('Created CLAUDE.md (AI agent instructions)');
    });

    it('should skip .archignore if it already exists', async () => {
      // Config doesn't exist, but .archignore does
      mockFileExistsResult = (path: string) => {
        return path.includes('.archignore');
      };

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      // Should NOT create .archignore
      const archignoreCalls = vi.mocked(fs.writeFile).mock.calls.filter(
        (call) => call[0] === '/test/project/.archignore'
      );
      expect(archignoreCalls).toHaveLength(0);

      // Should still create other files
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/config.yaml',
        expect.any(String)
      );
    });

    it('should skip CLAUDE.md if it already exists', async () => {
      // Config doesn't exist, but CLAUDE.md does
      mockFileExistsResult = (path: string) => {
        return path.includes('CLAUDE.md');
      };

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      // Should NOT create CLAUDE.md
      const claudeCalls = vi.mocked(fs.writeFile).mock.calls.filter(
        (call) => call[0] === '/test/project/CLAUDE.md'
      );
      expect(claudeCalls).toHaveLength(0);

      // Should still create other files
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/config.yaml',
        expect.any(String)
      );
    });

    it('should overwrite existing files with --force', async () => {
      mockFileExistsResult = true;

      const fs = await import('../../../../src/utils/file-system.js');
      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test', '--force']);

      // Should NOT show warning
      expect(logger.logger.warn).not.toHaveBeenCalled();

      // Should create all files including .archignore and CLAUDE.md
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.arch/config.yaml',
        expect.any(String)
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/.archignore',
        expect.any(String)
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/project/CLAUDE.md',
        expect.any(String)
      );
    });

    it('should print initialization header', async () => {
      mockFileExistsResult = false;

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith('Initializing ArchCodex...');
    });

    it('should print success message after initialization', async () => {
      mockFileExistsResult = false;

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith('ArchCodex initialized successfully!');
    });

    it('should print next steps after initialization', async () => {
      mockFileExistsResult = false;

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith('Next steps:');
    });

    it('should handle ensureDir errors', async () => {
      mockFileExistsResult = false;
      mockEnsureDirError = new Error('Permission denied');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();

      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Permission denied');
    });

    it('should handle writeFile errors', async () => {
      mockFileExistsResult = false;
      mockWriteFileError = new Error('Disk full');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();

      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Disk full');
    });

    it('should handle non-Error exceptions', async () => {
      mockFileExistsResult = false;

      // Make ensureDir throw a non-Error
      const fs = await import('../../../../src/utils/file-system.js');
      vi.mocked(fs.ensureDir).mockRejectedValue('string error');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createInitCommand();

      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Unknown error');
    });

    it('should create four directories total', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      expect(fs.ensureDir).toHaveBeenCalledTimes(4);
    });

    it('should create all expected files', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      // 1 config + 5 registry files + 1 index + 1 concepts + 1 template + 1 archignore + 1 CLAUDE.md = 11
      expect(fs.writeFile).toHaveBeenCalledTimes(11);
    });
  });

  describe('edge cases', () => {
    it('should use process.cwd() for project root', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      // All paths should start with the mocked cwd
      const ensureDirCalls = vi.mocked(fs.ensureDir).mock.calls;
      for (const [path] of ensureDirCalls) {
        expect(path).toMatch(/^\/test\/project/);
      }
    });

    it('should create nested directory structure correctly', async () => {
      mockFileExistsResult = false;

      const fs = await import('../../../../src/utils/file-system.js');

      const command = createInitCommand();
      await command.parseAsync(['node', 'test']);

      const ensureDirCalls = vi.mocked(fs.ensureDir).mock.calls.map(c => c[0]);

      // Check order - parent directories first
      expect(ensureDirCalls.indexOf('/test/project/.arch')).toBeLessThan(
        ensureDirCalls.indexOf('/test/project/.arch/registry')
      );
    });
  });
});
