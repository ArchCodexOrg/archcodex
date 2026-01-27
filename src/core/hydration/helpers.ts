/**
 * @arch archcodex.util
 *
 * Helper functions for the HydrationEngine.
 * Extracted to keep engine.ts under line limit.
 */
import type { ResolvedConstraint } from '../registry/types.js';
import type { ResolvedHint } from '../registry/types.js';
import type { PatternRegistry } from '../patterns/types.js';
import type { PatternSuggestion } from './types.js';

/**
 * Extract forbidden/limit constraints.
 */
export function extractForbiddenConstraints(constraints: ResolvedConstraint[]): ResolvedConstraint[] {
  return constraints.filter(c =>
    c.rule.startsWith('forbid_') ||
    c.rule === 'max_file_lines' ||
    c.rule === 'max_public_methods'
  );
}

/**
 * Extract required constraints.
 */
export function extractRequiredConstraints(constraints: ResolvedConstraint[]): ResolvedConstraint[] {
  return constraints.filter(c =>
    c.rule.startsWith('require_') ||
    c.rule === 'must_extend' ||
    c.rule === 'implements'
  );
}

/**
 * Format constraint value for display.
 */
export function formatConstraintValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
}

/**
 * Group constraints by severity.
 */
export function groupConstraintsBySeverity(constraints: ResolvedConstraint[]): {
  error: ResolvedConstraint[];
  warning: ResolvedConstraint[];
} {
  return {
    error: constraints.filter((c) => c.severity === 'error'),
    warning: constraints.filter((c) => c.severity === 'warning'),
  };
}

/**
 * Estimate token count for a string.
 * Simple estimation: ~4 characters per token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Find pattern suggestion for a forbidden constraint.
 */
export function findPatternSuggestion(
  constraint: ResolvedConstraint,
  patternRegistry?: PatternRegistry
): PatternSuggestion | null {
  if (!patternRegistry || constraint.rule !== 'forbid_import') {
    return null;
  }

  const rawValues = Array.isArray(constraint.value)
    ? constraint.value
    : [constraint.value];
  // Only process string values (forbid_import always has strings)
  const forbiddenValues = rawValues.filter((v): v is string => typeof v === 'string');

  for (const [, pattern] of Object.entries(patternRegistry.patterns)) {
    const keywords = pattern.keywords || [];
    for (const forbidden of forbiddenValues) {
      if (keywords.some((kw: string) => kw.toLowerCase().includes(forbidden.toLowerCase()))) {
        return {
          file: pattern.canonical,
          export: pattern.exports?.[0] || 'default',
          description: pattern.usage,
        };
      }
    }
  }

  return null;
}

/**
 * Select architecture-specific hints, filtering out generic SOLID boilerplate.
 */
export function selectSharpHints(hints: ResolvedHint[], max: number): ResolvedHint[] {
  const genericPrefixes = ['[SRP]', '[OCP]', '[LSP]', '[ISP]', '[DIP]', '[DRY]', '[KISS]'];

  const specific = hints.filter(h =>
    !genericPrefixes.some(prefix => h.text.startsWith(prefix))
  );

  if (specific.length < max && hints.length > specific.length) {
    const remaining = hints.filter(h => !specific.includes(h));
    specific.push(...remaining.slice(0, max - specific.length));
  }

  return specific.slice(0, max);
}
