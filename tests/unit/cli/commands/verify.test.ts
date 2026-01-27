/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the verify command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVerifyCommand } from '../../../../src/cli/commands/verify.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
    cyan: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    gray: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
  },
}));

// Mock dependencies
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {
      'test.domain': { description: 'Test', rationale: 'Testing' },
    },
    mixins: {},
  }),
}));

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    files: {
      scan: {
        include: ['src/**/*.ts'],
        exclude: ['**/node_modules/**'],
      },
    },
    llm: {},
  }),
}));

vi.mock('../../../../src/utils/index.js', () => ({
  loadArchIgnore: vi.fn().mockResolvedValue({
    ignores: vi.fn().mockReturnValue(false),
  }),
  globFiles: vi.fn().mockResolvedValue([]),
  loadArchConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../../src/llm/verifier.js', () => ({
  verifyFile: vi.fn(),
  formatVerificationResult: vi.fn().mockReturnValue('Verification passed'),
}));

vi.mock('../../../../src/llm/providers/index.js', () => ({
  listProviders: vi.fn().mockReturnValue([
    { name: 'prompt', available: true },
    { name: 'openai', available: false },
    { name: 'anthropic', available: true, model: 'claude-3', baseUrl: 'https://api.anthropic.com' },
  ]),
}));

import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { loadArchIgnore, globFiles, loadArchConfig } from '../../../../src/utils/index.js';
import { verifyFile, formatVerificationResult } from '../../../../src/llm/verifier.js';
import { listProviders } from '../../../../src/llm/providers/index.js';

describe('verify command', () => {
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

    // Default mock setup
    vi.mocked(verifyFile).mockResolvedValue({
      filePath: '/project/src/test.ts',
      archId: 'test.domain',
      hints: [],
      llmVerification: {
        provider: 'prompt',
        results: [{ hint: 'Test hint', passed: true, confidence: 0.9 }],
      },
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createVerifyCommand', () => {
    it('should create a command with correct name', () => {
      const command = createVerifyCommand();
      expect(command.name()).toBe('verify');
    });

    it('should have the correct description', () => {
      const command = createVerifyCommand();
      expect(command.description()).toContain('behavioral');
    });

    it('should have an optional files argument', () => {
      const command = createVerifyCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('files');
      expect(args[0].required).toBe(false);
      expect(args[0].variadic).toBe(true);
    });

    it('should have required options', () => {
      const command = createVerifyCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--provider');
      expect(optionNames).toContain('--prompt');
      expect(optionNames).toContain('--list-providers');
      expect(optionNames).toContain('--config');
      expect(optionNames).toContain('--json');
    });

    it('should have correct default for provider option', () => {
      const command = createVerifyCommand();
      const providerOption = command.options.find((opt) => opt.long === '--provider');
      expect(providerOption?.defaultValue).toBe('prompt');
    });

    it('should have short flags for common options', () => {
      const command = createVerifyCommand();
      const options = command.options;

      const providerOption = options.find((opt) => opt.long === '--provider');
      expect(providerOption?.short).toBe('-p');

      const configOption = options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');
    });
  });

  describe('--list-providers', () => {
    it('should list available providers', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      expect(listProviders).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Available LLM Providers'))).toBe(true);
    });

    it('should show provider status and details', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('prompt'))).toBe(true);
      expect(calls.some((c) => c?.includes('available'))).toBe(true);
      expect(calls.some((c) => c?.includes('not configured'))).toBe(true);
    });

    it('should show model and base URL when available', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('claude-3'))).toBe(true);
      expect(calls.some((c) => c?.includes('api.anthropic.com'))).toBe(true);
    });

    it('should not verify files when listing providers', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--list-providers']);

      expect(verifyFile).not.toHaveBeenCalled();
    });
  });

  describe('file resolution', () => {
    it('should use config patterns when no files specified', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test']);

      expect(globFiles).toHaveBeenCalledWith(
        'src/**/*.ts',
        expect.objectContaining({
          cwd: '/project',
          ignore: ['**/node_modules/**'],
          absolute: true,
        })
      );
    });

    it('should use provided file patterns', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/lib/util.ts']);

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'lib/**/*.ts']);

      expect(globFiles).toHaveBeenCalledWith(
        'lib/**/*.ts',
        expect.objectContaining({
          cwd: '/project',
          absolute: true,
        })
      );
    });

    it('should filter files with archignore', async () => {
      const ignoresMock = vi.fn().mockImplementation((path) => path.includes('ignored'));
      vi.mocked(loadArchIgnore).mockResolvedValue({ ignores: ignoresMock });
      vi.mocked(globFiles).mockResolvedValue([
        '/project/src/keep.ts',
        '/project/src/ignored.ts',
      ]);

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test']);

      // Only the non-ignored file should be verified
      expect(verifyFile).toHaveBeenCalledTimes(1);
      expect(verifyFile).toHaveBeenCalledWith(
        '/project/src/keep.ts',
        expect.anything(),
        expect.anything()
      );
    });

    it('should show message when no files to verify', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No files to verify'))).toBe(true);
      expect(verifyFile).not.toHaveBeenCalled();
    });

    it('should deduplicate files from multiple patterns', async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        version: '1.0',
        files: {
          scan: {
            include: ['src/**/*.ts', 'src/**/*.tsx'],
            exclude: [],
          },
        },
        llm: {},
      });
      vi.mocked(globFiles)
        .mockResolvedValueOnce(['/project/src/file.ts', '/project/src/shared.ts'])
        .mockResolvedValueOnce(['/project/src/shared.ts', '/project/src/app.tsx']);

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test']);

      // Should verify 3 unique files
      expect(verifyFile).toHaveBeenCalledTimes(3);
    });
  });

  describe('prompt mode', () => {
    it('should show prompt mode header', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--provider', 'prompt']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('PROMPT MODE'))).toBe(true);
    });

    it('should output prompt when using --prompt flag', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(verifyFile).mockResolvedValue({
        filePath: '/project/src/file.ts',
        archId: 'test.domain',
        hints: ['Test hint'],
        promptOutput: 'Verify this code against the hint: Test hint',
      });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--prompt']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Verify this code'))).toBe(true);
    });

    it('--prompt flag should be equivalent to --provider=prompt', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--prompt']);

      expect(verifyFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          provider: 'prompt',
          outputPrompt: true,
        })
      );
    });
  });

  describe('LLM provider mode', () => {
    it('should show verifying message for non-prompt providers', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--provider', 'openai']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Verifying 1 file'))).toBe(true);
      expect(calls.some((c) => c?.includes('openai'))).toBe(true);
    });

    it('should format and display LLM verification results', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(verifyFile).mockResolvedValue({
        filePath: '/project/src/file.ts',
        archId: 'test.domain',
        hints: ['Test hint'],
        llmVerification: {
          provider: 'openai',
          results: [{ hint: 'Test hint', passed: true, confidence: 0.9 }],
        },
      });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--provider', 'openai']);

      expect(formatVerificationResult).toHaveBeenCalled();
    });

    it('should skip files without @arch tag', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/untagged.ts']);
      vi.mocked(verifyFile).mockResolvedValue({
        filePath: '/project/src/untagged.ts',
        archId: null,
        hints: [],
      });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--provider', 'openai']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Skipping'))).toBe(true);
      expect(calls.some((c) => c?.includes('no @arch tag'))).toBe(true);
    });

    it('should show summary after verification', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file1.ts', '/project/src/file2.ts']);
      vi.mocked(verifyFile)
        .mockResolvedValueOnce({
          filePath: '/project/src/file1.ts',
          archId: 'test.domain',
          hints: [],
          llmVerification: {
            provider: 'openai',
            results: [{ hint: 'Hint 1', passed: true, confidence: 0.9 }],
          },
        })
        .mockResolvedValueOnce({
          filePath: '/project/src/file2.ts',
          archId: 'test.domain',
          hints: [],
          llmVerification: {
            provider: 'openai',
            results: [{ hint: 'Hint 2', passed: false, confidence: 0.8 }],
          },
        });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--provider', 'openai']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Files checked: 2'))).toBe(true);
      expect(calls.some((c) => c?.includes('Verified: 2'))).toBe(true);
      expect(calls.some((c) => c?.includes('Passed: 1/2'))).toBe(true);
    });

    it('should not show passed count when no files verified', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/untagged.ts']);
      vi.mocked(verifyFile).mockResolvedValue({
        filePath: '/project/src/untagged.ts',
        archId: null,
        hints: [],
      });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--provider', 'openai']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Passed:'))).toBe(false);
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json flag is provided', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(verifyFile).mockResolvedValue({
        filePath: '/project/src/file.ts',
        archId: 'test.domain',
        hints: ['Test hint'],
        llmVerification: {
          provider: 'prompt',
          results: [{ hint: 'Test hint', passed: true, confidence: 0.9 }],
        },
      });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--json']);

      // Find the JSON output (the command may output other things first)
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      const jsonCall = calls.find((c) => {
        try {
          JSON.parse(c);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall);
      expect(Array.isArray(output)).toBe(true);
      expect(output[0].archId).toBe('test.domain');
    });

    it('should output JSON array at the end', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--json']);

      // The last call should be JSON
      const lastCall = consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1][0];
      expect(() => JSON.parse(lastCall)).not.toThrow();
    });

    it('should include all file results in JSON array', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/a.ts', '/project/src/b.ts']);
      vi.mocked(verifyFile)
        .mockResolvedValueOnce({
          filePath: '/project/src/a.ts',
          archId: 'arch.a',
          hints: [],
        })
        .mockResolvedValueOnce({
          filePath: '/project/src/b.ts',
          archId: 'arch.b',
          hints: [],
        });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--json']);

      // Find the JSON output
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      const jsonCall = calls.find((c) => {
        try {
          const parsed = JSON.parse(c);
          return Array.isArray(parsed);
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall);
      expect(output.length).toBe(2);
      expect(output[0].archId).toBe('arch.a');
      expect(output[1].archId).toBe('arch.b');
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));

      const command = createVerifyCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCalls = consoleErrorSpy.mock.calls.map((c) => c.join(' '));
      expect(errorCalls.some((c) => c.includes('Config not found'))).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValue('string error');

      const command = createVerifyCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('config option', () => {
    it('should use custom config path when provided', async () => {
      // Reset mocks for this specific test
      vi.mocked(loadConfig).mockResolvedValue({
        version: '1.0',
        files: { scan: { include: ['src/**/*.ts'], exclude: [] } },
        llm: {},
      });
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(verifyFile).mockResolvedValue({
        filePath: '/project/src/file.ts',
        archId: 'test.domain',
        hints: [],
      });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', '--config', 'custom/config.yaml']);

      expect(loadConfig).toHaveBeenCalledWith('/project', 'custom/config.yaml');
    });

    it('should use default config path when not provided', async () => {
      // Reset mocks for this specific test
      vi.mocked(loadConfig).mockResolvedValue({
        version: '1.0',
        files: { scan: { include: ['src/**/*.ts'], exclude: [] } },
        llm: {},
      });
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(verifyFile).mockResolvedValue({
        filePath: '/project/src/file.ts',
        archId: 'test.domain',
        hints: [],
      });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test']);

      expect(loadConfig).toHaveBeenCalledWith('/project', '.arch/config.yaml');
    });
  });
});
