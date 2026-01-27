/**
 * @arch archcodex.core.domain.constraint
 *
 * Shared utilities for pattern-based constraints (forbid_pattern, require_pattern, forbid_call).
 */
import type { FunctionCallInfo } from '../../validators/semantic.types.js';

/**
 * Extract the pattern string from a constraint.
 * Prefers explicit pattern field, falls back to value if it's a string.
 */
export function getPatternFromConstraint(constraint: { pattern?: string; value: unknown }): string | null {
  // Prefer explicit pattern field
  if ('pattern' in constraint && typeof constraint.pattern === 'string') {
    return constraint.pattern;
  }

  // Fallback to value if it's a string
  if (typeof constraint.value === 'string') {
    return constraint.value;
  }

  return null;
}

/**
 * Check if a function call matches a pattern.
 * Supports:
 * - Exact match: "setTimeout" matches setTimeout()
 * - Wildcard: "api.*" matches api.fetch(), api.post()
 * - Deep wildcard: "api.**" matches api.foo.bar()
 * - Regex: "/^debug\./" matches debug.print()
 */
export function matchesCallPattern(call: FunctionCallInfo, pattern: string): boolean {
  // Exact match on callee or methodName
  if (call.callee === pattern || call.methodName === pattern) {
    return true;
  }

  // Deep wildcard: api.** matches api.foo, api.foo.bar, etc.
  if (pattern.endsWith('.**')) {
    const prefix = pattern.slice(0, -3);
    return call.callee.startsWith(prefix + '.') || call.callee === prefix;
  }

  // Single wildcard: api.* matches api.foo but not api.foo.bar
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return call.receiver === prefix;
  }

  // Regex pattern (advanced)
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    try {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(call.callee);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Find the first pattern that matches a call from a list of patterns.
 */
export function findMatchingCallPattern(call: FunctionCallInfo, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (matchesCallPattern(call, pattern)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Check if a call matches a pattern, with optional pattern (returns true if no pattern).
 * Used by require_companion_call where an empty pattern means "match all".
 */
export function matchesOptionalCallPattern(call: FunctionCallInfo, pattern?: string): boolean {
  if (!pattern) return true;
  return matchesCallPattern(call, pattern);
}
