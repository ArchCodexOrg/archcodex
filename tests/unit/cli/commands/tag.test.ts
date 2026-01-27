/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the tag command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTagCommand } from '../../../../src/cli/commands/tag.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    cyan: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockGlobResult: string[] = [];
let mockFileContents: Record<string, string> = {};
let mockArchTags: Record<string, { archTag: string | null }> = {};

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockImplementation(async () => mockGlobResult),
  readFile: vi.fn().mockImplementation(async (path: string) => mockFileContents[path] || ''),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn().mockResolvedValue({
    filter: vi.fn().mockImplementation((files: string[]) => files),
  }),
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

vi.mock('../../../../src/utils/arch-tag.js', () => ({
  insertArchTag: vi.fn().mockImplementation((_content, archId) => `/**\n * @arch ${archId}\n */\ncontent`),
  replaceArchTag: vi.fn().mockImplementation((_content, archId) => `/**\n * @arch ${archId}\n */\ncontent`),
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

import { globFiles, readFile, writeFile } from '../../../../src/utils/file-system.js';
import { loadArchIgnore } from '../../../../src/utils/archignore.js';
import { parseArchTags } from '../../../../src/core/arch-tag/parser.js';
import { insertArchTag, replaceArchTag } from '../../../../src/utils/arch-tag.js';
import { logger } from '../../../../src/utils/logger.js';

describe('tag command', () => {
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
    mockGlobResult = [];
    mockFileContents = {};
    mockArchTags = {};

    // Reset mocks
    vi.mocked(globFiles).mockImplementation(async () => mockGlobResult);
    vi.mocked(readFile).mockImplementation(async (path: string) => mockFileContents[path] || '');
    vi.mocked(parseArchTags).mockImplementation((content: string) => {
      for (const [path, result] of Object.entries(mockArchTags)) {
        if (mockFileContents[path] === content) {
          return result;
        }
      }
      return { archTag: null };
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createTagCommand', () => {
    it('should create a command with correct name', () => {
      const command = createTagCommand();
      expect(command.name()).toBe('tag');
    });

    it('should have the correct description', () => {
      const command = createTagCommand();
      expect(command.description()).toContain('tag');
    });

    it('should have a required pattern argument', () => {
      const command = createTagCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('pattern');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createTagCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--arch');
      expect(optionNames).toContain('--dry-run');
      expect(optionNames).toContain('--force');
      expect(optionNames).toContain('--quiet');
    });

    it('should have short flags for options', () => {
      const command = createTagCommand();
      const options = command.options;

      const archOption = options.find((opt) => opt.long === '--arch');
      expect(archOption?.short).toBe('-a');

      const forceOption = options.find((opt) => opt.long === '--force');
      expect(forceOption?.short).toBe('-f');

      const quietOption = options.find((opt) => opt.long === '--quiet');
      expect(quietOption?.short).toBe('-q');
    });
  });

  describe('no files found', () => {
    it('should warn when no files match pattern', async () => {
      mockGlobResult = [];

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No files found'));
    });
  });

  describe('tagging files', () => {
    it('should tag files without existing arch tags', async () => {
      mockGlobResult = ['src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';
      mockArchTags['/project/src/test.ts'] = { archTag: null };

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      expect(readFile).toHaveBeenCalledWith('/project/src/test.ts');
      expect(insertArchTag).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
    });

    it('should show info about found files', async () => {
      mockGlobResult = ['src/a.ts', 'src/b.ts'];
      mockFileContents['/project/src/a.ts'] = 'const a = 1;';
      mockFileContents['/project/src/b.ts'] = 'const b = 1;';

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('2 file(s)'));
    });

    it('should skip files with existing arch tags', async () => {
      mockGlobResult = ['src/test.ts'];
      mockFileContents['/project/src/test.ts'] = '/** @arch existing.arch */\nconst x = 1;';
      mockArchTags['/project/src/test.ts'] = { archTag: 'existing.arch' };

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      expect(insertArchTag).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should show skipped files in output', async () => {
      mockGlobResult = ['src/test.ts'];
      mockFileContents['/project/src/test.ts'] = '/** @arch existing.arch */\nconst x = 1;';
      mockArchTags['/project/src/test.ts'] = { archTag: 'existing.arch' };

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('already tagged'))).toBe(true);
    });
  });

  describe('force option', () => {
    it('should overwrite existing tags with --force', async () => {
      mockGlobResult = ['src/test.ts'];
      mockFileContents['/project/src/test.ts'] = '/** @arch existing.arch */\nconst x = 1;';
      mockArchTags['/project/src/test.ts'] = { archTag: 'existing.arch' };

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'new.arch', '--force']);

      expect(replaceArchTag).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
    });

    it('should use short flag -f for force', async () => {
      mockGlobResult = ['src/test.ts'];
      mockFileContents['/project/src/test.ts'] = '/** @arch existing.arch */\nconst x = 1;';
      mockArchTags['/project/src/test.ts'] = { archTag: 'existing.arch' };

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'new.arch', '-f']);

      expect(replaceArchTag).toHaveBeenCalled();
    });
  });

  describe('dry-run option', () => {
    it('should not write files in dry-run mode', async () => {
      mockGlobResult = ['src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch', '--dry-run']);

      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should show dry-run indicator in output', async () => {
      mockGlobResult = ['src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch', '--dry-run']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('[dry-run]'))).toBe(true);
    });

    it('should show dry-run summary', async () => {
      mockGlobResult = ['src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch', '--dry-run']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Dry run'))).toBe(true);
      expect(calls.some((c) => c?.includes('Would tag'))).toBe(true);
    });
  });

  describe('quiet option', () => {
    it('should suppress detailed output in quiet mode', async () => {
      mockGlobResult = ['src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch', '--quiet']);

      // Should not log individual file status
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should use short flag -q for quiet', async () => {
      mockGlobResult = ['src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch', '-q']);

      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('summary output', () => {
    it('should show tagged count', async () => {
      mockGlobResult = ['src/a.ts', 'src/b.ts'];
      mockFileContents['/project/src/a.ts'] = 'const a = 1;';
      mockFileContents['/project/src/b.ts'] = 'const b = 1;';

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Tagged 2 file(s)'))).toBe(true);
    });

    it('should show skipped count with hint', async () => {
      mockGlobResult = ['src/a.ts', 'src/b.ts'];
      mockFileContents['/project/src/a.ts'] = '/** @arch existing */\nconst a = 1;';
      mockFileContents['/project/src/b.ts'] = 'const b = 1;';
      mockArchTags['/project/src/a.ts'] = { archTag: 'existing' };

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Skipped 1'))).toBe(true);
      expect(calls.some((c) => c?.includes('--force'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle file read errors', async () => {
      mockGlobResult = ['src/test.ts'];
      vi.mocked(readFile).mockRejectedValueOnce(new Error('Read error'));

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Read error'))).toBe(true);
    });

    it('should show error count in summary', async () => {
      mockGlobResult = ['src/a.ts', 'src/b.ts'];
      mockFileContents['/project/src/b.ts'] = 'const b = 1;';
      vi.mocked(readFile)
        .mockRejectedValueOnce(new Error('Read error'))
        .mockResolvedValueOnce('const b = 1;');

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Errors: 1'))).toBe(true);
    });

    it('should handle glob errors', async () => {
      vi.mocked(globFiles).mockRejectedValueOnce(new Error('Glob error'));

      const command = createTagCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Glob error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle archignore load errors', async () => {
      vi.mocked(loadArchIgnore).mockRejectedValueOnce(new Error('Archignore error'));

      const command = createTagCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Archignore error');
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(globFiles).mockRejectedValueOnce('string error');

      const command = createTagCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Unknown error');
    });
  });

  describe('archignore filtering', () => {
    it('should filter files through archignore', async () => {
      mockGlobResult = ['src/a.ts', 'src/ignored.ts'];

      const mockFilter = vi.fn().mockReturnValue(['src/a.ts']);
      vi.mocked(loadArchIgnore).mockResolvedValueOnce({
        filter: mockFilter,
      } as any);

      mockFileContents['/project/src/a.ts'] = 'const a = 1;';

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      expect(mockFilter).toHaveBeenCalledWith(['src/a.ts', 'src/ignored.ts']);
      // Only non-ignored file should be processed
      expect(readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple files', () => {
    it('should process all matching files', async () => {
      mockGlobResult = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
      mockFileContents['/project/src/a.ts'] = 'const a = 1;';
      mockFileContents['/project/src/b.ts'] = 'const b = 1;';
      mockFileContents['/project/src/c.ts'] = 'const c = 1;';

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      expect(readFile).toHaveBeenCalledTimes(3);
      expect(writeFile).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed tagged and untagged files', async () => {
      mockGlobResult = ['src/tagged.ts', 'src/untagged.ts'];
      mockFileContents['/project/src/tagged.ts'] = '/** @arch existing */\ncode';
      mockFileContents['/project/src/untagged.ts'] = 'const x = 1;';
      mockArchTags['/project/src/tagged.ts'] = { archTag: 'existing' };

      const command = createTagCommand();
      await command.parseAsync(['node', 'test', 'src/**/*.ts', '--arch', 'my.arch']);

      expect(insertArchTag).toHaveBeenCalledTimes(1);
      expect(writeFile).toHaveBeenCalledTimes(1);
    });
  });
});
