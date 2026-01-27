/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the sync-index command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSyncIndexCommand } from '../../../../src/cli/commands/sync-index.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    gray: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockStalenessResult = {
  isStale: false as boolean,
  reason: undefined as string | undefined,
  missingArchIds: [] as string[],
  currentChecksum: 'abc123',
  storedChecksum: 'abc123',
};

let mockRegistryResult = {
  nodes: {
    base: { description: 'Base' },
    'archcodex.core': { description: 'Core' },
  } as Record<string, { description: string }>,
  mixins: {},
};

let mockReindexResult = {
  results: [
    { archId: 'base', keywords: ['base', 'foundation'] },
    { archId: 'archcodex.core', keywords: ['core', 'engine'] },
  ],
};

let mockConceptsResult: {
  concepts: Record<string, { architectures: string[] }>;
} | null = null;

let mockConceptsValidation = {
  valid: true as boolean,
  invalidReferences: [] as Array<{ conceptName: string; archId: string }>,
  orphanedConcepts: [] as string[],
};

// Mock dependencies
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockImplementation(async () => mockRegistryResult),
  getRegistryContent: vi.fn().mockResolvedValue('architectures:\n  base: {}'),
}));

vi.mock('../../../../src/core/discovery/staleness.js', () => ({
  checkIndexStaleness: vi.fn().mockImplementation(async () => mockStalenessResult),
  getStalenessMessage: vi.fn().mockReturnValue('Index is stale'),
}));

vi.mock('../../../../src/llm/reindexer.js', () => ({
  reindexAll: vi.fn().mockImplementation(async () => mockReindexResult),
}));

vi.mock('../../../../src/core/discovery/concepts.js', () => ({
  loadConcepts: vi.fn().mockImplementation(async () => mockConceptsResult),
  validateConcepts: vi.fn().mockImplementation(() => mockConceptsValidation),
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

import { loadRegistry, getRegistryContent } from '../../../../src/core/registry/loader.js';
import { checkIndexStaleness, getStalenessMessage } from '../../../../src/core/discovery/staleness.js';
import { reindexAll } from '../../../../src/llm/reindexer.js';
import { loadConcepts, validateConcepts } from '../../../../src/core/discovery/concepts.js';
import { logger as log } from '../../../../src/utils/logger.js';

describe('sync-index command', () => {
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
    mockStalenessResult = {
      isStale: false,
      reason: undefined,
      missingArchIds: [],
      currentChecksum: 'abc123',
      storedChecksum: 'abc123',
    };

    mockRegistryResult = {
      nodes: {
        base: { description: 'Base' },
        'archcodex.core': { description: 'Core' },
      },
      mixins: {},
    };

    mockReindexResult = {
      results: [
        { archId: 'base', keywords: ['base', 'foundation'] },
        { archId: 'archcodex.core', keywords: ['core', 'engine'] },
      ],
    };

    mockConceptsResult = null;

    mockConceptsValidation = {
      valid: true,
      invalidReferences: [],
      orphanedConcepts: [],
    };

    // Reset mocks to use current variables
    vi.mocked(checkIndexStaleness).mockImplementation(async () => mockStalenessResult);
    vi.mocked(loadRegistry).mockImplementation(async () => mockRegistryResult as any);
    vi.mocked(reindexAll).mockImplementation(async () => mockReindexResult as any);
    vi.mocked(loadConcepts).mockImplementation(async () => mockConceptsResult);
    vi.mocked(validateConcepts).mockImplementation(() => mockConceptsValidation);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createSyncIndexCommand', () => {
    it('should create a command with correct name', () => {
      const command = createSyncIndexCommand();
      expect(command.name()).toBe('sync-index');
    });

    it('should have the correct description', () => {
      const command = createSyncIndexCommand();
      expect(command.description()).toContain('Synchronize');
    });

    it('should have required options', () => {
      const command = createSyncIndexCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--check');
      expect(optionNames).toContain('--force');
      expect(optionNames).toContain('--quiet');
      expect(optionNames).toContain('--json');
    });
  });

  describe('JSON output mode', () => {
    it('should output staleness status as JSON', async () => {
      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--json']);
      } catch {
        // Expected - process.exit throws
      }

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
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('isStale');
      expect(output).toHaveProperty('missingArchIds');
      expect(output).toHaveProperty('currentChecksum');
      expect(output).toHaveProperty('storedChecksum');
    });

    it('should include missingArchIds in JSON output', async () => {
      mockStalenessResult.isStale = true;
      mockStalenessResult.missingArchIds = ['new.arch'];

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--json']);
      } catch {
        // Expected
      }

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
      expect(output.missingArchIds).toContain('new.arch');
    });

    it('should exit 1 when stale with --check --json', async () => {
      mockStalenessResult.isStale = true;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--json', '--check']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit 0 when not stale with --check --json', async () => {
      mockStalenessResult.isStale = false;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--json', '--check']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('check mode', () => {
    it('should exit 1 when index is stale', async () => {
      mockStalenessResult.isStale = true;
      mockStalenessResult.reason = 'checksum_mismatch';

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--check']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit 0 when index is up to date', async () => {
      mockStalenessResult.isStale = false;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--check']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should show staleness message when stale', async () => {
      mockStalenessResult.isStale = true;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--check']);
      } catch {
        // Expected
      }

      expect(getStalenessMessage).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('✗'))).toBe(true);
    });

    it('should show success message when up to date', async () => {
      mockStalenessResult.isStale = false;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--check']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('✓') && c?.includes('up to date'))).toBe(true);
    });

    it('should show missing arch IDs', async () => {
      mockStalenessResult.isStale = true;
      mockStalenessResult.missingArchIds = ['new.arch1', 'new.arch2'];

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--check']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Missing'))).toBe(true);
    });

    it('should suppress output with --quiet', async () => {
      mockStalenessResult.isStale = true;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--check', '--quiet']);
      } catch {
        // Expected
      }

      // console.log should not be called in quiet mode
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('sync mode', () => {
    it('should skip sync when index is up to date', async () => {
      mockStalenessResult.isStale = false;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(reindexAll).not.toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('already up to date'))).toBe(true);
    });

    it('should sync when index is stale', async () => {
      mockStalenessResult.isStale = true;
      mockStalenessResult.reason = 'checksum_mismatch';

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(reindexAll).toHaveBeenCalled();
      expect(loadRegistry).toHaveBeenCalled();
      expect(getRegistryContent).toHaveBeenCalled();
    });

    it('should sync when --force is used even if not stale', async () => {
      mockStalenessResult.isStale = false;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--force']);
      } catch {
        // Expected
      }

      expect(reindexAll).toHaveBeenCalled();
    });

    it('should show reason when syncing stale index', async () => {
      mockStalenessResult.isStale = true;
      mockStalenessResult.reason = 'checksum_mismatch';

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Reason'))).toBe(true);
    });

    it('should show force message when using --force', async () => {
      mockStalenessResult.isStale = false;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--force']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('forced'))).toBe(true);
    });

    it('should show success message after sync', async () => {
      mockStalenessResult.isStale = true;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('synchronized'))).toBe(true);
    });

    it('should show count of architectures synced', async () => {
      mockStalenessResult.isStale = true;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('2 architectures'))).toBe(true);
    });

    it('should show added architectures', async () => {
      mockStalenessResult.isStale = true;
      mockStalenessResult.missingArchIds = ['new.arch'];

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Added') && c?.includes('new.arch'))).toBe(true);
    });

    it('should suppress output with --quiet', async () => {
      mockStalenessResult.isStale = true;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--quiet']);
      } catch {
        // Expected
      }

      // Only process.exit call
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should call reindexAll with auto mode', async () => {
      mockStalenessResult.isStale = true;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(reindexAll).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('index.yaml'),
        expect.objectContaining({ auto: true })
      );
    });
  });

  describe('concepts validation', () => {
    it('should validate concepts after sync', async () => {
      mockStalenessResult.isStale = true;
      mockConceptsResult = {
        concepts: {
          'type_validation': { architectures: ['archcodex.core.domain.schema'] },
        },
      };

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(loadConcepts).toHaveBeenCalled();
      expect(validateConcepts).toHaveBeenCalled();
    });

    it('should show warnings for invalid concept references', async () => {
      mockStalenessResult.isStale = true;
      mockConceptsResult = {
        concepts: {
          'api_client': { architectures: ['archcodex.infra.http'] },
        },
      };
      mockConceptsValidation = {
        valid: false,
        invalidReferences: [{ conceptName: 'api_client', archId: 'archcodex.infra.http' }],
        orphanedConcepts: [],
      };

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Concepts validation warnings'))).toBe(true);
      expect(calls.some((c) => c?.includes('api_client'))).toBe(true);
    });

    it('should show orphaned concepts', async () => {
      mockStalenessResult.isStale = true;
      mockConceptsResult = {
        concepts: {
          'orphan': { architectures: [] },
        },
      };
      mockConceptsValidation = {
        valid: false,
        invalidReferences: [],
        orphanedConcepts: ['orphan'],
      };

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Orphaned'))).toBe(true);
    });

    it('should suggest running garden --concepts', async () => {
      mockStalenessResult.isStale = true;
      mockConceptsResult = { concepts: {} };
      mockConceptsValidation = {
        valid: false,
        invalidReferences: [{ conceptName: 'test', archId: 'unknown' }],
        orphanedConcepts: [],
      };

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('garden --concepts'))).toBe(true);
    });

    it('should skip concepts validation when no concepts file', async () => {
      mockStalenessResult.isStale = true;
      mockConceptsResult = null;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(loadConcepts).toHaveBeenCalled();
      expect(validateConcepts).not.toHaveBeenCalled();
    });

    it('should skip concepts warnings in quiet mode', async () => {
      mockStalenessResult.isStale = true;
      mockConceptsResult = { concepts: {} };
      mockConceptsValidation = {
        valid: false,
        invalidReferences: [{ conceptName: 'test', archId: 'unknown' }],
        orphanedConcepts: [],
      };

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--quiet']);
      } catch {
        // Expected
      }

      // No console.log in quiet mode
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle staleness check errors', async () => {
      vi.mocked(checkIndexStaleness).mockRejectedValue(new Error('Staleness check failed'));

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync'),
        expect.any(Error)
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle registry loading errors', async () => {
      mockStalenessResult.isStale = true;
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry not found'));

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle reindex errors', async () => {
      mockStalenessResult.isStale = true;
      vi.mocked(reindexAll).mockRejectedValue(new Error('Reindex failed'));

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should suppress error output in quiet mode', async () => {
      vi.mocked(checkIndexStaleness).mockRejectedValue(new Error('Error'));

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test', '--quiet']);
      } catch {
        // Expected
      }

      expect(log.error).not.toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(checkIndexStaleness).mockRejectedValue('string error');

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync'),
        undefined
      );
    });
  });

  describe('exit codes', () => {
    it('should exit 0 after successful sync', async () => {
      mockStalenessResult.isStale = true;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit 0 when already up to date', async () => {
      mockStalenessResult.isStale = false;

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit 1 on error', async () => {
      vi.mocked(checkIndexStaleness).mockRejectedValue(new Error('Error'));

      const command = createSyncIndexCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
