/**
 * @arch archcodex.test.unit
 *
 * Tests for component groups registry loader and query functions.
 */
import { describe, it, expect } from 'vitest';
import {
  findComponentGroupsByEntity,
  findComponentGroupsByMutation,
  findComponentGroups,
  hasComponentGroups,
  listComponentGroupNames,
  getComponentGroup,
  formatComponentGroupForContext,
  expandChecklist,
  type ComponentGroupMatch,
} from '../../../../src/core/registry/component-groups.js';
import type { ComponentGroupsRegistry } from '../../../../src/core/registry/schema.js';

describe('Component Groups', () => {
  const sampleRegistry: ComponentGroupsRegistry = {
    'component-groups': {
      'order-cards': {
        description: 'Order card components',
        components: [
          { path: 'src/components/orders/TaskCard.tsx', renders: 'task' },
          { path: 'src/components/orders/NoteCard.tsx', renders: 'note' },
          { path: 'src/components/orders/DecisionCard.tsx', renders: 'decision' },
        ],
        triggers: {
          entities: ['orders', 'orderItems'],
          mutation_patterns: ['*Order', '*OrderItem*'],
        },
        related: {
          actions: 'src/actions/OrderActions.tsx',
          handlers: 'src/hooks/useOrderHandlers.ts',
        },
        warning: 'Ensure all 3 cards are updated together',
      },
      'user-cards': {
        description: 'User display components',
        components: [
          { path: 'src/components/UserCard.tsx', renders: 'full' },
          { path: 'src/components/UserAvatar.tsx', renders: 'avatar' },
        ],
        triggers: {
          entities: ['users'],
        },
      },
    },
  };

  const emptyRegistry: ComponentGroupsRegistry = {
    'component-groups': {},
  };

  describe('hasComponentGroups', () => {
    it('should return true when groups are defined', () => {
      expect(hasComponentGroups(sampleRegistry)).toBe(true);
    });

    it('should return false when no groups are defined', () => {
      expect(hasComponentGroups(emptyRegistry)).toBe(false);
    });
  });

  describe('listComponentGroupNames', () => {
    it('should return all group names', () => {
      const names = listComponentGroupNames(sampleRegistry);
      expect(names).toContain('order-cards');
      expect(names).toContain('user-cards');
      expect(names).toHaveLength(2);
    });

    it('should return empty array for empty registry', () => {
      const names = listComponentGroupNames(emptyRegistry);
      expect(names).toHaveLength(0);
    });
  });

  describe('getComponentGroup', () => {
    it('should return group definition by name', () => {
      const group = getComponentGroup(sampleRegistry, 'order-cards');
      expect(group).toBeDefined();
      expect(group?.components).toHaveLength(3);
      expect(group?.warning).toContain('3 cards');
    });

    it('should return undefined for non-existent group', () => {
      const group = getComponentGroup(sampleRegistry, 'non-existent');
      expect(group).toBeUndefined();
    });
  });

  describe('findComponentGroupsByEntity', () => {
    it('should find groups matching entity name exactly', () => {
      const matches = findComponentGroupsByEntity(sampleRegistry, 'orders');
      expect(matches).toHaveLength(1);
      expect(matches[0].name).toBe('order-cards');
    });

    it('should find groups matching entity name case-insensitively', () => {
      const matches = findComponentGroupsByEntity(sampleRegistry, 'Orders');
      expect(matches).toHaveLength(1);
      expect(matches[0].name).toBe('order-cards');
    });

    it('should return empty array when no entity matches', () => {
      const matches = findComponentGroupsByEntity(sampleRegistry, 'products');
      expect(matches).toHaveLength(0);
    });

    it('should match multiple entities in triggers', () => {
      const matches1 = findComponentGroupsByEntity(sampleRegistry, 'orderItems');
      const matches2 = findComponentGroupsByEntity(sampleRegistry, 'orders');
      expect(matches1).toHaveLength(1);
      expect(matches2).toHaveLength(1);
      expect(matches1[0].name).toBe(matches2[0].name);
    });
  });

  describe('findComponentGroupsByMutation', () => {
    it('should find groups matching mutation pattern *Entry', () => {
      const matches = findComponentGroupsByMutation(sampleRegistry, 'duplicateOrder');
      expect(matches).toHaveLength(1);
      expect(matches[0].name).toBe('order-cards');
    });

    it('should find groups matching mutation pattern *OrderItem*', () => {
      const matches = findComponentGroupsByMutation(sampleRegistry, 'updateOrderItemPosition');
      expect(matches).toHaveLength(1);
      expect(matches[0].name).toBe('order-cards');
    });

    it('should return empty array when no pattern matches', () => {
      const matches = findComponentGroupsByMutation(sampleRegistry, 'createUser');
      expect(matches).toHaveLength(0);
    });
  });

  describe('findComponentGroups', () => {
    it('should find groups by entity', () => {
      const matches = findComponentGroups(sampleRegistry, { entity: 'users' });
      expect(matches).toHaveLength(1);
      expect(matches[0].name).toBe('user-cards');
    });

    it('should find groups by mutation', () => {
      const matches = findComponentGroups(sampleRegistry, { mutation: 'deleteOrder' });
      expect(matches).toHaveLength(1);
      expect(matches[0].name).toBe('order-cards');
    });

    it('should find groups by both entity and mutation without duplicates', () => {
      const matches = findComponentGroups(sampleRegistry, {
        entity: 'orders',
        mutation: 'duplicateOrder',
      });
      // Both match the same group, should not duplicate
      expect(matches).toHaveLength(1);
      expect(matches[0].name).toBe('order-cards');
    });

    it('should return empty array when neither matches', () => {
      const matches = findComponentGroups(sampleRegistry, {
        entity: 'products',
        mutation: 'createProduct',
      });
      expect(matches).toHaveLength(0);
    });
  });

  describe('formatComponentGroupForContext', () => {
    it('should format group with all fields', () => {
      const match: ComponentGroupMatch = {
        name: 'order-cards',
        group: sampleRegistry['component-groups']['order-cards'],
      };

      const formatted = formatComponentGroupForContext(match);

      expect(formatted.group).toBe('order-cards');
      expect(formatted.warning).toContain('3 cards');
      expect(formatted.components).toHaveLength(3);
      expect(formatted.related).toEqual({
        actions: 'src/actions/OrderActions.tsx',
        handlers: 'src/hooks/useOrderHandlers.ts',
      });
    });

    it('should format group without optional fields', () => {
      const match: ComponentGroupMatch = {
        name: 'user-cards',
        group: sampleRegistry['component-groups']['user-cards'],
      };

      const formatted = formatComponentGroupForContext(match);

      expect(formatted.group).toBe('user-cards');
      expect(formatted.warning).toBeUndefined();
      expect(formatted.components).toHaveLength(2);
      expect(formatted.related).toBeUndefined();
    });

    it('should include renders info in components', () => {
      const match: ComponentGroupMatch = {
        name: 'order-cards',
        group: sampleRegistry['component-groups']['order-cards'],
      };

      const formatted = formatComponentGroupForContext(match);
      const components = formatted.components as Array<{ path: string; renders?: string }>;

      expect(components[0]).toEqual({ path: 'src/components/orders/TaskCard.tsx', renders: 'task' });
      expect(components[1]).toEqual({ path: 'src/components/orders/NoteCard.tsx', renders: 'note' });
    });
  });

  describe('expandChecklist', () => {
    it('should pass through flat array format', () => {
      const result = expandChecklist(['Step 1', 'Step 2'], sampleRegistry);

      expect(result.format).toBe('flat');
      expect(result.flat).toEqual(['Step 1', 'Step 2']);
      expect(result.backend).toBeUndefined();
      expect(result.frontend).toBeUndefined();
      expect(result.ui).toBeUndefined();
    });

    it('should handle structured format with sections', () => {
      const result = expandChecklist({
        backend: ['Create mutation', 'Add export'],
        frontend: ['Add hook', 'Add handler'],
      }, sampleRegistry);

      expect(result.format).toBe('structured');
      expect(result.backend).toEqual(['Create mutation', 'Add export']);
      expect(result.frontend).toEqual(['Add hook', 'Add handler']);
    });

    it('should handle structured format with simple UI array', () => {
      const result = expandChecklist({
        backend: ['Create mutation'],
        ui: ['Update component A', 'Update component B'],
      }, sampleRegistry);

      expect(result.format).toBe('structured');
      expect(result.ui).toEqual(['Update component A', 'Update component B']);
    });

    it('should expand component group reference', () => {
      const result = expandChecklist({
        backend: ['Create mutation'],
        ui: {
          from_component_group: 'order-cards',
          additional: ['Add to bulk toolbar'],
        },
      }, sampleRegistry);

      expect(result.format).toBe('structured');
      expect(result.ui).toBeDefined();
      expect(result.ui).toContain('Wire to ALL 3 order cards:');
      expect(result.ui?.some(item => item.includes('TaskCard'))).toBe(true);
      expect(result.ui?.some(item => item.includes('NoteCard'))).toBe(true);
      expect(result.ui?.some(item => item.includes('DecisionCard'))).toBe(true);
      expect(result.ui).toContain('Add to bulk toolbar');
    });

    it('should include static items from UI section', () => {
      const result = expandChecklist({
        ui: {
          items: ['Check accessibility', 'Verify responsive layout'],
        },
      }, sampleRegistry);

      expect(result.ui).toContain('Check accessibility');
      expect(result.ui).toContain('Verify responsive layout');
    });

    it('should add warning for missing component group', () => {
      const result = expandChecklist({
        ui: {
          from_component_group: 'nonexistent-group',
        },
      }, sampleRegistry);

      expect(result.ui).toBeDefined();
      expect(result.ui?.some(item => item.includes('Warning'))).toBe(true);
      expect(result.ui?.some(item => item.includes('nonexistent-group'))).toBe(true);
    });

    it('should omit empty sections', () => {
      const result = expandChecklist({
        backend: ['Create mutation'],
        frontend: [],
        ui: undefined,
      }, sampleRegistry);

      expect(result.backend).toEqual(['Create mutation']);
      expect(result.frontend).toBeUndefined();
      expect(result.ui).toBeUndefined();
    });

    it('should handle auto-match from triggers', () => {
      const result = expandChecklist({
        ui: {
          from_component_group: 'auto',
        },
      }, sampleRegistry, {
        entities: ['orders'],
      });

      expect(result.ui).toBeDefined();
      // Auto-match should find order-cards and expand it
      expect(result.ui?.some(item => item.includes('TaskCard'))).toBe(true);
    });

    it('should include renders info in expanded components', () => {
      const result = expandChecklist({
        ui: {
          from_component_group: 'order-cards',
        },
      }, sampleRegistry);

      expect(result.ui?.some(item => item.includes('(task)'))).toBe(true);
      expect(result.ui?.some(item => item.includes('(note)'))).toBe(true);
    });
  });
});
