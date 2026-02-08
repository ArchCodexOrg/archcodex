/**
 * @arch archcodex.test.unit
 *
 * Tests for SpecCodex loader.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
  loadSpecFile,
  findSpec,
  specRegistryExists,
  getSpecsDir,
  listSpecIds,
  hasSpec,
} from '../../../../src/core/spec/loader.js';

describe('Spec Loader', () => {
  describe('getSpecsDir', () => {
    it('returns .arch/specs path', () => {
      const result = getSpecsDir('/project');
      expect(result).toBe(path.join('/project', '.arch', 'specs'));
    });
  });

  describe('specRegistryExists', () => {
    it('returns boolean', async () => {
      // Test with current directory - may or may not have specs
      const result = await specRegistryExists(process.cwd());
      expect(typeof result).toBe('boolean');
    });
  });

  describe('loadSpecFile', () => {
    it('returns parse result object', async () => {
      // Try to load a nonexistent file - should return error result
      const result = await loadSpecFile('/nonexistent/spec.yaml');
      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
      expect(Array.isArray(result.specs)).toBe(true);
    });
  });

  describe('listSpecIds', () => {
    it('returns list of spec IDs from registry', () => {
      const registry = {
        version: '1.0',
        nodes: {
          'spec.a': { intent: 'A' },
          'spec.b': { intent: 'B' },
        },
        mixins: {},
      };

      const ids = listSpecIds(registry);
      expect(Array.isArray(ids)).toBe(true);
      expect(ids).toContain('spec.a');
      expect(ids).toContain('spec.b');
    });
  });

  describe('hasSpec', () => {
    it('returns true for existing spec', () => {
      const registry = {
        version: '1.0',
        nodes: {
          'spec.test': { intent: 'Test' },
        },
        mixins: {},
      };

      expect(hasSpec(registry, 'spec.test')).toBe(true);
    });

    it('returns false for non-existing spec', () => {
      const registry = {
        version: '1.0',
        nodes: {},
        mixins: {},
      };

      expect(hasSpec(registry, 'spec.missing')).toBe(false);
    });
  });

  describe('findSpec', () => {
    it('finds spec by ID from registry', async () => {
      const registry = {
        version: '1.0',
        nodes: {
          'spec.test': { intent: 'Test spec' },
        },
        mixins: {},
      };

      const result = await findSpec('/project', 'spec.test', registry);
      expect(result).not.toBeNull();
      expect(result?.node.intent).toBe('Test spec');
    });
  });
});
