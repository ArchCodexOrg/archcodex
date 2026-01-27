/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  RegistrySchema,
  ConstraintSchema,
  ArchitectureNodeSchema,
  SeveritySchema,
  ConstraintRuleSchema,
} from '../../../../src/core/registry/schema.js';

describe('SeveritySchema', () => {
  it('should accept "error"', () => {
    expect(SeveritySchema.parse('error')).toBe('error');
  });

  it('should accept "warning"', () => {
    expect(SeveritySchema.parse('warning')).toBe('warning');
  });

  it('should reject invalid severity', () => {
    expect(() => SeveritySchema.parse('info')).toThrow();
  });
});

describe('ConstraintRuleSchema', () => {
  it('should accept valid constraint rules', () => {
    const validRules = [
      'must_extend',
      'implements',
      'forbid_import',
      'require_import',
      'max_file_lines',
      'max_public_methods',
      'naming_pattern',
    ];

    for (const rule of validRules) {
      expect(ConstraintRuleSchema.parse(rule)).toBe(rule);
    }
  });

  it('should reject invalid rule', () => {
    expect(() => ConstraintRuleSchema.parse('invalid_rule')).toThrow();
  });
});

describe('ConstraintSchema', () => {
  it('should parse minimal constraint', () => {
    const constraint = {
      rule: 'max_file_lines',
      value: 200,
    };

    const result = ConstraintSchema.parse(constraint);
    expect(result.rule).toBe('max_file_lines');
    expect(result.value).toBe(200);
    expect(result.severity).toBe('error'); // default
  });

  it('should parse constraint with all fields', () => {
    const constraint = {
      rule: 'forbid_import',
      value: ['fs', 'http'],
      severity: 'warning',
      category: 'security',
      why: 'Security concern',
    };

    const result = ConstraintSchema.parse(constraint);
    expect(result.rule).toBe('forbid_import');
    expect(result.value).toEqual(['fs', 'http']);
    expect(result.severity).toBe('warning');
    expect(result.why).toBe('Security concern');
  });

  it('should accept string value', () => {
    const constraint = {
      rule: 'must_extend',
      value: 'BaseClass',
    };

    const result = ConstraintSchema.parse(constraint);
    expect(result.value).toBe('BaseClass');
  });

  it('should accept array value', () => {
    const constraint = {
      rule: 'forbid_import',
      value: ['module1', 'module2'],
    };

    const result = ConstraintSchema.parse(constraint);
    expect(result.value).toEqual(['module1', 'module2']);
  });

  it('should accept number value', () => {
    const constraint = {
      rule: 'max_file_lines',
      value: 100,
    };

    const result = ConstraintSchema.parse(constraint);
    expect(result.value).toBe(100);
  });
});

describe('ArchitectureNodeSchema', () => {
  it('should require rationale field', () => {
    expect(() => ArchitectureNodeSchema.parse({})).toThrow();
  });

  it('should parse minimal node with rationale', () => {
    const result = ArchitectureNodeSchema.parse({ rationale: 'Test rationale' });
    expect(result.rationale).toBe('Test rationale');
  });

  it('should parse node with all fields', () => {
    const node = {
      description: 'Test architecture',
      rationale: 'Why this exists',
      inherits: 'base',
      mixins: ['mixin1', 'mixin2'],
      contract: 'Follow these rules',
      constraints: [
        { rule: 'max_file_lines', value: 200 },
      ],
      hints: ['Hint 1', 'Hint 2'],
    };

    const result = ArchitectureNodeSchema.parse(node);
    expect(result.description).toBe('Test architecture');
    expect(result.rationale).toBe('Why this exists');
    expect(result.inherits).toBe('base');
    expect(result.mixins).toEqual(['mixin1', 'mixin2']);
    expect(result.constraints).toHaveLength(1);
    expect(result.hints).toHaveLength(2);
  });
});

describe('RegistrySchema', () => {
  it('should parse registry with nodes only', () => {
    const registry = {
      base: {
        description: 'Base architecture',
        rationale: 'Foundation for all code',
      },
      child: {
        inherits: 'base',
        description: 'Child architecture',
        rationale: 'More specific architecture',
      },
    };

    const result = RegistrySchema.parse(registry);
    expect(result.nodes).toHaveProperty('base');
    expect(result.nodes).toHaveProperty('child');
    expect(result.mixins).toEqual({});
  });

  it('should parse registry with mixins', () => {
    const registry = {
      base: {
        description: 'Base',
        rationale: 'Foundation',
        mixins: ['testable'],
      },
      mixins: {
        testable: {
          rationale: 'Requires test coverage',
          hints: ['Write tests'],
        },
      },
    };

    const result = RegistrySchema.parse(registry);
    expect(result.nodes).toHaveProperty('base');
    expect(result.mixins).toHaveProperty('testable');
    expect(result.mixins.testable.hints).toContain('Write tests');
  });

  it('should separate mixins from nodes correctly', () => {
    const registry = {
      'domain.service': {
        description: 'Domain service',
        rationale: 'Business logic services',
      },
      mixins: {
        srp: {
          description: 'Single Responsibility',
          rationale: 'One reason to change',
        },
        tested: {
          description: 'Requires tests',
          rationale: 'Must have test coverage',
        },
      },
    };

    const result = RegistrySchema.parse(registry);
    expect(Object.keys(result.nodes)).toEqual(['domain.service']);
    expect(Object.keys(result.mixins)).toEqual(['srp', 'tested']);
  });
});
