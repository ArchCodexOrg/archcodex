/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for spec init template exports.
 */
import { describe, it, expect } from 'vitest';
import {
  SPEC_BASE_TEMPLATE,
  SPEC_MIXINS_TEMPLATE,
  SPEC_EXAMPLE_TEMPLATE,
  SPEC_CONFIG_SECTION,
} from '../../../../src/cli/commands/spec-init-templates.js';

describe('spec-init-templates', () => {
  const templates = {
    SPEC_BASE_TEMPLATE,
    SPEC_MIXINS_TEMPLATE,
    SPEC_EXAMPLE_TEMPLATE,
    SPEC_CONFIG_SECTION,
  };

  it.each(Object.entries(templates))('%s should be a non-empty string', (name, template) => {
    expect(typeof template).toBe('string');
    expect(template.length).toBeGreaterThan(0);
  });

  it('SPEC_BASE_TEMPLATE should contain base spec definitions', () => {
    expect(SPEC_BASE_TEMPLATE).toContain('spec.');
    expect(SPEC_BASE_TEMPLATE).toContain('spec.function');
  });

  it('SPEC_BASE_TEMPLATE should define spec.mutation', () => {
    expect(SPEC_BASE_TEMPLATE).toContain('spec.mutation:');
  });

  it('SPEC_BASE_TEMPLATE should define spec.query', () => {
    expect(SPEC_BASE_TEMPLATE).toContain('spec.query:');
  });

  it('SPEC_BASE_TEMPLATE should define spec.action', () => {
    expect(SPEC_BASE_TEMPLATE).toContain('spec.action:');
  });

  it('SPEC_BASE_TEMPLATE should have version field', () => {
    expect(SPEC_BASE_TEMPLATE).toContain('version:');
  });

  it('SPEC_BASE_TEMPLATE should use inheritance', () => {
    expect(SPEC_BASE_TEMPLATE).toContain('inherits:');
  });

  it('SPEC_BASE_TEMPLATE should have security sections', () => {
    expect(SPEC_BASE_TEMPLATE).toContain('security:');
    expect(SPEC_BASE_TEMPLATE).toContain('authentication:');
  });

  it('SPEC_MIXINS_TEMPLATE should contain mixin definitions', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('mixins:');
  });

  it('SPEC_MIXINS_TEMPLATE should have requires_auth mixin', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('requires_auth:');
  });

  it('SPEC_MIXINS_TEMPLATE should have requires_permission mixin', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('requires_permission:');
  });

  it('SPEC_MIXINS_TEMPLATE should have rate limiting mixins', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('rate_limited:');
    expect(SPEC_MIXINS_TEMPLATE).toContain('rate_limited_strict:');
  });

  it('SPEC_MIXINS_TEMPLATE should have audit logging mixin', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('logs_audit:');
  });

  it('SPEC_MIXINS_TEMPLATE should have validation mixins', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('validates_ownership:');
  });

  it('SPEC_MIXINS_TEMPLATE should have soft delete mixin', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('soft_deletable:');
  });

  it('SPEC_MIXINS_TEMPLATE should have timestamps mixin', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('has_timestamps:');
  });

  it('SPEC_MIXINS_TEMPLATE should have invariants', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('invariants:');
  });

  it('SPEC_MIXINS_TEMPLATE should have effects', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('effects:');
  });

  it('SPEC_EXAMPLE_TEMPLATE should contain example spec', () => {
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('spec.example.greeting:');
  });

  it('SPEC_EXAMPLE_TEMPLATE should have implementation field', () => {
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('implementation:');
  });

  it('SPEC_EXAMPLE_TEMPLATE should have goal and intent', () => {
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('goal:');
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('intent:');
  });

  it('SPEC_EXAMPLE_TEMPLATE should have inputs section', () => {
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('inputs:');
  });

  it('SPEC_EXAMPLE_TEMPLATE should have outputs section', () => {
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('outputs:');
  });

  it('SPEC_EXAMPLE_TEMPLATE should have examples section', () => {
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('examples:');
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('success:');
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('errors:');
  });

  it('SPEC_EXAMPLE_TEMPLATE should demonstrate invariants', () => {
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('invariants:');
  });

  it('SPEC_EXAMPLE_TEMPLATE should have given/then structure', () => {
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('given:');
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('then:');
  });

  it('SPEC_CONFIG_SECTION should have speccodex key', () => {
    expect(SPEC_CONFIG_SECTION).toContain('speccodex:');
  });

  it('SPEC_CONFIG_SECTION should have test_output settings', () => {
    expect(SPEC_CONFIG_SECTION).toContain('test_output:');
  });

  it('SPEC_CONFIG_SECTION should specify test framework', () => {
    expect(SPEC_CONFIG_SECTION).toContain('framework:');
    expect(SPEC_CONFIG_SECTION).toContain('vitest');
  });

  it('SPEC_CONFIG_SECTION should have coverage setting', () => {
    expect(SPEC_CONFIG_SECTION).toContain('coverage:');
  });

  it('SPEC_CONFIG_SECTION should specify output locations', () => {
    expect(SPEC_CONFIG_SECTION).toContain('unit:');
    expect(SPEC_CONFIG_SECTION).toContain('property:');
    expect(SPEC_CONFIG_SECTION).toContain('integration:');
  });

  it('SPEC_EXAMPLE_TEMPLATE should have boundaries examples', () => {
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('boundaries:');
  });

  it('SPEC_BASE_TEMPLATE should document metadata', () => {
    expect(SPEC_BASE_TEMPLATE).toContain('metadata:');
  });

  it('templates should have helpful comments', () => {
    expect(SPEC_BASE_TEMPLATE).toContain('#');
    expect(SPEC_MIXINS_TEMPLATE).toContain('#');
    expect(SPEC_EXAMPLE_TEMPLATE).toContain('#');
  });

  it('SPEC_MIXINS_TEMPLATE should have rate limit structure', () => {
    expect(SPEC_MIXINS_TEMPLATE).toContain('rate_limit:');
    expect(SPEC_MIXINS_TEMPLATE).toContain('requests:');
    expect(SPEC_MIXINS_TEMPLATE).toContain('window:');
  });

  it('all templates should have reasonable length', () => {
    for (const [name, template] of Object.entries(templates)) {
      expect(template.length).toBeGreaterThan(50);
      expect(template.length).toBeLessThan(10000);
    }
  });
});
