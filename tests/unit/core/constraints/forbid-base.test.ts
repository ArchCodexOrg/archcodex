/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for BaseForbidValidator shared methods.
 */
import { describe, it, expect } from 'vitest';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext, ConstraintResult } from '../../../../src/core/constraints/types.js';
import type { SemanticModel } from '../../../../src/validators/semantic.types.js';
import type { PatternRegistry } from '../../../../src/core/patterns/types.js';
import { BaseForbidValidator } from '../../../../src/core/constraints/forbid-base.js';

/**
 * Concrete subclass to expose protected methods for testing.
 */
class TestForbidValidator extends BaseForbidValidator {
  readonly rule = 'forbid_call' as const;
  readonly errorCode = 'E999';

  validate(_constraint: Constraint, _context: ConstraintContext): ConstraintResult {
    return { passed: true, violations: [] };
  }

  // Expose protected methods for testing
  public testExtractIntentExemptions(unless?: string[]) {
    return this.extractIntentExemptions(unless);
  }

  public testBuildSuggestion(constraint: Constraint, target?: string) {
    return this.buildSuggestion(constraint, target);
  }

  public testBuildDidYouMean(constraint: Constraint, context: ConstraintContext, searchTerm?: string) {
    return this.buildDidYouMean(constraint, context, searchTerm);
  }

  public testFindMatchingPattern(registry: PatternRegistry, searchTerm: string) {
    return this.findMatchingPattern(registry, searchTerm);
  }
}

function createContext(overrides?: Partial<ConstraintContext>): ConstraintContext {
  const parsedFile: SemanticModel = {
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    extension: '.ts',
    content: '',
    lineCount: 10,
    language: 'typescript',
    imports: [],
    classes: [],
    interfaces: [],
    functions: [],
    functionCalls: [],
    mutations: [],
  };

  return {
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    parsedFile,
    archId: 'test.arch',
    constraintSource: 'test.arch',
    ...overrides,
  };
}

function baseConstraint(overrides?: Partial<Constraint>): Constraint {
  return {
    rule: 'forbid_call',
    value: 'test',
    severity: 'error',
    ...overrides,
  };
}

describe('BaseForbidValidator', () => {
  const validator = new TestForbidValidator();

  describe('extractIntentExemptions', () => {
    it('should return empty array for undefined', () => {
      expect(validator.testExtractIntentExemptions(undefined)).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(validator.testExtractIntentExemptions([])).toEqual([]);
    });

    it('should extract intent names from @intent: prefixed strings', () => {
      const result = validator.testExtractIntentExemptions([
        '@intent:logging',
        '@intent:testing',
      ]);
      expect(result).toEqual(['logging', 'testing']);
    });

    it('should filter out non-intent entries', () => {
      const result = validator.testExtractIntentExemptions([
        '@intent:logging',
        'some-other-condition',
        '@override:something',
      ]);
      expect(result).toEqual(['logging']);
    });

    it('should handle mixed intent and non-intent entries', () => {
      const result = validator.testExtractIntentExemptions([
        'plain',
        '@intent:first',
        'another',
        '@intent:second',
      ]);
      expect(result).toEqual(['first', 'second']);
    });
  });

  describe('buildSuggestion', () => {
    it('should return replace suggestion with simple alternative', () => {
      const constraint = baseConstraint({ alternative: 'safeCall' });

      expect(validator.testBuildSuggestion(constraint, 'dangerousCall')).toEqual({
        action: 'replace',
        target: 'dangerousCall',
        replacement: 'safeCall',
      });
    });

    it('should return replace suggestion with detailed alternative (with export)', () => {
      const constraint = baseConstraint({
        alternatives: [{
          module: 'src/utils/logger',
          export: 'logger',
          description: 'Canonical logger',
        }],
      });

      expect(validator.testBuildSuggestion(constraint, 'console.log')).toEqual({
        action: 'replace',
        target: 'console.log',
        replacement: 'logger',
        importStatement: "import { logger } from 'src/utils/logger';",
      });
    });

    it('should use module name when no export in alternatives', () => {
      const constraint = baseConstraint({
        alternatives: [{
          module: 'src/utils/http-client',
        }],
      });

      expect(validator.testBuildSuggestion(constraint, 'axios')).toEqual({
        action: 'replace',
        target: 'axios',
        replacement: 'src/utils/http-client',
        importStatement: undefined,
      });
    });

    it('should return remove suggestion when no alternative', () => {
      const constraint = baseConstraint();

      expect(validator.testBuildSuggestion(constraint, 'badCall')).toEqual({
        action: 'remove',
        target: 'badCall',
      });
    });

    it('should handle undefined target', () => {
      const constraint = baseConstraint({ alternative: 'safe' });

      expect(validator.testBuildSuggestion(constraint)).toEqual({
        action: 'replace',
        target: undefined,
        replacement: 'safe',
      });
    });

    it('should prefer simple alternative over detailed alternatives', () => {
      const constraint = baseConstraint({
        alternative: 'simpleAlt',
        alternatives: [{ module: 'detailed/alt', export: 'DetailedAlt' }],
      });

      expect(validator.testBuildSuggestion(constraint, 'target')).toEqual({
        action: 'replace',
        target: 'target',
        replacement: 'simpleAlt',
      });
    });
  });

  describe('buildDidYouMean', () => {
    it('should return didYouMean from simple alternative', () => {
      const constraint = baseConstraint({
        alternative: 'src/utils/safe.ts',
        why: 'Use the safe version',
      });

      expect(validator.testBuildDidYouMean(constraint, createContext())).toEqual({
        file: 'src/utils/safe.ts',
        description: 'Use the safe version',
      });
    });

    it('should use default description when no why', () => {
      const constraint = baseConstraint({ alternative: 'alt.ts' });

      expect(validator.testBuildDidYouMean(constraint, createContext())).toEqual({
        file: 'alt.ts',
        description: 'Use the approved alternative instead',
      });
    });

    it('should return didYouMean from detailed alternatives', () => {
      const constraint = baseConstraint({
        alternatives: [{
          module: 'src/utils/logger',
          export: 'logger',
          description: 'Canonical logger implementation',
          example: "import { logger } from 'src/utils/logger';",
        }],
      });

      expect(validator.testBuildDidYouMean(constraint, createContext())).toEqual({
        file: 'src/utils/logger',
        export: 'logger',
        description: 'Canonical logger implementation',
        exampleUsage: "import { logger } from 'src/utils/logger';",
      });
    });

    it('should use default description for detailed alternative without description', () => {
      const constraint = baseConstraint({
        alternatives: [{ module: 'src/utils/http' }],
      });

      const result = validator.testBuildDidYouMean(constraint, createContext());
      expect(result?.description).toBe('Use the canonical implementation');
    });

    it('should look up pattern registry with explicit searchTerm', () => {
      const registry: PatternRegistry = {
        patterns: {
          logging: {
            canonical: 'src/utils/logger.ts',
            exports: ['logger'],
            usage: 'Use logger for all logging',
            keywords: ['console', 'log', 'debug'],
            example: "logger.info('message');",
          },
        },
      };
      const context = createContext({ patternRegistry: registry });
      const constraint = baseConstraint();

      const result = validator.testBuildDidYouMean(constraint, context, 'console.log');

      expect(result).toEqual({
        file: 'src/utils/logger.ts',
        export: 'logger',
        description: 'Use logger for all logging',
        exampleUsage: "logger.info('message');",
      });
    });

    it('should fall back to constraint.value when no searchTerm provided', () => {
      const registry: PatternRegistry = {
        patterns: {
          logging: {
            canonical: 'src/utils/logger.ts',
            exports: ['logger'],
            keywords: ['console'],
          },
        },
      };
      const context = createContext({ patternRegistry: registry });
      const constraint = baseConstraint({ value: 'console.log' });

      const result = validator.testBuildDidYouMean(constraint, context);

      expect(result).toBeDefined();
      expect(result?.file).toBe('src/utils/logger.ts');
    });

    it('should return undefined when nothing matches', () => {
      const constraint = baseConstraint();
      expect(validator.testBuildDidYouMean(constraint, createContext())).toBeUndefined();
    });

    it('should return undefined when pattern registry has no match', () => {
      const registry: PatternRegistry = {
        patterns: {
          logging: {
            canonical: 'src/utils/logger.ts',
            keywords: ['console'],
          },
        },
      };
      const context = createContext({ patternRegistry: registry });
      const constraint = baseConstraint({ value: 'axios' });

      expect(validator.testBuildDidYouMean(constraint, context)).toBeUndefined();
    });
  });

  describe('findMatchingPattern', () => {
    const registry: PatternRegistry = {
      patterns: {
        logging: {
          canonical: 'src/utils/logger.ts',
          exports: ['logger'],
          keywords: ['console', 'log', 'debug'],
        },
        http: {
          canonical: 'src/utils/http-client.ts',
          exports: ['httpClient'],
          keywords: ['axios', 'fetch', 'http'],
        },
      },
    };

    it('should find pattern by keyword match', () => {
      const result = validator.testFindMatchingPattern(registry, 'console.log');
      expect(result?.canonical).toBe('src/utils/logger.ts');
    });

    it('should find pattern by reverse keyword match', () => {
      const result = validator.testFindMatchingPattern(registry, 'ax');
      // 'ax' is included in 'axios', so reverse match works
      expect(result?.canonical).toBe('src/utils/http-client.ts');
    });

    it('should return undefined for no match', () => {
      const result = validator.testFindMatchingPattern(registry, 'unrelated');
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty registry', () => {
      const result = validator.testFindMatchingPattern({ patterns: {} }, 'console');
      expect(result).toBeUndefined();
    });

    it('should return undefined when patterns is undefined', () => {
      const result = validator.testFindMatchingPattern({} as PatternRegistry, 'console');
      expect(result).toBeUndefined();
    });

    it('should match case-insensitively', () => {
      const result = validator.testFindMatchingPattern(registry, 'CONSOLE');
      expect(result?.canonical).toBe('src/utils/logger.ts');
    });
  });
});
