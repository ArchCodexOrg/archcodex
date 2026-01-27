/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the LLM reindexer module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reindexArchitecture, reindexAll } from '../../../src/llm/reindexer.js';
import type { Registry } from '../../../src/core/registry/schema.js';

// Mock dependencies
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../../../src/core/discovery/keyword-extractor.js', () => ({
  extractKeywords: vi.fn(),
}));

vi.mock('../../../src/llm/providers/index.js', () => ({
  createProviderFromSettings: vi.fn(),
  getAvailableProvider: vi.fn(),
}));

vi.mock('../../../src/llm/providers/prompt.js', () => ({
  PromptProvider: vi.fn().mockImplementation(() => ({
    formatReindexPrompt: vi.fn().mockReturnValue('Reindex prompt output'),
    isAvailable: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock('../../../src/utils/checksum.js', () => ({
  computeChecksum: vi.fn().mockReturnValue('abc123'),
}));

import { readFile, writeFile } from 'fs/promises';
import { extractKeywords } from '../../../src/core/discovery/keyword-extractor.js';
import { getAvailableProvider } from '../../../src/llm/providers/index.js';

describe('Reindexer', () => {
  it('should export reindexArchitecture function', () => {
    expect(typeof reindexArchitecture).toBe('function');
  });

  it('should export reindexAll function', () => {
    expect(typeof reindexAll).toBe('function');
  });
});

describe('reindexArchitecture', () => {
  let mockRegistry: Registry;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRegistry = {
      nodes: {
        base: { description: 'Base architecture' },
        'test.service': { description: 'Service layer', inherits: 'base' },
        'test.domain': {
          description: 'Domain logic',
          inherits: 'base',
          hints: [{ text: 'Keep functions pure' }],
          constraints: [{ rule: 'forbid_import', value: ['axios'], severity: 'error' }],
        },
      },
      mixins: {},
    };

    vi.mocked(readFile).mockResolvedValue('entries: []');
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it('should return error for non-existent architecture', async () => {
    const result = await reindexArchitecture('nonexistent', mockRegistry);

    expect(result.archId).toBe('nonexistent');
    expect(result.keywords).toEqual([]);
    expect(result.error).toContain('not found');
  });

  it('should use auto mode with deterministic keywords', async () => {
    vi.mocked(extractKeywords).mockReturnValue(['service', 'api', 'layer']);

    const result = await reindexArchitecture('test.service', mockRegistry, { auto: true });

    expect(result.keywords).toEqual(['service', 'api', 'layer']);
    expect(extractKeywords).toHaveBeenCalledWith('test.service', mockRegistry.nodes['test.service']);
  });

  it('should output prompt when outputPrompt is true', async () => {
    const result = await reindexArchitecture('test.domain', mockRegistry, { outputPrompt: true });

    expect(result.promptOutput).toBe('Reindex prompt output');
    expect(result.keywords).toEqual([]);
  });

  it('should output prompt when provider is prompt', async () => {
    const result = await reindexArchitecture('test.domain', mockRegistry, { provider: 'prompt' });

    expect(result.promptOutput).toBe('Reindex prompt output');
  });

  it('should fall back to prompt when no provider is available', async () => {
    vi.mocked(getAvailableProvider).mockReturnValue({
      isAvailable: () => false,
      verify: vi.fn(),
      generateKeywords: vi.fn(),
    });

    const result = await reindexArchitecture('test.domain', mockRegistry);

    expect(result.promptOutput).toBe('Reindex prompt output');
  });

  it('should use LLM provider when available', async () => {
    const mockGenerateKeywords = vi.fn().mockResolvedValue({
      keywords: ['domain', 'business', 'logic'],
    });
    vi.mocked(getAvailableProvider).mockReturnValue({
      isAvailable: () => true,
      verify: vi.fn(),
      generateKeywords: mockGenerateKeywords,
    });

    const result = await reindexArchitecture('test.domain', mockRegistry);

    expect(result.keywords).toEqual(['domain', 'business', 'logic']);
  });
});

describe('reindexAll', () => {
  let mockRegistry: Registry;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRegistry = {
      nodes: {
        base: { description: 'Base architecture' },
        'test.service': { description: 'Service layer', inherits: 'base' },
        'test.domain': { description: 'Domain logic', inherits: 'base' },
      },
      mixins: {},
    };

    vi.mocked(readFile).mockResolvedValue('entries: []');
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it('should reindex all architectures', async () => {
    vi.mocked(extractKeywords).mockImplementation((archId) => [archId.split('.')[1] || archId]);

    const summary = await reindexAll(mockRegistry, '/test/.arch/index.yaml', { auto: true });

    expect(summary.results).toHaveLength(3);
    expect(summary.results.find(r => r.archId === 'base')).toBeDefined();
    expect(summary.results.find(r => r.archId === 'test.service')).toBeDefined();
    expect(summary.results.find(r => r.archId === 'test.domain')).toBeDefined();
  });

  it('should not write file in dry-run mode', async () => {
    vi.mocked(extractKeywords).mockReturnValue(['keyword']);

    const summary = await reindexAll(mockRegistry, '/test/.arch/index.yaml', {
      auto: true,
      dryRun: true,
    });

    expect(summary.updated).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('should not write file in outputPrompt mode', async () => {
    const summary = await reindexAll(mockRegistry, '/test/.arch/index.yaml', {
      outputPrompt: true,
    });

    expect(summary.updated).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('should update index file when keywords are generated', async () => {
    vi.mocked(extractKeywords).mockReturnValue(['keyword']);

    const summary = await reindexAll(mockRegistry, '/test/.arch/index.yaml', { auto: true });

    expect(writeFile).toHaveBeenCalled();
  });
});
