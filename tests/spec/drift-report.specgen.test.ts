/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Spec-generated tests for generateDriftReport
 * Source: spec.speccodex.drift.report
 *
 * Generated via: archcodex spec generate spec.speccodex.drift.report --type unit
 * Then fixed for mocking, import paths, argument order, and error handling patterns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateDriftReport,
} from '../../src/core/spec/drift/report.js';
import type { SpecRegistry } from '../../src/core/spec/schema.js';

// Mock file-system utilities (required - function does I/O)
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

// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
describe('generateDriftReport (spec-generated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGlobFiles.mockResolvedValue([]);
    mockReadFile.mockResolvedValue('');
  });

  describe('success cases', () => {
    it('clean codebase', async () => {
      // Arrange
      const projectRoot = '/test/project';
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/a.ts#a' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue(['/test/project/src/a.ts']);
      mockReadFile.mockResolvedValue('export function a() {}');

      // Act
      const result = await generateDriftReport(projectRoot, registry, {
        includeSignatureCheck: false,
      });

      // Assert
      expect(result.valid).toBe(true);
      expect(result.issues).toMatchObject([]);
      expect(result.summary.errors).toBe(0);
    });

    it('issues found', async () => {
      // Arrange
      const projectRoot = '/test/project';
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/a.ts#a' },
          'spec.b': {
            intent: 'B',
            examples: { success: [{ name: 'test', given: {}, then: {} }] },
          }, // Unwired with examples -> error
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue(['/test/project/src/a.ts']);

      // Act
      const result = await generateDriftReport(projectRoot, registry, {
        includeSignatureCheck: false,
      });

      // Assert
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'unwired_spec', specId: 'spec.b' }),
        ])
      );
    });

    it('markdown format', async () => {
      // Arrange
      const projectRoot = '/test/project';
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      // Act
      const result = await generateDriftReport(projectRoot, registry, {
        format: 'markdown',
        includeSignatureCheck: false,
      });

      // Assert
      expect(result.formattedOutput).toContain('# Drift Report');
    });

    it('terminal format with labels', async () => {
      // Arrange
      const projectRoot = '/test/project';
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A' }, // Unwired, no examples -> warning
        },
        mixins: {},
      };

      // Act
      const result = await generateDriftReport(projectRoot, registry, {
        format: 'terminal',
        includeSignatureCheck: false,
      });

      // Assert
      expect(result.formattedOutput).toContain('WARNING');
    });
  });

  describe('error cases', () => {
    it('missing project root', async () => {
      // Arrange
      const projectRoot = '';
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      // Act & Assert
      await expect(generateDriftReport(projectRoot, registry))
        .rejects.toThrow('MISSING_PROJECTROOT');
    });
  });
});
// @speccodex:end
