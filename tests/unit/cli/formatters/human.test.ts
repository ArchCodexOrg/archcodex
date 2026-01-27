/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the human formatter.
 */
import { describe, it, expect } from 'vitest';
import { HumanFormatter } from '../../../../src/cli/formatters/human.js';
import type { ValidationResult, BatchValidationResult } from '../../../../src/core/validation/types.js';

describe('HumanFormatter', () => {
  describe('constructor', () => {
    it('should create formatter with default options', () => {
      const formatter = new HumanFormatter();
      expect(formatter).toBeDefined();
    });

    it('should create formatter with custom options', () => {
      const formatter = new HumanFormatter({
        colors: false,
        verbose: true,
        showPassing: true,
        errorsOnly: true,
      });
      expect(formatter).toBeDefined();
    });
  });

  describe('formatResult', () => {
    it('should format passing result', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'pass',
        violations: [],
        warnings: [],
        errorCount: 0,
        warningCount: 0,
        inheritanceChain: ['base', 'test.arch'],
        mixinsApplied: ['tested'],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('PASS');
      expect(output).toContain('/test/file.ts');
      expect(output).toContain('test.arch');
    });

    it('should format failing result with violations', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'fail',
        violations: [
          {
            rule: 'forbid_import',
            value: 'axios',
            message: 'Import of axios is forbidden',
            line: 10,
            severity: 'error',
          },
        ],
        warnings: [],
        errorCount: 1,
        warningCount: 0,
        inheritanceChain: ['test.arch'],
        mixinsApplied: [],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('FAIL');
      expect(output).toContain('ERRORS');
      expect(output).toContain('forbid_import');
      expect(output).toContain('axios');
      expect(output).toContain('Line 10');
    });

    it('should format warning result', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'warn',
        violations: [],
        warnings: [
          {
            rule: 'max_file_lines',
            value: 500,
            message: 'File exceeds recommended line count',
            severity: 'warning',
          },
        ],
        errorCount: 0,
        warningCount: 1,
        inheritanceChain: ['test.arch'],
        mixinsApplied: [],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('WARN');
      expect(output).toContain('WARNINGS');
      expect(output).toContain('max_file_lines');
    });

    it('should show (none) for missing architecture', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: null,
        status: 'fail',
        violations: [],
        warnings: [],
        errorCount: 0,
        warningCount: 0,
        inheritanceChain: [],
        mixinsApplied: [],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('(none)');
    });

    it('should show inheritance chain in verbose mode', () => {
      const formatter = new HumanFormatter({ colors: false, verbose: true });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'pass',
        violations: [],
        warnings: [],
        errorCount: 0,
        warningCount: 0,
        inheritanceChain: ['base', 'core', 'test.arch'],
        mixinsApplied: ['tested', 'srp'],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('Inheritance:');
      expect(output).toContain('base');
      expect(output).toContain('Mixins:');
      expect(output).toContain('tested');
    });

    it('should show active overrides', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'pass',
        violations: [],
        warnings: [],
        errorCount: 0,
        warningCount: 0,
        inheritanceChain: ['test.arch'],
        mixinsApplied: [],
        overridesActive: [
          {
            rule: 'forbid_import',
            value: 'axios',
            reason: 'Legacy code',
            expires: '2025-06-01',
          },
        ],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('ACTIVE OVERRIDES');
      expect(output).toContain('forbid_import');
      expect(output).toContain('Legacy code');
      expect(output).toContain('2025-06-01');
    });

    it('should show override warning', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'warn',
        violations: [],
        warnings: [],
        errorCount: 0,
        warningCount: 0,
        inheritanceChain: ['test.arch'],
        mixinsApplied: [],
        overridesActive: [
          {
            rule: 'forbid_import',
            value: 'axios',
            reason: 'Legacy code',
            warning: 'Override expires in 7 days',
          },
        ],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('Override expires');
    });

    it('should show violation source', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'fail',
        violations: [
          {
            rule: 'forbid_import',
            value: 'axios',
            message: 'Import forbidden',
            severity: 'error',
            source: 'base',
          },
        ],
        warnings: [],
        errorCount: 1,
        warningCount: 0,
        inheritanceChain: ['test.arch'],
        mixinsApplied: [],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('Source: base');
    });

    it('should show violation why field', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'fail',
        violations: [
          {
            rule: 'forbid_import',
            value: 'axios',
            message: 'Import forbidden',
            severity: 'error',
            why: 'Use ApiClient for consistent error handling',
          },
        ],
        warnings: [],
        errorCount: 1,
        warningCount: 0,
        inheritanceChain: ['test.arch'],
        mixinsApplied: [],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('Why:');
      expect(output).toContain('ApiClient');
    });

    it('should show fixHint', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'fail',
        violations: [
          {
            rule: 'forbid_import',
            value: 'axios',
            message: 'Import forbidden',
            severity: 'error',
            fixHint: 'Replace with ApiClient from src/core/api',
          },
        ],
        warnings: [],
        errorCount: 1,
        warningCount: 0,
        inheritanceChain: ['test.arch'],
        mixinsApplied: [],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('Fix:');
      expect(output).toContain('ApiClient');
    });

    it('should show alternatives', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'fail',
        violations: [
          {
            rule: 'forbid_import',
            value: 'axios',
            message: 'Import forbidden',
            severity: 'error',
            alternatives: [
              { module: 'src/core/api/client', export: 'ApiClient', description: 'HTTP client with logging' },
            ],
          },
        ],
        warnings: [],
        errorCount: 1,
        warningCount: 0,
        inheritanceChain: ['test.arch'],
        mixinsApplied: [],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('Alternatives:');
      expect(output).toContain('src/core/api/client');
      expect(output).toContain('ApiClient');
    });

    it('should show didYouMean', () => {
      const formatter = new HumanFormatter({ colors: false });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'fail',
        violations: [
          {
            rule: 'forbid_import',
            value: 'axios',
            message: 'Import forbidden',
            severity: 'error',
            didYouMean: {
              file: 'src/utils/http.ts',
              export: 'httpClient',
              description: 'Standard HTTP client',
            },
          },
        ],
        warnings: [],
        errorCount: 1,
        warningCount: 0,
        inheritanceChain: ['test.arch'],
        mixinsApplied: [],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('Did you mean:');
      expect(output).toContain('src/utils/http.ts');
      expect(output).toContain('httpClient');
    });

    it('should skip warnings when errorsOnly is true', () => {
      const formatter = new HumanFormatter({ colors: false, errorsOnly: true });
      const result: ValidationResult = {
        file: '/test/file.ts',
        archId: 'test.arch',
        status: 'fail',
        violations: [
          {
            rule: 'forbid_import',
            value: 'axios',
            message: 'Import forbidden',
            severity: 'error',
          },
        ],
        warnings: [
          {
            rule: 'max_file_lines',
            value: 500,
            message: 'File too long',
            severity: 'warning',
          },
        ],
        errorCount: 1,
        warningCount: 1,
        inheritanceChain: ['test.arch'],
        mixinsApplied: [],
        overridesActive: [],
      };

      const output = formatter.formatResult(result);

      expect(output).toContain('ERRORS');
      expect(output).not.toContain('WARNINGS');
    });
  });

  describe('formatBatch', () => {
    it('should format batch results with summary', () => {
      const formatter = new HumanFormatter({ colors: false, showPassing: true });
      const batch: BatchValidationResult = {
        results: [
          {
            file: '/test/a.ts',
            archId: 'test.arch',
            status: 'pass',
            violations: [],
            warnings: [],
            errorCount: 0,
            warningCount: 0,
            inheritanceChain: ['test.arch'],
            mixinsApplied: [],
            overridesActive: [],
          },
          {
            file: '/test/b.ts',
            archId: 'test.arch',
            status: 'fail',
            violations: [{ rule: 'forbid_import', value: 'axios', message: 'Forbidden', severity: 'error' }],
            warnings: [],
            errorCount: 1,
            warningCount: 0,
            inheritanceChain: ['test.arch'],
            mixinsApplied: [],
            overridesActive: [],
          },
        ],
        summary: {
          total: 2,
          passed: 1,
          failed: 1,
          warned: 0,
          totalErrors: 1,
          totalWarnings: 0,
          activeOverrides: 0,
        },
      };

      const output = formatter.formatBatch(batch);

      expect(output).toContain('SUMMARY');
      expect(output).toContain('1 passed');
      expect(output).toContain('1 failed');
      expect(output).toContain('Total files: 2');
    });

    it('should skip passing files when showPassing is false', () => {
      const formatter = new HumanFormatter({ colors: false, showPassing: false });
      const batch: BatchValidationResult = {
        results: [
          {
            file: '/test/pass.ts',
            archId: 'test.arch',
            status: 'pass',
            violations: [],
            warnings: [],
            errorCount: 0,
            warningCount: 0,
            inheritanceChain: ['test.arch'],
            mixinsApplied: [],
            overridesActive: [],
          },
          {
            file: '/test/fail.ts',
            archId: 'test.arch',
            status: 'fail',
            violations: [{ rule: 'forbid_import', value: 'axios', message: 'Forbidden', severity: 'error' }],
            warnings: [],
            errorCount: 1,
            warningCount: 0,
            inheritanceChain: ['test.arch'],
            mixinsApplied: [],
            overridesActive: [],
          },
        ],
        summary: {
          total: 2,
          passed: 1,
          failed: 1,
          warned: 0,
          totalErrors: 1,
          totalWarnings: 0,
          activeOverrides: 0,
        },
      };

      const output = formatter.formatBatch(batch);

      expect(output).not.toContain('/test/pass.ts');
      expect(output).toContain('/test/fail.ts');
    });

    it('should skip warn-only files when errorsOnly is true', () => {
      const formatter = new HumanFormatter({ colors: false, errorsOnly: true });
      const batch: BatchValidationResult = {
        results: [
          {
            file: '/test/warn.ts',
            archId: 'test.arch',
            status: 'warn',
            violations: [],
            warnings: [{ rule: 'max_file_lines', value: 500, message: 'Too long', severity: 'warning' }],
            errorCount: 0,
            warningCount: 1,
            inheritanceChain: ['test.arch'],
            mixinsApplied: [],
            overridesActive: [],
          },
          {
            file: '/test/fail.ts',
            archId: 'test.arch',
            status: 'fail',
            violations: [{ rule: 'forbid_import', value: 'axios', message: 'Forbidden', severity: 'error' }],
            warnings: [],
            errorCount: 1,
            warningCount: 0,
            inheritanceChain: ['test.arch'],
            mixinsApplied: [],
            overridesActive: [],
          },
        ],
        summary: {
          total: 2,
          passed: 0,
          failed: 1,
          warned: 1,
          totalErrors: 1,
          totalWarnings: 1,
          activeOverrides: 0,
        },
      };

      const output = formatter.formatBatch(batch);

      expect(output).not.toContain('/test/warn.ts');
      expect(output).toContain('/test/fail.ts');
    });

    it('should show active overrides count in summary', () => {
      const formatter = new HumanFormatter({ colors: false });
      const batch: BatchValidationResult = {
        results: [],
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          warned: 0,
          totalErrors: 0,
          totalWarnings: 0,
          activeOverrides: 3,
        },
      };

      const output = formatter.formatBatch(batch);

      expect(output).toContain('Active overrides: 3');
    });
  });

  describe('formatSuggestions', () => {
    it('should return empty string for no suggestions', () => {
      const formatter = new HumanFormatter({ colors: false });
      const output = formatter.formatSuggestions('test.arch', []);

      expect(output).toBe('');
    });

    it('should format parent suggestions', () => {
      const formatter = new HumanFormatter({ colors: false });
      const output = formatter.formatSuggestions('test.specific', [
        {
          archId: 'test.general',
          relationship: 'parent',
          description: 'More general architecture',
          constraintsRemoved: 3,
          constraintsAdded: 1,
        },
      ]);

      expect(output).toContain('ALTERNATIVE ARCHITECTURES');
      expect(output).toContain('test.general');
      expect(output).toContain('(parent)');
      expect(output).toContain('-3 constraints');
      expect(output).toContain('+1 new');
    });

    it('should format sibling suggestions', () => {
      const formatter = new HumanFormatter({ colors: false });
      const output = formatter.formatSuggestions('test.a', [
        {
          archId: 'test.b',
          relationship: 'sibling',
          description: 'Alternative architecture',
          constraintsRemoved: 2,
          constraintsAdded: 2,
        },
      ]);

      expect(output).toContain('test.b');
      expect(output).toContain('(sibling)');
    });

    it('should show diff-arch preview command', () => {
      const formatter = new HumanFormatter({ colors: false });
      const output = formatter.formatSuggestions('current.arch', [
        {
          archId: 'suggested.arch',
          relationship: 'parent',
          constraintsRemoved: 1,
          constraintsAdded: 0,
        },
      ]);

      expect(output).toContain('archcodex diff-arch current.arch suggested.arch');
    });
  });
});
