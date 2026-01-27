/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { ForbidCircularDepsValidator } from '../../../../src/core/constraints/forbid-circular-deps.js';
import type { ProjectConstraintContext } from '../../../../src/core/constraints/types.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { CyclePath } from '../../../../src/core/imports/types.js';

describe('ForbidCircularDepsValidator', () => {
  const validator = new ForbidCircularDepsValidator();

  const createContext = (
    archId: string,
    cycles: CyclePath[]
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
    cycles,
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('forbid_circular_deps');
  });

  it('should have error code E013', () => {
    expect(validator.errorCode).toBe('E013');
  });

  it('should pass when no cycles exist', () => {
    const constraint: Constraint = {
      rule: 'forbid_circular_deps',
      value: true,
      severity: 'error',
      source: 'test',
    };

    const context = createContext('domain.service', []);
    const result = validator.validate(constraint, context);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should fail when cycles exist', () => {
    const constraint: Constraint = {
      rule: 'forbid_circular_deps',
      value: true,
      severity: 'error',
      source: 'test',
    };

    const context = createContext('domain.service', [
      {
        files: ['/a.ts', '/b.ts', '/a.ts'],
        archIds: ['domain.a', 'domain.b', 'domain.a'],
      },
    ]);
    const result = validator.validate(constraint, context);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].code).toBe('E013');
    expect(result.violations[0].message).toContain('Circular dependency');
  });

  it('should report multiple cycles as separate violations', () => {
    const constraint: Constraint = {
      rule: 'forbid_circular_deps',
      value: true,
      severity: 'error',
      source: 'test',
    };

    const context = createContext('domain.service', [
      {
        files: ['/a.ts', '/b.ts', '/a.ts'],
        archIds: ['domain.a', 'domain.b', 'domain.a'],
      },
      {
        files: ['/c.ts', '/d.ts', '/e.ts', '/c.ts'],
        archIds: ['domain.c', 'domain.d', 'domain.e', 'domain.c'],
      },
    ]);
    const result = validator.validate(constraint, context);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  it('should include arch IDs in the cycle path message', () => {
    const constraint: Constraint = {
      rule: 'forbid_circular_deps',
      value: true,
      severity: 'error',
      source: 'test',
    };

    const context = createContext('domain.service', [
      {
        files: ['/src/a.ts', '/src/b.ts', '/src/a.ts'],
        archIds: ['domain.a', 'domain.b', 'domain.a'],
      },
    ]);
    const result = validator.validate(constraint, context);

    expect(result.violations[0].message).toContain('domain.a');
    expect(result.violations[0].message).toContain('domain.b');
  });
});
