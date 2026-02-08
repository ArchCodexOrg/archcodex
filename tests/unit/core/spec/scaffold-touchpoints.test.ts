/**
 * @arch archcodex.test.unit
 *
 * Tests for scaffold touchpoints generation.
 * @see spec.archcodex.scaffoldTouchpoints in .arch/specs/archcodex/scaffold-touchpoints.spec.yaml
 */
import { describe, it, expect } from 'vitest';
import {
  deriveHandlerName,
  extractOperationFromSpecId,
  generateTouchpointsFromMatch,
  generateTouchpointsFromRegistry,
  generateTouchpointsYaml,
  generateSpecWithTouchpoints,
  type UITouchpoint,
} from '../../../../src/core/spec/scaffold-touchpoints.js';
import type { ComponentGroupsRegistry, ComponentGroupDefinition } from '../../../../src/core/registry/schema.js';

describe('Scaffold Touchpoints', () => {
  // Sample component group for testing
  const sampleGroup: ComponentGroupDefinition = {
    description: 'Order card components',
    components: [
      { path: 'src/components/orders/TaskCard.tsx', renders: 'task' },
      { path: 'src/components/orders/NoteCard.tsx', renders: 'note' },
      { path: 'src/components/orders/DecisionCard.tsx', renders: 'decision' },
    ],
    triggers: {
      entities: ['orders'],
      mutation_patterns: ['*Order'],
    },
    warning: 'Ensure all cards are updated together',
  };

  const sampleRegistry: ComponentGroupsRegistry = {
    'component-groups': {
      'order-cards': sampleGroup,
    },
  };

  describe('deriveHandlerName', () => {
    it('derives handler from lowercase operation', () => {
      expect(deriveHandlerName('duplicate')).toBe('handleDuplicate');
    });

    it('handles already capitalized operation', () => {
      expect(deriveHandlerName('Archive')).toBe('handleArchive');
    });

    it('preserves camelCase in operation', () => {
      expect(deriveHandlerName('bulkDelete')).toBe('handleBulkDelete');
    });

    it('handles single character operation', () => {
      expect(deriveHandlerName('x')).toBe('handleX');
    });
  });

  describe('extractOperationFromSpecId', () => {
    it('extracts operation from spec ID', () => {
      expect(extractOperationFromSpecId('spec.orders.duplicate')).toBe('duplicate');
    });

    it('removes Entry suffix', () => {
      expect(extractOperationFromSpecId('spec.product.archiveEntry')).toBe('archive');
    });

    it('removes Item suffix', () => {
      expect(extractOperationFromSpecId('spec.cart.deleteItem')).toBe('delete');
    });

    it('returns undefined for single-part spec ID', () => {
      expect(extractOperationFromSpecId('spec')).toBeUndefined();
    });

    it('handles spec ID without suffix', () => {
      expect(extractOperationFromSpecId('spec.user.create')).toBe('create');
    });
  });

  describe('generateTouchpointsFromMatch', () => {
    it('generates touchpoints for each component', () => {
      const result = generateTouchpointsFromMatch(
        { name: 'order-cards', group: sampleGroup },
        'duplicate'
      );

      expect(result.touchpoints).toHaveLength(3);
      expect(result.componentGroup).toBe('order-cards');
    });

    it('includes handler in touchpoints when operation provided', () => {
      const result = generateTouchpointsFromMatch(
        { name: 'order-cards', group: sampleGroup },
        'duplicate'
      );

      expect(result.touchpoints[0].handler).toBe('handleDuplicate');
    });

    it('omits handler when no operation provided', () => {
      const result = generateTouchpointsFromMatch(
        { name: 'order-cards', group: sampleGroup }
      );

      expect(result.touchpoints[0].handler).toBeUndefined();
    });

    it('extracts component names from paths', () => {
      const result = generateTouchpointsFromMatch(
        { name: 'order-cards', group: sampleGroup }
      );

      expect(result.touchpoints[0].component).toBe('TaskCard');
      expect(result.touchpoints[1].component).toBe('NoteCard');
    });

    it('sets default values for touchpoints', () => {
      const result = generateTouchpointsFromMatch(
        { name: 'order-cards', group: sampleGroup }
      );

      expect(result.touchpoints[0].location).toBe('context menu');
      expect(result.touchpoints[0].wired).toBe(false);
      expect(result.touchpoints[0].priority).toBe('required');
    });

    it('includes warning from component group', () => {
      const result = generateTouchpointsFromMatch(
        { name: 'order-cards', group: sampleGroup }
      );

      expect(result.warning).toContain('cards');
    });
  });

  describe('generateTouchpointsFromRegistry', () => {
    it('finds component group by entity', () => {
      const result = generateTouchpointsFromRegistry(
        sampleRegistry,
        'orders',
        'duplicate'
      );

      expect(result.touchpoints).toHaveLength(3);
      expect(result.componentGroup).toBe('order-cards');
    });

    it('returns empty touchpoints for unknown entity', () => {
      const result = generateTouchpointsFromRegistry(
        sampleRegistry,
        'unknownEntity',
        'test'
      );

      expect(result.touchpoints).toHaveLength(0);
      expect(result.componentGroup).toBeUndefined();
    });

    it('handles empty registry', () => {
      const emptyRegistry: ComponentGroupsRegistry = {
        'component-groups': {},
      };

      const result = generateTouchpointsFromRegistry(
        emptyRegistry,
        'orders',
        'test'
      );

      expect(result.touchpoints).toHaveLength(0);
    });
  });

  describe('generateTouchpointsYaml', () => {
    it('generates YAML for touchpoints array', () => {
      const touchpoints: UITouchpoint[] = [
        {
          component: 'TaskCard',
          location: 'context menu',
          handler: 'handleDuplicate',
          wired: false,
          priority: 'required',
        },
      ];

      const yaml = generateTouchpointsYaml(touchpoints);

      expect(yaml).toContain('touchpoints:');
      expect(yaml).toContain('component: TaskCard');
      expect(yaml).toContain('location: context menu');
      expect(yaml).toContain('handler: handleDuplicate');
    });

    it('omits wired when false (default)', () => {
      const touchpoints: UITouchpoint[] = [
        {
          component: 'TaskCard',
          wired: false,
          priority: 'required',
        },
      ];

      const yaml = generateTouchpointsYaml(touchpoints);

      expect(yaml).not.toContain('wired:');
    });

    it('includes wired when true', () => {
      const touchpoints: UITouchpoint[] = [
        {
          component: 'TaskCard',
          wired: true,
          priority: 'required',
        },
      ];

      const yaml = generateTouchpointsYaml(touchpoints);

      expect(yaml).toContain('wired: true');
    });

    it('omits priority when required (default)', () => {
      const touchpoints: UITouchpoint[] = [
        {
          component: 'TaskCard',
          wired: false,
          priority: 'required',
        },
      ];

      const yaml = generateTouchpointsYaml(touchpoints);

      expect(yaml).not.toContain('priority:');
    });

    it('includes priority when optional', () => {
      const touchpoints: UITouchpoint[] = [
        {
          component: 'TaskCard',
          wired: false,
          priority: 'optional',
        },
      ];

      const yaml = generateTouchpointsYaml(touchpoints);

      expect(yaml).toContain('priority: optional');
    });

    it('returns empty string for empty array', () => {
      const yaml = generateTouchpointsYaml([]);

      expect(yaml).toBe('');
    });
  });

  describe('generateSpecWithTouchpoints', () => {
    it('generates spec YAML with touchpoints', () => {
      const yaml = generateSpecWithTouchpoints(
        'spec.orders.duplicateEntry',
        'orders',
        sampleRegistry
      );

      expect(yaml).toContain('spec.orders.duplicateEntry:');
      expect(yaml).toContain('touchpoints:');
      expect(yaml).toContain('component: TaskCard');
    });

    it('derives operation from spec ID', () => {
      const yaml = generateSpecWithTouchpoints(
        'spec.orders.duplicateEntry',
        'orders',
        sampleRegistry
      );

      expect(yaml).toContain('handler: handleDuplicate');
    });

    it('includes warning as comment', () => {
      const yaml = generateSpecWithTouchpoints(
        'spec.orders.duplicateEntry',
        'orders',
        sampleRegistry
      );

      expect(yaml).toContain('WARNING:');
    });

    it('generates valid YAML structure', () => {
      const yaml = generateSpecWithTouchpoints(
        'spec.orders.duplicateEntry',
        'orders',
        sampleRegistry
      );

      expect(yaml).toContain('inherits: spec.function');
      expect(yaml).toContain('intent:');
      expect(yaml).toContain('inputs:');
      expect(yaml).toContain('outputs:');
      expect(yaml).toContain('examples:');
    });
  });

  describe('touchpoints invariants', () => {
    it('all touchpoints have wired=false initially', () => {
      const result = generateTouchpointsFromMatch(
        { name: 'order-cards', group: sampleGroup },
        'duplicate'
      );

      expect(result.touchpoints.every(tp => tp.wired === false)).toBe(true);
    });

    it('touchpoint count matches component group size', () => {
      const result = generateTouchpointsFromMatch(
        { name: 'order-cards', group: sampleGroup },
        'duplicate'
      );

      expect(result.touchpoints).toHaveLength(sampleGroup.components.length);
    });

    it('handler is derived from operation when provided', () => {
      const result = generateTouchpointsFromMatch(
        { name: 'order-cards', group: sampleGroup },
        'archive'
      );

      expect(result.touchpoints.every(tp => tp.handler === 'handleArchive')).toBe(true);
    });
  });
});
