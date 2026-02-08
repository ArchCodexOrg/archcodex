/**
 * @arch archcodex.test.unit
 *
 * Tests for drift analysis report generation.
 */
import { describe, it, expect } from 'vitest';
import {
  formatDriftReport,
} from '../../../../../src/core/spec/drift/report.js';
import type { DriftReportResult } from '../../../../../src/core/spec/drift/report.js';

describe('drift report', () => {
  const makeResult = (overrides: Partial<DriftReportResult> = {}): DriftReportResult => ({
    valid: true,
    issues: [],
    summary: {
      errors: 0,
      warnings: 0,
      info: 0,
      specCoverage: 100,
      implCoverage: 100,
    },
    formattedOutput: '',
    ...overrides,
  });

  describe('formatDriftReport', () => {
    describe('terminal format', () => {
      it('shows header and summary', () => {
        const result = makeResult();
        const output = formatDriftReport(result, 'terminal');

        expect(output).toContain('Drift Report');
        expect(output).toContain('Errors: 0');
        expect(output).toContain('Warnings: 0');
        expect(output).toContain('Spec Coverage: 100%');
        expect(output).toContain('Impl Coverage: 100%');
      });

      it('shows no drift message when clean', () => {
        const result = makeResult();
        const output = formatDriftReport(result, 'terminal');
        expect(output).toContain('No drift detected');
      });

      it('lists issues with severity labels', () => {
        const result = makeResult({
          valid: false,
          issues: [
            {
              type: 'unwired_spec',
              severity: 'error',
              specId: 'spec.test',
              message: 'No implementation',
              suggestion: 'Add implementation',
            },
            {
              type: 'undocumented_impl',
              severity: 'info',
              path: 'src/utils.ts',
              message: 'No spec',
            },
          ],
          summary: { errors: 1, warnings: 0, info: 1, specCoverage: 50, implCoverage: 50 },
        });

        const output = formatDriftReport(result, 'terminal');
        expect(output).toContain('ERROR');
        expect(output).toContain('spec.test');
        expect(output).toContain('No implementation');
        expect(output).toContain('suggestion: Add implementation');
        expect(output).toContain('INFO');
      });
    });

    describe('json format', () => {
      it('returns valid JSON', () => {
        const result = makeResult();
        const output = formatDriftReport(result, 'json');
        const parsed = JSON.parse(output);

        expect(parsed.valid).toBe(true);
        expect(parsed.issues).toEqual([]);
        expect(parsed.summary.errors).toBe(0);
      });

      it('excludes formattedOutput to avoid recursion', () => {
        const result = makeResult();
        const output = formatDriftReport(result, 'json');
        const parsed = JSON.parse(output);

        expect(parsed.formattedOutput).toBeUndefined();
      });
    });

    describe('markdown format', () => {
      it('produces markdown with heading', () => {
        const result = makeResult();
        const output = formatDriftReport(result, 'markdown');
        expect(output).toContain('# Drift Report');
        expect(output).toContain('**Spec Coverage:**');
      });

      it('groups issues by severity', () => {
        const result = makeResult({
          valid: false,
          issues: [
            { type: 'unwired_spec', severity: 'error', specId: 's1', message: 'err' },
            { type: 'undocumented_impl', severity: 'warning', specId: 's2', message: 'warn' },
            { type: 'undocumented_impl', severity: 'info', path: 'p1', message: 'info', suggestion: 'spec.p1' },
          ],
          summary: { errors: 1, warnings: 1, info: 1, specCoverage: 50, implCoverage: 50 },
        });

        const output = formatDriftReport(result, 'markdown');
        expect(output).toContain('## Errors (1)');
        expect(output).toContain('## Warnings (1)');
        expect(output).toContain('## Info (1)');
      });

      it('shows no drift message when clean', () => {
        const result = makeResult();
        const output = formatDriftReport(result, 'markdown');
        expect(output).toContain('No drift detected');
      });
    });

    it('defaults to terminal format', () => {
      const result = makeResult();
      const output = formatDriftReport(result);
      expect(output).toContain('Drift Report');
      expect(output).toContain('============');
    });
  });
});
