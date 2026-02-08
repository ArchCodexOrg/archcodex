/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the help command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHelpCommand, getEssentialsHelp } from '../../../../src/cli/commands/help.js';

// Mock chalk with pass-through
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    blue: (s: string) => s,
  },
}));

describe('help command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
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

  describe('showTopicList - no arguments', () => {
    it('should display topic list when called without arguments', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('ArchCodex Help Topics');
    });

    it('should show all topic names', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('creating');
      expect(output).toContain('validating');
      expect(output).toContain('understanding');
      expect(output).toContain('refactoring');
      expect(output).toContain('health');
      expect(output).toContain('setup');
      expect(output).toContain('wiring');
      expect(output).toContain('speccodex');
      expect(output).toContain('documentation');
    });

    it('should show usage instructions', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('archcodex help <topic>');
      expect(output).toContain('archcodex help --full');
    });
  });

  describe('showTopicHelp - specific topic', () => {
    it('should show commands for the creating topic', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'creating']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('Creating');
      expect(output).toContain('discover');
      expect(output).toContain('scaffold');
    });

    it('should show topic description', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'creating']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('Starting new files');
    });

    it('should show workflow tip when available', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'creating']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('Workflow:');
    });

    it('should show command examples', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'creating']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('discover "payment service"');
    });

    it('should show see also references', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'creating']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('See also:');
      expect(output).toContain('help validating');
    });

    it('should handle topic without tip', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'health']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('Health');
      // health topic has no tip property
    });

    it('should be case-insensitive for topic names', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'CREATING']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      // The source capitalizes first char + keeps rest, so CREATING -> CREATING
      // Key check: it found the topic (has discover command) rather than erroring
      expect(output).toContain('discover');
    });

    it('should exit with error for unknown topic', async () => {
      const command = createHelpCommand();
      await expect(
        command.parseAsync(['node', 'test', 'nonexistent'])
      ).rejects.toThrow('process.exit called');

      const errorCalls = consoleErrorSpy.mock.calls.map(c => String(c[0]));
      expect(errorCalls.some(c => c.includes('Unknown topic'))).toBe(true);
    });

    it('should show available topics on unknown topic error', async () => {
      const command = createHelpCommand();
      await expect(
        command.parseAsync(['node', 'test', 'nonexistent'])
      ).rejects.toThrow('process.exit called');

      const errorOutput = consoleErrorSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(errorOutput).toContain('Available topics');
    });
  });

  describe('showFullHelp - all commands', () => {
    it('should show all commands when --full is provided', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', '--full']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('ArchCodex - All Commands');
    });

    it('should show all topic sections', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', '--full']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('creating');
      expect(output).toContain('validating');
      expect(output).toContain('understanding');
    });

    it('should show other commands hint', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', '--full']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('Other commands');
    });

    it('should show command-specific help hint', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', '--full']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('--help');
    });
  });

  describe('showFullHelp takes priority over topic', () => {
    it('should show full help even when topic is also provided', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'creating', '--full']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('ArchCodex - All Commands');
    });
  });

  describe('getEssentialsHelp', () => {
    it('should return help text with version', () => {
      const help = getEssentialsHelp('1.2.3');
      expect(help).toContain('v1.2.3');
    });

    it('should include ArchCodex title', () => {
      const help = getEssentialsHelp('1.0.0');
      expect(help).toContain('ArchCodex');
    });

    it('should include essential commands', () => {
      const help = getEssentialsHelp('1.0.0');
      expect(help).toContain('context --module');
      expect(help).toContain('check');
      expect(help).toContain('analyze');
      expect(help).toContain('discover');
    });

    it('should include more help section', () => {
      const help = getEssentialsHelp('1.0.0');
      expect(help).toContain('More help:');
      expect(help).toContain('archcodex help');
    });

    it('should list topic names', () => {
      const help = getEssentialsHelp('1.0.0');
      expect(help).toContain('creating');
      expect(help).toContain('validating');
    });
  });

  describe('topics with seeAlso', () => {
    it('should show seeAlso for validating topic', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'validating']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('See also:');
    });

    it('should show seeAlso for understanding topic', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'understanding']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('See also:');
    });
  });

  describe('speccodex topic', () => {
    it('should show speccodex topic with commands', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'speccodex']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('Speccodex');
      expect(output).toContain('spec init');
      expect(output).toContain('spec generate');
    });
  });

  describe('documentation topic', () => {
    it('should show documentation topic with commands', async () => {
      const command = createHelpCommand();
      await command.parseAsync(['node', 'test', 'documentation']);

      const output = consoleLogSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('Documentation');
      expect(output).toContain('doc adr');
    });
  });
});
