/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the diff-arch command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDiffArchCommand } from '../../../../src/cli/commands/diff-arch.js';

// Mock resolution results
let mockResolveResult: {
  fromArch: { constraints: unknown[]; appliedMixins: string[]; hints: { text: string }[] };
  toArch: { constraints: unknown[]; appliedMixins: string[]; hints: { text: string }[] };
} = {
  fromArch: { constraints: [], appliedMixins: [], hints: [] },
  toArch: { constraints: [], appliedMixins: [], hints: [] },
};

let mockResolveError: { fromArch?: Error; toArch?: Error } = {};

// Mock dependencies
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {
      'app.service': { description: 'Service' },
      'app.domain': { description: 'Domain' },
    },
    mixins: {},
  }),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn().mockImplementation((_registry, archId) => {
    if (mockResolveError.fromArch && archId === 'from-arch') {
      throw mockResolveError.fromArch;
    }
    if (mockResolveError.toArch && archId === 'to-arch') {
      throw mockResolveError.toArch;
    }
    if (archId === 'app.service' || archId === 'from-arch') {
      return { architecture: mockResolveResult.fromArch };
    }
    if (archId === 'app.domain' || archId === 'to-arch') {
      return { architecture: mockResolveResult.toArch };
    }
    throw new Error(`Architecture not found: ${archId}`);
  }),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock chalk with pass-through
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      green: (s: string) => s,
      red: (s: string) => s,
      yellow: (s: string) => s,
    }),
    green: Object.assign((s: string) => s, { bold: (s: string) => s }),
    yellow: Object.assign((s: string) => s, { bold: (s: string) => s }),
    red: Object.assign((s: string) => s, { bold: (s: string) => s }),
    cyan: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('diff-arch command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResolveResult = {
      fromArch: { constraints: [], appliedMixins: [], hints: [] },
      toArch: { constraints: [], appliedMixins: [], hints: [] },
    };
    mockResolveError = {};
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Reset loadRegistry mock
    const { loadRegistry } = await import('../../../../src/core/registry/loader.js');
    vi.mocked(loadRegistry).mockResolvedValue({
      architectures: {
        'app.service': { description: 'Service' },
        'app.domain': { description: 'Domain' },
      },
      mixins: {},
    });
  });

  describe('createDiffArchCommand', () => {
    it('should create a command with correct name', () => {
      const command = createDiffArchCommand();
      expect(command.name()).toBe('diff-arch');
    });

    it('should have the correct description', () => {
      const command = createDiffArchCommand();
      expect(command.description()).toContain('Compare');
    });

    it('should have required from-arch and to-arch arguments', () => {
      const command = createDiffArchCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(2);
      expect(args[0].name()).toBe('from-arch');
      expect(args[0].required).toBe(true);
      expect(args[1].name()).toBe('to-arch');
      expect(args[1].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createDiffArchCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--json');
    });
  });

  describe('execution', () => {
    it('should print architecture diff header', async () => {
      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('ARCHITECTURE DIFF'));
    });

    it('should show no differences when architectures are identical', async () => {
      mockResolveResult = {
        fromArch: { constraints: [], appliedMixins: [], hints: [] },
        toArch: { constraints: [], appliedMixins: [], hints: [] },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No differences found'));
    });

    it('should show added constraints', async () => {
      mockResolveResult = {
        fromArch: { constraints: [], appliedMixins: [], hints: [] },
        toArch: {
          constraints: [{ rule: 'forbid_import', value: ['axios'], severity: 'error' }],
          appliedMixins: [],
          hints: [],
        },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('NEW REQUIREMENTS'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('forbid_import'));
    });

    it('should show removed constraints', async () => {
      mockResolveResult = {
        fromArch: {
          constraints: [{ rule: 'forbid_call', value: ['console.log'], severity: 'warning' }],
          appliedMixins: [],
          hints: [],
        },
        toArch: { constraints: [], appliedMixins: [], hints: [] },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('REMOVED'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('forbid_call'));
    });

    it('should show changed constraint severity', async () => {
      mockResolveResult = {
        fromArch: {
          constraints: [{ rule: 'max_file_lines', value: 500, severity: 'warning' }],
          appliedMixins: [],
          hints: [],
        },
        toArch: {
          constraints: [{ rule: 'max_file_lines', value: 500, severity: 'error' }],
          appliedMixins: [],
          hints: [],
        },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('SEVERITY CHANGED'));
    });

    it('should show added mixins', async () => {
      mockResolveResult = {
        fromArch: { constraints: [], appliedMixins: [], hints: [] },
        toArch: { constraints: [], appliedMixins: ['tested', 'srp'], hints: [] },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('MIXINS'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('tested'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('srp'));
    });

    it('should show removed mixins', async () => {
      mockResolveResult = {
        fromArch: { constraints: [], appliedMixins: ['deprecated-mixin'], hints: [] },
        toArch: { constraints: [], appliedMixins: [], hints: [] },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Removed'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated-mixin'));
    });

    it('should show added hints', async () => {
      mockResolveResult = {
        fromArch: { constraints: [], appliedMixins: [], hints: [] },
        toArch: {
          constraints: [],
          appliedMixins: ['tested'], // Need some mixin change to trigger output
          hints: [{ text: 'Keep functions pure' }],
        },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('HINTS'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Keep functions pure'));
    });

    it('should show removed hints', async () => {
      mockResolveResult = {
        fromArch: {
          constraints: [],
          appliedMixins: ['tested'], // Need some mixin change to trigger output
          hints: [{ text: 'Old hint to remove' }],
        },
        toArch: { constraints: [], appliedMixins: [], hints: [] },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Old hint to remove'));
    });

    it('should show summary with added constraints count', async () => {
      mockResolveResult = {
        fromArch: { constraints: [], appliedMixins: [], hints: [] },
        toArch: {
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error' },
            { rule: 'forbid_call', value: ['eval'], severity: 'error' },
          ],
          appliedMixins: [],
          hints: [],
        },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('SUMMARY'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2 new constraint'));
    });

    it('should output JSON with --json flag', async () => {
      mockResolveResult = {
        fromArch: { constraints: [], appliedMixins: [], hints: [] },
        toArch: {
          constraints: [{ rule: 'forbid_import', value: ['axios'], severity: 'error' }],
          appliedMixins: ['tested'],
          hints: [{ text: 'New hint' }],
        },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('from');
      expect(output).toHaveProperty('to');
      expect(output).toHaveProperty('constraints');
      expect(output).toHaveProperty('mixins');
      expect(output).toHaveProperty('hints');
    });

    it('should error when from-arch not found', async () => {
      mockResolveError = { fromArch: new Error('Not found') };

      const command = createDiffArchCommand();
      await expect(command.parseAsync(['node', 'test', 'from-arch', 'app.domain'])).rejects.toThrow(
        'process.exit called'
      );

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("'from-arch' not found"));
    });

    it('should error when to-arch not found', async () => {
      mockResolveError = { toArch: new Error('Not found') };

      const command = createDiffArchCommand();
      await expect(command.parseAsync(['node', 'test', 'app.service', 'to-arch'])).rejects.toThrow(
        'process.exit called'
      );

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("'to-arch' not found"));
    });

    it('should handle generic errors', async () => {
      const { loadRegistry } = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry load failed'));

      const command = createDiffArchCommand();
      await expect(command.parseAsync(['node', 'test', 'app.service', 'app.domain'])).rejects.toThrow(
        'process.exit called'
      );

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to compare'),
        expect.any(Error)
      );
    });

    it('should print why explanation for constraints', async () => {
      mockResolveResult = {
        fromArch: { constraints: [], appliedMixins: [], hints: [] },
        toArch: {
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', why: 'Use ApiClient instead' },
          ],
          appliedMixins: [],
          hints: [],
        },
      };

      const command = createDiffArchCommand();
      await command.parseAsync(['node', 'test', 'app.service', 'app.domain']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Use ApiClient instead'));
    });
  });
});
