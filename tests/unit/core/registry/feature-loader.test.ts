/** @arch archcodex.test.unit */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadFeatureRegistry,
  hasFeature,
  listFeatureNames,
  getFeature,
  findFeatureByAction,
} from '../../../../src/core/registry/feature-loader.js';
import type { FeatureRegistry, FeatureDefinition } from '../../../../src/core/registry/schema.js';

// Mock dependencies
vi.mock('../../../../src/utils/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/utils/index.js')>('../../../../src/utils/index.js');
  return {
    ...actual,
    fileExists: vi.fn(),
    loadYamlWithSchema: vi.fn(),
  };
});

describe('feature-loader', () => {
  describe('hasFeature', () => {
    it('returns true when feature exists in registry', () => {
      const registry: FeatureRegistry = {
        features: {
          'order-management': {
            name: 'Order Management',
            description: 'Order processing feature',
            triggered_by_action: 'createOrder',
          },
        },
      };

      expect(hasFeature(registry, 'order-management')).toBe(true);
    });

    it('returns false when feature does not exist', () => {
      const registry: FeatureRegistry = {
        features: {},
      };

      expect(hasFeature(registry, 'nonexistent')).toBe(false);
    });

    it('returns false for empty registry', () => {
      const registry: FeatureRegistry = {
        features: {},
      };

      expect(hasFeature(registry, 'any-feature')).toBe(false);
    });
  });

  describe('listFeatureNames', () => {
    it('returns all feature names from registry', () => {
      const registry: FeatureRegistry = {
        features: {
          'order-management': {
            name: 'Order Management',
            description: 'Orders',
            triggered_by_action: 'createOrder',
          },
          'user-auth': {
            name: 'User Authentication',
            description: 'Auth',
            triggered_by_action: 'login',
          },
        },
      };

      const names = listFeatureNames(registry);
      expect(names).toEqual(['order-management', 'user-auth']);
    });

    it('returns empty array for empty registry', () => {
      const registry: FeatureRegistry = {
        features: {},
      };

      expect(listFeatureNames(registry)).toEqual([]);
    });

    it('preserves feature name order from object keys', () => {
      const registry: FeatureRegistry = {
        features: {
          'feature-a': { name: 'A', description: 'A', triggered_by_action: 'a' },
          'feature-b': { name: 'B', description: 'B', triggered_by_action: 'b' },
          'feature-c': { name: 'C', description: 'C', triggered_by_action: 'c' },
        },
      };

      expect(listFeatureNames(registry)).toEqual(['feature-a', 'feature-b', 'feature-c']);
    });
  });

  describe('getFeature', () => {
    it('returns feature definition when it exists', () => {
      const featureDef: FeatureDefinition = {
        name: 'Order Management',
        description: 'Order processing feature',
        triggered_by_action: 'createOrder',
      };

      const registry: FeatureRegistry = {
        features: {
          'order-management': featureDef,
        },
      };

      expect(getFeature(registry, 'order-management')).toBe(featureDef);
    });

    it('returns undefined when feature does not exist', () => {
      const registry: FeatureRegistry = {
        features: {},
      };

      expect(getFeature(registry, 'nonexistent')).toBeUndefined();
    });

    it('returns correct feature from multiple features', () => {
      const featureDef1: FeatureDefinition = {
        name: 'Feature 1',
        description: 'First',
        triggered_by_action: 'action1',
      };
      const featureDef2: FeatureDefinition = {
        name: 'Feature 2',
        description: 'Second',
        triggered_by_action: 'action2',
      };

      const registry: FeatureRegistry = {
        features: {
          'feature-1': featureDef1,
          'feature-2': featureDef2,
        },
      };

      expect(getFeature(registry, 'feature-2')).toBe(featureDef2);
    });
  });

  describe('findFeatureByAction', () => {
    it('finds feature with matching action', () => {
      const targetFeature: FeatureDefinition = {
        name: 'Order Management',
        description: 'Orders',
        triggered_by_action: 'createOrder',
      };

      const registry: FeatureRegistry = {
        features: {
          'order-management': targetFeature,
          'user-auth': {
            name: 'Auth',
            description: 'Auth',
            triggered_by_action: 'login',
          },
        },
      };

      expect(findFeatureByAction(registry, 'createOrder')).toBe(targetFeature);
    });

    it('returns undefined when no feature matches action', () => {
      const registry: FeatureRegistry = {
        features: {
          'order-management': {
            name: 'Orders',
            description: 'Orders',
            triggered_by_action: 'createOrder',
          },
        },
      };

      expect(findFeatureByAction(registry, 'nonexistentAction')).toBeUndefined();
    });

    it('returns first matching feature when multiple features have same action', () => {
      const feature1: FeatureDefinition = {
        name: 'Feature 1',
        description: 'First',
        triggered_by_action: 'sharedAction',
      };

      const registry: FeatureRegistry = {
        features: {
          'feature-1': feature1,
          'feature-2': {
            name: 'Feature 2',
            description: 'Second',
            triggered_by_action: 'sharedAction',
          },
        },
      };

      const result = findFeatureByAction(registry, 'sharedAction');
      expect(result).toBeDefined();
      expect(result?.triggered_by_action).toBe('sharedAction');
    });

    it('returns undefined for empty registry', () => {
      const registry: FeatureRegistry = {
        features: {},
      };

      expect(findFeatureByAction(registry, 'anyAction')).toBeUndefined();
    });
  });

  describe('loadFeatureRegistry', () => {
    let fileExists: ReturnType<typeof vi.fn>;
    let loadYamlWithSchema: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const utils = await import('../../../../src/utils/index.js');
      fileExists = vi.mocked(utils.fileExists);
      loadYamlWithSchema = vi.mocked(utils.loadYamlWithSchema);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('returns empty registry when file does not exist', async () => {
      fileExists.mockResolvedValue(false);

      const result = await loadFeatureRegistry('/test/project');

      expect(result).toEqual({ features: {} });
      expect(fileExists).toHaveBeenCalledWith(
        expect.stringContaining('_features.yaml')
      );
    });

    it('loads and returns feature registry when file exists', async () => {
      const mockRegistry: FeatureRegistry = {
        features: {
          'test-feature': {
            name: 'Test Feature',
            description: 'Test',
            triggered_by_action: 'testAction',
          },
        },
      };

      fileExists.mockResolvedValue(true);
      loadYamlWithSchema.mockResolvedValue(mockRegistry);

      const result = await loadFeatureRegistry('/test/project');

      expect(result).toEqual(mockRegistry);
      expect(loadYamlWithSchema).toHaveBeenCalledWith(
        expect.stringContaining('_features.yaml'),
        expect.anything()
      );
    });
  });
});
