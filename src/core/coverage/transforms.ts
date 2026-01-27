/**
 * @arch archcodex.util
 *
 * String transform utilities for coverage validation.
 * Converts source values to different naming conventions.
 */

/**
 * Transform placeholders supported in target patterns.
 */
const TRANSFORM_PLACEHOLDERS = {
  '${value}': (s: string) => s,
  '${PascalCase}': toPascalCase,
  '${camelCase}': toCamelCase,
  '${snake_case}': toSnakeCase,
  '${UPPER_CASE}': toUpperCase,
  '${kebab-case}': toKebabCase,
} as const;

/**
 * Apply a transform template to a value.
 *
 * @example
 * applyTransform("bookmark.archived", "handle${PascalCase}") // "handleBookmarkArchived"
 * applyTransform("bookmark.archived", "${snake_case}") // "bookmark_archived"
 * applyTransform("UserEvent", "${value}Handler") // "UserEventHandler"
 */
export function applyTransform(value: string, transform?: string): string {
  if (!transform) {
    return value;
  }

  let result = transform;

  // Replace all transform placeholders
  for (const [placeholder, fn] of Object.entries(TRANSFORM_PLACEHOLDERS)) {
    if (result.includes(placeholder)) {
      result = result.replace(new RegExp(escapeRegex(placeholder), 'g'), fn(value));
    }
  }

  return result;
}

/**
 * Convert to PascalCase.
 * - "bookmark.archived" → "BookmarkArchived"
 * - "user_created" → "UserCreated"
 * - "userCreated" → "UserCreated"
 * - "user-created" → "UserCreated"
 */
export function toPascalCase(str: string): string {
  return str
    // Split on dots, underscores, hyphens, or camelCase boundaries
    .split(/[._-]|(?=[A-Z])/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert to camelCase.
 * - "bookmark.archived" → "bookmarkArchived"
 * - "UserCreated" → "userCreated"
 * - "user_created" → "userCreated"
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Convert to snake_case.
 * - "bookmarkArchived" → "bookmark_archived"
 * - "BookmarkArchived" → "bookmark_archived"
 * - "bookmark.archived" → "bookmark_archived"
 */
export function toSnakeCase(str: string): string {
  return str
    // Insert underscore before uppercase letters
    .replace(/([A-Z])/g, '_$1')
    // Replace dots, hyphens with underscores
    .replace(/[.-]/g, '_')
    // Remove leading underscore
    .replace(/^_/, '')
    // Convert to lowercase
    .toLowerCase()
    // Remove duplicate underscores
    .replace(/_+/g, '_');
}

/**
 * Convert to UPPER_CASE (screaming snake case).
 * - "bookmark.archived" → "BOOKMARK_ARCHIVED"
 * - "bookmarkArchived" → "BOOKMARK_ARCHIVED"
 */
export function toUpperCase(str: string): string {
  return toSnakeCase(str).toUpperCase();
}

/**
 * Convert to kebab-case.
 * - "bookmarkArchived" → "bookmark-archived"
 * - "UserCreated" → "user-created"
 * - "bookmark_archived" → "bookmark-archived"
 */
export function toKebabCase(str: string): string {
  return toSnakeCase(str).replace(/_/g, '-');
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
