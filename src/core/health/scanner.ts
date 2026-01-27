/**
 * @arch archcodex.core.engine
 *
 * Unified file scanner for health analysis.
 * Coordinates scanning across all health components to eliminate duplication:
 * - Single glob operation (instead of 3-4)
 * - Parallel file reading with batching (instead of sequential)
 * - Shared metadata cache (used by coverage, intent, layer health analyzers)
 * - Lazy AST parsing (only for files with intents)
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { globFiles, readFile } from '../../utils/file-system.js';
import { extractArchId, parseArchTags } from '../arch-tag/parser.js';
import { validatorRegistry } from '../../validators/validator-registry.js';
import { HealthCacheManager } from '../cache/health-cache.js';
import type { HealthCache } from '../cache/health-cache.js';
import type { OverrideTag } from '../arch-tag/types.js';
import type { SemanticModel } from '../../validators/semantic.types.js';

/**
 * Cached metadata for a single file.
 */
export interface FileMetadata {
  /** Relative path from project root */
  path: string;
  /** Absolute path on filesystem */
  absolutePath: string;
  /** File content (cached) */
  content: string;
  /** Architecture ID if @arch tag present */
  archId: string | null;
  /** Whether file has any @override annotations */
  hasOverrides: boolean;
  /** Parsed override annotations */
  overrides: OverrideTag[];
  /** File-level intent annotations */
  intents: string[];
  /** Lazy-loaded AST semantic model (undefined until parsed) */
  semanticModel?: SemanticModel;
}

/**
 * Result of unified scanning operation.
 */
export interface ScanResult {
  /** Map of relative path → FileMetadata */
  files: Map<string, FileMetadata>;
  /** Statistics about the scan */
  stats: ScanStats;
}

/**
 * Statistics from scanning operation.
 */
export interface ScanStats {
  /** Total files scanned */
  totalFiles: number;
  /** Time spent scanning in milliseconds */
  scanTimeMs: number;
  /** Number of files read from cache (if caching enabled) */
  cacheHits: number;
  /** Number of files read fresh (not from cache) */
  cacheMisses: number;
}

/**
 * Options for scan operation.
 */
export interface ScanOptions {
  include: string[];
  exclude: string[];
  /** Enable progressive caching (default: false) */
  useCache?: boolean;
  /** Registry checksum for cache invalidation (optional) */
  registryChecksum?: string;
}

/**
 * Unified health scanner - single source of truth for file metadata.
 */
export class UnifiedHealthScanner {
  private projectRoot: string;
  private semanticModelCache = new Map<string, SemanticModel>();
  private concurrency: number;
  private cacheManager: HealthCacheManager;

  constructor(projectRoot: string, concurrency?: number) {
    this.projectRoot = projectRoot;
    // Default to 75% of CPU cores, min 2, max 32
    this.concurrency =
      concurrency ??
      Math.min(Math.max(Math.floor(os.cpus().length * 0.75), 2), 32);
    this.cacheManager = new HealthCacheManager(projectRoot);
  }

  /**
   * Release in-memory caches.
   */
  dispose(): void {
    this.semanticModelCache.clear();
  }

  /**
   * Perform unified scan of all files.
   * Returns cached metadata usable by all health analyzers.
   *
   * === Phase 4 Optimization: Progressive Caching ===
   * If useCache is true, loads cache and validates checksums.
   * Only reads files that have changed (10% of files on typical runs).
   * Hit rate: ~90% for repeated runs.
   */
  async scan(options: ScanOptions): Promise<ScanResult> {
    const startTime = Date.now();

    // 1. Single glob operation
    const allFiles = await globFiles(options.include, {
      cwd: this.projectRoot,
      ignore: options.exclude,
      absolute: false,
    });

    // 2. Load cache if enabled
    let cache = null;
    if (options.useCache) {
      cache = await this.cacheManager.load();
      // Invalidate cache if registry changed
      if (
        cache &&
        options.registryChecksum &&
        cache.registryChecksum !== options.registryChecksum
      ) {
        cache = null; // Registry changed, invalidate entire cache
      }
    }

    // 3. Parallel file reading with batching and cache support
    const filesMap = new Map<string, FileMetadata>();
    const stats: ScanStats = {
      totalFiles: allFiles.length,
      scanTimeMs: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
    const filesToRead: Array<{ file: string; useCache: boolean }> = [];

    // Determine which files need to be read
    for (const file of allFiles) {
      const cachedEntry = cache?.files[file];
      if (cachedEntry) {
        // File might be in cache, but we need to read it to validate checksum
        filesToRead.push({ file, useCache: true });
      } else {
        // File not in cache, must read
        filesToRead.push({ file, useCache: false });
      }
    }

    // Process files in batches
    await this.processInBatches(
      filesToRead,
      this.concurrency,
      async ({ file, useCache }) => {
        const absolutePath = path.resolve(this.projectRoot, file);

        try {
          const content = await readFile(absolutePath);
          const cachedEntry = useCache ? cache?.files[file] : null;

          // Check if we can use cached metadata
          if (cachedEntry && !this.cacheManager.isStale(content, cachedEntry)) {
            // Cache hit - restore content and absolutePath (stripped during save)
            filesMap.set(file, {
              ...cachedEntry.metadata,
              content,
              absolutePath,
            });
            stats.cacheHits++;
          } else {
            // Cache miss or no cache - parse fresh
            const parseResult = parseArchTags(content);
            const archId = extractArchId(content);

            const metadata: FileMetadata = {
              path: file,
              absolutePath,
              content,
              archId,
              hasOverrides: parseResult.overrides.length > 0,
              overrides: parseResult.overrides,
              intents: parseResult.intents.map((i) => i.name),
              // semanticModel: undefined (lazy-loaded)
            };

            filesMap.set(file, metadata);
            stats.cacheMisses++;
          }
        } catch {
          // Skip files that can't be read
        }
      }
    );

    stats.scanTimeMs = Date.now() - startTime;

    // 4. Save updated cache if enabled
    if (options.useCache) {
      const updatedCache: HealthCache = {
        version: '1.0',
        registryChecksum: options.registryChecksum ?? '',
        files: {},
      };

      // Build updated cache entries using already-read content
      for (const [filePath, metadata] of filesMap.entries()) {
        if (metadata.content) {
          updatedCache.files[filePath] = this.cacheManager.createEntry(
            metadata.content,
            metadata
          );
        }
      }

      // Save cache asynchronously (don't block scan completion)
      this.cacheManager.save(updatedCache).catch(() => {
        // Ignore cache save errors
      });
    }

    return {
      files: filesMap,
      stats,
    };
  }

  /**
   * Lazily parse semantic model for a file (AST).
   * Caches result for reuse across multiple lookups.
   */
  async parseSemanticModel(metadata: FileMetadata): Promise<SemanticModel> {
    // Return cached model if available
    if (metadata.semanticModel) {
      return metadata.semanticModel;
    }

    // Check in-memory cache
    if (this.semanticModelCache.has(metadata.path)) {
      metadata.semanticModel = this.semanticModelCache.get(metadata.path);
      return metadata.semanticModel!;
    }

    // Parse fresh using the appropriate validator for this file type
    const ext = path.extname(metadata.absolutePath).toLowerCase();
    const validator = validatorRegistry.getForExtension(ext);
    if (!validator) {
      throw new Error(`No validator registered for extension: ${ext}`);
    }
    const model = await validator.parseFile(
      metadata.absolutePath,
      metadata.content
    );

    // Cache for future use
    this.semanticModelCache.set(metadata.path, model);
    metadata.semanticModel = model;

    return model;
  }

  /**
   * Process items in fixed-size batches.
   * Allows parallel processing while controlling concurrency.
   */
  private async processInBatches<T>(
    items: T[],
    batchSize: number,
    processor: (item: T) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(batch.map(processor));
    }
  }
}
