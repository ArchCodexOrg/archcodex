/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the learn command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLearnCommand } from '../../../../src/cli/commands/learn.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
      green: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockConfigResult = {
  version: '1.0',
  files: { source_patterns: ['src/**/*.ts'] },
  llm: {},
};

let mockSkeletonResult = {
  skeleton: {
    totalFiles: 10,
    importClusters: [{ name: 'cluster1', files: [] }],
    existingTags: [{ archId: 'test.arch', count: 5 }],
  },
  extractionTimeMs: 150,
  warnings: [] as string[],
};

let mockProvidersList = [
  { name: 'anthropic', available: true, model: 'claude-3' },
  { name: 'openai', available: false, model: null },
  { name: 'prompt', available: true, model: null },
];

let mockCurrentProvider = {
  name: 'prompt' as string,
  learn: vi.fn(),
  formatLearnPrompt: vi.fn().mockReturnValue('Formatted LLM prompt'),
};

let mockLearnResponse = {
  registryYaml: 'architectures:\n  base: {}\n',
  confidence: 0.85,
  explanation: 'Generated based on file structure',
  suggestions: ['Review the generated registry', 'Run archcodex check'],
  tokenUsage: { total: 1000, input: 800, output: 200 },
  error: undefined as string | undefined,
};

let mockFileExists = true;

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockImplementation(async () => mockConfigResult),
}));

vi.mock('../../../../src/core/learn/index.js', () => ({
  SkeletonExtractor: vi.fn().mockImplementation(() => ({
    extract: vi.fn().mockImplementation(async () => mockSkeletonResult),
    dispose: vi.fn(),
  })),
  formatSkeletonForPrompt: vi.fn().mockReturnValue('skeleton: yaml'),
}));

vi.mock('../../../../src/llm/providers/factory.js', () => ({
  getAvailableProvider: vi.fn().mockImplementation(() => mockCurrentProvider),
  listProviders: vi.fn().mockImplementation(() => mockProvidersList),
}));

vi.mock('../../../../src/llm/providers/prompt.js', () => ({
  PromptProvider: vi.fn(),
}));

vi.mock('../../../../src/utils/archconfig.js', () => ({
  loadArchConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockImplementation(async () => mockFileExists),
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

import { loadConfig } from '../../../../src/core/config/loader.js';
import { SkeletonExtractor, formatSkeletonForPrompt } from '../../../../src/core/learn/index.js';
import { getAvailableProvider, listProviders } from '../../../../src/llm/providers/factory.js';
import { fileExists, writeFile } from '../../../../src/utils/file-system.js';
import { logger as log } from '../../../../src/utils/logger.js';

describe('learn command', () => {
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
    mockConfigResult = {
      version: '1.0',
      files: { source_patterns: ['src/**/*.ts'] },
      llm: {},
    };

    mockSkeletonResult = {
      skeleton: {
        totalFiles: 10,
        importClusters: [{ name: 'cluster1', files: [] }],
        existingTags: [{ archId: 'test.arch', count: 5 }],
      },
      extractionTimeMs: 150,
      warnings: [],
    };

    mockProvidersList = [
      { name: 'anthropic', available: true, model: 'claude-3' },
      { name: 'openai', available: false, model: null },
      { name: 'prompt', available: true, model: null },
    ];

    mockCurrentProvider = {
      name: 'prompt',
      learn: vi.fn().mockImplementation(async () => mockLearnResponse),
      formatLearnPrompt: vi.fn().mockReturnValue('Formatted LLM prompt'),
    };

    mockLearnResponse = {
      registryYaml: 'architectures:\n  base: {}\n',
      confidence: 0.85,
      explanation: 'Generated based on file structure',
      suggestions: ['Review the generated registry', 'Run archcodex check'],
      tokenUsage: { total: 1000, input: 800, output: 200 },
      error: undefined,
    };

    mockFileExists = true;

    // Reset mocks to use current variables
    vi.mocked(loadConfig).mockImplementation(async () => mockConfigResult);
    vi.mocked(SkeletonExtractor).mockImplementation(() => ({
      extract: vi.fn().mockImplementation(async () => mockSkeletonResult),
      dispose: vi.fn(),
    }) as any);
    vi.mocked(getAvailableProvider).mockImplementation(() => mockCurrentProvider as any);
    vi.mocked(listProviders).mockImplementation(() => mockProvidersList as any);
    vi.mocked(fileExists).mockImplementation(async () => mockFileExists);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createLearnCommand', () => {
    it('should create a command with correct name', () => {
      const command = createLearnCommand();
      expect(command.name()).toBe('learn');
    });

    it('should have the correct description', () => {
      const command = createLearnCommand();
      expect(command.description()).toContain('Bootstrap');
    });

    it('should have an optional path argument', () => {
      const command = createLearnCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('path');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createLearnCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--output');
      expect(optionNames).toContain('--provider');
      expect(optionNames).toContain('--dry-run');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--max-files');
      expect(optionNames).toContain('--hints');
      expect(optionNames).toContain('--list-providers');
    });

    it('should have short flags for options', () => {
      const command = createLearnCommand();
      const options = command.options;

      const outputOption = options.find((opt) => opt.long === '--output');
      expect(outputOption?.short).toBe('-o');

      const providerOption = options.find((opt) => opt.long === '--provider');
      expect(providerOption?.short).toBe('-p');
    });
  });

  describe('list providers', () => {
    it('should list available providers when --list-providers is used', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      expect(listProviders).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Available LLM Providers'))).toBe(true);
    });

    it('should show checkmark for available providers', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('✓'))).toBe(true);
    });

    it('should show X for unavailable providers', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('✗'))).toBe(true);
    });

    it('should show model info when available', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('claude-3'))).toBe(true);
    });
  });

  describe('path validation', () => {
    it('should error when path does not exist', async () => {
      mockFileExists = false;

      const command = createLearnCommand();

      try {
        await command.parseAsync(['node', 'test', 'nonexistent/']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Path not found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should use default path when not provided', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      expect(fileExists).toHaveBeenCalledWith('/project/src');
    });

    it('should use provided path', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', 'lib/', '--dry-run']);

      expect(fileExists).toHaveBeenCalledWith('/project/lib');
    });
  });

  describe('skeleton extraction', () => {
    it('should create SkeletonExtractor with project root', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      expect(SkeletonExtractor).toHaveBeenCalledWith('/project');
    });

    it('should pass maxFiles option to extractor', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--dry-run', '--max-files', '50']);

      const extractorInstance = vi.mocked(SkeletonExtractor).mock.results[0].value;
      expect(extractorInstance.extract).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFiles: 50,
        })
      );
    });

    it('should dispose extractor after use', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      const extractorInstance = vi.mocked(SkeletonExtractor).mock.results[0].value;
      expect(extractorInstance.dispose).toHaveBeenCalled();
    });

    it('should show extraction stats', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('10') && c?.includes('files'))).toBe(true);
      expect(calls.some((c) => c?.includes('Clusters'))).toBe(true);
    });

    it('should show warnings from extraction', async () => {
      mockSkeletonResult.warnings = ['Warning 1', 'Warning 2'];

      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Warning 1'))).toBe(true);
      expect(calls.some((c) => c?.includes('Warning 2'))).toBe(true);
    });
  });

  describe('dry run mode', () => {
    it('should not call LLM in dry run mode', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      expect(mockCurrentProvider.learn).not.toHaveBeenCalled();
    });

    it('should output skeleton in dry run mode', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('PROJECT SKELETON'))).toBe(true);
    });

    it('should output JSON skeleton when --json is used', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--dry-run', '--json']);

      // formatSkeletonForPrompt should NOT be called for JSON output
      // Instead, JSON.stringify is used
      const calls = consoleLogSpy.mock.calls;
      const jsonCall = calls.find((c) => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
    });

    it('should output formatted skeleton without --json', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      expect(formatSkeletonForPrompt).toHaveBeenCalled();
    });
  });

  describe('prompt provider mode', () => {
    it('should show prompt when using prompt provider', async () => {
      mockCurrentProvider.name = 'prompt';

      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockCurrentProvider.formatLearnPrompt).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Formatted LLM prompt'))).toBe(true);
    });

    it('should pass hints to prompt provider', async () => {
      mockCurrentProvider.name = 'prompt';

      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--hints', 'Focus on API patterns']);

      expect(mockCurrentProvider.formatLearnPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          userHints: 'Focus on API patterns',
        })
      );
    });

    it('should show instructions for prompt mode', async () => {
      mockCurrentProvider.name = 'prompt';

      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Prompt mode'))).toBe(true);
      expect(calls.some((c) => c?.includes('registry-draft.yaml'))).toBe(true);
    });

    it('should show migrate-registry guidance in prompt mode', async () => {
      mockCurrentProvider.name = 'prompt';

      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('migrate-registry'))).toBe(true);
    });

    it('should not call learn method for prompt provider', async () => {
      mockCurrentProvider.name = 'prompt';

      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockCurrentProvider.learn).not.toHaveBeenCalled();
    });
  });

  describe('LLM provider mode', () => {
    beforeEach(() => {
      mockCurrentProvider.name = 'anthropic';
    });

    it('should call learn on non-prompt provider', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockCurrentProvider.learn).toHaveBeenCalled();
    });

    it('should pass skeleton to provider', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockCurrentProvider.learn).toHaveBeenCalledWith(
        expect.objectContaining({
          skeletonYaml: 'skeleton: yaml',
        })
      );
    });

    it('should pass hints to provider', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--hints', 'Focus on services']);

      expect(mockCurrentProvider.learn).toHaveBeenCalledWith(
        expect.objectContaining({
          userHints: 'Focus on services',
        })
      );
    });

    it('should write registry to output file', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('registry-draft.yaml'),
        mockLearnResponse.registryYaml
      );
    });

    it('should use custom output path', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test', '--output', '.arch/custom.yaml']);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('custom.yaml'),
        expect.any(String)
      );
    });

    it('should show generated registry info', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('GENERATED REGISTRY'))).toBe(true);
      expect(calls.some((c) => c?.includes('85%'))).toBe(true);
    });

    it('should show token usage', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('1000'))).toBe(true);
    });

    it('should show explanation', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Generated based on file structure'))).toBe(true);
    });

    it('should show suggestions', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Next Steps'))).toBe(true);
      expect(calls.some((c) => c?.includes('Review the generated registry'))).toBe(true);
    });

    it('should show migrate-registry guidance', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('migrate-registry'))).toBe(true);
      expect(calls.some((c) => c?.includes('multi-file registry'))).toBe(true);
    });

    it('should show next steps', async () => {
      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('archcodex simulate'))).toBe(true);
    });
  });

  describe('LLM errors', () => {
    beforeEach(() => {
      mockCurrentProvider.name = 'anthropic';
    });

    it('should error when LLM returns error', async () => {
      mockLearnResponse.error = 'Rate limit exceeded';
      mockCurrentProvider.learn = vi.fn().mockResolvedValue(mockLearnResponse);

      const command = createLearnCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('LLM error'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should error when LLM returns empty registry', async () => {
      mockLearnResponse.registryYaml = '';
      mockLearnResponse.error = undefined;
      mockCurrentProvider.learn = vi.fn().mockResolvedValue(mockLearnResponse);

      const command = createLearnCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('empty registry'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling', () => {
    it('should handle config loading errors', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config error'));

      const command = createLearnCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Config error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle extraction errors', async () => {
      vi.mocked(SkeletonExtractor).mockImplementation(() => ({
        extract: vi.fn().mockRejectedValue(new Error('Extraction failed')),
        dispose: vi.fn(),
      }) as any);

      const command = createLearnCommand();

      try {
        await command.parseAsync(['node', 'test', '--dry-run']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Extraction failed');
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValue('string error');

      const command = createLearnCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Unknown error');
    });
  });

  describe('provider selection', () => {
    it('should use specified provider', async () => {
      const command = createLearnCommand();
      // Not dry-run so it gets to provider selection
      await command.parseAsync(['node', 'test', '--provider', 'openai']);

      expect(getAvailableProvider).toHaveBeenCalledWith('openai', expect.any(Object), expect.any(Object));
    });

    it('should use auto provider when not specified', async () => {
      const command = createLearnCommand();
      // Not dry-run so it gets to provider selection
      await command.parseAsync(['node', 'test']);

      expect(getAvailableProvider).toHaveBeenCalledWith(undefined, expect.any(Object), expect.any(Object));
    });
  });

  describe('no token usage', () => {
    it('should handle missing token usage gracefully', async () => {
      mockCurrentProvider.name = 'anthropic';
      mockLearnResponse.tokenUsage = undefined as any;
      mockCurrentProvider.learn = vi.fn().mockResolvedValue(mockLearnResponse);

      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      // Should complete without error
      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('no suggestions', () => {
    it('should handle empty suggestions', async () => {
      mockCurrentProvider.name = 'anthropic';
      mockLearnResponse.suggestions = [];
      mockCurrentProvider.learn = vi.fn().mockResolvedValue(mockLearnResponse);

      const command = createLearnCommand();
      await command.parseAsync(['node', 'test']);

      // Should complete without error
      expect(writeFile).toHaveBeenCalled();

      // Should not show "Next Steps" section
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      const nextStepsCall = calls.filter((c) => c?.includes('Next Steps'));
      // The "Next Steps" is for suggestions, not for the preview commands
      expect(nextStepsCall.length).toBeLessThanOrEqual(1);
    });
  });
});
