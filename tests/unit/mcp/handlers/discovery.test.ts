/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP discovery handlers (discover, resolve, neighborhood, diff-arch).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleDiscover,
  handleResolve,
  handleNeighborhood,
  handleDiffArch,
} from '../../../../src/mcp/handlers/discovery.js';

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
  getRegistryContent: vi.fn(),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(),
}));

vi.mock('../../../../src/core/patterns/loader.js', () => ({
  loadPatternRegistry: vi.fn(),
}));

vi.mock('../../../../src/core/neighborhood/analyzer.js', () => ({
  NeighborhoodAnalyzer: vi.fn(function() {
    return {
    analyze: vi.fn(),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/discovery/index.js', () => ({
  loadIndex: vi.fn(),
  matchQuery: vi.fn(),
  checkIndexStaleness: vi.fn(),
}));

vi.mock('../../../../src/core/discovery/concepts.js', () => ({
  loadConcepts: vi.fn(),
}));

vi.mock('../../../../src/llm/reindexer.js', () => ({
  reindexAll: vi.fn(),
}));

import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry, getRegistryContent } from '../../../../src/core/registry/loader.js';
import { resolveArchitecture } from '../../../../src/core/registry/resolver.js';
import { loadPatternRegistry } from '../../../../src/core/patterns/loader.js';
import { NeighborhoodAnalyzer } from '../../../../src/core/neighborhood/analyzer.js';
import { loadIndex, matchQuery, checkIndexStaleness } from '../../../../src/core/discovery/index.js';
import { loadConcepts } from '../../../../src/core/discovery/concepts.js';
import { reindexAll } from '../../../../src/llm/reindexer.js';

describe('MCP Discovery Handlers', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadConfig).mockResolvedValue({ discovery: {} });
    vi.mocked(loadRegistry).mockResolvedValue({
      nodes: { base: { description: 'Base' } },
      mixins: {},
    });
    vi.mocked(loadPatternRegistry).mockResolvedValue({ patterns: {} });
    vi.mocked(checkIndexStaleness).mockResolvedValue({
      isStale: false,
      reason: undefined,
      missingArchIds: [],
    });
    vi.mocked(loadIndex).mockResolvedValue({
      entries: [],
    });
    vi.mocked(loadConcepts).mockResolvedValue(null);
  });

  describe('handleDiscover', () => {
    it('should discover architectures matching query', async () => {
      vi.mocked(matchQuery).mockReturnValue([
        {
          entry: {
            arch_id: 'test.service',
            keywords: ['service', 'api'],
            description: 'Service architecture',
            suggested_path: 'src/services',
          },
          score: 0.9,
          matchedKeywords: ['service'],
        },
      ]);

      const result = await handleDiscover(projectRoot, 'service');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.query).toBe('service');
      expect(parsed.matches).toHaveLength(1);
      expect(parsed.matches[0].archId).toBe('test.service');
      expect(parsed.matches[0].score).toBe(0.9);
    });

    it('should include staleness warning when index is stale', async () => {
      vi.mocked(checkIndexStaleness).mockResolvedValue({
        isStale: true,
        reason: 'Registry modified',
        missingArchIds: ['new.arch'],
      });
      vi.mocked(matchQuery).mockReturnValue([]);

      const result = await handleDiscover(projectRoot, 'test');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.warning).toBeDefined();
      expect(parsed.warning.message).toBe('Index is stale');
      expect(parsed.warning.reason).toBe('Registry modified');
    });

    it('should auto-sync when enabled and index is stale', async () => {
      vi.mocked(checkIndexStaleness).mockResolvedValue({
        isStale: true,
        reason: 'Registry modified',
        missingArchIds: [],
      });
      vi.mocked(getRegistryContent).mockResolvedValue({});
      vi.mocked(reindexAll).mockResolvedValue({ results: [] });
      vi.mocked(matchQuery).mockReturnValue([]);

      const result = await handleDiscover(projectRoot, 'test', { autoSync: true });

      expect(reindexAll).toHaveBeenCalled();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.synced).toBe(true);
    });

    it('should not auto-sync when disabled', async () => {
      vi.mocked(checkIndexStaleness).mockResolvedValue({
        isStale: true,
        reason: 'Registry modified',
        missingArchIds: [],
      });
      vi.mocked(matchQuery).mockReturnValue([]);

      await handleDiscover(projectRoot, 'test', { autoSync: false });

      expect(reindexAll).not.toHaveBeenCalled();
    });

    it('should respect limit option', async () => {
      vi.mocked(matchQuery).mockReturnValue([
        { entry: { arch_id: 'a', keywords: [], description: '' }, score: 0.9, matchedKeywords: [] },
        { entry: { arch_id: 'b', keywords: [], description: '' }, score: 0.8, matchedKeywords: [] },
      ]);

      await handleDiscover(projectRoot, 'test', { limit: 3 });

      expect(matchQuery).toHaveBeenCalledWith(expect.anything(), 'test', {
        limit: 3,
        concepts: undefined,
      });
    });

    it('should include concept match when present', async () => {
      vi.mocked(loadConcepts).mockResolvedValue({
        concepts: {
          validation: {
            description: 'Type validation',
            aliases: ['validator', 'schema'],
            architectures: ['core.validator'],
          },
        },
      });
      vi.mocked(matchQuery).mockReturnValue([
        {
          entry: {
            arch_id: 'core.validator',
            keywords: ['validator'],
            description: 'Validator',
          },
          score: 0.95,
          matchedKeywords: ['validator'],
          matchedConcept: 'validation',
        },
      ]);

      const result = await handleDiscover(projectRoot, 'validator');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.matches[0].matchedConcept).toBe('validation');
    });
  });

  describe('handleResolve', () => {
    it('should resolve architecture and return flattened result', async () => {
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          inheritanceChain: ['base', 'test.arch'],
          appliedMixins: ['tested'],
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', source: 'test.arch' },
          ],
          hints: [{ text: 'Keep it simple' }],
          pointers: [{ label: 'Docs', uri: 'arch://docs' }],
        },
        conflicts: [],
      });

      const result = await handleResolve(projectRoot, 'test.arch');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.archId).toBe('test.arch');
      expect(parsed.inheritanceChain).toContain('base');
      expect(parsed.appliedMixins).toContain('tested');
      expect(parsed.constraints).toHaveLength(1);
      expect(parsed.hints).toHaveLength(1);
    });

    it('should include conflicts when present', async () => {
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
        },
        conflicts: [
          { type: 'duplicate_constraint', message: 'Duplicate forbid_import rule' },
        ],
      });

      const result = await handleResolve(projectRoot, 'test.arch');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.conflicts).toHaveLength(1);
    });
  });

  describe('handleNeighborhood', () => {
    it('should analyze neighborhood for a file', async () => {
      const mockAnalyze = vi.fn().mockResolvedValue({
        file: 'src/test.ts',
        archId: 'test.arch',
        currentImports: [
          { module: './utils', status: 'allowed' },
        ],
        forbiddenImports: ['axios'],
        importedBy: ['src/other.ts'],
      });

      vi.mocked(NeighborhoodAnalyzer).mockImplementation(function() {
      return {
        analyze: mockAnalyze,
        dispose: vi.fn(),
      } as unknown as NeighborhoodAnalyzer;
    });

      const result = await handleNeighborhood(projectRoot, 'src/test.ts');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.file).toBe('src/test.ts');
      expect(parsed.archId).toBe('test.arch');
      expect(parsed.currentImports).toHaveLength(1);
      expect(parsed.forbiddenImports).toContain('axios');
    });

    it('should dispose analyzer after use', async () => {
      const mockDispose = vi.fn();
      vi.mocked(NeighborhoodAnalyzer).mockImplementation(function() {
      return {
        analyze: vi.fn().mockResolvedValue({}),
        dispose: mockDispose,
      } as unknown as NeighborhoodAnalyzer;
    });

      await handleNeighborhood(projectRoot, 'src/test.ts');

      expect(mockDispose).toHaveBeenCalled();
    });
  });

  describe('handleDiffArch', () => {
    it('should diff two architectures and return differences', async () => {
      vi.mocked(resolveArchitecture)
        .mockReturnValueOnce({
          architecture: {
            archId: 'from.arch',
            inheritanceChain: ['from.arch'],
            appliedMixins: ['tested'],
            constraints: [
              { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'from.arch' },
            ],
            hints: [],
            pointers: [],
          },
          conflicts: [],
        })
        .mockReturnValueOnce({
          architecture: {
            archId: 'to.arch',
            inheritanceChain: ['to.arch'],
            appliedMixins: ['tested', 'srp'],
            constraints: [
              { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'to.arch' },
              { rule: 'max_file_lines', value: 300, severity: 'warning', source: 'to.arch' },
            ],
            hints: [],
            pointers: [],
          },
          conflicts: [],
        });

      const result = await handleDiffArch(projectRoot, 'from.arch', 'to.arch');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.from).toBe('from.arch');
      expect(parsed.to).toBe('to.arch');
      expect(parsed.constraints.added).toHaveLength(1);
      expect(parsed.constraints.added[0].rule).toBe('max_file_lines');
      expect(parsed.mixins.added).toContain('srp');
    });

    it('should identify removed constraints', async () => {
      vi.mocked(resolveArchitecture)
        .mockReturnValueOnce({
          architecture: {
            archId: 'from.arch',
            inheritanceChain: ['from.arch'],
            appliedMixins: [],
            constraints: [
              { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'from.arch' },
              { rule: 'require_test_file', value: '*.test.ts', severity: 'error', source: 'from.arch' },
            ],
            hints: [],
            pointers: [],
          },
          conflicts: [],
        })
        .mockReturnValueOnce({
          architecture: {
            archId: 'to.arch',
            inheritanceChain: ['to.arch'],
            appliedMixins: [],
            constraints: [
              { rule: 'forbid_import', value: 'axios', severity: 'error', source: 'to.arch' },
            ],
            hints: [],
            pointers: [],
          },
          conflicts: [],
        });

      const result = await handleDiffArch(projectRoot, 'from.arch', 'to.arch');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.constraints.removed).toHaveLength(1);
      expect(parsed.constraints.removed[0].rule).toBe('require_test_file');
    });

    it('should identify removed mixins', async () => {
      vi.mocked(resolveArchitecture)
        .mockReturnValueOnce({
          architecture: {
            archId: 'from.arch',
            inheritanceChain: ['from.arch'],
            appliedMixins: ['tested', 'srp'],
            constraints: [],
            hints: [],
            pointers: [],
          },
          conflicts: [],
        })
        .mockReturnValueOnce({
          architecture: {
            archId: 'to.arch',
            inheritanceChain: ['to.arch'],
            appliedMixins: ['tested'],
            constraints: [],
            hints: [],
            pointers: [],
          },
          conflicts: [],
        });

      const result = await handleDiffArch(projectRoot, 'from.arch', 'to.arch');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.mixins.removed).toContain('srp');
    });
  });
});
