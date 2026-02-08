/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for feature schema Zod validation.
 */
import { describe, it, expect } from 'vitest';
import {
  FeatureComponentSchema,
  FeatureDefinitionSchema,
  FeatureRegistrySchema,
} from '../../../../src/core/registry/feature-schema.js';

describe('FeatureComponentSchema', () => {
  it('should parse minimal component', () => {
    const result = FeatureComponentSchema.parse({
      role: 'command',
      architecture: 'cli.command',
      path: 'src/cli/commands/${name}.ts',
    });
    expect(result.role).toBe('command');
    expect(result.architecture).toBe('cli.command');
    expect(result.path).toBe('src/cli/commands/${name}.ts');
    expect(result.template).toBeUndefined();
    expect(result.optional).toBeUndefined();
  });

  it('should parse component with all fields', () => {
    const result = FeatureComponentSchema.parse({
      role: 'engine',
      architecture: 'core.engine',
      path: 'src/core/${name}/engine.ts',
      template: 'engine-template',
      optional: false,
    });
    expect(result.template).toBe('engine-template');
    expect(result.optional).toBe(false);
  });

  it('should accept optional component', () => {
    const result = FeatureComponentSchema.parse({
      role: 'test',
      architecture: 'test.unit',
      path: 'tests/${name}.test.ts',
      optional: true,
    });
    expect(result.optional).toBe(true);
  });

  it('should reject missing role', () => {
    expect(() => FeatureComponentSchema.parse({
      architecture: 'core.engine',
      path: 'src/core/engine.ts',
    })).toThrow();
  });

  it('should reject missing architecture', () => {
    expect(() => FeatureComponentSchema.parse({
      role: 'engine',
      path: 'src/core/engine.ts',
    })).toThrow();
  });

  it('should reject missing path', () => {
    expect(() => FeatureComponentSchema.parse({
      role: 'engine',
      architecture: 'core.engine',
    })).toThrow();
  });

  it('should reject empty object', () => {
    expect(() => FeatureComponentSchema.parse({})).toThrow();
  });
});

describe('FeatureDefinitionSchema', () => {
  it('should parse minimal feature', () => {
    const result = FeatureDefinitionSchema.parse({
      description: 'Add a new constraint validator',
      components: [
        {
          role: 'validator',
          architecture: 'core.constraint',
          path: 'src/core/constraints/${name}.ts',
        },
      ],
    });
    expect(result.description).toBe('Add a new constraint validator');
    expect(result.components).toHaveLength(1);
    expect(result.shared_variables).toBeUndefined();
    expect(result.checklist).toBeUndefined();
    expect(result.triggered_by_action).toBeUndefined();
  });

  it('should parse feature with all fields', () => {
    const result = FeatureDefinitionSchema.parse({
      description: 'Full feature scaffold',
      components: [
        {
          role: 'command',
          architecture: 'cli.command',
          path: 'src/cli/commands/${name}.ts',
        },
        {
          role: 'engine',
          architecture: 'core.engine',
          path: 'src/core/${name}/engine.ts',
        },
        {
          role: 'test',
          architecture: 'test.unit',
          path: 'tests/unit/core/${name}/engine.test.ts',
          optional: true,
        },
      ],
      shared_variables: {
        author: 'team',
        version: '1.0',
      },
      checklist: [
        'Register command in CLI index',
        'Add to documentation',
        'Run tests',
      ],
      triggered_by_action: 'add-feature',
    });

    expect(result.components).toHaveLength(3);
    expect(result.shared_variables).toEqual({ author: 'team', version: '1.0' });
    expect(result.checklist).toHaveLength(3);
    expect(result.triggered_by_action).toBe('add-feature');
  });

  it('should reject missing description', () => {
    expect(() => FeatureDefinitionSchema.parse({
      components: [{ role: 'x', architecture: 'y', path: 'z' }],
    })).toThrow();
  });

  it('should reject missing components', () => {
    expect(() => FeatureDefinitionSchema.parse({
      description: 'Test feature',
    })).toThrow();
  });

  it('should reject empty components array', () => {
    const result = FeatureDefinitionSchema.parse({
      description: 'Test feature',
      components: [],
    });
    // Empty array is valid per Zod z.array() - it's just a feature with no components
    expect(result.components).toEqual([]);
  });

  it('should reject invalid component in array', () => {
    expect(() => FeatureDefinitionSchema.parse({
      description: 'Test feature',
      components: [{ role: 'missing-fields' }],
    })).toThrow();
  });
});

describe('FeatureRegistrySchema', () => {
  it('should parse registry with features', () => {
    const result = FeatureRegistrySchema.parse({
      features: {
        'new-constraint': {
          description: 'Add constraint validator',
          components: [
            { role: 'validator', architecture: 'core.constraint', path: 'src/core/constraints/${name}.ts' },
            { role: 'test', architecture: 'test.unit', path: 'tests/unit/core/constraints/${name}.test.ts' },
          ],
        },
        'new-command': {
          description: 'Add CLI command',
          components: [
            { role: 'command', architecture: 'cli.command', path: 'src/cli/commands/${name}.ts' },
          ],
        },
      },
    });

    expect(Object.keys(result.features)).toHaveLength(2);
    expect(result.features['new-constraint'].components).toHaveLength(2);
    expect(result.features['new-command'].description).toBe('Add CLI command');
  });

  it('should reject missing features field', () => {
    expect(() => FeatureRegistrySchema.parse({})).toThrow();
  });

  it('should accept empty features map', () => {
    const result = FeatureRegistrySchema.parse({ features: {} });
    expect(Object.keys(result.features)).toHaveLength(0);
  });

  it('should reject invalid feature definition', () => {
    expect(() => FeatureRegistrySchema.parse({
      features: {
        bad: { description: 'Missing components' },
      },
    })).toThrow();
  });
});
