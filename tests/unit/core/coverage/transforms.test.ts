/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test.unit
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
      expect(toPascalCase('bookmark.archived')).toBe('BookmarkArchived');
      expect(toPascalCase('user.created')).toBe('UserCreated');
    });

    it('should convert snake_case to PascalCase', () => {
      expect(toPascalCase('user_created')).toBe('UserCreated');
      expect(toPascalCase('bookmark_archived')).toBe('BookmarkArchived');
    });

    it('should convert camelCase to PascalCase', () => {
      expect(toPascalCase('userCreated')).toBe('UserCreated');
      expect(toPascalCase('bookmarkArchived')).toBe('BookmarkArchived');
    });

    it('should convert kebab-case to PascalCase', () => {
      expect(toPascalCase('user-created')).toBe('UserCreated');
      expect(toPascalCase('bookmark-archived')).toBe('BookmarkArchived');
    });

    it('should handle single words', () => {
      expect(toPascalCase('user')).toBe('User');
      expect(toPascalCase('User')).toBe('User');
    });
  });

  describe('toCamelCase', () => {
    it('should convert dot-separated to camelCase', () => {
      expect(toCamelCase('bookmark.archived')).toBe('bookmarkArchived');
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
      expect(toSnakeCase('bookmarkArchived')).toBe('bookmark_archived');
      expect(toSnakeCase('userCreated')).toBe('user_created');
    });

    it('should convert PascalCase to snake_case', () => {
      expect(toSnakeCase('BookmarkArchived')).toBe('bookmark_archived');
    });

    it('should convert dot-separated to snake_case', () => {
      expect(toSnakeCase('bookmark.archived')).toBe('bookmark_archived');
    });

    it('should convert kebab-case to snake_case', () => {
      expect(toSnakeCase('bookmark-archived')).toBe('bookmark_archived');
    });

    it('should handle single words', () => {
      expect(toSnakeCase('user')).toBe('user');
      expect(toSnakeCase('User')).toBe('user');
    });
  });

  describe('toUpperCase', () => {
    it('should convert to UPPER_CASE', () => {
      expect(toUpperCase('bookmark.archived')).toBe('BOOKMARK_ARCHIVED');
      expect(toUpperCase('bookmarkArchived')).toBe('BOOKMARK_ARCHIVED');
      expect(toUpperCase('user_created')).toBe('USER_CREATED');
    });
  });

  describe('toKebabCase', () => {
    it('should convert to kebab-case', () => {
      expect(toKebabCase('bookmarkArchived')).toBe('bookmark-archived');
      expect(toKebabCase('UserCreated')).toBe('user-created');
      expect(toKebabCase('user_created')).toBe('user-created');
    });
  });

  describe('applyTransform', () => {
    it('should return value unchanged when no transform', () => {
      expect(applyTransform('bookmark.archived')).toBe('bookmark.archived');
      expect(applyTransform('bookmark.archived', undefined)).toBe('bookmark.archived');
    });

    it('should apply ${value} transform (identity)', () => {
      expect(applyTransform('bookmark.archived', '${value}')).toBe('bookmark.archived');
    });

    it('should apply ${PascalCase} transform', () => {
      expect(applyTransform('bookmark.archived', '${PascalCase}')).toBe('BookmarkArchived');
    });

    it('should apply ${camelCase} transform', () => {
      expect(applyTransform('bookmark.archived', '${camelCase}')).toBe('bookmarkArchived');
    });

    it('should apply ${snake_case} transform', () => {
      expect(applyTransform('bookmarkArchived', '${snake_case}')).toBe('bookmark_archived');
    });

    it('should apply ${UPPER_CASE} transform', () => {
      expect(applyTransform('bookmark.archived', '${UPPER_CASE}')).toBe('BOOKMARK_ARCHIVED');
    });

    it('should apply ${kebab-case} transform', () => {
      expect(applyTransform('bookmarkArchived', '${kebab-case}')).toBe('bookmark-archived');
    });

    it('should apply custom template with transform', () => {
      expect(applyTransform('bookmark.archived', 'handle${PascalCase}')).toBe('handleBookmarkArchived');
      expect(applyTransform('user.created', 'on${PascalCase}Event')).toBe('onUserCreatedEvent');
    });

    it('should apply multiple transforms in template', () => {
      expect(applyTransform('bookmark.archived', '${PascalCase}_${UPPER_CASE}')).toBe('BookmarkArchived_BOOKMARK_ARCHIVED');
    });

    it('should handle literal text without placeholders', () => {
      expect(applyTransform('bookmark.archived', 'handle')).toBe('handle');
    });
  });
});
