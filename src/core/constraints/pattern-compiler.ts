/**
 * @arch archcodex.core.domain
 *
 * Pattern compiler - converts structured patterns to regex.
 * Provides LLM-friendly alternatives to writing raw regex patterns.
 */

import type { NamingStructured } from '../registry/schema.js';

/**
 * Case patterns for naming conventions.
 * Each maps to a regex pattern that matches that naming style.
 */
const CASE_PATTERNS: Record<string, string> = {
  PascalCase: '[A-Z][a-zA-Z0-9]*',
  camelCase: '[a-z][a-zA-Z0-9]*',
  snake_case: '[a-z][a-z0-9]*(?:_[a-z0-9]+)*',
  UPPER_CASE: '[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*',
  'kebab-case': '[a-z][a-z0-9]*(?:-[a-z0-9]+)*',
};

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile a structured naming pattern to a regex string.
 *
 * @example
 * // Returns: ^[A-Z][a-zA-Z0-9]*Service\.ts$
 * compileNamingPattern({ case: 'PascalCase', suffix: 'Service', extension: '.ts' })
 *
 * @example
 * // Returns: ^I[A-Z][a-zA-Z0-9]*\.ts$
 * compileNamingPattern({ case: 'PascalCase', prefix: 'I', extension: '.ts' })
 */
export function compileNamingPattern(naming: NamingStructured): string {
  const parts: string[] = ['^'];

  // Add prefix if specified (literal match)
  if (naming.prefix) {
    parts.push(escapeRegex(naming.prefix));
  }

  // Add case pattern (default to PascalCase if not specified)
  const casePattern = naming.case ? CASE_PATTERNS[naming.case] : CASE_PATTERNS.PascalCase;
  parts.push(casePattern);

  // Add suffix if specified (literal match)
  if (naming.suffix) {
    parts.push(escapeRegex(naming.suffix));
  }

  // Add extension if specified (literal match)
  if (naming.extension) {
    parts.push(escapeRegex(naming.extension));
  }

  parts.push('$');
  return parts.join('');
}

/**
 * Validate that a structured naming pattern is well-formed.
 * Returns an error message if invalid, null if valid.
 */
export function validateNamingPattern(naming: NamingStructured): string | null {
  if (naming.case && !CASE_PATTERNS[naming.case]) {
    return `Invalid case: ${naming.case}. Valid options: ${Object.keys(CASE_PATTERNS).join(', ')}`;
  }

  // At least one field should be specified
  if (!naming.case && !naming.prefix && !naming.suffix && !naming.extension) {
    return 'Naming pattern must specify at least one of: case, prefix, suffix, extension';
  }

  return null;
}

/**
 * Generate a human-readable description of a naming pattern.
 * Used for error messages.
 */
export function describeNamingPattern(naming: NamingStructured): string {
  const parts: string[] = [];

  if (naming.prefix) {
    parts.push(`prefix "${naming.prefix}"`);
  }

  if (naming.case) {
    parts.push(naming.case);
  }

  if (naming.suffix) {
    parts.push(`suffix "${naming.suffix}"`);
  }

  if (naming.extension) {
    parts.push(`extension "${naming.extension}"`);
  }

  return parts.join(', ');
}
