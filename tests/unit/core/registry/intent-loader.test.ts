/** @arch archcodex.test.unit */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadIntentRegistry,
  hasIntent,
  listIntentNames,
  getIntentsByCategory,
  suggestIntents,
  type IntentSuggestion,
} from '../../../../src/core/registry/intent-loader.js';
import type { IntentRegistry } from '../../../../src/core/registry/schema.js';

// Mock dependencies
vi.mock('../../../../src/utils/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/utils/index.js')>('../../../../src/utils/index.js');
  return {
    ...actual,
    fileExists: vi.fn(),
    loadYamlWithSchema: vi.fn(),
  };
});

describe('intent-loader', () => {
  describe('hasIntent', () => {
    it('returns true when intent exists in registry', () => {
      const registry: IntentRegistry = {
        intents: {
          'data-access': {
            description: 'Database access',
            category: 'persistence',
          },
        },
      };

      expect(hasIntent(registry, 'data-access')).toBe(true);
    });

    it('returns false when intent does not exist', () => {
      const registry: IntentRegistry = {
        intents: {},
      };

      expect(hasIntent(registry, 'nonexistent')).toBe(false);
    });
  });

  describe('listIntentNames', () => {
    it('returns all intent names from registry', () => {
      const registry: IntentRegistry = {
        intents: {
          'data-access': { description: 'DB access', category: 'persistence' },
          'api-handler': { description: 'API handler', category: 'api' },
        },
      };

      const names = listIntentNames(registry);
      expect(names).toEqual(['data-access', 'api-handler']);
    });

    it('returns empty array for empty registry', () => {
      const registry: IntentRegistry = {
        intents: {},
      };

      expect(listIntentNames(registry)).toEqual([]);
    });
  });

  describe('getIntentsByCategory', () => {
    it('groups intents by category', () => {
      const registry: IntentRegistry = {
        intents: {
          'db-query': { description: 'Query', category: 'persistence' },
          'db-mutation': { description: 'Mutation', category: 'persistence' },
          'api-handler': { description: 'Handler', category: 'api' },
        },
      };

      const categories = getIntentsByCategory(registry);

      expect(categories.get('persistence')).toEqual(['db-query', 'db-mutation']);
      expect(categories.get('api')).toEqual(['api-handler']);
    });

    it('handles missing category as uncategorized', () => {
      const registry: IntentRegistry = {
        intents: {
          'no-category': { description: 'No category' },
          'with-category': { description: 'Has category', category: 'test' },
        },
      };

      const categories = getIntentsByCategory(registry);

      expect(categories.get('uncategorized')).toEqual(['no-category']);
      expect(categories.get('test')).toEqual(['with-category']);
    });

    it('returns empty map for empty registry', () => {
      const registry: IntentRegistry = {
        intents: {},
      };

      const categories = getIntentsByCategory(registry);
      expect(categories.size).toBe(0);
    });

    it('groups multiple uncategorized intents together', () => {
      const registry: IntentRegistry = {
        intents: {
          'intent-1': { description: 'First' },
          'intent-2': { description: 'Second' },
          'intent-3': { description: 'Third' },
        },
      };

      const categories = getIntentsByCategory(registry);
      expect(categories.get('uncategorized')).toEqual(['intent-1', 'intent-2', 'intent-3']);
    });
  });

  describe('suggestIntents', () => {
    it('matches filePath patterns', () => {
      const registry: IntentRegistry = {
        intents: {
          'api-handler': {
            description: 'API handler',
            category: 'api',
            suggest_for_paths: ['src/api/**/*.ts'],
          },
        },
      };

      const suggestions = suggestIntents(registry, {
        filePath: 'src/api/handlers/users.ts',
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].name).toBe('api-handler');
      expect(suggestions[0].reason).toBe('path');
      expect(suggestions[0].matchedPattern).toBe('src/api/**/*.ts');
    });

    it('matches archId patterns with exact match', () => {
      const registry: IntentRegistry = {
        intents: {
          'admin-handler': {
            description: 'Admin handler',
            suggest_for_archs: ['api.admin.users'],
          },
        },
      };

      const suggestions = suggestIntents(registry, {
        archId: 'api.admin.users',
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].name).toBe('admin-handler');
      expect(suggestions[0].reason).toBe('architecture');
    });

    it('matches archId patterns with wildcard suffix', () => {
      const registry: IntentRegistry = {
        intents: {
          'admin-handler': {
            description: 'Admin handler',
            suggest_for_archs: ['api.admin.*'],
          },
        },
      };

      const suggestions = suggestIntents(registry, {
        archId: 'api.admin.users',
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].name).toBe('admin-handler');
    });

    it('deduplicates suggestions when both path and arch match', () => {
      const registry: IntentRegistry = {
        intents: {
          'api-handler': {
            description: 'API handler',
            suggest_for_paths: ['src/api/**/*.ts'],
            suggest_for_archs: ['api.*'],
          },
        },
      };

      const suggestions = suggestIntents(registry, {
        filePath: 'src/api/handlers/users.ts',
        archId: 'api.admin.users',
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].name).toBe('api-handler');
    });

    it('returns empty array when no matches', () => {
      const registry: IntentRegistry = {
        intents: {
          'api-handler': {
            description: 'API handler',
            suggest_for_paths: ['src/api/**/*.ts'],
          },
        },
      };

      const suggestions = suggestIntents(registry, {
        filePath: 'src/database/queries.ts',
      });

      expect(suggestions).toHaveLength(0);
    });

    it('returns empty array when no filePath or archId provided', () => {
      const registry: IntentRegistry = {
        intents: {
          'api-handler': {
            description: 'API handler',
            suggest_for_paths: ['src/api/**/*.ts'],
          },
        },
      };

      const suggestions = suggestIntents(registry, {});

      expect(suggestions).toHaveLength(0);
    });

    it('includes description and category in suggestions', () => {
      const registry: IntentRegistry = {
        intents: {
          'api-handler': {
            description: 'Handles API requests',
            category: 'api',
            suggest_for_paths: ['src/api/**/*.ts'],
          },
        },
      };

      const suggestions = suggestIntents(registry, {
        filePath: 'src/api/users.ts',
      });

      expect(suggestions[0]).toMatchObject({
        name: 'api-handler',
        description: 'Handles API requests',
        category: 'api',
        reason: 'path',
      });
    });
  });

  describe('loadIntentRegistry', () => {
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

      const result = await loadIntentRegistry('/test/project');

      expect(result).toEqual({ intents: {} });
      expect(fileExists).toHaveBeenCalledWith(
        expect.stringContaining('_intents.yaml')
      );
    });

    it('loads and returns intent registry when file exists', async () => {
      const mockRegistry: IntentRegistry = {
        intents: {
          'test-intent': {
            description: 'Test intent',
            category: 'test',
          },
        },
      };

      fileExists.mockResolvedValue(true);
      loadYamlWithSchema.mockResolvedValue(mockRegistry);

      const result = await loadIntentRegistry('/test/project');

      expect(result).toEqual(mockRegistry);
      expect(loadYamlWithSchema).toHaveBeenCalledWith(
        expect.stringContaining('_intents.yaml'),
        expect.anything()
      );
    });
  });
});
