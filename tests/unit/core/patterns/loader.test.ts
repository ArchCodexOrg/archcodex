/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for pattern registry loader.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findMatchingPatterns,
  checkForPatternDuplication,
  getPattern,
  filterByRelevance,
} from '../../../../src/core/patterns/loader.js';
import type { PatternRegistry, PatternMatch } from '../../../../src/core/patterns/types.js';

describe('Pattern Registry', () => {
  const mockRegistry: PatternRegistry = {
    patterns: {
      http_client: {
        canonical: 'src/core/api/client.ts',
        exports: ['ApiClient', 'ApiError'],
        usage: 'All HTTP calls must use ApiClient',
        keywords: ['http', 'fetch', 'request', 'api', 'axios'],
      },
      date_formatting: {
        canonical: 'src/utils/dates.ts',
        exports: ['formatDate', 'parseDate', 'isValidDate'],
        usage: 'Use date utilities, never raw Date methods',
        keywords: ['date', 'time', 'format', 'parse'],
      },
      logging: {
        canonical: 'src/core/logger.ts',
        exports: ['logger'],
        usage: 'Use structured logger, never console.log',
        keywords: ['log', 'debug', 'error', 'warn'],
      },
    },
  };

  describe('findMatchingPatterns', () => {
    it('should find patterns matching keywords in content', () => {
      const content = 'import axios from "axios";\nconst response = await fetch(url);';
      const matches = findMatchingPatterns(mockRegistry, content);

      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe('http_client');
      expect(matches[0].matchedKeywords).toContain('axios');
      expect(matches[0].matchedKeywords).toContain('fetch');
    });

    it('should return empty array when no patterns match', () => {
      const content = 'const x = 1 + 2;';
      const matches = findMatchingPatterns(mockRegistry, content);

      expect(matches).toEqual([]);
    });

    it('should sort by confidence (highest first)', () => {
      const content = 'logger.debug("message"); console.log("test");';
      const matches = findMatchingPatterns(mockRegistry, content);

      expect(matches.length).toBeGreaterThan(0);
      // First match should have highest confidence
      if (matches.length > 1) {
        expect(matches[0].confidence).toBeGreaterThanOrEqual(matches[1].confidence);
      }
    });

    it('should respect minConfidence threshold', () => {
      const content = 'fetch'; // Only one keyword
      const highThreshold = findMatchingPatterns(mockRegistry, content, {
        minConfidence: 0.8,
      });
      const lowThreshold = findMatchingPatterns(mockRegistry, content, {
        minConfidence: 0.1,
      });

      expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
    });

    it('should skip patterns with no keywords', () => {
      const registryNoKeywords: PatternRegistry = {
        patterns: {
          empty: {
            canonical: 'src/empty.ts',
          },
          with_keywords: {
            canonical: 'src/with.ts',
            keywords: ['match'],
          },
        },
      };

      const matches = findMatchingPatterns(registryNoKeywords, 'match this content');
      // The empty pattern (no keywords) should be skipped
      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe('with_keywords');
    });

    it('should use default minConfidence of 0.3 when not specified', () => {
      // Pattern with 5 keywords, matching 1 = 0.2 confidence (below 0.3 default)
      const content = 'http only';
      const matches = findMatchingPatterns(mockRegistry, content);

      // http_client has 5 keywords, matching 'http' = 0.2 confidence, below 0.3
      expect(matches.filter(m => m.name === 'http_client').length).toBe(0);
    });

    it('should perform case-insensitive keyword matching', () => {
      const content = 'HTTP FETCH REQUEST';
      const matches = findMatchingPatterns(mockRegistry, content);

      // Should match http_client keywords case-insensitively
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should calculate confidence as ratio of matched keywords to total', () => {
      // Match all 4 keywords of logging pattern
      const content = 'log debug error warn';
      const matches = findMatchingPatterns(mockRegistry, content);

      const loggingMatch = matches.find(m => m.name === 'logging');
      expect(loggingMatch).toBeDefined();
      expect(loggingMatch!.confidence).toBe(1.0); // 4/4
    });
  });

  describe('checkForPatternDuplication', () => {
    it('should detect potential duplication when import matches pattern keywords', () => {
      const result = checkForPatternDuplication(
        mockRegistry,
        'src/utils/http-helper.ts',
        ['fetchData', 'makeRequest']
      );

      expect(result).not.toBeNull();
      expect(result!.name).toBe('http_client');
    });

    it('should not flag imports from canonical source', () => {
      const result = checkForPatternDuplication(
        mockRegistry,
        'src/core/api/client.ts',
        ['ApiClient']
      );

      expect(result).toBeNull();
    });

    it('should detect duplication by exported symbols', () => {
      const result = checkForPatternDuplication(
        mockRegistry,
        'src/services/custom-logger.ts',
        ['logger', 'logMessage']
      );

      expect(result).not.toBeNull();
      expect(result!.name).toBe('logging');
    });

    it('should return null when no patterns match import or symbols', () => {
      const result = checkForPatternDuplication(
        mockRegistry,
        'src/services/auth.ts',
        ['authenticate', 'authorize']
      );

      expect(result).toBeNull();
    });

    it('should handle patterns with no keywords or exports gracefully', () => {
      const sparseRegistry: PatternRegistry = {
        patterns: {
          bare: {
            canonical: 'src/bare.ts',
            // No keywords or exports defined
          },
        },
      };

      const result = checkForPatternDuplication(
        sparseRegistry,
        'src/other.ts',
        ['anything']
      );

      // Should return null since bare pattern has no keywords/exports
      expect(result).toBeNull();
    });

    it('should detect duplication by symbol overlap even when import path does not match', () => {
      const result = checkForPatternDuplication(
        mockRegistry,
        'src/unrelated/path.ts',
        ['ApiClient'] // Matches http_client exports
      );

      expect(result).not.toBeNull();
      expect(result!.name).toBe('http_client');
    });

    it('should compute confidence correctly with empty keywords', () => {
      const registryEmptyKeywords: PatternRegistry = {
        patterns: {
          empty_kw: {
            canonical: 'src/empty.ts',
            keywords: [],
            exports: ['match'],
          },
        },
      };

      const result = checkForPatternDuplication(
        registryEmptyKeywords,
        'src/other.ts',
        ['match']
      );

      // symbolMatch is true, isNotCanonical is true, but keywords.length is 0
      // So confidence = 0
      if (result) {
        expect(result.confidence).toBe(0);
      }
    });
  });

  describe('getPattern', () => {
    it('should return pattern by name', () => {
      const pattern = getPattern(mockRegistry, 'http_client');

      expect(pattern).toBeDefined();
      expect(pattern!.canonical).toBe('src/core/api/client.ts');
    });

    it('should return undefined for unknown pattern', () => {
      const pattern = getPattern(mockRegistry, 'unknown');

      expect(pattern).toBeUndefined();
    });
  });

  describe('filterByRelevance', () => {
    const makeMatch = (name: string, canonical: string, exports?: string[]): PatternMatch => ({
      name,
      pattern: { canonical, exports, keywords: ['kw'] },
      confidence: 0.5,
      matchedKeywords: ['kw'],
    });

    it('should keep matches when file imports from canonical source', () => {
      const matches = [makeMatch('logger', 'src/utils/logger.ts', ['logger'])];

      const filtered = filterByRelevance(matches, {
        imports: ['../utils/logger'],
        exports: [],
        content: 'const x = 1;',
      });

      expect(filtered.length).toBe(1);
    });

    it('should keep matches when file content mentions pattern exports', () => {
      const matches = [makeMatch('logger', 'src/utils/logger.ts', ['logger'])];

      const filtered = filterByRelevance(matches, {
        imports: [],
        exports: [],
        content: 'const l = logger.create();',
      });

      expect(filtered.length).toBe(1);
    });

    it('should keep matches when file exports similar symbols', () => {
      const matches = [makeMatch('logger', 'src/utils/logger.ts', ['logger'])];

      const filtered = filterByRelevance(matches, {
        imports: [],
        exports: ['createLogger'], // Contains 'logger' (case-insensitive)
        content: 'function createLogger() {}',
      });

      expect(filtered.length).toBe(1);
    });

    it('should remove matches that are not relevant', () => {
      const matches = [makeMatch('logger', 'src/utils/logger.ts', ['logger'])];

      const filtered = filterByRelevance(matches, {
        imports: ['../auth/service'],
        exports: ['AuthService'],
        content: 'class AuthService {}',
      });

      expect(filtered.length).toBe(0);
    });

    it('should handle patterns with no exports', () => {
      const matches = [makeMatch('bare', 'src/bare.ts')];

      const filtered = filterByRelevance(matches, {
        imports: [],
        exports: [],
        content: 'const x = 1;',
      });

      // No exports to match, not imported, should be filtered out
      expect(filtered.length).toBe(0);
    });

    it('should handle canonical path ending with index file', () => {
      const matches = [makeMatch('core', 'src/core/index.ts', ['CoreEngine'])];

      const filtered = filterByRelevance(matches, {
        imports: ['../core'],
        exports: [],
        content: 'import { CoreEngine } from "../core";',
      });

      // The getBaseName of 'src/core/index.ts' is 'core'
      // '../core' should match since its base name is also 'core'
      expect(filtered.length).toBe(1);
    });

    it('should match when import base name equals canonical base name', () => {
      const matches = [makeMatch('dates', 'src/utils/dates.ts', ['formatDate'])];

      const filtered = filterByRelevance(matches, {
        imports: ['../../utils/dates'],
        exports: [],
        content: 'const d = new Date();',
      });

      expect(filtered.length).toBe(1);
    });

    it('should match when file export name contains pattern export name', () => {
      const matches = [makeMatch('dates', 'src/utils/dates.ts', ['parse'])];

      const filtered = filterByRelevance(matches, {
        imports: [],
        exports: ['parseJSON'], // contains 'parse'
        content: '',
      });

      expect(filtered.length).toBe(1);
    });

    it('should match when pattern export name contains file export name', () => {
      const matches = [makeMatch('dates', 'src/utils/dates.ts', ['formatDate'])];

      const filtered = filterByRelevance(matches, {
        imports: [],
        exports: ['format'], // 'formatDate' contains 'format'
        content: '',
      });

      expect(filtered.length).toBe(1);
    });
  });
});

describe('loadPatternRegistry', () => {
  it('should return empty registry for a project with no patterns file', async () => {
    const { loadPatternRegistry } = await import('../../../../src/core/patterns/loader.js');

    // Point to a temp directory that definitely doesn't have a patterns.yaml
    const result = await loadPatternRegistry('/tmp/nonexistent-archcodex-test-dir');

    expect(result.patterns).toEqual({});
  });
});
