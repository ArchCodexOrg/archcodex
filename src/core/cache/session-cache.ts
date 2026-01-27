/**
 * @arch archcodex.core.domain
 *
 * Session-scoped cache for file contents and parsed results.
 * Lives only for the duration of a single validation run.
 * Eliminates redundant file reads and parsing.
 */
import { readFile } from '../../utils/file-system.js';
import type { SemanticModel } from '../../validators/semantic.types.js';

/**
 * Session cache for a single validation run.
 * All caches are cleared when dispose() is called.
 */
export class SessionCache {
  /** File path -> file content */
  private contentCache = new Map<string, string>();

  /** File path -> @arch tag ID (null if untagged) */
  private archIdCache = new Map<string, string | null>();

  /** File path -> parsed semantic model */
  private semanticModelCache = new Map<string, SemanticModel>();

  /** Module specifier key -> resolved path (null if not found) */
  private moduleResolutionCache = new Map<string, string | null>();

  /** Architecture ID -> resolved architecture */
  private archResolutionCache = new Map<string, unknown>();

  /**
   * Get file content, reading from disk only once per session.
   */
  async getContent(filePath: string): Promise<string> {
    if (!this.contentCache.has(filePath)) {
      const content = await readFile(filePath);
      this.contentCache.set(filePath, content);
    }
    return this.contentCache.get(filePath)!;
  }

  /**
   * Check if content is cached.
   */
  hasContent(filePath: string): boolean {
    return this.contentCache.has(filePath);
  }

  /**
   * Set content directly (useful when content is already read elsewhere).
   */
  setContent(filePath: string, content: string): void {
    this.contentCache.set(filePath, content);
  }

  /**
   * Get cached @arch tag ID for a file.
   */
  getArchId(filePath: string): string | null | undefined {
    return this.archIdCache.get(filePath);
  }

  /**
   * Check if arch ID is cached.
   */
  hasArchId(filePath: string): boolean {
    return this.archIdCache.has(filePath);
  }

  /**
   * Set @arch tag ID for a file.
   */
  setArchId(filePath: string, archId: string | null): void {
    this.archIdCache.set(filePath, archId);
  }

  /**
   * Get cached semantic model for a file.
   */
  getSemanticModel(filePath: string): SemanticModel | undefined {
    return this.semanticModelCache.get(filePath);
  }

  /**
   * Check if semantic model is cached.
   */
  hasSemanticModel(filePath: string): boolean {
    return this.semanticModelCache.has(filePath);
  }

  /**
   * Set semantic model for a file.
   */
  setSemanticModel(filePath: string, model: SemanticModel): void {
    this.semanticModelCache.set(filePath, model);
  }

  /**
   * Get cached module resolution result.
   * @param key Composite key like "fromFile:moduleSpecifier"
   */
  getModuleResolution(key: string): string | null | undefined {
    return this.moduleResolutionCache.get(key);
  }

  /**
   * Check if module resolution is cached.
   */
  hasModuleResolution(key: string): boolean {
    return this.moduleResolutionCache.has(key);
  }

  /**
   * Set module resolution result.
   */
  setModuleResolution(key: string, resolvedPath: string | null): void {
    this.moduleResolutionCache.set(key, resolvedPath);
  }

  /**
   * Get cached architecture resolution.
   */
  getArchResolution<T>(archId: string): T | undefined {
    return this.archResolutionCache.get(archId) as T | undefined;
  }

  /**
   * Check if architecture resolution is cached.
   */
  hasArchResolution(archId: string): boolean {
    return this.archResolutionCache.has(archId);
  }

  /**
   * Set architecture resolution.
   */
  setArchResolution(archId: string, resolution: unknown): void {
    this.archResolutionCache.set(archId, resolution);
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return {
      contentEntries: this.contentCache.size,
      archIdEntries: this.archIdCache.size,
      semanticModelEntries: this.semanticModelCache.size,
      moduleResolutionEntries: this.moduleResolutionCache.size,
      archResolutionEntries: this.archResolutionCache.size,
    };
  }

  /**
   * Clear all caches.
   */
  clear(): void {
    this.contentCache.clear();
    this.archIdCache.clear();
    this.semanticModelCache.clear();
    this.moduleResolutionCache.clear();
    this.archResolutionCache.clear();
  }

  /**
   * Alias for clear() - follows dispose pattern.
   */
  dispose(): void {
    this.clear();
  }
}

/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
  contentEntries: number;
  archIdEntries: number;
  semanticModelEntries: number;
  moduleResolutionEntries: number;
  archResolutionEntries: number;
}
