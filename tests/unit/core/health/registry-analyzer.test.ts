/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegistryAnalyzer } from '../../../../src/core/health/registry-analyzer.js';
import type { ArchUsage } from '../../../../src/core/health/types.js';

// Mock registry loader
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
  listArchitectureIds: vi.fn(),
}));

// Mock bloat detectors
vi.mock('../../../../src/core/health/bloat-detector.js', () => ({
  detectSimilarArchitectures: vi.fn().mockReturnValue([]),
  detectRedundantArchitectures: vi.fn().mockReturnValue([]),
  detectDeepInheritance: vi.fn().mockReturnValue([]),
  detectLowUsageArchitectures: vi.fn().mockReturnValue([]),
  detectSingletonViolations: vi.fn().mockReturnValue([]),
}));

import { loadRegistry, listArchitectureIds } from '../../../../src/core/registry/loader.js';

const mockLoadRegistry = vi.mocked(loadRegistry);
const mockListArchitectureIds = vi.mocked(listArchitectureIds);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RegistryAnalyzer', () => {
  it('analyzes registry health metrics', async () => {
    const analyzer = new RegistryAnalyzer('/project');

    mockListArchitectureIds.mockReturnValue([
      'archcodex.core.engine',
      'archcodex.core.domain',
      'archcodex.cli.command',
      'archcodex.util',
    ]);

    mockLoadRegistry.mockResolvedValue({
      nodes: {
        'archcodex.core.engine': { inherits: 'base' },
        'archcodex.core.domain': { inherits: 'archcodex.core' },
        'archcodex.cli.command': { inherits: 'archcodex.cli' },
        'archcodex.util': { inherits: 'base' },
      },
      architectures: {},
    } as any);

    const usedArchIds = ['archcodex.core.engine', 'archcodex.cli.command'];
    const archUsage: ArchUsage[] = [
      { archId: 'archcodex.core.engine', fileCount: 10 },
      { archId: 'archcodex.cli.command', fileCount: 5 },
    ];
    const filesByArch = new Map();

    const result = await analyzer.analyze(
      usedArchIds,
      archUsage,
      filesByArch,
      {
        similarityThreshold: 0.8,
        maxInheritanceDepth: 4,
        lowUsageThreshold: 2,
        excludeInheritedSimilarity: true,
      }
    );

    expect(result.totalArchitectures).toBe(4);
    expect(result.usedArchitectures).toBe(2);
    expect(result.unusedArchitectures).toBe(2);
    expect(result.usagePercent).toBe(50);
  });

  it('detects unused architectures', async () => {
    const analyzer = new RegistryAnalyzer('/project');

    mockListArchitectureIds.mockReturnValue(['archcodex.core.engine', 'archcodex.unused']);
    mockLoadRegistry.mockResolvedValue({
      nodes: {
        'archcodex.core.engine': {},
        'archcodex.unused': {},
      },
      architectures: {},
    } as any);

    const result = await analyzer.analyze(
      ['archcodex.core.engine'],
      [{ archId: 'archcodex.core.engine', fileCount: 5 }],
      new Map(),
      { similarityThreshold: 0.8, maxInheritanceDepth: 4, lowUsageThreshold: 2 }
    );

    expect(result.unusedArchitectures).toBe(1);
    expect(result.unusedArchIds).toContain('archcodex.unused');
  });

  it('counts inherited architectures as used', async () => {
    const analyzer = new RegistryAnalyzer('/project');

    mockListArchitectureIds.mockReturnValue(['archcodex.core', 'archcodex.core.engine']);
    mockLoadRegistry.mockResolvedValue({
      nodes: {
        'archcodex.core': {},
        'archcodex.core.engine': { inherits: 'archcodex.core' },
      },
      architectures: {},
    } as ReturnType<typeof loadRegistry> extends Promise<infer T> ? T : never);

    const result = await analyzer.analyze(
      ['archcodex.core.engine'], // Only core.engine directly used
      [{ archId: 'archcodex.core.engine', fileCount: 5 }],
      new Map(),
      { similarityThreshold: 0.8, maxInheritanceDepth: 4, lowUsageThreshold: 2 }
    );

    // archcodex.core should be considered "used" because core.engine inherits from it
    expect(result.unusedArchIds).not.toContain('archcodex.core');
  });

  it('calculates 100% usage when totalArchitectures is 0', async () => {
    const analyzer = new RegistryAnalyzer('/project');

    mockListArchitectureIds.mockReturnValue([]);
    mockLoadRegistry.mockResolvedValue({
      nodes: {},
      architectures: {},
    } as ReturnType<typeof loadRegistry> extends Promise<infer T> ? T : never);

    const result = await analyzer.analyze(
      [],
      [],
      new Map(),
      { similarityThreshold: 0.8, maxInheritanceDepth: 4, lowUsageThreshold: 2 }
    );

    expect(result.totalArchitectures).toBe(0);
    expect(result.usagePercent).toBe(100);
    expect(result.unusedArchIds).toEqual([]);
  });

  it('uses preloaded registry when provided', async () => {
    const analyzer = new RegistryAnalyzer('/project');

    const preloaded = {
      nodes: {
        'archcodex.core': {},
        'archcodex.cli': {},
      },
      architectures: {},
    } as ReturnType<typeof loadRegistry> extends Promise<infer T> ? T : never;

    mockListArchitectureIds.mockReturnValue(['archcodex.core', 'archcodex.cli']);

    const result = await analyzer.analyze(
      ['archcodex.core'],
      [{ archId: 'archcodex.core', fileCount: 3 }],
      new Map(),
      { similarityThreshold: 0.8, maxInheritanceDepth: 4, lowUsageThreshold: 2 },
      preloaded
    );

    // loadRegistry should NOT have been called since we passed preloaded
    expect(mockLoadRegistry).not.toHaveBeenCalled();
    expect(result.totalArchitectures).toBe(2);
    expect(result.unusedArchIds).toContain('archcodex.cli');
  });

  it('returns undefined for optional bloat arrays when detectors return empty', async () => {
    const analyzer = new RegistryAnalyzer('/project');

    mockListArchitectureIds.mockReturnValue(['archcodex.core']);
    mockLoadRegistry.mockResolvedValue({
      nodes: { 'archcodex.core': {} },
      architectures: {},
    } as ReturnType<typeof loadRegistry> extends Promise<infer T> ? T : never);

    const result = await analyzer.analyze(
      ['archcodex.core'],
      [{ archId: 'archcodex.core', fileCount: 5 }],
      new Map(),
      { similarityThreshold: 0.8, maxInheritanceDepth: 4, lowUsageThreshold: 2 }
    );

    // All bloat detectors return [], so optional fields should be undefined
    expect(result.similarArchitectures).toBeUndefined();
    expect(result.redundantArchitectures).toBeUndefined();
    expect(result.deepInheritance).toBeUndefined();
    expect(result.lowUsageArchitectures).toBeUndefined();
    expect(result.singletonViolations).toBeUndefined();
  });

  it('returns bloat arrays when detectors find issues', async () => {
    // Import and override the bloat detector mocks
    const bloatMod = await import('../../../../src/core/health/bloat-detector.js');
    vi.mocked(bloatMod.detectSimilarArchitectures).mockReturnValueOnce([
      { archA: 'a', archB: 'b', similarity: 0.9, sharedConstraints: 5 },
    ]);

    const analyzer = new RegistryAnalyzer('/project');

    mockListArchitectureIds.mockReturnValue(['a', 'b']);
    mockLoadRegistry.mockResolvedValue({
      nodes: { a: {}, b: {} },
      architectures: {},
    } as ReturnType<typeof loadRegistry> extends Promise<infer T> ? T : never);

    const result = await analyzer.analyze(
      ['a', 'b'],
      [{ archId: 'a', fileCount: 5 }, { archId: 'b', fileCount: 3 }],
      new Map(),
      { similarityThreshold: 0.8, maxInheritanceDepth: 4, lowUsageThreshold: 2 }
    );

    expect(result.similarArchitectures).toBeDefined();
    expect(result.similarArchitectures!.length).toBe(1);
  });

  it('correctly identifies multiple inheritance chains as used', async () => {
    const analyzer = new RegistryAnalyzer('/project');

    mockListArchitectureIds.mockReturnValue([
      'base',
      'archcodex.core',
      'archcodex.core.engine',
      'archcodex.cli',
    ]);
    mockLoadRegistry.mockResolvedValue({
      nodes: {
        base: {},
        'archcodex.core': { inherits: 'base' },
        'archcodex.core.engine': { inherits: 'archcodex.core' },
        'archcodex.cli': { inherits: 'base' },
      },
      architectures: {},
    } as ReturnType<typeof loadRegistry> extends Promise<infer T> ? T : never);

    const result = await analyzer.analyze(
      ['archcodex.core.engine'], // Only leaf node used directly
      [{ archId: 'archcodex.core.engine', fileCount: 10 }],
      new Map(),
      { similarityThreshold: 0.8, maxInheritanceDepth: 4, lowUsageThreshold: 2 }
    );

    // base and archcodex.core should be used (inherited), archcodex.cli unused
    expect(result.unusedArchIds).toContain('archcodex.cli');
    expect(result.unusedArchIds).not.toContain('base');
    expect(result.unusedArchIds).not.toContain('archcodex.core');
  });
});
