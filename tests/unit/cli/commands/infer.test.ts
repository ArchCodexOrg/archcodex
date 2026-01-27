/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the infer command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInferCommand } from '../../../../src/cli/commands/infer.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    gray: (s: string) => s,
    magenta: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockConfigResult = {
  version: '1.0',
  files: { source_patterns: ['src/**/*.ts'] },
  inference: {},
};

let mockGlobResult: string[] = [];
let mockFileContents: Record<string, string> = {};
let mockArchTags: Record<string, { archTag: { archId: string } | null }> = {};
let mockInferResult: { archId: string; confidence: string; reason: string } | null = null;
let mockRegistryResult = { nodes: { base: {} }, mixins: {} };
let mockIntentRegistry = { intents: {} };
let mockRegistryExistsResult = true;
let mockHasArchitectureResult = true;
let mockSuggestedIntents: Array<{ name: string; description: string; reason: string }> = [];

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn().mockImplementation(async (path: string) => mockFileContents[path] || ''),
  globFiles: vi.fn().mockImplementation(async () => mockGlobResult),
}));

vi.mock('../../../../src/core/infer/index.js', () => ({
  inferArchitecture: vi.fn().mockImplementation(() => mockInferResult),
  buildRulesFromSettings: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  parseArchTags: vi.fn().mockImplementation((content: string) => {
    for (const [path, result] of Object.entries(mockArchTags)) {
      if (mockFileContents[path] === content) {
        return result;
      }
    }
    return { archTag: null };
  }),
}));

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockImplementation(async () => mockConfigResult),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockImplementation(async () => mockRegistryResult),
  hasArchitecture: vi.fn().mockImplementation(() => mockHasArchitectureResult),
  registryExists: vi.fn().mockImplementation(async () => mockRegistryExistsResult),
  loadIntentRegistry: vi.fn().mockImplementation(async () => mockIntentRegistry),
  suggestIntents: vi.fn().mockImplementation(() => mockSuggestedIntents),
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

import { readFile, globFiles } from '../../../../src/utils/file-system.js';
import { inferArchitecture, buildRulesFromSettings } from '../../../../src/core/infer/index.js';
import { parseArchTags } from '../../../../src/core/arch-tag/parser.js';
import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry, hasArchitecture, registryExists, loadIntentRegistry, suggestIntents } from '../../../../src/core/registry/loader.js';
import { logger } from '../../../../src/utils/logger.js';

describe('infer command', () => {
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
      inference: {},
    };
    mockGlobResult = [];
    mockFileContents = {};
    mockArchTags = {};
    mockInferResult = null;
    mockRegistryResult = { nodes: { base: {} }, mixins: {} };
    mockIntentRegistry = { intents: {} };
    mockRegistryExistsResult = true;
    mockHasArchitectureResult = true;
    mockSuggestedIntents = [];

    // Reset mocks
    vi.mocked(loadConfig).mockImplementation(async () => mockConfigResult as any);
    vi.mocked(globFiles).mockImplementation(async () => mockGlobResult);
    vi.mocked(readFile).mockImplementation(async (path: string) => mockFileContents[path] || '');
    vi.mocked(inferArchitecture).mockImplementation(() => mockInferResult as any);
    vi.mocked(parseArchTags).mockImplementation((content: string) => {
      for (const [path, result] of Object.entries(mockArchTags)) {
        if (mockFileContents[path] === content) {
          return result;
        }
      }
      return { archTag: null };
    });
    vi.mocked(loadRegistry).mockImplementation(async () => mockRegistryResult as any);
    vi.mocked(hasArchitecture).mockImplementation(() => mockHasArchitectureResult);
    vi.mocked(registryExists).mockImplementation(async () => mockRegistryExistsResult);
    vi.mocked(loadIntentRegistry).mockImplementation(async () => mockIntentRegistry as any);
    vi.mocked(suggestIntents).mockImplementation(() => mockSuggestedIntents as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createInferCommand', () => {
    it('should create a command with correct name', () => {
      const command = createInferCommand();
      expect(command.name()).toBe('infer');
    });

    it('should have the correct description', () => {
      const command = createInferCommand();
      expect(command.description()).toContain('Suggest');
    });

    it('should have a required pattern argument', () => {
      const command = createInferCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('pattern');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createInferCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--quiet');
      expect(optionNames).toContain('--untagged-only');
    });

    it('should have short flags for options', () => {
      const command = createInferCommand();
      const options = command.options;

      const quietOption = options.find((opt) => opt.long === '--quiet');
      expect(quietOption?.short).toBe('-q');

      const untaggedOption = options.find((opt) => opt.long === '--untagged-only');
      expect(untaggedOption?.short).toBe('-u');
    });
  });

  describe('no files found', () => {
    it('should warn when no files match pattern', async () => {
      mockGlobResult = [];

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts']);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No files found'));
    });
  });

  describe('single file inference', () => {
    it('should infer architecture for a single file', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Pattern match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      expect(readFile).toHaveBeenCalledWith('/project/src/test.ts');
      expect(inferArchitecture).toHaveBeenCalled();
    });

    it('should show suggested architecture', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Pattern match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('my.arch'))).toBe(true);
    });
  });

  describe('glob pattern', () => {
    it('should expand glob patterns', async () => {
      mockGlobResult = ['src/a.ts', 'src/b.ts'];
      mockFileContents['/project/src/a.ts'] = 'const a = 1;';
      mockFileContents['/project/src/b.ts'] = 'const b = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'medium', reason: 'Match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/*.ts']);

      expect(globFiles).toHaveBeenCalledWith('src/*.ts', expect.any(Object));
      expect(readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json is used', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts', '--json']);

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

    it('should include all result fields in JSON', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Pattern match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts', '--json']);

      const calls = consoleLogSpy.mock.calls;
      const jsonCall = calls.find((c) => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      const output = JSON.parse(jsonCall![0] as string);
      expect(output[0]).toHaveProperty('file');
      expect(output[0]).toHaveProperty('suggestedArch');
      expect(output[0]).toHaveProperty('confidence');
    });
  });

  describe('quiet mode', () => {
    it('should suppress explanations in quiet mode', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Pattern match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts', '--quiet']);

      // Should show suggestion but not verbose details
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('my.arch'))).toBe(true);
    });
  });

  describe('untagged only', () => {
    it('should skip tagged files when --untagged-only is used', async () => {
      mockGlobResult = ['src/tagged.ts', 'src/untagged.ts'];
      mockFileContents['/project/src/tagged.ts'] = '/** @arch existing */\ncode';
      mockFileContents['/project/src/untagged.ts'] = 'const x = 1;';
      mockArchTags['/project/src/tagged.ts'] = { archTag: { archId: 'existing' } };
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/*.ts', '--untagged-only']);

      // inferArchitecture should only be called for untagged file
      expect(inferArchitecture).toHaveBeenCalledTimes(1);
    });
  });

  describe('registry validation', () => {
    it('should validate archId against registry', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      expect(loadRegistry).toHaveBeenCalled();
      expect(hasArchitecture).toHaveBeenCalledWith(expect.any(Object), 'my.arch');
    });

    it('should show warning for unknown archId', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'unknown.arch', confidence: 'high', reason: 'Match' };
      mockHasArchitectureResult = false;

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('not found in registry'))).toBe(true);
    });

    it('should skip validation when registry does not exist', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };
      mockRegistryExistsResult = false;

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      expect(loadRegistry).not.toHaveBeenCalled();
    });

    it('should handle registry load errors gracefully', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };
      vi.mocked(loadRegistry).mockRejectedValueOnce(new Error('Load error'));

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      // Should warn and continue
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not load registry'));
    });
  });

  describe('intent suggestions', () => {
    it('should load intent registry', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      expect(loadIntentRegistry).toHaveBeenCalled();
    });

    it('should show suggested intents', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };
      mockIntentRegistry = { intents: { 'test-intent': { description: 'Test' } } };
      mockSuggestedIntents = [{ name: 'test-intent', description: 'Test intent', reason: 'path' }];

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('@intent:test-intent'))).toBe(true);
    });

    it('should handle intent registry load errors gracefully', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };
      vi.mocked(loadIntentRegistry).mockRejectedValueOnce(new Error('Load error'));

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      // Should not throw
      expect(inferArchitecture).toHaveBeenCalled();
    });
  });

  describe('no suggestions', () => {
    it('should show message when no suggestions', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = null;

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('could not be inferred'))).toBe(true);
    });
  });

  describe('no untagged files', () => {
    it('should show message when no untagged files', async () => {
      mockGlobResult = ['src/tagged.ts'];
      mockFileContents['/project/src/tagged.ts'] = '/** @arch existing */\ncode';
      mockArchTags['/project/src/tagged.ts'] = { archTag: { archId: 'existing' } };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/*.ts', '--untagged-only']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No untagged files'))).toBe(true);
    });
  });

  describe('comparison with current arch', () => {
    it('should show comparison when file already has arch tag', async () => {
      mockFileContents['/project/src/test.ts'] = '/** @arch existing */\ncode';
      mockArchTags['/project/src/test.ts'] = { archTag: { archId: 'existing' } };
      mockInferResult = { archId: 'suggested', confidence: 'high', reason: 'Match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('existing'))).toBe(true);
      expect(calls.some((c) => c?.includes('suggested'))).toBe(true);
    });

    it('should show match when current equals suggested', async () => {
      mockFileContents['/project/src/test.ts'] = '/** @arch my.arch */\ncode';
      mockArchTags['/project/src/test.ts'] = { archTag: { archId: 'my.arch' } };
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('matches suggestion'))).toBe(true);
    });
  });

  describe('summary output', () => {
    it('should show summary', async () => {
      mockGlobResult = ['src/a.ts', 'src/b.ts'];
      mockFileContents['/project/src/a.ts'] = 'const a = 1;';
      mockFileContents['/project/src/b.ts'] = 'const b = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/*.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Summary'))).toBe(true);
      expect(calls.some((c) => c?.includes('Files analyzed'))).toBe(true);
    });

    it('should show unknown archId count', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'unknown.arch', confidence: 'high', reason: 'Match' };
      mockHasArchitectureResult = false;

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Unknown archIds'))).toBe(true);
    });

    it('should show tag command hint', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'high', reason: 'Match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('archcodex tag'))).toBe(true);
    });
  });

  describe('custom inference rules', () => {
    it('should show info about custom rules', async () => {
      mockConfigResult.inference = {
        custom_rules: [{ pattern: '.*', archId: 'custom' }],
      };
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('custom inference rule'));
    });

    it('should build rules from settings', async () => {
      mockConfigResult.inference = { custom_rules: [] };
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      expect(buildRulesFromSettings).toHaveBeenCalledWith(mockConfigResult.inference);
    });
  });

  describe('confidence display', () => {
    it('should show confidence badge', async () => {
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockInferResult = { archId: 'my.arch', confidence: 'medium', reason: 'Match' };

      const command = createInferCommand();
      await command.parseAsync(['node', 'test', 'src/test.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('[medium]'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle config load errors', async () => {
      vi.mocked(loadConfig).mockRejectedValueOnce(new Error('Config error'));

      const command = createInferCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/test.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Config error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle file read errors', async () => {
      vi.mocked(readFile).mockRejectedValueOnce(new Error('Read error'));

      const command = createInferCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/test.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Read error');
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValueOnce('string error');

      const command = createInferCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/test.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Unknown error');
    });
  });
});
