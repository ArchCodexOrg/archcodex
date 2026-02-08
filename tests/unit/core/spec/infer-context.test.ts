/**
 * @arch archcodex.test.unit
 *
 * Tests for code context gathering for LLM spec enrichment.
 */
import { describe, it, expect } from 'vitest';
import { gatherCodeContext } from '../../../../src/core/spec/infer-context.js';

const FIXTURES = 'tests/fixtures/typescript';

describe('gatherCodeContext', () => {
  describe('success cases', () => {
    it('gathers context for function with imports', () => {
      const result = gatherCodeContext(
        `${FIXTURES}/imported-types/main.ts`,
        'processUser',
        { projectRoot: '.' },
      );

      expect(result.importedTypes.length).toBeGreaterThanOrEqual(1);
      expect(result.calledFunctions).toBeDefined();
      expect(result.contextFiles.length).toBeGreaterThanOrEqual(0);
    });

    it('extracts imported type definitions', () => {
      const result = gatherCodeContext(
        `${FIXTURES}/imported-types/main.ts`,
        'processUser',
        { projectRoot: '.' },
      );

      // Should find UserResult and/or UserInput type definitions
      const typeNames = result.importedTypes.map(t => t.name);
      expect(typeNames.length).toBeGreaterThan(0);

      // Each imported type should have a non-empty definition
      for (const type of result.importedTypes) {
        expect(type.definition.length).toBeGreaterThan(0);
        expect(type.filePath).toBeTruthy();
      }
    });

    it('extracts function calls from body', () => {
      const result = gatherCodeContext(
        `${FIXTURES}/imported-types/main.ts`,
        'processUser',
        { projectRoot: '.' },
      );

      // calledFunctions should be an array of strings
      expect(Array.isArray(result.calledFunctions)).toBe(true);
      // Should be deduplicated (no duplicates)
      const unique = new Set(result.calledFunctions);
      expect(unique.size).toBe(result.calledFunctions.length);
    });

    it('respects maxFiles limit', () => {
      const result = gatherCodeContext(
        'src/core/spec/inferrer.ts',
        'inferSpec',
        { projectRoot: '.', maxFiles: 2 },
      );

      expect(result.importedTypes.length).toBeLessThanOrEqual(2);
    });

    it('builds context files list from imported types', () => {
      const result = gatherCodeContext(
        `${FIXTURES}/imported-types/main.ts`,
        'processUser',
        { projectRoot: '.' },
      );

      // Context files should match imported type file paths
      for (const cf of result.contextFiles) {
        expect(cf.path).toBeTruthy();
        expect(cf.relevance).toContain('Defines type');
      }
    });
  });

  describe('fallback cases', () => {
    it('returns empty context for nonexistent file', () => {
      const result = gatherCodeContext(
        'nonexistent/file.ts',
        'fn',
        { projectRoot: '.' },
      );

      expect(result.importedTypes).toEqual([]);
      expect(result.calledFunctions).toEqual([]);
      expect(result.contextFiles).toEqual([]);
    });

    it('returns empty context for nonexistent export', () => {
      const result = gatherCodeContext(
        'src/core/spec/inferrer.ts',
        'nonExistentFunction',
        { projectRoot: '.' },
      );

      expect(result.importedTypes).toEqual([]);
      expect(result.calledFunctions).toEqual([]);
    });

    it('skips non-relative imports (node_modules)', () => {
      const result = gatherCodeContext(
        `${FIXTURES}/imported-types/node-module-import.ts`,
        'createProject',
        { projectRoot: '.' },
      );

      // Should not include ts-morph types (node_modules)
      const nodeModuleTypes = result.importedTypes.filter(t =>
        t.filePath.includes('node_modules')
      );
      expect(nodeModuleTypes).toEqual([]);
    });
  });
});
