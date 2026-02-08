/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the diff command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDiffCommand } from '../../../../src/cli/commands/diff.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
      green: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    green: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    red: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    blue: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    magenta: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
  },
}));

// Configurable mock behavior
let mockRegistryResult = {
  nodes: { base: { description: 'Base' } },
  mixins: {},
};

let mockDiffResult = {
  fromRef: 'main',
  toRef: 'HEAD',
  architectureChanges: [] as Array<{
    type: 'added' | 'modified' | 'removed';
    archId: string;
    oldNode?: { description: string };
    newNode?: { description: string };
    inheritsChange?: { old?: string; new?: string };
    mixinChanges?: { added: string[]; removed: string[] };
    constraintChanges?: Array<{ type: 'added' | 'modified' | 'removed'; rule: string; oldValue?: unknown; newValue?: unknown; oldSeverity?: string; newSeverity?: string }>;
  }>,
  mixinChanges: [] as Array<{
    type: 'added' | 'modified' | 'removed';
    mixinId: string;
    constraintChanges?: Array<{ type: 'added' | 'modified' | 'removed'; rule: string; oldValue?: unknown; newValue?: unknown }>;
  }>,
  affectedFiles: [] as Array<{ filePath: string; archId: string; reason: string }>,
  summary: {
    architecturesAdded: 0,
    architecturesRemoved: 0,
    architecturesModified: 0,
    mixinsAdded: 0,
    mixinsRemoved: 0,
    mixinsModified: 0,
    totalAffectedFiles: 0,
  },
};

let mockParsedRange = { from: 'main', to: 'HEAD' };
let mockFromRegistry = { nodes: { base: { description: 'Base' } }, mixins: {} };
let mockToRegistry = { nodes: { base: { description: 'Base' } }, mixins: {} };

// Mock dependencies
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockImplementation(async () => mockRegistryResult),
}));

vi.mock('../../../../src/core/diff/index.js', () => ({
  compareRegistries: vi.fn().mockImplementation(async () => mockDiffResult),
  loadRegistryFromRef: vi.fn().mockImplementation(async (_projectRoot, ref) => {
    if (ref === mockParsedRange.from) return mockFromRegistry;
    return mockToRegistry;
  }),
  parseGitRange: vi.fn().mockImplementation(() => mockParsedRange),
  getShortHash: vi.fn().mockImplementation(async (_projectRoot, ref) => `${ref.slice(0, 7)}`),
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

import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { compareRegistries, loadRegistryFromRef, parseGitRange, getShortHash } from '../../../../src/core/diff/index.js';
import { logger as log } from '../../../../src/utils/logger.js';

describe('diff command', () => {
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

    // Reset mock data
    mockRegistryResult = {
      nodes: { base: { description: 'Base' } },
      mixins: {},
    };

    mockDiffResult = {
      fromRef: 'main',
      toRef: 'HEAD',
      architectureChanges: [],
      mixinChanges: [],
      affectedFiles: [],
      summary: {
        architecturesAdded: 0,
        architecturesRemoved: 0,
        architecturesModified: 0,
        mixinsAdded: 0,
        mixinsRemoved: 0,
        mixinsModified: 0,
        totalAffectedFiles: 0,
      },
    };

    mockParsedRange = { from: 'main', to: 'HEAD' };
    mockFromRegistry = { nodes: { base: { description: 'Base' } }, mixins: {} };
    mockToRegistry = { nodes: { base: { description: 'Base' } }, mixins: {} };

    // Reset mocks
    vi.mocked(loadRegistry).mockImplementation(async () => mockRegistryResult as any);
    vi.mocked(compareRegistries).mockImplementation(async () => mockDiffResult as any);
    vi.mocked(loadRegistryFromRef).mockImplementation(async (_projectRoot, ref) => {
      if (ref === mockParsedRange.from) return mockFromRegistry as any;
      return mockToRegistry as any;
    });
    vi.mocked(parseGitRange).mockImplementation(() => mockParsedRange);
    vi.mocked(getShortHash).mockImplementation(async (_projectRoot, ref) => `${ref.slice(0, 7)}`);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createDiffCommand', () => {
    it('should create a command with correct name', () => {
      const command = createDiffCommand();
      expect(command.name()).toBe('diff');
    });

    it('should have the correct description', () => {
      const command = createDiffCommand();
      expect(command.description()).toContain('changes');
    });

    it('should have a required range argument', () => {
      const command = createDiffCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('range');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createDiffCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--no-files');
      expect(optionNames).toContain('--verbose');
    });
  });

  describe('basic diff execution', () => {
    it('should parse git range', async () => {
      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      expect(parseGitRange).toHaveBeenCalledWith('main..HEAD');
    });

    it('should load registries from git refs', async () => {
      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      expect(loadRegistryFromRef).toHaveBeenCalledWith('/project', 'main');
      expect(loadRegistry).toHaveBeenCalledWith('/project');
    });

    it('should compare registries', async () => {
      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      expect(compareRegistries).toHaveBeenCalled();
    });

    it('should show no changes message when no diff', async () => {
      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No architecture changes'))).toBe(true);
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json is used', async () => {
      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--json']);

      const calls = consoleLogSpy.mock.calls;
      const jsonCall = calls.find((c) => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
    });

    it('should include fromRef and toRef in JSON', async () => {
      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--json']);

      const calls = consoleLogSpy.mock.calls;
      const jsonCall = calls.find((c) => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.fromRef).toBe('main');
      expect(output.toRef).toBe('HEAD');
    });
  });

  describe('architecture changes display', () => {
    it('should show added architectures', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        architectureChanges: [{
          type: 'added',
          archId: 'new.arch',
          newNode: { description: 'New architecture' },
        }],
        summary: { ...mockDiffResult.summary, architecturesAdded: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('ADDED'))).toBe(true);
      expect(calls.some((c) => c?.includes('new.arch'))).toBe(true);
    });

    it('should show removed architectures', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        architectureChanges: [{
          type: 'removed',
          archId: 'old.arch',
          oldNode: { description: 'Old architecture' },
        }],
        summary: { ...mockDiffResult.summary, architecturesRemoved: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('REMOVED'))).toBe(true);
      expect(calls.some((c) => c?.includes('old.arch'))).toBe(true);
    });

    it('should show modified architectures', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        architectureChanges: [{
          type: 'modified',
          archId: 'modified.arch',
          inheritsChange: { old: 'base', new: 'core' },
        }],
        summary: { ...mockDiffResult.summary, architecturesModified: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('MODIFIED'))).toBe(true);
      expect(calls.some((c) => c?.includes('modified.arch'))).toBe(true);
    });

    it('should show inheritance changes', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        architectureChanges: [{
          type: 'modified',
          archId: 'modified.arch',
          inheritsChange: { old: 'base', new: 'core' },
        }],
        summary: { ...mockDiffResult.summary, architecturesModified: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('inherits:'))).toBe(true);
    });

    it('should show mixin changes in architecture', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        architectureChanges: [{
          type: 'modified',
          archId: 'modified.arch',
          mixinChanges: { added: ['tested'], removed: ['deprecated'] },
        }],
        summary: { ...mockDiffResult.summary, architecturesModified: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('mixin:'))).toBe(true);
    });
  });

  describe('mixin changes display', () => {
    it('should show mixin changes', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        mixinChanges: [{
          type: 'added',
          mixinId: 'new-mixin',
        }],
        summary: { ...mockDiffResult.summary, mixinsAdded: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('MIXINS'))).toBe(true);
      expect(calls.some((c) => c?.includes('new-mixin'))).toBe(true);
    });

    it('should show modified mixin constraints', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        mixinChanges: [{
          type: 'modified',
          mixinId: 'modified-mixin',
          constraintChanges: [{
            type: 'added',
            rule: 'forbid_import',
            newValue: ['axios'],
          }],
        }],
        summary: { ...mockDiffResult.summary, mixinsModified: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('modified-mixin'))).toBe(true);
    });
  });

  describe('affected files display', () => {
    it('should show affected files', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        affectedFiles: [
          { filePath: 'src/service.ts', archId: 'modified.arch', reason: 'constraint_change' },
        ],
        summary: { ...mockDiffResult.summary, totalAffectedFiles: 1, architecturesModified: 1 },
        architectureChanges: [{ type: 'modified', archId: 'modified.arch' }],
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('AFFECTED FILES'))).toBe(true);
      expect(calls.some((c) => c?.includes('src/service.ts'))).toBe(true);
    });

    it('should group files by reason', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        affectedFiles: [
          { filePath: 'src/a.ts', archId: 'arch1', reason: 'new_arch' },
          { filePath: 'src/b.ts', archId: 'arch2', reason: 'constraint_change' },
        ],
        summary: { ...mockDiffResult.summary, totalAffectedFiles: 2, architecturesAdded: 1, architecturesModified: 1 },
        architectureChanges: [
          { type: 'added', archId: 'arch1' },
          { type: 'modified', archId: 'arch2' },
        ],
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('new architecture'))).toBe(true);
      expect(calls.some((c) => c?.includes('constraint changes'))).toBe(true);
    });

    it('should truncate long file lists', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        affectedFiles: Array(15).fill(null).map((_, i) => ({
          filePath: `src/file${i}.ts`,
          archId: 'arch',
          reason: 'constraint_change',
        })),
        summary: { ...mockDiffResult.summary, totalAffectedFiles: 15, architecturesModified: 1 },
        architectureChanges: [{ type: 'modified', archId: 'arch' }],
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('and 5 more'))).toBe(true);
    });

    it('should skip files when --no-files is used', async () => {
      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--no-files']);

      expect(compareRegistries).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ includeAffectedFiles: false })
      );
    });
  });

  describe('verbose mode', () => {
    it('should show all constraint changes in verbose mode', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        architectureChanges: [{
          type: 'modified',
          archId: 'arch',
          constraintChanges: Array(10).fill(null).map((_, i) => ({
            type: 'added' as const,
            rule: `rule${i}`,
            newValue: `value${i}`,
          })),
        }],
        summary: { ...mockDiffResult.summary, architecturesModified: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--verbose']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      // In verbose mode, all constraints should be shown
      expect(calls.some((c) => c?.includes('rule0'))).toBe(true);
    });

    it('should hide details for many constraints without verbose', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        architectureChanges: [{
          type: 'modified',
          archId: 'arch',
          constraintChanges: Array(10).fill(null).map((_, i) => ({
            type: 'added' as const,
            rule: `rule${i}`,
            newValue: `value${i}`,
          })),
        }],
        summary: { ...mockDiffResult.summary, architecturesModified: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      // Without verbose, should show "use --verbose" hint
      expect(calls.some((c) => c?.includes('--verbose'))).toBe(true);
    });
  });

  describe('summary display', () => {
    it('should show summary', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        summary: {
          architecturesAdded: 1,
          architecturesRemoved: 2,
          architecturesModified: 3,
          mixinsAdded: 4,
          mixinsRemoved: 5,
          mixinsModified: 6,
          totalAffectedFiles: 10,
        },
        architectureChanges: [{ type: 'added', archId: 'a' }],
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Summary'))).toBe(true);
      expect(calls.some((c) => c?.includes('Architectures'))).toBe(true);
      expect(calls.some((c) => c?.includes('Mixins'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle registry load error', async () => {
      vi.mocked(loadRegistryFromRef).mockRejectedValueOnce(new Error('Registry not found'));

      const command = createDiffCommand();

      try {
        await command.parseAsync(['node', 'test', 'main..HEAD']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Registry not found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle compare registries error', async () => {
      vi.mocked(compareRegistries).mockRejectedValueOnce(new Error('Compare failed'));

      const command = createDiffCommand();

      try {
        await command.parseAsync(['node', 'test', 'main..HEAD']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Compare failed'));
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadRegistryFromRef).mockRejectedValueOnce('string error');

      const command = createDiffCommand();

      try {
        await command.parseAsync(['node', 'test', 'main..HEAD']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Unknown error');
    });

    it('should handle to-ref registry load error', async () => {
      mockParsedRange = { from: 'v1', to: 'v2' };
      vi.mocked(parseGitRange).mockReturnValue(mockParsedRange);
      vi.mocked(loadRegistryFromRef)
        .mockResolvedValueOnce(mockFromRegistry as any)
        .mockRejectedValueOnce(new Error('To registry not found'));

      const command = createDiffCommand();

      try {
        await command.parseAsync(['node', 'test', 'v1..v2']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining("Cannot load registry from 'v2'"));
    });
  });

  describe('constraint changes', () => {
    it('should show added constraints', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        architectureChanges: [{
          type: 'modified',
          archId: 'arch',
          constraintChanges: [{
            type: 'added',
            rule: 'forbid_import',
            newValue: ['axios'],
          }],
        }],
        summary: { ...mockDiffResult.summary, architecturesModified: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('forbid_import'))).toBe(true);
    });

    it('should show removed constraints', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        architectureChanges: [{
          type: 'modified',
          archId: 'arch',
          constraintChanges: [{
            type: 'removed',
            rule: 'max_file_lines',
            oldValue: 500,
          }],
        }],
        summary: { ...mockDiffResult.summary, architecturesModified: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('max_file_lines'))).toBe(true);
    });

    it('should show severity changes', async () => {
      mockDiffResult = {
        ...mockDiffResult,
        architectureChanges: [{
          type: 'modified',
          archId: 'arch',
          constraintChanges: [{
            type: 'modified',
            rule: 'forbid_import',
            oldSeverity: 'warning',
            newSeverity: 'error',
          }],
        }],
        summary: { ...mockDiffResult.summary, architecturesModified: 1 },
      };

      const command = createDiffCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('severity'))).toBe(true);
    });
  });
});
