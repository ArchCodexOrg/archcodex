/**
 * @arch archcodex.core.domain
 *
 * CacheManager - manages persistent validation cache with checksum-based invalidation.
 * Cache location: .arch/cache/validation.json
 */
import * as path from 'node:path';
import { computeChecksum } from '../../utils/checksum.js';
import { readFile, writeFile, fileExists, ensureDir } from '../../utils/file-system.js';
import type {
  ValidationCache,
  CachedFileResult,
  CacheStats,
} from './types.js';
import { CACHE_VERSION, CACHE_PATH } from './types.js';

/**
 * Manages persistent validation cache.
 * Provides checksum-based invalidation for efficient re-validation.
 */
export class CacheManager {
  private projectRoot: string;
  private cache: ValidationCache | null = null;
  private registryChecksum: string;
  private configChecksum: string;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    invalidated: 0,
    totalCached: 0,
    fullInvalidation: false,
  };

  constructor(
    projectRoot: string,
    registryContent: string,
    configContent: string
  ) {
    this.projectRoot = projectRoot;
    this.registryChecksum = computeChecksum(registryContent);
    this.configChecksum = computeChecksum(configContent);
  }

  /**
   * Load cache from disk.
   * Invalidates entire cache if registry or config changed.
   */
  async load(): Promise<void> {
    const cachePath = path.join(this.projectRoot, CACHE_PATH);

    try {
      if (!(await fileExists(cachePath))) {
        this.cache = this.createEmptyCache();
        return;
      }

      const content = await readFile(cachePath);
      const loaded = JSON.parse(content) as ValidationCache;

      // Invalidate entire cache if registry, config, or version changed
      if (
        loaded.version !== CACHE_VERSION ||
        loaded.registryChecksum !== this.registryChecksum ||
        loaded.configChecksum !== this.configChecksum
      ) {
        this.cache = this.createEmptyCache();
        this.stats.fullInvalidation = true;
        return;
      }

      this.cache = loaded;
      this.stats.totalCached = Object.keys(this.cache.files).length;
    } catch { /* file not found or corrupt JSON */
      // Invalid cache file, start fresh
      this.cache = this.createEmptyCache();
    }
  }

  /**
   * Check if cached result is still valid for a file.
   * @param relativePath Relative file path from project root
   * @param currentChecksum SHA-256 checksum of current file content
   */
  isValid(relativePath: string, currentChecksum: string): boolean {
    if (!this.cache) return false;

    const cached = this.cache.files[relativePath];
    if (!cached) {
      this.stats.misses++;
      return false;
    }

    if (cached.checksum !== currentChecksum) {
      this.stats.invalidated++;
      return false;
    }

    this.stats.hits++;
    return true;
  }

  /**
   * Get cached result for a file.
   * Call isValid() first to ensure the result is still valid.
   */
  get(relativePath: string): CachedFileResult | null {
    return this.cache?.files[relativePath] ?? null;
  }

  /**
   * Store validation result in cache.
   * @param relativePath Relative file path from project root
   * @param result The cached file result
   */
  set(relativePath: string, result: CachedFileResult): void {
    if (!this.cache) return;
    this.cache.files[relativePath] = result;
    this.cache.updatedAt = new Date().toISOString();
  }

  /**
   * Remove files that no longer exist from cache.
   * @param existingFiles Set of relative file paths that currently exist
   * @returns Number of entries pruned
   */
  prune(existingFiles: Set<string>): number {
    if (!this.cache) return 0;

    let pruned = 0;
    for (const filePath of Object.keys(this.cache.files)) {
      if (!existingFiles.has(filePath)) {
        delete this.cache.files[filePath];
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Save cache to disk.
   */
  async save(): Promise<void> {
    if (!this.cache) return;

    const cachePath = path.join(this.projectRoot, CACHE_PATH);
    const cacheDir = path.dirname(cachePath);

    await ensureDir(cacheDir);
    await writeFile(cachePath, JSON.stringify(this.cache, null, 2));
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      totalCached: Object.keys(this.cache?.files ?? {}).length,
    };
  }

  /**
   * Check if cache is loaded and has entries.
   */
  hasCache(): boolean {
    return this.cache !== null && Object.keys(this.cache.files).length > 0;
  }

  /**
   * Get all cached file paths.
   */
  getCachedPaths(): string[] {
    return Object.keys(this.cache?.files ?? {});
  }

  /**
   * Clear the cache entirely.
   */
  clear(): void {
    this.cache = this.createEmptyCache();
  }

  /**
   * Create an empty cache structure.
   */
  private createEmptyCache(): ValidationCache {
    return {
      version: CACHE_VERSION,
      registryChecksum: this.registryChecksum,
      configChecksum: this.configChecksum,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: {},
    };
  }
}
