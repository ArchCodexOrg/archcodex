/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the migrate-registry command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMigrateRegistryCommand } from '../../../../src/cli/commands/migrate-registry.js';

// Mock dependencies
vi.mock('../../../../src/utils/index.js', () => ({
  loadYaml: vi.fn().mockResolvedValue({}),
  stringifyYaml: vi.fn().mockReturnValue(''),
  fileExists: vi.fn().mockResolvedValue(true),
  directoryExists: vi.fn().mockResolvedValue(false),
  ensureDir: vi.fn().mockResolvedValue(undefined),
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

describe('migrate-registry command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMigrateRegistryCommand', () => {
    it('should create a command with correct name', () => {
      const command = createMigrateRegistryCommand();
      expect(command.name()).toBe('migrate-registry');
    });

    it('should have the correct description', () => {
      const command = createMigrateRegistryCommand();
      expect(command.description()).toContain('Convert');
    });

    it('should have an optional source argument', () => {
      const command = createMigrateRegistryCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('source');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createMigrateRegistryCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--dry-run');
      expect(optionNames).toContain('--force');
    });
  });
});
