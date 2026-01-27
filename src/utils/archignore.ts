/**
 * @arch archcodex.infra
 *
 * .archignore file support - gitignore-style pattern matching for excluding files.
 * Uses infrastructure layer since it needs file system access.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import ignore, { type Ignore } from 'ignore';
import { fileExists } from './file-system.js';

const ARCHIGNORE_FILENAME = '.archignore';

/**
 * Legacy default patterns - kept for backwards compatibility helpers.
 * Note: These are NOT applied automatically. Use `archcodex init` to create
 * a .archignore file with sensible defaults, or create one manually.
 */
const LEGACY_DEFAULT_PATTERNS = [
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.git/',
  '*.d.ts',
];

/**
 * ArchIgnore instance for filtering files.
 */
export interface ArchIgnore {
  /**
   * Check if a file path should be ignored.
   * @param filePath - Relative path from project root
   */
  ignores(filePath: string): boolean;

  /**
   * Filter an array of file paths, returning only non-ignored ones.
   * @param filePaths - Relative paths from project root
   */
  filter(filePaths: string[]): string[];

  /**
   * Get all patterns being used.
   */
  patterns(): string[];
}

/**
 * Load .archignore from project root.
 * Returns empty filter if no .archignore file exists (no implicit defaults).
 * Use `archcodex init` to create a .archignore with sensible defaults.
 */
export async function loadArchIgnore(projectRoot: string): Promise<ArchIgnore> {
  const archignorePath = join(projectRoot, ARCHIGNORE_FILENAME);
  const patterns: string[] = [];

  // Check for .archignore file
  if (await fileExists(archignorePath)) {
    try {
      const content = await readFile(archignorePath, 'utf-8');
      const filePatterns = parseArchIgnore(content);
      patterns.push(...filePatterns);
    } catch {
      // Ignore read errors, return empty filter
    }
  }

  return createArchIgnore(patterns);
}

/**
 * Create an ArchIgnore instance from patterns.
 */
export function createArchIgnore(patterns: string[]): ArchIgnore {
  const ig: Ignore = ignore().add(patterns);

  return {
    ignores(filePath: string): boolean {
      // Normalize path separators
      const normalizedPath = filePath.replace(/\\/g, '/');
      return ig.ignores(normalizedPath);
    },

    filter(filePaths: string[]): string[] {
      return filePaths.filter(fp => !this.ignores(fp));
    },

    patterns(): string[] {
      return [...patterns];
    },
  };
}

/**
 * Parse .archignore file content.
 * Follows gitignore syntax:
 * - Lines starting with # are comments
 * - Empty lines are ignored
 * - Patterns can use glob syntax
 * - Patterns starting with ! are negations
 */
export function parseArchIgnore(content: string): string[] {
  const lines = content.split('\n');
  const patterns: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    patterns.push(trimmed);
  }

  return patterns;
}

/**
 * Check if a file should be ignored based on legacy default patterns.
 * @deprecated Use loadArchIgnore() with an explicit .archignore file instead.
 */
export function isDefaultIgnored(filePath: string): boolean {
  const ig = ignore().add(LEGACY_DEFAULT_PATTERNS);
  return ig.ignores(filePath.replace(/\\/g, '/'));
}

/**
 * Get legacy default ignore patterns.
 * @deprecated Create a .archignore file with `archcodex init` instead.
 */
export function getDefaultPatterns(): string[] {
  return [...LEGACY_DEFAULT_PATTERNS];
}
