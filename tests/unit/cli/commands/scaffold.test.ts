/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the scaffold command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScaffoldCommand } from '../../../../src/cli/commands/scaffold.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    magenta: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockScaffoldResult = {
  success: true,
  filePath: 'src/services/TestService.ts',
  content: '/** @arch domain.service */\nexport class TestService {}',
  error: undefined as string | undefined,
};

let mockIntentSuggestions: Array<{ name: string; description: string; reason: string }> = [];
let mockIntentRegistry = { intents: {} };

// Mock dependencies
vi.mock('../../../../src/core/discovery/index.js', () => ({
  loadIndex: vi.fn().mockResolvedValue({
    entries: [],
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {},
    mixins: {},
  }),
  loadIntentRegistry: vi.fn().mockImplementation(async () => mockIntentRegistry),
  suggestIntents: vi.fn().mockImplementation(() => mockIntentSuggestions),
}));

vi.mock('../../../../src/core/scaffold/index.js', () => ({
  ScaffoldEngine: vi.fn().mockImplementation(() => ({
    scaffold: vi.fn().mockImplementation(async () => mockScaffoldResult),
  })),
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

import { ScaffoldEngine } from '../../../../src/core/scaffold/index.js';
import { loadRegistry, loadIntentRegistry, suggestIntents } from '../../../../src/core/registry/loader.js';
import { logger as log } from '../../../../src/utils/logger.js';

describe('scaffold command', () => {
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

    // Reset mock data
    mockScaffoldResult = {
      success: true,
      filePath: 'src/services/TestService.ts',
      content: '/** @arch domain.service */\nexport class TestService {}',
      error: undefined,
    };

    mockIntentSuggestions = [];
    mockIntentRegistry = { intents: {} };

    // Reset mocks
    vi.mocked(ScaffoldEngine).mockImplementation(() => ({
      scaffold: vi.fn().mockImplementation(async () => mockScaffoldResult),
    }) as any);

    vi.mocked(loadIntentRegistry).mockImplementation(async () => mockIntentRegistry);
    vi.mocked(suggestIntents).mockImplementation(() => mockIntentSuggestions);
    vi.mocked(loadRegistry).mockResolvedValue({ architectures: {}, mixins: {} });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createScaffoldCommand', () => {
    it('should create a command with correct name', () => {
      const command = createScaffoldCommand();
      expect(command.name()).toBe('scaffold');
    });

    it('should have the correct description', () => {
      const command = createScaffoldCommand();
      expect(command.description()).toBe('Generate a new file from an architecture template');
    });

    it('should have a required archId argument', () => {
      const command = createScaffoldCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('archId');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createScaffoldCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--name');
      expect(optionNames).toContain('--output');
      expect(optionNames).toContain('--template');
      expect(optionNames).toContain('--lang');
      expect(optionNames).toContain('--overwrite');
      expect(optionNames).toContain('--dry-run');
    });

    it('should have short flags for common options', () => {
      const command = createScaffoldCommand();
      const options = command.options;

      const nameOption = options.find((opt) => opt.long === '--name');
      expect(nameOption?.short).toBe('-n');

      const outputOption = options.find((opt) => opt.long === '--output');
      expect(outputOption?.short).toBe('-o');

      const templateOption = options.find((opt) => opt.long === '--template');
      expect(templateOption?.short).toBe('-t');
    });
  });

  describe('missing name', () => {
    it('should error when name is not provided', async () => {
      const command = createScaffoldCommand();

      try {
        await command.parseAsync(['node', 'test', 'domain.service']);
      } catch {
        // Expected - process.exit throws
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('--name is required'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('successful scaffold', () => {
    it('should create ScaffoldEngine and call scaffold', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'TestService']);

      expect(ScaffoldEngine).toHaveBeenCalledWith('/project', '.arch/templates', expect.any(Object));
    });

    it('should show success message', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'TestService']);

      expect(log.success).toHaveBeenCalledWith(expect.stringContaining('Created'));
    });

    it('should show next steps', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'TestService']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Next steps'))).toBe(true);
      expect(calls.some((c) => c?.includes('archcodex check'))).toBe(true);
    });
  });

  describe('dry run mode', () => {
    it('should show dry run header', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'TestService', '--dry-run']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Dry Run'))).toBe(true);
    });

    it('should show file path in dry run', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'TestService', '--dry-run']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Path:'))).toBe(true);
    });

    it('should show generated content in dry run', async () => {
      mockScaffoldResult.content = '// Generated content';

      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'TestService', '--dry-run']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('// Generated content'))).toBe(true);
    });

    it('should not call log.success in dry run', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'TestService', '--dry-run']);

      expect(log.success).not.toHaveBeenCalled();
    });

    it('should show intent suggestions in dry run', async () => {
      mockIntentRegistry = {
        intents: {
          'admin-only': { description: 'Admin access', paths: [], architectures: [] },
        },
      };
      mockIntentSuggestions = [
        { name: 'admin-only', description: 'Admin access', reason: 'arch' },
      ];

      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'TestService', '--dry-run']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Suggested intents'))).toBe(true);
      expect(calls.some((c) => c?.includes('@intent:admin-only'))).toBe(true);
    });
  });

  describe('scaffold failure', () => {
    it('should error when scaffold fails', async () => {
      mockScaffoldResult = {
        success: false,
        filePath: undefined,
        content: '',
        error: 'Architecture not found',
      };

      const command = createScaffoldCommand();

      try {
        await command.parseAsync(['node', 'test', 'nonexistent.arch', '--name', 'Test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Architecture not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should show generic error when no error message', async () => {
      mockScaffoldResult = {
        success: false,
        filePath: undefined,
        content: '',
        error: undefined,
      };

      const command = createScaffoldCommand();

      try {
        await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Unknown error');
    });
  });

  describe('intent suggestions', () => {
    it('should show intent suggestions after successful scaffold', async () => {
      mockIntentRegistry = {
        intents: {
          'public-api': { description: 'Public API endpoint', paths: [], architectures: [] },
        },
      };
      mockIntentSuggestions = [
        { name: 'public-api', description: 'Public API endpoint', reason: 'path' },
      ];

      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'TestService']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Suggested intents'))).toBe(true);
      expect(calls.some((c) => c?.includes('@intent:public-api'))).toBe(true);
    });

    it('should show reason for path-based suggestions', async () => {
      mockIntentRegistry = {
        intents: {
          'api-endpoint': { description: 'API', paths: [], architectures: [] },
        },
      };
      mockIntentSuggestions = [
        { name: 'api-endpoint', description: 'API', reason: 'path' },
      ];

      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('path match'))).toBe(true);
    });

    it('should show reason for arch-based suggestions', async () => {
      mockIntentRegistry = {
        intents: {
          'domain': { description: 'Domain', paths: [], architectures: [] },
        },
      };
      mockIntentSuggestions = [
        { name: 'domain', description: 'Domain logic', reason: 'arch' },
      ];

      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('arch match'))).toBe(true);
    });

    it('should show example intent comment block', async () => {
      mockIntentRegistry = {
        intents: {
          'test-intent': { description: 'Test', paths: [], architectures: [] },
        },
      };
      mockIntentSuggestions = [
        { name: 'test-intent', description: 'Test intent', reason: 'path' },
      ];

      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('@arch domain.service'))).toBe(true);
      expect(calls.some((c) => c?.includes('@intent:test-intent'))).toBe(true);
    });

    it('should not show intent suggestions when registry is empty', async () => {
      mockIntentRegistry = { intents: {} };
      mockIntentSuggestions = [];

      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'TestService']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Suggested intents'))).toBe(false);
    });
  });

  describe('options passthrough', () => {
    it('should pass output path to scaffold engine', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test', '--output', 'src/custom']);

      const engineInstance = vi.mocked(ScaffoldEngine).mock.results[0].value;
      expect(engineInstance.scaffold).toHaveBeenCalledWith(
        expect.objectContaining({
          outputPath: 'src/custom',
        }),
        expect.any(Object)
      );
    });

    it('should pass template to scaffold engine', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test', '--template', 'custom.hbs']);

      const engineInstance = vi.mocked(ScaffoldEngine).mock.results[0].value;
      expect(engineInstance.scaffold).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'custom.hbs',
        }),
        expect.any(Object)
      );
    });

    it('should pass overwrite flag to scaffold engine', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test', '--overwrite']);

      const engineInstance = vi.mocked(ScaffoldEngine).mock.results[0].value;
      expect(engineInstance.scaffold).toHaveBeenCalledWith(
        expect.objectContaining({
          overwrite: true,
        }),
        expect.any(Object)
      );
    });

    it('should pass language option to scaffold engine (python)', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test', '--lang', 'python']);

      const engineInstance = vi.mocked(ScaffoldEngine).mock.results[0].value;
      expect(engineInstance.scaffold).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'python',
        }),
        expect.any(Object)
      );
    });

    it('should pass language option to scaffold engine (go)', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test', '--lang', 'go']);

      const engineInstance = vi.mocked(ScaffoldEngine).mock.results[0].value;
      expect(engineInstance.scaffold).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'go',
        }),
        expect.any(Object)
      );
    });

    it('should normalize language alias (py -> python)', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test', '--lang', 'py']);

      const engineInstance = vi.mocked(ScaffoldEngine).mock.results[0].value;
      expect(engineInstance.scaffold).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'python',
        }),
        expect.any(Object)
      );
    });

    it('should normalize language alias (ts -> typescript)', async () => {
      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test', '--lang', 'ts']);

      const engineInstance = vi.mocked(ScaffoldEngine).mock.results[0].value;
      expect(engineInstance.scaffold).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'typescript',
        }),
        expect.any(Object)
      );
    });
  });

  describe('language validation', () => {
    it('should error on invalid language', async () => {
      const command = createScaffoldCommand();

      try {
        await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test', '--lang', 'ruby']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Invalid language'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('registry loading', () => {
    it('should continue if registry fails to load', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry not found'));

      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test']);

      // Should still succeed
      expect(log.success).toHaveBeenCalled();
    });

    it('should continue if intent registry fails to load', async () => {
      vi.mocked(loadIntentRegistry).mockRejectedValue(new Error('Intent registry not found'));

      const command = createScaffoldCommand();
      await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test']);

      // Should still succeed
      expect(log.success).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle unexpected errors', async () => {
      vi.mocked(ScaffoldEngine).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const command = createScaffoldCommand();

      try {
        await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Unexpected error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(ScaffoldEngine).mockImplementation(() => {
        throw 'string error';
      });

      const command = createScaffoldCommand();

      try {
        await command.parseAsync(['node', 'test', 'domain.service', '--name', 'Test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Unknown error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
