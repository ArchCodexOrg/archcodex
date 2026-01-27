/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the intents command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIntentsCommand } from '../../../../src/cli/commands/intents/index.js';

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    files: { source_patterns: ['src/**/*.ts'] },
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadIntentRegistry: vi.fn().mockResolvedValue({
    intents: {},
  }),
}));

vi.mock('../../../../src/cli/commands/intents/list.js', () => ({
  listIntents: vi.fn(),
}));

vi.mock('../../../../src/cli/commands/intents/show.js', () => ({
  showIntent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/cli/commands/intents/usage.js', () => ({
  showUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/cli/commands/intents/validate.js', () => ({
  validateIntents: vi.fn().mockResolvedValue(undefined),
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

describe('intents command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createIntentsCommand', () => {
    it('should create a command with correct name', () => {
      const command = createIntentsCommand();
      expect(command.name()).toBe('intents');
    });

    it('should have the correct description', () => {
      const command = createIntentsCommand();
      expect(command.description()).toContain('intent');
    });

    it('should have no arguments', () => {
      const command = createIntentsCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(0);
    });

    it('should have required options', () => {
      const command = createIntentsCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--config');
      expect(optionNames).toContain('--list');
      expect(optionNames).toContain('--show');
      expect(optionNames).toContain('--usage');
      expect(optionNames).toContain('--validate');
      expect(optionNames).toContain('--json');
    });
  });
});
