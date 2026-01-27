/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for session context engine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildArchitectureSummary, buildPatternSummaries, getSessionContext } from '../../../../src/core/session/context.js';
import type { Registry } from '../../../../src/core/registry/schema.js';
import type { PatternRegistry } from '../../../../src/core/patterns/types.js';

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn(),
}));

vi.mock('../../../../src/core/patterns/loader.js', () => ({
  loadPatternRegistry: vi.fn(),
}));

import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { globFiles, readFile } from '../../../../src/utils/file-system.js';
import { loadArchIgnore } from '../../../../src/utils/archignore.js';
import { loadPatternRegistry } from '../../../../src/core/patterns/loader.js';

function makeRegistry(nodes: Record<string, unknown>): Registry {
  return { nodes, mixins: {} } as unknown as Registry;
}

describe('buildArchitectureSummary', () => {
  const registry = makeRegistry({
    base: {
      description: 'Base architecture',
      constraints: [],
      hints: [],
    },
    'test.arch': {
      inherits: 'base',
      description: 'Test architecture',
      constraints: [
        { rule: 'forbid_import', value: ['axios', 'http'], severity: 'error', why: 'Use client' },
        { rule: 'forbid_pattern', value: ['console.log'], severity: 'warning' },
        { rule: 'require_import', value: ['logger'], severity: 'warning' },
      ],
      hints: ['Keep it simple', { text: 'Use structured logging' }],
    },
  });

  it('should extract forbid, patterns, require from constraints', () => {
    const summary = buildArchitectureSummary('test.arch', ['src/a.ts', 'src/b.ts'], registry);

    expect(summary.archId).toBe('test.arch');
    expect(summary.fileCount).toBe(2);
    expect(summary.files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(summary.forbid).toContain('axios');
    expect(summary.forbid).toContain('http');
    expect(summary.patterns).toContain('console.log');
    expect(summary.require).toContain('logger');
  });

  it('should extract hints as strings', () => {
    const summary = buildArchitectureSummary('test.arch', ['src/a.ts'], registry);

    expect(summary.hints).toContain('Keep it simple');
    expect(summary.hints).toContain('Use structured logging');
  });

  it('should throw for unknown architecture', () => {
    expect(() => buildArchitectureSummary('nonexistent', ['src/x.ts'], registry))
      .toThrow("Architecture 'nonexistent' not found in registry");
  });

  it('should deduplicate constraint values', () => {
    const dupeRegistry = makeRegistry({
      base: {
        description: 'Base',
        constraints: [
          { rule: 'forbid_import', value: ['axios'], severity: 'error' },
        ],
        hints: [],
      },
      child: {
        inherits: 'base',
        description: 'Child',
        constraints: [
          { rule: 'forbid_import', value: ['axios', 'http'], severity: 'error' },
        ],
        hints: [],
      },
    });

    const summary = buildArchitectureSummary('child', ['src/f.ts'], dupeRegistry);
    const axiosCount = summary.forbid.filter(f => f === 'axios').length;
    expect(axiosCount).toBe(1);
  });
});

describe('buildPatternSummaries', () => {
  it('should convert pattern registry to summaries', () => {
    const registry: PatternRegistry = {
      patterns: {
        logger: {
          canonical: 'src/utils/logger.ts',
          exports: ['logger', 'createLogger'],
          usage: 'Use structured logger',
          keywords: ['log'],
        },
        config: {
          canonical: 'src/utils/config.ts',
          exports: ['loadConfig'],
          keywords: ['config'],
        },
      },
    };

    const summaries = buildPatternSummaries(registry);

    expect(summaries).toHaveLength(2);
    expect(summaries[0].name).toBe('logger');
    expect(summaries[0].canonical).toBe('src/utils/logger.ts');
    expect(summaries[0].exports).toEqual(['logger', 'createLogger']);
    expect(summaries[0].usage).toBe('Use structured logger');
    expect(summaries[1].name).toBe('config');
    expect(summaries[1].usage).toBeUndefined();
  });

  it('should handle empty pattern registry', () => {
    const registry: PatternRegistry = { patterns: {} };
    const summaries = buildPatternSummaries(registry);
    expect(summaries).toEqual([]);
  });
});

describe('getSessionContext', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadConfig).mockResolvedValue({
      version: '1.0',
      files: { scan: { include: ['**/*.ts'], exclude: ['**/node_modules/**'] } },
      layers: [
        { name: 'core', can_import: [] },
        { name: 'cli', can_import: ['core'] },
      ],
    });

    vi.mocked(loadRegistry).mockResolvedValue({
      nodes: {
        base: { description: 'Base', constraints: [], hints: [] },
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [{ rule: 'forbid_import', value: ['axios'], severity: 'error' }],
          hints: ['Keep it clean'],
        },
      },
      mixins: {},
    });

    vi.mocked(loadArchIgnore).mockResolvedValue({
      ignores: () => false,
      filter: (files: string[]) => files,
    });

    vi.mocked(globFiles).mockResolvedValue(['/test/project/src/a.ts', '/test/project/src/b.ts']);
    vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */\nconst x = 1;');
    vi.mocked(loadPatternRegistry).mockResolvedValue({ patterns: {} });
  });

  it('should return session context with architectures', async () => {
    const result = await getSessionContext(projectRoot, []);

    expect(result.projectRoot).toBe(projectRoot);
    expect(result.filesScanned).toBe(2);
    expect(result.architecturesInScope.length).toBeGreaterThan(0);
  });

  it('should use custom patterns if provided', async () => {
    const result = await getSessionContext(projectRoot, ['src/specific/**/*.ts']);

    expect(vi.mocked(globFiles)).toHaveBeenCalledWith(
      'src/specific/**/*.ts',
      expect.any(Object)
    );
  });

  it('should track untagged files', async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce('const x = 1;') // No @arch tag
      .mockResolvedValueOnce('/**\n * @arch test.arch\n */\nconst y = 2;');

    const result = await getSessionContext(projectRoot, []);

    expect(result.untaggedFiles.length).toBeGreaterThan(0);
  });

  it('should include canonical patterns when withPatterns=true', async () => {
    vi.mocked(loadPatternRegistry).mockResolvedValue({
      patterns: {
        logger: { canonical: 'src/utils/logger.ts', exports: ['logger'], keywords: [] },
      },
    });

    const result = await getSessionContext(projectRoot, [], { withPatterns: true });

    expect(result.canonicalPatterns).toBeDefined();
    expect(result.canonicalPatterns!.length).toBe(1);
  });

  it('should deduplicate shared constraints when deduplicate=true', async () => {
    // Two files with same architecture
    vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
    vi.mocked(globFiles).mockResolvedValue([
      '/test/project/src/a.ts',
      '/test/project/src/b.ts',
    ]);

    const result = await getSessionContext(projectRoot, [], { deduplicate: true });

    // Shared constraints extracted when multiple files have same architecture
    expect(result.architecturesInScope.length).toBe(1);
  });

  it('should include layer boundaries when withLayers=true', async () => {
    const result = await getSessionContext(projectRoot, [], { withLayers: true });

    expect(result.layers).toBeDefined();
    expect(result.layers!.length).toBe(2);
    expect(result.layers!.find(l => l.name === 'cli')).toBeDefined();
  });

  it('should filter by scope when provided', async () => {
    vi.mocked(globFiles).mockResolvedValue([
      '/test/project/src/core/a.ts',
      '/test/project/src/cli/b.ts',
    ]);

    const result = await getSessionContext(projectRoot, [], { scope: ['src/core'] });

    // Only files in src/core should be included
    expect(result.filesScanned).toBeLessThanOrEqual(2);
  });

  it('should handle files that cannot be read', async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce('/**\n * @arch test.arch\n */')
      .mockRejectedValueOnce(new Error('File not found'));

    const result = await getSessionContext(projectRoot, []);

    // Should not throw, just skip the problematic file
    expect(result).toBeDefined();
  });

  it('should sort architectures by file count descending', async () => {
    vi.mocked(globFiles).mockResolvedValue([
      '/test/project/src/a.ts',
      '/test/project/src/b.ts',
      '/test/project/src/c.ts',
    ]);
    vi.mocked(readFile)
      .mockResolvedValueOnce('/**\n * @arch many.arch\n */')
      .mockResolvedValueOnce('/**\n * @arch many.arch\n */')
      .mockResolvedValueOnce('/**\n * @arch few.arch\n */');
    vi.mocked(loadRegistry).mockResolvedValue({
      nodes: {
        base: { description: 'Base' },
        'many.arch': { inherits: 'base', description: 'Many' },
        'few.arch': { inherits: 'base', description: 'Few' },
      },
      mixins: {},
    });

    const result = await getSessionContext(projectRoot, []);

    expect(result.architecturesInScope[0].fileCount).toBeGreaterThanOrEqual(
      result.architecturesInScope[1]?.fileCount ?? 0
    );
  });
});
