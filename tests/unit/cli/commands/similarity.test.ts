/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the similarity command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSimilarityCommand } from '../../../../src/cli/commands/similarity.js';

// Mock state
let mockDuplicates: Array<{
  file: string;
  matches: Array<{
    file: string;
    similarity: number;
    matchedAspects: Array<{ type: string; items: string[] }>;
  }>;
}> = [];
let mockInconsistencies: Array<{
  referenceFile: string;
  similarity: number;
  missing: { methods: string[]; exports: string[] };
  extra: { methods: string[]; exports: string[] };
}> = [];
let mockBlockMatches: Array<{
  block1: { name: string; file: string; line: number; lines: number };
  block2: { name: string; file: string; line: number; lines: number };
  similarity: number;
}> = [];
let mockGlobFiles: string[] = [];

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    files: {
      source_patterns: ['src/**/*.ts'],
      scan: { include: ['**/*.ts'], exclude: ['**/node_modules/**'] },
    },
  }),
}));

vi.mock('../../../../src/core/similarity/index.js', () => ({
  SimilarityAnalyzer: vi.fn(function() {
    return {
    findInconsistencies: vi.fn().mockImplementation(async () => mockInconsistencies),
    dispose: vi.fn(),
  };
  }),
  detectDuplicates: vi.fn().mockImplementation(async () => mockDuplicates),
}));

vi.mock('../../../../src/core/similarity/block-analyzer.js', () => ({
  findSimilarBlocks: vi.fn().mockImplementation(async () => mockBlockMatches),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockImplementation(async () => mockGlobFiles),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn().mockResolvedValue({
    filter: vi.fn().mockImplementation((files: string[]) => files),
  }),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn().mockRejectedValue(new Error('Not found')),
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

// Mock chalk with pass-through
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      green: (s: string) => s,
    }),
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('similarity command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDuplicates = [];
    mockInconsistencies = [];
    mockBlockMatches = [];
    mockGlobFiles = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Reset mock implementations
    const similarity = await import('../../../../src/core/similarity/index.js');
    vi.mocked(similarity.detectDuplicates).mockImplementation(async () => mockDuplicates);

    const blockAnalyzer = await import('../../../../src/core/similarity/block-analyzer.js');
    vi.mocked(blockAnalyzer.findSimilarBlocks).mockImplementation(async () => mockBlockMatches);

    const fileSystem = await import('../../../../src/utils/file-system.js');
    vi.mocked(fileSystem.globFiles).mockImplementation(async () => mockGlobFiles);
  });

  describe('createSimilarityCommand', () => {
    it('should create a command with correct name', () => {
      const command = createSimilarityCommand();
      expect(command.name()).toBe('similarity');
    });

    it('should have the correct description', () => {
      const command = createSimilarityCommand();
      expect(command.description()).toContain('similar');
    });

    it('should have subcommands', () => {
      const command = createSimilarityCommand();
      const subcommands = command.commands;

      const subcommandNames = subcommands.map((cmd) => cmd.name());
      expect(subcommandNames).toContain('scan');
      expect(subcommandNames).toContain('check');
      expect(subcommandNames).toContain('blocks');
    });
  });

  describe('default action', () => {
    it('should show help when no subcommand', async () => {
      const command = createSimilarityCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Code Similarity Analysis'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('similarity scan'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('similarity check'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('similarity blocks'));
    });
  });

  describe('scan subcommand', () => {
    it('should warn when no files found', async () => {
      mockGlobFiles = [];

      const command = createSimilarityCommand();
      const scanCommand = command.commands.find(c => c.name() === 'scan')!;
      await scanCommand.parseAsync(['node', 'test']);

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No TypeScript files'));
    });

    it('should show no similar files message', async () => {
      mockGlobFiles = ['src/a.ts', 'src/b.ts'];
      mockDuplicates = [];

      const command = createSimilarityCommand();
      const scanCommand = command.commands.find(c => c.name() === 'scan')!;
      await scanCommand.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No similar files found'));
    });

    it('should show similar files when found', async () => {
      mockGlobFiles = ['src/a.ts', 'src/b.ts'];
      mockDuplicates = [
        {
          file: 'src/a.ts',
          matches: [
            {
              file: 'src/b.ts',
              similarity: 0.85,
              matchedAspects: [
                { type: 'methods', items: ['doSomething', 'process'] },
              ],
            },
          ],
        },
      ];

      const command = createSimilarityCommand();
      const scanCommand = command.commands.find(c => c.name() === 'scan')!;
      await scanCommand.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Similar Files'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('src/a.ts'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('85%'));
    });

    it('should output JSON with --json flag', async () => {
      mockGlobFiles = ['src/a.ts'];
      mockDuplicates = [];

      const command = createSimilarityCommand();
      const scanCommand = command.commands.find(c => c.name() === 'scan')!;
      await scanCommand.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('pairs');
    });

    it('should output JSON error when no files with --json', async () => {
      mockGlobFiles = [];

      const command = createSimilarityCommand();
      const scanCommand = command.commands.find(c => c.name() === 'scan')!;
      await scanCommand.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.error !== undefined;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
    });

    it('should handle custom threshold option', async () => {
      mockGlobFiles = ['src/a.ts'];
      mockDuplicates = [];

      const command = createSimilarityCommand();
      const scanCommand = command.commands.find(c => c.name() === 'scan')!;
      await scanCommand.parseAsync(['node', 'test', '--threshold', '70']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('70%'));
    });

    it('should truncate aspect items when more than 5', async () => {
      mockGlobFiles = ['src/a.ts', 'src/b.ts'];
      mockDuplicates = [
        {
          file: 'src/a.ts',
          matches: [
            {
              file: 'src/b.ts',
              similarity: 0.9,
              matchedAspects: [
                { type: 'methods', items: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
              ],
            },
          ],
        },
      ];

      const command = createSimilarityCommand();
      const scanCommand = command.commands.find(c => c.name() === 'scan')!;
      await scanCommand.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('+2 more'));
    });
  });

  describe('check subcommand', () => {
    it('should show no issues message', async () => {
      mockGlobFiles = ['src/a.ts', 'src/b.ts'];
      mockInconsistencies = [];

      const command = createSimilarityCommand();
      const checkCommand = command.commands.find(c => c.name() === 'check')!;
      await checkCommand.parseAsync(['node', 'test', 'src/a.ts']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No consistency issues'));
    });

    it('should show consistency issues when found', async () => {
      mockGlobFiles = ['src/a.ts', 'src/b.ts'];
      mockInconsistencies = [
        {
          referenceFile: 'src/b.ts',
          similarity: 0.75,
          missing: { methods: ['doSomething'], exports: ['helper'] },
          extra: { methods: ['extraMethod'], exports: [] },
        },
      ];

      const command = createSimilarityCommand();
      const checkCommand = command.commands.find(c => c.name() === 'check')!;
      await checkCommand.parseAsync(['node', 'test', 'src/a.ts']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Consistency Issues'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Missing methods'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('doSomething'));
    });

    it('should show extra methods when found', async () => {
      mockGlobFiles = ['src/a.ts', 'src/b.ts'];
      mockInconsistencies = [
        {
          referenceFile: 'src/b.ts',
          similarity: 0.8,
          missing: { methods: [], exports: [] },
          extra: { methods: ['extraMethod'], exports: ['extraExport'] },
        },
      ];

      const command = createSimilarityCommand();
      const checkCommand = command.commands.find(c => c.name() === 'check')!;
      await checkCommand.parseAsync(['node', 'test', 'src/a.ts']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Extra methods'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Extra exports'));
    });

    it('should output JSON with --json flag', async () => {
      mockGlobFiles = ['src/a.ts'];
      mockInconsistencies = [];

      const command = createSimilarityCommand();
      const checkCommand = command.commands.find(c => c.name() === 'check')!;
      await checkCommand.parseAsync(['node', 'test', 'src/a.ts', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('file', 'src/a.ts');
      expect(output).toHaveProperty('issues');
    });
  });

  describe('blocks subcommand', () => {
    it('should warn when no files found', async () => {
      mockGlobFiles = [];

      const command = createSimilarityCommand();
      const blocksCommand = command.commands.find(c => c.name() === 'blocks')!;
      await blocksCommand.parseAsync(['node', 'test']);

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No TypeScript files'));
    });

    it('should show no similar blocks message', async () => {
      mockGlobFiles = ['src/a.ts', 'src/b.ts'];
      mockBlockMatches = [];

      const command = createSimilarityCommand();
      const blocksCommand = command.commands.find(c => c.name() === 'blocks')!;
      await blocksCommand.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No similar code blocks found'));
    });

    it('should show similar blocks when found', async () => {
      mockGlobFiles = ['src/a.ts', 'src/b.ts'];
      mockBlockMatches = [
        {
          block1: { name: 'doSomething', file: 'src/a.ts', line: 10, lines: 15 },
          block2: { name: 'doSomethingElse', file: 'src/b.ts', line: 20, lines: 15 },
          similarity: 0.92,
        },
      ];

      const command = createSimilarityCommand();
      const blocksCommand = command.commands.find(c => c.name() === 'blocks')!;
      await blocksCommand.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Similar Code Blocks'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('doSomething'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('92%'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('15 lines'));
    });

    it('should output JSON with --json flag', async () => {
      mockGlobFiles = ['src/a.ts'];
      mockBlockMatches = [];

      const command = createSimilarityCommand();
      const blocksCommand = command.commands.find(c => c.name() === 'blocks')!;
      await blocksCommand.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('matches');
    });

    it('should output JSON error when no files with --json', async () => {
      mockGlobFiles = [];

      const command = createSimilarityCommand();
      const blocksCommand = command.commands.find(c => c.name() === 'blocks')!;
      await blocksCommand.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.error !== undefined;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle errors in scan subcommand', async () => {
      const config = await import('../../../../src/core/config/loader.js');
      vi.mocked(config.loadConfig).mockRejectedValue(new Error('Config load failed'));

      const command = createSimilarityCommand();
      const scanCommand = command.commands.find(c => c.name() === 'scan')!;
      await expect(scanCommand.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Config load failed');
    });

    it('should handle errors in check subcommand', async () => {
      const config = await import('../../../../src/core/config/loader.js');
      vi.mocked(config.loadConfig).mockRejectedValue(new Error('Config load failed'));

      const command = createSimilarityCommand();
      const checkCommand = command.commands.find(c => c.name() === 'check')!;
      await expect(checkCommand.parseAsync(['node', 'test', 'file.ts'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Config load failed');
    });

    it('should handle errors in blocks subcommand', async () => {
      const config = await import('../../../../src/core/config/loader.js');
      vi.mocked(config.loadConfig).mockRejectedValue(new Error('Config load failed'));

      const command = createSimilarityCommand();
      const blocksCommand = command.commands.find(c => c.name() === 'blocks')!;
      await expect(blocksCommand.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Config load failed');
    });
  });
});
