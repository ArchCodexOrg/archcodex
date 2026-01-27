/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { ImportableByValidator } from '../../../../src/core/constraints/importable-by.js';
import type { ProjectConstraintContext } from '../../../../src/core/constraints/types.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';

describe('ImportableByValidator', () => {
  const validator = new ImportableByValidator();

  const createContext = (
    archId: string,
    importers: Array<{ filePath: string; archId: string | null; line?: number }>
  ): ProjectConstraintContext => ({
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    parsedFile: {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      extension: '.ts',
      content: '',
      lineCount: 0,
      language: 'typescript',
      imports: [],
      classes: [],
      interfaces: [],
      functions: [],
    },
    archId,
    constraintSource: archId,
    importers,
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('importable_by');
  });

  it('should have error code E012', () => {
    expect(validator.errorCode).toBe('E012');
  });

  it('should pass when no importers exist', () => {
    const constraint: Constraint = {
      rule: 'importable_by',
      value: ['domain.allowed.*'],
      severity: 'error',
      source: 'test',
    };

    const context = createContext('domain.protected', []);
    const result = validator.validate(constraint, context);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should pass when importer matches allowed pattern', () => {
    const constraint: Constraint = {
      rule: 'importable_by',
      value: ['domain.allowed.*'],
      severity: 'error',
      source: 'test',
    };

    const context = createContext('domain.protected', [
      { filePath: '/other/file.ts', archId: 'domain.allowed.service' },
    ]);
    const result = validator.validate(constraint, context);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should fail when importer does not match allowed patterns', () => {
    const constraint: Constraint = {
      rule: 'importable_by',
      value: ['domain.allowed.*'],
      severity: 'error',
      source: 'test',
    };

    const context = createContext('domain.protected', [
      { filePath: '/other/file.ts', archId: 'domain.unauthorized.service' },
    ]);
    const result = validator.validate(constraint, context);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].code).toBe('E012');
    expect(result.violations[0].message).toContain('domain.unauthorized.service');
  });

  it('should skip untagged importers', () => {
    const constraint: Constraint = {
      rule: 'importable_by',
      value: ['domain.allowed.*'],
      severity: 'error',
      source: 'test',
    };

    const context = createContext('domain.protected', [
      { filePath: '/other/file.ts', archId: null },
    ]);
    const result = validator.validate(constraint, context);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should support ** glob pattern for multi-segment matching', () => {
    const constraint: Constraint = {
      rule: 'importable_by',
      value: ['test.**'],
      severity: 'error',
      source: 'test',
    };

    const context = createContext('domain.protected', [
      { filePath: '/test/unit/service.test.ts', archId: 'test.unit.domain.protected' },
    ]);
    const result = validator.validate(constraint, context);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
