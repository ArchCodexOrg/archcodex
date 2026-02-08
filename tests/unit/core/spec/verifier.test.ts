/**
 * @arch archcodex.test.unit
 *
 * Tests for spec verifier.
 */
import { describe, it, expect } from 'vitest';
import {
  inferImplementationPath,
  formatVerifyResult,
  type VerifyResult,
} from '../../../../src/core/spec/verifier.js';

describe('Spec Verifier', () => {
  describe('inferImplementationPath', () => {
    it('infers path from spec file location', () => {
      const result = inferImplementationPath('.arch/specs/test/example.spec.yaml');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('returns a valid file path', () => {
      const result = inferImplementationPath('.arch/specs/core/example.spec.yaml');

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('formatVerifyResult', () => {
    const createVerifyResult = (overrides: Partial<VerifyResult> = {}): VerifyResult => ({
      specId: 'spec.test',
      implementation: 'src/test.ts',
      verified: true,
      drift: [],
      missingExports: [],
      coverage: {
        inputsCovered: 2,
        inputsTotal: 2,
        outputsCovered: 1,
        outputsTotal: 1,
        errorsCovered: 1,
        errorsTotal: 1,
      },
      ...overrides,
    });

    it('formats verify result as string', () => {
      const result = formatVerifyResult(createVerifyResult());

      expect(typeof result).toBe('string');
      expect(result).toContain('spec.test');
    });

    it('includes drift section in output when drift exists', () => {
      const result = formatVerifyResult(createVerifyResult({
        verified: false,
        drift: [
          { type: 'missing_export', name: 'testFunction' },
        ],
        missingExports: ['testFunction'],
      }));

      expect(result).toContain('Drift');
      expect(result).toContain('missing_export');
    });

    it('shows coverage statistics', () => {
      const result = formatVerifyResult(createVerifyResult({
        coverage: {
          inputsCovered: 1,
          inputsTotal: 2,
          outputsCovered: 1,
          outputsTotal: 1,
          errorsCovered: 0,
          errorsTotal: 1,
        },
      }));

      expect(result).toContain('Coverage');
      expect(result).toContain('Inputs');
    });
  });
});
