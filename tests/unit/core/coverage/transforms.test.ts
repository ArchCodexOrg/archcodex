/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Unit tests for coverage transform utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  applyTransform,
  toPascalCase,
  toCamelCase,
  toSnakeCase,
  toUpperCase,
  toKebabCase,
} from '../../../../src/core/coverage/transforms.js';

describe('Coverage Transforms', () => {
  describe('toPascalCase', () => {
    it('should convert dot-separated to PascalCase', () => {
      expect(toPascalCase('product.archived')).toBe('ProductArchived');
      expect(toPascalCase('user.created')).toBe('UserCreated');
    });

    it('should convert snake_case to PascalCase', () => {
      expect(toPascalCase('user_created')).toBe('UserCreated');
      expect(toPascalCase('product_archived')).toBe('ProductArchived');
    });

    it('should convert camelCase to PascalCase', () => {
      expect(toPascalCase('userCreated')).toBe('UserCreated');
      expect(toPascalCase('productArchived')).toBe('ProductArchived');
    });

    it('should convert kebab-case to PascalCase', () => {
      expect(toPascalCase('user-created')).toBe('UserCreated');
      expect(toPascalCase('product-archived')).toBe('ProductArchived');
    });

    it('should handle single words', () => {
      expect(toPascalCase('user')).toBe('User');
      expect(toPascalCase('User')).toBe('User');
    });
  });

  describe('toCamelCase', () => {
    it('should convert dot-separated to camelCase', () => {
      expect(toCamelCase('product.archived')).toBe('productArchived');
      expect(toCamelCase('user.created')).toBe('userCreated');
    });

    it('should convert snake_case to camelCase', () => {
      expect(toCamelCase('user_created')).toBe('userCreated');
    });

    it('should convert PascalCase to camelCase', () => {
      expect(toCamelCase('UserCreated')).toBe('userCreated');
    });

    it('should handle single words', () => {
      expect(toCamelCase('user')).toBe('user');
      expect(toCamelCase('User')).toBe('user');
    });
  });

  describe('toSnakeCase', () => {
    it('should convert camelCase to snake_case', () => {
      expect(toSnakeCase('productArchived')).toBe('product_archived');
      expect(toSnakeCase('userCreated')).toBe('user_created');
    });

    it('should convert PascalCase to snake_case', () => {
      expect(toSnakeCase('ProductArchived')).toBe('product_archived');
    });

    it('should convert dot-separated to snake_case', () => {
      expect(toSnakeCase('product.archived')).toBe('product_archived');
    });

    it('should convert kebab-case to snake_case', () => {
      expect(toSnakeCase('product-archived')).toBe('product_archived');
    });

    it('should handle single words', () => {
      expect(toSnakeCase('user')).toBe('user');
      expect(toSnakeCase('User')).toBe('user');
    });
  });

  describe('toUpperCase', () => {
    it('should convert to UPPER_CASE', () => {
      expect(toUpperCase('product.archived')).toBe('PRODUCT_ARCHIVED');
      expect(toUpperCase('productArchived')).toBe('PRODUCT_ARCHIVED');
      expect(toUpperCase('user_created')).toBe('USER_CREATED');
    });
  });

  describe('toKebabCase', () => {
    it('should convert to kebab-case', () => {
      expect(toKebabCase('productArchived')).toBe('product-archived');
      expect(toKebabCase('UserCreated')).toBe('user-created');
      expect(toKebabCase('user_created')).toBe('user-created');
    });
  });

  describe('applyTransform', () => {
    it('should return value unchanged when no transform', () => {
      expect(applyTransform('product.archived')).toBe('product.archived');
      expect(applyTransform('product.archived', undefined)).toBe('product.archived');
    });

    it('should apply ${value} transform (identity)', () => {
      expect(applyTransform('product.archived', '${value}')).toBe('product.archived');
    });

    it('should apply ${PascalCase} transform', () => {
      expect(applyTransform('product.archived', '${PascalCase}')).toBe('ProductArchived');
    });

    it('should apply ${camelCase} transform', () => {
      expect(applyTransform('product.archived', '${camelCase}')).toBe('productArchived');
    });

    it('should apply ${snake_case} transform', () => {
      expect(applyTransform('productArchived', '${snake_case}')).toBe('product_archived');
    });

    it('should apply ${UPPER_CASE} transform', () => {
      expect(applyTransform('product.archived', '${UPPER_CASE}')).toBe('PRODUCT_ARCHIVED');
    });

    it('should apply ${kebab-case} transform', () => {
      expect(applyTransform('productArchived', '${kebab-case}')).toBe('product-archived');
    });

    it('should apply custom template with transform', () => {
      expect(applyTransform('product.archived', 'handle${PascalCase}')).toBe('handleProductArchived');
      expect(applyTransform('user.created', 'on${PascalCase}Event')).toBe('onUserCreatedEvent');
    });

    it('should apply multiple transforms in template', () => {
      expect(applyTransform('product.archived', '${PascalCase}_${UPPER_CASE}')).toBe('ProductArchived_PRODUCT_ARCHIVED');
    });

    it('should handle literal text without placeholders', () => {
      expect(applyTransform('product.archived', 'handle')).toBe('handle');
    });
  });
});
