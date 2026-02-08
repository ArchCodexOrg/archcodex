/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for init template exports.
 */
import { describe, it, expect } from 'vitest';
import {
  CONFIG_TEMPLATE,
  BASE_REGISTRY_TEMPLATE,
  MIXINS_TEMPLATE,
  INTENTS_TEMPLATE,
  ACTIONS_TEMPLATE,
  FEATURES_TEMPLATE,
  INDEX_TEMPLATE,
  CONCEPTS_TEMPLATE,
  SERVICE_TEMPLATE,
  ARCHIGNORE_TEMPLATE,
  CLAUDE_MD_TEMPLATE,
} from '../../../../src/cli/commands/init-templates.js';

describe('init-templates', () => {
  const templates = {
    CONFIG_TEMPLATE,
    BASE_REGISTRY_TEMPLATE,
    MIXINS_TEMPLATE,
    INTENTS_TEMPLATE,
    ACTIONS_TEMPLATE,
    FEATURES_TEMPLATE,
    INDEX_TEMPLATE,
    CONCEPTS_TEMPLATE,
    SERVICE_TEMPLATE,
    ARCHIGNORE_TEMPLATE,
    CLAUDE_MD_TEMPLATE,
  };

  it.each(Object.entries(templates))('%s should be a non-empty string', (name, template) => {
    expect(typeof template).toBe('string');
    expect(template.length).toBeGreaterThan(0);
  });

  it('CONFIG_TEMPLATE should contain YAML structure', () => {
    expect(CONFIG_TEMPLATE).toContain('version:');
    expect(CONFIG_TEMPLATE).toContain('files:');
  });

  it('CONFIG_TEMPLATE should have hydration settings', () => {
    expect(CONFIG_TEMPLATE).toContain('hydration:');
  });

  it('CONFIG_TEMPLATE should have LLM settings', () => {
    expect(CONFIG_TEMPLATE).toContain('llm:');
  });

  it('BASE_REGISTRY_TEMPLATE should contain architecture definitions', () => {
    expect(BASE_REGISTRY_TEMPLATE).toContain('description:');
    expect(BASE_REGISTRY_TEMPLATE).toContain('rationale:');
  });

  it('BASE_REGISTRY_TEMPLATE should define base architecture', () => {
    expect(BASE_REGISTRY_TEMPLATE).toContain('base:');
  });

  it('BASE_REGISTRY_TEMPLATE should define domain layer', () => {
    expect(BASE_REGISTRY_TEMPLATE).toContain('domain:');
    expect(BASE_REGISTRY_TEMPLATE).toContain('domain.entity:');
    expect(BASE_REGISTRY_TEMPLATE).toContain('domain.service:');
  });

  it('BASE_REGISTRY_TEMPLATE should define infra layer', () => {
    expect(BASE_REGISTRY_TEMPLATE).toContain('infra:');
    expect(BASE_REGISTRY_TEMPLATE).toContain('infra.repository:');
  });

  it('BASE_REGISTRY_TEMPLATE should define app layer', () => {
    expect(BASE_REGISTRY_TEMPLATE).toContain('app:');
    expect(BASE_REGISTRY_TEMPLATE).toContain('app.controller:');
  });

  it('MIXINS_TEMPLATE should contain mixin definitions', () => {
    expect(MIXINS_TEMPLATE).toContain('srp:');
    expect(MIXINS_TEMPLATE).toContain('dip:');
    expect(MIXINS_TEMPLATE).toContain('tested:');
  });

  it('MIXINS_TEMPLATE should have quality traits', () => {
    expect(MIXINS_TEMPLATE).toContain('logging:');
    expect(MIXINS_TEMPLATE).toContain('validated:');
  });

  it('INTENTS_TEMPLATE should define intents section', () => {
    expect(INTENTS_TEMPLATE).toContain('intents:');
  });

  it('INTENTS_TEMPLATE should have cli-output intent', () => {
    expect(INTENTS_TEMPLATE).toContain('cli-output:');
  });

  it('INTENTS_TEMPLATE should have categories', () => {
    expect(INTENTS_TEMPLATE).toContain('category:');
  });

  it('ACTIONS_TEMPLATE should define actions section', () => {
    expect(ACTIONS_TEMPLATE).toContain('actions:');
  });

  it('ACTIONS_TEMPLATE should have add-endpoint action', () => {
    expect(ACTIONS_TEMPLATE).toContain('add-endpoint:');
  });

  it('ACTIONS_TEMPLATE should have checklist fields', () => {
    expect(ACTIONS_TEMPLATE).toContain('checklist:');
  });

  it('FEATURES_TEMPLATE should define features section', () => {
    expect(FEATURES_TEMPLATE).toContain('features:');
  });

  it('FEATURES_TEMPLATE should have crud-entity feature', () => {
    expect(FEATURES_TEMPLATE).toContain('crud-entity:');
  });

  it('FEATURES_TEMPLATE should have components field', () => {
    expect(FEATURES_TEMPLATE).toContain('components:');
  });

  it('INDEX_TEMPLATE should have entries field', () => {
    expect(INDEX_TEMPLATE).toContain('entries:');
  });

  it('INDEX_TEMPLATE should have keywords field', () => {
    expect(INDEX_TEMPLATE).toContain('keywords:');
  });

  it('INDEX_TEMPLATE should warn about manual editing', () => {
    expect(INDEX_TEMPLATE).toContain('WARNING');
    expect(INDEX_TEMPLATE).toContain('Do not edit');
  });

  it('CONCEPTS_TEMPLATE should define concepts section', () => {
    expect(CONCEPTS_TEMPLATE).toContain('concepts:');
  });

  it('CONCEPTS_TEMPLATE should have aliases field', () => {
    expect(CONCEPTS_TEMPLATE).toContain('aliases:');
  });

  it('CONCEPTS_TEMPLATE should have validation concept', () => {
    expect(CONCEPTS_TEMPLATE).toContain('validation:');
  });

  it('SERVICE_TEMPLATE should be a Handlebars template', () => {
    expect(SERVICE_TEMPLATE).toContain('{{ARCH_ID}}');
    expect(SERVICE_TEMPLATE).toContain('{{CLASS_NAME}}');
  });

  it('SERVICE_TEMPLATE should have @arch tag placeholder', () => {
    expect(SERVICE_TEMPLATE).toContain('@arch {{ARCH_ID}}');
  });

  it('ARCHIGNORE_TEMPLATE should contain ignore patterns', () => {
    expect(ARCHIGNORE_TEMPLATE).toContain('node_modules');
    expect(ARCHIGNORE_TEMPLATE).toContain('dist/');
    expect(ARCHIGNORE_TEMPLATE).toContain('coverage/');
  });

  it('ARCHIGNORE_TEMPLATE should ignore test files by default', () => {
    expect(ARCHIGNORE_TEMPLATE).toContain('*.test.ts');
    expect(ARCHIGNORE_TEMPLATE).toContain('*.spec.ts');
  });

  it('CLAUDE_MD_TEMPLATE should mention ArchCodex', () => {
    expect(CLAUDE_MD_TEMPLATE).toContain('ArchCodex');
    expect(CLAUDE_MD_TEMPLATE).toContain('archcodex');
  });

  it('CLAUDE_MD_TEMPLATE should have workflow section', () => {
    expect(CLAUDE_MD_TEMPLATE).toContain('Workflow');
  });

  it('CLAUDE_MD_TEMPLATE should mention session-context', () => {
    expect(CLAUDE_MD_TEMPLATE).toContain('session-context');
  });

  it('CLAUDE_MD_TEMPLATE should mention discover command', () => {
    expect(CLAUDE_MD_TEMPLATE).toContain('discover');
  });

  it('CLAUDE_MD_TEMPLATE should mention impact command', () => {
    expect(CLAUDE_MD_TEMPLATE).toContain('impact');
  });

  it('all templates should have reasonable length', () => {
    for (const [name, template] of Object.entries(templates)) {
      expect(template.length).toBeGreaterThan(50);
      expect(template.length).toBeLessThan(20000);
    }
  });

  it('CONFIG_TEMPLATE should have validation settings', () => {
    expect(CONFIG_TEMPLATE).toContain('validation:');
    expect(CONFIG_TEMPLATE).toContain('fail_on_warning:');
  });

  it('CONFIG_TEMPLATE should have override settings', () => {
    expect(CONFIG_TEMPLATE).toContain('overrides:');
    expect(CONFIG_TEMPLATE).toContain('required_fields:');
  });

  it('MIXINS_TEMPLATE should explain inline usage', () => {
    expect(MIXINS_TEMPLATE).toContain('+srp');
  });

  it('templates should have helpful comments', () => {
    expect(CONFIG_TEMPLATE).toContain('#');
    expect(BASE_REGISTRY_TEMPLATE).toContain('#');
    expect(INDEX_TEMPLATE).toContain('#');
  });
});
