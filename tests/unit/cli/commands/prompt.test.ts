/**
 * @arch archcodex.test.unit
 *
 * Tests for the prompt command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPromptCommand } from '../../../../src/cli/commands/prompt.js';

// Mock the prompt-builder module
vi.mock('../../../../src/core/unified-context/prompt-builder.js', () => ({
  buildPrompt: vi.fn(),
  buildMultiModulePrompt: vi.fn(),
  getCompactContext: vi.fn(),
}));

// Mock the logger
vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the discovery module
vi.mock('../../../../src/core/unified-context/discovery/index.js', () => ({
  analyzeTaskEnhanced: vi.fn(),
  formatEnhancedAnalysis: vi.fn(),
  refineWithAnswers: vi.fn(),
  recordSelection: vi.fn(),
}));

// Mock the questions module
vi.mock('../../../../src/core/unified-context/discovery/questions.js', () => ({
  formatQuestions: vi.fn(),
}));

// Mock readline
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_, callback) => callback('1')),
    close: vi.fn(),
  })),
}));

import {
  buildPrompt,
  buildMultiModulePrompt,
  getCompactContext,
} from '../../../../src/core/unified-context/prompt-builder.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  analyzeTaskEnhanced,
  formatEnhancedAnalysis,
  refineWithAnswers,
  recordSelection,
} from '../../../../src/core/unified-context/discovery/index.js';
import { formatQuestions } from '../../../../src/core/unified-context/discovery/questions.js';
import * as readline from 'readline';

const mockBuildPrompt = vi.mocked(buildPrompt);
const mockBuildMultiModulePrompt = vi.mocked(buildMultiModulePrompt);
const mockGetCompactContext = vi.mocked(getCompactContext);
const mockLogger = vi.mocked(logger);
const mockAnalyzeTaskEnhanced = vi.mocked(analyzeTaskEnhanced);
const mockFormatEnhancedAnalysis = vi.mocked(formatEnhancedAnalysis);
const mockRefineWithAnswers = vi.mocked(refineWithAnswers);
const mockRecordSelection = vi.mocked(recordSelection);
const mockFormatQuestions = vi.mocked(formatQuestions);
const mockReadline = vi.mocked(readline);

describe('Prompt Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPromptCommand', () => {
    it('should create a command with correct name and description', () => {
      const command = createPromptCommand();

      expect(command.name()).toBe('prompt');
      expect(command.description()).toContain('prompt');
      expect(command.description()).toContain('context');
    });

    it('should have module option', () => {
      const command = createPromptCommand();
      const moduleOption = command.options.find(o => o.long === '--module');

      expect(moduleOption).toBeDefined();
      // Module has <path> so requires value when provided, but option itself is not mandatory
      // (can be omitted when using --discover)
    });

    it('should have discover option', () => {
      const command = createPromptCommand();
      const discoverOption = command.options.find(o => o.long === '--discover');

      expect(discoverOption).toBeDefined();
    });

    it('should have required task option', () => {
      const command = createPromptCommand();
      const taskOption = command.options.find(o => o.long === '--task');

      expect(taskOption).toBeDefined();
      expect(taskOption?.required).toBe(true);
    });

    it('should have model option with sonnet default', () => {
      const command = createPromptCommand();
      const modelOption = command.options.find(o => o.long === '--model');

      expect(modelOption).toBeDefined();
      expect(modelOption?.defaultValue).toBe('sonnet');
    });

    it('should have requirements option', () => {
      const command = createPromptCommand();
      const reqOption = command.options.find(o => o.long === '--requirements');

      expect(reqOption).toBeDefined();
    });

    it('should have preview option', () => {
      const command = createPromptCommand();
      const previewOption = command.options.find(o => o.long === '--preview');

      expect(previewOption).toBeDefined();
    });

    it('should have no-validation option', () => {
      const command = createPromptCommand();
      const noValOption = command.options.find(o => o.long === '--no-validation');

      expect(noValOption).toBeDefined();
    });

    it('should have context-only option', () => {
      const command = createPromptCommand();
      const contextOnlyOption = command.options.find(o => o.long === '--context-only');

      expect(contextOnlyOption).toBeDefined();
    });

    it('should have json option', () => {
      const command = createPromptCommand();
      const jsonOption = command.options.find(o => o.long === '--json');

      expect(jsonOption).toBeDefined();
    });
  });

  describe('command execution', () => {
    it('should call buildPrompt with correct options', async () => {
      mockBuildPrompt.mockResolvedValue({
        prompt: 'test prompt',
        contextTokens: 100,
        modulePath: 'src/core/',
        archTag: 'archcodex.core.engine',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const command = createPromptCommand();

      await command.parseAsync([
        'node', 'test',
        '-m', 'src/core/',
        '-t', 'Add method',
        '--model', 'haiku',
      ]);

      expect(mockBuildPrompt).toHaveBeenCalledWith(
        expect.any(String),
        'src/core/',
        expect.objectContaining({
          model: 'haiku',
          task: 'Add method',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should output prompt to console', async () => {
      mockBuildPrompt.mockResolvedValue({
        prompt: 'Generated prompt content',
        contextTokens: 100,
        modulePath: 'src/core/',
        archTag: 'archcodex.core.engine',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const command = createPromptCommand();

      await command.parseAsync([
        'node', 'test',
        '-m', 'src/core/',
        '-t', 'Add method',
      ]);

      expect(consoleSpy).toHaveBeenCalledWith('Generated prompt content');
      consoleSpy.mockRestore();
    });

    it('should output JSON when --json flag is set', async () => {
      mockBuildPrompt.mockResolvedValue({
        prompt: 'test prompt',
        contextTokens: 100,
        modulePath: 'src/core/',
        archTag: 'archcodex.core.engine',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const command = createPromptCommand();

      await command.parseAsync([
        'node', 'test',
        '-m', 'src/core/',
        '-t', 'Add method',
        '--json',
      ]);

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('prompt');
      expect(parsed).toHaveProperty('metadata');
      expect(parsed.metadata).toHaveProperty('modulePath');
      expect(parsed.metadata).toHaveProperty('archTag');
      expect(parsed.metadata).toHaveProperty('contextTokens');

      consoleSpy.mockRestore();
    });

    it('should use getCompactContext for context-only mode', async () => {
      mockGetCompactContext.mockResolvedValue('## Context: src/core/\n@arch: test');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const command = createPromptCommand();

      await command.parseAsync([
        'node', 'test',
        '-m', 'src/core/',
        '-t', 'unused',
        '--context-only',
      ]);

      expect(mockGetCompactContext).toHaveBeenCalled();
      expect(mockBuildPrompt).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should parse comma-separated requirements', async () => {
      mockBuildPrompt.mockResolvedValue({
        prompt: 'test',
        contextTokens: 50,
        modulePath: 'src/',
        archTag: 'test',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const command = createPromptCommand();

      await command.parseAsync([
        'node', 'test',
        '-m', 'src/',
        '-t', 'task',
        '-r', 'req1,req2,req3',
      ]);

      expect(mockBuildPrompt).toHaveBeenCalledWith(
        expect.any(String),
        'src/',
        expect.objectContaining({
          requirements: ['req1', 'req2', 'req3'],
        })
      );

      consoleSpy.mockRestore();
    });

    it('should use buildMultiModulePrompt for comma-separated modules', async () => {
      mockBuildMultiModulePrompt.mockResolvedValue({
        prompt: 'multi-module prompt',
        contextTokens: 200,
        modulePath: 'src/core/, src/cli/',
        archTag: 'archcodex.core.engine, archcodex.cli.command',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const command = createPromptCommand();

      await command.parseAsync([
        'node', 'test',
        '-m', 'src/core/,src/cli/',
        '-t', 'Refactor shared code',
      ]);

      expect(mockBuildMultiModulePrompt).toHaveBeenCalledWith(
        expect.any(String),
        ['src/core/', 'src/cli/'],
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should set preview mode when --preview flag is set', async () => {
      mockBuildPrompt.mockResolvedValue({
        prompt: 'preview prompt',
        contextTokens: 100,
        modulePath: 'src/',
        archTag: 'test',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const command = createPromptCommand();

      await command.parseAsync([
        'node', 'test',
        '-m', 'src/',
        '-t', 'task',
        '--preview',
      ]);

      expect(mockBuildPrompt).toHaveBeenCalledWith(
        expect.any(String),
        'src/',
        expect.objectContaining({
          outputMode: 'preview',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should disable validation when --no-validation flag is set', async () => {
      mockBuildPrompt.mockResolvedValue({
        prompt: 'test',
        contextTokens: 100,
        modulePath: 'src/',
        archTag: 'test',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const command = createPromptCommand();

      await command.parseAsync([
        'node', 'test',
        '-m', 'src/',
        '-t', 'task',
        '--no-validation',
      ]);

      expect(mockBuildPrompt).toHaveBeenCalledWith(
        expect.any(String),
        'src/',
        expect.objectContaining({
          includeValidation: false,
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should exit with error when module not found', async () => {
      mockBuildPrompt.mockResolvedValue(null);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createPromptCommand();

      await expect(command.parseAsync([
        'node', 'test',
        '-m', 'src/nonexistent/',
        '-t', 'task',
      ])).rejects.toThrow('process.exit called');

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No module found'));

      processExitSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should exit with error for invalid model', async () => {
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createPromptCommand();

      await expect(command.parseAsync([
        'node', 'test',
        '-m', 'src/',
        '-t', 'task',
        '--model', 'invalid',
      ])).rejects.toThrow('process.exit called');

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid model'));

      processExitSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should exit with error when context-only fails', async () => {
      mockGetCompactContext.mockResolvedValue(null);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createPromptCommand();

      await expect(command.parseAsync([
        'node', 'test',
        '-m', 'src/bad/',
        '-t', 'unused',
        '--context-only',
      ])).rejects.toThrow('process.exit called');

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('No module found'));

      processExitSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('discover mode', () => {
    it('should analyze task and show suggestions with --discover', async () => {
      mockAnalyzeTaskEnhanced.mockResolvedValue({
        task: 'Add caching to database',
        keywords: ['database', 'caching'],
        entities: [],
        actionType: 'add',
        suggestions: [
          {
            path: 'src/core/db/',
            confidence: 85,
            primaryReason: 'Path contains "database"',
            fileCount: 5,
            architecture: 'archcodex.core.engine',
            signals: [],
          },
        ],
        clarifyingQuestions: [],
        scope: 'single-module',
        needsClarification: false,
      });

      mockFormatEnhancedAnalysis.mockReturnValue('Task Analysis:\n  Action: add\n  Keywords: database, caching');

      mockBuildPrompt.mockResolvedValue({
        prompt: 'test prompt',
        contextTokens: 100,
        modulePath: 'src/core/db/',
        archTag: 'archcodex.core.engine',
      });

      // Mock readline to select option 1
      mockReadline.createInterface.mockReturnValue({
        question: vi.fn((_, callback) => callback('1')),
        close: vi.fn(),
      } as unknown as readline.Interface);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const command = createPromptCommand();

      await command.parseAsync([
        'node', 'test',
        '-t', 'Add caching to database',
        '--discover',
      ]);

      expect(mockAnalyzeTaskEnhanced).toHaveBeenCalledWith(expect.any(String), 'Add caching to database', expect.any(Object));
      expect(mockFormatEnhancedAnalysis).toHaveBeenCalled();
      expect(mockBuildPrompt).toHaveBeenCalledWith(
        expect.any(String),
        'src/core/db/',
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should exit gracefully when user quits discover mode', async () => {
      mockAnalyzeTaskEnhanced.mockResolvedValue({
        task: 'Some task',
        keywords: ['test'],
        entities: [],
        actionType: 'add',
        suggestions: [
          { path: 'src/test/', confidence: 80, primaryReason: 'test', fileCount: 3, signals: [] },
        ],
        clarifyingQuestions: [],
        scope: 'single-module',
        needsClarification: false,
      });

      mockFormatEnhancedAnalysis.mockReturnValue('Analysis output');

      // Mock readline to quit
      mockReadline.createInterface.mockReturnValue({
        question: vi.fn((_, callback) => callback('q')),
        close: vi.fn(),
      } as unknown as readline.Interface);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createPromptCommand();

      await expect(command.parseAsync([
        'node', 'test',
        '-t', 'Some task',
        '--discover',
      ])).rejects.toThrow('process.exit called');

      expect(mockLogger.info).toHaveBeenCalledWith('Cancelled.');

      processExitSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should select all modules when user enters "a"', async () => {
      mockAnalyzeTaskEnhanced.mockResolvedValue({
        task: 'Refactor everything',
        keywords: ['refactor'],
        entities: [],
        actionType: 'refactor',
        suggestions: [
          { path: 'src/core/', confidence: 90, primaryReason: 'test', fileCount: 10, signals: [] },
          { path: 'src/cli/', confidence: 85, primaryReason: 'test', fileCount: 8, signals: [] },
          { path: 'src/utils/', confidence: 80, primaryReason: 'test', fileCount: 5, signals: [] },
        ],
        clarifyingQuestions: [],
        scope: 'multi-module',
        needsClarification: false,
      });

      mockFormatEnhancedAnalysis.mockReturnValue('Analysis output');

      // Mock buildMultiModulePrompt for multi-module case
      mockBuildMultiModulePrompt.mockResolvedValue({
        prompt: 'multi prompt',
        contextTokens: 300,
        modulePath: 'src/core/, src/cli/, src/utils/',
        archTag: 'multiple',
      });

      // Mock readline to select all
      mockReadline.createInterface.mockReturnValue({
        question: vi.fn((_, callback) => callback('a')),
        close: vi.fn(),
      } as unknown as readline.Interface);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const command = createPromptCommand();

      await command.parseAsync([
        'node', 'test',
        '-t', 'Refactor everything',
        '--discover',
      ]);

      expect(mockBuildMultiModulePrompt).toHaveBeenCalledWith(
        expect.any(String),
        ['src/core/', 'src/cli/', 'src/utils/'],
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should exit with error when no suggestions found', async () => {
      mockAnalyzeTaskEnhanced.mockResolvedValue({
        task: 'Unknown task',
        keywords: ['unknown'],
        entities: [],
        actionType: 'unknown',
        suggestions: [],
        clarifyingQuestions: [],
        scope: 'single-module',
        needsClarification: false,
      });

      mockFormatEnhancedAnalysis.mockReturnValue('No suggestions');

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createPromptCommand();

      await expect(command.parseAsync([
        'node', 'test',
        '-t', 'Unknown task',
        '--discover',
      ])).rejects.toThrow('process.exit called');

      expect(mockLogger.error).toHaveBeenCalledWith('No modules found. Try specifying -m directly.');

      processExitSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should require module when not using discover', async () => {
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createPromptCommand();

      await expect(command.parseAsync([
        'node', 'test',
        '-t', 'task without module',
      ])).rejects.toThrow('process.exit called');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Module path is required. Use -m <path> or --discover to find modules.'
      );

      processExitSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });
});
