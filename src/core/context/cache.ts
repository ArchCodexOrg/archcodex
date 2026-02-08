/**
 * @arch archcodex.core.engine
 *
 * Schema cache - caches extraction results for fast repeated access.
 * Invalidates when the schema file changes (mtime check).
 */

import * as path from 'node:path';
import { stat } from 'node:fs/promises';
import { readFile, writeFile, fileExists } from '../../utils/file-system.js';
import type { SchemaCache, SchemaSource, EntityContext } from './types.js';

/** Current cache format version */
const CACHE_VERSION = 1;

/** Cache file location relative to project root */
const CACHE_PATH = '.arch/cache/schema-context.json';

/**
 * Schema cache manager.
 * Provides fast access to extracted schema data with automatic invalidation.
 */
export class SchemaCacheManager {
  private projectRoot: string;
  private memoryCache: SchemaCache | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Get the cache file path.
   */
  private getCachePath(): string {
    return path.join(this.projectRoot, CACHE_PATH);
  }

  /**
   * Get the modification time of a file.
   */
  private async getMtime(filePath: string): Promise<number> {
    try {
      const stats = await stat(filePath);
      return stats.mtimeMs;
    } catch { /* file does not exist */
      return 0;
    }
  }

  /**
   * Load cache from disk.
   */
  private async loadFromDisk(): Promise<SchemaCache | null> {
    const cachePath = this.getCachePath();

    if (!(await fileExists(cachePath))) {
      return null;
    }

    try {
      const content = await readFile(cachePath);
      const cache = JSON.parse(content) as SchemaCache;

      // Check version compatibility
      if (cache.version !== CACHE_VERSION) {
        return null;
      }

      return cache;
    } catch { /* corrupt cache file or parse error */
      return null;
    }
  }

  /**
   * Save cache to disk.
   */
  private async saveToDisk(cache: SchemaCache): Promise<void> {
    const cachePath = this.getCachePath();
    const cacheDir = path.dirname(cachePath);

    // Ensure cache directory exists
    const { mkdir } = await import('node:fs/promises');
    await mkdir(cacheDir, { recursive: true });

    await writeFile(cachePath, JSON.stringify(cache, null, 2));
  }

  /**
   * Check if the cache is still valid (schema hasn't changed).
   */
  async isValid(schemaPath: string): Promise<boolean> {
    // Try memory cache first
    if (this.memoryCache && this.memoryCache.schemaPath === schemaPath) {
      const currentMtime = await this.getMtime(schemaPath);
      return this.memoryCache.schemaMtime === currentMtime;
    }

    // Try disk cache
    const cache = await this.loadFromDisk();
    if (!cache || cache.schemaPath !== schemaPath) {
      return false;
    }

    const currentMtime = await this.getMtime(schemaPath);
    if (cache.schemaMtime !== currentMtime) {
      return false;
    }

    // Populate memory cache
    this.memoryCache = cache;
    return true;
  }

  /**
   * Get cached entities if cache is valid.
   */
  async get(schemaPath: string): Promise<EntityContext[] | null> {
    if (await this.isValid(schemaPath)) {
      return this.memoryCache?.entities ?? null;
    }
    return null;
  }

  /**
   * Update the cache with new extraction results.
   */
  async set(
    source: SchemaSource,
    schemaPath: string,
    entities: EntityContext[]
  ): Promise<void> {
    const mtime = await this.getMtime(schemaPath);

    const cache: SchemaCache = {
      version: CACHE_VERSION,
      source,
      schemaPath,
      schemaMtime: mtime,
      extractedAt: new Date().toISOString(),
      entities,
    };

    this.memoryCache = cache;
    await this.saveToDisk(cache);
  }

  /**
   * Clear the cache (force re-extraction on next access).
   */
  async clear(): Promise<void> {
    this.memoryCache = null;

    const cachePath = this.getCachePath();
    if (await fileExists(cachePath)) {
      const { unlink } = await import('node:fs/promises');
      await unlink(cachePath);
    }
  }

  /**
   * Search entities by name pattern.
   */
  searchEntities(entities: EntityContext[], pattern: string): EntityContext[] {
    const lowerPattern = pattern.toLowerCase();
    return entities.filter(e =>
      e.name.toLowerCase().includes(lowerPattern)
    );
  }

  /**
   * Get all entity names from cache (for --list).
   */
  async getEntityNames(schemaPath: string): Promise<string[] | null> {
    const entities = await this.get(schemaPath);
    if (!entities) {
      return null;
    }
    return entities.map(e => e.name);
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.memoryCache = null;
  }
}

/**
 * Create a schema cache manager instance.
 */
export function createSchemaCacheManager(projectRoot: string): SchemaCacheManager {
  return new SchemaCacheManager(projectRoot);
}
