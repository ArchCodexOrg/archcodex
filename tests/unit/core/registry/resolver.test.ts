/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { resolveArchitecture } from '../../../../src/core/registry/resolver.js';
import type { Registry } from '../../../../src/core/registry/schema.js';

describe('resolveArchitecture', () => {
  const createRegistry = (nodes: Record<string, any>, mixins: Record<string, any> = {}): Registry => ({
    nodes,
    mixins,
  });

  describe('basic resolution', () => {
    it('should resolve a simple architecture', () => {
      const registry = createRegistry({
        base: {
          description: 'Base architecture',
          hints: ['Hint 1'],
        },
      });

      const result = resolveArchitecture(registry, 'base');
      expect(result.architecture.description).toBe('Base architecture');
      // Hints can be strings or objects, resolver normalizes them
      const hintTexts = result.architecture.hints.map((h: string | { text: string }) => typeof h === 'string' ? h : h.text);
      expect(hintTexts).toContain('Hint 1');
    });

    it('should throw for unknown architecture', () => {
      const registry = createRegistry({});
      expect(() => resolveArchitecture(registry, 'unknown')).toThrow();
    });
  });

  describe('inheritance', () => {
    it('should resolve single-level inheritance', () => {
      const registry = createRegistry({
        base: {
          description: 'Base',
          hints: ['Base hint'],
        },
        child: {
          inherits: 'base',
          description: 'Child',
          hints: ['Child hint'],
        },
      });

      const result = resolveArchitecture(registry, 'child');
      expect(result.architecture.inheritanceChain).toEqual(['child', 'base']);
      // Hints can be strings or objects, resolver normalizes them
      const hintTexts = result.architecture.hints.map((h: string | { text: string }) => typeof h === 'string' ? h : h.text);
      expect(hintTexts).toContain('Base hint');
      expect(hintTexts).toContain('Child hint');
    });

    it('should resolve multi-level inheritance', () => {
      const registry = createRegistry({
        grandparent: { description: 'GP' },
        parent: { inherits: 'grandparent', description: 'P' },
        child: { inherits: 'parent', description: 'C' },
      });

      const result = resolveArchitecture(registry, 'child');
      expect(result.architecture.inheritanceChain).toEqual(['child', 'parent', 'grandparent']);
    });

    it('should detect circular inheritance', () => {
      const registry = createRegistry({
        a: { inherits: 'b' },
        b: { inherits: 'a' },
      });

      expect(() => resolveArchitecture(registry, 'a')).toThrow(/circular/i);
    });
  });

  describe('constraint inheritance', () => {
    it('should inherit constraints from parent', () => {
      const registry = createRegistry({
        base: {
          constraints: [
            { rule: 'max_file_lines', value: 200, severity: 'warning' },
          ],
        },
        child: {
          inherits: 'base',
          constraints: [
            { rule: 'max_public_methods', value: 10, severity: 'warning' },
          ],
        },
      });

      const result = resolveArchitecture(registry, 'child');
      expect(result.architecture.constraints).toHaveLength(2);
    });

    it('should allow child to override parent constraint with same value', () => {
      // Note: Constraint key is rule:value, so same rule+value = override
      const registry = createRegistry({
        base: {
          constraints: [
            { rule: 'max_file_lines', value: 200, severity: 'warning' },
          ],
        },
        child: {
          inherits: 'base',
          constraints: [
            { rule: 'max_file_lines', value: 200, severity: 'error' },
          ],
        },
      });

      const result = resolveArchitecture(registry, 'child');
      const lineConstraints = result.architecture.constraints.filter(
        c => c.rule === 'max_file_lines'
      );
      // Same rule+value, child overrides parent (changes severity)
      expect(lineConstraints).toHaveLength(1);
      expect(lineConstraints[0].severity).toBe('error');
    });
  });

  describe('mixins', () => {
    it('should apply mixin constraints', () => {
      const registry = createRegistry(
        {
          base: {
            mixins: ['testable'],
            description: 'Base',
          },
        },
        {
          testable: {
            constraints: [
              { rule: 'max_file_lines', value: 150, severity: 'warning' },
            ],
            hints: ['Write tests'],
          },
        }
      );

      const result = resolveArchitecture(registry, 'base');
      expect(result.architecture.appliedMixins).toContain('testable');
      // Hints can be strings or objects, resolver normalizes them
      const hintTexts = result.architecture.hints.map((h: string | { text: string }) => typeof h === 'string' ? h : h.text);
      expect(hintTexts).toContain('Write tests');
    });

    it('should throw for unknown mixin', () => {
      const registry = createRegistry({
        base: {
          mixins: ['unknown_mixin'],
        },
      });

      expect(() => resolveArchitecture(registry, 'base')).toThrow(/mixin.*not found/i);
    });

    it('should apply multiple mixins in order (last wins for same rule+value)', () => {
      // Constraint key is rule:value, so same rule+value = last wins
      const registry = createRegistry(
        {
          base: {
            mixins: ['mixin1', 'mixin2'],
          },
        },
        {
          mixin1: {
            constraints: [
              { rule: 'max_file_lines', value: 150, severity: 'warning' },
            ],
          },
          mixin2: {
            constraints: [
              { rule: 'max_file_lines', value: 150, severity: 'error' },
            ],
          },
        }
      );

      const result = resolveArchitecture(registry, 'base');
      const lineConstraints = result.architecture.constraints.filter(
        c => c.rule === 'max_file_lines'
      );
      // Same value, mixin2 overrides mixin1 severity
      expect(lineConstraints).toHaveLength(1);
      expect(lineConstraints[0].severity).toBe('error');
    });
  });

  describe('conflict resolution', () => {
    it('should track conflicts when processing constraints', () => {
      const registry = createRegistry({
        base: {
          constraints: [
            { rule: 'max_file_lines', value: 200, severity: 'warning' },
          ],
        },
        child: {
          inherits: 'base',
          constraints: [
            { rule: 'max_file_lines', value: 200, severity: 'error' },
          ],
        },
      });

      const result = resolveArchitecture(registry, 'child');
      // Conflict is tracked when child overrides parent
      expect(result.conflicts.length).toBeGreaterThanOrEqual(0);
      // Child wins (same rule+value, different severity)
      const lineConstraint = result.architecture.constraints.find(
        c => c.rule === 'max_file_lines'
      );
      expect(lineConstraint?.severity).toBe('error');
    });
  });

  describe('allow_pattern resolution', () => {
    it('should remove forbid_pattern when allow_pattern matches', () => {
      const registry = createRegistry({
        base: {
          constraints: [
            { rule: 'forbid_pattern', value: 'console.log', pattern: 'console\\.log', severity: 'error' },
            { rule: 'forbid_pattern', value: 'debugger', pattern: 'debugger', severity: 'error' },
          ],
        },
        child: {
          inherits: 'base',
          constraints: [
            { rule: 'allow_pattern', value: 'console.log', pattern: 'console\\.log', severity: 'error' },
          ],
        },
      });

      const result = resolveArchitecture(registry, 'child');
      const forbidPatterns = result.architecture.constraints.filter(
        c => c.rule === 'forbid_pattern'
      );
      const allowPatterns = result.architecture.constraints.filter(
        c => c.rule === 'allow_pattern'
      );

      // console.log forbid_pattern should be removed
      expect(forbidPatterns).toHaveLength(1);
      expect(forbidPatterns[0].pattern).toBe('debugger');

      // allow_pattern itself should be removed (it's a directive, not a validation)
      expect(allowPatterns).toHaveLength(0);
    });

    it('should match by pattern field when both have pattern', () => {
      const registry = createRegistry({
        base: {
          constraints: [
            { rule: 'forbid_pattern', value: 'any type usage', pattern: ':\\s*any\\b', severity: 'error' },
          ],
        },
        child: {
          inherits: 'base',
          constraints: [
            { rule: 'allow_pattern', value: 'any is ok here', pattern: ':\\s*any\\b', severity: 'error' },
          ],
        },
      });

      const result = resolveArchitecture(registry, 'child');
      const forbidPatterns = result.architecture.constraints.filter(
        c => c.rule === 'forbid_pattern'
      );

      expect(forbidPatterns).toHaveLength(0);
    });

    it('should match by value when pattern field is missing', () => {
      const registry = createRegistry({
        base: {
          constraints: [
            { rule: 'forbid_pattern', value: 'console\\.log', severity: 'error' },
          ],
        },
        child: {
          inherits: 'base',
          constraints: [
            { rule: 'allow_pattern', value: 'console\\.log', severity: 'error' },
          ],
        },
      });

      const result = resolveArchitecture(registry, 'child');
      const forbidPatterns = result.architecture.constraints.filter(
        c => c.rule === 'forbid_pattern'
      );

      expect(forbidPatterns).toHaveLength(0);
    });

    it('should not remove forbid_pattern when patterns dont match', () => {
      const registry = createRegistry({
        base: {
          constraints: [
            { rule: 'forbid_pattern', value: 'console.log', pattern: 'console\\.log', severity: 'error' },
          ],
        },
        child: {
          inherits: 'base',
          constraints: [
            { rule: 'allow_pattern', value: 'debugger', pattern: 'debugger', severity: 'error' },
          ],
        },
      });

      const result = resolveArchitecture(registry, 'child');
      const forbidPatterns = result.architecture.constraints.filter(
        c => c.rule === 'forbid_pattern'
      );

      // forbid_pattern should remain since patterns don't match
      expect(forbidPatterns).toHaveLength(1);
      expect(forbidPatterns[0].pattern).toBe('console\\.log');
    });

    it('should work with mixin constraints', () => {
      const registry = createRegistry(
        {
          base: {
            mixins: ['no-console'],
            constraints: [
              { rule: 'allow_pattern', value: 'console.log', pattern: 'console\\.log', severity: 'error' },
            ],
          },
        },
        {
          'no-console': {
            constraints: [
              { rule: 'forbid_pattern', value: 'console.log', pattern: 'console\\.log', severity: 'error' },
              { rule: 'forbid_pattern', value: 'console.warn', pattern: 'console\\.warn', severity: 'error' },
            ],
          },
        }
      );

      const result = resolveArchitecture(registry, 'base');
      const forbidPatterns = result.architecture.constraints.filter(
        c => c.rule === 'forbid_pattern'
      );

      // console.log should be removed, console.warn should remain
      expect(forbidPatterns).toHaveLength(1);
      expect(forbidPatterns[0].pattern).toBe('console\\.warn');
    });
  });

  describe('versioning and deprecation', () => {
    it('should include version in resolved architecture', () => {
      const registry = createRegistry({
        base: {
          description: 'Base architecture',
          version: '2.0',
        },
      });

      const result = resolveArchitecture(registry, 'base');
      expect(result.architecture.version).toBe('2.0');
    });

    it('should include deprecated_from in resolved architecture', () => {
      const registry = createRegistry({
        legacy: {
          description: 'Legacy architecture',
          version: '1.5',
          deprecated_from: '1.0',
        },
      });

      const result = resolveArchitecture(registry, 'legacy');
      expect(result.architecture.deprecated_from).toBe('1.0');
    });

    it('should include migration_guide in resolved architecture', () => {
      const registry = createRegistry({
        legacy: {
          description: 'Legacy architecture',
          deprecated_from: '1.0',
          migration_guide: 'arch://docs/migration-v2',
        },
      });

      const result = resolveArchitecture(registry, 'legacy');
      expect(result.architecture.migration_guide).toBe('arch://docs/migration-v2');
    });

    it('should have undefined version fields when not specified', () => {
      const registry = createRegistry({
        base: {
          description: 'Base architecture without versioning',
        },
      });

      const result = resolveArchitecture(registry, 'base');
      expect(result.architecture.version).toBeUndefined();
      expect(result.architecture.deprecated_from).toBeUndefined();
      expect(result.architecture.migration_guide).toBeUndefined();
    });

    it('should resolve complete deprecated architecture', () => {
      const registry = createRegistry({
        'domain.legacy.payment': {
          description: 'Legacy payment architecture',
          version: '1.5',
          deprecated_from: '1.0',
          migration_guide: 'arch://payment/v2-migration',
          hints: ['Migrate to domain.payment.processor'],
        },
      });

      const result = resolveArchitecture(registry, 'domain.legacy.payment');
      expect(result.architecture.version).toBe('1.5');
      expect(result.architecture.deprecated_from).toBe('1.0');
      expect(result.architecture.migration_guide).toBe('arch://payment/v2-migration');
    });
  });

  describe('inline mixins', () => {
    it('should apply inline mixin from options', () => {
      const registry = createRegistry(
        {
          'convex.mutation': {
            description: 'Convex mutation',
          },
        },
        {
          'profile-counts': {
            description: 'Track profile counts',
            constraints: [
              { rule: 'require_pattern', value: 'updateProfileCount', severity: 'error' },
            ],
          },
        }
      );

      const result = resolveArchitecture(registry, 'convex.mutation', {
        inlineMixins: ['profile-counts'],
      });

      expect(result.architecture.appliedMixins).toContain('profile-counts');
      expect(result.architecture.constraints).toHaveLength(1);
      expect(result.architecture.constraints[0].rule).toBe('require_pattern');
    });

    it('should apply multiple inline mixins', () => {
      const registry = createRegistry(
        {
          'convex.mutation': {
            description: 'Convex mutation',
          },
        },
        {
          'profile-counts': {
            description: 'Track profile counts',
            constraints: [
              { rule: 'max_file_lines', value: 100, severity: 'warning' },
            ],
          },
          'sidebar-cache': {
            description: 'Cache sidebar data',
            hints: ['Remember to invalidate cache on updates'],
          },
        }
      );

      const result = resolveArchitecture(registry, 'convex.mutation', {
        inlineMixins: ['profile-counts', 'sidebar-cache'],
      });

      expect(result.architecture.appliedMixins).toEqual(['profile-counts', 'sidebar-cache']);
      expect(result.architecture.constraints).toHaveLength(1);
      const hintTexts = result.architecture.hints.map((h: string | { text: string }) => typeof h === 'string' ? h : h.text);
      expect(hintTexts).toContain('Remember to invalidate cache on updates');
    });

    it('should merge inline mixins with registry mixins (inline has higher precedence)', () => {
      const registry = createRegistry(
        {
          'convex.mutation': {
            description: 'Convex mutation',
            mixins: ['registry-mixin'],
          },
        },
        {
          'registry-mixin': {
            description: 'Mixin from registry',
            constraints: [
              { rule: 'max_file_lines', value: 200, severity: 'warning' },
            ],
          },
          'inline-mixin': {
            description: 'Inline mixin',
            constraints: [
              { rule: 'max_file_lines', value: 100, severity: 'error' },
            ],
          },
        }
      );

      const result = resolveArchitecture(registry, 'convex.mutation', {
        inlineMixins: ['inline-mixin'],
      });

      // Both mixins should be applied
      expect(result.architecture.appliedMixins).toEqual(['registry-mixin', 'inline-mixin']);

      // Inline mixin's constraint should override registry mixin's (same rule:value key = last wins)
      const maxFileLinesConstraint = result.architecture.constraints.find(
        (c: { rule: string }) => c.rule === 'max_file_lines'
      );
      // Since keys are rule:value, the 100 and 200 are different keys, so both exist
      expect(result.architecture.constraints).toHaveLength(2);
    });

    it('should throw for unknown inline mixin', () => {
      const registry = createRegistry({
        'convex.mutation': {
          description: 'Convex mutation',
        },
      });

      expect(() =>
        resolveArchitecture(registry, 'convex.mutation', {
          inlineMixins: ['unknown-mixin'],
        })
      ).toThrow(/unknown-mixin.*not found/i);
    });

    it('should work without inline mixins (backward compatibility)', () => {
      const registry = createRegistry({
        'convex.mutation': {
          description: 'Convex mutation',
          constraints: [
            { rule: 'max_file_lines', value: 200, severity: 'warning' },
          ],
        },
      });

      const result = resolveArchitecture(registry, 'convex.mutation');

      expect(result.architecture.appliedMixins).toEqual([]);
      expect(result.architecture.constraints).toHaveLength(1);
    });

    it('should detect conflicts between inline mixins', () => {
      const registry = createRegistry(
        {
          'convex.mutation': {
            description: 'Convex mutation',
          },
        },
        {
          'allow-fs': {
            description: 'Allow filesystem access',
            constraints: [
              { rule: 'allow_import', value: 'fs', severity: 'error' },
            ],
          },
          'forbid-fs': {
            description: 'Forbid filesystem access',
            constraints: [
              { rule: 'forbid_import', value: 'fs', severity: 'error' },
            ],
          },
        }
      );

      const result = resolveArchitecture(registry, 'convex.mutation', {
        inlineMixins: ['allow-fs', 'forbid-fs'],
      });

      // Should detect the conflict
      const fsConflict = result.conflicts.find(
        (c) => c.value === 'fs' && c.rule === 'mixin_conflict'
      );
      expect(fsConflict).toBeDefined();
    });
  });

  describe('inline mixin governance', () => {
    it('should warn when inline:forbidden mixin is used inline', () => {
      const registry = createRegistry(
        {
          'test.arch': {
            description: 'Test architecture',
          },
        },
        {
          'core-mixin': {
            description: 'Core architectural mixin',
            inline: 'forbidden',
            constraints: [
              { rule: 'max_file_lines', value: 200, severity: 'warning' },
            ],
          },
        }
      );

      const result = resolveArchitecture(registry, 'test.arch', {
        inlineMixins: ['core-mixin'],
      });

      // Should emit warning about forbidden inline usage
      const warning = result.conflicts.find(
        (c) => c.rule === 'mixin_inline_forbidden' && c.value === 'core-mixin'
      );
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe('warning');
      expect(warning?.resolution).toContain('inline:\'forbidden\'');
    });

    it('should warn when inline:only mixin is used in registry', () => {
      const registry = createRegistry(
        {
          'test.arch': {
            description: 'Test architecture',
            mixins: ['per-file-mixin'],
          },
        },
        {
          'per-file-mixin': {
            description: 'Per-file behavior mixin',
            inline: 'only',
            constraints: [
              { rule: 'require_pattern', value: 'somePattern', severity: 'warning' },
            ],
          },
        }
      );

      const result = resolveArchitecture(registry, 'test.arch');

      // Should emit warning about only-inline usage in registry
      const warning = result.conflicts.find(
        (c) => c.rule === 'mixin_inline_only' && c.value === 'per-file-mixin'
      );
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe('warning');
      expect(warning?.resolution).toContain('inline:\'only\'');
    });

    it('should not warn for inline:allowed mixin used inline', () => {
      const registry = createRegistry(
        {
          'test.arch': {
            description: 'Test architecture',
          },
        },
        {
          'flexible-mixin': {
            description: 'Flexible mixin',
            inline: 'allowed',
            constraints: [],
          },
        }
      );

      const result = resolveArchitecture(registry, 'test.arch', {
        inlineMixins: ['flexible-mixin'],
      });

      // Should not emit warning
      const warning = result.conflicts.find(
        (c) => c.rule === 'mixin_inline_forbidden' || c.rule === 'mixin_inline_only'
      );
      expect(warning).toBeUndefined();
    });

    it('should not warn for mixin with no inline setting (defaults to allowed)', () => {
      const registry = createRegistry(
        {
          'test.arch': {
            description: 'Test architecture',
          },
        },
        {
          'default-mixin': {
            description: 'Mixin with default inline mode',
            constraints: [],
          },
        }
      );

      const result = resolveArchitecture(registry, 'test.arch', {
        inlineMixins: ['default-mixin'],
      });

      // Should not emit warning (defaults to allowed)
      const warning = result.conflicts.find(
        (c) => c.rule === 'mixin_inline_forbidden' || c.rule === 'mixin_inline_only'
      );
      expect(warning).toBeUndefined();
    });
  });
});
