/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Tests for the SpecCodex fixture system.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFixtures,
  createFixtureContext,
  resolveFixture,
  isFixtureReference,
  parseFixtureReference,
  listFixtures,
  getFixturesTemplate,
  type FixtureRegistry,
  type FixtureContext,
} from '../../src/core/spec/fixtures.js';
import { expandPlaceholder, type PlaceholderContext } from '../../src/core/spec/placeholders.js';

describe('Fixture System', () => {
  describe('isFixtureReference', () => {
    it('returns true for valid fixture references', () => {
      expect(isFixtureReference('@authenticated')).toBe(true);
      expect(isFixtureReference('@validTaskEntry')).toBe(true);
      expect(isFixtureReference('@my_fixture_123')).toBe(true);
    });

    it('returns false for non-fixture strings', () => {
      expect(isFixtureReference('authenticated')).toBe(false);
      expect(isFixtureReference('@123invalid')).toBe(false);
      expect(isFixtureReference('@')).toBe(false);
      expect(isFixtureReference('')).toBe(false);
    });

    it('returns true for fixture references with params', () => {
      expect(isFixtureReference('@userWithPermission({"permission":"admin"})')).toBe(true);
    });
  });

  describe('parseFixtureReference', () => {
    it('parses simple fixture reference', () => {
      const result = parseFixtureReference('@authenticated');
      expect(result).toEqual({ name: 'authenticated', params: {} });
    });

    it('parses fixture reference with params', () => {
      const result = parseFixtureReference('@userWithPermission({"permission":"admin"})');
      expect(result).toEqual({
        name: 'userWithPermission',
        params: { permission: 'admin' },
      });
    });

    it('returns null for invalid references', () => {
      expect(parseFixtureReference('notAFixture')).toBeNull();
      expect(parseFixtureReference('@123invalid')).toBeNull();
    });
  });

  describe('Built-in Fixtures', () => {
    let registry: FixtureRegistry;
    let context: FixtureContext;

    beforeEach(async () => {
      registry = await loadFixtures('/nonexistent');
      context = createFixtureContext('/nonexistent', registry);
    });

    it('includes authenticated fixture', () => {
      expect(registry.fixtures.authenticated).toBeDefined();
      expect(registry.fixtures.authenticated.mode).toBe('generate');
    });

    it('includes no_access fixture', () => {
      expect(registry.fixtures.no_access).toBeDefined();
      expect(registry.fixtures.no_access.mode).toBe('generate');
    });

    it('includes admin_user fixture', () => {
      expect(registry.fixtures.admin_user).toBeDefined();
      expect(registry.fixtures.admin_user.mode).toBe('generate');
    });

    it('resolves authenticated fixture', () => {
      const result = resolveFixture('authenticated', {}, context);
      expect(result.success).toBe(true);
      expect(result.mode).toBe('generate');
      expect(result.value).toMatchObject({
        id: 'user_test_authenticated',
        permissions: ['read', 'write'],
        role: 'member',
      });
    });

    it('resolves no_access fixture', () => {
      const result = resolveFixture('no_access', {}, context);
      expect(result.success).toBe(true);
      expect(result.value).toMatchObject({
        permissions: [],
        role: 'guest',
      });
    });

    it('resolves admin_user fixture', () => {
      const result = resolveFixture('admin_user', {}, context);
      expect(result.success).toBe(true);
      expect(result.value).toMatchObject({
        permissions: ['read', 'write', 'delete', 'admin'],
        role: 'admin',
      });
    });
  });

  describe('resolveFixture', () => {
    let registry: FixtureRegistry;
    let context: FixtureContext;

    beforeEach(async () => {
      registry = await loadFixtures('/nonexistent');
      // Add a custom fixture for testing
      registry.fixtures.customTask = {
        description: 'Custom task fixture',
        mode: 'generate',
        value: {
          id: 'task_123',
          title: 'Test Task',
          status: 'pending',
        },
      };
      registry.fixtures.docOnly = {
        description: 'Documentation-only fixture',
        mode: 'documentation',
        setup: 'Create via API',
      };
      context = createFixtureContext('/nonexistent', registry);
    });

    it('resolves custom fixtures', () => {
      const result = resolveFixture('customTask', {}, context);
      expect(result.success).toBe(true);
      expect(result.value).toMatchObject({
        id: 'task_123',
        title: 'Test Task',
      });
    });

    it('returns error for unknown fixtures', () => {
      const result = resolveFixture('unknownFixture', {}, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown fixture');
    });

    it('handles documentation-only fixtures', () => {
      const result = resolveFixture('docOnly', {}, context);
      expect(result.success).toBe(true);
      expect(result.mode).toBe('documentation');
      expect(result.value).toBe('@docOnly'); // Returns as-is
    });

    it('caches resolved fixtures', () => {
      const result1 = resolveFixture('authenticated', {}, context);
      const result2 = resolveFixture('authenticated', {}, context);
      expect(result1.value).toBe(result2.value); // Same reference
    });
  });

  describe('listFixtures', () => {
    it('lists all available fixtures', async () => {
      const registry = await loadFixtures('/nonexistent');
      const list = listFixtures(registry);

      expect(list.length).toBeGreaterThanOrEqual(3); // At least built-ins
      expect(list.some(f => f.name === 'authenticated')).toBe(true);
      expect(list.some(f => f.name === 'no_access')).toBe(true);
      expect(list.some(f => f.name === 'admin_user')).toBe(true);
    });

    it('includes fixture metadata', async () => {
      const registry = await loadFixtures('/nonexistent');
      const list = listFixtures(registry);

      const authenticated = list.find(f => f.name === 'authenticated');
      expect(authenticated).toBeDefined();
      expect(authenticated!.description).toBeDefined();
      expect(authenticated!.mode).toBe('generate');
    });
  });

  describe('getFixturesTemplate', () => {
    it('returns valid YAML template', () => {
      const template = getFixturesTemplate();

      expect(template).toContain('version: "1.0"');
      expect(template).toContain('fixtures:');
      expect(template).toContain('mode: generate');
      expect(template).toContain('mode: documentation');
    });
  });

  describe('Placeholder Integration', () => {
    let registry: FixtureRegistry;

    beforeEach(async () => {
      registry = await loadFixtures('/nonexistent');
      registry.fixtures.validEntry = {
        description: 'Valid entry fixture',
        mode: 'generate',
        value: {
          _id: 'entry_123',
          title: 'Test Entry',
        },
      };
    });

    it('resolves fixture via placeholder system', () => {
      const context: PlaceholderContext = {
        fixtureRegistry: registry,
      };
      const result = expandPlaceholder('@validEntry', context);

      if ('code' in result) {
        throw new Error(`Unexpected error: ${result.message}`);
      }

      expect(result.type).toBe('value');
      expect(result.value).toMatchObject({
        _id: 'entry_123',
        title: 'Test Entry',
      });
    });

    it('returns error for unknown fixtures via placeholder', () => {
      const context: PlaceholderContext = {
        fixtureRegistry: registry,
      };
      const result = expandPlaceholder('@unknownFixture', context);

      expect('code' in result).toBe(true);
      if ('code' in result) {
        expect(result.code).toBe('FIXTURE_RESOLUTION_ERROR');
      }
    });

    it('built-in placeholders take precedence over fixtures', () => {
      const context: PlaceholderContext = {
        fixtureRegistry: registry,
      };
      // @authenticated is handled by built-in pattern, not fixture system
      const result = expandPlaceholder('@authenticated', context);

      if ('code' in result) {
        throw new Error(`Unexpected error: ${result.message}`);
      }

      // Built-in returns 'user' type with permissions array
      expect(result.type).toBe('user');
      expect(result.permissions).toBeDefined();
    });
  });
});
