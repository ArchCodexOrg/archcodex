/** @arch archcodex.test.unit */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAnalyzeCommand } from '../../../../src/cli/commands/analyze.js';
import type { AnalysisResult } from '../../../../src/core/analysis/index.js';

// Mock chalk with pass-through
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    blue: (s: string) => s,
  },
}));

let mockAnalysisResult: AnalysisResult;

vi.mock('../../../../src/core/analysis/index.js', () => ({
  runAllAnalyses: vi.fn().mockImplementation(async () => mockAnalysisResult),
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

describe('analyze command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalysisResult = {
      issues: [],
      summary: {
        total: 0,
        specsAnalyzed: 5,
        bySeverity: {},
        byCategory: {},
      },
    } as unknown as AnalysisResult;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createAnalyzeCommand', () => {
    it('creates a command named analyze', () => {
      const cmd = createAnalyzeCommand();
      expect(cmd.name()).toBe('analyze');
    });

    it('has expected options', () => {
      const cmd = createAnalyzeCommand();
      const optionNames = cmd.options.map(o => o.long);
      expect(optionNames).toContain('--category');
      expect(optionNames).toContain('--severity');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--spec');
      expect(optionNames).toContain('--deep');
    });

    it('has a description', () => {
      const cmd = createAnalyzeCommand();
      expect(cmd.description()).toBeTruthy();
    });

    it('has category option with short flag -c', () => {
      const cmd = createAnalyzeCommand();
      const categoryOpt = cmd.options.find(o => o.long === '--category');
      expect(categoryOpt).toBeDefined();
      expect(categoryOpt!.short).toBe('-c');
    });

    it('has severity option with short flag -s', () => {
      const cmd = createAnalyzeCommand();
      const severityOpt = cmd.options.find(o => o.long === '--severity');
      expect(severityOpt).toBeDefined();
      expect(severityOpt!.short).toBe('-s');
    });

    it('has severity option with default value info', () => {
      const cmd = createAnalyzeCommand();
      const severityOpt = cmd.options.find(o => o.long === '--severity');
      expect(severityOpt).toBeDefined();
      expect(severityOpt!.defaultValue).toBe('info');
    });
  });

  describe('runAnalyze - no issues', () => {
    it('should show no issues found message', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('No issues found'))).toBe(true);
    });

    it('should show specs analyzed count', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('5'))).toBe(true);
    });
  });

  describe('runAnalyze - with issues', () => {
    beforeEach(() => {
      mockAnalysisResult = {
        issues: [
          {
            id: 'LOGIC-001',
            category: 'logic',
            severity: 'error',
            message: 'Missing error handling',
            specId: 'spec.test.one',
            field: 'outputs.errors',
            suggestion: 'Add error type',
          },
          {
            id: 'SEC-001',
            category: 'security',
            severity: 'warning',
            message: 'Input not validated',
            specId: null,
            field: null,
          },
          {
            id: 'DATA-001',
            category: 'data',
            severity: 'info',
            message: 'Consider adding index',
          },
        ],
        summary: {
          total: 3,
          specsAnalyzed: 5,
          bySeverity: { error: 1, warning: 1, info: 1 },
          byCategory: { logic: 1, security: 1, data: 1 },
        },
      } as unknown as AnalysisResult;
    });

    it('should group issues by category', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Logic'))).toBe(true);
      expect(calls.some(c => c.includes('Security'))).toBe(true);
      expect(calls.some(c => c.includes('Data'))).toBe(true);
    });

    it('should show severity labels (ERR, WRN, INF)', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('ERR'))).toBe(true);
      expect(calls.some(c => c.includes('WRN'))).toBe(true);
      expect(calls.some(c => c.includes('INF'))).toBe(true);
    });

    it('should show spec IDs when present', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('spec.test.one'))).toBe(true);
    });

    it('should show field when present', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('outputs.errors'))).toBe(true);
    });

    it('should show suggestions when present', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Add error type'))).toBe(true);
    });

    it('should show summary with total issues and specs', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('3 issue(s)'))).toBe(true);
    });

    it('should show error count in summary', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('1 error(s)'))).toBe(true);
    });

    it('should show warning count in summary', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('1 warning(s)'))).toBe(true);
    });

    it('should show info count in summary', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('1 info'))).toBe(true);
    });
  });

  describe('runAnalyze - JSON output', () => {
    it('should output JSON when --json is provided', async () => {
      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
    });
  });

  describe('runAnalyze - category filtering', () => {
    it('should pass valid categories to runAllAnalyses', async () => {
      const { runAllAnalyses } = await import('../../../../src/core/analysis/index.js');

      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test', '--category', 'logic,security']);

      expect(runAllAnalyses).toHaveBeenCalledWith('/test/project', expect.objectContaining({
        categories: ['logic', 'security'],
      }));
    });

    it('should exit with error for invalid category', async () => {
      const command = createAnalyzeCommand();
      await expect(
        command.parseAsync(['node', 'test', '--category', 'invalid'])
      ).rejects.toThrow('process.exit called');

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Invalid category'))).toBe(true);
    });

    it('should show valid categories after invalid category error', async () => {
      const command = createAnalyzeCommand();
      await expect(
        command.parseAsync(['node', 'test', '--category', 'invalid'])
      ).rejects.toThrow('process.exit called');

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Valid categories'))).toBe(true);
    });
  });

  describe('runAnalyze - severity filtering', () => {
    it('should pass valid severity to runAllAnalyses', async () => {
      const { runAllAnalyses } = await import('../../../../src/core/analysis/index.js');

      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test', '--severity', 'warning']);

      expect(runAllAnalyses).toHaveBeenCalledWith('/test/project', expect.objectContaining({
        severity: 'warning',
      }));
    });

    it('should exit with error for invalid severity', async () => {
      const command = createAnalyzeCommand();
      await expect(
        command.parseAsync(['node', 'test', '--severity', 'critical'])
      ).rejects.toThrow('process.exit called');

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Invalid severity'))).toBe(true);
    });

    it('should show valid severities after invalid severity error', async () => {
      const command = createAnalyzeCommand();
      await expect(
        command.parseAsync(['node', 'test', '--severity', 'critical'])
      ).rejects.toThrow('process.exit called');

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Valid severities'))).toBe(true);
    });
  });

  describe('runAnalyze - spec ID filtering', () => {
    it('should pass spec IDs to runAllAnalyses', async () => {
      const { runAllAnalyses } = await import('../../../../src/core/analysis/index.js');

      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test', '--spec', 'spec.test.one,spec.test.two']);

      expect(runAllAnalyses).toHaveBeenCalledWith('/test/project', expect.objectContaining({
        specIds: ['spec.test.one', 'spec.test.two'],
      }));
    });
  });

  describe('runAnalyze - deep analysis', () => {
    it('should pass deep flag to runAllAnalyses', async () => {
      const { runAllAnalyses } = await import('../../../../src/core/analysis/index.js');

      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test', '--deep']);

      expect(runAllAnalyses).toHaveBeenCalledWith('/test/project', expect.objectContaining({
        deep: true,
      }));
    });
  });

  describe('error handling', () => {
    it('should handle Error exceptions', async () => {
      const { runAllAnalyses } = await import('../../../../src/core/analysis/index.js');
      vi.mocked(runAllAnalyses).mockRejectedValueOnce(new Error('Analysis failed'));

      const command = createAnalyzeCommand();
      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Analysis failed');
    });

    it('should handle non-Error exceptions', async () => {
      const { runAllAnalyses } = await import('../../../../src/core/analysis/index.js');
      vi.mocked(runAllAnalyses).mockRejectedValueOnce('unexpected');

      const command = createAnalyzeCommand();
      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Unknown error');
    });
  });

  describe('printAnalysisReport - zero counts', () => {
    it('should omit zero error count from summary', async () => {
      mockAnalysisResult = {
        issues: [
          { id: 'INF-001', category: 'data', severity: 'info', message: 'Hint' },
        ],
        summary: {
          total: 1,
          specsAnalyzed: 2,
          bySeverity: { error: 0, warning: 0, info: 1 },
          byCategory: { data: 1 },
        },
      } as unknown as AnalysisResult;

      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.every(c => !c.includes('error(s)'))).toBe(true);
    });
  });

  describe('printAnalysisReport - issues without optional fields', () => {
    it('should handle issue without specId or field', async () => {
      mockAnalysisResult = {
        issues: [
          { id: 'TEST-001', category: 'other', severity: 'warning', message: 'General issue' },
        ],
        summary: {
          total: 1,
          specsAnalyzed: 1,
          bySeverity: { warning: 1 },
          byCategory: { other: 1 },
        },
      } as unknown as AnalysisResult;

      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('General issue'))).toBe(true);
    });

    it('should handle issue without suggestion', async () => {
      mockAnalysisResult = {
        issues: [
          { id: 'TEST-001', category: 'other', severity: 'warning', message: 'No suggestion' },
        ],
        summary: {
          total: 1,
          specsAnalyzed: 1,
          bySeverity: { warning: 1 },
          byCategory: { other: 1 },
        },
      } as unknown as AnalysisResult;

      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('No suggestion'))).toBe(true);
      // The "->" arrow prefix for suggestions should not appear
      expect(calls.every(c => !c.includes('-> '))).toBe(true);
    });
  });

  describe('printAnalysisReport - multiple issues in same category', () => {
    it('should show count per category header', async () => {
      mockAnalysisResult = {
        issues: [
          { id: 'LOGIC-001', category: 'logic', severity: 'error', message: 'First' },
          { id: 'LOGIC-002', category: 'logic', severity: 'warning', message: 'Second' },
        ],
        summary: {
          total: 2,
          specsAnalyzed: 1,
          bySeverity: { error: 1, warning: 1 },
          byCategory: { logic: 2 },
        },
      } as unknown as AnalysisResult;

      const command = createAnalyzeCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Logic (2)'))).toBe(true);
    });
  });
});
