/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the check command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCheckCommand } from '../../../../src/cli/commands/check.js';
import type { BatchValidationResult } from '../../../../src/core/validation/types.js';

// Configurable mock behavior
let mockValidationResult: BatchValidationResult = {
  results: [],
  summary: { failed: 0, passed: 0, warned: 0, errors: 0, warnings: 0 },
};

let mockGlobFiles: string[] = [];
let mockStagedFiles: string[] = [];
let mockRegistryLoadError: Error | null = null;

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    files: {
      source_patterns: ['src/**/*.ts'],
      scan: {
        include: ['src/**/*.ts'],
        exclude: ['**/*.test.ts'],
      },
    },
    validation: {
      exit_codes: { success: 0, error: 1, warning_only: 2 },
      precommit: {},
    },
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockImplementation(async () => {
    if (mockRegistryLoadError) throw mockRegistryLoadError;
    return { architectures: {}, mixins: {} };
  }),
  loadPartialRegistry: vi.fn().mockResolvedValue({
    architectures: {},
    mixins: {},
  }),
  loadRegistryFromFiles: vi.fn().mockResolvedValue({
    architectures: {},
    mixins: {},
  }),
  getRegistryContent: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../../../src/core/validation/engine.js', () => ({
  ValidationEngine: vi.fn(function() {
    return {
    validateFiles: vi.fn().mockImplementation(async () => mockValidationResult),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/cli/formatters/index.js', () => ({
  JsonFormatter: vi.fn(function() {
    return {
    formatBatch: vi.fn().mockReturnValue('{}'),
  };
  }),
  HumanFormatter: vi.fn(function() {
    return {
    formatBatch: vi.fn().mockReturnValue('All files passed'),
    formatSuggestions: vi.fn().mockReturnValue(''),
  };
  }),
  CompactFormatter: vi.fn(function() {
    return {
    formatBatch: vi.fn().mockReturnValue(''),
  };
  }),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockImplementation(async () => mockGlobFiles),
  readFile: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn().mockResolvedValue({
    filter: vi.fn((files: string[]) => files),
  }),
}));

vi.mock('../../../../src/utils/git.js', () => ({
  getStagedFiles: vi.fn().mockImplementation(async () => mockStagedFiles),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/path-matcher.js', () => ({
  createPathMatcher: vi.fn().mockReturnValue({
    filter: vi.fn((files: string[]) => files),
  }),
  hasPatternConfig: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../../src/core/feedback/store.js', () => ({
  FeedbackStore: vi.fn(function() {
    return {
    recordViolations: vi.fn().mockResolvedValue(0),
  };
  }),
}));

vi.mock('../../../../src/core/similarity/index.js', () => ({
  detectDuplicates: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../src/core/patterns/loader.js', () => ({
  loadPatternRegistry: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../src/core/cache/index.js', () => ({
  CacheManager: vi.fn(function() {
    return {
    load: vi.fn().mockResolvedValue(undefined),
  };
  }),
}));

vi.mock('./check-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/cli/commands/check-helpers.js')>();
  return {
    ...actual,
    runProjectValidation: vi.fn().mockResolvedValue({
      result: mockValidationResult,
      projectStats: undefined,
      incrementalStats: undefined,
      cacheStats: undefined,
    }),
  };
});

import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry, loadPartialRegistry, loadRegistryFromFiles } from '../../../../src/core/registry/loader.js';
import { ValidationEngine } from '../../../../src/core/validation/engine.js';
import { JsonFormatter, HumanFormatter, CompactFormatter } from '../../../../src/cli/formatters/index.js';
import { globFiles } from '../../../../src/utils/file-system.js';
import { loadArchIgnore } from '../../../../src/utils/archignore.js';
import { getStagedFiles } from '../../../../src/utils/git.js';
import { logger } from '../../../../src/utils/logger.js';
import { hasPatternConfig, createPathMatcher } from '../../../../src/utils/path-matcher.js';
import { FeedbackStore } from '../../../../src/core/feedback/store.js';
import { detectDuplicates } from '../../../../src/core/similarity/index.js';

describe('check command', () => {
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
    mockValidationResult = {
      results: [],
      summary: { failed: 0, passed: 0, warned: 0, errors: 0, warnings: 0 },
    };
    mockGlobFiles = ['src/file.ts'];
    mockStagedFiles = [];
    mockRegistryLoadError = null;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createCheckCommand', () => {
    it('should create a command with correct name', () => {
      const command = createCheckCommand();
      expect(command.name()).toBe('check');
    });

    it('should have the correct description', () => {
      const command = createCheckCommand();
      expect(command.description()).toBe('Validate files against architecture rules');
    });

    it('should have an optional files argument', () => {
      const command = createCheckCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('files');
      expect(args[0].required).toBe(false);
      expect(args[0].variadic).toBe(true);
    });

    it('should have all required options', () => {
      const command = createCheckCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--format');
      expect(optionNames).toContain('--strict');
      expect(optionNames).toContain('--quiet');
      expect(optionNames).toContain('--verbose');
      expect(optionNames).toContain('--show-all');
      expect(optionNames).toContain('--severity');
      expect(optionNames).toContain('--errors-only');
      expect(optionNames).toContain('--config');
      expect(optionNames).toContain('--precommit');
      expect(optionNames).toContain('--max-errors');
      expect(optionNames).toContain('--max-warnings');
      expect(optionNames).toContain('--staged');
      expect(optionNames).toContain('--include');
      expect(optionNames).toContain('--exclude');
      expect(optionNames).toContain('--project');
      expect(optionNames).toContain('--record-violations');
      expect(optionNames).toContain('--detect-duplicates');
      expect(optionNames).toContain('--similarity-threshold');
      expect(optionNames).toContain('--no-cache');
      expect(optionNames).toContain('--incremental');
      expect(optionNames).toContain('--registry');
      expect(optionNames).toContain('--registry-pattern');
    });

    it('should have correct default for format option', () => {
      const command = createCheckCommand();
      const formatOption = command.options.find((opt) => opt.long === '--format');
      expect(formatOption?.defaultValue).toBe('human');
    });

    it('should have correct default for similarity-threshold option', () => {
      const command = createCheckCommand();
      const thresholdOption = command.options.find((opt) => opt.long === '--similarity-threshold');
      expect(thresholdOption?.defaultValue).toBe('0.7');
    });

    it('should support variadic include patterns', () => {
      const command = createCheckCommand();
      const includeOption = command.options.find((opt) => opt.long === '--include');
      expect(includeOption?.variadic).toBe(true);
    });

    it('should support variadic exclude patterns', () => {
      const command = createCheckCommand();
      const excludeOption = command.options.find((opt) => opt.long === '--exclude');
      expect(excludeOption?.variadic).toBe(true);
    });
  });

  describe('command execution', () => {
    it('should load config and registry', async () => {
      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test']);
      } catch {
        // process.exit
      }

      expect(loadConfig).toHaveBeenCalled();
      expect(loadRegistry).toHaveBeenCalled();
    });

    it('should load archignore', async () => {
      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test']);
      } catch {
        // process.exit
      }

      expect(loadArchIgnore).toHaveBeenCalledWith('/project');
    });

    it('should create ValidationEngine', async () => {
      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test']);
      } catch {
        // process.exit
      }

      expect(ValidationEngine).toHaveBeenCalled();
    });

    it('should exit with 0 when no violations', async () => {
      mockValidationResult = {
        results: [],
        summary: { failed: 0, passed: 1, warned: 0, errors: 0, warnings: 0 },
      };

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test']);
      } catch {
        // process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit with 1 when errors found', async () => {
      mockValidationResult = {
        results: [{
          file: 'src/file.ts',
          violations: [{ rule: 'forbid_import', value: 'axios', severity: 'error', message: 'Test' }],
          archId: 'test',
        }],
        summary: { failed: 1, passed: 0, warned: 0, errors: 1, warnings: 0 },
      };

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test']);
      } catch {
        // process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('file selection', () => {
    it('should use glob patterns from config when no files specified', async () => {
      mockGlobFiles = ['src/app.ts', 'src/utils.ts'];

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test']);
      } catch {
        // process.exit
      }

      expect(globFiles).toHaveBeenCalled();
    });

    it('should use staged files when --staged flag is set', async () => {
      mockStagedFiles = ['src/changed.ts'];

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--staged']);
      } catch {
        // process.exit
      }

      expect(getStagedFiles).toHaveBeenCalledWith('/project');
    });

    it('should warn and exit when no files found', async () => {
      mockGlobFiles = [];

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test']);
      } catch {
        // process.exit
      }

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No files found'));
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should apply path matcher when include/exclude patterns configured', async () => {
      vi.mocked(hasPatternConfig).mockReturnValue(true);

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--include', 'src/new/**']);
      } catch {
        // process.exit
      }

      expect(createPathMatcher).toHaveBeenCalled();
    });
  });

  describe('output formats', () => {
    it('should use HumanFormatter by default', async () => {
      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test']);
      } catch {
        // process.exit
      }

      expect(HumanFormatter).toHaveBeenCalled();
    });

    it('should use JsonFormatter when --format json', async () => {
      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--format', 'json']);
      } catch {
        // process.exit
      }

      expect(JsonFormatter).toHaveBeenCalled();
    });

    it('should use CompactFormatter when --format compact', async () => {
      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--format', 'compact']);
      } catch {
        // process.exit
      }

      expect(CompactFormatter).toHaveBeenCalled();
    });
  });

  describe('registry loading', () => {
    it('should load partial registry when --registry-pattern specified', async () => {
      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--registry-pattern', 'cli/**']);
      } catch {
        // process.exit
      }

      expect(loadPartialRegistry).toHaveBeenCalled();
    });

    it('should load registry from files when --registry points to yaml file', async () => {
      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--registry', 'custom/registry.yaml']);
      } catch {
        // process.exit
      }

      expect(loadRegistryFromFiles).toHaveBeenCalled();
    });

    it('should handle registry loading errors', async () => {
      mockRegistryLoadError = new Error('Registry not found');

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test']);
      } catch {
        // process.exit
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load registry'),
        expect.any(Error)
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('validation options', () => {
    it('should pass strict option to validation engine', async () => {
      const mockValidateFiles = vi.fn().mockResolvedValue(mockValidationResult);
      vi.mocked(ValidationEngine).mockImplementation(function() {
      return {
        validateFiles: mockValidateFiles,
        dispose: vi.fn(),
      } as any;
    });

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--strict']);
      } catch {
        // process.exit
      }

      expect(mockValidateFiles).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ strict: true })
      );
    });

    it('should pass severity filter when --severity specified', async () => {
      const mockValidateFiles = vi.fn().mockResolvedValue(mockValidationResult);
      vi.mocked(ValidationEngine).mockImplementation(function() {
      return {
        validateFiles: mockValidateFiles,
        dispose: vi.fn(),
      } as any;
    });

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--severity', 'error']);
      } catch {
        // process.exit
      }

      expect(mockValidateFiles).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ severities: ['error'] })
      );
    });

    it('should error when --incremental used without --project', async () => {
      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--incremental']);
      } catch {
        // process.exit
      }

      expect(logger.error).toHaveBeenCalledWith('--incremental requires --project flag');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('duplicate detection', () => {
    it('should detect duplicates when --detect-duplicates flag set', async () => {
      mockGlobFiles = ['src/file1.ts', 'src/file2.ts'];

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--detect-duplicates']);
      } catch {
        // process.exit
      }

      expect(detectDuplicates).toHaveBeenCalled();
    });

    it('should not detect duplicates for single file', async () => {
      mockGlobFiles = ['src/file.ts'];

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--detect-duplicates']);
      } catch {
        // process.exit
      }

      // Should not call detectDuplicates for single file
      expect(detectDuplicates).not.toHaveBeenCalled();
    });
  });

  describe('violation recording', () => {
    it('should record violations when --record-violations flag set', async () => {
      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--record-violations']);
      } catch {
        // process.exit
      }

      expect(FeedbackStore).toHaveBeenCalledWith('/project');
    });
  });

  describe('quiet mode', () => {
    it('should suppress info logs in quiet mode', async () => {
      mockGlobFiles = ['src/file.ts'];

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test', '--quiet']);
      } catch {
        // process.exit
      }

      // In quiet mode, info messages should not be shown
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Validating'));
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      vi.mocked(ValidationEngine).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockRejectedValue(new Error('Validation failed')),
        dispose: vi.fn(),
      } as any;
    });

      try {
        const command = createCheckCommand();
        await command.parseAsync(['node', 'test']);
      } catch {
        // process.exit
      }

      expect(logger.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
