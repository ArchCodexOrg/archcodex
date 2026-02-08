/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for MCP schema example data structures.
 * Validates constraint examples and recipe examples.
 */
import { describe, it, expect } from 'vitest';
import { CONSTRAINT_EXAMPLES, RECIPE_EXAMPLES } from '../../../src/mcp/schema-examples-data.js';

describe('CONSTRAINT_EXAMPLES', () => {
  it('should be a non-empty object', () => {
    expect(typeof CONSTRAINT_EXAMPLES).toBe('object');
    expect(Object.keys(CONSTRAINT_EXAMPLES).length).toBeGreaterThan(0);
  });

  it('every example should be a non-empty string', () => {
    for (const [key, value] of Object.entries(CONSTRAINT_EXAMPLES)) {
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it('every example should contain YAML rule syntax', () => {
    for (const [key, value] of Object.entries(CONSTRAINT_EXAMPLES)) {
      // Each example should contain 'rule:' since they are constraint examples
      expect(value).toContain('rule:');
    }
  });

  it('should contain examples for key constraint types', () => {
    const expectedKeys = [
      'naming_pattern',
      'forbid_import',
      'require_import',
      'require_pattern',
      'forbid_pattern',
      'must_extend',
      'allow_import',
      'require_decorator',
      'forbid_decorator',
      'location_pattern',
      'forbid_call',
      'require_try_catch',
      'forbid_mutation',
      'require_call',
      'allow_pattern',
      'require_export',
      'require_call_before',
      'require_coverage',
      'max_similarity',
      'importable_by',
      'forbid_circular_deps',
      'require_companion_call',
      'require_companion_file',
      'conditional_constraints',
      'all_conditions',
    ];
    for (const key of expectedKeys) {
      expect(CONSTRAINT_EXAMPLES).toHaveProperty(key);
    }
  });

  describe('content quality', () => {
    it('naming_pattern example should contain both regex and structured naming', () => {
      const example = CONSTRAINT_EXAMPLES.naming_pattern;
      expect(example).toContain('naming_pattern');
      expect(example).toContain('naming:');
      expect(example).toContain('case:');
    });

    it('forbid_import example should show alternatives and unless', () => {
      const example = CONSTRAINT_EXAMPLES.forbid_import;
      expect(example).toContain('alternative');
      expect(example).toContain('unless');
    });

    it('require_import example should show match: any option', () => {
      const example = CONSTRAINT_EXAMPLES.require_import;
      expect(example).toContain('match: any');
    });

    it('require_pattern example should show pattern field', () => {
      const example = CONSTRAINT_EXAMPLES.require_pattern;
      expect(example).toContain('pattern:');
    });

    it('forbid_pattern example should show codeExample', () => {
      const example = CONSTRAINT_EXAMPLES.forbid_pattern;
      expect(example).toContain('codeExample');
    });

    it('conditional_constraints example should show when clause', () => {
      const example = CONSTRAINT_EXAMPLES.conditional_constraints;
      expect(example).toContain('when:');
      expect(example).toContain('applies_when:');
      expect(example).toContain('unless:');
    });

    it('all_conditions example should cover all condition types', () => {
      const example = CONSTRAINT_EXAMPLES.all_conditions;
      expect(example).toContain('has_decorator');
      expect(example).toContain('has_import');
      expect(example).toContain('extends');
      expect(example).toContain('file_matches');
      expect(example).toContain('implements');
      expect(example).toContain('method_has_decorator');
      expect(example).toContain('not_has_decorator');
      expect(example).toContain('not_has_import');
      expect(example).toContain('not_extends');
      expect(example).toContain('not_file_matches');
      expect(example).toContain('not_implements');
      expect(example).toContain('not_method_has_decorator');
    });

    it('require_companion_call example should show location option', () => {
      const example = CONSTRAINT_EXAMPLES.require_companion_call;
      expect(example).toContain('location:');
      expect(example).toContain('same_file');
    });

    it('require_companion_file example should show variable substitution', () => {
      const example = CONSTRAINT_EXAMPLES.require_companion_file;
      expect(example).toContain('${name}');
      expect(example).toContain('must_export');
    });

    it('require_coverage example should show all coverage fields', () => {
      const example = CONSTRAINT_EXAMPLES.require_coverage;
      expect(example).toContain('source_type:');
      expect(example).toContain('source_pattern:');
      expect(example).toContain('in_files:');
      expect(example).toContain('target_pattern:');
      expect(example).toContain('in_target_files:');
    });

    it('most examples should include severity field', () => {
      // The all_conditions example omits severity to focus on condition syntax
      const exemptions = new Set(['all_conditions']);
      for (const [key, value] of Object.entries(CONSTRAINT_EXAMPLES)) {
        if (exemptions.has(key)) continue;
        expect(value).toContain('severity:');
      }
    });

    it('every example should include why field', () => {
      for (const [key, value] of Object.entries(CONSTRAINT_EXAMPLES)) {
        expect(value).toContain('why:');
      }
    });
  });
});

describe('RECIPE_EXAMPLES', () => {
  it('should be a non-empty object', () => {
    expect(typeof RECIPE_EXAMPLES).toBe('object');
    expect(Object.keys(RECIPE_EXAMPLES).length).toBeGreaterThan(0);
  });

  it('every recipe should be a non-empty string', () => {
    for (const [key, value] of Object.entries(RECIPE_EXAMPLES)) {
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it('should contain expected recipe names', () => {
    const expectedRecipes = [
      'domain-service',
      'repository',
      'controller',
      'mixin-creation',
      'cli-command',
      'conditional-constraints',
    ];
    for (const name of expectedRecipes) {
      expect(RECIPE_EXAMPLES).toHaveProperty(name);
    }
  });

  describe('recipe content quality', () => {
    it('domain-service recipe should contain service pattern elements', () => {
      const recipe = RECIPE_EXAMPLES['domain-service'];
      expect(recipe).toContain('inherits:');
      expect(recipe).toContain('constraints:');
      expect(recipe).toContain('hints:');
      expect(recipe).toContain('code_pattern:');
      expect(recipe).toContain('file_pattern:');
      expect(recipe).toContain('default_path:');
    });

    it('repository recipe should contain repository pattern elements', () => {
      const recipe = RECIPE_EXAMPLES['repository'];
      expect(recipe).toContain('inherits:');
      expect(recipe).toContain('Repository');
      expect(recipe).toContain('code_pattern:');
    });

    it('controller recipe should contain controller pattern elements', () => {
      const recipe = RECIPE_EXAMPLES['controller'];
      expect(recipe).toContain('Controller');
      expect(recipe).toContain('max_file_lines');
      expect(recipe).toContain('code_pattern:');
    });

    it('mixin-creation recipe should show inline modes', () => {
      const recipe = RECIPE_EXAMPLES['mixin-creation'];
      expect(recipe).toContain('inline: only');
      expect(recipe).toContain('inline: forbidden');
    });

    it('cli-command recipe should show command patterns', () => {
      const recipe = RECIPE_EXAMPLES['cli-command'];
      expect(recipe).toContain('commander');
      expect(recipe).toContain('Command');
      expect(recipe).toContain('code_pattern:');
    });

    it('conditional-constraints recipe should show all condition mechanisms', () => {
      const recipe = RECIPE_EXAMPLES['conditional-constraints'];
      expect(recipe).toContain('when:');
      expect(recipe).toContain('applies_when:');
      expect(recipe).toContain('unless:');
    });

    it('every recipe should include a rationale', () => {
      for (const [key, value] of Object.entries(RECIPE_EXAMPLES)) {
        expect(value).toContain('rationale:');
      }
    });

    it('every recipe should include constraints', () => {
      for (const [key, value] of Object.entries(RECIPE_EXAMPLES)) {
        expect(value).toContain('constraints:');
      }
    });
  });
});
