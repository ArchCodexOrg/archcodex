/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP analyze handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAnalyze } from '../../../../src/mcp/handlers/analyze.js';

// Mock dependencies
vi.mock('../../../../src/core/analysis/index.js', () => ({
  runAllAnalyses: vi.fn(),
  formatAnalysisResult: vi.fn(),
}));

vi.mock('../../../../src/mcp/utils.js', () => ({
  isProjectInitialized: vi.fn(),
  findNearbyProject: vi.fn(),
}));

import { runAllAnalyses, formatAnalysisResult } from '../../../../src/core/analysis/index.js';
import { isProjectInitialized, findNearbyProject } from '../../../../src/mcp/utils.js';

describe('MCP Analyze Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isProjectInitialized).mockResolvedValue(true);
    vi.mocked(findNearbyProject).mockResolvedValue(null);
  });

  describe('handleAnalyze', () => {
    it('should run all analyses with no options and return formatted result', async () => {
      const mockResult = {
        findings: [],
        summary: { total: 0, errors: 0, warnings: 0, info: 0 },
      };
      vi.mocked(runAllAnalyses).mockResolvedValue(mockResult);
      vi.mocked(formatAnalysisResult).mockReturnValue('No issues found.');

      const result = await handleAnalyze(projectRoot);

      expect(runAllAnalyses).toHaveBeenCalledWith(projectRoot, {
        categories: undefined,
        severity: undefined,
        specIds: undefined,
      });
      expect(formatAnalysisResult).toHaveBeenCalledWith(mockResult);
      expect(result.content[0].text).toBe('No issues found.');
      expect(result.isError).toBeUndefined();
    });

    it('should return error when project is not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);

      const result = await handleAnalyze(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not initialized');
      expect(result.content[0].text).toContain(projectRoot);
    });

    it('should suggest nearby project when not initialized and nearby found', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue('/nearby/project');

      const result = await handleAnalyze(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('/nearby/project');
      expect(result.content[0].text).toContain('archcodex_analyze');
    });

    it('should suggest init when not initialized and no nearby project', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue(null);

      const result = await handleAnalyze(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('archcodex init');
    });

    it('should pass valid single category to runAllAnalyses', async () => {
      vi.mocked(runAllAnalyses).mockResolvedValue({
        findings: [],
        summary: { total: 0, errors: 0, warnings: 0, info: 0 },
      });
      vi.mocked(formatAnalysisResult).mockReturnValue('Filtered result');

      const result = await handleAnalyze(projectRoot, { category: 'security' });

      expect(runAllAnalyses).toHaveBeenCalledWith(projectRoot, {
        categories: ['security'],
        severity: undefined,
        specIds: undefined,
      });
      expect(result.isError).toBeUndefined();
    });

    it('should pass multiple comma-separated categories', async () => {
      vi.mocked(runAllAnalyses).mockResolvedValue({
        findings: [],
        summary: { total: 0, errors: 0, warnings: 0, info: 0 },
      });
      vi.mocked(formatAnalysisResult).mockReturnValue('Multi-category result');

      await handleAnalyze(projectRoot, { category: 'logic, security, data' });

      expect(runAllAnalyses).toHaveBeenCalledWith(projectRoot, {
        categories: ['logic', 'security', 'data'],
        severity: undefined,
        specIds: undefined,
      });
    });

    it('should return error for invalid category', async () => {
      const result = await handleAnalyze(projectRoot, { category: 'invalid_category' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid category');
      expect(result.content[0].text).toContain('invalid_category');
      expect(result.content[0].text).toContain('Valid categories');
    });

    it('should return error when one category in comma list is invalid', async () => {
      const result = await handleAnalyze(projectRoot, { category: 'logic, bad_one' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid category');
      expect(result.content[0].text).toContain('bad_one');
    });

    it('should pass valid severity to runAllAnalyses', async () => {
      vi.mocked(runAllAnalyses).mockResolvedValue({
        findings: [],
        summary: { total: 0, errors: 0, warnings: 0, info: 0 },
      });
      vi.mocked(formatAnalysisResult).mockReturnValue('Error severity result');

      await handleAnalyze(projectRoot, { severity: 'error' });

      expect(runAllAnalyses).toHaveBeenCalledWith(projectRoot, {
        categories: undefined,
        severity: 'error',
        specIds: undefined,
      });
    });

    it('should return error for invalid severity', async () => {
      const result = await handleAnalyze(projectRoot, { severity: 'critical' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid severity');
      expect(result.content[0].text).toContain('critical');
      expect(result.content[0].text).toContain('Valid severities');
    });

    it('should pass specIds to runAllAnalyses', async () => {
      vi.mocked(runAllAnalyses).mockResolvedValue({
        findings: [],
        summary: { total: 0, errors: 0, warnings: 0, info: 0 },
      });
      vi.mocked(formatAnalysisResult).mockReturnValue('Spec-filtered result');

      await handleAnalyze(projectRoot, { specIds: ['spec.test.one', 'spec.test.two'] });

      expect(runAllAnalyses).toHaveBeenCalledWith(projectRoot, {
        categories: undefined,
        severity: undefined,
        specIds: ['spec.test.one', 'spec.test.two'],
      });
    });

    it('should pass combined options to runAllAnalyses', async () => {
      vi.mocked(runAllAnalyses).mockResolvedValue({
        findings: [],
        summary: { total: 0, errors: 0, warnings: 0, info: 0 },
      });
      vi.mocked(formatAnalysisResult).mockReturnValue('Combined result');

      await handleAnalyze(projectRoot, {
        category: 'logic',
        severity: 'warning',
        specIds: ['spec.test.one'],
      });

      expect(runAllAnalyses).toHaveBeenCalledWith(projectRoot, {
        categories: ['logic'],
        severity: 'warning',
        specIds: ['spec.test.one'],
      });
    });

    it('should handle runAllAnalyses throwing an error', async () => {
      vi.mocked(runAllAnalyses).mockRejectedValue(new Error('Analysis engine failed'));

      const result = await handleAnalyze(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error running analysis');
      expect(result.content[0].text).toContain('Analysis engine failed');
      expect(result.content[0].text).toContain(projectRoot);
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(runAllAnalyses).mockRejectedValue('string error');

      const result = await handleAnalyze(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('string error');
    });

    it('should include troubleshooting tips in error response', async () => {
      vi.mocked(runAllAnalyses).mockRejectedValue(new Error('Something broke'));

      const result = await handleAnalyze(projectRoot);

      expect(result.content[0].text).toContain('.arch/specs/');
      expect(result.content[0].text).toContain('.arch/registry/');
      expect(result.content[0].text).toContain('archcodex analyze --help');
    });

    it('should accept all valid categories', async () => {
      vi.mocked(runAllAnalyses).mockResolvedValue({
        findings: [],
        summary: { total: 0, errors: 0, warnings: 0, info: 0 },
      });
      vi.mocked(formatAnalysisResult).mockReturnValue('All categories');

      const allCategories = 'logic, security, data, consistency, completeness, other';
      const result = await handleAnalyze(projectRoot, { category: allCategories });

      expect(result.isError).toBeUndefined();
      expect(runAllAnalyses).toHaveBeenCalledWith(projectRoot, {
        categories: ['logic', 'security', 'data', 'consistency', 'completeness', 'other'],
        severity: undefined,
        specIds: undefined,
      });
    });

    it('should accept all valid severities', async () => {
      vi.mocked(runAllAnalyses).mockResolvedValue({
        findings: [],
        summary: { total: 0, errors: 0, warnings: 0, info: 0 },
      });
      vi.mocked(formatAnalysisResult).mockReturnValue('');

      for (const sev of ['error', 'warning', 'info']) {
        const result = await handleAnalyze(projectRoot, { severity: sev });
        expect(result.isError).toBeUndefined();
      }
    });
  });
});
