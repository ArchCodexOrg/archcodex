/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for LocationPatternValidator constraint.
 */
import { describe, it, expect } from 'vitest';
import { LocationPatternValidator } from '../../../../src/core/constraints/location-pattern.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel } from '../../../../src/validators/semantic.types.js';

describe('LocationPatternValidator', () => {
  const validator = new LocationPatternValidator();

  const createContext = (filePath: string): ConstraintContext => ({
    filePath,
    fileName: filePath.split('/').pop() ?? '',
    archId: 'test.arch',
    constraintSource: 'test',
    parsedFile: {
      filePath,
      fileName: filePath.split('/').pop() ?? '',
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
      exports: [],
    } as SemanticModel,
  });

  const createConstraint = (value: string): Constraint => ({
    rule: 'location_pattern',
    value,
    severity: 'error',
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('location_pattern');
  });

  it('should have error code E008', () => {
    expect(validator.errorCode).toBe('E008');
  });

  it('should have validate method', () => {
    expect(typeof validator.validate).toBe('function');
  });

  describe('validate', () => {
    it('should pass when file is in the required directory', () => {
      const context = createContext('src/core/db/manager.ts');
      const constraint = createConstraint('src/core/db');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass when file path starts with the required directory', () => {
      const context = createContext('src/core/db/manager.ts');
      const constraint = createConstraint('src/core/db/');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when file is not in the required directory', () => {
      const context = createContext('src/cli/commands/map.ts');
      const constraint = createConstraint('src/core/db');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain("must be located in 'src/core/db'");
    });

    it('should not match substring of directory name (boundary check)', () => {
      // 'src/component' should NOT match 'src/mycomponents/foo.ts'
      // because the trailing slash enforcement prevents "src/component/" from matching "src/mycomponents/"
      const context = createContext('src/mycomponents/foo.ts');
      const constraint = createConstraint('src/component');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
    });

    it('should handle backslash normalization in file paths', () => {
      const context = createContext('src\\core\\db\\manager.ts');
      const constraint = createConstraint('src/core/db');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should handle backslash normalization in required path', () => {
      const context = createContext('src/core/db/manager.ts');
      const constraint = createConstraint('src\\core\\db');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should pass when file path contains the required path in middle', () => {
      const context = createContext('project/src/core/db/manager.ts');
      const constraint = createConstraint('src/core/db');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should pass when file path exactly matches required path without trailing slash', () => {
      // Edge case: file path ends with the required path (without trailing /)
      const context = createContext('project/src/core/db');
      const constraint = createConstraint('src/core/db');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should include violation details with line 1 and actual file path', () => {
      const context = createContext('src/wrong/place.ts');
      const constraint = createConstraint('src/correct/path');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations[0].line).toBe(1);
      expect(result.violations[0].column).toBe(1);
    });

    it('should include fix hint in violation', () => {
      const context = createContext('src/wrong/place.ts');
      const constraint = createConstraint('src/correct/path');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations[0].fixHint).toContain('Move the file to');
      expect(result.violations[0].fixHint).toContain('src/correct/path');
    });

    it('should include correct error code in violations', () => {
      const context = createContext('src/wrong/place.ts');
      const constraint = createConstraint('src/correct/path');

      const result = validator.validate(constraint, context);
      expect(result.violations[0].code).toBe('E008');
      expect(result.violations[0].rule).toBe('location_pattern');
    });

    it('should pass for deeply nested file in required directory', () => {
      const context = createContext('src/core/db/repositories/entities/user.ts');
      const constraint = createConstraint('src/core/db');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should handle required path with trailing slash', () => {
      const context = createContext('src/core/db/manager.ts');
      const constraint = createConstraint('src/core/db/');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should handle empty required path', () => {
      const context = createContext('src/core/db/manager.ts');
      const constraint = createConstraint('');

      // Empty required path + '/' = '/' which should be in any path
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });
  });
});
