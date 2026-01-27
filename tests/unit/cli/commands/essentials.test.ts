/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the essentials command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEssentialsCommand } from '../../../../src/cli/commands/essentials.js';

describe('essentials command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createEssentialsCommand', () => {
    it('should create a command with correct name', () => {
      const command = createEssentialsCommand();
      expect(command.name()).toBe('essentials');
    });

    it('should have the correct description', () => {
      const command = createEssentialsCommand();
      expect(command.description()).toContain('essential');
    });

    it('should have no arguments', () => {
      const command = createEssentialsCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(0);
    });

    it('should have no options', () => {
      const command = createEssentialsCommand();
      const options = command.options;
      expect(options.length).toBe(0);
    });
  });
});
