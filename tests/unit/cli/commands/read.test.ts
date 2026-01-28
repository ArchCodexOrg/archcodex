/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the read command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createReadCommand } from '../../../../src/cli/commands/read.js';
import type { HydrationResult } from '../../../../src/core/hydration/types.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockHydrationResult: HydrationResult = {
  output: '/** Hydrated content */',
  tokenCount: 100,
  truncated: false,
};

let mockFileContent = '/** @arch test.domain */\nconst x = 1;';
let mockFileExists = true;
let mockPatternRegistry = null;
let mockArchTag: { archId: string } | null = { archId: 'test.domain' };
let mockResolvedArch = {
  architecture: {
    description: 'Test',
    reference_implementations: [] as string[],
  },
};

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    files: { source_patterns: ['src/**/*.ts'] },
    layers: [],
    registry: {},
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {},
    mixins: {},
  }),
}));

vi.mock('../../../../src/core/hydration/engine.js', () => ({
  HydrationEngine: vi.fn(function() {
    return {
    hydrateFile: vi.fn().mockImplementation(async () => mockHydrationResult),
  };
  }),
}));

vi.mock('../../../../src/core/patterns/loader.js', () => ({
  loadPatternRegistry: vi.fn().mockImplementation(async () => mockPatternRegistry),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn().mockImplementation(async () => mockFileContent),
  fileExists: vi.fn().mockImplementation(async () => mockFileExists),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  parseArchTags: vi.fn(function() {
    return {
    archTag: mockArchTag,
    overrides: [],
    intents: [],
    inlineMixins: [],
  };
  }),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn().mockImplementation(() => mockResolvedArch),
}));

vi.mock('minimatch', () => ({
  minimatch: vi.fn().mockImplementation((path: string, pattern: string) => {
    // Simple pattern matching for tests
    if (pattern === 'src/core/**/*') return path.startsWith('src/core/');
    if (pattern === 'src/cli/**/*') return path.startsWith('src/cli/');
    return false;
  }),
}));

import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { HydrationEngine } from '../../../../src/core/hydration/engine.js';
import { loadPatternRegistry } from '../../../../src/core/patterns/loader.js';
import { logger } from '../../../../src/utils/logger.js';
import { readFile, fileExists } from '../../../../src/utils/file-system.js';
import { parseArchTags } from '../../../../src/core/arch-tag/parser.js';
import { resolveArchitecture } from '../../../../src/core/registry/resolver.js';

describe('read command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/project');

    // Reset mock behavior
    mockHydrationResult = {
      output: '/** Hydrated content */',
      tokenCount: 100,
      truncated: false,
    };
    mockFileContent = '/** @arch test.domain */\nconst x = 1;';
    mockFileExists = true;
    mockPatternRegistry = null;
    mockArchTag = { archId: 'test.domain' };
    mockResolvedArch = {
      architecture: {
        description: 'Test',
        reference_implementations: [],
      },
    };

    // Reset the HydrationEngine mock to use the configurable behavior
    vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
      hydrateFile: vi.fn().mockImplementation(async () => mockHydrationResult),
    } as any;
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createReadCommand', () => {
    it('should create a command with correct name', () => {
      const command = createReadCommand();
      expect(command.name()).toBe('read');
    });

    it('should have the correct description', () => {
      const command = createReadCommand();
      expect(command.description()).toBe('Read a file with hydrated architectural context');
    });

    it('should have a required file argument', () => {
      const command = createReadCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('file');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createReadCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--format');
      expect(optionNames).toContain('--token-limit');
      expect(optionNames).toContain('--no-content');
      expect(optionNames).toContain('--no-pointers');
      expect(optionNames).toContain('--with-example');
      expect(optionNames).toContain('--with-source');
      expect(optionNames).toContain('--with-deps');
      expect(optionNames).toContain('--config');
    });

    it('should have correct default for format option', () => {
      const command = createReadCommand();
      const formatOption = command.options.find((opt) => opt.long === '--format');
      expect(formatOption?.defaultValue).toBe('verbose');
    });

    it('should have correct default for token-limit option', () => {
      const command = createReadCommand();
      const tokenLimitOption = command.options.find((opt) => opt.long === '--token-limit');
      expect(tokenLimitOption?.defaultValue).toBe('4000');
    });

    it('should have correct default for config option', () => {
      const command = createReadCommand();
      const configOption = command.options.find((opt) => opt.long === '--config');
      expect(configOption?.defaultValue).toBe('.arch/config.yaml');
    });

    it('should have short flags for common options', () => {
      const command = createReadCommand();
      const formatOption = command.options.find((opt) => opt.long === '--format');
      expect(formatOption?.short).toBe('-f');

      const tokenOption = command.options.find((opt) => opt.long === '--token-limit');
      expect(tokenOption?.short).toBe('-t');

      const configOption = command.options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');
    });
  });

  describe('command execution', () => {
    it('should load config and registry', async () => {
      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(loadConfig).toHaveBeenCalled();
      expect(loadRegistry).toHaveBeenCalled();
    });

    it('should load pattern registry', async () => {
      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(loadPatternRegistry).toHaveBeenCalledWith('/project');
    });

    it('should create HydrationEngine', async () => {
      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(HydrationEngine).toHaveBeenCalled();
    });

    it('should output hydrated content', async () => {
      mockHydrationResult.output = '--- HYDRATED FILE ---\n\nTest content';

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(consoleLogSpy).toHaveBeenCalledWith('--- HYDRATED FILE ---\n\nTest content');
    });

    it('should log token count', async () => {
      mockHydrationResult.tokenCount = 250;

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(logger.info).toHaveBeenCalledWith('Estimated tokens: 250');
    });
  });

  describe('format validation', () => {
    it('should accept verbose format', async () => {
      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'verbose']);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should accept terse format', async () => {
      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'terse']);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should accept ai format', async () => {
      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should reject invalid format', async () => {
      const command = createReadCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'invalid']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid format'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('content options', () => {
    it('should pass includeContent based on format', async () => {
      const mockHydrateFile = vi.fn().mockResolvedValue(mockHydrationResult);
      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as any;
    });

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'verbose']);

      expect(mockHydrateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ includeContent: true })
      );
    });

    it('should exclude content by default for AI format', async () => {
      const mockHydrateFile = vi.fn().mockResolvedValue(mockHydrationResult);
      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as any;
    });

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      // withSource is undefined when not set, which is falsy
      expect(mockHydrateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ includeContent: undefined })
      );
    });

    it('should include content for AI format with --with-source', async () => {
      const mockHydrateFile = vi.fn().mockResolvedValue(mockHydrationResult);
      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as any;
    });

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai', '--with-source']);

      expect(mockHydrateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ includeContent: true })
      );
    });

    it('should pass includePointers option', async () => {
      const mockHydrateFile = vi.fn().mockResolvedValue(mockHydrationResult);
      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as any;
    });

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--no-pointers']);

      expect(mockHydrateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ includePointers: false })
      );
    });

    it('should pass token limit', async () => {
      const mockHydrateFile = vi.fn().mockResolvedValue(mockHydrationResult);
      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as any;
    });

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--token-limit', '2000']);

      expect(mockHydrateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tokenLimit: 2000 })
      );
    });
  });

  describe('layer boundaries', () => {
    it('should compute boundaries for AI format when layers configured', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        version: '1.0',
        registry: {},
        layers: [
          { name: 'core', paths: ['src/core/**/*'], can_import: [] },
          { name: 'cli', paths: ['src/cli/**/*'], can_import: ['core'] },
        ],
      });

      const mockHydrateFile = vi.fn().mockResolvedValue(mockHydrationResult);
      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as any;
    });

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/core/file.ts', '--format', 'ai']);

      expect(mockHydrateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          boundaries: expect.objectContaining({
            layer: 'core',
          }),
        })
      );
    });

    it('should compute cannotImport correctly', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        version: '1.0',
        registry: {},
        layers: [
          { name: 'core', paths: ['src/core/**/*'], can_import: [] },
          { name: 'cli', paths: ['src/cli/**/*'], can_import: ['core'] },
          { name: 'infra', paths: ['src/infra/**/*'], can_import: ['core'] },
        ],
      });

      const mockHydrateFile = vi.fn().mockResolvedValue(mockHydrationResult);
      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as any;
    });

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/core/file.ts', '--format', 'ai']);

      expect(mockHydrateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          boundaries: expect.objectContaining({
            cannotImport: expect.arrayContaining(['cli', 'infra']),
          }),
        })
      );
    });
  });

  describe('reference implementation (--with-example)', () => {
    it('should include reference implementation when --with-example flag is set', async () => {
      mockResolvedArch = {
        architecture: {
          description: 'Test',
          reference_implementations: ['src/examples/golden.ts'],
        },
      };
      mockFileExists = true;
      mockFileContent = '/** @arch test.domain */\nimport { Foo } from "./foo";\nexport class Example { test() { return 1; } }';

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--with-example']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('REFERENCE IMPLEMENTATION'))).toBe(true);
    });

    it('should not show reference implementation when not requested', async () => {
      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('REFERENCE IMPLEMENTATION'))).toBe(false);
    });

    it('should log info when no reference implementations defined', async () => {
      mockResolvedArch = {
        architecture: {
          description: 'Test',
          reference_implementations: [],
        },
      };

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--with-example']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No reference implementations'));
    });

    it('should skip reference file if same as current file', async () => {
      mockResolvedArch = {
        architecture: {
          description: 'Test',
          reference_implementations: ['src/file.ts'], // Same as input file
        },
      };

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--with-example']);

      // Should not show reference implementation, should log no accessible
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No accessible reference'));
    });

    it('should handle missing reference file', async () => {
      mockResolvedArch = {
        architecture: {
          description: 'Test',
          reference_implementations: ['src/missing.ts'],
        },
      };
      mockFileExists = false;

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--with-example']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No accessible reference'));
    });

    it('should not include reference for files without @arch tag', async () => {
      mockArchTag = null;

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--with-example']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('REFERENCE IMPLEMENTATION'))).toBe(false);
    });
  });

  describe('truncation warnings', () => {
    it('should show warning when content is truncated', async () => {
      mockHydrationResult = {
        output: 'Truncated content',
        tokenCount: 4000,
        truncated: true,
        truncationDetails: {
          originalTokens: 6000,
          finalTokens: 4000,
          pointersTruncated: true,
          hintsTruncated: false,
        },
      };

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('truncated'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('6000'));
    });

    it('should show which items were truncated', async () => {
      mockHydrationResult = {
        output: 'Truncated content',
        tokenCount: 4000,
        truncated: true,
        truncationDetails: {
          originalTokens: 6000,
          finalTokens: 4000,
          pointersTruncated: true,
          hintsTruncated: true,
        },
      };

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('pointers'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('hints'));
    });

    it('should not show warning when not truncated', async () => {
      mockHydrationResult = {
        output: 'Full content',
        tokenCount: 500,
        truncated: false,
      };

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('truncated'));
    });
  });

  describe('arch config files', () => {
    it('should skip pattern registry for .arch/ files', async () => {
      const mockHydrateFile = vi.fn().mockResolvedValue(mockHydrationResult);
      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as any;
    });

      const command = createReadCommand();
      await command.parseAsync(['node', 'test', '.arch/config.yaml']);

      expect(mockHydrateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          patternRegistry: undefined,
        })
      );
    });
  });

  describe('config option', () => {
    it('should use custom config path when provided', async () => {
      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--config', 'custom/config.yaml']);

      expect(loadConfig).toHaveBeenCalledWith('/project', 'custom/config.yaml');
    });

    it('should use default config path when not provided', async () => {
      const command = createReadCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(loadConfig).toHaveBeenCalledWith('/project', '.arch/config.yaml');
    });
  });

  describe('error handling', () => {
    it('should handle config loading errors', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));

      const command = createReadCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle registry loading errors', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry not found'));

      const command = createReadCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValue('string error');

      const command = createReadCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Unknown error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
