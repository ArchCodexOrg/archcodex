/**
 * @arch archcodex.util
 *
 * Path matcher for include/exclude patterns.
 * Used for pre-commit gradual adoption and filtering.
 */

import ignore, { type Ignore } from 'ignore';

/**
 * PathMatcher instance for filtering file paths.
 */
export interface PathMatcher {
  /**
   * Check if a file path matches the patterns.
   * Returns true if the path should be included.
   * @param filePath - Relative path from project root
   */
  matches(filePath: string): boolean;

  /**
   * Filter an array of file paths, returning only matching ones.
   * @param filePaths - Relative paths from project root
   */
  filter(filePaths: string[]): string[];

  /**
   * Get include patterns.
   */
  includePatterns(): string[];

  /**
   * Get exclude patterns.
   */
  excludePatterns(): string[];
}

/**
 * Create a PathMatcher for include/exclude pattern matching.
 *
 * Logic:
 * - If include is empty, all files are initially included
 * - If include has patterns, only files matching include are considered
 * - Exclude patterns then filter out files from the included set
 *
 * @param include - Glob patterns for files to include
 * @param exclude - Glob patterns for files to exclude
 */
export function createPathMatcher(
  include: string[] = [],
  exclude: string[] = []
): PathMatcher {
  const includeFilter: Ignore | null = include.length > 0 ? ignore().add(include) : null;
  const excludeFilter: Ignore = ignore().add(exclude);

  return {
    matches(filePath: string): boolean {
      const normalizedPath = filePath.replace(/\\/g, '/');

      // If include patterns exist, file must match at least one
      if (includeFilter) {
        // The ignore package's ignores() returns true if the path matches
        // We want to include files that match the include patterns
        if (!includeFilter.ignores(normalizedPath)) {
          return false;
        }
      }

      // Check exclude patterns - if it matches, exclude the file
      if (excludeFilter.ignores(normalizedPath)) {
        return false;
      }

      return true;
    },

    filter(filePaths: string[]): string[] {
      return filePaths.filter(fp => this.matches(fp));
    },

    includePatterns(): string[] {
      return [...include];
    },

    excludePatterns(): string[] {
      return [...exclude];
    },
  };
}

/**
 * Check if any include/exclude patterns are configured.
 */
export function hasPatternConfig(include: string[], exclude: string[]): boolean {
  return include.length > 0 || exclude.length > 0;
}
