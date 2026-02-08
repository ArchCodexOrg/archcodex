/**
 * @arch archcodex.test.unit
 *
 * Tests for unit test generator.
 */
import { describe, it, expect } from 'vitest';
import {
  generateUnitTests,
  extractManualCode,
  mergeWithExisting,
} from '../../../../../src/core/spec/generators/unit.js';
import type { ResolvedSpec } from '../../../../../src/core/spec/schema.js';

describe('Unit Test Generator', () => {
  const createSpec = (overrides: Partial<ResolvedSpec['node']> = {}): ResolvedSpec => ({
    specId: 'spec.test.example',
    inheritanceChain: ['spec.test.example'],
    appliedMixins: [],
    node: {
      intent: 'Test function',
      implementation: 'src/test.ts#testFunction',
      inputs: {
        name: { type: 'string', required: true },
      },
      outputs: {
        result: { type: 'string' },
      },
      examples: {
        success: [
          { name: 'valid input', given: { name: 'Alice' }, then: { 'result': 'Hello, Alice!' } },
        ],
        errors: [
          { name: 'empty name', given: { name: '' }, then: { error: 'INVALID_NAME' } },
        ],
      },
      ...overrides,
    },
  });

  describe('generateUnitTests', () => {
    it('generates test file from spec', () => {
      const spec = createSpec();
      const result = generateUnitTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('describe');
      expect(result.code).toContain('valid input');
    });

    it('generates success example tests', () => {
      const spec = createSpec();
      const result = generateUnitTests(spec);

      expect(result.code).toContain('success');
      expect(result.code).toContain('Hello, Alice!');
    });

    it('generates error example tests', () => {
      const spec = createSpec();
      const result = generateUnitTests(spec);

      expect(result.code).toContain('error cases');
      expect(result.code).toContain('INVALID_NAME');
    });

    it('generates boundary tests', () => {
      const spec = createSpec({
        examples: {
          boundaries: [
            { name: 'max length', given: { name: '@string(100)' }, then: { result: '@exists' } },
          ],
        },
      });
      const result = generateUnitTests(spec);

      expect(result.code).toContain('boundary cases');
      expect(result.code).toContain('max length');
    });

    it('includes import for implementation', () => {
      const spec = createSpec();
      const result = generateUnitTests(spec);

      expect(result.code).toContain('import');
      expect(result.code).toContain('testFunction');
    });

    it('uses vitest framework by default', () => {
      const spec = createSpec();
      const result = generateUnitTests(spec, { framework: 'vitest' });

      expect(result.code).toContain("from 'vitest'");
    });

    it('can use jest framework', () => {
      const spec = createSpec();
      const result = generateUnitTests(spec, { framework: 'jest' });

      expect(result.code).not.toContain("from 'vitest'");
    });
  });

  describe('extractManualCode', () => {
    it('extracts manual code blocks', () => {
      const existing = `
before content
// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
generated code
// @speccodex:end
after content
`;
      const manual = extractManualCode(existing);
      expect(manual).not.toBeNull();
      expect(manual?.before).toContain('before content');
      expect(manual?.after).toContain('after content');
    });

    it('returns null for no markers', () => {
      const existing = `
// AUTO-GENERATED
it('test', () => {});
`;
      const manual = extractManualCode(existing);
      expect(manual).toBeNull();
    });
  });

  describe('mergeWithExisting', () => {
    it('preserves manual code around markers', () => {
      const generated = `
// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
describe('test', () => {
  it('auto test', () => {});
});
// @speccodex:end
`;
      const existing = `
// manual before
// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
it('old auto test', () => {});
// @speccodex:end
// manual after
`;
      const merged = mergeWithExisting(generated, existing);
      expect(merged).toContain('auto test');
      expect(merged).toContain('manual before');
      expect(merged).toContain('manual after');
    });
  });

  // Gap 4: Architecture-aware error patterns
  describe('architecture-aware error patterns (Gap 4)', () => {
    it('uses toMatchObject for convex architecture', () => {
      const spec = createSpec({
        architectures: ['convex.mutation'],
        examples: {
          errors: [
            { name: 'not found', given: { id: 'missing' }, then: { error: 'NOT_FOUND' } },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('.rejects.toMatchObject');
      expect(result.code).toContain("data: { code: 'NOT_FOUND' }");
    });

    it('uses toThrow for standard architecture', () => {
      const spec = createSpec({
        architectures: ['archcodex.core.domain'],
        examples: {
          errors: [
            { name: 'invalid input', given: { name: '' }, then: { error: 'INVALID_INPUT' } },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain(".rejects.toThrow('INVALID_INPUT')");
      expect(result.code).not.toContain('toMatchObject');
    });

    it('defaults to toThrow when no architecture specified', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test.noarch',
        inheritanceChain: ['spec.test.noarch'],
        appliedMixins: [],
        node: {
          intent: 'Test without architecture',
          examples: {
            errors: [
              { name: 'fails', given: { x: 'bad' }, then: { error: 'NULL_ERROR' } },
            ],
          },
        },
      };

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain(".rejects.toThrow('NULL_ERROR')");
      expect(result.code).not.toContain('toMatchObject');
    });

    it('convex architecture does not affect success tests', () => {
      const spec = createSpec({
        architectures: ['convex.mutation'],
        examples: {
          success: [
            { name: 'valid input', given: { name: 'Alice' }, then: { 'result': 'Hello, Alice!' } },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('valid input');
      expect(result.code).not.toContain('toMatchObject');
    });
  });
});
