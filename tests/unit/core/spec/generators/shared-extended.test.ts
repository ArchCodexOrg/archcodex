/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Extended tests for shared generator utilities - targeting uncovered functions and branches.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveTestName,
  toValidIdentifier,
  suggestImportPath,
  escapeString,
  generateFunctionCallCode,
  generateOutputSchemaAssertions,
  extractExampleOutput,
  extractExampleInput,
  generateAssertionsFromThen,
  expandValue,
  generateAssertion,
  keyToVarPath,
} from '../../../../../src/core/spec/generators/shared.js';
import type { ResolvedSpec } from '../../../../../src/core/spec/schema.js';

describe('Shared Generator Utilities - extended coverage', () => {
  describe('deriveTestName', () => {
    it('returns "succeeds" for empty given and then', () => {
      const result = deriveTestName(undefined, undefined, false);
      expect(result).toBe('succeeds');
    });

    it('returns "fails" for error case with no given/then', () => {
      const result = deriveTestName(undefined, undefined, true);
      expect(result).toBe('fails');
    });

    it('derives name from error code in then', () => {
      const result = deriveTestName({}, { error: 'NOT_FOUND' });
      expect(result).toContain('throws NOT_FOUND');
    });

    it('derives name from error.code in then', () => {
      const result = deriveTestName({}, { 'error.code': 'INVALID_INPUT' });
      expect(result).toContain('throws INVALID_INPUT');
    });

    it('derives "returns invalid" when result.valid is false', () => {
      const result = deriveTestName({}, { 'result.valid': false });
      expect(result).toContain('returns invalid');
    });

    it('derives name from result keys', () => {
      const result = deriveTestName({}, { 'result.url': 'https://example.com' });
      expect(result).toContain('returns url');
    });

    it('uses "succeeds" when then has no result keys', () => {
      const result = deriveTestName({}, { status: 200 });
      expect(result).toBe('succeeds');
    });

    it('derives condition from null given value', () => {
      const result = deriveTestName({ title: null }, { 'result.valid': false });
      expect(result).toContain('title is missing');
    });

    it('derives condition from empty string given value', () => {
      const result = deriveTestName({ name: '' }, { 'result.valid': false });
      expect(result).toContain('name is empty');
    });

    it('derives condition from string given value', () => {
      const result = deriveTestName({ title: 'Hello World' }, {});
      expect(result).toContain('title="Hello World"');
    });

    it('truncates long string values', () => {
      const result = deriveTestName({ title: 'This is a very long title that should be truncated' }, {});
      expect(result).toContain('...');
    });

    it('derives condition from number given value', () => {
      const result = deriveTestName({ count: 42 }, {});
      expect(result).toContain('count=42');
    });

    it('derives condition from boolean given value', () => {
      const result = deriveTestName({ active: true }, {});
      expect(result).toContain('active=true');
    });

    it('skips << anchor and user keys', () => {
      const result = deriveTestName({ '<<': 'ref', user: '@authenticated', title: 'test' }, {});
      expect(result).not.toContain('<<');
      expect(result).not.toContain('authenticated');
    });

    it('limits conditions to first 2', () => {
      const result = deriveTestName({ a: 'x', b: 'y', c: 'z' }, {});
      // Should have at most 2 conditions joined by "and"
      const conditionPart = result.replace(/^succeeds when /, '');
      const conditions = conditionPart.split(' and ');
      expect(conditions.length).toBeLessThanOrEqual(2);
    });

    it('handles @string placeholder in given', () => {
      const result = deriveTestName({ title: '@string(500)' }, {});
      expect(result).toContain('500 chars');
    });

    it('handles @url placeholder in given', () => {
      const result = deriveTestName({ url: '@url(2048)' }, {});
      expect(result).toContain('long URL');
    });

    it('skips @authenticated placeholder', () => {
      const result = deriveTestName({ user: '@authenticated' }, {});
      expect(result).not.toContain('authenticated');
    });

    it('returns "creates successfully" for @created result', () => {
      const result = deriveTestName({}, { result: '@created' });
      expect(result).toContain('creates successfully');
    });

    it('returns "creates successfully" for @exists result', () => {
      const result = deriveTestName({}, { result: '@exists' });
      expect(result).toContain('creates successfully');
    });

    it('falls back to "error case" for empty parts', () => {
      // This happens when isError is true and no conditions are derived
      const result = deriveTestName({ '<<': 'ref' }, undefined, true);
      expect(result).toBe('fails');
    });
  });

  describe('toValidIdentifier', () => {
    it('returns "fn" for empty string', () => {
      expect(toValidIdentifier('')).toBe('fn');
    });

    it('converts hyphen-case to camelCase', () => {
      expect(toValidIdentifier('share-entry')).toBe('shareEntry');
    });

    it('converts snake_case to camelCase', () => {
      expect(toValidIdentifier('share_entry')).toBe('shareEntry');
    });

    it('prefixes with underscore when starts with number', () => {
      expect(toValidIdentifier('123abc')).toBe('_123abc');
    });

    it('prefixes reserved words with underscore', () => {
      expect(toValidIdentifier('class')).toBe('_class');
      expect(toValidIdentifier('function')).toBe('_function');
      expect(toValidIdentifier('import')).toBe('_import');
      expect(toValidIdentifier('await')).toBe('_await');
    });

    it('keeps valid identifiers unchanged', () => {
      expect(toValidIdentifier('myFunction')).toBe('myFunction');
    });
  });

  describe('suggestImportPath', () => {
    it('handles single-part spec ID', () => {
      // After removing "spec." prefix, empty string splits to [''] (length 1)
      // Falls through to default path
      const result = suggestImportPath('spec.');
      expect(result).toContain('./');
    });

    it('suggests convex mutation path', () => {
      const result = suggestImportPath('spec.products.create', ['convex.mutation']);
      expect(result).toBe('convex/products/mutations.js');
    });

    it('suggests convex query path', () => {
      const result = suggestImportPath('spec.products.list', ['convex.query']);
      expect(result).toBe('convex/products/queries.js');
    });

    it('suggests convex action path', () => {
      const result = suggestImportPath('spec.products.process', ['convex.action']);
      expect(result).toBe('convex/products/actions.js');
    });

    it('suggests convex helper path', () => {
      const result = suggestImportPath('spec.products.validate', ['convex.helper']);
      expect(result).toBe('convex/products/helpers.js');
    });

    it('handles single-part convex spec', () => {
      const result = suggestImportPath('spec.products', ['convex.mutation']);
      expect(result).toBe('convex/products.js');
    });

    it('suggests frontend hook path', () => {
      const result = suggestImportPath('spec.products.useProducts', ['frontend.hook']);
      expect(result).toBe('src/hooks/products/useProducts.js');
    });

    it('suggests frontend component path', () => {
      const result = suggestImportPath('spec.products.ProductCard', ['frontend.component']);
      expect(result).toBe('src/components/products/ProductCard.js');
    });

    it('suggests generic frontend path', () => {
      const result = suggestImportPath('spec.products.utils', ['frontend.utility']);
      expect(result).toBe('src/products/utils.js');
    });

    it('suggests default single-part path', () => {
      const result = suggestImportPath('spec.products');
      expect(result).toBe('./products.js');
    });

    it('suggests default two-part path', () => {
      const result = suggestImportPath('spec.products.create');
      expect(result).toBe('./products/create.js');
    });

    it('suggests last two segments for long paths', () => {
      const result = suggestImportPath('spec.deep.nested.module.function');
      expect(result).toBe('./module/function.js');
    });

    it('handles unknown convex subtype', () => {
      const result = suggestImportPath('spec.products.run', ['convex.custom']);
      expect(result).toBe('convex/products/custom.js');
    });
  });

  describe('escapeString', () => {
    it('escapes backslashes', () => {
      expect(escapeString('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('escapes single quotes', () => {
      expect(escapeString("it's")).toBe("it\\'s");
    });

    it('escapes newlines', () => {
      expect(escapeString('line1\nline2')).toBe('line1\\nline2');
    });

    it('handles combined escapes', () => {
      expect(escapeString("path\\to\\it's\nfile")).toBe("path\\\\to\\\\it\\'s\\nfile");
    });
  });

  describe('generateFunctionCallCode', () => {
    it('generates direct call pattern', () => {
      const result = generateFunctionCallCode('createUser', ['name', 'email'], 'direct');
      expect(result).toBe('createUser(name, email)');
    });

    it('generates destructured call pattern', () => {
      const result = generateFunctionCallCode('createUser', ['name', 'email'], 'destructured');
      expect(result).toBe('createUser({ name, email })');
    });

    it('generates factory call pattern', () => {
      const result = generateFunctionCallCode('createUser', ['name'], 'factory');
      expect(result).toBe('createUser({ name })');
    });

    it('handles empty args for direct', () => {
      const result = generateFunctionCallCode('getAll', [], 'direct');
      expect(result).toBe('getAll()');
    });

    it('handles empty args for destructured', () => {
      const result = generateFunctionCallCode('getAll', [], 'destructured');
      expect(result).toBe('getAll()');
    });
  });

  describe('generateOutputSchemaAssertions', () => {
    it('returns generic assertion for undefined outputs', () => {
      const result = generateOutputSchemaAssertions(undefined, '    ');
      expect(result).toEqual(['    expect(result).toBeDefined();']);
    });

    it('generates type assertions for string fields', () => {
      const outputs = { name: { type: 'string' } };
      const result = generateOutputSchemaAssertions(outputs, '  ');

      expect(result.some(l => l.includes("typeof result.name"))).toBe(true);
      expect(result.some(l => l.includes("'string'"))).toBe(true);
    });

    it('generates type assertions for number fields', () => {
      const outputs = { count: { type: 'number' } };
      const result = generateOutputSchemaAssertions(outputs, '  ');

      expect(result.some(l => l.includes("typeof result.count"))).toBe(true);
      expect(result.some(l => l.includes("'number'"))).toBe(true);
    });

    it('generates type assertions for boolean fields', () => {
      const outputs = { active: { type: 'boolean' } };
      const result = generateOutputSchemaAssertions(outputs, '  ');

      expect(result.some(l => l.includes("typeof result.active"))).toBe(true);
      expect(result.some(l => l.includes("'boolean'"))).toBe(true);
    });

    it('generates enum assertions', () => {
      const outputs = { status: { type: 'enum', values: ['active', 'inactive'] } };
      const result = generateOutputSchemaAssertions(outputs, '  ');

      expect(result.some(l => l.includes('toContain'))).toBe(true);
    });

    it('generates array assertions', () => {
      const outputs = { items: { type: 'array' } };
      const result = generateOutputSchemaAssertions(outputs, '  ');

      expect(result.some(l => l.includes('Array.isArray'))).toBe(true);
    });

    it('generates object assertions', () => {
      const outputs = { meta: { type: 'object' } };
      const result = generateOutputSchemaAssertions(outputs, '  ');

      expect(result.some(l => l.includes("typeof result.meta"))).toBe(true);
      expect(result.some(l => l.includes("'object'"))).toBe(true);
    });

    it('generates ID field assertion', () => {
      const outputs = { _id: { type: 'string' } };
      const result = generateOutputSchemaAssertions(outputs, '  ');

      expect(result.some(l => l.includes('result._id'))).toBe(true);
    });

    it('limits assertions to 4 after result.toBeDefined()', () => {
      const outputs: Record<string, unknown> = {};
      for (let i = 0; i < 10; i++) {
        outputs[`field${i}`] = { type: 'string' };
      }
      const result = generateOutputSchemaAssertions(outputs, '  ');

      // Should have at most 5 lines (1 toBeDefined + 4 field assertions)
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('extractExampleOutput', () => {
    it('returns null when no examples', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {},
      };
      expect(extractExampleOutput(spec)).toBeNull();
    });

    it('returns success example then', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {
          examples: {
            success: [{ name: 'ok', given: {}, then: { 'result.id': '123' } }],
          },
        },
      };
      const result = extractExampleOutput(spec);
      expect(result).toEqual({ 'result.id': '123' });
    });

    it('returns null when success has no then', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {
          examples: {
            success: [{ name: 'ok', given: {} }],
          },
        },
      };
      expect(extractExampleOutput(spec)).toBeNull();
    });

    it('falls back to boundary example then', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {
          examples: {
            boundaries: [{ name: 'boundary', then: { 'result.valid': true } }],
          },
        },
      };
      const result = extractExampleOutput(spec);
      expect(result).toEqual({ 'result.valid': true });
    });

    it('returns null when boundaries have no then', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {
          examples: {
            boundaries: [{ name: 'boundary' }],
          },
        },
      };
      expect(extractExampleOutput(spec)).toBeNull();
    });
  });

  describe('extractExampleInput', () => {
    it('returns null when no examples', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {},
      };
      expect(extractExampleInput(spec)).toBeNull();
    });

    it('returns success example given', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {
          examples: {
            success: [{ name: 'ok', given: { title: 'Test' }, then: {} }],
          },
        },
      };
      const result = extractExampleInput(spec);
      expect(result).toEqual({ title: 'Test' });
    });

    it('returns null when success has no given', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {
          examples: {
            success: [{ name: 'ok', then: {} }],
          },
        },
      };
      expect(extractExampleInput(spec)).toBeNull();
    });

    it('extracts boundary given', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {
          examples: {
            boundaries: [{ name: 'edge', given: { count: 0 } }],
          },
        },
      };
      const result = extractExampleInput(spec);
      expect(result).toEqual({ count: 0 });
    });

    it('extracts boundary values excluding metadata fields', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {
          examples: {
            boundaries: [{ name: 'edge', title: 'test', property: 'something' }],
          },
        },
      };
      const result = extractExampleInput(spec);
      expect(result).toEqual({ title: 'test' });
    });

    it('returns null for empty boundary with only metadata', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {
          examples: {
            boundaries: [{ name: 'edge', description: 'edge case' }],
          },
        },
      };
      expect(extractExampleInput(spec)).toBeNull();
    });
  });

  describe('generateAssertionsFromThen', () => {
    it('generates assertions for then fields', () => {
      const then = { 'result.id': '123', 'result.valid': true };
      const result = generateAssertionsFromThen(then, '  ');

      expect(result.length).toBe(2);
      expect(result[0]).toContain('expect');
    });

    it('skips error keys', () => {
      const then = { error: 'NOT_FOUND', 'error.code': 'NOT_FOUND', 'result.id': '123' };
      const result = generateAssertionsFromThen(then, '  ');

      expect(result.length).toBe(1);
      expect(result[0]).toContain('result.id');
    });
  });

  describe('expandValue - extended', () => {
    it('expands null', () => {
      expect(expandValue(null)).toBe('null');
    });

    it('expands arrays', () => {
      expect(expandValue([1, 2, 3])).toBe('[1, 2, 3]');
    });

    it('expands nested arrays', () => {
      expect(expandValue([['a']])).toBe('[["a"]]');
    });

    it('expands objects', () => {
      const result = expandValue({ name: 'test', count: 5 });
      expect(result).toContain('name: "test"');
      expect(result).toContain('count: 5');
    });

    it('filters << anchor keys from objects', () => {
      const result = expandValue({ '<<': 'ref', name: 'test' });
      expect(result).not.toContain('<<');
      expect(result).toContain('name: "test"');
    });
  });

  describe('generateAssertion - extended', () => {
    it('generates error assertion for error key', () => {
      const result = generateAssertion('error', 'NOT_FOUND');
      expect(result).toContain("code: 'NOT_FOUND'");
    });

    it('generates error assertion for error.code key', () => {
      const result = generateAssertion('error.code', 'INVALID');
      expect(result).toContain("code: 'INVALID'");
    });

    it('generates number assertion', () => {
      const result = generateAssertion('result.count', 42);
      expect(result).toContain('toBe(42)');
    });

    it('generates boolean assertion', () => {
      const result = generateAssertion('result.valid', true);
      expect(result).toContain('toBe(true)');
    });

    it('generates null assertion', () => {
      const result = generateAssertion('result.data', null);
      expect(result).toContain('toBeNull()');
    });

    it('generates object assertion', () => {
      const result = generateAssertion('result.meta', { key: 'value' });
      expect(result).toContain('toMatchObject');
    });
  });

  describe('keyToVarPath - extended', () => {
    it('returns "result" for "result" key', () => {
      expect(keyToVarPath('result')).toBe('result');
    });

    it('converts result.x to result.x', () => {
      expect(keyToVarPath('result.errors')).toBe('result.errors');
    });

    it('handles array access in result path', () => {
      expect(keyToVarPath('result.errors[0].code')).toBe('result.errors[0].code');
    });

    it('returns non-result keys as-is', () => {
      expect(keyToVarPath('status')).toBe('status');
    });
  });
});
