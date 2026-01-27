/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the help command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHelpCommand } from '../../../../src/cli/commands/help.js';

describe('help command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createHelpCommand', () => {
    it('should create a command with correct name', () => {
      const command = createHelpCommand();
      expect(command.name()).toBe('help');
    });

    it('should have the correct description', () => {
      const command = createHelpCommand();
      expect(command.description()).toContain('help');
    });

    it('should have an optional topic argument', () => {
      const command = createHelpCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('topic');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createHelpCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--full');
    });
  });
});
