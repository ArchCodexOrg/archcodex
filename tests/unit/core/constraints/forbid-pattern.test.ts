/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the ForbidPatternValidator.
 */
import { describe, it, expect } from 'vitest';
import { ForbidPatternValidator } from '../../../../src/core/constraints/forbid-pattern.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext, ParsedFile } from '../../../../src/core/constraints/types.js';
import { ErrorCodes } from '../../../../src/utils/errors.js';

describe('ForbidPatternValidator', () => {
  const validator = new ForbidPatternValidator();

  function createContext(content: string, filePath = '/test/file.ts'): ConstraintContext {
    const parsedFile: ParsedFile = {
      content,
      filePath,
      classes: [],
      imports: [],
      exports: [],
      functions: [],
      decorators: [],
    };

    return {
      parsedFile,
      constraintSource: 'test.architecture',
    };
  }

  describe('rule and errorCode', () => {
    it('should have correct rule name', () => {
      expect(validator.rule).toBe('forbid_pattern');
    });

    it('should have correct error code', () => {
      expect(validator.errorCode).toBe(ErrorCodes.FORBID_PATTERN);
    });
  });

  describe('validate', () => {
    it('should pass when pattern is not found', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console\\.log',
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context = createContext(`
        function test() {
          return 42;
        }
      `);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when pattern is found', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log statements',
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context = createContext(`
        function test() {
          console.log('debug');
          return 42;
        }
      `);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('Forbidden pattern found');
      expect(result.violations[0].code).toBe(ErrorCodes.FORBID_PATTERN);
    });

    it('should report multiple matches', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log statements',
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context = createContext(`
        function test() {
          console.log('first');
          console.log('second');
          console.log('third');
          return 42;
        }
      `);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(3);
    });

    it('should use value as pattern if pattern field is missing', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console\\.log',
        severity: 'error',
      };

      const context = createContext(`
        function test() {
          console.log('test');
        }
      `);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should detect any type usage', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'any type usage',
        pattern: ':\\s*any\\b',
        severity: 'error',
      };

      const context = createContext(`
        function process(data: any): any {
          return data;
        }
      `);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
    });

    it('should detect hardcoded passwords', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'hardcoded password',
        pattern: 'password\\s*=\\s*["\'][^"\']+["\']',
        severity: 'error',
      };

      const context = createContext(`
        const config = {
          password = "secret123",
          username: "admin"
        };
      `);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should handle multiline patterns with dotAll flag', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'multiline block comment',
        pattern: '/\\*[\\s\\S]*TODO[\\s\\S]*\\*/',
        severity: 'warning',
      };

      const context = createContext(`
        /*
         * This is a comment
         * TODO: fix this later
         * End of comment
         */
        function test() {}
      `);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should include line numbers in violations', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context = createContext(`line 1
line 2
console.log('on line 3');
line 4`);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations[0].line).toBe(3);
    });

    it('should fail if constraint has no pattern or value string', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: ['array', 'not', 'string'],
        severity: 'error',
      };

      const context = createContext('some content');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain("missing 'pattern' field");
    });

    it('should fail gracefully on invalid regex', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'invalid regex',
        pattern: '[invalid(regex',
        severity: 'error',
      };

      const context = createContext('some content');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('Invalid regex pattern');
    });

    it('should include why and fixHint in violations', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        why: 'Use logger instead for structured logging',
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);
      expect(result.violations[0].why).toBe('Use logger instead for structured logging');
      expect(result.violations[0].fixHint).toContain('Remove or refactor');
    });

    it('should preserve severity from constraint', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'TODO comment',
        pattern: '// TODO',
        severity: 'warning',
      };

      const context = createContext('// TODO: fix later');

      const result = validator.validate(constraint, context);
      expect(result.violations[0].severity).toBe('warning');
    });
  });

  describe('intent exemptions', () => {
    it('should skip constraint entirely when file has exempting intent', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log statements',
        pattern: 'console\\.log',
        severity: 'error',
        unless: ['@intent:cli-output'],
      };

      const context: ConstraintContext = {
        parsedFile: {
          content: 'console.log("test");',
          filePath: '/test/file.ts',
          classes: [],
          imports: [],
          exports: [],
          functions: [],
          decorators: [],
        },
        constraintSource: 'test.arch',
        intents: [{ name: 'cli-output', line: 1, column: 1 }],
      };

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should still violate when file has different intent', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log statements',
        pattern: 'console\\.log',
        severity: 'error',
        unless: ['@intent:cli-output'],
      };

      const context: ConstraintContext = {
        parsedFile: {
          content: 'console.log("test");',
          filePath: '/test/file.ts',
          classes: [],
          imports: [],
          exports: [],
          functions: [],
          decorators: [],
        },
        constraintSource: 'test.arch',
        intents: [{ name: 'admin-only', line: 1, column: 1 }],
      };

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should skip match when containing function has exempting intent', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log statements',
        pattern: 'console\\.log',
        severity: 'error',
        unless: ['@intent:cli-output'],
      };

      const context: ConstraintContext = {
        parsedFile: {
          content: `function test() {
  // line 2
  console.log("test");
  // line 4
}`,
          filePath: '/test/file.ts',
          classes: [],
          imports: [],
          exports: [],
          functions: [
            {
              name: 'test',
              location: { line: 1, column: 1 },
              isAsync: false,
              isExported: false,
              isGenerator: false,
              parameters: [],
              intents: ['cli-output'],
              startLine: 1,
              endLine: 5,
            },
          ],
          decorators: [],
        },
        constraintSource: 'test.arch',
        intents: [],
      };

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should violate when containing function lacks exempting intent', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log statements',
        pattern: 'console\\.log',
        severity: 'error',
        unless: ['@intent:cli-output'],
      };

      const context: ConstraintContext = {
        parsedFile: {
          content: `function test() {
  console.log("test");
}`,
          filePath: '/test/file.ts',
          classes: [],
          imports: [],
          exports: [],
          functions: [
            {
              name: 'test',
              location: { line: 1, column: 1 },
              isAsync: false,
              isExported: false,
              isGenerator: false,
              parameters: [],
              intents: [], // No intents
              startLine: 1,
              endLine: 3,
            },
          ],
          decorators: [],
        },
        constraintSource: 'test.arch',
        intents: [],
      };

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should handle mixed intent and non-intent unless conditions', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        unless: ['@intent:cli-output', 'some-other-condition'],
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
    });
  });

  describe('suggestion building', () => {
    it('should include replace suggestion with alternative', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        alternative: 'logger.info',
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toEqual({
        action: 'replace',
        target: 'console.log',
        replacement: 'logger.info',
      });
    });

    it('should include replace suggestion with detailed alternatives', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/logger',
            export: 'logger',
            description: 'Structured logger',
          },
        ],
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toEqual({
        action: 'replace',
        target: 'console.log',
        replacement: 'logger',
        importStatement: "import { logger } from 'src/utils/logger';",
      });
    });

    it('should include remove suggestion when no alternative', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toEqual({
        action: 'remove',
        target: 'console.log',
      });
    });

    it('should omit importStatement when no export in alternatives', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/logger',
            // No export
          },
        ],
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion?.importStatement).toBeUndefined();
    });
  });

  describe('didYouMean building', () => {
    it('should include didYouMean from alternative', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        alternative: 'logger.info',
        why: 'Use structured logging',
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toEqual({
        file: 'logger.info',
        description: 'Use structured logging',
      });
    });

    it('should include didYouMean from detailed alternatives', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/logger',
            export: 'logger',
            description: 'Structured logger',
            example: 'logger.info("message")',
          },
        ],
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toEqual({
        file: 'src/utils/logger',
        export: 'logger',
        description: 'Structured logger',
        exampleUsage: 'logger.info("message")',
      });
    });

    it('should use default description for alternatives without description', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/logger',
            export: 'logger',
          },
        ],
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.description).toBe('Use the canonical implementation');
    });

    it('should use default description for alternative without why', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        alternative: 'logger.info',
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.description).toBe('Use the approved alternative instead');
    });

    it('should include didYouMean from pattern registry', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console log statements',
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context: ConstraintContext = {
        parsedFile: {
          content: 'console.log("test");',
          filePath: '/test/file.ts',
          classes: [],
          imports: [],
          exports: [],
          functions: [],
          decorators: [],
        },
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            logger: {
              canonical: 'src/utils/logger.ts',
              exports: ['logger'],
              usage: 'Use structured logger',
              keywords: ['log', 'console', 'debug'],
            },
          },
        },
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toEqual({
        file: 'src/utils/logger.ts',
        export: 'logger',
        description: 'Use structured logger',
        exampleUsage: undefined,
      });
    });

    it('should return undefined didYouMean when no match in pattern registry', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'dangerous function',
        pattern: 'someDangerousFunc\\(',
        severity: 'error',
      };

      const context: ConstraintContext = {
        parsedFile: {
          content: 'someDangerousFunc("code");',
          filePath: '/test/file.ts',
          classes: [],
          imports: [],
          exports: [],
          functions: [],
          decorators: [],
        },
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            logger: {
              canonical: 'src/utils/logger.ts',
              keywords: ['log', 'debug'],
            },
          },
        },
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toBeUndefined();
    });

    it('should handle pattern registry with no patterns', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context: ConstraintContext = {
        parsedFile: {
          content: 'console.log("test");',
          filePath: '/test/file.ts',
          classes: [],
          imports: [],
          exports: [],
          functions: [],
          decorators: [],
        },
        constraintSource: 'test.arch',
        patternRegistry: {},
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toBeUndefined();
    });

    it('should include example from pattern registry', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console log statements',
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context: ConstraintContext = {
        parsedFile: {
          content: 'console.log("test");',
          filePath: '/test/file.ts',
          classes: [],
          imports: [],
          exports: [],
          functions: [],
          decorators: [],
        },
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            logger: {
              canonical: 'src/utils/logger.ts',
              exports: ['logger'],
              keywords: ['log', 'console'],
              example: 'logger.info("message")',
            },
          },
        },
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.exampleUsage).toBe('logger.info("message")');
    });
  });

  describe('getFixHint', () => {
    it('should return hint with alternative', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        alternative: 'logger.info',
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe("Replace with 'logger.info'");
    });

    it('should return hint with alternatives module', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/logger',
            export: 'logger',
          },
        ],
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe("Replace with 'src/utils/logger' (use logger)");
    });

    it('should return hint with alternatives module without export', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log',
        pattern: 'console\\.log',
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/logger',
          },
        ],
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe("Replace with 'src/utils/logger'");
    });

    it('should return default hint with description when no alternative', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: 'console.log statements',
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe('Remove or refactor code matching: console.log statements');
    });

    it('should use pattern as fallback description when value is not string', () => {
      const constraint: Constraint = {
        rule: 'forbid_pattern',
        value: ['array'],
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context = createContext('console.log("test");');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe('Remove or refactor code matching: the pattern');
    });
  });
});
