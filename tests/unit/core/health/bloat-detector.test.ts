/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  detectSimilarArchitectures,
  detectRedundantArchitectures,
  detectDeepInheritance,
  detectLowUsageArchitectures,
} from '../../../../src/core/health/bloat-detector.js';
import type { Registry } from '../../../../src/core/registry/schema.js';
import type { ArchUsage } from '../../../../src/core/health/types.js';

describe('bloat-detector', () => {
  describe('detectSimilarArchitectures', () => {
    it('should detect architectures with similar constraints', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: {
            description: 'Base',
            constraints: [{ rule: 'max_file_lines', value: 500 }],
          },
          'sibling.a': {
            description: 'Sibling A',
            inherits: 'base',
            constraints: [
              { rule: 'forbid_import', value: ['lodash'] },
              { rule: 'forbid_import', value: ['axios'] },
            ],
          },
          'sibling.b': {
            description: 'Sibling B',
            inherits: 'base',
            constraints: [
              { rule: 'forbid_import', value: ['lodash'] },
              { rule: 'forbid_import', value: ['axios'] },
            ],
          },
        },
        mixins: {},
      };

      const archIds = ['base', 'sibling.a', 'sibling.b'];
      const similar = detectSimilarArchitectures(registry, archIds);

      expect(similar).toHaveLength(1);
      expect(similar[0].archId1).toBe('sibling.a');
      expect(similar[0].archId2).toBe('sibling.b');
      expect(similar[0].similarity).toBe(1);
    });

    it('should not flag dissimilar siblings', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: { description: 'Base' },
          'sibling.a': {
            description: 'Sibling A',
            inherits: 'base',
            constraints: [{ rule: 'forbid_import', value: ['lodash'] }],
          },
          'sibling.b': {
            description: 'Sibling B',
            inherits: 'base',
            constraints: [{ rule: 'max_file_lines', value: 300 }],
          },
        },
        mixins: {},
      };

      const archIds = ['base', 'sibling.a', 'sibling.b'];
      const similar = detectSimilarArchitectures(registry, archIds);

      expect(similar).toHaveLength(0);
    });
  });

  describe('detectRedundantArchitectures', () => {
    it('should detect leaf nodes with no value', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: {
            description: 'Base',
            constraints: [{ rule: 'max_file_lines', value: 500 }],
          },
          'empty.child': {
            description: 'Empty child',
            inherits: 'base',
            // No constraints, mixins, hints, or pointers
          },
        },
        mixins: {},
      };

      const archIds = ['base', 'empty.child'];
      const redundant = detectRedundantArchitectures(registry, archIds);

      expect(redundant).toHaveLength(1);
      expect(redundant[0].archId).toBe('empty.child');
      expect(redundant[0].parentArchId).toBe('base');
    });

    it('should not flag nodes with constraints', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: { description: 'Base' },
          'child.with.constraints': {
            description: 'Child with constraints',
            inherits: 'base',
            constraints: [{ rule: 'forbid_import', value: ['axios'] }],
          },
        },
        mixins: {},
      };

      const archIds = ['base', 'child.with.constraints'];
      const redundant = detectRedundantArchitectures(registry, archIds);

      expect(redundant).toHaveLength(0);
    });

    it('should not flag nodes that are inherited by others', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: { description: 'Base' },
          middle: {
            description: 'Middle node',
            inherits: 'base',
            // No direct constraints
          },
          leaf: {
            description: 'Leaf node',
            inherits: 'middle',
            constraints: [{ rule: 'max_file_lines', value: 200 }],
          },
        },
        mixins: {},
      };

      const archIds = ['base', 'middle', 'leaf'];
      const redundant = detectRedundantArchitectures(registry, archIds);

      // 'middle' should not be flagged because 'leaf' inherits from it
      expect(redundant).toHaveLength(0);
    });
  });

  describe('detectDeepInheritance', () => {
    it('should detect chains deeper than 4 levels (default threshold)', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: { description: 'Base' },
          level1: { description: 'Level 1', inherits: 'base' },
          level2: { description: 'Level 2', inherits: 'level1' },
          level3: { description: 'Level 3', inherits: 'level2' },
          level4: { description: 'Level 4', inherits: 'level3' },
        },
        mixins: {},
      };

      const archIds = ['base', 'level1', 'level2', 'level3', 'level4'];
      const deep = detectDeepInheritance(registry, archIds);

      expect(deep).toHaveLength(1);
      expect(deep[0].archId).toBe('level4');
      expect(deep[0].depth).toBe(5);
      expect(deep[0].chain).toEqual(['base', 'level1', 'level2', 'level3', 'level4']);
    });

    it('should not flag chains of 3 or fewer levels', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: { description: 'Base' },
          level1: { description: 'Level 1', inherits: 'base' },
          level2: { description: 'Level 2', inherits: 'level1' },
        },
        mixins: {},
      };

      const archIds = ['base', 'level1', 'level2'];
      const deep = detectDeepInheritance(registry, archIds);

      expect(deep).toHaveLength(0);
    });
  });

  describe('detectLowUsageArchitectures', () => {
    it('should flag single-file architectures as warning', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: { description: 'Base' },
          'single.file': { description: 'Single file', inherits: 'base' },
        },
        mixins: {},
      };

      const archUsage: ArchUsage[] = [
        { archId: 'single.file', fileCount: 1 },
      ];

      const lowUsage = detectLowUsageArchitectures(archUsage, registry);

      expect(lowUsage).toHaveLength(1);
      expect(lowUsage[0].archId).toBe('single.file');
      expect(lowUsage[0].fileCount).toBe(1);
      expect(lowUsage[0].severity).toBe('warning');
    });

    it('should flag two-file architectures as info', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: { description: 'Base' },
          'two.files': { description: 'Two files', inherits: 'base' },
        },
        mixins: {},
      };

      const archUsage: ArchUsage[] = [
        { archId: 'two.files', fileCount: 2 },
      ];

      const lowUsage = detectLowUsageArchitectures(archUsage, registry);

      expect(lowUsage).toHaveLength(1);
      expect(lowUsage[0].severity).toBe('info');
    });

    it('should not flag architectures above threshold', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: { description: 'Base' },
          'many.files': { description: 'Many files', inherits: 'base' },
        },
        mixins: {},
      };

      const archUsage: ArchUsage[] = [
        { archId: 'many.files', fileCount: 10 },
      ];

      const lowUsage = detectLowUsageArchitectures(archUsage, registry);

      expect(lowUsage).toHaveLength(0);
    });

    it('should not flag architectures that are inherited by others', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: { description: 'Base' },
          parent: { description: 'Parent', inherits: 'base' },
          child: { description: 'Child', inherits: 'parent' },
        },
        mixins: {},
      };

      const archUsage: ArchUsage[] = [
        { archId: 'parent', fileCount: 1 },  // Low usage but has children
        { archId: 'child', fileCount: 5 },
      ];

      const lowUsage = detectLowUsageArchitectures(archUsage, registry);

      // 'parent' should not be flagged because 'child' inherits from it
      expect(lowUsage).toHaveLength(0);
    });

    it('should respect custom threshold', () => {
      const registry: Registry = {
        version: '1.0',
        nodes: {
          base: { description: 'Base' },
          'three.files': { description: 'Three files', inherits: 'base' },
        },
        mixins: {},
      };

      const archUsage: ArchUsage[] = [
        { archId: 'three.files', fileCount: 3 },
      ];

      // Default threshold (2) should not flag it
      expect(detectLowUsageArchitectures(archUsage, registry)).toHaveLength(0);

      // Custom threshold (3) should flag it
      expect(detectLowUsageArchitectures(archUsage, registry, { lowUsageThreshold: 3 })).toHaveLength(1);
    });
  });
});
