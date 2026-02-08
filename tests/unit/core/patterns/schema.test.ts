/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for pattern registry Zod schema validation.
 */
import { describe, it, expect } from 'vitest';
import {
  PatternSchema,
  PatternRegistrySchema,
} from '../../../../src/core/patterns/schema.js';

describe('PatternSchema', () => {
  it('should parse minimal pattern with only canonical', () => {
    const result = PatternSchema.parse({
      canonical: 'src/utils/http-client.ts',
    });
    expect(result.canonical).toBe('src/utils/http-client.ts');
    expect(result.exports).toBeUndefined();
    expect(result.usage).toBeUndefined();
    expect(result.keywords).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.example).toBeUndefined();
  });

  it('should parse pattern with all fields', () => {
    const result = PatternSchema.parse({
      canonical: 'src/utils/logger.ts',
      exports: ['Logger', 'createLogger'],
      usage: 'Use Logger for all structured logging',
      keywords: ['log', 'debug', 'trace', 'console'],
      description: 'Centralized logging utility',
      example: 'const logger = createLogger("my-module");',
    });

    expect(result.canonical).toBe('src/utils/logger.ts');
    expect(result.exports).toEqual(['Logger', 'createLogger']);
    expect(result.usage).toBe('Use Logger for all structured logging');
    expect(result.keywords).toEqual(['log', 'debug', 'trace', 'console']);
    expect(result.description).toBe('Centralized logging utility');
    expect(result.example).toBe('const logger = createLogger("my-module");');
  });

  it('should reject missing canonical field', () => {
    expect(() => PatternSchema.parse({})).toThrow();
    expect(() => PatternSchema.parse({ exports: ['Foo'] })).toThrow();
  });

  it('should reject non-string canonical', () => {
    expect(() => PatternSchema.parse({ canonical: 42 })).toThrow();
    expect(() => PatternSchema.parse({ canonical: null })).toThrow();
  });

  it('should reject non-array exports', () => {
    expect(() => PatternSchema.parse({
      canonical: 'src/foo.ts',
      exports: 'NotAnArray',
    })).toThrow();
  });

  it('should accept empty arrays for exports and keywords', () => {
    const result = PatternSchema.parse({
      canonical: 'src/foo.ts',
      exports: [],
      keywords: [],
    });
    expect(result.exports).toEqual([]);
    expect(result.keywords).toEqual([]);
  });
});

describe('PatternRegistrySchema', () => {
  it('should parse empty registry', () => {
    const result = PatternRegistrySchema.parse({});
    expect(result.patterns).toEqual({});
  });

  it('should parse explicit empty patterns', () => {
    const result = PatternRegistrySchema.parse({ patterns: {} });
    expect(result.patterns).toEqual({});
  });

  it('should parse registry with multiple patterns', () => {
    const result = PatternRegistrySchema.parse({
      patterns: {
        httpClient: {
          canonical: 'src/utils/http-client.ts',
          exports: ['HttpClient'],
          keywords: ['http', 'axios', 'fetch'],
        },
        logger: {
          canonical: 'src/utils/logger.ts',
          exports: ['Logger'],
          keywords: ['log', 'debug'],
        },
      },
    });

    expect(Object.keys(result.patterns)).toHaveLength(2);
    expect(result.patterns.httpClient.canonical).toBe('src/utils/http-client.ts');
    expect(result.patterns.logger.exports).toEqual(['Logger']);
  });

  it('should reject invalid pattern in registry', () => {
    expect(() => PatternRegistrySchema.parse({
      patterns: {
        bad: { exports: ['Missing canonical'] },
      },
    })).toThrow();
  });

  it('should reject non-object patterns value', () => {
    expect(() => PatternRegistrySchema.parse({
      patterns: 'not-an-object',
    })).toThrow();
  });

  it('should default patterns when not provided', () => {
    const result = PatternRegistrySchema.parse({});
    expect(result.patterns).toEqual({});
  });
});
