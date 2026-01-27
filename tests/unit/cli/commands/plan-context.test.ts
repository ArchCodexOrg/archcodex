/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the plan-context command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPlanContextCommand } from '../../../../src/cli/commands/plan-context.js';
import type { PlanContextResult } from '../../../../src/core/plan-context/index.js';

// Module-level mock configuration
let mockPlanContextResult: PlanContextResult = {
  layers: [],
  sharedConstraints: [],
  architectures: [],
};
let mockPlanContextError: Error | null = null;
let mockFormattedOutput = 'Formatted plan context output';

// Mock dependencies
vi.mock('../../../../src/core/plan-context/index.js', () => ({
  getPlanContext: vi.fn().mockImplementation(async () => {
    if (mockPlanContextError) throw mockPlanContextError;
    return mockPlanContextResult;
  }),
  formatPlanContextCompact: vi.fn().mockImplementation(() => mockFormattedOutput),
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

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

// Mock process.cwd
vi.spyOn(process, 'cwd').mockReturnValue('/test/project');

// Spy on console.log
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('plan-context command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPlanContextResult = {
      layers: [],
      sharedConstraints: [],
      architectures: [],
    };
    mockPlanContextError = null;
    mockFormattedOutput = 'Formatted plan context output';

    // Reset mocks
    const planContext = await import('../../../../src/core/plan-context/index.js');
    vi.mocked(planContext.getPlanContext).mockImplementation(async () => {
      if (mockPlanContextError) throw mockPlanContextError;
      return mockPlanContextResult;
    });
    vi.mocked(planContext.formatPlanContextCompact).mockImplementation(() => mockFormattedOutput);
  });

  describe('createPlanContextCommand', () => {
    it('should create a command with correct name', () => {
      const command = createPlanContextCommand();
      expect(command.name()).toBe('plan-context');
    });

    it('should have the correct description', () => {
      const command = createPlanContextCommand();
      expect(command.description()).toContain('context');
    });

    it('should have an optional scope argument', () => {
      const command = createPlanContextCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('scope');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createPlanContextCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--files');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--config');
    });
  });

  describe('runPlanContext', () => {
    it('should use default scope (src/) when no paths provided', async () => {
      const planContext = await import('../../../../src/core/plan-context/index.js');

      const command = createPlanContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(planContext.getPlanContext).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          paths: ['src/'],
        })
      );
    });

    it('should use provided scope paths', async () => {
      const planContext = await import('../../../../src/core/plan-context/index.js');

      const command = createPlanContextCommand();
      await command.parseAsync(['node', 'test', 'lib/', 'src/core/']);

      expect(planContext.getPlanContext).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          paths: ['lib/', 'src/core/'],
        })
      );
    });

    it('should pass target files when --files option provided', async () => {
      const planContext = await import('../../../../src/core/plan-context/index.js');

      const command = createPlanContextCommand();
      await command.parseAsync(['node', 'test', '--files', 'src/a.ts', 'src/b.ts']);

      expect(planContext.getPlanContext).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          targetFiles: ['src/a.ts', 'src/b.ts'],
        })
      );
    });

    it('should output JSON when --json flag is provided', async () => {
      mockPlanContextResult = {
        layers: [{ name: 'core', boundary: { forbidden: ['cli'] } }],
        sharedConstraints: [],
        architectures: [{ id: 'test.arch', constraints: [] }],
      };

      const command = createPlanContextCommand();
      await command.parseAsync(['node', 'test', '--json']);

      // Should output JSON (stringified result)
      const jsonCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"layers"')
      );
      expect(jsonCall).toBeDefined();
    });

    it('should output formatted compact text by default', async () => {
      mockFormattedOutput = '=== Plan Context ===\nFormatted output here';

      const planContext = await import('../../../../src/core/plan-context/index.js');

      const command = createPlanContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(planContext.formatPlanContextCompact).toHaveBeenCalledWith(mockPlanContextResult);
      expect(consoleSpy).toHaveBeenCalledWith('=== Plan Context ===\nFormatted output here');
    });

    it('should handle errors from getPlanContext', async () => {
      mockPlanContextError = new Error('Failed to get plan context');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createPlanContextCommand();
      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Failed to get plan context');
    });

    it('should handle non-Error exceptions', async () => {
      const planContext = await import('../../../../src/core/plan-context/index.js');
      vi.mocked(planContext.getPlanContext).mockRejectedValue('string error');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createPlanContextCommand();
      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Unknown error');
    });

    it('should use process.cwd() for project root', async () => {
      const planContext = await import('../../../../src/core/plan-context/index.js');

      const command = createPlanContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(planContext.getPlanContext).toHaveBeenCalledWith(
        '/test/project',
        expect.any(Object)
      );
    });

    it('should combine scope paths and files', async () => {
      const planContext = await import('../../../../src/core/plan-context/index.js');

      const command = createPlanContextCommand();
      await command.parseAsync(['node', 'test', 'src/core/', '--files', 'src/main.ts']);

      expect(planContext.getPlanContext).toHaveBeenCalledWith(
        '/test/project',
        {
          paths: ['src/core/'],
          targetFiles: ['src/main.ts'],
        }
      );
    });

    it('should handle empty result gracefully', async () => {
      mockPlanContextResult = {
        layers: [],
        sharedConstraints: [],
        architectures: [],
      };
      mockFormattedOutput = 'No architectures found in scope.';

      const command = createPlanContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith('No architectures found in scope.');
    });

    it('should handle result with all sections populated', async () => {
      mockPlanContextResult = {
        layers: [
          { name: 'core', boundary: { forbidden: ['infra'], allowed: ['util'] } },
        ],
        sharedConstraints: [
          { rule: 'forbid_pattern', value: 'console.log', severity: 'error' },
        ],
        architectures: [
          {
            id: 'project.core.service',
            constraints: [{ rule: 'max_file_lines', value: 500, severity: 'warning' }],
            hints: ['Keep services stateless'],
            referenceImplementations: ['src/services/example.ts'],
            filePattern: '${name}Service.ts',
          },
        ],
      };
      mockFormattedOutput = 'Detailed plan context with all sections';

      const planContext = await import('../../../../src/core/plan-context/index.js');

      const command = createPlanContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(planContext.formatPlanContextCompact).toHaveBeenCalledWith(mockPlanContextResult);
      expect(consoleSpy).toHaveBeenCalledWith('Detailed plan context with all sections');
    });
  });
});
