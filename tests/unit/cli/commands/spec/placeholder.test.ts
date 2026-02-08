/**
 * @arch archcodex.test.unit
 *
 * Tests for spec placeholder subcommand registration and action execution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerPlaceholderCommand } from '../../../../../src/cli/commands/spec/placeholder.js';

// --- Configurable mock state ---
interface PlaceholderResult {
  type: string;
  value?: unknown;
  asserts?: string;
  pattern?: string;
}

interface PlaceholderError {
  error: true;
  message: string;
}

let mockExpandResult: PlaceholderResult | PlaceholderError;
let mockPlaceholdersList: Array<{ placeholder: string; description: string; example: string }>;
let mockIsError: boolean;

// --- Mocks ---
vi.mock('../../../../../src/core/spec/index.js', () => ({
  expandPlaceholder: vi.fn(() => mockExpandResult),
  listPlaceholders: vi.fn(() => mockPlaceholdersList),
  isPlaceholderError: vi.fn(() => mockIsError),
}));

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

describe('registerPlaceholderCommand', () => {
  it('registers placeholder subcommand on parent', () => {
    const parent = new Command('spec');
    registerPlaceholderCommand(parent);

    const placeholder = parent.commands.find(c => c.name() === 'placeholder');
    expect(placeholder).toBeDefined();
    expect(placeholder!.description()).toContain('placeholder');
  });

  it('placeholder command has --list option', () => {
    const parent = new Command('spec');
    registerPlaceholderCommand(parent);

    const placeholder = parent.commands.find(c => c.name() === 'placeholder')!;
    const listOption = placeholder.options.find(o => o.long === '--list');
    expect(listOption).toBeDefined();
  });

  it('placeholder command has --json option', () => {
    const parent = new Command('spec');
    registerPlaceholderCommand(parent);

    const placeholder = parent.commands.find(c => c.name() === 'placeholder')!;
    const jsonOption = placeholder.options.find(o => o.long === '--json');
    expect(jsonOption).toBeDefined();
  });

  it('placeholder command has optional value argument', () => {
    const parent = new Command('spec');
    registerPlaceholderCommand(parent);

    const placeholder = parent.commands.find(c => c.name() === 'placeholder')!;
    expect(placeholder.registeredArguments).toHaveLength(1);
    expect(placeholder.registeredArguments[0].required).toBe(false);
  });
});

describe('placeholder command action', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Reset mock state
    mockExpandResult = { type: 'string', value: 'hello world' };
    mockPlaceholdersList = [
      { placeholder: '@string(N)', description: 'Generate random string', example: '@string(100)' },
      { placeholder: '@length(N)', description: 'Assert array length', example: '@length(3)' },
    ];
    mockIsError = false;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('--list option', () => {
    it('lists all placeholders in text mode', async () => {
      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      await parent.parseAsync(['node', 'spec', 'placeholder', '--list']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Supported Placeholders');
      expect(output).toContain('@string(N)');
      expect(output).toContain('@length(N)');
      expect(output).toContain('Generate random string');
    });

    it('lists all placeholders as JSON with --list and --json', async () => {
      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      await parent.parseAsync(['node', 'spec', 'placeholder', '--list', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          const parsed = JSON.parse(c[0] as string);
          return Array.isArray(parsed);
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
    });
  });

  describe('no value provided', () => {
    it('shows usage information when no value given', async () => {
      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      await parent.parseAsync(['node', 'spec', 'placeholder']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Usage');
      expect(output).toContain('--list');
    });
  });

  describe('expanding a value', () => {
    it('shows expanded placeholder in text mode (with value)', async () => {
      mockExpandResult = { type: 'string', value: 'hello world' };
      mockIsError = false;

      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'placeholder', '@string(100)']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Expanded');
      expect(output).toContain('Type: string');
      expect(output).toContain('Value: hello world');
    });

    it('truncates long string values (> 50 chars)', async () => {
      mockExpandResult = { type: 'string', value: 'a'.repeat(60) };
      mockIsError = false;

      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'placeholder', '@string(60)']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('...');
    });

    it('does not truncate short string values (<= 50 chars)', async () => {
      mockExpandResult = { type: 'string', value: 'short' };
      mockIsError = false;

      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'placeholder', '@string(5)']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Value: short');
      expect(output).not.toContain('...');
    });

    it('shows asserts field when present', async () => {
      mockExpandResult = { type: 'assertion', asserts: 'toHaveLength(3)' };
      mockIsError = false;

      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'placeholder', '@length(3)']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Asserts: toHaveLength(3)');
    });

    it('shows pattern field when present', async () => {
      mockExpandResult = { type: 'regex', pattern: '^[a-z]+$' };
      mockIsError = false;

      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'placeholder', '@matches(abc)']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Pattern: ^[a-z]+$');
    });

    it('does not show value when undefined', async () => {
      mockExpandResult = { type: 'assertion', asserts: 'toBeNull()' };
      mockIsError = false;

      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'placeholder', '@null']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).not.toContain('Value:');
    });

    it('outputs JSON when --json is set', async () => {
      mockExpandResult = { type: 'string', value: 'test' };

      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'placeholder', '@string(4)', '--json']);
      } catch {
        // may or may not exit
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('shows error and exits with 1 when expansion returns error', async () => {
      mockExpandResult = { type: 'string', value: 'unused' };
      mockIsError = true;
      // When isPlaceholderError returns true, the error path is taken
      // The result is treated as error: { error: true, message: '...' }
      mockExpandResult = { error: true, message: 'Unknown placeholder' } as unknown as PlaceholderResult;

      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'placeholder', '@unknown']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('handles non-string value in expanded result', async () => {
      mockExpandResult = { type: 'number', value: 42 };
      mockIsError = false;

      const parent = new Command('spec');
      registerPlaceholderCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'placeholder', '@number(42)']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Value: 42');
    });
  });
});
