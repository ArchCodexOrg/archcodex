/**
 * @arch archcodex.test.unit
 *
 * Tests for cross-file type resolution in signature extractor.
 */
import { describe, it, expect } from 'vitest';
import { resolveTypeAcrossFiles } from '../../../../../src/core/spec/generators/signature-extractor.js';

const FIXTURES = 'tests/fixtures/typescript/imported-types';

describe('resolveTypeAcrossFiles', () => {
  describe('success cases', () => {
    it('resolves interface from sibling file', () => {
      const result = resolveTypeAcrossFiles(
        'UserResult',
        `${FIXTURES}/main.ts`,
        { projectRoot: '.' },
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'valid', type: 'boolean', optional: false }),
          expect.objectContaining({ name: 'errors' }),
          expect.objectContaining({ name: 'userId', type: 'string', optional: false }),
        ]),
      );
    });

    it('resolves type with .js extension in import', () => {
      const result = resolveTypeAcrossFiles(
        'UserResult',
        `${FIXTURES}/main-js-import.ts`,
        { projectRoot: '.' },
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'valid' }),
        ]),
      );
    });

    it('detects optional fields', () => {
      const result = resolveTypeAcrossFiles(
        'UserInput',
        `${FIXTURES}/main.ts`,
        { projectRoot: '.' },
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      const ageField = result.find(f => f.name === 'age');
      expect(ageField).toBeDefined();
      expect(ageField!.optional).toBe(true);

      const nameField = result.find(f => f.name === 'name');
      expect(nameField).toBeDefined();
      expect(nameField!.optional).toBe(false);
    });
  });

  describe('fallback cases', () => {
    it('returns empty for non-relative import (node_modules)', () => {
      const result = resolveTypeAcrossFiles(
        'Project',
        `${FIXTURES}/node-module-import.ts`,
        { projectRoot: '.' },
      );

      expect(result).toEqual([]);
    });

    it('returns empty for non-existent type', () => {
      const result = resolveTypeAcrossFiles(
        'NonExistentType',
        `${FIXTURES}/main.ts`,
        { projectRoot: '.' },
      );

      expect(result).toEqual([]);
    });

    it('returns empty for missing source file', () => {
      const result = resolveTypeAcrossFiles(
        'SomeType',
        '/nonexistent/path/file.ts',
        { projectRoot: '.' },
      );

      expect(result).toEqual([]);
    });

    it('returns empty for type not imported in source file', () => {
      const result = resolveTypeAcrossFiles(
        'SomeRandomType',
        `${FIXTURES}/main.ts`,
        { projectRoot: '.' },
      );

      expect(result).toEqual([]);
    });
  });
});
