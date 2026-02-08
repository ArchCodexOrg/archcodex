/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Auto-generated tests from improvement specs.
 * These tests validate that the implementation follows the specification.
 *
 * Source: .arch/specs/speccodex/improvements.spec.yaml
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadSpecRegistry } from '../../src/core/spec/loader.js';
import { resolveSpec } from '../../src/core/spec/resolver.js';
import type { SpecRegistry, ResolvedSpec, Example } from '../../src/core/spec/schema.js';
import {
  expandPlaceholder,
  isPlaceholderError,
  parseJsonPath,
  hasWildcard,
  jsonPathToExpect,
} from '../../src/core/spec/placeholders.js';
import { validateSpec, validateSpecRegistry } from '../../src/core/spec/validator.js';
import { verifyImplementation } from '../../src/core/spec/verifier.js';
import { generateUnitTests } from '../../src/core/spec/generators/unit.js';
import { generatePropertyTests } from '../../src/core/spec/generators/property.js';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * Mapping of spec IDs to their implementation functions.
 */
const SPEC_TO_IMPL: Record<string, {
  fn: (...args: unknown[]) => unknown;
  name: string;
}> = {
  'spec.speccodex.placeholders.hasItem': {
    fn: (args: { placeholder: string }) => expandPlaceholder(args.placeholder),
    name: 'expandPlaceholder',
  },
  'spec.speccodex.placeholders.jsonpath': {
    fn: (args: { path: string; assertion?: unknown; rootVar?: string }) => {
      const segments = parseJsonPath(args.path);
      const hasWc = hasWildcard(args.path);
      let code = '';
      if (args.assertion) {
        code = jsonPathToExpect(args.path, args.assertion as { type: string; asserts?: string; value?: unknown }, args.rootVar);
      }
      return { segments, hasWildcard: hasWc, code, valid: true };
    },
    name: 'parseJsonPath + jsonPathToExpect',
  },
  'spec.speccodex.validator.errors': {
    fn: (args: { spec: unknown }) => validateSpec(args.spec as Record<string, unknown>),
    name: 'validateSpec',
  },
  'spec.speccodex.generate.naming': {
    fn: (args: { examples: Example[] }) => {
      // Create a minimal spec with the examples
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: ['spec.test'],
        appliedMixins: [],
        node: {
          intent: 'Test naming',
          examples: {
            success: args.examples,
          },
        },
      };
      return generateUnitTests(spec);
    },
    name: 'generateUnitTests',
  },
  'spec.speccodex.generate.coverage': {
    fn: (args: { spec: unknown; options?: { coverage?: string } }) => {
      const specNode = args.spec as { specId: string; intent: string; inputs?: Record<string, unknown>; examples?: unknown };
      const resolved: ResolvedSpec = {
        specId: specNode.specId || 'spec.test',
        inheritanceChain: [specNode.specId || 'spec.test'],
        appliedMixins: [],
        node: {
          intent: specNode.intent || 'Test',
          inputs: specNode.inputs as Record<string, { type: string; values?: string[]; min?: number; max?: number }>,
          examples: specNode.examples as { success?: Example[] },
        },
      };
      return generateUnitTests(resolved, {
        coverage: (args.options?.coverage as 'examples' | 'full') || 'examples',
      });
    },
    name: 'generateUnitTests with coverage',
  },
  'spec.speccodex.invariants.structured': {
    fn: (args: { invariant: unknown }) => {
      // Parse invariant and return its type
      const inv = args.invariant;
      if (typeof inv === 'string') {
        return { type: 'note', testable: false, text: inv };
      }
      if (typeof inv === 'object' && inv !== null) {
        if ('forall' in inv) {
          const forall = (inv as { forall: { variable: string; in: string; then: unknown; where?: unknown } }).forall;
          return {
            type: 'forall',
            variable: forall.variable,
            collection: forall.in,
            testable: true,
            hasFilter: !!forall.where,
          };
        }
        if ('exists' in inv) {
          const exists = (inv as { exists: { variable: string; in: string; where: unknown } }).exists;
          return {
            type: 'exists',
            variable: exists.variable,
            collection: exists.in,
            testable: true,
          };
        }
        // Object assertion like { "result.url": "valid_url" }
        const entries = Object.entries(inv);
        if (entries.length > 0) {
          const [key, value] = entries[0];
          const isArrayPath = key.includes('[*]');
          return {
            type: 'assertion',
            path: key,
            matcher: value,
            testable: true,
            isArrayPath,
          };
        }
      }
      return { type: 'unknown', testable: false };
    },
    name: 'parseInvariant',
  },
};

/**
 * Check if actual value matches expected assertion from spec.
 */
function matchesAssertion(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'string') {
    // Check for placeholder assertions
    if (expected.startsWith('@')) {
      const result = expandPlaceholder(expected);
      if (!isPlaceholderError(result)) {
        if (result.type === 'assertion') {
          switch (result.asserts) {
            case 'defined':
              return actual !== undefined;
            case 'exists':
              return actual != null;
            case 'contains':
              return typeof actual === 'string' && actual.includes(result.value as string);
            case 'hasItem':
              return Array.isArray(actual) && actual.some(item =>
                matchesObject(item, result.value as Record<string, unknown>)
              );
            case 'greaterThan':
              return typeof actual === 'number' && actual > (result.value as number);
            case 'lessThan':
              return typeof actual === 'number' && actual < (result.value as number);
            case 'length':
              return Array.isArray(actual) && actual.length === (result.value as number);
            default:
              return true;
          }
        }
      }
    }
    return actual === expected;
  }
  if (typeof expected === 'boolean' || typeof expected === 'number') {
    return actual === expected;
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((e, i) => matchesAssertion(actual[i], e));
  }
  if (typeof expected === 'object' && expected !== null) {
    return matchesObject(actual, expected as Record<string, unknown>);
  }
  return actual === expected;
}

function matchesObject(actual: unknown, expected: Record<string, unknown>): boolean {
  if (typeof actual !== 'object' || actual === null) return false;
  const obj = actual as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) => {
    const actualValue = getNestedValue(obj, key);
    return matchesAssertion(actualValue, value);
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    // Handle array index: items[0]
    const match = part.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      const [, key, idx] = match;
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[parseInt(idx, 10)];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current;
}

describe('Spec-Driven Tests: improvements.spec.yaml', () => {
  let registry: SpecRegistry;

  beforeAll(async () => {
    registry = await loadSpecRegistry(PROJECT_ROOT);
  });

  describe('spec.speccodex.placeholders.hasItem', () => {
    let spec: ResolvedSpec;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.placeholders.hasItem');
      expect(result.valid).toBe(true);
      spec = result.spec!;
    });

    it('spec is loaded and valid', () => {
      expect(spec.node.intent).toBeDefined();
      expect(spec.node.examples?.success?.length).toBeGreaterThan(0);
    });

    // Generate tests from success examples
    describe('success cases (from spec)', () => {
      it('match object by single property', () => {
        const result = expandPlaceholder("@hasItem({ name: 'intent' })");
        expect(isPlaceholderError(result)).toBe(false);
        if (!isPlaceholderError(result)) {
          expect(result.type).toBe('assertion');
          expect(result.asserts).toBe('hasItem');
        }
      });

      it('match object by multiple properties', () => {
        const result = expandPlaceholder("@hasItem({ name: 'url', required: true })");
        expect(isPlaceholderError(result)).toBe(false);
        if (!isPlaceholderError(result)) {
          expect(result.type).toBe('assertion');
          expect(result.value).toMatchObject({ name: 'url', required: true });
        }
      });
    });

    // Generate tests from error examples
    describe('error cases (from spec)', () => {
      it('invalid placeholder syntax', () => {
        const result = expandPlaceholder('@hasItem(invalid)');
        expect(isPlaceholderError(result)).toBe(true);
        if (isPlaceholderError(result)) {
          // Returns UNKNOWN_PLACEHOLDER because pattern doesn't match @hasItem regex
          expect(result.code).toBe('UNKNOWN_PLACEHOLDER');
        }
      });
    });
  });

  describe('spec.speccodex.placeholders.jsonpath', () => {
    let spec: ResolvedSpec;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.placeholders.jsonpath');
      expect(result.valid).toBe(true);
      spec = result.spec!;
    });

    it('spec is loaded and valid', () => {
      expect(spec.node.intent).toBeDefined();
    });

    describe('success cases (from spec)', () => {
      it('simple property path', () => {
        const segments = parseJsonPath('result.items');
        expect(segments).toHaveLength(2);
        expect(segments[0]).toMatchObject({ type: 'property', value: 'result' });
        expect(segments[1]).toMatchObject({ type: 'property', value: 'items' });
        expect(hasWildcard('result.items')).toBe(false);
      });

      it('wildcard generates forEach', () => {
        expect(hasWildcard('result.items[*].status')).toBe(true);
        const code = jsonPathToExpect(
          'result.items[*].status',
          { type: 'assertion', asserts: 'defined' },
          'result'
        );
        expect(code).toContain('forEach');
        expect(code).toContain('item.status');
      });

      it('specific index', () => {
        const segments = parseJsonPath('result.items[0].name');
        expect(segments.some(s => s.type === 'index' && s.value === 0)).toBe(true);
        expect(hasWildcard('result.items[0].name')).toBe(false);
      });

      it('deep nested path', () => {
        const segments = parseJsonPath('data.users[0].profile.settings.theme');
        expect(segments.length).toBe(6);
      });
    });

    describe('error cases (from spec)', () => {
      it('invalid bracket syntax', () => {
        // parseJsonPath should handle invalid syntax gracefully
        const segments = parseJsonPath('result.items[[invalid');
        // Should return something (even if partial) rather than throwing
        expect(Array.isArray(segments)).toBe(true);
      });
    });
  });

  describe('spec.speccodex.invariants.structured', () => {
    let spec: ResolvedSpec;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.invariants.structured');
      expect(result.valid).toBe(true);
      spec = result.spec!;
    });

    it('spec is loaded and valid', () => {
      expect(spec.node.intent).toBeDefined();
    });

    describe('success cases (from spec)', () => {
      it('object assertion invariant', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.invariants.structured'];
        const result = impl.fn({ invariant: { 'result.url': 'valid_url' } }) as Record<string, unknown>;
        expect(result.type).toBe('assertion');
        expect(result.path).toBe('result.url');
        expect(result.testable).toBe(true);
      });

      it('forall quantifier', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.invariants.structured'];
        const result = impl.fn({
          invariant: {
            forall: {
              variable: 'item',
              in: 'result.items',
              then: { 'item.status': 'valid' },
            },
          },
        }) as Record<string, unknown>;
        expect(result.type).toBe('forall');
        expect(result.variable).toBe('item');
        expect(result.collection).toBe('result.items');
        expect(result.testable).toBe(true);
      });

      it('forall with where filter', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.invariants.structured'];
        const result = impl.fn({
          invariant: {
            forall: {
              variable: 'item',
              in: 'result.items',
              where: { 'item.active': true },
              then: { 'item.visible': true },
            },
          },
        }) as Record<string, unknown>;
        expect(result.type).toBe('forall');
        expect(result.hasFilter).toBe(true);
      });

      it('exists quantifier', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.invariants.structured'];
        const result = impl.fn({
          invariant: {
            exists: {
              variable: 'item',
              in: 'result.items',
              where: { 'item.status': 'active' },
            },
          },
        }) as Record<string, unknown>;
        expect(result.type).toBe('exists');
        expect(result.variable).toBe('item');
        expect(result.testable).toBe(true);
      });

      it('prose note (not testable)', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.invariants.structured'];
        const result = impl.fn({
          invariant: 'Response time should be under 100ms',
        }) as Record<string, unknown>;
        expect(result.type).toBe('note');
        expect(result.testable).toBe(false);
        expect(result.text).toBe('Response time should be under 100ms');
      });
    });
  });

  describe('spec.speccodex.generate.naming', () => {
    let spec: ResolvedSpec;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.generate.naming');
      expect(result.valid).toBe(true);
      spec = result.spec!;
    });

    it('spec is loaded and valid', () => {
      expect(spec.node.intent).toBeDefined();
    });

    describe('success cases (from spec)', () => {
      it('exact name match', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.generate.naming'];
        const result = impl.fn({
          examples: [
            { name: 'valid url creates product', given: {}, then: {} },
            { name: 'invalid url returns error', given: {}, then: {} },
          ],
        }) as { testNames: string[]; valid: boolean };
        expect(result.testNames).toContain('valid url creates product');
        expect(result.testNames).toContain('invalid url returns error');
        expect(result.testNames.length).toBe(2);
      });

      it('name with special characters', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.generate.naming'];
        const result = impl.fn({
          examples: [
            { name: 'URL > 2048 chars → URL_TOO_LONG', given: {}, then: {} },
          ],
        }) as { testNames: string[] };
        expect(result.testNames).toContain('URL > 2048 chars → URL_TOO_LONG');
      });

      it('missing name generates default with warning', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.generate.naming'];
        const result = impl.fn({
          examples: [
            { given: { url: 'https://x.com' }, then: { result: '@defined' } },
          ],
        }) as { testNames: string[]; warnings: { code: string }[] };
        expect(result.testNames).toContain('example 1');
        expect(result.warnings.some(w => w.code === 'MISSING_NAME')).toBe(true);
      });
    });

    describe('error cases (from spec)', () => {
      it('duplicate names', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.generate.naming'];
        const result = impl.fn({
          examples: [
            { name: 'test case', given: {}, then: {} },
            { name: 'test case', given: {}, then: {} },
          ],
        }) as { valid: boolean; errors: { code: string; message: string }[] };
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'DUPLICATE_NAME')).toBe(true);
      });
    });
  });

  describe('spec.speccodex.generate.coverage', () => {
    let spec: ResolvedSpec;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.generate.coverage');
      expect(result.valid).toBe(true);
      spec = result.spec!;
    });

    it('spec is loaded and valid', () => {
      expect(spec.node.intent).toBeDefined();
    });

    describe('success cases (from spec)', () => {
      it('examples only (default)', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.generate.coverage'];
        const result = impl.fn({
          spec: {
            specId: 'spec.test',
            intent: 'Test',
            inputs: { name: { type: 'string' } },
            examples: { success: [{ name: 'works', given: { name: 'test' }, then: {} }] },
          },
          options: { coverage: 'examples' },
        }) as { testCount: number; coverageStats?: unknown };
        expect(result.testCount).toBe(1);
        expect(result.coverageStats).toBeUndefined();
      });

      it('full coverage generates enum tests', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.generate.coverage'];
        const result = impl.fn({
          spec: {
            specId: 'spec.test',
            intent: 'Test',
            inputs: { status: { type: 'enum', values: ['draft', 'published', 'archived'] } },
            examples: { success: [{ name: 'draft status', given: { status: 'draft' }, then: {} }] },
          },
          options: { coverage: 'full' },
        }) as { testCount: number; code: string; coverageStats: { enumCoverage: number } };
        expect(result.testCount).toBeGreaterThan(1);
        expect(result.coverageStats.enumCoverage).toBeGreaterThanOrEqual(2); // published + archived
        expect(result.code).toContain('status=published');
        expect(result.code).toContain('status=archived');
      });

      it('full coverage adds numeric boundary tests', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.generate.coverage'];
        const result = impl.fn({
          spec: {
            specId: 'spec.test',
            intent: 'Test',
            inputs: { count: { type: 'number', min: 0, max: 100 } },
            examples: { success: [{ name: 'mid value', given: { count: 50 }, then: {} }] },
          },
          options: { coverage: 'full' },
        }) as { code: string; coverageStats: { boundaryCoverage: number } };
        expect(result.coverageStats.boundaryCoverage).toBeGreaterThanOrEqual(2);
        expect(result.code).toContain('count at minimum (0)');
        expect(result.code).toContain('count at maximum (100)');
      });

      it('full coverage adds string length boundary tests', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.generate.coverage'];
        const result = impl.fn({
          spec: {
            specId: 'spec.test',
            intent: 'Test',
            inputs: { title: { type: 'string', max: 200 } },
            examples: { success: [{ name: 'short title', given: { title: 'test' }, then: {} }] },
          },
          options: { coverage: 'full' },
        }) as { code: string; coverageStats: { boundaryCoverage: number } };
        expect(result.coverageStats.boundaryCoverage).toBeGreaterThanOrEqual(1);
        expect(result.code).toContain('title at max length (200)');
      });

      it('reports coverage statistics', () => {
        const impl = SPEC_TO_IMPL['spec.speccodex.generate.coverage'];
        const result = impl.fn({
          spec: {
            specId: 'spec.test',
            intent: 'Test',
            inputs: {
              status: { type: 'enum', values: ['a', 'b', 'c'] },
              count: { type: 'number', min: 0, max: 10 },
            },
            examples: { success: [{ name: 'basic', given: {}, then: {} }] },
          },
          options: { coverage: 'full' },
        }) as { coverageStats: { fromExamples: number; generated: number; enumCoverage: number; boundaryCoverage: number } };
        expect(result.coverageStats).toBeDefined();
        expect(result.coverageStats.fromExamples).toBe(1);
        expect(result.coverageStats.generated).toBeGreaterThan(0);
        expect(result.coverageStats.enumCoverage).toBe(3);
        expect(result.coverageStats.boundaryCoverage).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('spec.speccodex.validator.errors', () => {
    let spec: ResolvedSpec;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.validator.errors');
      expect(result.valid).toBe(true);
      spec = result.spec!;
    });

    it('spec is loaded and valid', () => {
      expect(spec.node.intent).toBeDefined();
    });

    describe('success cases (from spec)', () => {
      it('spec with errors section passes', () => {
        // Create a mock registry with our test spec
        const testRegistry: SpecRegistry = {
          nodes: {
            'spec.test': {
              intent: 'Test',
              examples: {
                success: [{ name: 'works', given: {}, then: {} }],
                errors: [{ name: 'fails', given: {}, then: { error: 'ERROR' } }],
              },
            },
          },
          mixins: {},
        };
        const result = validateSpec(testRegistry, 'spec.test');
        // Should not have MISSING_ERRORS warning
        const missingErrorsWarning = result.warnings.find(w => w.code === 'MISSING_ERRORS');
        expect(missingErrorsWarning).toBeUndefined();
      });
    });

    describe('warning cases (from spec)', () => {
      it('missing errors section generates warning', () => {
        // Create a mock registry with our test spec (no errors section)
        const testRegistry: SpecRegistry = {
          nodes: {
            'spec.test': {
              intent: 'Test',
              examples: {
                success: [{ name: 'works', given: {}, then: {} }],
              },
            },
          },
          mixins: {},
        };
        // Use validateSpecRegistry which checks for MISSING_ERRORS
        const result = validateSpecRegistry(testRegistry);
        const missingErrorsWarning = result.warnings.find(w => w.code === 'MISSING_ERRORS');
        expect(missingErrorsWarning).toBeDefined();
        expect(missingErrorsWarning?.message).toContain('has no error cases defined');
      });
    });
  });
});
