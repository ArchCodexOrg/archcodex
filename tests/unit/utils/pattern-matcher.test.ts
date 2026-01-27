/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for pattern matcher utility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validatePattern,
  patternMatches,
  findPatternMatch,
  isIntentPattern,
  extractIntentName,
  levenshteinDistance,
  stringSimilarity,
} from '../../../src/utils/pattern-matcher.js';

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('validatePattern', () => {
  it('should return null for valid patterns', () => {
    expect(validatePattern('console.log')).toBeNull();
    expect(validatePattern('foo.*bar')).toBeNull();
    expect(validatePattern('/regex/gi')).toBeNull();
  });

  it('should reject patterns exceeding max length', () => {
    const longPattern = 'a'.repeat(5001);
    const error = validatePattern(longPattern);
    expect(error).toContain('exceeds maximum length');
  });

  it('should reject dangerous pattern (.*)+', () => {
    const error = validatePattern('(.*)+');
    expect(error).toContain('potentially dangerous');
  });

  it('should reject dangerous pattern (.+)+', () => {
    const error = validatePattern('(.+)+');
    expect(error).toContain('potentially dangerous');
  });

  it('should reject dangerous nested quantifiers (a+)+', () => {
    const error = validatePattern('(a+)+');
    expect(error).toContain('potentially dangerous');
  });

  it('should reject dangerous nested quantifiers (a*)*', () => {
    const error = validatePattern('(a*)*');
    expect(error).toContain('potentially dangerous');
  });
});

describe('patternMatches', () => {
  describe('literal patterns', () => {
    it('should match simple string', () => {
      expect(patternMatches('hello', 'hello world')).toBe(true);
    });

    it('should not match when string not present', () => {
      expect(patternMatches('goodbye', 'hello world')).toBe(false);
    });

    it('should be case-sensitive by default', () => {
      expect(patternMatches('Hello', 'hello world')).toBe(false);
    });
  });

  describe('regex patterns', () => {
    it('should match explicit regex pattern', () => {
      expect(patternMatches('/hel+o/', 'hello world')).toBe(true);
    });

    it('should match with case-insensitive flag', () => {
      expect(patternMatches('/hello/i', 'HELLO world')).toBe(true);
    });

    it('should match with global flag', () => {
      expect(patternMatches('/\\d+/g', 'abc 123 def')).toBe(true);
    });

    it('should match implicit regex patterns', () => {
      expect(patternMatches('\\d+', 'abc 123 def')).toBe(true);
    });

    it('should handle multiline content', () => {
      const content = `line1
line2
line3`;
      expect(patternMatches('line2', content)).toBe(true);
    });

    it('should handle dot matching newlines with s flag', () => {
      const content = `start
middle
end`;
      expect(patternMatches('/start.*end/s', content)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return false for dangerous patterns', () => {
      expect(patternMatches('(.*)+', 'content')).toBe(false);
    });

    it('should return false for invalid explicit regex', () => {
      expect(patternMatches('/[invalid/', 'content')).toBe(false);
    });

    it('should fall back to literal match for invalid implicit regex', () => {
      // '[' is invalid regex but valid literal string
      expect(patternMatches('[', 'array[0]')).toBe(true);
    });
  });
});

describe('findPatternMatch', () => {
  describe('successful matches', () => {
    it('should return match info with line and column', () => {
      const content = `line1
line2 target
line3`;
      const result = findPatternMatch('target', content);

      expect(result.matched).toBe(true);
      expect(result.line).toBe(2);
      expect(result.column).toBe(7);
      expect(result.matchedText).toBe('target');
    });

    it('should handle regex patterns', () => {
      const content = 'abc 123 def';
      const result = findPatternMatch('/\\d+/', content);

      expect(result.matched).toBe(true);
      expect(result.matchedText).toBe('123');
    });

    it('should handle match at beginning of content', () => {
      const result = findPatternMatch('first', 'first line');

      expect(result.matched).toBe(true);
      expect(result.line).toBe(1);
      expect(result.column).toBe(1);
    });

    it('should handle match on first line', () => {
      const result = findPatternMatch('hello', 'hello world');

      expect(result.matched).toBe(true);
      expect(result.line).toBe(1);
      expect(result.column).toBe(1);
    });
  });

  describe('no match', () => {
    it('should return matched: false when not found', () => {
      const result = findPatternMatch('notfound', 'some content');

      expect(result.matched).toBe(false);
      expect(result.line).toBeUndefined();
      expect(result.column).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should return error for dangerous patterns', () => {
      const result = findPatternMatch('(.*)+', 'content');

      expect(result.matched).toBe(false);
      expect(result.error).toContain('potentially dangerous');
    });

    it('should return not matched for invalid explicit regex', () => {
      const result = findPatternMatch('/[invalid/', 'content');

      expect(result.matched).toBe(false);
    });

    it('should fall back to literal match for invalid implicit regex', () => {
      const result = findPatternMatch('[', 'array[0]');

      expect(result.matched).toBe(true);
      expect(result.matchedText).toBe('[');
    });
  });
});

describe('isIntentPattern', () => {
  it('should return true for intent patterns', () => {
    expect(isIntentPattern('@intent:cli-output')).toBe(true);
    expect(isIntentPattern('@intent:admin-only')).toBe(true);
  });

  it('should return false for non-intent patterns', () => {
    expect(isIntentPattern('console.log')).toBe(false);
    expect(isIntentPattern('@arch:domain')).toBe(false);
    expect(isIntentPattern('intent:')).toBe(false);
  });

  it('should handle empty string', () => {
    expect(isIntentPattern('')).toBe(false);
  });
});

describe('extractIntentName', () => {
  it('should extract intent name from valid pattern', () => {
    expect(extractIntentName('@intent:cli-output')).toBe('cli-output');
    expect(extractIntentName('@intent:admin-only')).toBe('admin-only');
    expect(extractIntentName('@intent:stateless')).toBe('stateless');
  });

  it('should return null for non-intent patterns', () => {
    expect(extractIntentName('console.log')).toBeNull();
    expect(extractIntentName('@arch:domain')).toBeNull();
  });

  it('should handle empty intent name', () => {
    expect(extractIntentName('@intent:')).toBe('');
  });
});

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('should return length of non-empty string when one is empty', () => {
    expect(levenshteinDistance('hello', '')).toBe(5);
    expect(levenshteinDistance('', 'world')).toBe(5);
  });

  it('should calculate distance for single character difference', () => {
    expect(levenshteinDistance('cat', 'hat')).toBe(1);
    expect(levenshteinDistance('cat', 'car')).toBe(1);
  });

  it('should calculate distance for insertions', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
    expect(levenshteinDistance('hello', 'hellooo')).toBe(2);
  });

  it('should calculate distance for deletions', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
    expect(levenshteinDistance('hello', 'hel')).toBe(2);
  });

  it('should calculate distance for complex differences', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
  });

  it('should handle completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });
});

describe('stringSimilarity', () => {
  it('should return 1.0 for identical strings', () => {
    expect(stringSimilarity('hello', 'hello')).toBe(1.0);
  });

  it('should return 1.0 for two empty strings', () => {
    expect(stringSimilarity('', '')).toBe(1.0);
  });

  it('should return 0 for completely different strings of same length', () => {
    expect(stringSimilarity('abc', 'xyz')).toBe(0);
  });

  it('should return value between 0 and 1 for partial matches', () => {
    const similarity = stringSimilarity('hello', 'hallo');
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
    expect(similarity).toBe(0.8); // 1 - 1/5 = 0.8
  });

  it('should return correct similarity for different length strings', () => {
    const similarity = stringSimilarity('cat', 'cats');
    expect(similarity).toBe(0.75); // 1 - 1/4 = 0.75
  });

  it('should be symmetric', () => {
    expect(stringSimilarity('hello', 'hallo')).toBe(stringSimilarity('hallo', 'hello'));
    expect(stringSimilarity('abc', 'abcd')).toBe(stringSimilarity('abcd', 'abc'));
  });
});
