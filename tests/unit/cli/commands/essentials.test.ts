/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the essentials command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEssentialsCommand } from '../../../../src/cli/commands/essentials.js';

vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
  },
}));

describe('essentials command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
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

  describe('action execution', () => {
    it('should output essential commands when executed', async () => {
      const command = createEssentialsCommand();

      await command.parseAsync(['node', 'essentials']);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('ArchCodex Essentials');
    });

    it('should mention discover command', async () => {
      const command = createEssentialsCommand();

      await command.parseAsync(['node', 'essentials']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('discover');
    });

    it('should mention scaffold command', async () => {
      const command = createEssentialsCommand();

      await command.parseAsync(['node', 'essentials']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('scaffold');
    });

    it('should mention neighborhood command', async () => {
      const command = createEssentialsCommand();

      await command.parseAsync(['node', 'essentials']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('neighborhood');
    });

    it('should mention check command', async () => {
      const command = createEssentialsCommand();

      await command.parseAsync(['node', 'essentials']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('check');
    });

    it('should mention read command', async () => {
      const command = createEssentialsCommand();

      await command.parseAsync(['node', 'essentials']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('read');
    });

    it('should mention why command', async () => {
      const command = createEssentialsCommand();

      await command.parseAsync(['node', 'essentials']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('why');
    });

    it('should mention full help reference', async () => {
      const command = createEssentialsCommand();

      await command.parseAsync(['node', 'essentials']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Full help');
    });

    it('should contain section headers', async () => {
      const command = createEssentialsCommand();

      await command.parseAsync(['node', 'essentials']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Before creating a file');
      expect(output).toContain('Before adding imports');
      expect(output).toContain('After editing');
      expect(output).toContain('To understand constraints');
    });
  });
});
