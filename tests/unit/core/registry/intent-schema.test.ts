/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for intent schema Zod validation.
 */
import { describe, it, expect } from 'vitest';
import {
  IntentDefinitionSchema,
  IntentRegistrySchema,
} from '../../../../src/core/registry/intent-schema.js';

describe('IntentDefinitionSchema', () => {
  it('should parse minimal intent with only description', () => {
    const result = IntentDefinitionSchema.parse({
      description: 'Requires authentication check',
    });
    expect(result.description).toBe('Requires authentication check');
    expect(result.requires).toBeUndefined();
    expect(result.forbids).toBeUndefined();
    expect(result.conflicts_with).toBeUndefined();
    expect(result.requires_intent).toBeUndefined();
    expect(result.category).toBeUndefined();
    expect(result.suggest_for_paths).toBeUndefined();
    expect(result.suggest_for_archs).toBeUndefined();
  });

  it('should parse intent with all fields', () => {
    const result = IntentDefinitionSchema.parse({
      description: 'Requires authentication',
      requires: ['isAuthenticated', 'getSession'],
      forbids: ['publicAccess', 'skipAuth'],
      conflicts_with: ['public-endpoint'],
      requires_intent: ['session-management'],
      category: 'auth',
      suggest_for_paths: ['src/api/admin/**', 'src/api/protected/**'],
      suggest_for_archs: ['api.admin.*', 'api.protected.*'],
    });

    expect(result.description).toBe('Requires authentication');
    expect(result.requires).toEqual(['isAuthenticated', 'getSession']);
    expect(result.forbids).toEqual(['publicAccess', 'skipAuth']);
    expect(result.conflicts_with).toEqual(['public-endpoint']);
    expect(result.requires_intent).toEqual(['session-management']);
    expect(result.category).toBe('auth');
    expect(result.suggest_for_paths).toEqual(['src/api/admin/**', 'src/api/protected/**']);
    expect(result.suggest_for_archs).toEqual(['api.admin.*', 'api.protected.*']);
  });

  it('should reject missing description', () => {
    expect(() => IntentDefinitionSchema.parse({})).toThrow();
    expect(() => IntentDefinitionSchema.parse({ requires: ['foo'] })).toThrow();
  });

  it('should reject non-string description', () => {
    expect(() => IntentDefinitionSchema.parse({ description: 42 })).toThrow();
    expect(() => IntentDefinitionSchema.parse({ description: null })).toThrow();
  });

  it('should accept empty arrays for optional fields', () => {
    const result = IntentDefinitionSchema.parse({
      description: 'Test intent',
      requires: [],
      forbids: [],
      conflicts_with: [],
      requires_intent: [],
      suggest_for_paths: [],
      suggest_for_archs: [],
    });
    expect(result.requires).toEqual([]);
    expect(result.forbids).toEqual([]);
    expect(result.conflicts_with).toEqual([]);
    expect(result.requires_intent).toEqual([]);
  });

  it('should reject non-array values for array fields', () => {
    expect(() => IntentDefinitionSchema.parse({
      description: 'Test',
      requires: 'not-an-array',
    })).toThrow();
  });

  it('should reject non-string items in array fields', () => {
    expect(() => IntentDefinitionSchema.parse({
      description: 'Test',
      requires: [42],
    })).toThrow();
  });

  it('should accept various category values', () => {
    const categories = ['auth', 'data-access', 'lifecycle', 'performance', 'audit', 'custom'];
    for (const category of categories) {
      const result = IntentDefinitionSchema.parse({
        description: `Category: ${category}`,
        category,
      });
      expect(result.category).toBe(category);
    }
  });
});

describe('IntentRegistrySchema', () => {
  it('should parse registry with intents', () => {
    const result = IntentRegistrySchema.parse({
      intents: {
        'auth-required': {
          description: 'Requires authentication',
          requires: ['isAuthenticated'],
          category: 'auth',
        },
        'rate-limited': {
          description: 'Requires rate limiting',
          requires: ['rateLimit'],
          category: 'performance',
        },
        'audit-logged': {
          description: 'Must log audit events',
          requires: ['logAudit'],
          category: 'audit',
        },
      },
    });

    expect(Object.keys(result.intents)).toHaveLength(3);
    expect(result.intents['auth-required'].description).toBe('Requires authentication');
    expect(result.intents['rate-limited'].category).toBe('performance');
  });

  it('should reject missing intents field', () => {
    expect(() => IntentRegistrySchema.parse({})).toThrow();
  });

  it('should accept empty intents map', () => {
    const result = IntentRegistrySchema.parse({ intents: {} });
    expect(Object.keys(result.intents)).toHaveLength(0);
  });

  it('should reject invalid intent definition in registry', () => {
    expect(() => IntentRegistrySchema.parse({
      intents: {
        bad: { requires: ['something'] }, // missing description
      },
    })).toThrow();
  });

  it('should parse registry with conflicting intents', () => {
    const result = IntentRegistrySchema.parse({
      intents: {
        'public-endpoint': {
          description: 'Public access',
          conflicts_with: ['auth-required'],
        },
        'auth-required': {
          description: 'Requires auth',
          conflicts_with: ['public-endpoint'],
        },
      },
    });

    expect(result.intents['public-endpoint'].conflicts_with).toEqual(['auth-required']);
    expect(result.intents['auth-required'].conflicts_with).toEqual(['public-endpoint']);
  });

  it('should parse registry with intent dependencies', () => {
    const result = IntentRegistrySchema.parse({
      intents: {
        'admin-only': {
          description: 'Admin access required',
          requires_intent: ['auth-required'],
        },
        'auth-required': {
          description: 'Requires authentication',
        },
      },
    });

    expect(result.intents['admin-only'].requires_intent).toEqual(['auth-required']);
  });
});
