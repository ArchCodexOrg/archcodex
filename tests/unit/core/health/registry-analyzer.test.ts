/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.core.domain.constraint
 * @intent:tested
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
    } as any);

    const result = await analyzer.analyze(
      ['archcodex.core.engine'], // Only core.engine directly used
      [{ archId: 'archcodex.core.engine', fileCount: 5 }],
      new Map(),
      { similarityThreshold: 0.8, maxInheritanceDepth: 4, lowUsageThreshold: 2 }
    );

    // archcodex.core should be considered "used" because core.engine inherits from it
    expect(result.unusedArchIds).not.toContain('archcodex.core');
  });
});
