/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { RequireExportValidator } from '../../../../src/core/constraints/require-export.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, ExportInfo } from '../../../../src/validators/semantic.types.js';

describe('RequireExportValidator', () => {
  const validator = new RequireExportValidator();

  const createContext = (exports: Partial<ExportInfo>[]): ConstraintContext => ({
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    archId: 'test.arch',
    constraintSource: 'test.arch',
    parsedFile: {
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
      exports: exports.map(e => ({
        name: e.name || '',
        kind: e.kind || 'variable',
        isDefault: e.isDefault || false,
        location: { line: 1, column: 1 },
      })),
    } as SemanticModel,
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('require_export');
  });

  it('should pass when required export exists', () => {
    const constraint: Constraint = { rule: 'require_export', value: ['UserProvider'], severity: 'error' };
    const context = createContext([{ name: 'UserProvider', kind: 'function' }]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should fail when required export is missing', () => {
    const constraint: Constraint = { rule: 'require_export', value: ['UserProvider'], severity: 'error' };
    const context = createContext([{ name: 'SomethingElse', kind: 'function' }]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('UserProvider');
  });

  it('should match wildcard suffix pattern (*Provider)', () => {
    const constraint: Constraint = { rule: 'require_export', value: ['*Provider'], severity: 'error' };
    const context = createContext([{ name: 'AuthProvider', kind: 'function' }]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should match wildcard prefix pattern (use*)', () => {
    const constraint: Constraint = { rule: 'require_export', value: ['use*'], severity: 'error' };
    const context = createContext([{ name: 'useAuth', kind: 'function' }]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should check multiple required exports', () => {
    const constraint: Constraint = { rule: 'require_export', value: ['*Provider', 'use*'], severity: 'error' };
    const context = createContext([
      { name: 'AuthProvider', kind: 'function' },
      { name: 'useAuth', kind: 'function' },
    ]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should fail if any required export is missing', () => {
    const constraint: Constraint = { rule: 'require_export', value: ['*Provider', 'use*'], severity: 'error' };
    const context = createContext([{ name: 'AuthProvider', kind: 'function' }]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });
});
