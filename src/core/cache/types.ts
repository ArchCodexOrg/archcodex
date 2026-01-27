/**
 * @arch archcodex.core.types
 *
 * Types for persistent validation caching.
 * Cache is stored in .arch/cache/validation.json
 */
import type { ConstraintValue } from '../registry/schema.js';

/**
 * Cached violation (minimal representation).
 */
export interface CachedViolation {
  /** Violation code (e.g., S001) */
  code: string;
  /** Constraint rule that was violated */
  rule: string;
  /** Value that caused the violation */
  value: ConstraintValue;
  /** Severity level */
  severity: 'error' | 'warning';
  /** Line number (null if not applicable) */
  line: number | null;
  /** Column number (null if not applicable) */
  column: number | null;
  /** Human-readable message */
  message: string;
  /** Source of the constraint */
  source: string;
}

/**
 * Cached validation result for a single file.
 */
export interface CachedFileResult {
  /** SHA-256 checksum (first 16 chars) of file content */
  checksum: string;
  /** Timestamp when cached */
  cachedAt: string;
  /** The file's @arch tag (null if untagged) */
  archId: string | null;
  /** Validation result status */
  status: 'pass' | 'fail' | 'warn';
  /** Cached error violations */
  violations: CachedViolation[];
  /** Cached warning violations */
  warnings: CachedViolation[];
  /** List of files this file imports (for graph reconstruction) */
  imports: string[];
  /** Active overrides count */
  overridesCount: number;
}

/**
 * Root cache structure stored in .arch/cache/validation.json
 */
export interface ValidationCache {
  /** Cache format version */
  version: string;
  /** Registry checksum - invalidates all if changed */
  registryChecksum: string;
  /** Config checksum - invalidates all if changed */
  configChecksum: string;
  /** Timestamp of cache creation */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Map of relative file path to cached result */
  files: Record<string, CachedFileResult>;
}

/**
 * Cache statistics for logging and monitoring.
 */
export interface CacheStats {
  /** Number of cache hits (valid cached results used) */
  hits: number;
  /** Number of cache misses (file not in cache) */
  misses: number;
  /** Number of invalidations (file changed since cache) */
  invalidated: number;
  /** Total files in cache */
  totalCached: number;
  /** Whether registry/config changed (full invalidation) */
  fullInvalidation: boolean;
}

/**
 * Cache version for format compatibility.
 */
export const CACHE_VERSION = '1.0';

/**
 * Default cache file path relative to project root.
 */
export const CACHE_PATH = '.arch/cache/validation.json';
