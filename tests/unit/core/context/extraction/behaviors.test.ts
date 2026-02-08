/**
 * @arch archcodex.test.unit
 *
 * Tests for behavior detector.
 */
import { describe, it, expect } from 'vitest';
import {
  detectBehaviors,
  detectBehaviorsForEntities,
} from '../../../../../src/core/context/extraction/behaviors.js';
import type { Field } from '../../../../../src/core/context/types.js';

describe('Behavior Detector', () => {
  describe('detectBehaviors', () => {
    it('should detect soft_delete from deletedAt field', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'deletedAt', type: 'number', optional: true },
      ];

      const result = detectBehaviors('todos', fields);

      expect(result.entity).toBe('todos');
      expect(result.behaviors).toHaveLength(1);
      expect(result.behaviors[0].type).toBe('soft_delete');
      expect(result.behaviors[0].fields).toContain('deletedAt');
    });

    it('should detect soft_delete from deleted_at field (snake_case)', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'deleted_at', type: 'timestamp', optional: true },
      ];

      const result = detectBehaviors('items', fields);

      expect(result.behaviors.some(b => b.type === 'soft_delete')).toBe(true);
    });

    it('should detect soft_delete from isDeleted field', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'isDeleted', type: 'boolean' },
      ];

      const result = detectBehaviors('items', fields);

      expect(result.behaviors.some(b => b.type === 'soft_delete')).toBe(true);
    });

    it('should detect ordering from position field', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'position', type: 'number' },
      ];

      const result = detectBehaviors('todos', fields);

      expect(result.behaviors.some(b => b.type === 'ordering')).toBe(true);
      const orderingBehavior = result.behaviors.find(b => b.type === 'ordering');
      expect(orderingBehavior!.fields).toContain('position');
    });

    it('should detect ordering from order field', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'order', type: 'number' },
      ];

      const result = detectBehaviors('items', fields);

      expect(result.behaviors.some(b => b.type === 'ordering')).toBe(true);
    });

    it('should detect ordering from sortOrder field', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'sortOrder', type: 'number' },
      ];

      const result = detectBehaviors('items', fields);

      expect(result.behaviors.some(b => b.type === 'ordering')).toBe(true);
    });

    it('should detect ordering from rank field', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'rank', type: 'number' },
      ];

      const result = detectBehaviors('items', fields);

      expect(result.behaviors.some(b => b.type === 'ordering')).toBe(true);
    });

    it('should detect audit_trail from createdAt field', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'createdAt', type: 'number' },
      ];

      const result = detectBehaviors('todos', fields);

      expect(result.behaviors.some(b => b.type === 'audit_trail')).toBe(true);
    });

    it('should detect audit_trail from created_at and updated_at fields', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'created_at', type: 'timestamp' },
        { name: 'updated_at', type: 'timestamp' },
      ];

      const result = detectBehaviors('items', fields);

      expect(result.behaviors.some(b => b.type === 'audit_trail')).toBe(true);
      const auditBehavior = result.behaviors.find(b => b.type === 'audit_trail');
      expect(auditBehavior!.fields).toContain('created_at');
      expect(auditBehavior!.fields).toContain('updated_at');
    });

    it('should NOT detect audit_trail from only updatedAt (no createdAt)', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'updatedAt', type: 'number' },
      ];

      const result = detectBehaviors('todos', fields);

      // Should not detect audit_trail without createdAt
      expect(result.behaviors.some(b => b.type === 'audit_trail')).toBe(false);
    });

    it('should detect optimistic_lock from version field', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'version', type: 'number' },
      ];

      const result = detectBehaviors('items', fields);

      expect(result.behaviors.some(b => b.type === 'optimistic_lock')).toBe(true);
    });

    it('should detect optimistic_lock from _version field', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: '_version', type: 'number' },
      ];

      const result = detectBehaviors('items', fields);

      expect(result.behaviors.some(b => b.type === 'optimistic_lock')).toBe(true);
    });

    it('should detect multiple behaviors', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'position', type: 'number' },
        { name: 'deletedAt', type: 'number', optional: true },
        { name: 'createdAt', type: 'number' },
        { name: 'updatedAt', type: 'number' },
        { name: 'version', type: 'number' },
      ];

      const result = detectBehaviors('todos', fields);

      expect(result.behaviors.some(b => b.type === 'soft_delete')).toBe(true);
      expect(result.behaviors.some(b => b.type === 'ordering')).toBe(true);
      expect(result.behaviors.some(b => b.type === 'audit_trail')).toBe(true);
      expect(result.behaviors.some(b => b.type === 'optimistic_lock')).toBe(true);
    });

    it('should return empty behaviors for entity without special fields', () => {
      const fields: Field[] = [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
      ];

      const result = detectBehaviors('users', fields);

      expect(result.behaviors).toHaveLength(0);
    });
  });

  describe('detectBehaviorsForEntities', () => {
    it('should detect behaviors for multiple entities', () => {
      const entities = [
        {
          name: 'todos',
          fields: [
            { name: 'id', type: 'string' },
            { name: 'position', type: 'number' },
          ],
        },
        {
          name: 'users',
          fields: [
            { name: 'id', type: 'string' },
            { name: 'deletedAt', type: 'number', optional: true },
          ],
        },
      ];

      const results = detectBehaviorsForEntities(entities);

      expect(results).toHaveLength(2);
      expect(results[0].entity).toBe('todos');
      expect(results[0].behaviors.some(b => b.type === 'ordering')).toBe(true);
      expect(results[1].entity).toBe('users');
      expect(results[1].behaviors.some(b => b.type === 'soft_delete')).toBe(true);
    });
  });
});
