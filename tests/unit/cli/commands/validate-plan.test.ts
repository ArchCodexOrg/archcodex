/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the validate-plan command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createValidatePlanCommand } from '../../../../src/cli/commands/validate-plan.js';

// Configurable mock behavior
let mockValidationResult = {
  valid: true as boolean,
  errors: [] as Array<{ path: string; message: string }>,
  warnings: [] as Array<{ path: string; message: string }>,
};

let mockPlanFileContent = '{"changes": []}';

// Mock dependencies
vi.mock('../../../../src/core/validate-plan/index.js', () => ({
  validatePlan: vi.fn().mockImplementation(async () => mockValidationResult),
  formatValidationResult: vi.fn().mockReturnValue('Validation passed'),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn().mockImplementation(async () => mockPlanFileContent),
}));

import { validatePlan, formatValidationResult } from '../../../../src/core/validate-plan/index.js';
import { readFile } from '../../../../src/utils/file-system.js';
import { logger as log } from '../../../../src/utils/logger.js';

describe('validate-plan command', () => {
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
    mockValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };
    mockPlanFileContent = '{"changes": []}';

    // Reset mocks to use current variables
    vi.mocked(validatePlan).mockImplementation(async () => mockValidationResult);
    vi.mocked(readFile).mockImplementation(async () => mockPlanFileContent);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createValidatePlanCommand', () => {
    it('should create a command with correct name', () => {
      const command = createValidatePlanCommand();
      expect(command.name()).toBe('validate-plan');
    });

    it('should have the correct description', () => {
      const command = createValidatePlanCommand();
      expect(command.description()).toBe('Validate a proposed change set against architectural constraints (pre-execution)');
    });

    it('should have an optional planFile argument', () => {
      const command = createValidatePlanCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('planFile');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createValidatePlanCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--stdin');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--config');
    });

    it('should have correct default for config option', () => {
      const command = createValidatePlanCommand();
      const configOption = command.options.find((opt) => opt.long === '--config');
      expect(configOption?.defaultValue).toBe('.arch/config.yaml');
    });

    it('should have short flag for config option', () => {
      const command = createValidatePlanCommand();
      const configOption = command.options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');
    });
  });

  describe('missing input', () => {
    it('should error when no plan file and no stdin', async () => {
      const command = createValidatePlanCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Provide a plan file'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('plan file input', () => {
    it('should read plan from file', async () => {
      const command = createValidatePlanCommand();
      await command.parseAsync(['node', 'test', 'plan.json']);

      expect(readFile).toHaveBeenCalledWith(expect.stringContaining('plan.json'));
      expect(validatePlan).toHaveBeenCalled();
    });

    it('should resolve plan file path from project root', async () => {
      const command = createValidatePlanCommand();
      await command.parseAsync(['node', 'test', 'plans/my-plan.json']);

      expect(readFile).toHaveBeenCalledWith('/project/plans/my-plan.json');
    });

    it('should show formatted result on success', async () => {
      const command = createValidatePlanCommand();
      await command.parseAsync(['node', 'test', 'plan.json']);

      expect(formatValidationResult).toHaveBeenCalledWith(mockValidationResult);
      expect(consoleLogSpy).toHaveBeenCalledWith('Validation passed');
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json is used', async () => {
      const command = createValidatePlanCommand();
      await command.parseAsync(['node', 'test', 'plan.json', '--json']);

      expect(formatValidationResult).not.toHaveBeenCalled();
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

    it('should include validation result in JSON', async () => {
      mockValidationResult = {
        valid: true,
        errors: [],
        warnings: [{ path: 'src/test.ts', message: 'Warning' }],
      };

      const command = createValidatePlanCommand();
      await command.parseAsync(['node', 'test', 'plan.json', '--json']);

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
      expect(output.valid).toBe(true);
      expect(output.warnings).toHaveLength(1);
    });
  });

  describe('validation failure', () => {
    it('should exit with code 1 on validation failure', async () => {
      mockValidationResult = {
        valid: false,
        errors: [{ path: 'src/test.ts', message: 'Forbidden import' }],
        warnings: [],
      };

      const command = createValidatePlanCommand();

      try {
        await command.parseAsync(['node', 'test', 'plan.json']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not exit with code 1 on validation success', async () => {
      mockValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
      };

      const command = createValidatePlanCommand();
      await command.parseAsync(['node', 'test', 'plan.json']);

      // Should not have been called with 1
      expect(processExitSpy).not.toHaveBeenCalledWith(1);
    });
  });

  describe('invalid JSON', () => {
    it('should error on invalid JSON', async () => {
      mockPlanFileContent = 'not valid json';

      const command = createValidatePlanCommand();

      try {
        await command.parseAsync(['node', 'test', 'plan.json']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should error when changes array is missing', async () => {
      mockPlanFileContent = '{"other": "data"}';

      const command = createValidatePlanCommand();

      try {
        await command.parseAsync(['node', 'test', 'plan.json']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('changes'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should error when changes is not an array', async () => {
      mockPlanFileContent = '{"changes": "not an array"}';

      const command = createValidatePlanCommand();

      try {
        await command.parseAsync(['node', 'test', 'plan.json']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('changes'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling', () => {
    it('should handle file read errors', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

      const command = createValidatePlanCommand();

      try {
        await command.parseAsync(['node', 'test', 'plan.json']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('File not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle validation errors', async () => {
      vi.mocked(validatePlan).mockRejectedValue(new Error('Validation failed'));

      const command = createValidatePlanCommand();

      try {
        await command.parseAsync(['node', 'test', 'plan.json']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Validation failed');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(readFile).mockRejectedValue('string error');

      const command = createValidatePlanCommand();

      try {
        await command.parseAsync(['node', 'test', 'plan.json']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Unknown error');
    });
  });

  describe('validatePlan call', () => {
    it('should pass project root to validatePlan', async () => {
      const command = createValidatePlanCommand();
      await command.parseAsync(['node', 'test', 'plan.json']);

      expect(validatePlan).toHaveBeenCalledWith('/project', expect.any(Object));
    });

    it('should pass parsed input to validatePlan', async () => {
      mockPlanFileContent = JSON.stringify({
        changes: [
          { path: 'src/test.ts', action: 'create', archId: 'test.arch' },
        ],
      });

      const command = createValidatePlanCommand();
      await command.parseAsync(['node', 'test', 'plan.json']);

      expect(validatePlan).toHaveBeenCalledWith(
        '/project',
        expect.objectContaining({
          changes: [
            expect.objectContaining({
              path: 'src/test.ts',
              action: 'create',
              archId: 'test.arch',
            }),
          ],
        })
      );
    });
  });
});
