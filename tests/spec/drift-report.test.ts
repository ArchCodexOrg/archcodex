/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Tests for generateDriftReport - generated from spec.speccodex.drift.report
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateDriftReport,
  formatDriftReport,
} from '../../src/core/spec/drift/report.js';
import type { SpecRegistry } from '../../src/core/spec/schema.js';

// Mock dependencies
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

describe('generateDriftReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGlobFiles.mockResolvedValue([]);
    mockReadFile.mockResolvedValue('');
  });

  describe('validation', () => {
    it('throws MISSING_PROJECTROOT when projectRoot is empty', async () => {
      const registry: SpecRegistry = { nodes: {}, mixins: {} };
      await expect(
        generateDriftReport('', registry)
      ).rejects.toThrow('MISSING_PROJECTROOT');
    });
  });

  describe('success cases', () => {
    it('clean codebase returns valid with no issues', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/a.ts#a' },
        },
        mixins: {},
      };

      // All files covered, no undocumented
      mockGlobFiles.mockResolvedValue(['/test/project/src/a.ts']);
      mockReadFile.mockResolvedValue('export function a() {}');

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.summary.errors).toBe(0);
    });

    it('unwired spec produces issue', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/a.ts#a' },
          'spec.b': {
            intent: 'B',
            examples: { success: [{ name: 'test', given: {}, then: {} }] },
          }, // Unwired with examples -> error severity
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue(['/test/project/src/a.ts']);

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      expect(result.valid).toBe(false);
      const unwiredIssue = result.issues.find(i => i.type === 'unwired_spec');
      expect(unwiredIssue).toBeDefined();
      expect(unwiredIssue!.specId).toBe('spec.b');
    });

    it('unwired spec with examples has error severity', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': {
            intent: 'A',
            examples: { success: [{ name: 'test', given: {}, then: {} }] },
          },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([]);

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      const issue = result.issues.find(i => i.specId === 'spec.a');
      expect(issue?.severity).toBe('error');
    });

    it('unwired spec without examples has warning severity', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A' }, // No examples
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([]);

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      const issue = result.issues.find(i => i.specId === 'spec.a');
      expect(issue?.severity).toBe('warning');
    });

    it('undocumented files produce info issues', async () => {
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      mockGlobFiles.mockResolvedValue(['/test/project/src/orphan.ts']);
      mockReadFile.mockResolvedValue('export function orphan() {}');

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      const infoIssue = result.issues.find(i => i.type === 'undocumented_impl');
      expect(infoIssue).toBeDefined();
      expect(infoIssue!.severity).toBe('info');
      expect(infoIssue!.path).toBe('src/orphan.ts');
    });

    it('missing implementation file produces error', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/missing.ts#fn' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([]);
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: true,
      });

      const missingFile = result.issues.find(i => i.type === 'missing_file');
      expect(missingFile).toBeDefined();
      expect(missingFile!.severity).toBe('error');
      expect(missingFile!.specId).toBe('spec.a');
    });
  });

  describe('invariants', () => {
    it('valid is false when errors > 0', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': {
            intent: 'A',
            examples: { success: [{ name: 'test', given: {}, then: {} }] },
          },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([]);

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.valid).toBe(false);
    });

    it('issues sorted by severity (errors first)', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': {
            intent: 'A',
            examples: { success: [{ name: 'test', given: {}, then: {} }] },
          }, // error (has examples)
          'spec.b': { intent: 'B' }, // warning (no examples)
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue(['/test/project/src/orphan.ts']);
      mockReadFile.mockResolvedValue('export function orphan() {}');

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      // Should have error, warning, and info issues
      expect(result.issues.length).toBeGreaterThanOrEqual(3);

      // Verify ordering
      for (let i = 1; i < result.issues.length; i++) {
        const prev = result.issues[i - 1].severity;
        const curr = result.issues[i].severity;
        const severityOrder = { error: 0, warning: 1, info: 2 };
        expect(severityOrder[prev]).toBeLessThanOrEqual(severityOrder[curr]);
      }
    });

    it('each issue has message defined', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue(['/test/project/src/orphan.ts']);
      mockReadFile.mockResolvedValue('export function orphan() {}');

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      for (const issue of result.issues) {
        expect(issue.message).toBeDefined();
        expect(issue.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('signature checks', () => {
    it('can be disabled', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/missing.ts#fn' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([]);

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
      });

      // No missing_file or signature_mismatch issues
      const signatureIssues = result.issues.filter(
        i => i.type === 'missing_file' || i.type === 'signature_mismatch'
      );
      expect(signatureIssues).toEqual([]);
    });
  });

  describe('format output', () => {
    it('terminal format contains issue labels', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([]);

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
        format: 'terminal',
      });

      expect(result.formattedOutput).toContain('WARNING');
      expect(result.formattedOutput).toContain('Drift Report');
    });

    it('markdown format has header and sections', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([]);

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
        format: 'markdown',
      });

      expect(result.formattedOutput).toContain('# Drift Report');
      expect(result.formattedOutput).toContain('Spec Coverage');
    });

    it('json format is valid JSON', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([]);

      const result = await generateDriftReport('/test/project', registry, {
        includeSignatureCheck: false,
        format: 'json',
      });

      const parsed = JSON.parse(result.formattedOutput);
      expect(parsed.valid).toBeDefined();
      expect(parsed.issues).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });

    it('formatDriftReport can re-format result', () => {
      const result = {
        valid: true,
        issues: [],
        summary: { errors: 0, warnings: 0, info: 0, specCoverage: 100, implCoverage: 100 },
        formattedOutput: '',
      };

      const terminal = formatDriftReport(result, 'terminal');
      expect(terminal).toContain('Drift Report');
      expect(terminal).toContain('No drift detected');

      const markdown = formatDriftReport(result, 'markdown');
      expect(markdown).toContain('# Drift Report');
      expect(markdown).toContain('No drift detected');

      const json = formatDriftReport(result, 'json');
      const parsed = JSON.parse(json);
      expect(parsed.valid).toBe(true);
    });
  });
});
