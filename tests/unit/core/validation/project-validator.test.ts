/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for ProjectValidator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../../src/core/imports/analyzer.js', () => ({
  ProjectAnalyzer: vi.fn(function() {
    return {
    buildImportGraph: vi.fn().mockResolvedValue({
      graph: { nodes: new Map() },
      cycles: [],
      buildTimeMs: 10,
    }),
    getContentCache: vi.fn().mockReturnValue(new Map()),
    getImporters: vi.fn().mockReturnValue([]),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/packages/validator.js', () => ({
  PackageBoundaryValidator: vi.fn(function() {
    return {
    validate: vi.fn().mockReturnValue({
      passed: true,
      violations: [],
      summary: { filesChecked: 0, importsAnalyzed: 0, violationCount: 0 },
    }),
  };
  }),
}));

vi.mock('../../../../src/core/layers/validator.js', () => ({
  LayerBoundaryValidator: vi.fn(function() {
    return {
    validate: vi.fn().mockReturnValue({
      passed: true,
      violations: [],
    }),
  };
  }),
}));

vi.mock('../../../../src/core/coverage/validator.js', () => ({
  CoverageValidator: vi.fn(function() {
    return {
    validateAll: vi.fn().mockResolvedValue(new Map()),
    setContentCache: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/validation/engine.js', () => ({
  ValidationEngine: vi.fn(function() {
    return {
    validateFiles: vi.fn().mockResolvedValue({
      results: [],
      summary: {
        total: 0, passed: 0, failed: 0, warned: 0,
        totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
      },
    }),
    setContentCache: vi.fn(),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/similarity/analyzer.js', () => ({
  SimilarityAnalyzer: vi.fn(function() {
    return {
    extractSignature: vi.fn().mockResolvedValue({
      file: 'test.ts',
      archId: 'test.arch',
      exports: [],
      methods: [],
      classes: [],
      importModules: [],
      lineCount: 10,
    }),
    findSimilar: vi.fn().mockResolvedValue([]),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn().mockImplementation((registry: Record<string, { nodes: Record<string, { constraints?: unknown[]; mixins?: string[] }> ; mixins: Record<string, { constraints?: unknown[] }> }>, archId: string) => {
    const node = registry.nodes[archId];
    if (!node) {
      throw new Error(`Architecture '${archId}' not found in registry`);
    }
    // Collect constraints from the node itself plus any mixins
    const constraints = [...(node.constraints ?? [])];
    if (node.mixins) {
      for (const mixinId of node.mixins) {
        const mixin = registry.mixins[mixinId];
        if (mixin?.constraints) {
          constraints.push(...mixin.constraints);
        }
      }
    }
    return {
      architecture: {
        constraints,
        hints: [],
        pointers: [],
      },
      chain: [archId],
      conflicts: [],
    };
  }),
}));

vi.mock('../../../../src/core/constraints/index.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as Record<string, unknown>),
    getValidator: vi.fn().mockReturnValue(undefined),
  };
});

vi.mock('../../../../src/utils/file-system.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as Record<string, unknown>),
    basename: vi.fn((p: string) => {
      const parts = p.split('/');
      return parts[parts.length - 1];
    }),
  };
});

import { ProjectValidator } from '../../../../src/core/validation/project-validator.js';
import type { Config } from '../../../../src/core/config/schema.js';
import type { Registry } from '../../../../src/core/registry/schema.js';

describe('ProjectValidator', () => {
  const mockConfig: Config = {
    version: '1.0',
    registry: '.arch/registry.yaml',
    files: { untagged: { policy: 'warn', require_in: [], exempt: [] } },
    validation: {
      fail_on_warning: false,
      max_overrides_per_file: 3,
      fail_on_expired_override: true,
      exit_codes: { success: 0, error: 1, warning_only: 0 },
    },
    hydration: { format: 'terse', include_why: true, show_inheritance: false, max_header_tokens: 500 },
    pointers: { base_paths: { arch: '.arch/docs', code: '.', template: '.arch/templates' }, default_extension: '.md' },
    overrides: { required_fields: ['reason'], optional_fields: ['expires', 'ticket', 'approved_by'], warn_no_expiry: true, max_expiry_days: 180 },
    llm: { default_provider: 'prompt', providers: {} },
    languages: {
      typescript: { enabled: true, skip_constraints: [], non_applicable_constraints: 'skip' },
      javascript: { enabled: true, skip_constraints: [], non_applicable_constraints: 'skip' },
      python: { enabled: false, skip_constraints: [], non_applicable_constraints: 'skip' },
      go: { enabled: false, skip_constraints: [], non_applicable_constraints: 'skip' },
      java: { enabled: false, skip_constraints: [], non_applicable_constraints: 'skip' },
    },
    packages: [],
  };

  const mockRegistry: Registry = {
    nodes: {
      base: { description: 'Base', rationale: 'Base arch' },
    },
    mixins: {},
  };

  describe('constructor', () => {
    it('should create validator without packages', () => {
      const validator = new ProjectValidator('/project', mockConfig, mockRegistry);
      expect(validator).toBeDefined();
    });

    it('should create validator with packages configured', () => {
      const configWithPackages = {
        ...mockConfig,
        packages: [
          { path: 'packages/core', can_import: [] },
        ],
      };
      const validator = new ProjectValidator('/project', configWithPackages, mockRegistry);
      expect(validator).toBeDefined();
    });
  });

  describe('validateProject', () => {
    it('should return batch validation result', async () => {
      const validator = new ProjectValidator('/project', mockConfig, mockRegistry);
      const result = await validator.validateProject();

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('projectStats');
      expect(result.projectStats).toHaveProperty('graphBuildTimeMs');
      expect(result.projectStats).toHaveProperty('filesInGraph');
      expect(result.projectStats).toHaveProperty('cyclesDetected');
    });
  });

  describe('validateFiles', () => {
    it('should validate specific files with project context', async () => {
      const validator = new ProjectValidator('/project', mockConfig, mockRegistry);
      const result = await validator.validateFiles(['src/test.ts']);

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('projectStats');
    });
  });

  describe('coverage validation integration', () => {
    it('should include coverageGaps in result when coverage constraint exists', async () => {
      // Registry with a require_coverage constraint
      const registryWithCoverage: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'events': {
            description: 'Events',
            rationale: 'Event definitions',
            constraints: [
              {
                rule: 'require_coverage',
                value: {
                  source_type: 'export_names',
                  source_pattern: '*Event',
                  in_files: 'src/events/**/*.ts',
                  target_pattern: 'handle${value}',
                  in_target_files: 'src/handlers/**/*.ts',
                },
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      // Mock CoverageValidator to return gaps
      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      const mockValidateAll = vi.fn().mockResolvedValue(
        new Map([
          ['events:*Event', {
            totalSources: 3,
            coveredSources: 2,
            coveragePercent: 66.67,
            gaps: [
              {
                value: 'UserDeletedEvent',
                sourceFile: 'src/events/user.ts',
                sourceLine: 10,
                expectedIn: 'src/handlers/**/*.ts',
                targetPattern: 'handleUserDeletedEvent',
              },
            ],
          }],
        ])
      );
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: mockValidateAll,
        setContentCache: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithCoverage);
      const result = await validator.validateProject();

      expect(result).toHaveProperty('coverageGaps');
      expect(result.coverageGaps).toHaveLength(1);
      expect(result.coverageGaps![0].value).toBe('UserDeletedEvent');
    });

    it('should include coverageStats in result when coverage constraint exists', async () => {
      const registryWithCoverage: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'events': {
            description: 'Events',
            rationale: 'Event definitions',
            constraints: [
              {
                rule: 'require_coverage',
                value: {
                  source_type: 'export_names',
                  source_pattern: '*Event',
                  in_files: 'src/events/**/*.ts',
                  target_pattern: 'handle${value}',
                  in_target_files: 'src/handlers/**/*.ts',
                },
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      // Mock CoverageValidator to return stats
      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: vi.fn().mockResolvedValue(
          new Map([
            ['events:*Event', {
              totalSources: 5,
              coveredSources: 5,
              coveragePercent: 100,
              gaps: [],
            }],
          ])
        ),
        setContentCache: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithCoverage);
      const result = await validator.validateProject();

      expect(result).toHaveProperty('coverageStats');
      expect(result.coverageStats).toEqual({
        totalConstraints: 1,
        totalSources: 5,
        coveredSources: 5,
        coveragePercent: 100,
      });
    });

    it('should skip coverage validation when require_coverage is in skipRules', async () => {
      const registryWithCoverage: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'events': {
            description: 'Events',
            rationale: 'Event definitions',
            constraints: [
              {
                rule: 'require_coverage',
                value: {
                  source_type: 'export_names',
                  source_pattern: '*Event',
                  in_files: 'src/events/**/*.ts',
                  target_pattern: 'handle${value}',
                  in_target_files: 'src/handlers/**/*.ts',
                },
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      const mockValidateAll = vi.fn();
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: mockValidateAll,
        setContentCache: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithCoverage);
      const result = await validator.validateProject({ skipRules: ['require_coverage'] });

      expect(mockValidateAll).not.toHaveBeenCalled();
      expect(result.coverageGaps).toBeUndefined();
      expect(result.coverageStats).toBeUndefined();
    });

    it('should add coverage gaps to totalErrors in summary', async () => {
      const registryWithCoverage: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'events': {
            description: 'Events',
            rationale: 'Event definitions',
            constraints: [
              {
                rule: 'require_coverage',
                value: {
                  source_type: 'export_names',
                  source_pattern: '*Event',
                  in_files: 'src/events/**/*.ts',
                  target_pattern: 'handle${value}',
                  in_target_files: 'src/handlers/**/*.ts',
                },
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      // Mock CoverageValidator to return gaps
      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: vi.fn().mockResolvedValue(
          new Map([
            ['events:*Event', {
              totalSources: 3,
              coveredSources: 1,
              coveragePercent: 33.33,
              gaps: [
                { value: 'EventA', sourceFile: 'a.ts', sourceLine: 1, expectedIn: 'b.ts', targetPattern: 'handleEventA' },
                { value: 'EventB', sourceFile: 'a.ts', sourceLine: 2, expectedIn: 'b.ts', targetPattern: 'handleEventB' },
              ],
            }],
          ])
        ),
        setContentCache: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithCoverage);
      const result = await validator.validateProject();

      // 2 coverage gaps should be added to totalErrors
      expect(result.summary.totalErrors).toBe(2);
    });
  });

  describe('similarity validation integration (max_similarity)', () => {
    it('should include similarityViolations in result when max_similarity constraint exists', async () => {
      const registryWithSimilarity: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            constraints: [
              {
                rule: 'max_similarity',
                value: 0.8,
                severity: 'warning',
                why: 'DRY - avoid code duplication',
              },
            ],
          },
        },
        mixins: {},
      };

      // Mock SimilarityAnalyzer to return similar files
      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: vi.fn().mockResolvedValue({
          file: 'test.ts',
          archId: 'service',
          exports: ['ServiceA'],
          methods: ['process', 'validate'],
          classes: ['ServiceA'],
          importModules: ['lodash'],
          lineCount: 50,
        }),
        findSimilar: vi.fn().mockResolvedValue([
          {
            file: 'src/other-service.ts',
            archId: 'service',
            similarity: 0.85,
            matchedAspects: [{ type: 'methods', items: ['process', 'validate'] }],
          },
        ]),
        dispose: vi.fn(),
      };
    });

      // Also need to update ProjectAnalyzer mock to return files
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/service-a.ts', { imports: [] }],
              ['/project/src/service-b.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 10,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithSimilarity);
      const result = await validator.validateProject();

      expect(result).toHaveProperty('similarityViolations');
      expect(result.similarityViolations!.length).toBeGreaterThan(0);
      // Check the first violation
      const violation = result.similarityViolations![0];
      expect(violation.similarity).toBe(0.85);
      expect(violation.threshold).toBe(0.8);
      expect(violation.severity).toBe('warning');
    });

    it('should skip similarity validation when max_similarity is in skipRules', async () => {
      const registryWithSimilarity: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            constraints: [
              {
                rule: 'max_similarity',
                value: 0.8,
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      const mockFindSimilar = vi.fn();
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: vi.fn(),
        findSimilar: mockFindSimilar,
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithSimilarity);
      const result = await validator.validateProject({ skipRules: ['max_similarity'] });

      expect(mockFindSimilar).not.toHaveBeenCalled();
      expect(result.similarityViolations).toBeUndefined();
    });

    it('should add similarity violations to totalErrors/totalWarnings in summary', async () => {
      const registryWithSimilarity: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            constraints: [
              {
                rule: 'max_similarity',
                value: 0.7,
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      // Mock SimilarityAnalyzer to return multiple similar file pairs
      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      let callCount = 0;
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            file: `service-${callCount}.ts`,
            archId: 'service',
            exports: [],
            methods: ['process'],
            classes: [],
            importModules: [],
            lineCount: 30,
          });
        }),
        findSimilar: vi.fn().mockResolvedValue([
          {
            file: 'src/other-service.ts',
            archId: 'service',
            similarity: 0.85,
            matchedAspects: [],
          },
        ]),
        dispose: vi.fn(),
      };
    });

      // Mock ProjectAnalyzer to return 2 files
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/service-a.ts', { imports: [] }],
              ['/project/src/service-b.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 10,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithSimilarity);
      const result = await validator.validateProject();

      // Similarity violations should be added to error count
      expect(result.summary.totalErrors).toBeGreaterThanOrEqual(1);
    });

    it('should use default threshold of 0.8 when value is not a number', async () => {
      const registryWithInvalidSimilarity: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            constraints: [
              {
                rule: 'max_similarity',
                value: 'invalid' as unknown as number, // Invalid value
                severity: 'warning',
              },
            ],
          },
        },
        mixins: {},
      };

      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      const mockFindSimilar = vi.fn().mockResolvedValue([
        {
          file: 'src/other.ts',
          archId: 'service',
          similarity: 0.85,
          matchedAspects: [],
        },
      ]);
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: vi.fn().mockResolvedValue({
          file: 'test.ts',
          archId: 'service',
          exports: [],
          methods: [],
          classes: [],
          importModules: [],
          lineCount: 10,
        }),
        findSimilar: mockFindSimilar,
        dispose: vi.fn(),
      };
    });

      // Mock ProjectAnalyzer
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/a.ts', { imports: [] }],
              ['/project/src/b.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 10,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithInvalidSimilarity);
      const result = await validator.validateProject();

      // Should still work with default threshold
      if (mockFindSimilar.mock.calls.length > 0) {
        expect(mockFindSimilar).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({ threshold: 0.8 }) // Default threshold
        );
      }
    });

    it('should skip similarity check when fewer than 2 files share the same architecture', async () => {
      const registryWithSimilarity: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            constraints: [
              {
                rule: 'max_similarity',
                value: 0.8,
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      const mockFindSimilar = vi.fn();
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: vi.fn().mockResolvedValue({
          file: 'test.ts',
          archId: 'service',
          exports: [],
          methods: [],
          classes: [],
          importModules: [],
          lineCount: 10,
        }),
        findSimilar: mockFindSimilar,
        dispose: vi.fn(),
      };
    });

      // Only 1 file in the graph - too few for similarity comparison
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/only-one.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithSimilarity);
      const result = await validator.validateProject();

      // findSimilar should never be called since there's only 1 file with the architecture
      expect(mockFindSimilar).not.toHaveBeenCalled();
      expect(result.similarityViolations).toBeUndefined();
    });

    it('should continue processing when extractSignature throws for some files', async () => {
      const registryWithSimilarity: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            constraints: [
              {
                rule: 'max_similarity',
                value: 0.8,
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      let extractCallCount = 0;
      const mockFindSimilar = vi.fn().mockResolvedValue([]);
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: vi.fn().mockImplementation(() => {
          extractCallCount++;
          // First file throws, second and third succeed
          if (extractCallCount === 1) {
            return Promise.reject(new Error('Parse error'));
          }
          return Promise.resolve({
            file: `service-${extractCallCount}.ts`,
            archId: 'service',
            exports: [],
            methods: [],
            classes: [],
            importModules: [],
            lineCount: 10,
          });
        }),
        findSimilar: mockFindSimilar,
        dispose: vi.fn(),
      };
    });

      // 3 files in graph, 1 will fail extraction
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/a.ts', { imports: [] }],
              ['/project/src/b.ts', { imports: [] }],
              ['/project/src/c.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 10,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithSimilarity);
      // Should not throw - failed extractions are silently skipped
      const result = await validator.validateProject();

      expect(result).toHaveProperty('projectStats');
      // 2 files succeeded, so findSimilar should still be called for remaining files
      expect(mockFindSimilar).toHaveBeenCalled();
    });

    it('should add warning-severity similarity violations to totalWarnings not totalErrors', async () => {
      const registryWithSimilarity: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            constraints: [
              {
                rule: 'max_similarity',
                value: 0.7,
                severity: 'warning',
                why: 'DRY suggestion',
              },
            ],
          },
        },
        mixins: {},
      };

      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: vi.fn().mockResolvedValue({
          file: 'test.ts',
          archId: 'service',
          exports: [],
          methods: ['doStuff'],
          classes: [],
          importModules: [],
          lineCount: 20,
        }),
        findSimilar: vi.fn().mockResolvedValue([
          {
            file: 'src/other-service.ts',
            archId: 'service',
            similarity: 0.9,
            matchedAspects: [],
          },
        ]),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/svc-a.ts', { imports: [] }],
              ['/project/src/svc-b.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 10,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithSimilarity);
      const result = await validator.validateProject();

      // Warning-severity violations should increase totalWarnings, not totalErrors
      expect(result.summary.totalWarnings).toBeGreaterThanOrEqual(1);
      expect(result.summary.totalErrors).toBe(0);
      expect(result.similarityViolations).toBeDefined();
      expect(result.similarityViolations![0].severity).toBe('warning');
    });
  });

  describe('dispose', () => {
    it('should call dispose on engine and analyzer', async () => {
      const mockEngineDispose = vi.fn();
      const mockAnalyzerDispose = vi.fn();

      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [],
          summary: {
            total: 0, passed: 0, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: mockEngineDispose,
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: { nodes: new Map() },
          cycles: [],
          buildTimeMs: 10,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: mockAnalyzerDispose,
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, mockRegistry);
      validator.dispose();

      expect(mockEngineDispose).toHaveBeenCalled();
      expect(mockAnalyzerDispose).toHaveBeenCalled();
    });
  });

  describe('constructor with layers', () => {
    it('should create layer boundary validator when layers are configured', () => {
      const configWithLayers = {
        ...mockConfig,
        layers: [
          { name: 'core', can_import: [] },
          { name: 'ui', can_import: ['core'] },
        ],
      };
      const validator = new ProjectValidator('/project', configWithLayers, mockRegistry);
      expect(validator).toBeDefined();
    });
  });

  describe('validateFiles with prebuilt options', () => {
    it('should use prebuilt graph when provided', async () => {
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      const mockBuildImportGraph = vi.fn();
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: mockBuildImportGraph,
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, mockRegistry);

      const prebuiltGraph = {
        graph: {
          nodes: new Map([
            ['/project/src/file.ts', { imports: [] }],
          ]),
        },
        cycles: [],
        buildTimeMs: 0,
      };

      const result = await validator.validateFiles(['src/file.ts'], {
        prebuiltGraph: prebuiltGraph as unknown as import('../../../../src/core/imports/types.js').ImportGraphResult,
      });

      // buildImportGraph should NOT be called since we passed a prebuilt graph
      expect(mockBuildImportGraph).not.toHaveBeenCalled();
      expect(result).toHaveProperty('projectStats');
    });

    it('should use prebuilt content cache when provided', async () => {
      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      const mockSetContentCache = vi.fn();
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [],
          summary: {
            total: 0, passed: 0, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: mockSetContentCache,
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, mockRegistry);

      const prebuiltGraph = {
        graph: {
          nodes: new Map([
            ['/project/src/file.ts', { imports: [] }],
          ]),
        },
        cycles: [],
        buildTimeMs: 0,
      };

      const prebuiltContentCache = new Map([['src/file.ts', 'const x = 1;']]);

      await validator.validateFiles(['src/file.ts'], {
        prebuiltGraph: prebuiltGraph as unknown as import('../../../../src/core/imports/types.js').ImportGraphResult,
        prebuiltContentCache,
      });

      // setContentCache should be called with the prebuilt cache
      expect(mockSetContentCache).toHaveBeenCalledWith(prebuiltContentCache);
    });
  });

  describe('validateProject with empty graph', () => {
    it('should handle project with no files in the import graph', async () => {
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: { nodes: new Map() },
          cycles: [],
          buildTimeMs: 1,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, mockRegistry);
      const result = await validator.validateProject();

      expect(result.summary.total).toBe(0);
      expect(result.summary.passed).toBe(0);
      expect(result.summary.failed).toBe(0);
      expect(result.projectStats.filesInGraph).toBe(0);
    });
  });

  describe('coverage constraint edge cases', () => {
    it('should skip coverage constraint with non-object value (string)', async () => {
      const registryWithBadCoverage: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'events': {
            description: 'Events',
            rationale: 'Event definitions',
            constraints: [
              {
                rule: 'require_coverage',
                value: 'invalid-string-value', // Not an object
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      const mockValidateAll = vi.fn();
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: mockValidateAll,
        setContentCache: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithBadCoverage);
      const result = await validator.validateProject();

      // validateAll should not be called since the constraint value is invalid
      expect(mockValidateAll).not.toHaveBeenCalled();
      expect(result.coverageGaps).toBeUndefined();
    });

    it('should skip coverage constraint with null value', async () => {
      const registryWithNullCoverage: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'events': {
            description: 'Events',
            rationale: 'Event definitions',
            constraints: [
              {
                rule: 'require_coverage',
                value: null as unknown as Record<string, unknown>,
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      const mockValidateAll = vi.fn();
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: mockValidateAll,
        setContentCache: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithNullCoverage);
      const result = await validator.validateProject();

      expect(mockValidateAll).not.toHaveBeenCalled();
      expect(result.coverageGaps).toBeUndefined();
    });

    it('should skip coverage constraint with array value', async () => {
      const registryWithArrayCoverage: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'events': {
            description: 'Events',
            rationale: 'Event definitions',
            constraints: [
              {
                rule: 'require_coverage',
                value: ['invalid', 'array'] as unknown as Record<string, unknown>,
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      const mockValidateAll = vi.fn();
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: mockValidateAll,
        setContentCache: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithArrayCoverage);
      const result = await validator.validateProject();

      expect(mockValidateAll).not.toHaveBeenCalled();
      expect(result.coverageGaps).toBeUndefined();
    });

    it('should aggregate coverage results from multiple architectures', async () => {
      const registryWithMultipleCoverage: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'events': {
            description: 'Events',
            rationale: 'Event definitions',
            constraints: [
              {
                rule: 'require_coverage',
                value: {
                  source_type: 'export_names',
                  source_pattern: '*Event',
                  in_files: 'src/events/**/*.ts',
                  target_pattern: 'handle${value}',
                  in_target_files: 'src/handlers/**/*.ts',
                },
                severity: 'error',
              },
            ],
          },
          'commands': {
            description: 'Commands',
            rationale: 'Command definitions',
            constraints: [
              {
                rule: 'require_coverage',
                value: {
                  source_type: 'export_names',
                  source_pattern: '*Command',
                  in_files: 'src/commands/**/*.ts',
                  target_pattern: 'execute${value}',
                  in_target_files: 'src/executors/**/*.ts',
                },
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: vi.fn().mockResolvedValue(
          new Map([
            ['events:*Event', {
              totalSources: 4,
              coveredSources: 3,
              coveragePercent: 75,
              gaps: [
                { value: 'DeleteEvent', sourceFile: 'src/events/delete.ts', sourceLine: 5, expectedIn: 'src/handlers/**/*.ts', targetPattern: 'handleDeleteEvent' },
              ],
            }],
            ['commands:*Command', {
              totalSources: 2,
              coveredSources: 1,
              coveragePercent: 50,
              gaps: [
                { value: 'RestoreCommand', sourceFile: 'src/commands/restore.ts', sourceLine: 3, expectedIn: 'src/executors/**/*.ts', targetPattern: 'executeRestoreCommand' },
              ],
            }],
          ])
        ),
        setContentCache: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithMultipleCoverage);
      const result = await validator.validateProject();

      // Should aggregate gaps from both architectures
      expect(result.coverageGaps).toHaveLength(2);
      expect(result.coverageStats).toBeDefined();
      expect(result.coverageStats!.totalConstraints).toBe(2);
      expect(result.coverageStats!.totalSources).toBe(6); // 4 + 2
      expect(result.coverageStats!.coveredSources).toBe(4); // 3 + 1
      // (4/6) * 100 = 66.67%
      expect(result.coverageStats!.coveragePercent).toBeCloseTo(66.67, 1);
      // 2 gaps should be added to totalErrors
      expect(result.summary.totalErrors).toBe(2);
    });

    it('should filter coverage constraints by severity when severities option is set', async () => {
      const registryWithCoverage: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'events': {
            description: 'Events',
            rationale: 'Event definitions',
            constraints: [
              {
                rule: 'require_coverage',
                value: {
                  source_type: 'export_names',
                  source_pattern: '*Event',
                  in_files: 'src/events/**/*.ts',
                  target_pattern: 'handle${value}',
                  in_target_files: 'src/handlers/**/*.ts',
                },
                severity: 'warning',
              },
            ],
          },
        },
        mixins: {},
      };

      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      const mockValidateAll = vi.fn();
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: mockValidateAll,
        setContentCache: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithCoverage);
      // Only check error-severity constraints, skipping the warning-severity one
      const result = await validator.validateProject({ severities: ['error'] });

      // validateAll should not be called since the only coverage constraint is warning-severity
      expect(mockValidateAll).not.toHaveBeenCalled();
      expect(result.coverageGaps).toBeUndefined();
    });
  });

  describe('similarity constraint edge cases', () => {
    it('should filter similarity constraints by severity when severities option is set', async () => {
      const registryWithSimilarity: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            constraints: [
              {
                rule: 'max_similarity',
                value: 0.8,
                severity: 'warning',
              },
            ],
          },
        },
        mixins: {},
      };

      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      const mockExtractSignature = vi.fn();
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: mockExtractSignature,
        findSimilar: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/a.ts', { imports: [] }],
              ['/project/src/b.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 10,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithSimilarity);
      // Only check error-severity, skipping the warning-severity similarity constraint
      const result = await validator.validateProject({ severities: ['error'] });

      // extractSignature should not be called since the constraint is filtered out
      expect(mockExtractSignature).not.toHaveBeenCalled();
      expect(result.similarityViolations).toBeUndefined();
    });

    it('should handle findSimilar throwing an error gracefully', async () => {
      const registryWithSimilarity: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            constraints: [
              {
                rule: 'max_similarity',
                value: 0.8,
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: vi.fn().mockResolvedValue({
          file: 'test.ts',
          archId: 'service',
          exports: [],
          methods: [],
          classes: [],
          importModules: [],
          lineCount: 10,
        }),
        findSimilar: vi.fn().mockRejectedValue(new Error('Similarity computation failed')),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/a.ts', { imports: [] }],
              ['/project/src/b.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 10,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithSimilarity);
      // Should not throw even when findSimilar fails
      const result = await validator.validateProject();

      expect(result).toHaveProperty('projectStats');
      // No violations since findSimilar failed and was caught
      expect(result.similarityViolations).toBeUndefined();
    });
  });

  describe('mixin-based constraint detection', () => {
    it('should detect coverage constraints defined in mixins', async () => {
      const registryWithMixinCoverage: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'events': {
            description: 'Events',
            rationale: 'Event definitions',
            mixins: ['coverage-mixin'],
          },
        },
        mixins: {
          'coverage-mixin': {
            description: 'Coverage mixin',
            constraints: [
              {
                rule: 'require_coverage',
                value: {
                  source_type: 'export_names',
                  source_pattern: '*Event',
                  in_files: 'src/events/**/*.ts',
                  target_pattern: 'handle${value}',
                  in_target_files: 'src/handlers/**/*.ts',
                },
                severity: 'error',
              },
            ],
          },
        },
      };

      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      const mockValidateAll = vi.fn().mockResolvedValue(
        new Map([
          ['events:*Event', {
            totalSources: 1,
            coveredSources: 1,
            coveragePercent: 100,
            gaps: [],
          }],
        ])
      );
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: mockValidateAll,
        setContentCache: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithMixinCoverage);
      const result = await validator.validateProject();

      // The mixin has a coverage constraint, so checkHasCoverageConstraints should detect it
      // and validateAll should be called
      expect(mockValidateAll).toHaveBeenCalled();
      expect(result.coverageStats).toBeDefined();
    });

    it('should detect similarity constraints defined in mixins', async () => {
      const registryWithMixinSimilarity: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            mixins: ['dry-mixin'],
          },
        },
        mixins: {
          'dry-mixin': {
            description: 'DRY mixin',
            constraints: [
              {
                rule: 'max_similarity',
                value: 0.8,
                severity: 'warning',
              },
            ],
          },
        },
      };

      // With similarity mixin but only 1 file, the actual similarity check runs but archFiles < 2
      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      const mockExtractSignature = vi.fn().mockResolvedValue({
        file: 'test.ts',
        archId: 'service',
        exports: [],
        methods: [],
        classes: [],
        importModules: [],
        lineCount: 10,
      });
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: mockExtractSignature,
        findSimilar: vi.fn().mockResolvedValue([]),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/a.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithMixinSimilarity);
      // Should not throw - the mixin detection (checkHasSimilarityConstraints) sees
      // the constraint in mixins, enabling the similarity path
      const result = await validator.validateProject();

      expect(result).toHaveProperty('projectStats');
    });
  });

  describe('layer and package violations in summary', () => {
    it('should include layer violations in totalErrors and failed count', async () => {
      const configWithLayers = {
        ...mockConfig,
        layers: [
          { name: 'core', can_import: [] },
          { name: 'ui', can_import: ['core'] },
        ],
      };

      const { LayerBoundaryValidator } = await import('../../../../src/core/layers/validator.js');
      (LayerBoundaryValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validate: vi.fn().mockReturnValue({
          passed: false,
          violations: [
            {
              sourceFile: 'src/core/engine.ts',
              sourceLayer: 'core',
              targetFile: 'src/ui/button.tsx',
              targetLayer: 'ui',
              importPath: '../ui/button',
            },
          ],
        }),
      };
    });

      const validator = new ProjectValidator('/project', configWithLayers, mockRegistry);
      const result = await validator.validateProject();

      expect(result.summary.totalErrors).toBeGreaterThanOrEqual(1);
      expect(result.summary.failed).toBeGreaterThanOrEqual(1);
      expect(result.layerViolations).toBeDefined();
      expect(result.layerViolations).toHaveLength(1);
    });

    it('should include package violations in totalErrors and failed count', async () => {
      const configWithPackages = {
        ...mockConfig,
        packages: [
          { path: 'packages/core', can_import: [] },
          { path: 'packages/ui', can_import: ['packages/core'] },
        ],
      };

      const { PackageBoundaryValidator } = await import('../../../../src/core/packages/validator.js');
      (PackageBoundaryValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validate: vi.fn().mockReturnValue({
          passed: false,
          violations: [
            {
              sourcePackage: 'packages/core',
              targetPackage: 'packages/ui',
              sourceFile: 'packages/core/index.ts',
              importPath: '../ui/component',
            },
            {
              sourcePackage: 'packages/core',
              targetPackage: 'packages/ui',
              sourceFile: 'packages/core/utils.ts',
              importPath: '../ui/hook',
            },
          ],
          summary: { filesChecked: 5, importsAnalyzed: 10, violationCount: 2 },
        }),
      };
    });

      const validator = new ProjectValidator('/project', configWithPackages, mockRegistry);
      const result = await validator.validateProject();

      expect(result.summary.totalErrors).toBeGreaterThanOrEqual(2);
      expect(result.summary.failed).toBeGreaterThanOrEqual(2);
      expect(result.packageViolations).toBeDefined();
      expect(result.packageViolations).toHaveLength(2);
    });
  });

  describe('project-level constraint validation (importable_by, forbid_circular_deps)', () => {
    it('should run project-level constraints for files with archId and matching constraints', async () => {
      const registryWithProjectConstraints: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'core.service': {
            description: 'Core Service',
            rationale: 'Core service layer',
            constraints: [
              {
                rule: 'importable_by',
                value: ['core.*'],
                severity: 'error',
                why: 'Only core modules can import this',
              },
            ],
          },
        },
        mixins: {},
      };

      // Mock getValidator to return a validator that finds violations
      const { getValidator } = await import('../../../../src/core/constraints/index.js');
      (getValidator as ReturnType<typeof vi.fn>).mockReturnValue({
        validate: vi.fn().mockReturnValue({
          violations: [
            {
              rule: 'importable_by',
              severity: 'error',
              message: 'File is imported by unauthorized module',
              file: 'src/core/service.ts',
            },
          ],
        }),
      });

      // Mock engine to return a result with archId set
      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [
            {
              status: 'pass',
              file: 'src/core/service.ts',
              archId: 'core.service',
              inheritanceChain: ['core.service'],
              mixinsApplied: [],
              violations: [],
              warnings: [],
              overridesActive: [],
              passed: true,
              errorCount: 0,
              warningCount: 0,
            },
          ],
          summary: {
            total: 1, passed: 1, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: vi.fn(),
      };
    });

      // Mock ProjectAnalyzer to return the file in the graph
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/core/service.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue(['/project/src/ui/component.ts']),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithProjectConstraints);
      const result = await validator.validateProject();

      // The project-level constraint should have been evaluated and produced a violation
      expect(result.summary.totalErrors).toBeGreaterThanOrEqual(1);
      expect(result.results[0].status).toBe('fail');
      expect(result.results[0].violations.length).toBeGreaterThanOrEqual(1);
    });

    it('should skip project-level constraints for files without archId', async () => {
      // Mock getValidator - should NOT be called for untagged files
      const { getValidator } = await import('../../../../src/core/constraints/index.js');
      const mockValidate = vi.fn();
      (getValidator as ReturnType<typeof vi.fn>).mockReturnValue({
        validate: mockValidate,
      });

      // Mock engine to return a result WITHOUT archId (untagged file)
      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [
            {
              status: 'pass',
              file: 'src/untagged.ts',
              archId: null,
              inheritanceChain: [],
              mixinsApplied: [],
              violations: [],
              warnings: [],
              overridesActive: [],
              passed: true,
              errorCount: 0,
              warningCount: 0,
            },
          ],
          summary: {
            total: 1, passed: 1, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/untagged.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, mockRegistry);
      const result = await validator.validateProject();

      // Validator should not be called for untagged files
      expect(mockValidate).not.toHaveBeenCalled();
      expect(result.results[0].status).toBe('pass');
    });

    it('should return original result when architecture has no project-level constraints', async () => {
      // Registry with only non-project-level constraints
      const registryNoProjectConstraints: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'util': {
            description: 'Utility',
            rationale: 'Utility modules',
            constraints: [
              {
                rule: 'forbid_import',
                value: ['lodash'],
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { getValidator } = await import('../../../../src/core/constraints/index.js');
      const mockValidate = vi.fn();
      (getValidator as ReturnType<typeof vi.fn>).mockReturnValue({
        validate: mockValidate,
      });

      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [
            {
              status: 'pass',
              file: 'src/utils/helper.ts',
              archId: 'util',
              inheritanceChain: ['util'],
              mixinsApplied: [],
              violations: [],
              warnings: [],
              overridesActive: [],
              passed: true,
              errorCount: 0,
              warningCount: 0,
            },
          ],
          summary: {
            total: 1, passed: 1, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/utils/helper.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryNoProjectConstraints);
      const result = await validator.validateProject();

      // Validate function should not be called since forbid_import is not a project-level rule
      expect(mockValidate).not.toHaveBeenCalled();
      expect(result.results[0].status).toBe('pass');
    });

    it('should handle architecture resolution failure gracefully', async () => {
      // Use a registry where the archId in the result does not exist
      const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');
      (resolveArchitecture as ReturnType<typeof vi.fn>).mockImplementation((_registry: unknown, archId: string) => {
        if (archId === 'nonexistent') {
          throw new Error("Architecture 'nonexistent' not found in registry");
        }
        return {
          architecture: { constraints: [], hints: [], pointers: [] },
          chain: [archId],
          conflicts: [],
        };
      });

      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [
            {
              status: 'pass',
              file: 'src/unknown.ts',
              archId: 'nonexistent',
              inheritanceChain: [],
              mixinsApplied: [],
              violations: [],
              warnings: [],
              overridesActive: [],
              passed: true,
              errorCount: 0,
              warningCount: 0,
            },
          ],
          summary: {
            total: 1, passed: 1, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/unknown.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, mockRegistry);
      const result = await validator.validateProject();

      // Should not crash - resolution failure is handled gracefully
      expect(result.results[0].status).toBe('pass');
      expect(result.results[0].violations).toHaveLength(0);
    });

    it('should produce warning-status result when project constraints yield only warnings', async () => {
      // Reset resolveArchitecture to default behavior (previous test overrode it)
      const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');
      (resolveArchitecture as ReturnType<typeof vi.fn>).mockImplementation((registry: Record<string, { nodes: Record<string, { constraints?: unknown[]; mixins?: string[] }>; mixins: Record<string, { constraints?: unknown[] }> }>, archId: string) => {
        const node = registry.nodes[archId];
        if (!node) throw new Error(`Architecture '${archId}' not found`);
        const constraints = [...(node.constraints ?? [])];
        if (node.mixins) {
          for (const mixinId of node.mixins) {
            const mixin = registry.mixins[mixinId];
            if (mixin?.constraints) constraints.push(...mixin.constraints);
          }
        }
        return { architecture: { constraints, hints: [], pointers: [] }, chain: [archId], conflicts: [] };
      });

      const registryWithWarningConstraint: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'core.service': {
            description: 'Core Service',
            rationale: 'Core service layer',
            constraints: [
              {
                rule: 'importable_by',
                value: ['core.*'],
                severity: 'warning',
                why: 'Suggest only core modules import this',
              },
            ],
          },
        },
        mixins: {},
      };

      const { getValidator } = await import('../../../../src/core/constraints/index.js');
      (getValidator as ReturnType<typeof vi.fn>).mockReturnValue({
        validate: vi.fn().mockReturnValue({
          violations: [
            {
              rule: 'importable_by',
              severity: 'warning',
              message: 'File is imported by non-core module',
              file: 'src/core/service.ts',
            },
          ],
        }),
      });

      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [
            {
              status: 'pass',
              file: 'src/core/service.ts',
              archId: 'core.service',
              inheritanceChain: ['core.service'],
              mixinsApplied: [],
              violations: [],
              warnings: [],
              overridesActive: [],
              passed: true,
              errorCount: 0,
              warningCount: 0,
            },
          ],
          summary: {
            total: 1, passed: 1, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/core/service.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithWarningConstraint);
      const result = await validator.validateProject();

      // Only warnings, no errors -> status should be 'warn'
      expect(result.results[0].status).toBe('warn');
      expect(result.results[0].warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.results[0].violations).toHaveLength(0);
      expect(result.results[0].passed).toBe(true);
    });

    it('should skip project-level constraint when its rule is in skipRules', async () => {
      const registryWithProjectConstraints: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'core.service': {
            description: 'Core Service',
            rationale: 'Core service layer',
            constraints: [
              {
                rule: 'importable_by',
                value: ['core.*'],
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { getValidator } = await import('../../../../src/core/constraints/index.js');
      const mockValidate = vi.fn();
      (getValidator as ReturnType<typeof vi.fn>).mockReturnValue({
        validate: mockValidate,
      });

      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [
            {
              status: 'pass',
              file: 'src/core/service.ts',
              archId: 'core.service',
              inheritanceChain: ['core.service'],
              mixinsApplied: [],
              violations: [],
              warnings: [],
              overridesActive: [],
              passed: true,
              errorCount: 0,
              warningCount: 0,
            },
          ],
          summary: {
            total: 1, passed: 1, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/core/service.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithProjectConstraints);
      // Skip the importable_by rule explicitly
      const result = await validator.validateProject({ skipRules: ['importable_by'] });

      // validate should not be called since the rule is skipped
      expect(mockValidate).not.toHaveBeenCalled();
      expect(result.results[0].status).toBe('pass');
    });

    it('should skip project-level constraint when severity does not match severities filter', async () => {
      const registryWithProjectConstraints: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'core.service': {
            description: 'Core Service',
            rationale: 'Core service layer',
            constraints: [
              {
                rule: 'importable_by',
                value: ['core.*'],
                severity: 'warning',
              },
            ],
          },
        },
        mixins: {},
      };

      const { getValidator } = await import('../../../../src/core/constraints/index.js');
      const mockValidate = vi.fn();
      (getValidator as ReturnType<typeof vi.fn>).mockReturnValue({
        validate: mockValidate,
      });

      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [
            {
              status: 'pass',
              file: 'src/core/service.ts',
              archId: 'core.service',
              inheritanceChain: ['core.service'],
              mixinsApplied: [],
              violations: [],
              warnings: [],
              overridesActive: [],
              passed: true,
              errorCount: 0,
              warningCount: 0,
            },
          ],
          summary: {
            total: 1, passed: 1, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/core/service.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithProjectConstraints);
      // Only validate errors, skipping the warning-severity constraint
      const result = await validator.validateProject({ severities: ['error'] });

      expect(mockValidate).not.toHaveBeenCalled();
      expect(result.results[0].status).toBe('pass');
    });

    it('should skip constraint when getValidator returns undefined', async () => {
      const registryWithProjectConstraints: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'core.service': {
            description: 'Core Service',
            rationale: 'Core service layer',
            constraints: [
              {
                rule: 'importable_by',
                value: ['core.*'],
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      // getValidator returns undefined (no validator registered for the rule)
      const { getValidator } = await import('../../../../src/core/constraints/index.js');
      (getValidator as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [
            {
              status: 'pass',
              file: 'src/core/service.ts',
              archId: 'core.service',
              inheritanceChain: ['core.service'],
              mixinsApplied: [],
              violations: [],
              warnings: [],
              overridesActive: [],
              passed: true,
              errorCount: 0,
              warningCount: 0,
            },
          ],
          summary: {
            total: 1, passed: 1, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/core/service.ts', { imports: [] }],
            ]),
          },
          cycles: [],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithProjectConstraints);
      const result = await validator.validateProject();

      // No violations since getValidator returned undefined
      expect(result.results[0].status).toBe('pass');
      expect(result.results[0].violations).toHaveLength(0);
    });

    it('should merge error and warning violations from project-level constraints', async () => {
      // Reset resolveArchitecture to default behavior
      const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');
      (resolveArchitecture as ReturnType<typeof vi.fn>).mockImplementation((registry: Record<string, { nodes: Record<string, { constraints?: unknown[]; mixins?: string[] }>; mixins: Record<string, { constraints?: unknown[] }> }>, archId: string) => {
        const node = registry.nodes[archId];
        if (!node) throw new Error(`Architecture '${archId}' not found`);
        const constraints = [...(node.constraints ?? [])];
        if (node.mixins) {
          for (const mixinId of node.mixins) {
            const mixin = registry.mixins[mixinId];
            if (mixin?.constraints) constraints.push(...mixin.constraints);
          }
        }
        return { architecture: { constraints, hints: [], pointers: [] }, chain: [archId], conflicts: [] };
      });

      const registryWithMultipleConstraints: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'core.service': {
            description: 'Core Service',
            rationale: 'Core service layer',
            constraints: [
              {
                rule: 'importable_by',
                value: ['core.*'],
                severity: 'error',
              },
              {
                rule: 'forbid_circular_deps',
                value: true,
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { getValidator } = await import('../../../../src/core/constraints/index.js');
      let callCount = 0;
      (getValidator as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        return {
          validate: vi.fn().mockReturnValue({
            violations: [
              {
                rule: callCount === 1 ? 'importable_by' : 'forbid_circular_deps',
                severity: callCount === 1 ? 'error' : 'warning',
                message: callCount === 1 ? 'Unauthorized import' : 'Circular dependency suggestion',
                file: 'src/core/service.ts',
              },
            ],
          }),
        };
      });

      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: [
            {
              status: 'pass',
              file: 'src/core/service.ts',
              archId: 'core.service',
              inheritanceChain: ['core.service'],
              mixinsApplied: [],
              violations: [],
              warnings: [],
              overridesActive: [],
              passed: true,
              errorCount: 0,
              warningCount: 0,
            },
          ],
          summary: {
            total: 1, passed: 1, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map([
              ['/project/src/core/service.ts', { imports: [] }],
            ]),
          },
          cycles: [
            {
              files: ['/project/src/core/service.ts', '/project/src/core/other.ts'],
              archIds: ['core.service', 'core.other'],
            },
          ],
          buildTimeMs: 5,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue(['/project/src/ui/component.ts']),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithMultipleConstraints);
      const result = await validator.validateProject();

      // Should have both errors and warnings merged
      const fileResult = result.results[0];
      expect(fileResult.status).toBe('fail'); // Has at least one error
      expect(fileResult.violations.length).toBeGreaterThanOrEqual(1); // Error violations
      expect(fileResult.warnings.length).toBeGreaterThanOrEqual(1); // Warning violations
      expect(fileResult.errorCount).toBe(fileResult.violations.length);
      expect(fileResult.warningCount).toBe(fileResult.warnings.length);
    });

    it('should process multiple files in batches for project constraints', async () => {
      const registryWithConstraint: Registry = {
        nodes: {
          base: { description: 'Base', rationale: 'Base arch' },
          'service': {
            description: 'Service',
            rationale: 'Service layer',
            constraints: [
              {
                rule: 'importable_by',
                value: ['service.*'],
                severity: 'error',
              },
            ],
          },
        },
        mixins: {},
      };

      const { getValidator } = await import('../../../../src/core/constraints/index.js');
      (getValidator as ReturnType<typeof vi.fn>).mockReturnValue({
        validate: vi.fn().mockReturnValue({ violations: [] }),
      });

      // Create results for multiple files
      const fileResults = Array.from({ length: 5 }, (_, i) => ({
        status: 'pass' as const,
        file: `src/services/svc-${i}.ts`,
        archId: 'service',
        inheritanceChain: ['service'],
        mixinsApplied: [],
        violations: [],
        warnings: [],
        overridesActive: [],
        passed: true,
        errorCount: 0,
        warningCount: 0,
      }));

      const { ValidationEngine } = await import('../../../../src/core/validation/engine.js');
      (ValidationEngine as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateFiles: vi.fn().mockResolvedValue({
          results: fileResults,
          summary: {
            total: 5, passed: 5, failed: 0, warned: 0,
            totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
          },
        }),
        setContentCache: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const nodeEntries: [string, { imports: string[] }][] = Array.from({ length: 5 }, (_, i) => [
        `/project/src/services/svc-${i}.ts`,
        { imports: [] },
      ]);

      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({
          graph: {
            nodes: new Map(nodeEntries),
          },
          cycles: [],
          buildTimeMs: 10,
        }),
        getContentCache: vi.fn().mockReturnValue(new Map()),
        getImporters: vi.fn().mockReturnValue([]),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, registryWithConstraint);
      const result = await validator.validateProject();

      // All 5 files should have been processed
      expect(result.results).toHaveLength(5);
      expect(result.summary.total).toBe(5);
    });
  });

  describe('no coverage or similarity constraints in registry', () => {
    it('should skip coverage and similarity when registry has no such constraints', async () => {
      // mockRegistry only has base with no constraints
      const { CoverageValidator } = await import('../../../../src/core/coverage/validator.js');
      const mockValidateAll = vi.fn();
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        validateAll: mockValidateAll,
        setContentCache: vi.fn(),
      };
    });

      const { SimilarityAnalyzer } = await import('../../../../src/core/similarity/analyzer.js');
      const mockExtractSignature = vi.fn();
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(function() {
      return {
        extractSignature: mockExtractSignature,
        findSimilar: vi.fn(),
        dispose: vi.fn(),
      };
    });

      const validator = new ProjectValidator('/project', mockConfig, mockRegistry);
      const result = await validator.validateProject();

      // Neither should be invoked since registry has no coverage/similarity constraints
      expect(mockValidateAll).not.toHaveBeenCalled();
      expect(mockExtractSignature).not.toHaveBeenCalled();
      expect(result.coverageGaps).toBeUndefined();
      expect(result.similarityViolations).toBeUndefined();
    });
  });
});
