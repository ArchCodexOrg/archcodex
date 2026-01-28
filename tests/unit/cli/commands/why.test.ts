/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the why command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWhyCommand } from '../../../../src/cli/commands/why.js';
import type { Registry } from '../../../../src/core/registry/schema.js';
import type { FlattenedArchitecture, ResolvedConstraint } from '../../../../src/core/registry/types.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    red: (s: string) => s,
    yellow: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    blue: (s: string) => s,
    italic: (s: string) => s,
    underline: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockFileExists = true;
let mockFileContent = '/** @arch test.domain */';
let mockArchId: string | null = 'test.domain';
let mockResolvedArchitecture: FlattenedArchitecture = {
  archId: 'test.domain',
  description: 'Test architecture',
  inheritanceChain: ['base', 'test.domain'],
  appliedMixins: [],
  constraints: [],
  hints: [],
  pointers: [],
  source: 'test.domain',
};

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockImplementation(() => mockFileExists),
  readFileSync: vi.fn().mockImplementation(() => mockFileContent),
}));

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    registry: {},
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {
      base: { description: 'Base', rationale: 'Foundation' },
      'test.domain': { description: 'Test', rationale: 'Testing', inherits: 'base' },
    },
    mixins: {},
  } as Registry),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(function() {
    return {
    architecture: mockResolvedArchitecture,
    conflicts: [],
  };
  }),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn().mockImplementation(() => mockArchId),
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
import { extractArchId } from '../../../../src/core/arch-tag/parser.js';
import { logger } from '../../../../src/utils/logger.js';
import * as fs from 'node:fs';

describe('why command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/project');

    // Reset mock behavior
    mockFileExists = true;
    mockFileContent = '/** @arch test.domain */';
    mockArchId = 'test.domain';
    mockResolvedArchitecture = {
      archId: 'test.domain',
      description: 'Test architecture',
      inheritanceChain: ['base', 'test.domain'],
      appliedMixins: [],
      constraints: [],
      hints: [],
      pointers: [],
      source: 'test.domain',
    };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createWhyCommand', () => {
    it('should create a command with correct name', () => {
      const command = createWhyCommand();
      expect(command.name()).toBe('why');
    });

    it('should have the correct description', () => {
      const command = createWhyCommand();
      expect(command.description()).toContain('constraint');
    });

    it('should have a required file argument', () => {
      const command = createWhyCommand();
      const args = command.registeredArguments;
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].name()).toBe('file');
      expect(args[0].required).toBe(true);
    });

    it('should have an optional constraint argument', () => {
      const command = createWhyCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(2);
      expect(args[1].name()).toBe('constraint');
      expect(args[1].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createWhyCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--config');
    });

    it('should have short flag for config option', () => {
      const command = createWhyCommand();
      const configOption = command.options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');
    });
  });

  describe('file validation', () => {
    it('should error when file does not exist', async () => {
      mockFileExists = false;

      const command = createWhyCommand();

      try {
        await command.parseAsync(['node', 'test', 'nonexistent.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('File not found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should error when file has no @arch tag', async () => {
      mockArchId = null;

      const command = createWhyCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No @arch tag found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should read file content for @arch extraction', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(fs.readFileSync).toHaveBeenCalled();
      expect(extractArchId).toHaveBeenCalledWith(mockFileContent);
    });
  });

  describe('constraint parsing', () => {
    it('should show all constraints when no constraint argument provided', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'base' },
        { rule: 'max_file_lines', value: 500, severity: 'warning', source: 'test.domain' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.constraints).toHaveLength(2);
    });

    it('should filter by rule name only', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'base' },
        { rule: 'max_file_lines', value: 500, severity: 'warning', source: 'test.domain' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', 'forbid_import', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.constraints).toHaveLength(1);
      expect(output.constraints[0].rule).toBe('forbid_import');
    });

    it('should filter by rule:value format', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'base' },
        { rule: 'forbid_import', value: 'http', severity: 'error', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', 'forbid_import:axios', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.constraints).toHaveLength(1);
      expect(output.constraints[0].value).toBe('axios');
    });

    it('should match case-insensitively', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: 'Axios', severity: 'error', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', 'forbid_import:axios', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.constraints).toHaveLength(1);
    });

    it('should search in array values', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: ['axios', 'http', 'https'], severity: 'error', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', 'forbid_import:http', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.constraints).toHaveLength(1);
    });

    it('should handle numeric constraint values', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'max_file_lines', value: 500, severity: 'warning', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', 'max_file_lines:500', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.constraints).toHaveLength(1);
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json flag is provided', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output).toBeDefined();
    });

    it('should include file path in JSON output', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.file).toBe('src/file.ts');
    });

    it('should include archId in JSON output', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.archId).toBe('test.domain');
    });

    it('should include inheritance chain in JSON output', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.inheritanceChain).toEqual(['base', 'test.domain']);
    });

    it('should include applied mixins in JSON output', async () => {
      mockResolvedArchitecture.appliedMixins = ['tested', 'srp'];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.appliedMixins).toEqual(['tested', 'srp']);
    });

    it('should include query in JSON output', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', 'forbid_import:axios', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.query).toBe('forbid_import:axios');
    });

    it('should include version when present', async () => {
      mockResolvedArchitecture.version = '2.0';

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.version).toBe('2.0');
    });

    it('should include deprecation info when present', async () => {
      mockResolvedArchitecture.deprecated_from = '1.5';
      mockResolvedArchitecture.migration_guide = 'https://docs.example.com/migration';

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.deprecated_from).toBe('1.5');
      expect(output.migration_guide).toBe('https://docs.example.com/migration');
    });

    it('should include constraints with all fields', async () => {
      mockResolvedArchitecture.constraints = [
        {
          rule: 'forbid_import',
          value: 'axios',
          severity: 'error',
          source: 'base',
          why: 'Use ApiClient instead',
        },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.constraints[0]).toEqual({
        rule: 'forbid_import',
        value: 'axios',
        severity: 'error',
        source: 'base',
        why: 'Use ApiClient instead',
      });
    });
  });

  describe('human-readable output', () => {
    it('should show header', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('WHY: Constraint Trace'))).toBe(true);
    });

    it('should show file path', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('File:'))).toBe(true);
      expect(calls.some((c) => c?.includes('src/file.ts'))).toBe(true);
    });

    it('should show architecture tag', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architecture Tag:'))).toBe(true);
      expect(calls.some((c) => c?.includes('@arch') && c?.includes('test.domain'))).toBe(true);
    });

    it('should show version suffix when present', async () => {
      mockResolvedArchitecture.version = '2.0';

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('v2.0'))).toBe(true);
    });

    it('should show deprecation warning when present', async () => {
      mockResolvedArchitecture.deprecated_from = '1.5';

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('DEPRECATED'))).toBe(true);
      expect(calls.some((c) => c?.includes('1.5'))).toBe(true);
    });

    it('should show migration guide when present', async () => {
      mockResolvedArchitecture.deprecated_from = '1.5';
      mockResolvedArchitecture.migration_guide = 'https://docs.example.com/migration';

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Migration guide:'))).toBe(true);
    });

    it('should show inheritance chain', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Inheritance Chain:'))).toBe(true);
      expect(calls.some((c) => c?.includes('base') && c?.includes('test.domain'))).toBe(true);
    });

    it('should show applied mixins when present', async () => {
      mockResolvedArchitecture.appliedMixins = ['tested', 'srp'];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Applied Mixins:'))).toBe(true);
      expect(calls.some((c) => c?.includes('tested') && c?.includes('srp'))).toBe(true);
    });

    it('should not show mixins section when empty', async () => {
      mockResolvedArchitecture.appliedMixins = [];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Applied Mixins:'))).toBe(false);
    });

    it('should show constraint with severity', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('[ERROR]'))).toBe(true);
      expect(calls.some((c) => c?.includes('forbid_import'))).toBe(true);
    });

    it('should show warning severity', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'max_file_lines', value: 500, severity: 'warning', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('[WARNING]'))).toBe(true);
    });

    it('should show info severity', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'implements', value: 'IService', severity: 'info', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('[INFO]'))).toBe(true);
    });

    it('should show constraint source', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Source:') && c?.includes('base'))).toBe(true);
    });

    it('should show trace for inherited constraints', async () => {
      mockResolvedArchitecture.inheritanceChain = ['root', 'base', 'test.domain'];
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Trace:'))).toBe(true);
    });

    it('should show why explanation when present', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'base', why: 'Use ApiClient instead' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Why:'))).toBe(true);
      expect(calls.some((c) => c?.includes('Use ApiClient instead'))).toBe(true);
    });

    it('should join array values with comma', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: ['axios', 'http', 'https'], severity: 'error', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('axios, http, https'))).toBe(true);
    });

    it('should show message when no constraints found', async () => {
      mockResolvedArchitecture.constraints = [];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No constraints apply'))).toBe(true);
    });

    it('should show message when constraint query has no matches', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'base' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', 'max_file_lines']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No constraint matching'))).toBe(true);
    });

    it('should show tip when constraint query has no matches', async () => {
      mockResolvedArchitecture.constraints = [];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', 'max_file_lines']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Tip:'))).toBe(true);
    });

    it('should show matching constraints count', async () => {
      mockResolvedArchitecture.constraints = [
        { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'base' },
        { rule: 'max_file_lines', value: 500, severity: 'warning', source: 'test.domain' },
      ];

      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Matching Constraints (2)'))).toBe(true);
    });
  });

  describe('config option', () => {
    it('should use custom config path when provided', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--config', 'custom/config.yaml']);

      expect(loadConfig).toHaveBeenCalledWith(expect.stringContaining('custom/config.yaml'));
    });

    it('should use default config path when not provided', async () => {
      const command = createWhyCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(loadConfig).toHaveBeenCalledWith(expect.stringContaining('.arch/config.yaml'));
    });
  });

  describe('error handling', () => {
    it('should handle config loading errors', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));

      const command = createWhyCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle registry loading errors', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry not found'));

      const command = createWhyCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValue('string error');

      const command = createWhyCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Unknown error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
