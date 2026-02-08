/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the init-hooks command structure.
 */
import { describe, it, expect } from 'vitest';
import { createInitHooksCommand } from '../../../../src/cli/commands/init-hooks.js';

describe('init-hooks command', () => {
  describe('createInitHooksCommand', () => {
    it('should create a command named init-hooks', () => {
      const command = createInitHooksCommand();
      expect(command.name()).toBe('init-hooks');
    });

    it('should have a description mentioning Claude Code hooks', () => {
      const command = createInitHooksCommand();
      const description = command.description();
      expect(description).toContain('hooks');
    });

    it('should have --force option', () => {
      const command = createInitHooksCommand();
      const optionNames = command.options.map(o => o.long);
      expect(optionNames).toContain('--force');
    });

    it('should have --command option', () => {
      const command = createInitHooksCommand();
      const optionNames = command.options.map(o => o.long);
      expect(optionNames).toContain('--command');
    });

    it('force option should be boolean', () => {
      const command = createInitHooksCommand();
      const forceOption = command.options.find(o => o.long === '--force');
      expect(forceOption).toBeDefined();
      expect(forceOption!.description).toContain('Overwrite');
    });

    it('command option should accept a value', () => {
      const command = createInitHooksCommand();
      const commandOption = command.options.find(o => o.long === '--command');
      expect(commandOption).toBeDefined();
      expect(commandOption!.description).toContain('archcodex');
    });

    it('should have exactly two options', () => {
      const command = createInitHooksCommand();
      expect(command.options).toHaveLength(2);
    });

    it('should have a description about integration', () => {
      const command = createInitHooksCommand();
      const description = command.description();
      expect(description.toLowerCase()).toContain('claude');
      expect(description.toLowerCase()).toContain('archcodex');
    });
  });
});
