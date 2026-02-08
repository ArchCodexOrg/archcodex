/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the discover command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDiscoverCommand } from '../../../../src/cli/commands/discover.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockIndex = {
  entries: [
    {
      arch_id: 'domain.service',
      description: 'Domain service for business logic',
      keywords: ['service', 'domain', 'business'],
    },
    {
      arch_id: 'domain.payment',
      description: 'Payment processing service',
      keywords: ['payment', 'billing', 'transaction'],
      suggested_path: 'src/services/payment',
    },
  ],
};

let mockMatchResults = [
  {
    entry: {
      arch_id: 'domain.service',
      description: 'Domain service for business logic',
      keywords: ['service', 'domain', 'business'],
    },
    score: 0.9,
    matchedKeywords: ['service'],
    matchedConcept: undefined,
  },
];

let mockStaleness = {
  isStale: false,
  reason: undefined as string | undefined,
  missingArchIds: [] as string[],
};

let mockDecisionTreeExists = false;
let mockConcepts: object | null = null;
let mockConfig = {
  discovery: { auto_sync: false },
};

// Mock dependencies
vi.mock('../../../../src/core/discovery/index.js', () => ({
  loadIndex: vi.fn().mockImplementation(async () => mockIndex),
  matchQuery: vi.fn().mockImplementation(() => mockMatchResults),
  getAllEntries: vi.fn().mockImplementation((index) => index.entries),
  checkIndexStaleness: vi.fn().mockImplementation(async () => mockStaleness),
  decisionTreeExists: vi.fn().mockImplementation(async () => mockDecisionTreeExists),
}));

vi.mock('../../../../src/core/discovery/concepts.js', () => ({
  loadConcepts: vi.fn().mockImplementation(async () => mockConcepts),
}));

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockImplementation(async () => mockConfig),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({}),
  getRegistryContent: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../../../src/llm/reindexer.js', () => ({
  reindexAll: vi.fn().mockResolvedValue(undefined),
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

import {
  loadIndex,
  matchQuery,
  checkIndexStaleness,
  decisionTreeExists,
} from '../../../../src/core/discovery/index.js';
import { loadConcepts } from '../../../../src/core/discovery/concepts.js';
import { loadConfig } from '../../../../src/core/config/loader.js';
import { reindexAll } from '../../../../src/llm/reindexer.js';
import { logger as log } from '../../../../src/utils/logger.js';

describe('discover command', () => {
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
    mockIndex = {
      entries: [
        {
          arch_id: 'domain.service',
          description: 'Domain service for business logic',
          keywords: ['service', 'domain', 'business'],
        },
        {
          arch_id: 'domain.payment',
          description: 'Payment processing service',
          keywords: ['payment', 'billing', 'transaction'],
          suggested_path: 'src/services/payment',
        },
      ],
    };

    mockMatchResults = [
      {
        entry: {
          arch_id: 'domain.service',
          description: 'Domain service for business logic',
          keywords: ['service', 'domain', 'business'],
        },
        score: 0.9,
        matchedKeywords: ['service'],
        matchedConcept: undefined,
      },
    ];

    mockStaleness = {
      isStale: false,
      reason: undefined,
      missingArchIds: [],
    };

    mockDecisionTreeExists = false;
    mockConcepts = null;
    mockConfig = { discovery: { auto_sync: false } };

    // Reset mocks to use updated variables
    vi.mocked(loadIndex).mockImplementation(async () => mockIndex);
    vi.mocked(matchQuery).mockImplementation(() => mockMatchResults);
    vi.mocked(checkIndexStaleness).mockImplementation(async () => mockStaleness);
    vi.mocked(decisionTreeExists).mockImplementation(async () => mockDecisionTreeExists);
    vi.mocked(loadConcepts).mockImplementation(async () => mockConcepts);
    vi.mocked(loadConfig).mockImplementation(async () => mockConfig);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createDiscoverCommand', () => {
    it('should create a command with correct name', () => {
      const command = createDiscoverCommand();
      expect(command.name()).toBe('discover');
    });

    it('should have the correct description', () => {
      const command = createDiscoverCommand();
      expect(command.description()).toBe('Find architecture patterns matching a description or intent');
    });

    it('should have an optional query argument', () => {
      const command = createDiscoverCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('query');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createDiscoverCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--list');
      expect(optionNames).toContain('--limit');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--auto-sync');
    });

    it('should have correct default for limit option', () => {
      const command = createDiscoverCommand();
      const limitOption = command.options.find((opt) => opt.long === '--limit');
      expect(limitOption?.defaultValue).toBe('5');
    });

    it('should have short flags for common options', () => {
      const command = createDiscoverCommand();
      const options = command.options;

      const listOption = options.find((opt) => opt.long === '--list');
      expect(listOption?.short).toBe('-l');
    });
  });

  describe('query mode', () => {
    it('should load index and concepts', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      expect(loadIndex).toHaveBeenCalledWith('/project');
      expect(loadConcepts).toHaveBeenCalledWith('/project');
    });

    it('should match query against index', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      expect(matchQuery).toHaveBeenCalledWith(
        mockIndex,
        'service',
        expect.objectContaining({ limit: 5 })
      );
    });

    it('should show matching architectures', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('domain.service'))).toBe(true);
      expect(calls.some((c) => c?.includes('90% match'))).toBe(true);
    });

    it('should show matched keywords', async () => {
      mockMatchResults = [
        {
          entry: { arch_id: 'domain.service', keywords: ['service'] },
          score: 0.9,
          matchedKeywords: ['service', 'handler'],
          matchedConcept: undefined,
        },
      ];

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service handler']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Matched:') && c?.includes('service, handler'))).toBe(true);
    });

    it('should show matched concept when present', async () => {
      mockMatchResults = [
        {
          entry: { arch_id: 'domain.service', keywords: ['service'] },
          score: 0.95,
          matchedKeywords: ['validator'],
          matchedConcept: 'validation',
        },
      ];

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'validator']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Concept:') && c?.includes('validation'))).toBe(true);
    });

    it('should show suggested path when present', async () => {
      mockMatchResults = [
        {
          entry: {
            arch_id: 'domain.payment',
            keywords: ['payment'],
            suggested_path: 'src/services/payment',
          },
          score: 0.9,
          matchedKeywords: ['payment'],
          matchedConcept: undefined,
        },
      ];

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'payment']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Path:') && c?.includes('src/services/payment'))).toBe(true);
    });

    it('should show scaffold suggestion', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('archcodex scaffold domain.service'))).toBe(true);
    });

    it('should respect --limit option', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service', '--limit', '3']);

      expect(matchQuery).toHaveBeenCalledWith(
        expect.any(Object),
        'service',
        expect.objectContaining({ limit: 3 })
      );
    });

    it('should use default limit for invalid value', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service', '--limit', 'invalid']);

      expect(matchQuery).toHaveBeenCalledWith(
        expect.any(Object),
        'service',
        expect.objectContaining({ limit: 5 })
      );
    });

    it('should show no results message', async () => {
      mockMatchResults = [];

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'nonexistent']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No matching architectures found'))).toBe(true);
    });

    it('should pass concepts to matchQuery when loaded', async () => {
      mockConcepts = { type_validation: { aliases: ['validator'] } };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'validator']);

      expect(matchQuery).toHaveBeenCalledWith(
        expect.any(Object),
        'validator',
        expect.objectContaining({ concepts: mockConcepts })
      );
    });
  });

  describe('list mode', () => {
    it('should show all architectures', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', '--list']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Available Architectures'))).toBe(true);
      expect(calls.some((c) => c?.includes('domain.service'))).toBe(true);
      expect(calls.some((c) => c?.includes('domain.payment'))).toBe(true);
    });

    it('should show architecture descriptions', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', '--list']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Domain service for business logic'))).toBe(true);
    });

    it('should show keywords', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', '--list']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Keywords:'))).toBe(true);
    });

    it('should not require query in list mode', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', '--list']);

      // Should not exit with error
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('JSON output', () => {
    it('should output JSON for query results', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service', '--json']);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should output JSON for list results', async () => {
      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', '--list', '--json']);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe('stale index handling', () => {
    it('should warn about stale index', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'checksum_mismatch',
        missingArchIds: [],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('stale'));
    });

    it('should format checksum_mismatch reason', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'checksum_mismatch',
        missingArchIds: [],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('registry modified'));
    });

    it('should format missing_architectures reason', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'missing_architectures',
        missingArchIds: ['new.arch'],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('new architectures added'));
    });

    it('should format no_checksum reason', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'no_checksum',
        missingArchIds: [],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('legacy index format'));
    });

    it('should format no_index reason', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'no_index',
        missingArchIds: [],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('no index file'));
    });

    it('should show missing architectures count', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'missing_architectures',
        missingArchIds: ['arch1', 'arch2', 'arch3'],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('3 architecture(s) not in index'))).toBe(true);
    });

    it('should suggest sync commands', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'checksum_mismatch',
        missingArchIds: [],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('archcodex sync-index'))).toBe(true);
      expect(calls.some((c) => c?.includes('--auto-sync'))).toBe(true);
    });

    it('should not warn in JSON mode', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'checksum_mismatch',
        missingArchIds: [],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service', '--json']);

      expect(log.warn).not.toHaveBeenCalled();
    });
  });

  describe('auto-sync', () => {
    it('should auto-sync when --auto-sync is set', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'checksum_mismatch',
        missingArchIds: [],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service', '--auto-sync']);

      expect(reindexAll).toHaveBeenCalled();
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('syncing'));
      expect(log.success).toHaveBeenCalledWith(expect.stringContaining('synced'));
    });

    it('should auto-sync when config.discovery.auto_sync is true', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'checksum_mismatch',
        missingArchIds: [],
      };
      mockConfig = { discovery: { auto_sync: true } };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      expect(reindexAll).toHaveBeenCalled();
    });

    it('should reload index after auto-sync', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'checksum_mismatch',
        missingArchIds: [],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service', '--auto-sync']);

      // loadIndex should be called twice - initial and after sync
      expect(loadIndex).toHaveBeenCalledTimes(2);
    });

    it('should not show sync messages in JSON mode', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'checksum_mismatch',
        missingArchIds: [],
      };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service', '--auto-sync', '--json']);

      expect(log.info).not.toHaveBeenCalled();
      expect(log.success).not.toHaveBeenCalled();
    });
  });

  describe('empty index', () => {
    it('should warn about empty index', async () => {
      mockIndex = { entries: [] };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('No entries in index.yaml'));
    });

    it('should return early with empty index', async () => {
      mockIndex = { entries: [] };

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      // matchQuery should not be called
      expect(matchQuery).not.toHaveBeenCalled();
    });
  });

  describe('missing query', () => {
    it('should error when query is missing and not in list mode', async () => {
      const command = createDiscoverCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected - process.exit throws
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Please provide a query'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('decision tree suggestion', () => {
    it('should show decision tree tip when available', async () => {
      mockDecisionTreeExists = true;

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('archcodex decide'))).toBe(true);
    });

    it('should not show decision tree tip when not available', async () => {
      mockDecisionTreeExists = false;

      const command = createDiscoverCommand();
      await command.parseAsync(['node', 'test', 'service']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('archcodex decide'))).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle config loading errors', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));

      const command = createDiscoverCommand();

      try {
        await command.parseAsync(['node', 'test', 'service']);
      } catch {
        // Expected - process.exit throws
      }

      expect(log.error).toHaveBeenCalledWith('Config not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle index loading errors', async () => {
      vi.mocked(loadIndex).mockRejectedValue(new Error('Index not found'));

      const command = createDiscoverCommand();

      try {
        await command.parseAsync(['node', 'test', 'service']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Index not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValue('string error');

      const command = createDiscoverCommand();

      try {
        await command.parseAsync(['node', 'test', 'service']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Unknown error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
