/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the compact formatter.
 */
import { describe, it, expect } from 'vitest';
import { CompactFormatter } from '../../../../src/cli/formatters/compact.js';
import type { ValidationResult, BatchValidationResult } from '../../../../src/core/validation/types.js';

describe('CompactFormatter', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const formatter = new CompactFormatter();
      expect(formatter).toBeDefined();
    });

    it('should create with errorsOnly option', () => {
      const formatter = new CompactFormatter({ errorsOnly: true });
      expect(formatter).toBeDefined();
    });
  });

  describe('formatResult', () => {
    it('should format result with violations', () => {
      const formatter = new CompactFormatter();
      const result: ValidationResult = {
        status: 'failed',
        file: 'src/test.ts',
        archId: 'test.arch',
        inheritanceChain: [],
        mixinsApplied: [],
        violations: [
          {
            code: 'E001',
            rule: 'forbid_import',
            value: 'axios',
            message: 'Import forbidden',
            severity: 'error',
            line: 10,
          },
        ],
        warnings: [],
        overridesActive: [],
        passed: false,
        errorCount: 1,
        warningCount: 0,
      };

      const output = formatter.formatResult(result);
      expect(output).toContain('src/test.ts:10');
      expect(output).toContain('ERROR');
      expect(output).toContain('forbid_import:axios');
    });

    it('should format result with warnings when errorsOnly is false', () => {
      const formatter = new CompactFormatter({ errorsOnly: false });
      const result: ValidationResult = {
        status: 'warned',
        file: 'src/test.ts',
        archId: 'test.arch',
        inheritanceChain: [],
        mixinsApplied: [],
        violations: [],
        warnings: [
          {
            code: 'W001',
            rule: 'max_file_lines',
            value: 500,
            message: 'File too long',
            severity: 'warning',
            line: 1,
          },
        ],
        overridesActive: [],
        passed: true,
        errorCount: 0,
        warningCount: 1,
      };

      const output = formatter.formatResult(result);
      expect(output).toContain('WARN');
      expect(output).toContain('max_file_lines');
    });

    it('should skip warnings when errorsOnly is true', () => {
      const formatter = new CompactFormatter({ errorsOnly: true });
      const result: ValidationResult = {
        status: 'warned',
        file: 'src/test.ts',
        archId: 'test.arch',
        inheritanceChain: [],
        mixinsApplied: [],
        violations: [],
        warnings: [
          {
            code: 'W001',
            rule: 'max_file_lines',
            value: 500,
            message: 'File too long',
            severity: 'warning',
          },
        ],
        overridesActive: [],
        passed: true,
        errorCount: 0,
        warningCount: 1,
      };

      const output = formatter.formatResult(result);
      expect(output).toBe('');
    });
  });

  describe('formatBatch', () => {
    it('should format batch with summary', () => {
      const formatter = new CompactFormatter();
      const batch: BatchValidationResult = {
        results: [
          {
            status: 'passed',
            file: 'src/a.ts',
            archId: 'test.arch',
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
          total: 1,
          passed: 1,
          failed: 0,
          warned: 0,
          skipped: 0,
          missingArch: 0,
        },
      };

      const output = formatter.formatBatch(batch);
      expect(output).toContain('SUMMARY');
      expect(output).toContain('0 issues');
      expect(output).toContain('1 file');
    });

    it('should format batch with errors', () => {
      const formatter = new CompactFormatter();
      const batch: BatchValidationResult = {
        results: [
          {
            status: 'failed',
            file: 'src/a.ts',
            archId: 'test.arch',
            inheritanceChain: [],
            mixinsApplied: [],
            violations: [
              {
                code: 'E001',
                rule: 'forbid_import',
                value: 'axios',
                message: 'Import forbidden',
                severity: 'error',
              },
            ],
            warnings: [],
            overridesActive: [],
            passed: false,
            errorCount: 1,
            warningCount: 0,
          },
        ],
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          warned: 0,
          skipped: 0,
          missingArch: 0,
        },
      };

      const output = formatter.formatBatch(batch);
      expect(output).toContain('1 error');
    });
  });
});
