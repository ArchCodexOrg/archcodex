/**
 * @arch archcodex.util
 *
 * Shared pattern matching utility with ReDoS protection.
 * Used by intent validation, require_one_of, and other pattern-based constraints.
 */

import { logger as log } from './logger.js';

/** Maximum time in milliseconds for regex execution before timeout. */
const REGEX_TIMEOUT_MS = 100;

/** Maximum pattern length to prevent catastrophic backtracking. */
const MAX_PATTERN_LENGTH = 5000;

/** Patterns known to cause catastrophic backtracking. */
const DANGEROUS_PATTERNS = [
  /\(\.\*\)\+/,      // (.*)+
  /\(\.\+\)\+/,      // (.+)+
  /\([^)]*\+\)\+/,   // (a+)+
  /\([^)]*\*\)\*/,   // (a*)*
];

export interface PatternMatchResult {
  /** Whether the pattern matched */
  matched: boolean;
  /** Line number where match occurred (1-indexed) */
  line?: number;
  /** Column number where match occurred (1-indexed) */
  column?: number;
  /** The matched text */
  matchedText?: string;
  /** Error message if pattern validation failed */
  error?: string;
}

/**
 * Validate a pattern for potential ReDoS vulnerabilities.
 * Returns an error message if the pattern is dangerous.
 */
export function validatePattern(pattern: string): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `Pattern exceeds maximum length of ${MAX_PATTERN_LENGTH} characters`;
  }

  // Check for known dangerous patterns
  for (const dangerous of DANGEROUS_PATTERNS) {
    if (dangerous.test(pattern)) {
      return `Pattern contains potentially dangerous construct that could cause ReDoS`;
    }
  }

  return null;
}

/**
 * Parse a pattern string into its components.
 * Supports formats:
 * - `/pattern/flags` - explicit regex with flags
 * - `pattern` - implicit regex or literal string
 */
function parsePattern(pattern: string): { regex: string; flags: string; isExplicit: boolean } | null {
  // Explicit regex format: /pattern/flags
  if (pattern.startsWith('/')) {
    const match = pattern.match(/^\/(.+)\/([gimsuvy]*)$/);
    if (match) {
      return { regex: match[1], flags: match[2] || 'ms', isExplicit: true };
    }
    // Invalid explicit regex format
    return null;
  }

  // Implicit regex (will be treated as regex pattern with multiline/dotall)
  return { regex: pattern, flags: 'ms', isExplicit: false };
}

/**
 * Execute a regex test with timing tracking.
 * Logs a warning if the regex takes too long.
 */
function timedRegexTest(regex: RegExp, content: string): boolean {
  const start = performance.now();
  const result = regex.test(content);
  const elapsed = performance.now() - start;

  if (elapsed > REGEX_TIMEOUT_MS) {
    log.warn(`Slow regex detected (${elapsed.toFixed(0)}ms): ${regex.source.substring(0, 50)}...`);
  }

  return result;
}

/**
 * Execute a regex and return match information with timing tracking.
 */
function timedRegexMatch(regex: RegExp, content: string): RegExpMatchArray | null {
  const start = performance.now();
  const result = regex.exec(content);
  const elapsed = performance.now() - start;

  if (elapsed > REGEX_TIMEOUT_MS) {
    log.warn(`Slow regex detected (${elapsed.toFixed(0)}ms): ${regex.source.substring(0, 50)}...`);
  }

  return result;
}

/**
 * Check if a pattern matches content.
 * Supports regex patterns (/pattern/flags) and literal strings.
 * Includes ReDoS protection via pattern validation and timing tracking.
 *
 * @param pattern - The pattern to match (regex or literal)
 * @param content - The content to search in
 * @returns true if pattern matches, false otherwise
 */
export function patternMatches(pattern: string, content: string): boolean {
  // Validate pattern safety
  const validationError = validatePattern(pattern);
  if (validationError) {
    log.warn(`Pattern validation failed: ${validationError}`);
    return false;
  }

  const parsed = parsePattern(pattern);

  if (parsed) {
    try {
      const regex = new RegExp(parsed.regex, parsed.flags);
      return timedRegexTest(regex, content);
    } catch {
      // If explicit regex failed, return false
      if (parsed.isExplicit) {
        return false;
      }
      // For implicit patterns, fall back to literal match
    }
  }

  // Fallback: literal string match
  return content.includes(pattern);
}

/**
 * Find where a pattern matches in content.
 * Returns line and column information for error reporting.
 *
 * @param pattern - The pattern to match (regex or literal)
 * @param content - The content to search in
 * @returns Match result with location info, or null if not found
 */
export function findPatternMatch(pattern: string, content: string): PatternMatchResult {
  // Validate pattern safety
  const validationError = validatePattern(pattern);
  if (validationError) {
    return { matched: false, error: validationError };
  }

  const parsed = parsePattern(pattern);

  if (parsed) {
    try {
      const regex = new RegExp(parsed.regex, parsed.flags);
      const result = timedRegexMatch(regex, content);

      if (result && result.index !== undefined) {
        const beforeMatch = content.substring(0, result.index);
        const lines = beforeMatch.split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length + 1;

        return {
          matched: true,
          line,
          column,
          matchedText: result[0],
        };
      }
    } catch {
      // If explicit regex failed, return not matched
      if (parsed.isExplicit) {
        return { matched: false };
      }
      // For implicit patterns, fall back to literal match
    }
  }

  // Fallback: literal string match
  const index = content.indexOf(pattern);
  if (index >= 0) {
    const beforeMatch = content.substring(0, index);
    const lines = beforeMatch.split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;

    return {
      matched: true,
      line,
      column,
      matchedText: pattern,
    };
  }

  return { matched: false };
}

/**
 * Check if a pattern is an intent annotation pattern.
 * Intent patterns start with '@intent:'.
 */
export function isIntentPattern(pattern: string): boolean {
  return pattern.startsWith('@intent:');
}

/**
 * Extract intent name from an intent pattern.
 * Returns null if not a valid intent pattern.
 */
export function extractIntentName(pattern: string): string | null {
  if (!isIntentPattern(pattern)) {
    return null;
  }
  return pattern.substring('@intent:'.length);
}

/**
 * Compute Levenshtein distance between two strings.
 * Used for fuzzy matching suggestions.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Create matrix
  const matrix: number[][] = Array(a.length + 1)
    .fill(null)
    .map(() => Array(b.length + 1).fill(0));

  // Initialize first column
  for (let i = 0; i <= a.length; i++) {
    matrix[i][0] = i;
  }

  // Initialize first row
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Compute similarity score between two strings using Levenshtein distance.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}
