/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Extended tests for reindexer - targeting formatReindexResult, formatReindexSummary,
 * and additional branches in reindexAll.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reindexArchitecture,
  reindexAll,
  formatReindexResult,
  formatReindexSummary,
} from '../../../src/llm/reindexer.js';
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
  PromptProvider: vi.fn(function() {
    return {
      formatReindexPrompt: vi.fn().mockReturnValue('Reindex prompt output'),
      isAvailable: vi.fn().mockReturnValue(true),
    };
  }),
}));

vi.mock('../../../src/utils/checksum.js', () => ({
  computeChecksum: vi.fn().mockReturnValue('checksum123'),
}));

import { readFile, writeFile } from 'fs/promises';
import { extractKeywords } from '../../../src/core/discovery/keyword-extractor.js';
import { createProviderFromSettings } from '../../../src/llm/providers/index.js';

describe('formatReindexResult', () => {
  it('formats result with keywords', () => {
    const result = formatReindexResult({
      archId: 'test.service',
      keywords: ['service', 'api', 'backend'],
    });

    expect(result).toContain('Architecture: test.service');
    expect(result).toContain('Keywords: service, api, backend');
  });

  it('formats result with error', () => {
    const result = formatReindexResult({
      archId: 'missing.arch',
      keywords: [],
      error: 'Architecture not found in registry',
    });

    expect(result).toContain('Architecture: missing.arch');
    expect(result).toContain('Error: Architecture not found in registry');
  });

  it('formats result with prompt output', () => {
    const result = formatReindexResult({
      archId: 'test.arch',
      keywords: [],
      promptOutput: 'Generated prompt for external LLM',
    });

    expect(result).toContain('Architecture: test.arch');
    expect(result).toContain('Generated prompt for external LLM');
  });

  it('formats result with no keywords', () => {
    const result = formatReindexResult({
      archId: 'test.arch',
      keywords: [],
    });

    expect(result).toContain('No keywords generated');
  });
});

describe('formatReindexSummary', () => {
  it('formats summary with keywords', () => {
    const result = formatReindexSummary({
      results: [
        { archId: 'test.service', keywords: ['service', 'api'] },
        { archId: 'test.domain', keywords: ['domain', 'logic'] },
      ],
      indexPath: '/test/.arch/index.yaml',
      updated: true,
    });

    expect(result).toContain('REINDEX SUMMARY');
    expect(result).toContain('Total architectures: 2');
    expect(result).toContain('Keywords generated: 2');
    expect(result).toContain('Updated: /test/.arch/index.yaml');
  });

  it('formats summary with prompts', () => {
    const result = formatReindexSummary({
      results: [
        { archId: 'test.arch', keywords: [], promptOutput: 'Prompt text here' },
      ],
      indexPath: '/test/.arch/index.yaml',
      updated: false,
    });

    expect(result).toContain('Prompts output: 1');
    expect(result).toContain('Prompt text here');
  });

  it('formats summary with errors', () => {
    const result = formatReindexSummary({
      results: [
        { archId: 'bad.arch', keywords: [], error: 'Not found' },
      ],
      indexPath: '/test/.arch/index.yaml',
      updated: false,
    });

    expect(result).toContain('Errors: 1');
  });

  it('does not show Updated line when not updated', () => {
    const result = formatReindexSummary({
      results: [],
      indexPath: '/test/.arch/index.yaml',
      updated: false,
    });

    expect(result).not.toContain('Updated:');
  });
});

describe('reindexArchitecture - extended', () => {
  let mockRegistry: Registry;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRegistry = {
      nodes: {
        'test.hints': {
          description: 'With hints and constraints',
          hints: [{ text: 'Hint text' }, 'String hint'],
          constraints: [{ rule: 'forbid_import', value: ['chalk'], severity: 'error' }],
        },
        'test.minimal': {
          description: 'Minimal arch',
        },
      },
      mixins: {},
    };

    vi.mocked(readFile).mockResolvedValue('entries: []');
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it('converts hints to strings for reindex request', async () => {
    vi.mocked(createProviderFromSettings).mockReturnValue({
      isAvailable: () => true,
      verify: vi.fn(),
      generateKeywords: vi.fn().mockResolvedValue({ keywords: ['hint'] }),
    });

    const result = await reindexArchitecture('test.hints', mockRegistry, {
      provider: 'openai',
    });

    expect(result.keywords).toEqual(['hint']);
  });

  it('uses specific provider when provider string is specified', async () => {
    const mockGenerateKeywords = vi.fn().mockResolvedValue({ keywords: ['test'] });
    vi.mocked(createProviderFromSettings).mockReturnValue({
      isAvailable: () => true,
      verify: vi.fn(),
      generateKeywords: mockGenerateKeywords,
    });

    await reindexArchitecture('test.minimal', mockRegistry, {
      provider: 'openai',
    });

    expect(createProviderFromSettings).toHaveBeenCalledWith('openai', undefined, undefined);
  });
});

describe('reindexAll - extended', () => {
  let mockRegistry: Registry;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRegistry = {
      nodes: {
        base: { description: 'Base' },
        'test.service': { description: 'Service' },
      },
      mixins: {},
    };

    vi.mocked(readFile).mockResolvedValue('version: "1.0"\nentries: []');
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it('writes index with registryContent checksum', async () => {
    vi.mocked(extractKeywords).mockReturnValue(['keyword']);

    await reindexAll(mockRegistry, '/test/.arch/index.yaml', {
      auto: true,
      registryContent: 'nodes:\n  base:\n    description: Base',
    });

    expect(writeFile).toHaveBeenCalled();
    const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(writtenContent).toContain('registry_checksum');
  });

  it('does not write when no keywords generated', async () => {
    vi.mocked(extractKeywords).mockReturnValue([]);

    const summary = await reindexAll(mockRegistry, '/test/.arch/index.yaml', { auto: true });

    expect(summary.updated).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('handles existing index file with entries', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'version: "1.0"\nentries:\n  - arch_id: base\n    keywords: ["old"]\n'
    );
    vi.mocked(extractKeywords).mockReturnValue(['new']);

    await reindexAll(mockRegistry, '/test/.arch/index.yaml', { auto: true });

    expect(writeFile).toHaveBeenCalled();
    const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    // Should have updated keywords
    expect(writtenContent).toContain('new');
  });

  it('creates new index when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(extractKeywords).mockReturnValue(['keyword']);

    await reindexAll(mockRegistry, '/test/.arch/index.yaml', { auto: true });

    expect(writeFile).toHaveBeenCalled();
    const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(writtenContent).toContain('ArchCodex Discovery Index');
  });
});
