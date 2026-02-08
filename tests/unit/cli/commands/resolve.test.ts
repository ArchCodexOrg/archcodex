/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the resolve command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createResolveCommand } from '../../../../src/cli/commands/resolve.js';
import type { Registry } from '../../../../src/core/registry/schema.js';
import type { ResolvedArchitecture, ConflictInfo } from '../../../../src/core/registry/resolver.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    red: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    yellow: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    blue: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
  },
}));

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    registry: {},
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { resolveArchitecture } from '../../../../src/core/registry/resolver.js';
import { logger } from '../../../../src/utils/logger.js';

describe('resolve command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  const mockRegistry: Registry = {
    architectures: {
      base: { description: 'Base architecture', rationale: 'Foundation' },
    },
    mixins: {},
  };

  const mockResolvedArchitecture: ResolvedArchitecture = {
    archId: 'test.domain',
    description: 'Test architecture',
    inheritanceChain: ['base', 'test.domain'],
    appliedMixins: [],
    constraints: [],
    hints: [],
    pointers: [],
    source: 'test.domain',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/project');

    vi.mocked(loadRegistry).mockResolvedValue(mockRegistry);
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: mockResolvedArchitecture,
      conflicts: [],
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createResolveCommand', () => {
    it('should create a command with correct name', () => {
      const command = createResolveCommand();
      expect(command.name()).toBe('resolve');
    });

    it('should have the correct description', () => {
      const command = createResolveCommand();
      expect(command.description()).toContain('architecture');
    });

    it('should have a required archId argument', () => {
      const command = createResolveCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('archId');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createResolveCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--config');
    });
  });

  describe('command execution', () => {
    it('should load config and registry', async () => {
      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      expect(loadConfig).toHaveBeenCalled();
      expect(loadRegistry).toHaveBeenCalled();
    });

    it('should resolve architecture', async () => {
      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      expect(resolveArchitecture).toHaveBeenCalledWith(mockRegistry, 'test.domain');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry not found'));

      const command = createResolveCommand();

      try {
        await command.parseAsync(['node', 'test', 'test.domain']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Registry not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json flag is provided', async () => {
      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain', '--json']);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.architecture).toBeDefined();
      expect(output.conflicts).toBeDefined();
    });

    it('should include all architecture fields in JSON', async () => {
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          ...mockResolvedArchitecture,
          contract: 'Test contract',
          constraints: [{ rule: 'forbid_import', value: 'axios', severity: 'error', source: 'test' }],
          hints: [{ text: 'Test hint' }],
          pointers: [{ label: 'Docs', uri: 'https://example.com' }],
        },
        conflicts: [],
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.architecture.constraints).toHaveLength(1);
      expect(output.architecture.hints).toHaveLength(1);
    });
  });

  describe('text output', () => {
    it('should display architecture header', async () => {
      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('ARCHITECTURE:'))).toBe(true);
      expect(calls.some((c) => c?.includes('test.domain'))).toBe(true);
    });

    it('should display description when present', async () => {
      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Description:'))).toBe(true);
      expect(calls.some((c) => c?.includes('Test architecture'))).toBe(true);
    });

    it('should display contract when present', async () => {
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          ...mockResolvedArchitecture,
          contract: 'Must validate input',
        },
        conflicts: [],
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Contract:'))).toBe(true);
      expect(calls.some((c) => c?.includes('Must validate input'))).toBe(true);
    });

    it('should display inheritance chain', async () => {
      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Inheritance Chain:'))).toBe(true);
    });

    it('should display applied mixins when present', async () => {
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          ...mockResolvedArchitecture,
          appliedMixins: ['tested', 'srp'],
        },
        conflicts: [],
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Applied Mixins:'))).toBe(true);
      expect(calls.some((c) => c?.includes('tested'))).toBe(true);
    });

    it('should display constraints with severity', async () => {
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          ...mockResolvedArchitecture,
          constraints: [
            { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'test.domain' },
            { rule: 'max_file_lines', value: 500, severity: 'warning', source: 'test.domain' },
          ],
        },
        conflicts: [],
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Constraints:'))).toBe(true);
      expect(calls.some((c) => c?.includes('forbid_import'))).toBe(true);
      expect(calls.some((c) => c?.includes('ERROR'))).toBe(true);
    });

    it('should display constraint "why" when present', async () => {
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          ...mockResolvedArchitecture,
          constraints: [
            { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'test', why: 'Use ApiClient instead' },
          ],
        },
        conflicts: [],
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Use ApiClient instead'))).toBe(true);
    });

    it('should display hints when present', async () => {
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          ...mockResolvedArchitecture,
          hints: [
            { text: 'Keep functions pure' },
            { text: 'Redact sensitive data', example: 'arch://payment/redaction' },
          ],
        },
        conflicts: [],
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Hints:'))).toBe(true);
      expect(calls.some((c) => c?.includes('Keep functions pure'))).toBe(true);
      expect(calls.some((c) => c?.includes('Example:'))).toBe(true);
    });

    it('should display pointers when present', async () => {
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          ...mockResolvedArchitecture,
          pointers: [
            { label: 'Documentation', uri: 'https://docs.example.com' },
          ],
        },
        conflicts: [],
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Documentation Pointers:'))).toBe(true);
      expect(calls.some((c) => c?.includes('https://docs.example.com'))).toBe(true);
    });

    it('should display array constraint values joined', async () => {
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          ...mockResolvedArchitecture,
          constraints: [
            { rule: 'forbid_import', value: ['axios', 'http', 'https'], severity: 'error', source: 'test' },
          ],
        },
        conflicts: [],
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('axios, http, https'))).toBe(true);
    });
  });

  describe('conflicts display', () => {
    it('should display error conflicts', async () => {
      const conflicts: ConflictInfo[] = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', resolution: 'Remove import' },
      ];

      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: mockResolvedArchitecture,
        conflicts,
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Conflicts (Errors):'))).toBe(true);
      expect(calls.some((c) => c?.includes('forbid_import'))).toBe(true);
    });

    it('should display warning conflicts', async () => {
      const conflicts: ConflictInfo[] = [
        { rule: 'max_file_lines', value: '500', severity: 'warning', resolution: 'Consider splitting' },
      ];

      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: mockResolvedArchitecture,
        conflicts,
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Conflicts (Warnings):'))).toBe(true);
    });

    it('should display info conflicts as resolved', async () => {
      const conflicts: ConflictInfo[] = [
        { rule: 'implements', value: 'IService', severity: 'info', resolution: 'Resolved by mixin' },
      ];

      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: mockResolvedArchitecture,
        conflicts,
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Conflicts (Resolved):'))).toBe(true);
    });

    it('should group multiple conflict types', async () => {
      const conflicts: ConflictInfo[] = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', resolution: 'Remove' },
        { rule: 'max_file_lines', value: '500', severity: 'warning', resolution: 'Split' },
        { rule: 'implements', value: 'IService', severity: 'info', resolution: 'OK' },
      ];

      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: mockResolvedArchitecture,
        conflicts,
      });

      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Conflicts (Errors):'))).toBe(true);
      expect(calls.some((c) => c?.includes('Conflicts (Warnings):'))).toBe(true);
      expect(calls.some((c) => c?.includes('Conflicts (Resolved):'))).toBe(true);
    });
  });

  describe('config option', () => {
    it('should use custom config path when provided', async () => {
      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain', '--config', 'custom/config.yaml']);

      expect(loadConfig).toHaveBeenCalledWith(expect.stringContaining('custom/config.yaml'));
    });

    it('should use default config path when not provided', async () => {
      const command = createResolveCommand();
      await command.parseAsync(['node', 'test', 'test.domain']);

      expect(loadConfig).toHaveBeenCalledWith(expect.stringContaining('.arch/config.yaml'));
    });
  });
});
