/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for archignore utilities.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createArchIgnore,
  parseArchIgnore,
  isDefaultIgnored,
  getDefaultPatterns,
} from '../../../src/utils/archignore.js';

describe('archignore utils', () => {
  describe('createArchIgnore', () => {
    it('should create empty filter with no patterns', () => {
      const archIgnore = createArchIgnore([]);
      expect(archIgnore.ignores('src/test.ts')).toBe(false);
    });

    it('should filter files matching patterns', () => {
      const archIgnore = createArchIgnore(['*.test.ts', 'dist/']);
      expect(archIgnore.ignores('src/foo.test.ts')).toBe(true);
      expect(archIgnore.ignores('dist/index.js')).toBe(true);
      expect(archIgnore.ignores('src/index.ts')).toBe(false);
    });

    it('should filter array of files', () => {
      const archIgnore = createArchIgnore(['*.test.ts']);
      const files = ['src/index.ts', 'src/index.test.ts', 'src/utils.ts'];
      const filtered = archIgnore.filter(files);
      expect(filtered).toEqual(['src/index.ts', 'src/utils.ts']);
    });

    it('should return patterns', () => {
      const patterns = ['*.test.ts', 'dist/'];
      const archIgnore = createArchIgnore(patterns);
      expect(archIgnore.patterns()).toEqual(patterns);
    });

    it('should handle Windows path separators', () => {
      const archIgnore = createArchIgnore(['dist/']);
      expect(archIgnore.ignores('dist\\index.js')).toBe(true);
    });
  });

  describe('parseArchIgnore', () => {
    it('should parse empty content', () => {
      const patterns = parseArchIgnore('');
      expect(patterns).toEqual([]);
    });

    it('should parse single pattern', () => {
      const patterns = parseArchIgnore('*.test.ts');
      expect(patterns).toEqual(['*.test.ts']);
    });

    it('should parse multiple patterns', () => {
      const content = 'node_modules/\ndist/\n*.test.ts';
      const patterns = parseArchIgnore(content);
      expect(patterns).toEqual(['node_modules/', 'dist/', '*.test.ts']);
    });

    it('should skip comments', () => {
      const content = '# This is a comment\nnode_modules/\n# Another comment\ndist/';
      const patterns = parseArchIgnore(content);
      expect(patterns).toEqual(['node_modules/', 'dist/']);
    });

    it('should skip empty lines', () => {
      const content = 'node_modules/\n\n\ndist/\n';
      const patterns = parseArchIgnore(content);
      expect(patterns).toEqual(['node_modules/', 'dist/']);
    });

    it('should trim whitespace', () => {
      const content = '  node_modules/  \n  dist/  ';
      const patterns = parseArchIgnore(content);
      expect(patterns).toEqual(['node_modules/', 'dist/']);
    });

    it('should handle negation patterns', () => {
      const content = '*.test.ts\n!important.test.ts';
      const patterns = parseArchIgnore(content);
      expect(patterns).toEqual(['*.test.ts', '!important.test.ts']);
    });
  });

  describe('isDefaultIgnored', () => {
    it('should ignore node_modules', () => {
      expect(isDefaultIgnored('node_modules/foo/bar.js')).toBe(true);
    });

    it('should ignore dist', () => {
      expect(isDefaultIgnored('dist/index.js')).toBe(true);
    });

    it('should ignore .d.ts files', () => {
      expect(isDefaultIgnored('src/types.d.ts')).toBe(true);
    });

    it('should not ignore regular source files', () => {
      expect(isDefaultIgnored('src/index.ts')).toBe(false);
    });

    it('should handle Windows paths', () => {
      expect(isDefaultIgnored('node_modules\\foo\\bar.js')).toBe(true);
    });
  });

  describe('getDefaultPatterns', () => {
    it('should return array of patterns', () => {
      const patterns = getDefaultPatterns();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should include common patterns', () => {
      const patterns = getDefaultPatterns();
      expect(patterns).toContain('node_modules/');
      expect(patterns).toContain('dist/');
    });

    it('should return a copy (not mutate original)', () => {
      const patterns1 = getDefaultPatterns();
      patterns1.push('custom');
      const patterns2 = getDefaultPatterns();
      expect(patterns2).not.toContain('custom');
    });
  });
});
