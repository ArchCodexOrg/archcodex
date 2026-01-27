/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the decide command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDecideCommand } from '../../../../src/cli/commands/decide.js';

// Mock decision tree result
let mockTree: {
  version: string;
  description?: string;
  start: string;
  nodes: Record<string, { type: string; text?: string; yes?: string; no?: string; arch_id?: string; why?: string; examples?: string }>;
} | null = null;

// Mock dependencies
vi.mock('../../../../src/core/discovery/index.js', () => ({
  loadDecisionTree: vi.fn().mockImplementation(async () => mockTree),
  startNavigation: vi.fn().mockReturnValue({ currentNode: 'q1', path: [] }),
  getCurrentNode: vi.fn().mockImplementation((tree, state) => tree?.nodes?.[state.currentNode]),
  answerQuestion: vi.fn(),
  isDecisionResult: vi.fn().mockReturnValue(false),
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
      cyan: (s: string) => s,
    }),
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    cyan: Object.assign((s: string) => s, { bold: (s: string) => s }),
    dim: (s: string) => s,
  },
}));

// Mock readline
vi.mock('node:readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn(),
    close: vi.fn(),
  }),
}));

describe('decide command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTree = null;
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Reset mock implementations
    const { loadDecisionTree } = await import('../../../../src/core/discovery/index.js');
    vi.mocked(loadDecisionTree).mockImplementation(async () => mockTree);
  });

  describe('createDecideCommand', () => {
    it('should create a command with correct name', () => {
      const command = createDecideCommand();
      expect(command.name()).toBe('decide');
    });

    it('should have the correct description', () => {
      const command = createDecideCommand();
      expect(command.description()).toContain('decision tree');
    });

    it('should have no arguments', () => {
      const command = createDecideCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(0);
    });

    it('should have required options', () => {
      const command = createDecideCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--show-tree');
    });
  });

  describe('execution', () => {
    it('should warn when no decision tree found', async () => {
      mockTree = null;

      const command = createDecideCommand();
      await command.parseAsync(['node', 'test']);

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No decision tree found'));
    });

    it('should show example tree format when no tree found', async () => {
      mockTree = null;

      const command = createDecideCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Example decision-tree.yaml'));
    });

    it('should print tree structure with --show-tree option', async () => {
      mockTree = {
        version: '1.0',
        description: 'Test tree',
        start: 'q1',
        nodes: {
          q1: { type: 'question', text: 'Is this a test?', yes: 'r1', no: 'r2' },
          r1: { type: 'result', arch_id: 'test.arch1', why: 'Test reason' },
          r2: { type: 'result', arch_id: 'test.arch2' },
        },
      };

      const command = createDecideCommand();
      await command.parseAsync(['node', 'test', '--show-tree']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Decision Tree Structure'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Is this a test?'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test.arch1'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test.arch2'));
    });

    it('should print tree description when available', async () => {
      mockTree = {
        version: '1.0',
        description: 'Architecture selection guide',
        start: 'q1',
        nodes: {
          q1: { type: 'question', text: 'Test?', yes: 'r1', no: 'r1' },
          r1: { type: 'result', arch_id: 'test.arch' },
        },
      };

      const command = createDecideCommand();
      await command.parseAsync(['node', 'test', '--show-tree']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Architecture selection guide'));
    });

    it('should handle missing nodes in tree', async () => {
      mockTree = {
        version: '1.0',
        start: 'q1',
        nodes: {
          q1: { type: 'question', text: 'Test?', yes: 'missing', no: 'r1' },
          r1: { type: 'result', arch_id: 'test.arch' },
        },
      };

      const command = createDecideCommand();
      await command.parseAsync(['node', 'test', '--show-tree']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('missing'));
    });

    it('should handle circular references in tree', async () => {
      mockTree = {
        version: '1.0',
        start: 'q1',
        nodes: {
          q1: { type: 'question', text: 'First?', yes: 'q2', no: 'r1' },
          q2: { type: 'question', text: 'Second?', yes: 'q1', no: 'r1' }, // circular
          r1: { type: 'result', arch_id: 'test.arch' },
        },
      };

      const command = createDecideCommand();
      await command.parseAsync(['node', 'test', '--show-tree']);

      // Should not hang - circular reference handled
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('q1'));
    });

    it('should print examples in tree structure when available', async () => {
      mockTree = {
        version: '1.0',
        start: 'q1',
        nodes: {
          q1: { type: 'question', text: 'Is CLI?', examples: 'commands, handlers', yes: 'r1', no: 'r1' },
          r1: { type: 'result', arch_id: 'test.arch' },
        },
      };

      const command = createDecideCommand();
      await command.parseAsync(['node', 'test', '--show-tree']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('commands, handlers'));
    });

    it('should print "why" reason for results', async () => {
      mockTree = {
        version: '1.0',
        start: 'q1',
        nodes: {
          q1: { type: 'question', text: 'Test?', yes: 'r1', no: 'r1' },
          r1: { type: 'result', arch_id: 'test.arch', why: 'This is the reason' },
        },
      };

      const command = createDecideCommand();
      await command.parseAsync(['node', 'test', '--show-tree']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('This is the reason'));
    });

    it('should handle errors and exit with code 1', async () => {
      const { loadDecisionTree } = await import('../../../../src/core/discovery/index.js');
      vi.mocked(loadDecisionTree).mockRejectedValue(new Error('Load error'));

      const command = createDecideCommand();

      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Load error');
    });
  });
});
