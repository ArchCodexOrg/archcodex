/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Integration tests for SpecCodex CLI commands.
 * Generated from specs: spec.speccodex.cli.*
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSpecCommand } from '../../../src/cli/commands/spec/index.js';

// Helper to capture console output
function captureOutput() {
  const output: { stdout: string[]; stderr: string[] } = { stdout: [], stderr: [] };
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    output.stdout.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    output.stderr.push(args.map(String).join(' '));
  };

  return {
    output,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
    getStdout: () => output.stdout.join('\n'),
    getStderr: () => output.stderr.join('\n'),
  };
}

// Helper to run CLI command
async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const capture = captureOutput();
  let exitCode = 0;

  // Mock process.exit
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`EXIT_${code}`);
  }) as typeof process.exit;

  try {
    const cmd = createSpecCommand();
    // Commander's parseAsync expects args starting with the command args directly
    await cmd.parseAsync(args, { from: 'user' });
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith('EXIT_'))) {
      capture.output.stderr.push(String(e));
      exitCode = 1;
    }
  } finally {
    capture.restore();
    process.exit = originalExit;
  }

  return {
    stdout: capture.getStdout(),
    stderr: capture.getStderr(),
    exitCode,
  };
}

// @speccodex:start - Generated from spec.speccodex.cli.*
describe('SpecCodex CLI Commands', () => {
  // Suppress console during tests
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('spec help', () => {
    it('shows topic list with no args', async () => {
      const result = await runCommand(['help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('SpecCodex Help Topics');
      expect(result.stdout).toContain('writing');
      expect(result.stdout).toContain('generating');
      expect(result.stdout).toContain('verifying');
      expect(result.stdout).toContain('discovering');
    });

    it('shows writing topic', async () => {
      const result = await runCommand(['help', 'writing']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Writing');
      expect(result.stdout).toContain('schema');
      expect(result.stdout).toContain('check');
    });

    it('shows generating topic', async () => {
      const result = await runCommand(['help', 'generating']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Generating');
      expect(result.stdout).toContain('generate');
      expect(result.stdout).toContain('--type unit');
      expect(result.stdout).toContain('--type property');
    });

    it('shows verifying topic', async () => {
      const result = await runCommand(['help', 'verifying']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Verifying');
      expect(result.stdout).toContain('verify');
      expect(result.stdout).toContain('drift');
    });

    it('shows discovering topic', async () => {
      const result = await runCommand(['help', 'discovering']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Discovering');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('resolve');
    });

    it('shows full help with --full', async () => {
      const result = await runCommand(['help', '--full']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('SpecCodex - All Commands');
      expect(result.stdout).toContain('writing');
      expect(result.stdout).toContain('generating');
      expect(result.stdout).toContain('verifying');
      expect(result.stdout).toContain('discovering');
    });

    it('errors on unknown topic', async () => {
      const result = await runCommand(['help', 'nonexistent']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown topic');
    });
  });

  describe('spec list', () => {
    it('lists all specs', async () => {
      const result = await runCommand(['list']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('spec.');
    });

    it('lists specs in JSON format', async () => {
      const result = await runCommand(['list', '--json']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"specs"');
    });

    it('lists mixins with --mixins', async () => {
      const result = await runCommand(['list', '--mixins']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Specs:');
    });
  });

  describe('spec resolve', () => {
    it('resolves a valid spec', async () => {
      const result = await runCommand(['resolve', 'spec.speccodex.parse']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('intent');
    });

    it('resolves spec in JSON format', async () => {
      const result = await runCommand(['resolve', 'spec.speccodex.parse', '--json']);

      expect(result.exitCode).toBe(0);
      // JSON output starts with { or contains specId
      expect(result.stdout).toMatch(/\{|specId/);
    });

    it('errors on unknown spec', async () => {
      const result = await runCommand(['resolve', 'spec.nonexistent']);

      // Commander may not throw, but should indicate error
      expect(result.exitCode).toBe(1);
    });
  });

  describe('spec drift', () => {
    it('shows coverage report', async () => {
      const result = await runCommand(['drift']);

      // May exit 0 (all wired) or 1 (some unwired)
      expect(result.stdout).toContain('Coverage');
    });

    it('outputs JSON format', async () => {
      const result = await runCommand(['drift', '--format', 'json']);

      expect(result.stdout).toContain('"coverage"');
    });

    it('outputs markdown format', async () => {
      const result = await runCommand(['drift', '--format', 'markdown']);

      expect(result.stdout).toContain('# Spec Drift Report');
      expect(result.stdout).toContain('**Coverage:**');
    });

    it('filters by pattern', async () => {
      const result = await runCommand(['drift', '--pattern', 'spec.speccodex.*']);

      expect(result.stdout).toContain('Coverage');
    });
  });

  describe('spec check', () => {
    it('validates spec registry', async () => {
      const result = await runCommand(['check']);

      // Check passes or fails based on spec validity
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });
  });

  describe('spec generate', () => {
    it('generates unit tests from spec', async () => {
      const result = await runCommand(['generate', 'spec.speccodex.parse', '--type', 'unit']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Generated');
      expect(result.stdout).toContain('describe(');
    });

    it('generates property tests from spec with invariants', async () => {
      const result = await runCommand(['generate', 'spec.speccodex.boundaries', '--type', 'property']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Generated');
    });

    it('errors on spec without examples for unit tests', async () => {
      const result = await runCommand(['generate', 'spec.base', '--type', 'unit']);

      expect(result.exitCode).toBe(1);
    });
  });

  describe('spec schema', () => {
    it('shows schema documentation', async () => {
      const result = await runCommand(['schema']);

      expect(result.exitCode).toBe(0);
      // Schema shows section headers like INPUT TYPES, EFFECTS, BASE SPECS
      expect(result.stdout).toContain('BASE SPECS');
    });

    it('shows schema in JSON format', async () => {
      const result = await runCommand(['schema', '--json']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"fields"');
    });

    it('filters to specific section', async () => {
      const result = await runCommand(['schema', '--filter', 'inputs']);

      expect(result.exitCode).toBe(0);
      // The filter shows INPUT TYPES section
      expect(result.stdout).toContain('INPUT TYPES');
    });
  });

  describe('spec discover', () => {
    it('finds specs by query', async () => {
      const result = await runCommand(['discover', 'parse yaml']);

      expect(result.exitCode).toBe(0);
      // Should find specs related to parsing
    });

    it('outputs JSON format', async () => {
      const result = await runCommand(['discover', 'validate', '--json']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"query"');
    });
  });
});
// @speccodex:end
