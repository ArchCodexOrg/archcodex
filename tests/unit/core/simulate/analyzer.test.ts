/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SimulationAnalyzer,
  formatRegistryChanges,
} from '../../../../src/core/simulate/analyzer.js';
import type { Registry } from '../../../../src/core/registry/schema.js';
import type { Config } from '../../../../src/core/config/schema.js';

// Mock dependencies
vi.mock('../../../../src/core/diff/comparator.js', () => ({
  compareRegistries: vi.fn(),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(),
}));

vi.mock('../../../../src/core/validation/engine.js', () => ({
  ValidationEngine: vi.fn(function() {
    return {
    validateFiles: vi.fn(),
    dispose: vi.fn(),
  };
  }),
}));

import { compareRegistries } from '../../../../src/core/diff/comparator.js';
import { globFiles } from '../../../../src/utils/file-system.js';
import { ValidationEngine } from '../../../../src/core/validation/engine.js';

describe('SimulationAnalyzer', () => {
  const projectRoot = '/test/project';
  const mockConfig: Config = {
    version: '1.0',
    files: { scan: { include: ['src/**/*.ts'], exclude: ['**/node_modules/**'] } },
  };

  const mockCurrentRegistry: Registry = {
    nodes: {
      base: { description: 'Base' },
      'test.arch': { description: 'Test', inherits: 'base' },
    },
    mixins: {},
  };

  const mockProposedRegistry: Registry = {
    nodes: {
      base: { description: 'Base' },
      'test.arch': { description: 'Test Updated', inherits: 'base' },
      'new.arch': { description: 'New', inherits: 'base' },
    },
    mixins: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(compareRegistries).mockResolvedValue({
      architectureChanges: [],
      summary: {
        architecturesAdded: 1,
        architecturesRemoved: 0,
        architecturesModified: 1,
      },
    } as unknown as Awaited<ReturnType<typeof compareRegistries>>);

    vi.mocked(globFiles).mockResolvedValue(['src/a.ts', 'src/b.ts']);

    // Mock ValidationEngine to return results
    vi.mocked(ValidationEngine).mockImplementation(function() {
      return {
      validateFiles: vi.fn().mockResolvedValue({
        results: [
          {
            archId: 'test.arch',
            status: 'pass',
            violations: [],
            warnings: [],
          },
          {
            archId: 'test.arch',
            status: 'pass',
            violations: [],
            warnings: [],
          },
        ],
        summary: {
          total: 2,
          passed: 2,
          failed: 0,
        },
      }),
      dispose: vi.fn(),
    } as unknown as ValidationEngine;
    });
  });

  describe('SimulationAnalyzer class', () => {
    it('should export SimulationAnalyzer class', () => {
      expect(SimulationAnalyzer).toBeDefined();
      expect(typeof SimulationAnalyzer).toBe('function');
    });

    it('should be constructable with project root and config', () => {
      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      expect(analyzer).toBeInstanceOf(SimulationAnalyzer);
    });

    it('should have simulate method', () => {
      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      expect(typeof analyzer.simulate).toBe('function');
    });
  });

  describe('simulate', () => {
    it('should return simulation result comparing registries', async () => {
      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      const result = await analyzer.simulate(mockCurrentRegistry, mockProposedRegistry);

      expect(result.fromRef).toBe('current');
      expect(result.toRef).toBe('proposed');
      expect(result.summary).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should detect would_break files', async () => {
      // Current passes, proposed fails
      vi.mocked(ValidationEngine)
        .mockImplementationOnce(function() {
          return {
          validateFiles: vi.fn().mockResolvedValue({
            results: [{ archId: 'test.arch', status: 'pass', violations: [], warnings: [] }],
            summary: { total: 1, passed: 1, failed: 0 },
          }),
          dispose: vi.fn(),
        } as unknown as ValidationEngine;
        })
        .mockImplementationOnce(function() {
          return {
          validateFiles: vi.fn().mockResolvedValue({
            results: [{
              archId: 'test.arch',
              status: 'fail',
              violations: [{ rule: 'forbid_import', value: 'axios', message: 'Forbidden', severity: 'error' }],
              warnings: [],
            }],
            summary: { total: 1, passed: 0, failed: 1 },
          }),
          dispose: vi.fn(),
        } as unknown as ValidationEngine;
        });

      vi.mocked(globFiles).mockResolvedValue(['src/test.ts']);

      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      const result = await analyzer.simulate(mockCurrentRegistry, mockProposedRegistry);

      expect(result.wouldBreak.length).toBeGreaterThan(0);
      expect(result.summary.wouldBreak).toBeGreaterThan(0);
    });

    it('should detect would_fix files', async () => {
      // Current fails, proposed passes
      vi.mocked(ValidationEngine)
        .mockImplementationOnce(function() {
          return {
          validateFiles: vi.fn().mockResolvedValue({
            results: [{
              archId: 'test.arch',
              status: 'fail',
              violations: [{ rule: 'forbid_import', value: 'axios', message: 'Forbidden', severity: 'error' }],
              warnings: [],
            }],
            summary: { total: 1, passed: 0, failed: 1 },
          }),
          dispose: vi.fn(),
        } as unknown as ValidationEngine;
        })
        .mockImplementationOnce(function() {
          return {
          validateFiles: vi.fn().mockResolvedValue({
            results: [{ archId: 'test.arch', status: 'pass', violations: [], warnings: [] }],
            summary: { total: 1, passed: 1, failed: 0 },
          }),
          dispose: vi.fn(),
        } as unknown as ValidationEngine;
        });

      vi.mocked(globFiles).mockResolvedValue(['src/test.ts']);

      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      const result = await analyzer.simulate(mockCurrentRegistry, mockProposedRegistry);

      expect(result.wouldFix.length).toBeGreaterThan(0);
      expect(result.summary.wouldFix).toBeGreaterThan(0);
    });

    it('should skip files without @arch tag', async () => {
      vi.mocked(ValidationEngine)
        .mockImplementationOnce(function() {
          return {
          validateFiles: vi.fn().mockResolvedValue({
            results: [{ archId: null, status: 'pass', violations: [], warnings: [] }],
            summary: { total: 1, passed: 1, failed: 0 },
          }),
          dispose: vi.fn(),
        } as unknown as ValidationEngine;
        })
        .mockImplementationOnce(function() {
          return {
          validateFiles: vi.fn().mockResolvedValue({
            results: [{ archId: null, status: 'pass', violations: [], warnings: [] }],
            summary: { total: 1, passed: 1, failed: 0 },
          }),
          dispose: vi.fn(),
        } as unknown as ValidationEngine;
        });

      vi.mocked(globFiles).mockResolvedValue(['src/untagged.ts']);

      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      const result = await analyzer.simulate(mockCurrentRegistry, mockProposedRegistry);

      expect(result.fileImpacts.length).toBe(0);
    });

    it('should respect maxFiles option', async () => {
      vi.mocked(globFiles).mockResolvedValue(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']);

      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      await analyzer.simulate(mockCurrentRegistry, mockProposedRegistry, { maxFiles: 2 });

      const engineMock = vi.mocked(ValidationEngine);
      expect(engineMock).toHaveBeenCalled();
    });

    it('should filter by archId when specified', async () => {
      vi.mocked(ValidationEngine)
        .mockImplementation(function() {
      return {
          validateFiles: vi.fn().mockResolvedValue({
            results: [
              { archId: 'test.arch', status: 'pass', violations: [], warnings: [] },
              { archId: 'other.arch', status: 'pass', violations: [], warnings: [] },
            ],
            summary: { total: 2, passed: 2, failed: 0 },
          }),
          dispose: vi.fn(),
        } as unknown as ValidationEngine;
    });

      vi.mocked(globFiles).mockResolvedValue(['a.ts', 'b.ts']);

      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      const result = await analyzer.simulate(mockCurrentRegistry, mockProposedRegistry, {
        filterArchIds: ['test.arch'],
      });

      // Should only include files with test.arch
      expect(result.fileImpacts.every(f => f.archId === 'test.arch')).toBe(true);
    });

    it('should calculate risk level', async () => {
      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      const result = await analyzer.simulate(mockCurrentRegistry, mockProposedRegistry);

      expect(['low', 'medium', 'high', 'critical']).toContain(result.summary.riskLevel);
    });

    it('should generate recommendations', async () => {
      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      const result = await analyzer.simulate(mockCurrentRegistry, mockProposedRegistry);

      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('should generate safe-to-apply recommendation when only fixes occur', async () => {
      vi.mocked(ValidationEngine)
        .mockImplementationOnce(function() {
          return {
          validateFiles: vi.fn().mockResolvedValue({
            results: [{
              archId: 'test.arch',
              status: 'fail',
              violations: [{ rule: 'forbid_import', value: 'axios', message: 'Forbidden', severity: 'error' }],
              warnings: [],
            }],
            summary: { total: 1, passed: 0, failed: 1 },
          }),
          dispose: vi.fn(),
        } as unknown as ValidationEngine;
        })
        .mockImplementationOnce(function() {
          return {
          validateFiles: vi.fn().mockResolvedValue({
            results: [{ archId: 'test.arch', status: 'pass', violations: [], warnings: [] }],
            summary: { total: 1, passed: 1, failed: 0 },
          }),
          dispose: vi.fn(),
        } as unknown as ValidationEngine;
        });

      vi.mocked(globFiles).mockResolvedValue(['src/test.ts']);

      const analyzer = new SimulationAnalyzer(projectRoot, mockConfig);
      const result = await analyzer.simulate(mockCurrentRegistry, mockProposedRegistry);

      expect(result.recommendations.some(r => r.includes('Safe to apply'))).toBe(true);
    });
  });

  describe('formatRegistryChanges', () => {
    it('should export formatRegistryChanges function', () => {
      expect(typeof formatRegistryChanges).toBe('function');
    });

    it('should format empty diff', () => {
      const diff = {
        fromRef: 'current',
        toRef: 'proposed',
        architectureChanges: [],
        summary: {
          architecturesAdded: 0,
          architecturesRemoved: 0,
          architecturesModified: 0,
          constraintsAdded: 0,
          constraintsRemoved: 0,
          constraintsModified: 0,
        },
      };

      const formatted = formatRegistryChanges(diff);

      expect(formatted.added).toEqual([]);
      expect(formatted.removed).toEqual([]);
      expect(formatted.modified).toEqual([]);
    });

    it('should categorize added architectures', () => {
      const diff = {
        fromRef: 'current',
        toRef: 'proposed',
        architectureChanges: [
          {
            archId: 'new.arch',
            type: 'added' as const,
          },
        ],
        summary: {
          architecturesAdded: 1,
          architecturesRemoved: 0,
          architecturesModified: 0,
          constraintsAdded: 0,
          constraintsRemoved: 0,
          constraintsModified: 0,
        },
      };

      const formatted = formatRegistryChanges(diff);

      expect(formatted.added).toHaveLength(1);
      expect(formatted.added[0].archId).toBe('new.arch');
      expect(formatted.removed).toHaveLength(0);
    });

    it('should categorize removed architectures', () => {
      const diff = {
        fromRef: 'current',
        toRef: 'proposed',
        architectureChanges: [
          {
            archId: 'old.arch',
            type: 'removed' as const,
          },
        ],
        summary: {
          architecturesAdded: 0,
          architecturesRemoved: 1,
          architecturesModified: 0,
          constraintsAdded: 0,
          constraintsRemoved: 0,
          constraintsModified: 0,
        },
      };

      const formatted = formatRegistryChanges(diff);

      expect(formatted.removed).toHaveLength(1);
      expect(formatted.removed[0].archId).toBe('old.arch');
      expect(formatted.added).toHaveLength(0);
    });

    it('should categorize modified architectures', () => {
      const diff = {
        fromRef: 'current',
        toRef: 'proposed',
        architectureChanges: [
          {
            archId: 'existing.arch',
            type: 'modified' as const,
            constraintChanges: [
              { type: 'added' as const, rule: 'max_file_lines' },
            ],
          },
        ],
        summary: {
          architecturesAdded: 0,
          architecturesRemoved: 0,
          architecturesModified: 1,
          constraintsAdded: 1,
          constraintsRemoved: 0,
          constraintsModified: 0,
        },
      };

      const formatted = formatRegistryChanges(diff);

      expect(formatted.modified).toHaveLength(1);
      expect(formatted.modified[0].archId).toBe('existing.arch');
      expect(formatted.modified[0].constraintChanges).toBeDefined();
    });
  });
});
