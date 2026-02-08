/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for MCP schema data structures.
 * Validates constraint rules, architecture fields, constraint fields, and conditions.
 */
import { describe, it, expect } from 'vitest';
import {
  CONSTRAINT_RULES_VALIDATED,
  CONSTRAINT_RULES_META,
  CONSTRAINT_RULES,
  ARCH_FIELDS,
  CONSTRAINT_FIELDS,
  CONDITIONS,
} from '../../../src/mcp/schema-data.js';

describe('CONSTRAINT_RULES_VALIDATED', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(CONSTRAINT_RULES_VALIDATED)).toBe(true);
    expect(CONSTRAINT_RULES_VALIDATED.length).toBeGreaterThan(0);
  });

  it('every rule should have rule, param, desc, and example fields', () => {
    for (const entry of CONSTRAINT_RULES_VALIDATED) {
      expect(entry).toHaveProperty('rule');
      expect(entry).toHaveProperty('param');
      expect(entry).toHaveProperty('desc');
      expect(entry).toHaveProperty('example');
      expect(typeof entry.rule).toBe('string');
      expect(typeof entry.param).toBe('string');
      expect(typeof entry.desc).toBe('string');
    }
  });

  it('should not have duplicate rule names', () => {
    const ruleNames = CONSTRAINT_RULES_VALIDATED.map(r => r.rule);
    const unique = new Set(ruleNames);
    expect(unique.size).toBe(ruleNames.length);
  });

  it('should contain key validated rules', () => {
    const ruleNames = CONSTRAINT_RULES_VALIDATED.map(r => r.rule);
    const expectedRules = [
      'must_extend',
      'implements',
      'forbid_import',
      'require_import',
      'naming_pattern',
      'max_file_lines',
      'max_public_methods',
      'forbid_call',
      'require_try_catch',
      'forbid_mutation',
      'require_pattern',
      'forbid_pattern',
      'require_export',
      'require_companion_call',
      'require_companion_file',
    ];
    for (const expected of expectedRules) {
      expect(ruleNames).toContain(expected);
    }
  });
});

describe('CONSTRAINT_RULES_META', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(CONSTRAINT_RULES_META)).toBe(true);
    expect(CONSTRAINT_RULES_META.length).toBeGreaterThan(0);
  });

  it('every rule should have rule, param, desc, and example fields', () => {
    for (const entry of CONSTRAINT_RULES_META) {
      expect(entry).toHaveProperty('rule');
      expect(entry).toHaveProperty('param');
      expect(entry).toHaveProperty('desc');
      expect(entry).toHaveProperty('example');
    }
  });

  it('should not have duplicate rule names', () => {
    const ruleNames = CONSTRAINT_RULES_META.map(r => r.rule);
    const unique = new Set(ruleNames);
    expect(unique.size).toBe(ruleNames.length);
  });

  it('should contain key meta rules', () => {
    const ruleNames = CONSTRAINT_RULES_META.map(r => r.rule);
    expect(ruleNames).toContain('allow_import');
    expect(ruleNames).toContain('require_coverage');
    expect(ruleNames).toContain('max_similarity');
  });
});

describe('CONSTRAINT_RULES', () => {
  it('should be the combination of validated and meta rules', () => {
    expect(CONSTRAINT_RULES.length).toBe(
      CONSTRAINT_RULES_VALIDATED.length + CONSTRAINT_RULES_META.length
    );
  });

  it('should contain all validated rules first', () => {
    for (let i = 0; i < CONSTRAINT_RULES_VALIDATED.length; i++) {
      expect(CONSTRAINT_RULES[i]).toBe(CONSTRAINT_RULES_VALIDATED[i]);
    }
  });

  it('should contain all meta rules after validated rules', () => {
    const offset = CONSTRAINT_RULES_VALIDATED.length;
    for (let i = 0; i < CONSTRAINT_RULES_META.length; i++) {
      expect(CONSTRAINT_RULES[offset + i]).toBe(CONSTRAINT_RULES_META[i]);
    }
  });

  it('should not have any duplicate rule names across validated and meta', () => {
    const allNames = CONSTRAINT_RULES.map(r => r.rule);
    const unique = new Set(allNames);
    expect(unique.size).toBe(allNames.length);
  });
});

describe('ARCH_FIELDS', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(ARCH_FIELDS)).toBe(true);
    expect(ARCH_FIELDS.length).toBeGreaterThan(0);
  });

  it('every field should have field, required, and desc properties', () => {
    for (const entry of ARCH_FIELDS) {
      expect(entry).toHaveProperty('field');
      expect(entry).toHaveProperty('required');
      expect(entry).toHaveProperty('desc');
      expect(typeof entry.field).toBe('string');
      expect(typeof entry.required).toBe('boolean');
      expect(typeof entry.desc).toBe('string');
    }
  });

  it('should not have duplicate field names', () => {
    const fieldNames = ARCH_FIELDS.map(f => f.field);
    const unique = new Set(fieldNames);
    expect(unique.size).toBe(fieldNames.length);
  });

  it('rationale should be a required field', () => {
    const rationale = ARCH_FIELDS.find(f => f.field === 'rationale');
    expect(rationale).toBeDefined();
    expect(rationale!.required).toBe(true);
  });

  it('should contain expected architecture fields', () => {
    const fieldNames = ARCH_FIELDS.map(f => f.field);
    const expectedFields = [
      'description',
      'rationale',
      'kind',
      'inherits',
      'mixins',
      'constraints',
      'hints',
      'pointers',
      'version',
      'file_pattern',
      'default_path',
      'code_pattern',
      'singleton',
      'inline',
    ];
    for (const expected of expectedFields) {
      expect(fieldNames).toContain(expected);
    }
  });

  it('most fields should be optional (not required)', () => {
    const requiredCount = ARCH_FIELDS.filter(f => f.required).length;
    const optionalCount = ARCH_FIELDS.filter(f => !f.required).length;
    expect(optionalCount).toBeGreaterThan(requiredCount);
  });
});

describe('CONSTRAINT_FIELDS', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(CONSTRAINT_FIELDS)).toBe(true);
    expect(CONSTRAINT_FIELDS.length).toBeGreaterThan(0);
  });

  it('every field should have field, required, and desc properties', () => {
    for (const entry of CONSTRAINT_FIELDS) {
      expect(entry).toHaveProperty('field');
      expect(entry).toHaveProperty('required');
      expect(entry).toHaveProperty('desc');
      expect(typeof entry.field).toBe('string');
      expect(typeof entry.required).toBe('boolean');
      expect(typeof entry.desc).toBe('string');
    }
  });

  it('should not have duplicate field names', () => {
    const fieldNames = CONSTRAINT_FIELDS.map(f => f.field);
    const unique = new Set(fieldNames);
    expect(unique.size).toBe(fieldNames.length);
  });

  it('rule and value should be required fields', () => {
    const rule = CONSTRAINT_FIELDS.find(f => f.field === 'rule');
    const value = CONSTRAINT_FIELDS.find(f => f.field === 'value');
    expect(rule).toBeDefined();
    expect(rule!.required).toBe(true);
    expect(value).toBeDefined();
    expect(value!.required).toBe(true);
  });

  it('should contain expected constraint fields', () => {
    const fieldNames = CONSTRAINT_FIELDS.map(f => f.field);
    const expectedFields = [
      'rule',
      'value',
      'severity',
      'category',
      'why',
      'when',
      'applies_when',
      'unless',
      'override',
      'alternative',
      'alternatives',
    ];
    for (const expected of expectedFields) {
      expect(fieldNames).toContain(expected);
    }
  });
});

describe('CONDITIONS', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(CONDITIONS)).toBe(true);
    expect(CONDITIONS.length).toBeGreaterThan(0);
  });

  it('every condition should have condition, desc, and example fields', () => {
    for (const entry of CONDITIONS) {
      expect(entry).toHaveProperty('condition');
      expect(entry).toHaveProperty('desc');
      expect(entry).toHaveProperty('example');
      expect(typeof entry.condition).toBe('string');
      expect(typeof entry.desc).toBe('string');
    }
  });

  it('should not have duplicate condition names', () => {
    const conditionNames = CONDITIONS.map(c => c.condition);
    const unique = new Set(conditionNames);
    expect(unique.size).toBe(conditionNames.length);
  });

  it('should contain both positive and negative conditions', () => {
    const conditionNames = CONDITIONS.map(c => c.condition);
    const positiveConditions = conditionNames.filter(n => !n.startsWith('not_'));
    const negativeConditions = conditionNames.filter(n => n.startsWith('not_'));
    expect(positiveConditions.length).toBeGreaterThan(0);
    expect(negativeConditions.length).toBeGreaterThan(0);
  });

  it('every positive condition should have a negative counterpart', () => {
    const conditionNames = new Set(CONDITIONS.map(c => c.condition));
    const positiveConditions = CONDITIONS.filter(c => !c.condition.startsWith('not_'));
    for (const positive of positiveConditions) {
      const negativeName = `not_${positive.condition}`;
      expect(conditionNames.has(negativeName)).toBe(true);
    }
  });

  it('should contain expected conditions', () => {
    const conditionNames = CONDITIONS.map(c => c.condition);
    const expectedConditions = [
      'has_decorator',
      'has_import',
      'extends',
      'file_matches',
      'implements',
      'method_has_decorator',
    ];
    for (const expected of expectedConditions) {
      expect(conditionNames).toContain(expected);
    }
  });
});
