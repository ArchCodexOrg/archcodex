/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for pattern registry loader.
 */
import { describe, it, expect } from 'vitest';
import {
  findMatchingPatterns,
  checkForPatternDuplication,
  getPattern,
} from '../../../../src/core/patterns/loader.js';
import type { PatternRegistry } from '../../../../src/core/patterns/types.js';

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
});
