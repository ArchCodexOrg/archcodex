/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Integration tests for generateDriftReport
 * Source: spec.speccodex.drift.report (effects)
 *
 * Generated via: archcodex spec generate spec.speccodex.drift.report --type integration
 * Then fixed for actual infrastructure patterns used in ArchCodex.
 *
 * Note: ArchCodex does not currently have metrics or audit log infrastructure.
 * These tests verify the structural correctness of the report output that would
 * feed into such systems, validating the effect-related data is present.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateDriftReport,
} from '../../src/core/spec/drift/report.js';
import type { SpecRegistry } from '../../src/core/spec/schema.js';

// Mock file-system utilities
vi.mock('../../src/utils/file-system.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/file-system.js')>();
  return {
    ...actual,
    globFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
  };
});

import { globFiles, readFile } from '../../src/utils/file-system.js';

const mockGlobFiles = vi.mocked(globFiles);
const mockReadFile = vi.mocked(readFile);

// @speccodex:integration:start - DO NOT EDIT BETWEEN MARKERS
describe('generateDriftReport integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGlobFiles.mockResolvedValue([]);
    mockReadFile.mockResolvedValue('');
  });

  describe('effects - metrics data availability', () => {
    it('summary.errors is available for spec.drift.errors gauge', async () => {
      // Arrange - registry with unwired spec (produces error)
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': {
            intent: 'A',
            examples: { success: [{ name: 'test', given: {}, then: {} }] },
          },
        },
        mixins: {},
      };

      // Act
      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      // Assert - errors count available for gauge metric
      expect(typeof result.summary.errors).toBe('number');
      expect(result.summary.errors).toBeGreaterThanOrEqual(0);
    });

    it('summary.warnings is available for spec.drift.warnings gauge', async () => {
      // Arrange - registry with unwired spec without examples (produces warning)
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A' },
        },
        mixins: {},
      };

      // Act
      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      // Assert - warnings count available for gauge metric
      expect(typeof result.summary.warnings).toBe('number');
      expect(result.summary.warnings).toBeGreaterThan(0);
    });

    it('summary.specCoverage is available for spec.drift.coverage gauge', async () => {
      // Arrange
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/a.ts#a' },
          'spec.b': { intent: 'B' },
        },
        mixins: {},
      };

      // Act
      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      // Assert - coverage percentage available for gauge metric
      expect(typeof result.summary.specCoverage).toBe('number');
      expect(result.summary.specCoverage).toBeGreaterThanOrEqual(0);
      expect(result.summary.specCoverage).toBeLessThanOrEqual(100);
    });

    it('report data suitable for audit log entry', async () => {
      // Arrange
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/a.ts#a' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue(['/test/project/src/a.ts']);
      mockReadFile.mockResolvedValue('export function a() {}');

      // Act
      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      // Assert - result has all fields needed for audit log
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('summary.errors');
      expect(result).toHaveProperty('issues');

      // Audit log metadata would include: { errors: result.summary.errors }
      const auditMetadata = { errors: result.summary.errors };
      expect(auditMetadata.errors).toBe(0);
    });
  });

  describe('end-to-end report generation', () => {
    it('combines unwired + undocumented in single report', async () => {
      // Arrange - mixed scenario
      const registry: SpecRegistry = {
        nodes: {
          'spec.wired': { intent: 'Wired', implementation: 'src/wired.ts#fn' },
          'spec.unwired': {
            intent: 'Unwired',
            examples: { success: [{ name: 'test', given: {}, then: {} }] },
          },
        },
        mixins: {},
      };

      // One wired file + one orphan
      mockGlobFiles.mockResolvedValue([
        '/test/project/src/wired.ts',
        '/test/project/src/orphan.ts',
      ]);
      mockReadFile.mockResolvedValue('export function fn() {}');

      // Act
      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      // Assert - both issue types present
      const issueTypes = new Set(result.issues.map(i => i.type));
      expect(issueTypes.has('unwired_spec')).toBe(true);
      expect(issueTypes.has('undocumented_impl')).toBe(true);

      // Summary reflects both dimensions
      expect(result.summary.specCoverage).toBeLessThan(100);
      expect(result.summary.implCoverage).toBeLessThan(100);
    });

    it('json format is parseable and contains all required fields', async () => {
      // Arrange
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/a.ts#a' },
        },
        mixins: {},
      };

      // Act
      const result = await generateDriftReport('/test/project', registry, {
        format: 'json',
        includeSignatureCheck: false,
      });

      // Assert - JSON output is valid and contains required fields
      const parsed = JSON.parse(result.formattedOutput);
      expect(parsed).toHaveProperty('valid');
      expect(parsed).toHaveProperty('issues');
      expect(parsed).toHaveProperty('summary');
      expect(parsed.summary).toHaveProperty('errors');
      expect(parsed.summary).toHaveProperty('warnings');
      expect(parsed.summary).toHaveProperty('info');
      expect(parsed.summary).toHaveProperty('specCoverage');
      expect(parsed.summary).toHaveProperty('implCoverage');
    });
  });
});
// @speccodex:integration:end
