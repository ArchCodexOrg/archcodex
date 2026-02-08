/**
 * @arch archcodex.core.domain
 *
 * ChangeDetector - detects changed files by comparing checksums against cache.
 * Used for incremental validation to only re-validate changed files and dependents.
 */
import { computeChecksum } from '../../utils/checksum.js';
import { readFile } from '../../utils/file-system.js';
import type { CacheManager } from './manager.js';

/**
 * Result of change detection.
 */
export interface ChangeDetectionResult {
  /** Files that have changed since last cache */
  changed: string[];
  /** Files that haven't changed (cache valid) */
  unchanged: string[];
  /** Files not in cache (new files) */
  newFiles: string[];
}

/**
 * Detects file changes by comparing checksums against cached values.
 */
export class ChangeDetector {
  private projectRoot: string;
  private cacheManager: CacheManager;

  constructor(projectRoot: string, cacheManager: CacheManager) {
    this.projectRoot = projectRoot;
    this.cacheManager = cacheManager;
  }

  /**
   * Detect which files have changed since last cached validation.
   * @param filePaths Relative file paths to check
   * @returns Classification of files into changed, unchanged, and new
   */
  async detectChanges(filePaths: string[]): Promise<ChangeDetectionResult> {
    const changed: string[] = [];
    const unchanged: string[] = [];
    const newFiles: string[] = [];

    // Process files in parallel for better performance
    const results = await Promise.all(
      filePaths.map(async (file) => {
        try {
          const content = await readFile(`${this.projectRoot}/${file}`);
          const checksum = computeChecksum(content);
          const cached = this.cacheManager.get(file);

          if (!cached) {
            return { file, status: 'new' as const };
          }

          if (cached.checksum !== checksum) {
            return { file, status: 'changed' as const };
          }

          return { file, status: 'unchanged' as const };
        } catch { /* file read error */
          // File read error - treat as new/changed
          return { file, status: 'new' as const };
        }
      })
    );

    // Classify results
    for (const result of results) {
      switch (result.status) {
        case 'changed':
          changed.push(result.file);
          break;
        case 'unchanged':
          unchanged.push(result.file);
          break;
        case 'new':
          newFiles.push(result.file);
          break;
      }
    }

    return { changed, unchanged, newFiles };
  }

  /**
   * Get checksums for a set of files.
   * Useful for pre-computing checksums before validation.
   */
  async getChecksums(filePaths: string[]): Promise<Map<string, string>> {
    const checksums = new Map<string, string>();

    await Promise.all(
      filePaths.map(async (file) => {
        try {
          const content = await readFile(`${this.projectRoot}/${file}`);
          checksums.set(file, computeChecksum(content));
        } catch { /* file read error, skip */
          // Skip files that can't be read
        }
      })
    );

    return checksums;
  }
}
