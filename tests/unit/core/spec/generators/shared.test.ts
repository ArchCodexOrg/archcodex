/**
 * @arch archcodex.test.unit
 *
 * Tests for shared generator utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  specIdToFunctionName,
  needsKeyQuoting,
  formatObjectKey,
  expandValue,
  keyToVarPath,
  generateAssertion,
  isConvexArchitecture,
  resolveErrorPattern,
  generateMockScaffolding,
  type MockDependency,
} from '../../../../../src/core/spec/generators/shared.js';

describe('Shared Generator Utilities', () => {
  describe('specIdToFunctionName', () => {
    it('extracts function name from spec ID', () => {
      const result = specIdToFunctionName('spec.products.create');
      expect(result).toBe('create');
    });

    it('handles nested spec IDs', () => {
      const result = specIdToFunctionName('spec.users.profile.update');
      expect(result).toBe('update');
    });
  });

  describe('needsKeyQuoting', () => {
    it('returns false for simple keys', () => {
      expect(needsKeyQuoting('name')).toBe(false);
      expect(needsKeyQuoting('userId')).toBe(false);
    });

    it('returns true for keys with dots', () => {
      expect(needsKeyQuoting('result.id')).toBe(true);
    });
  });

  describe('formatObjectKey', () => {
    it('returns simple keys as-is', () => {
      expect(formatObjectKey('name')).toBe('name');
    });

    it('quotes keys with special characters', () => {
      const result = formatObjectKey('result.id');
      expect(result).toContain('"');
    });
  });

  describe('expandValue', () => {
    it('expands string values', () => {
      const result = expandValue('hello');
      expect(result).toBe('"hello"');
    });

    it('expands numbers', () => {
      const result = expandValue(42);
      expect(result).toBe('42');
    });

    it('expands booleans', () => {
      expect(expandValue(true)).toBe('true');
      expect(expandValue(false)).toBe('false');
    });
  });

  describe('keyToVarPath', () => {
    it('converts key to variable path', () => {
      expect(keyToVarPath('result.id')).toBe('result.id');
      expect(keyToVarPath('error')).toBe('error');
    });
  });

  describe('generateAssertion', () => {
    it('generates assertion for equality', () => {
      const result = generateAssertion('result.status', 'success');
      expect(result).toContain('expect');
      expect(result).toContain('success');
    });
  });

  // Gap 4: Architecture-aware error patterns
  describe('isConvexArchitecture', () => {
    it('returns true for convex.mutation', () => {
      expect(isConvexArchitecture(['convex.mutation'])).toBe(true);
    });

    it('returns true for convex.query', () => {
      expect(isConvexArchitecture(['convex.query'])).toBe(true);
    });

    it('returns true for architecture containing .convex', () => {
      expect(isConvexArchitecture(['app.convex.helpers'])).toBe(true);
    });

    it('returns false for non-convex architectures', () => {
      expect(isConvexArchitecture(['archcodex.core.domain'])).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isConvexArchitecture(undefined)).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(isConvexArchitecture([])).toBe(false);
    });

    it('returns true if any architecture is convex', () => {
      expect(isConvexArchitecture(['archcodex.core.domain', 'convex.action'])).toBe(true);
    });
  });

  describe('resolveErrorPattern', () => {
    it('returns explicit pattern when provided', () => {
      expect(resolveErrorPattern(['convex.mutation'], 'standard')).toBe('standard');
    });

    it('returns convex for convex architectures', () => {
      expect(resolveErrorPattern(['convex.mutation'])).toBe('convex');
    });

    it('returns standard for non-convex architectures', () => {
      expect(resolveErrorPattern(['archcodex.core.domain'])).toBe('standard');
    });

    it('returns standard when no architectures', () => {
      expect(resolveErrorPattern(undefined)).toBe('standard');
    });

    it('explicit result pattern overrides architecture', () => {
      expect(resolveErrorPattern(['convex.mutation'], 'result')).toBe('result');
    });
  });

  // Gap 3: Mock scaffolding
  describe('generateMockScaffolding', () => {
    it('generates vi.mock for relative import', () => {
      const deps: MockDependency[] = [
        { importPath: '../../utils/database.js', importedNames: ['query', 'insert'], isNodeBuiltin: false, suggestedMockType: 'full' },
      ];

      const result = generateMockScaffolding(deps, '');

      expect(result.some(l => l.includes('vi.mock'))).toBe(true);
      expect(result.some(l => l.includes('database'))).toBe(true);
      expect(result.some(l => l.includes('query: vi.fn()'))).toBe(true);
      expect(result.some(l => l.includes('insert: vi.fn()'))).toBe(true);
    });

    it('generates vi.mock for node builtin with node: prefix', () => {
      const deps: MockDependency[] = [
        { importPath: 'fs', importedNames: ['readFileSync'], isNodeBuiltin: true, suggestedMockType: 'full' },
      ];

      const result = generateMockScaffolding(deps, '');

      expect(result.some(l => l.includes("vi.mock('node:fs'"))).toBe(true);
      expect(result.some(l => l.includes('readFileSync: vi.fn()'))).toBe(true);
    });

    it('does not double-prefix node builtins already prefixed', () => {
      const deps: MockDependency[] = [
        { importPath: 'node:path', importedNames: ['resolve'], isNodeBuiltin: true, suggestedMockType: 'full' },
      ];

      const result = generateMockScaffolding(deps, '');

      expect(result.some(l => l.includes("vi.mock('node:path'"))).toBe(true);
      // Should NOT have node:node:path
      expect(result.some(l => l.includes('node:node:'))).toBe(false);
    });

    it('returns empty array for empty dependencies', () => {
      const result = generateMockScaffolding([], '');
      expect(result).toHaveLength(0);
    });

    it('generates vi.mock without factory for deps with no named imports', () => {
      const deps: MockDependency[] = [
        { importPath: './side-effect-module.js', importedNames: [], isNodeBuiltin: false, suggestedMockType: 'full' },
      ];

      const result = generateMockScaffolding(deps, '');

      expect(result.some(l => l.includes("vi.mock('./side-effect-module.js')"))).toBe(true);
    });

    it('applies indentation', () => {
      const deps: MockDependency[] = [
        { importPath: './utils.js', importedNames: ['helper'], isNodeBuiltin: false, suggestedMockType: 'full' },
      ];

      const result = generateMockScaffolding(deps, '  ');

      expect(result.every(l => l === '' || l.startsWith('  '))).toBe(true);
    });

    it('generates multiple mocks for multiple dependencies', () => {
      const deps: MockDependency[] = [
        { importPath: './db.js', importedNames: ['query'], isNodeBuiltin: false, suggestedMockType: 'full' },
        { importPath: './api.js', importedNames: ['fetch'], isNodeBuiltin: false, suggestedMockType: 'full' },
      ];

      const result = generateMockScaffolding(deps, '');

      const mockLines = result.filter(l => l.includes('vi.mock'));
      expect(mockLines).toHaveLength(2);
    });
  });
});
