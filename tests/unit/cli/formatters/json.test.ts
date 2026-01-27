/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the JSON formatter.
 */
import { describe, it, expect } from 'vitest';
import { JsonFormatter } from '../../../../src/cli/formatters/json.js';
import type { ValidationResult, BatchValidationResult } from '../../../../src/core/validation/types.js';

describe('JsonFormatter', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const formatter = new JsonFormatter();
      expect(formatter).toBeDefined();
    });

    it('should create with errorsOnly option', () => {
      const formatter = new JsonFormatter({ errorsOnly: true });
      expect(formatter).toBeDefined();
    });
  });

  describe('formatResult', () => {
    it('should format result as valid JSON', () => {
      const formatter = new JsonFormatter();
      const result: ValidationResult = {
        status: 'passed',
        file: 'src/test.ts',
        archId: 'test.arch',
        inheritanceChain: ['base', 'test.arch'],
        mixinsApplied: ['tested'],
        violations: [],
        warnings: [],
        overridesActive: [],
        passed: true,
        errorCount: 0,
        warningCount: 0,
      };

      const output = formatter.formatResult(result);
      const parsed = JSON.parse(output);

      expect(parsed.status).toBe('passed');
      expect(parsed.file).toBe('src/test.ts');
      expect(parsed.arch_id).toBe('test.arch');
      expect(parsed.passed).toBe(true);
    });

    it('should include violations with structured data', () => {
      const formatter = new JsonFormatter();
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
            column: 5,
            why: 'Use built-in fetch',
            fixHint: 'Replace axios with fetch',
          },
        ],
        warnings: [],
        overridesActive: [],
        passed: false,
        errorCount: 1,
        warningCount: 0,
      };

      const output = formatter.formatResult(result);
      const parsed = JSON.parse(output);

      expect(parsed.violations).toHaveLength(1);
      expect(parsed.violations[0].rule).toBe('forbid_import');
      expect(parsed.violations[0].value).toBe('axios');
      expect(parsed.violations[0].actions).toBeDefined();
      expect(parsed.violations[0].actions.length).toBeGreaterThan(0);
    });

    it('should include didYouMean suggestions', () => {
      const formatter = new JsonFormatter();
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
            didYouMean: {
              file: 'src/utils/http.ts',
              export: 'httpClient',
              description: 'HTTP client wrapper',
            },
          },
        ],
        warnings: [],
        overridesActive: [],
        passed: false,
        errorCount: 1,
        warningCount: 0,
      };

      const output = formatter.formatResult(result);
      const parsed = JSON.parse(output);

      expect(parsed.violations[0].did_you_mean).toBeDefined();
      expect(parsed.violations[0].did_you_mean.file).toBe('src/utils/http.ts');
    });

    it('should skip warnings when errorsOnly is true', () => {
      const formatter = new JsonFormatter({ errorsOnly: true });
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
      const parsed = JSON.parse(output);

      expect(parsed.warnings).toHaveLength(0);
      expect(parsed.warning_count).toBe(0);
    });
  });

  describe('formatBatch', () => {
    it('should format batch as valid JSON', () => {
      const formatter = new JsonFormatter();
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
      const parsed = JSON.parse(output);

      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.total).toBe(1);
      expect(parsed.results).toHaveLength(1);
    });

    it('should include overrides with all fields', () => {
      const formatter = new JsonFormatter();
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
            overridesActive: [
              {
                rule: 'forbid_import',
                value: 'axios',
                reason: 'Legacy code',
                expires: '2025-12-31',
                ticket: 'TECH-123',
              },
            ],
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
      const parsed = JSON.parse(output);

      expect(parsed.results[0].overrides_active).toHaveLength(1);
      expect(parsed.results[0].overrides_active[0].rule).toBe('forbid_import');
      expect(parsed.results[0].overrides_active[0].ticket).toBe('TECH-123');
    });
  });
});
