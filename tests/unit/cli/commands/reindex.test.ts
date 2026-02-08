/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the reindex command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createReindexCommand } from '../../../../src/cli/commands/reindex.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    gray: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockRegistryResult = {
  nodes: {
    base: { description: 'Base' },
    'archcodex.core': { description: 'Core' },
  } as Record<string, { description: string }>,
  mixins: {},
};

let mockConfigResult = {
  version: '1.0',
  files: { source_patterns: ['src/**/*.ts'] },
  llm: {},
};

let mockProvidersList = [
  { name: 'anthropic', available: true, model: 'claude-3' },
  { name: 'openai', available: false, model: null },
  { name: 'prompt', available: true, model: null },
];

let mockSingleReindexResult = {
  success: true as boolean,
  archId: 'test.arch',
  keywords: ['test', 'keyword'],
  error: undefined as string | undefined,
};

let mockReindexAllResult = {
  success: true,
  results: [
    { archId: 'base', keywords: ['base', 'foundation'] },
    { archId: 'archcodex.core', keywords: ['core', 'engine'] },
  ],
};

// Mock dependencies
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockImplementation(async () => mockRegistryResult),
}));

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockImplementation(async () => mockConfigResult),
}));

vi.mock('../../../../src/utils/index.js', () => ({
  loadArchConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../../src/llm/reindexer.js', () => ({
  reindexArchitecture: vi.fn().mockImplementation(async () => mockSingleReindexResult),
  reindexAll: vi.fn().mockImplementation(async () => mockReindexAllResult),
  formatReindexResult: vi.fn().mockReturnValue('Formatted result'),
  formatReindexSummary: vi.fn().mockReturnValue('Formatted summary'),
}));

vi.mock('../../../../src/llm/providers/index.js', () => ({
  listProviders: vi.fn().mockImplementation(() => mockProvidersList),
}));

import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { loadConfig } from '../../../../src/core/config/loader.js';
import { reindexArchitecture, reindexAll, formatReindexResult, formatReindexSummary } from '../../../../src/llm/reindexer.js';
import { listProviders } from '../../../../src/llm/providers/index.js';

describe('reindex command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/project');

    // Reset mock data
    mockRegistryResult = {
      nodes: {
        base: { description: 'Base' },
        'archcodex.core': { description: 'Core' },
      },
      mixins: {},
    };

    mockConfigResult = {
      version: '1.0',
      files: { source_patterns: ['src/**/*.ts'] },
      llm: {},
    };

    mockProvidersList = [
      { name: 'anthropic', available: true, model: 'claude-3' },
      { name: 'openai', available: false, model: null },
      { name: 'prompt', available: true, model: null },
    ];

    mockSingleReindexResult = {
      success: true,
      archId: 'test.arch',
      keywords: ['test', 'keyword'],
      error: undefined,
    };

    mockReindexAllResult = {
      success: true,
      results: [
        { archId: 'base', keywords: ['base', 'foundation'] },
        { archId: 'archcodex.core', keywords: ['core', 'engine'] },
      ],
    };

    // Reset mocks to use current variables
    vi.mocked(loadRegistry).mockImplementation(async () => mockRegistryResult as any);
    vi.mocked(loadConfig).mockImplementation(async () => mockConfigResult as any);
    vi.mocked(listProviders).mockImplementation(() => mockProvidersList as any);
    vi.mocked(reindexArchitecture).mockImplementation(async () => mockSingleReindexResult as any);
    vi.mocked(reindexAll).mockImplementation(async () => mockReindexAllResult as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createReindexCommand', () => {
    it('should create a command with correct name', () => {
      const command = createReindexCommand();
      expect(command.name()).toBe('reindex');
    });

    it('should have the correct description', () => {
      const command = createReindexCommand();
      expect(command.description()).toContain('keyword');
    });

    it('should have an optional arch-id argument', () => {
      const command = createReindexCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('arch-id');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createReindexCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--provider');
      expect(optionNames).toContain('--prompt');
      expect(optionNames).toContain('--dry-run');
      expect(optionNames).toContain('--list-providers');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--config');
    });

    it('should have short flags for options', () => {
      const command = createReindexCommand();
      const options = command.options;

      const providerOption = options.find((opt) => opt.long === '--provider');
      expect(providerOption?.short).toBe('-p');

      const configOption = options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');
    });

    it('should have default values', () => {
      const command = createReindexCommand();
      const options = command.options;

      const providerOption = options.find((opt) => opt.long === '--provider');
      expect(providerOption?.defaultValue).toBe('prompt');

      const configOption = options.find((opt) => opt.long === '--config');
      expect(configOption?.defaultValue).toBe('.arch/config.yaml');
    });
  });

  describe('list providers', () => {
    it('should list available providers when --list-providers is used', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      expect(listProviders).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Available LLM Providers'))).toBe(true);
    });

    it('should show available/not configured status', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('available'))).toBe(true);
      expect(calls.some((c) => c?.includes('not configured'))).toBe(true);
    });

    it('should show configuration instructions', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('.arch/config.yaml'))).toBe(true);
    });

    it('should not call reindex when listing providers', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      expect(reindexArchitecture).not.toHaveBeenCalled();
      expect(reindexAll).not.toHaveBeenCalled();
    });
  });

  describe('single architecture reindex', () => {
    it('should call reindexArchitecture for specific arch', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', 'test.arch']);

      expect(reindexArchitecture).toHaveBeenCalledWith(
        'test.arch',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should show formatted result', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', 'test.arch']);

      expect(formatReindexResult).toHaveBeenCalledWith(mockSingleReindexResult);
      expect(consoleLogSpy).toHaveBeenCalledWith('Formatted result');
    });

    it('should output JSON when --json is used', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', 'test.arch', '--json']);

      expect(formatReindexResult).not.toHaveBeenCalled();
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

    it('should pass provider option', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', 'test.arch', '--provider', 'anthropic']);

      expect(reindexArchitecture).toHaveBeenCalledWith(
        'test.arch',
        expect.any(Object),
        expect.objectContaining({ provider: 'anthropic' })
      );
    });

    it('should pass dry-run option', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', 'test.arch', '--dry-run']);

      expect(reindexArchitecture).toHaveBeenCalledWith(
        'test.arch',
        expect.any(Object),
        expect.objectContaining({ dryRun: true })
      );
    });
  });

  describe('all architectures reindex', () => {
    it('should call reindexAll when no arch-id provided', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test']);

      expect(reindexAll).toHaveBeenCalled();
      expect(reindexArchitecture).not.toHaveBeenCalled();
    });

    it('should show formatted summary', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test']);

      expect(formatReindexSummary).toHaveBeenCalledWith(mockReindexAllResult);
      expect(consoleLogSpy).toHaveBeenCalledWith('Formatted summary');
    });

    it('should output JSON when --json is used', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--json']);

      expect(formatReindexSummary).not.toHaveBeenCalled();
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

    it('should show dry-run message', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Dry run'))).toBe(true);
    });

    it('should pass index path to reindexAll', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test']);

      expect(reindexAll).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('index.yaml'),
        expect.any(Object)
      );
    });
  });

  describe('prompt mode', () => {
    it('should show prompt mode header when using --prompt', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--prompt']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('PROMPT MODE'))).toBe(true);
    });

    it('should set provider to prompt when using --prompt flag', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', 'test.arch', '--prompt']);

      expect(reindexArchitecture).toHaveBeenCalledWith(
        'test.arch',
        expect.any(Object),
        expect.objectContaining({ provider: 'prompt', outputPrompt: true })
      );
    });

    it('should show prompt instructions', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--prompt']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('JSON array'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle config loading errors', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config error'));

      const command = createReindexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      const calls = consoleErrorSpy.mock.calls.map((c) => c[1]);
      expect(calls.some((c) => c?.includes('Config error'))).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle registry loading errors', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry error'));

      const command = createReindexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      const calls = consoleErrorSpy.mock.calls.map((c) => c[1]);
      expect(calls.some((c) => c?.includes('Registry error'))).toBe(true);
    });

    it('should handle reindex errors', async () => {
      vi.mocked(reindexAll).mockRejectedValue(new Error('Reindex failed'));

      const command = createReindexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      const calls = consoleErrorSpy.mock.calls.map((c) => c[1]);
      expect(calls.some((c) => c?.includes('Reindex failed'))).toBe(true);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValue('string error');

      const command = createReindexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      // consoleError is called with the error directly
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('config option', () => {
    it('should pass custom config path', async () => {
      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--config', 'custom/config.yaml']);

      expect(loadConfig).toHaveBeenCalledWith('/project', 'custom/config.yaml');
    });
  });

  describe('provider model info', () => {
    it('should show model info when available', async () => {
      mockProvidersList = [
        { name: 'anthropic', available: true, model: 'claude-3', baseUrl: undefined },
      ];

      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('claude-3'))).toBe(true);
    });

    it('should show base URL when available', async () => {
      mockProvidersList = [
        { name: 'custom', available: true, model: null, baseUrl: 'https://custom.api.com' },
      ];

      const command = createReindexCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('https://custom.api.com'))).toBe(true);
    });
  });
});
