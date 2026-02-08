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
 * applyTransform("product.archived", "handle${PascalCase}") // "handleProductArchived"
 * applyTransform("product.archived", "${snake_case}") // "product_archived"
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
 * - "product.archived" → "ProductArchived"
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
 * - "product.archived" → "productArchived"
 * - "UserCreated" → "userCreated"
 * - "user_created" → "userCreated"
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Convert to snake_case.
 * - "productArchived" → "product_archived"
 * - "ProductArchived" → "product_archived"
 * - "product.archived" → "product_archived"
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
 * - "product.archived" → "PRODUCT_ARCHIVED"
 * - "productArchived" → "PRODUCT_ARCHIVED"
 */
export function toUpperCase(str: string): string {
  return toSnakeCase(str).toUpperCase();
}

/**
 * Convert to kebab-case.
 * - "productArchived" → "product-archived"
 * - "UserCreated" → "user-created"
 * - "product_archived" → "product-archived"
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
