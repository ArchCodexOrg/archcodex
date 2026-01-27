/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { RequirePatternValidator } from '../../../../src/core/constraints/require-pattern.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel } from '../../../../src/validators/semantic.types.js';

describe('RequirePatternValidator', () => {
  const validator = new RequirePatternValidator();

  const createContext = (content: string): ConstraintContext => ({
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    archId: 'test.arch',
    constraintSource: 'test.arch',
    parsedFile: {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      extension: '.ts',
      content,
      lineCount: content.split('\n').length,
      language: 'typescript',
      imports: [],
      classes: [],
      interfaces: [],
      functions: [],
      functionCalls: [],
      mutations: [],
      exports: [],
    } as SemanticModel,
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('require_pattern');
  });

  it('should pass when pattern is found', () => {
    const constraint: Constraint = {
      rule: 'require_pattern',
      value: 'soft delete check',
      pattern: 'isDeleted\\s*===?\\s*false',
      severity: 'error',
    };
    const context = createContext('const items = db.filter(x => x.isDeleted === false);');
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should fail when pattern is not found', () => {
    const constraint: Constraint = {
      rule: 'require_pattern',
      value: 'soft delete check',
      pattern: 'isDeleted\\s*===?\\s*false',
      severity: 'error',
    };
    const context = createContext('const items = db.filter(x => x.active);');
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('should use value as pattern if pattern field is missing', () => {
    const constraint: Constraint = {
      rule: 'require_pattern',
      value: '@security-reviewed',
      severity: 'error',
    };
    const context = createContext('// @security-reviewed by team on 2024-01-01');
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should handle invalid regex gracefully', () => {
    const constraint: Constraint = {
      rule: 'require_pattern',
      value: 'invalid',
      pattern: '[invalid(regex',
      severity: 'error',
    };
    const context = createContext('some content');
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
    expect(result.violations[0].message).toContain('Invalid regex');
  });
});
