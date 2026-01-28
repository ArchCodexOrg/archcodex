/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the types command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTypesCommand } from '../../../../src/cli/commands/types.js';

// Mock dependencies
vi.mock('../../../../src/core/types/index.js', () => ({
  TypeExtractor: vi.fn(function() {
    return {
    extractFromFiles: vi.fn().mockResolvedValue([]),
    dispose: vi.fn(),
  };
  }),
  DuplicateDetector: vi.fn(function() {
    return {
    detectDuplicates: vi.fn().mockReturnValue({
      exactDuplicates: [],
      renamedDuplicates: [],
      similarTypes: [],
    }),
  };
  }),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockResolvedValue([]),
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

describe('types command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTypesCommand', () => {
    it('should create a command with correct name', () => {
      const command = createTypesCommand();
      expect(command.name()).toBe('types');
    });

    it('should have the correct description', () => {
      const command = createTypesCommand();
      expect(command.description()).toContain('duplicate');
    });

    it('should have an optional files argument', () => {
      const command = createTypesCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('files');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createTypesCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--threshold');
      expect(optionNames).toContain('--include-private');
      expect(optionNames).toContain('--json');
    });
  });
});
