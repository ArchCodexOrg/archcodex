/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for action schema Zod validation.
 */
import { describe, it, expect } from 'vitest';
import {
  ActionTriggersSchema,
  StructuredChecklistUISchema,
  StructuredChecklistSchema,
  ChecklistSchema,
  ActionDefinitionSchema,
  ActionRegistrySchema,
} from '../../../../src/core/registry/action-schema.js';

describe('ActionTriggersSchema', () => {
  it('should parse empty object', () => {
    const result = ActionTriggersSchema.parse({});
    expect(result.entities).toBeUndefined();
    expect(result.mutation_patterns).toBeUndefined();
  });

  it('should parse with entities', () => {
    const result = ActionTriggersSchema.parse({
      entities: ['orders', 'users'],
    });
    expect(result.entities).toEqual(['orders', 'users']);
  });

  it('should parse with mutation patterns', () => {
    const result = ActionTriggersSchema.parse({
      mutation_patterns: ['*Item', '*Order*'],
    });
    expect(result.mutation_patterns).toEqual(['*Item', '*Order*']);
  });

  it('should parse with both fields', () => {
    const result = ActionTriggersSchema.parse({
      entities: ['products'],
      mutation_patterns: ['create*'],
    });
    expect(result.entities).toEqual(['products']);
    expect(result.mutation_patterns).toEqual(['create*']);
  });
});

describe('StructuredChecklistUISchema', () => {
  it('should parse empty object', () => {
    const result = StructuredChecklistUISchema.parse({});
    expect(result.from_component_group).toBeUndefined();
    expect(result.items).toBeUndefined();
    expect(result.additional).toBeUndefined();
  });

  it('should parse with component group reference', () => {
    const result = StructuredChecklistUISchema.parse({
      from_component_group: 'order-cards',
    });
    expect(result.from_component_group).toBe('order-cards');
  });

  it('should parse with auto component group', () => {
    const result = StructuredChecklistUISchema.parse({
      from_component_group: 'auto',
    });
    expect(result.from_component_group).toBe('auto');
  });

  it('should parse with static items', () => {
    const result = StructuredChecklistUISchema.parse({
      items: ['Update button label', 'Add loading state'],
    });
    expect(result.items).toEqual(['Update button label', 'Add loading state']);
  });

  it('should parse with additional items after expansion', () => {
    const result = StructuredChecklistUISchema.parse({
      from_component_group: 'order-cards',
      additional: ['Add animation', 'Update snapshots'],
    });
    expect(result.from_component_group).toBe('order-cards');
    expect(result.additional).toEqual(['Add animation', 'Update snapshots']);
  });
});

describe('StructuredChecklistSchema', () => {
  it('should parse empty object', () => {
    const result = StructuredChecklistSchema.parse({});
    expect(result.backend).toBeUndefined();
    expect(result.frontend).toBeUndefined();
    expect(result.ui).toBeUndefined();
  });

  it('should parse with backend items', () => {
    const result = StructuredChecklistSchema.parse({
      backend: ['Create mutation', 'Export from barrel'],
    });
    expect(result.backend).toEqual(['Create mutation', 'Export from barrel']);
  });

  it('should parse with frontend items', () => {
    const result = StructuredChecklistSchema.parse({
      frontend: ['Create hook wrapper', 'Add handler function'],
    });
    expect(result.frontend).toEqual(['Create hook wrapper', 'Add handler function']);
  });

  it('should accept ui as array of strings', () => {
    const result = StructuredChecklistSchema.parse({
      ui: ['Update card component', 'Add tooltip'],
    });
    expect(result.ui).toEqual(['Update card component', 'Add tooltip']);
  });

  it('should accept ui as structured object', () => {
    const result = StructuredChecklistSchema.parse({
      ui: {
        from_component_group: 'order-cards',
        additional: ['Add animation'],
      },
    });
    expect(result.ui).toEqual({
      from_component_group: 'order-cards',
      additional: ['Add animation'],
    });
  });

  it('should parse full structured checklist', () => {
    const result = StructuredChecklistSchema.parse({
      backend: ['Step 1'],
      frontend: ['Step 2'],
      ui: { items: ['Step 3'] },
    });
    expect(result.backend).toHaveLength(1);
    expect(result.frontend).toHaveLength(1);
  });
});

describe('ChecklistSchema', () => {
  it('should accept flat array (legacy format)', () => {
    const result = ChecklistSchema.parse(['Step 1', 'Step 2', 'Step 3']);
    expect(result).toEqual(['Step 1', 'Step 2', 'Step 3']);
  });

  it('should accept structured object', () => {
    const result = ChecklistSchema.parse({
      backend: ['Create mutation'],
      frontend: ['Create hook'],
    });
    expect(result).toEqual({
      backend: ['Create mutation'],
      frontend: ['Create hook'],
    });
  });

  it('should accept empty array', () => {
    const result = ChecklistSchema.parse([]);
    expect(result).toEqual([]);
  });

  it('should reject non-string array items', () => {
    expect(() => ChecklistSchema.parse([1, 2, 3])).toThrow();
  });
});

describe('ActionDefinitionSchema', () => {
  it('should parse minimal action', () => {
    const result = ActionDefinitionSchema.parse({
      description: 'Add a new feature',
      checklist: ['Create files', 'Write tests'],
    });
    expect(result.description).toBe('Add a new feature');
    expect(result.checklist).toEqual(['Create files', 'Write tests']);
    expect(result.aliases).toBeUndefined();
    expect(result.architecture).toBeUndefined();
    expect(result.feature).toBeUndefined();
  });

  it('should parse action with all fields', () => {
    const result = ActionDefinitionSchema.parse({
      description: 'Create a new API endpoint',
      aliases: ['new endpoint', 'add route'],
      architecture: 'api.endpoint',
      feature: 'api-endpoint',
      intents: ['auth-required', 'rate-limited'],
      triggers: { entities: ['users'] },
      checklist: {
        backend: ['Create handler'],
        frontend: ['Add API client method'],
        ui: ['Wire to component'],
      },
      suggested_path: 'src/api/endpoints/',
      file_pattern: '${name}.handler.ts',
      test_pattern: '${name}.handler.test.ts',
      variables: [
        { name: 'endpoint', prompt: 'Endpoint name', default: '/api/v1' },
      ],
    });

    expect(result.aliases).toEqual(['new endpoint', 'add route']);
    expect(result.architecture).toBe('api.endpoint');
    expect(result.feature).toBe('api-endpoint');
    expect(result.intents).toEqual(['auth-required', 'rate-limited']);
    expect(result.triggers?.entities).toEqual(['users']);
    expect(result.suggested_path).toBe('src/api/endpoints/');
    expect(result.file_pattern).toBe('${name}.handler.ts');
    expect(result.test_pattern).toBe('${name}.handler.test.ts');
    expect(result.variables).toHaveLength(1);
    expect(result.variables![0].default).toBe('/api/v1');
  });

  it('should reject missing description', () => {
    expect(() => ActionDefinitionSchema.parse({
      checklist: ['Step 1'],
    })).toThrow();
  });

  it('should reject missing checklist', () => {
    expect(() => ActionDefinitionSchema.parse({
      description: 'Test action',
    })).toThrow();
  });

  it('should accept variables without default', () => {
    const result = ActionDefinitionSchema.parse({
      description: 'Test',
      checklist: ['Step'],
      variables: [{ name: 'entity', prompt: 'Entity name?' }],
    });
    expect(result.variables![0].default).toBeUndefined();
  });

  it('should reject variables missing required fields', () => {
    expect(() => ActionDefinitionSchema.parse({
      description: 'Test',
      checklist: ['Step'],
      variables: [{ name: 'entity' }],
    })).toThrow();
  });
});

describe('ActionRegistrySchema', () => {
  it('should parse registry with actions', () => {
    const result = ActionRegistrySchema.parse({
      actions: {
        'add-endpoint': {
          description: 'Add API endpoint',
          checklist: ['Create handler'],
        },
        'add-component': {
          description: 'Add React component',
          checklist: ['Create component file'],
        },
      },
    });

    expect(Object.keys(result.actions)).toHaveLength(2);
    expect(result.actions['add-endpoint'].description).toBe('Add API endpoint');
  });

  it('should reject missing actions field', () => {
    expect(() => ActionRegistrySchema.parse({})).toThrow();
  });

  it('should reject invalid action in registry', () => {
    expect(() => ActionRegistrySchema.parse({
      actions: {
        bad: { description: 'Missing checklist' },
      },
    })).toThrow();
  });

  it('should accept empty actions map', () => {
    const result = ActionRegistrySchema.parse({ actions: {} });
    expect(Object.keys(result.actions)).toHaveLength(0);
  });
});
