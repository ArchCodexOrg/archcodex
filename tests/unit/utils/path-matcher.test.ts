/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for path-matcher utility.
 */
import { describe, it, expect } from 'vitest';
import { createPathMatcher, hasPatternConfig } from '../../../src/utils/path-matcher.js';

describe('createPathMatcher', () => {
  describe('matches', () => {
    it('should match all files when no include/exclude patterns', () => {
      const matcher = createPathMatcher([], []);

      expect(matcher.matches('src/a.ts')).toBe(true);
      expect(matcher.matches('lib/b.ts')).toBe(true);
      expect(matcher.matches('test.js')).toBe(true);
    });

    it('should only include files matching include patterns', () => {
      const matcher = createPathMatcher(['src/**/*.ts'], []);

      expect(matcher.matches('src/a.ts')).toBe(true);
      expect(matcher.matches('src/sub/b.ts')).toBe(true);
      expect(matcher.matches('lib/c.ts')).toBe(false);
      expect(matcher.matches('src/d.js')).toBe(false);
    });

    it('should exclude files matching exclude patterns', () => {
      const matcher = createPathMatcher([], ['**/*.test.ts', '**/node_modules/**']);

      expect(matcher.matches('src/a.ts')).toBe(true);
      expect(matcher.matches('src/a.test.ts')).toBe(false);
      expect(matcher.matches('node_modules/pkg/index.ts')).toBe(false);
    });

    it('should apply both include and exclude patterns', () => {
      const matcher = createPathMatcher(['src/**/*.ts'], ['**/*.test.ts']);

      expect(matcher.matches('src/a.ts')).toBe(true);
      expect(matcher.matches('src/a.test.ts')).toBe(false);
      expect(matcher.matches('lib/b.ts')).toBe(false);
    });

    it('should normalize Windows paths', () => {
      const matcher = createPathMatcher(['src/**/*.ts'], []);

      expect(matcher.matches('src\\sub\\file.ts')).toBe(true);
    });

    it('should handle multiple include patterns', () => {
      const matcher = createPathMatcher(['src/**/*.ts', 'lib/**/*.ts'], []);

      expect(matcher.matches('src/a.ts')).toBe(true);
      expect(matcher.matches('lib/b.ts')).toBe(true);
      expect(matcher.matches('test/c.ts')).toBe(false);
    });

    it('should handle multiple exclude patterns', () => {
      const matcher = createPathMatcher([], ['**/*.test.ts', '**/*.spec.ts', '**/dist/**']);

      expect(matcher.matches('src/a.ts')).toBe(true);
      expect(matcher.matches('src/a.test.ts')).toBe(false);
      expect(matcher.matches('src/a.spec.ts')).toBe(false);
      expect(matcher.matches('dist/bundle.js')).toBe(false);
    });
  });

  describe('filter', () => {
    it('should filter array of file paths', () => {
      const matcher = createPathMatcher(['src/**/*.ts'], ['**/*.test.ts']);

      const files = [
        'src/a.ts',
        'src/a.test.ts',
        'lib/b.ts',
        'src/sub/c.ts',
      ];

      const result = matcher.filter(files);

      expect(result).toContain('src/a.ts');
      expect(result).toContain('src/sub/c.ts');
      expect(result).not.toContain('src/a.test.ts');
      expect(result).not.toContain('lib/b.ts');
    });

    it('should return empty array when no matches', () => {
      const matcher = createPathMatcher(['src/**/*.ts'], []);

      const result = matcher.filter(['lib/a.js', 'test/b.js']);

      expect(result).toEqual([]);
    });

    it('should return all files when no patterns', () => {
      const matcher = createPathMatcher([], []);

      const files = ['a.ts', 'b.ts', 'c.ts'];
      const result = matcher.filter(files);

      expect(result).toEqual(files);
    });
  });

  describe('includePatterns', () => {
    it('should return copy of include patterns', () => {
      const include = ['src/**/*.ts', 'lib/**/*.ts'];
      const matcher = createPathMatcher(include, []);

      expect(matcher.includePatterns()).toEqual(include);
    });

    it('should return empty array when no include patterns', () => {
      const matcher = createPathMatcher([], ['**/*.test.ts']);

      expect(matcher.includePatterns()).toEqual([]);
    });
  });

  describe('excludePatterns', () => {
    it('should return copy of exclude patterns', () => {
      const exclude = ['**/*.test.ts', '**/node_modules/**'];
      const matcher = createPathMatcher([], exclude);

      expect(matcher.excludePatterns()).toEqual(exclude);
    });

    it('should return empty array when no exclude patterns', () => {
      const matcher = createPathMatcher(['src/**'], []);

      expect(matcher.excludePatterns()).toEqual([]);
    });
  });
});

describe('hasPatternConfig', () => {
  it('should return false when both include and exclude are empty', () => {
    expect(hasPatternConfig([], [])).toBe(false);
  });

  it('should return true when include has patterns', () => {
    expect(hasPatternConfig(['src/**'], [])).toBe(true);
  });

  it('should return true when exclude has patterns', () => {
    expect(hasPatternConfig([], ['**/*.test.ts'])).toBe(true);
  });

  it('should return true when both have patterns', () => {
    expect(hasPatternConfig(['src/**'], ['**/*.test.ts'])).toBe(true);
  });
});
