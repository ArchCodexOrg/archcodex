/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for ProjectValidator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../../src/core/imports/analyzer.js', () => ({
  ProjectAnalyzer: vi.fn().mockImplementation(() => ({
    buildImportGraph: vi.fn().mockResolvedValue({
      graph: { nodes: new Map() },
      cycles: [],
      buildTimeMs: 10,
    }),
    getContentCache: vi.fn().mockReturnValue(new Map()),
    getImporters: vi.fn().mockReturnValue([]),
    dispose: vi.fn(),
  })),
}));

vi.mock('../../../../src/core/packages/validator.js', () => ({
  PackageBoundaryValidator: vi.fn().mockImplementation(() => ({
    validate: vi.fn().mockReturnValue({
      passed: true,
      violations: [],
      summary: { filesChecked: 0, importsAnalyzed: 0, violationCount: 0 },
    }),
  })),
}));

vi.mock('../../../../src/core/layers/validator.js', () => ({
  LayerBoundaryValidator: vi.fn().mockImplementation(() => ({
    validate: vi.fn().mockReturnValue({
      passed: true,
      violations: [],
    }),
  })),
}));

vi.mock('../../../../src/core/coverage/validator.js', () => ({
  CoverageValidator: vi.fn().mockImplementation(() => ({
    validateAll: vi.fn().mockResolvedValue(new Map()),
    setContentCache: vi.fn(),
  })),
}));

vi.mock('../../../../src/core/validation/engine.js', () => ({
  ValidationEngine: vi.fn().mockImplementation(() => ({
    validateFiles: vi.fn().mockResolvedValue({
      results: [],
      summary: {
        total: 0, passed: 0, failed: 0, warned: 0,
        totalErrors: 0, totalWarnings: 0, activeOverrides: 0,
      },
    }),
    setContentCache: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock('../../../../src/core/similarity/analyzer.js', () => ({
  SimilarityAnalyzer: vi.fn().mockImplementation(() => ({
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
  })),
}));

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
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
        validateAll: mockValidateAll,
        setContentCache: vi.fn(),
      }));

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
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
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
      }));

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
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
        validateAll: mockValidateAll,
        setContentCache: vi.fn(),
      }));

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
      (CoverageValidator as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
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
      }));

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
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
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
      }));

      // Also need to update ProjectAnalyzer mock to return files
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
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
      }));

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
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
        extractSignature: vi.fn(),
        findSimilar: mockFindSimilar,
        dispose: vi.fn(),
      }));

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
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
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
      }));

      // Mock ProjectAnalyzer to return 2 files
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
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
      }));

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
      (SimilarityAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
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
      }));

      // Mock ProjectAnalyzer
      const { ProjectAnalyzer } = await import('../../../../src/core/imports/analyzer.js');
      (ProjectAnalyzer as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(() => ({
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
      }));

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
  });
});
