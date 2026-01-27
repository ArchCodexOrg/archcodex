/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the session-context command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSessionContextCommand } from '../../../../src/cli/commands/session-context.js';
import type { SessionContextResult } from '../../../../src/core/session/index.js';

// Module-level mock configuration
let mockSessionContextResult: SessionContextResult = {
  filesScanned: 0,
  architecturesInScope: [],
  untaggedFiles: [],
};
let mockSessionContextError: Error | null = null;

// Mock dependencies
vi.mock('../../../../src/core/session/index.js', () => ({
  getSessionContext: vi.fn().mockImplementation(async () => {
    if (mockSessionContextError) throw mockSessionContextError;
    return mockSessionContextResult;
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
    bold: (s: string) => s,
    dim: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
    blue: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    magenta: (s: string) => s,
  },
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

// Mock process.cwd
vi.spyOn(process, 'cwd').mockReturnValue('/test/project');

// Spy on console.log
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('session-context command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockSessionContextResult = {
      filesScanned: 0,
      architecturesInScope: [],
      untaggedFiles: [],
    };
    mockSessionContextError = null;

    // Reset mocks
    const session = await import('../../../../src/core/session/index.js');
    vi.mocked(session.getSessionContext).mockImplementation(async () => {
      if (mockSessionContextError) throw mockSessionContextError;
      return mockSessionContextResult;
    });
  });

  describe('createSessionContextCommand', () => {
    it('should create a command with correct name', () => {
      const command = createSessionContextCommand();
      expect(command.name()).toBe('session-context');
    });

    it('should have the correct description', () => {
      const command = createSessionContextCommand();
      expect(command.description()).toContain('context');
    });

    it('should have required options', () => {
      const command = createSessionContextCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--with-patterns');
      expect(optionNames).toContain('--full');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--with-duplicates');
      expect(optionNames).toContain('--without-layers');
      expect(optionNames).toContain('--scope');
      expect(optionNames).toContain('--config');
    });

    it('should have an optional patterns argument', () => {
      const command = createSessionContextCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('patterns');
      expect(args[0].required).toBe(false);
    });
  });

  describe('runSessionContext', () => {
    it('should call getSessionContext with default options', async () => {
      const session = await import('../../../../src/core/session/index.js');

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(session.getSessionContext).toHaveBeenCalledWith(
        '/test/project',
        [],
        {
          compact: true,
          withPatterns: false,
          deduplicate: true,
          withLayers: true,
          scope: undefined,
        }
      );
    });

    it('should pass patterns to getSessionContext', async () => {
      const session = await import('../../../../src/core/session/index.js');

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', 'lib/**/*.ts']);

      expect(session.getSessionContext).toHaveBeenCalledWith(
        '/test/project',
        ['src/**/*.ts', 'lib/**/*.ts'],
        expect.any(Object)
      );
    });

    it('should enable verbose output with --full', async () => {
      const session = await import('../../../../src/core/session/index.js');

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--full']);

      expect(session.getSessionContext).toHaveBeenCalledWith(
        '/test/project',
        [],
        expect.objectContaining({
          compact: false,
        })
      );
    });

    it('should disable deduplication with --with-duplicates', async () => {
      const session = await import('../../../../src/core/session/index.js');

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--with-duplicates']);

      expect(session.getSessionContext).toHaveBeenCalledWith(
        '/test/project',
        [],
        expect.objectContaining({
          deduplicate: false,
        })
      );
    });

    it('should disable layers with --without-layers', async () => {
      const session = await import('../../../../src/core/session/index.js');

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--without-layers']);

      expect(session.getSessionContext).toHaveBeenCalledWith(
        '/test/project',
        [],
        expect.objectContaining({
          withLayers: false,
        })
      );
    });

    it('should enable patterns with --with-patterns', async () => {
      const session = await import('../../../../src/core/session/index.js');

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--with-patterns']);

      expect(session.getSessionContext).toHaveBeenCalledWith(
        '/test/project',
        [],
        expect.objectContaining({
          withPatterns: true,
        })
      );
    });

    it('should output JSON when --json flag is provided', async () => {
      mockSessionContextResult = {
        filesScanned: 5,
        architecturesInScope: [{ archId: 'test.arch', fileCount: 2, forbid: [], patterns: [], require: [], hints: [], mixins: [] }],
        untaggedFiles: [],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"filesScanned"')
      );
      expect(jsonCall).toBeDefined();
    });

    it('should handle errors from getSessionContext', async () => {
      mockSessionContextError = new Error('Failed to get session context');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createSessionContextCommand();
      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Failed to get session context');
    });

    it('should handle non-Error exceptions', async () => {
      const session = await import('../../../../src/core/session/index.js');
      vi.mocked(session.getSessionContext).mockRejectedValue('string error');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createSessionContextCommand();
      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Unknown error');
    });
  });

  describe('printCompactOutput', () => {
    it('should print header with files scanned', async () => {
      mockSessionContextResult = {
        filesScanned: 10,
        architecturesInScope: [],
        untaggedFiles: [],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith('# ArchCodex Session Context');
      expect(consoleSpy).toHaveBeenCalledWith('# 10 files scanned');
    });

    it('should print layers when present', async () => {
      mockSessionContextResult = {
        filesScanned: 5,
        architecturesInScope: [],
        untaggedFiles: [],
        layers: [
          { name: 'core', canImport: ['util'] },
          { name: 'util', canImport: [] },
        ],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith('## Layers');
      expect(consoleSpy).toHaveBeenCalledWith('core -> [util]');
      expect(consoleSpy).toHaveBeenCalledWith('util -> [(leaf)]');
    });

    it('should print shared constraints when present', async () => {
      mockSessionContextResult = {
        filesScanned: 5,
        architecturesInScope: [],
        untaggedFiles: [],
        sharedConstraints: [
          { type: 'forbid_import', values: ['axios', 'http'] },
        ],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith('## Shared (all archs)');
      expect(consoleSpy).toHaveBeenCalledWith('- forbid_import: axios, http');
    });

    it('should print architecture constraints', async () => {
      mockSessionContextResult = {
        filesScanned: 5,
        architecturesInScope: [{
          archId: 'project.core.service',
          fileCount: 3,
          forbid: ['console.log'],
          patterns: ['TODO'],
          require: ['tests'],
          hints: ['Keep services stateless'],
          mixins: [],
        }],
        untaggedFiles: [],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith('## project.core.service (3)');
      expect(consoleSpy).toHaveBeenCalledWith('- forbid: console.log');
      expect(consoleSpy).toHaveBeenCalledWith('- patterns: TODO');
      expect(consoleSpy).toHaveBeenCalledWith('- require: tests');
      expect(consoleSpy).toHaveBeenCalledWith('- hint: Keep services stateless');
    });

    it('should print canonical patterns when present', async () => {
      mockSessionContextResult = {
        filesScanned: 5,
        architecturesInScope: [],
        untaggedFiles: [],
        canonicalPatterns: [
          { name: 'logger', canonical: 'src/utils/logger.ts', exports: ['logger'], usage: 'Use for all logging' },
        ],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith('## Canonical Patterns');
      expect(consoleSpy).toHaveBeenCalledWith('- logger: src/utils/logger.ts [logger]');
    });
  });

  describe('printHumanOutput (--full)', () => {
    it('should print header with files scanned', async () => {
      mockSessionContextResult = {
        filesScanned: 10,
        architecturesInScope: [],
        untaggedFiles: [],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--full']);

      expect(consoleSpy).toHaveBeenCalledWith('Session Context Summary');
      expect(consoleSpy).toHaveBeenCalledWith('Scanned 10 files');
    });

    it('should show message when no architectures found', async () => {
      mockSessionContextResult = {
        filesScanned: 5,
        architecturesInScope: [],
        untaggedFiles: [],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--full']);

      expect(consoleSpy).toHaveBeenCalledWith('No architectures found in scanned files.');
      expect(consoleSpy).toHaveBeenCalledWith('Try different patterns or ensure files have @arch tags.');
    });

    it('should print layer boundaries when present', async () => {
      mockSessionContextResult = {
        filesScanned: 5,
        architecturesInScope: [{ archId: 'test', fileCount: 1, forbid: [], patterns: [], require: [], hints: [], mixins: [] }],
        untaggedFiles: [],
        layers: [
          { name: 'core', canImport: ['util', 'common'] },
        ],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--full']);

      expect(consoleSpy).toHaveBeenCalledWith('Layer Boundaries:');
      expect(consoleSpy).toHaveBeenCalledWith('  core → [util, common]');
    });

    it('should print architecture details', async () => {
      mockSessionContextResult = {
        filesScanned: 5,
        architecturesInScope: [{
          archId: 'project.core.service',
          fileCount: 3,
          description: 'Service layer components',
          forbid: ['console.log', 'eval'],
          patterns: ['TODO', 'FIXME'],
          require: ['tests', 'docs'],
          hints: ['Keep services stateless', 'Inject dependencies', 'Log all errors'],
          mixins: ['srp', 'dip'],
        }],
        untaggedFiles: [],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--full']);

      expect(consoleSpy).toHaveBeenCalledWith('Architectures in Scope:');
      expect(consoleSpy).toHaveBeenCalledWith('  project.core.service (3 files)');
      expect(consoleSpy).toHaveBeenCalledWith('    Service layer components');
      expect(consoleSpy).toHaveBeenCalledWith('    Forbid: console.log, eval');
      expect(consoleSpy).toHaveBeenCalledWith('    Patterns: TODO, FIXME');
      expect(consoleSpy).toHaveBeenCalledWith('    Require: tests, docs');
      expect(consoleSpy).toHaveBeenCalledWith('    Hints: Keep services stateless; Inject dependencies...');
      expect(consoleSpy).toHaveBeenCalledWith('    Mixins: srp, dip');
    });

    it('should show untagged files count', async () => {
      mockSessionContextResult = {
        filesScanned: 10,
        architecturesInScope: [{ archId: 'test', fileCount: 5, forbid: [], patterns: [], require: [], hints: [], mixins: [] }],
        untaggedFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--full']);

      expect(consoleSpy).toHaveBeenCalledWith('3 untagged files');
      expect(consoleSpy).toHaveBeenCalledWith('  Run: archcodex infer --files "pattern" to suggest architectures');
    });

    it('should print canonical patterns when present', async () => {
      mockSessionContextResult = {
        filesScanned: 5,
        architecturesInScope: [{ archId: 'test', fileCount: 1, forbid: [], patterns: [], require: [], hints: [], mixins: [] }],
        untaggedFiles: [],
        canonicalPatterns: [
          { name: 'logger', canonical: 'src/utils/logger.ts', exports: ['logger', 'createLogger'], usage: 'Use for all logging' },
          { name: 'config', canonical: 'src/utils/config.ts', exports: [], usage: undefined },
        ],
      };

      const command = createSessionContextCommand();
      await command.parseAsync(['node', 'test', '--full']);

      expect(consoleSpy).toHaveBeenCalledWith('Canonical Patterns (use instead of creating new):');
      expect(consoleSpy).toHaveBeenCalledWith('  logger: src/utils/logger.ts');
      expect(consoleSpy).toHaveBeenCalledWith('    exports: logger, createLogger');
      expect(consoleSpy).toHaveBeenCalledWith('    Use for all logging');
    });
  });
});
