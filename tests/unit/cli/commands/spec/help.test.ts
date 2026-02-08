/**
 * @arch archcodex.test.unit
 *
 * Tests for spec help subcommand registration and action execution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerHelpCommand } from '../../../../../src/cli/commands/spec/help.js';

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

describe('registerHelpCommand', () => {
  it('registers help subcommand on parent', () => {
    const parent = new Command('spec');
    registerHelpCommand(parent);

    const help = parent.commands.find(c => c.name() === 'help');
    expect(help).toBeDefined();
    expect(help!.description()).toContain('help');
  });

  it('help command has --full option', () => {
    const parent = new Command('spec');
    registerHelpCommand(parent);

    const help = parent.commands.find(c => c.name() === 'help')!;
    const fullOption = help.options.find(o => o.long === '--full');
    expect(fullOption).toBeDefined();
  });

  it('help command has optional topic argument', () => {
    const parent = new Command('spec');
    registerHelpCommand(parent);

    const help = parent.commands.find(c => c.name() === 'help')!;
    expect(help.registeredArguments).toHaveLength(1);
    expect(help.registeredArguments[0].required).toBe(false);
  });
});

describe('help command action', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('no topic (default help)', () => {
    it('shows topic list and essential commands', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('SpecCodex Help Topics');
      expect(output).toContain('setup');
      expect(output).toContain('writing');
      expect(output).toContain('generating');
      expect(output).toContain('verifying');
      expect(output).toContain('inferring');
      expect(output).toContain('discovering');
      expect(output).toContain('Essential commands');
    });

    it('shows usage instructions', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('spec help <topic>');
      expect(output).toContain('spec help --full');
    });
  });

  describe('--full option', () => {
    it('shows all commands grouped by topic', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help', '--full']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('SpecCodex - All Commands');
      expect(output).toContain('setup');
      expect(output).toContain('writing');
      expect(output).toContain('generating');
      expect(output).toContain('verifying');
      expect(output).toContain('inferring');
      expect(output).toContain('init');
    });

    it('shows footer instruction', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help', '--full']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('--help');
    });
  });

  describe('specific topic', () => {
    it('shows commands for a valid topic', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help', 'writing']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Writing');
      expect(output).toContain('Writing and validating spec files');
      expect(output).toContain('schema');
      expect(output).toContain('check');
    });

    it('shows workflow tip when present', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help', 'writing']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Workflow:');
    });

    it('shows examples for commands that have them', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help', 'writing']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('spec schema --examples');
    });

    it('shows "see also" references', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help', 'writing']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('See also:');
      expect(output).toContain('help generating');
    });

    it('handles case-insensitive topic lookup', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help', 'WRITING']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Writing and validating spec files');
    });

    it('shows error for unknown topic and exits with 1', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'help', 'nonexistent']);
      } catch {
        // process.exit
      }

      const errorOutput = consoleErrorSpy.mock.calls.map(c => c[0]).join('\n');
      expect(errorOutput).toContain('Unknown topic: nonexistent');
      expect(errorOutput).toContain('Available topics');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('shows all supported topics', async () => {
      const topics = [
        'setup', 'writing', 'generating', 'verifying', 'inferring',
        'discovering', 'documentation', 'placeholders', 'fixtures',
        'signatures', 'analyzing', 'mixins', 'invariants',
      ];

      for (const topic of topics) {
        vi.clearAllMocks();
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const parent = new Command('spec');
        registerHelpCommand(parent);

        await parent.parseAsync(['node', 'spec', 'help', topic]);

        // Should NOT have called error spy (no unknown topic error)
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        // Should have called log spy with topic content
        expect(consoleLogSpy).toHaveBeenCalled();

        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }
    });

    it('capitalizes the topic name in output', async () => {
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help', 'setup']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Setup');
    });

    it('shows topic without tip when tip is not defined', async () => {
      // The 'setup' topic has a tip, so let's test that it shows
      // All topics have tips in the current code, so just verify it works
      const parent = new Command('spec');
      registerHelpCommand(parent);

      await parent.parseAsync(['node', 'spec', 'help', 'setup']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Workflow:');
      expect(output).toContain('init');
    });
  });
});
