/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the test-pattern command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestPatternCommand } from '../../../../src/cli/commands/test-pattern.js';

// Configurable mock behavior
let mockGlobFiles: string[] = [];
let mockFileContents: Record<string, string> = {};
let mockConfigResult = {
  version: '1.0',
  files: { scan: { include: ['**/*.ts'] } },
};

// Mock dependencies
vi.mock('glob', () => ({
  glob: vi.fn().mockImplementation(async () => mockGlobFiles),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockImplementation((path: string) => {
    if (mockFileContents[path]) {
      return mockFileContents[path];
    }
    throw new Error('File not found');
  }),
}));

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockImplementation(async () => mockConfigResult),
}));

import { glob } from 'glob';
import * as fs from 'node:fs';
import { loadConfig } from '../../../../src/core/config/loader.js';

describe('test-pattern command', () => {
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
    mockGlobFiles = [];
    mockFileContents = {};
    mockConfigResult = {
      version: '1.0',
      files: { scan: { include: ['**/*.ts'] } },
    };

    // Reset mocks
    vi.mocked(glob).mockImplementation(async () => mockGlobFiles);
    vi.mocked(loadConfig).mockImplementation(async () => mockConfigResult as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createTestPatternCommand', () => {
    it('should create a command with correct name', () => {
      const command = createTestPatternCommand();
      expect(command.name()).toBe('test-pattern');
    });

    it('should have the correct description', () => {
      const command = createTestPatternCommand();
      expect(command.description()).toContain('regex');
    });

    it('should have required regex argument', () => {
      const command = createTestPatternCommand();
      const args = command.registeredArguments;
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].name()).toBe('regex');
      expect(args[0].required).toBe(true);
    });

    it('should have optional fileGlob argument', () => {
      const command = createTestPatternCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(2);
      expect(args[1].name()).toBe('fileGlob');
      expect(args[1].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createTestPatternCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--context');
      expect(optionNames).toContain('--max-matches');
      expect(optionNames).toContain('--json');
    });

    it('should have default value for max-matches', () => {
      const command = createTestPatternCommand();
      const maxMatchesOption = command.options.find((opt) => opt.long === '--max-matches');
      expect(maxMatchesOption?.defaultValue).toBe('20');
    });

    it('should have default value for context', () => {
      const command = createTestPatternCommand();
      const contextOption = command.options.find((opt) => opt.long === '--context');
      expect(contextOption?.defaultValue).toBe('0');
    });
  });

  describe('invalid regex', () => {
    it('should error on invalid regex', async () => {
      const command = createTestPatternCommand();

      try {
        await command.parseAsync(['node', 'test', '[invalid']);
      } catch {
        // Expected
      }

      const calls = consoleErrorSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Invalid regex'))).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('no files found', () => {
    it('should show message when no files match glob', async () => {
      mockGlobFiles = [];

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log', 'src/**/*.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No files found'))).toBe(true);
    });
  });

  describe('file glob', () => {
    it('should use provided glob pattern', async () => {
      mockGlobFiles = [];

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'test', 'lib/**/*.js']);

      expect(glob).toHaveBeenCalledWith(
        'lib/**/*.js',
        expect.objectContaining({ cwd: '/project' })
      );
    });

    it('should use config patterns when no glob provided', async () => {
      mockGlobFiles = [];
      mockConfigResult.files.scan.include = ['src/**/*.tsx'];

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'test']);

      expect(glob).toHaveBeenCalledWith(
        'src/**/*.tsx',
        expect.any(Object)
      );
    });

    it('should ignore common directories', async () => {
      mockGlobFiles = [];

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'test', '**/*.ts']);

      expect(glob).toHaveBeenCalledWith(
        '**/*.ts',
        expect.objectContaining({
          ignore: expect.arrayContaining([
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
          ]),
        })
      );
    });
  });

  describe('pattern matching', () => {
    it('should find matches in files', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'console.log("hello");\nconsole.log("world");';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('MATCHES'))).toBe(true);
      expect(calls.some((c) => c?.includes('2'))).toBe(true);
    });

    it('should show no matches when pattern not found', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No matches'))).toBe(true);
    });

    it('should show relative file paths', async () => {
      mockGlobFiles = ['/project/src/services/test.ts'];
      mockFileContents['/project/src/services/test.ts'] = 'console.log("test");';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('src/services/test.ts'))).toBe(true);
    });

    it('should show line numbers', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'line1\nline2\nconsole.log("test");\nline4';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes(':3'))).toBe(true);
    });
  });

  describe('context lines', () => {
    it('should show context lines when requested', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'line1\nline2\nconsole.log("test");\nline4\nline5';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log', '**/*.ts', '--context', '1']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      // Context should include surrounding lines
      expect(calls.some((c) => c?.includes('line2'))).toBe(true);
      expect(calls.some((c) => c?.includes('line4'))).toBe(true);
    });
  });

  describe('max matches', () => {
    it('should limit matches shown', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = Array(30).fill('console.log("x");').join('\n');

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log', '**/*.ts', '--max-matches', '5']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('more'))).toBe(true);
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json is used', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'console.log("test");';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log', '**/*.ts', '--json']);

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

    it('should include pattern info in JSON', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'console.log("test");';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log', '**/*.ts', '--json']);

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
      expect(output.pattern).toBe('console\\.log');
      expect(output.flags).toBe('gms');
    });

    it('should include match counts in JSON', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'console.log("a");\nconsole.log("b");';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log', '**/*.ts', '--json']);

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
      expect(output.totalMatches).toBe(2);
      expect(output.filesWithMatches).toBe(1);
    });

    it('should include matches array in JSON', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'console.log("test");';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log', '**/*.ts', '--json']);

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
      expect(output.matches).toBeInstanceOf(Array);
      expect(output.matches.length).toBe(1);
      expect(output.matches[0].file).toBe('src/test.ts');
    });
  });

  describe('human output', () => {
    it('should show pattern info', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'test';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Pattern:'))).toBe(true);
      expect(calls.some((c) => c?.includes('Flags:'))).toBe(true);
    });

    it('should show flags explanation', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'test';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('gms'))).toBe(true);
    });

    it('should truncate long matches', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'x'.repeat(100);

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'x+']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('...'))).toBe(true);
    });
  });

  describe('multiline patterns', () => {
    it('should match across lines with gms flags', async () => {
      mockGlobFiles = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'function test() {\n  return 1;\n}';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'function.*\\}', '**/*.ts', '--json']);

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
      expect(output.totalMatches).toBe(1);
    });
  });

  describe('file read errors', () => {
    it('should skip files that cannot be read', async () => {
      mockGlobFiles = ['/project/src/readable.ts', '/project/src/unreadable.ts'];
      mockFileContents['/project/src/readable.ts'] = 'console.log("test");';
      // unreadable.ts not in mockFileContents, will throw

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log']);

      // Should still find match in readable file
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('MATCHES'))).toBe(true);
    });
  });

  describe('multiple files', () => {
    it('should count files with matches correctly', async () => {
      mockGlobFiles = ['/project/src/a.ts', '/project/src/b.ts', '/project/src/c.ts'];
      mockFileContents['/project/src/a.ts'] = 'console.log("a");';
      mockFileContents['/project/src/b.ts'] = 'const x = 1;'; // No match
      mockFileContents['/project/src/c.ts'] = 'console.log("c");';

      const command = createTestPatternCommand();
      await command.parseAsync(['node', 'test', 'console\\.log', '**/*.ts', '--json']);

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
      expect(output.filesWithMatches).toBe(2);
      expect(output.totalFiles).toBe(3);
    });
  });
});
