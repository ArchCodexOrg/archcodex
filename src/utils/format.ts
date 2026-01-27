/**
 * @arch archcodex.util
 *
 * Formatting utilities for constraint values and other display purposes.
 */

export interface FormatOptions {
  /** Separator for array values (default: ',') */
  arraySeparator?: string;
  /** Wrap arrays in brackets (default: false) */
  wrapArrays?: boolean;
  /** How to format unknown objects (default: 'object') */
  objectFallback?: 'object' | 'json';
  /** Handle undefined values (default: convert to 'undefined') */
  handleUndefined?: boolean;
}

/**
 * Format a constraint value for display.
 * Handles arrays, objects with source_type, and primitives.
 */
/**
 * Create a unique key for a constraint (for deduplication/comparison).
 * Sorts arrays to ensure consistent keys regardless of order.
 */
export function makeConstraintKey(constraint: { rule: string; value: unknown }): string {
  const value = Array.isArray(constraint.value)
    ? [...constraint.value].sort().join(',')
    : String(constraint.value);
  return `${constraint.rule}:${value}`;
}

export function formatConstraintValue(value: unknown, options?: FormatOptions): string {
  const opts = {
    arraySeparator: options?.arraySeparator ?? ',',
    wrapArrays: options?.wrapArrays ?? false,
    objectFallback: options?.objectFallback ?? 'object',
    handleUndefined: options?.handleUndefined ?? false,
  };

  if (value === undefined) {
    return opts.handleUndefined ? '' : 'undefined';
  }

  if (Array.isArray(value)) {
    const joined = value.join(opts.arraySeparator);
    return opts.wrapArrays ? `[${joined}]` : joined;
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (obj.source_type) {
      return `coverage:${obj.source_type}`;
    }
    return opts.objectFallback === 'json' ? JSON.stringify(value) : 'object';
  }

  return String(value);
}
