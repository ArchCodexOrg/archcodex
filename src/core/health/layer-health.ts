/**
 * @arch archcodex.core.domain
 *
 * Layer coverage health detection: orphan files, phantom paths, stale exclusions.
 */
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import { globFiles, readFile } from '../../utils/file-system.js';
import { extractArchId } from '../arch-tag/parser.js';
import type { LayerConfig } from '../config/schema.js';
import type { LayerCoverageHealth, PhantomLayerPath, StaleExclusion } from './types.js';
import type { ScanResult } from './scanner.js';

/** Built-in exclusion patterns that should always be skipped from stale detection. */
const BUILTIN_EXCLUSIONS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/*.test.tsx',
  '**/*.spec.tsx',
  '**/*.test.js',
  '**/*.spec.js',
];

/**
 * Detect source files not covered by any layer's `paths` patterns.
 * Uses pre-scanned files if provided to avoid redundant globbing.
 *
 * === Phase 2 Optimization ===
 * Inverted algorithm: instead of O(files × layers × patterns) minimatch ops,
 * we build a set of covered files using glob results, then filter.
 * Result: O(layers × patterns) globs + O(files) set lookups = 7,500 ops → 100 ops
 */
export async function detectOrphanFiles(
  projectRoot: string,
  layers: LayerConfig[],
  scanOpts: { include: string[]; exclude: string[] },
  preScannedFiles?: Map<string, { archId: string | null }>
): Promise<{ totalFiles: number; coveredFiles: number; orphans: string[] }> {
  if (layers.length === 0) {
    return { totalFiles: 0, coveredFiles: 0, orphans: [] };
  }

  // Get all files to scan
  const allFiles =
    preScannedFiles
      ? Array.from(preScannedFiles.keys())
      : await globFiles(scanOpts.include, {
          cwd: projectRoot,
          ignore: scanOpts.exclude,
          absolute: false,
        });

  // === Inverted Algorithm: Build set of covered files ===
  // When preScannedFiles provided (from analyzer), use minimatch on pre-scanned data
  // Otherwise, use original minimatch approach on allFiles (efficient for both cases)
  const coveredFilesSet = new Set<string>();

  for (const layer of layers) {
    for (const pattern of layer.paths) {
      // Use minimatch on the allFiles array (works for both scanned and non-scanned cases)
      const matches = allFiles.filter((f) => minimatch(f, pattern));

      // Add matched files to covered set, accounting for exclusions
      for (const match of matches) {
        const excluded = layer.exclude?.some((ex) => minimatch(match, ex));
        if (!excluded) {
          coveredFilesSet.add(match);
        }
      }
    }
  }

  // Files not in covered set are orphans
  const orphans = allFiles.filter((f) => !coveredFilesSet.has(f));

  return {
    totalFiles: allFiles.length,
    coveredFiles: coveredFilesSet.size,
    orphans,
  };
}

/**
 * Detect layer path patterns that match zero files on disk.
 */
export async function detectPhantomPaths(
  projectRoot: string,
  layers: LayerConfig[]
): Promise<PhantomLayerPath[]> {
  const phantoms: PhantomLayerPath[] = [];

  for (const layer of layers) {
    for (const pattern of layer.paths) {
      const matches = await globFiles(pattern, {
        cwd: projectRoot,
        ignore: ['**/node_modules/**', '**/dist/**'],
        absolute: false,
      });

      if (matches.length === 0) {
        phantoms.push({
          layerName: layer.name,
          pattern,
        });
      }
    }
  }

  return phantoms;
}

/**
 * Detect exclusion patterns where all matched files already have @arch tags.
 * Uses pre-scanned files if provided to avoid redundant file reads.
 */
export async function detectStaleExclusions(
  projectRoot: string,
  excludePatterns: string[],
  preScannedFiles?: Map<string, { archId: string | null }>
): Promise<StaleExclusion[]> {
  const stale: StaleExclusion[] = [];

  for (const pattern of excludePatterns) {
    // Skip built-in exclusions
    if (BUILTIN_EXCLUSIONS.includes(pattern)) {
      continue;
    }

    // Use pre-scanned files if provided, otherwise glob and read
    let matches: string[];
    if (preScannedFiles) {
      // Use pre-scanned data to find matching files
      matches = Array.from(preScannedFiles.keys()).filter((f) =>
        minimatch(f, pattern)
      );
    } else {
      // Glob files matching this exclusion
      matches = await globFiles(pattern, {
        cwd: projectRoot,
        ignore: ['**/node_modules/**', '**/dist/**'],
        absolute: false,
      });
    }

    if (matches.length === 0) {
      continue; // Pattern matches nothing, not stale (just empty)
    }

    // Check if all matched files have @arch tags
    let allTagged = true;
    for (const file of matches) {
      const metadata = preScannedFiles?.get(file);
      if (metadata) {
        // Use pre-scanned data
        if (!metadata.archId) {
          allTagged = false;
          break;
        }
      } else {
        // Fall back to reading file (only if not in pre-scanned data)
        const absolutePath = path.resolve(projectRoot, file);
        try {
          const content = await readFile(absolutePath);
          const archId = extractArchId(content);
          if (!archId) {
            allTagged = false;
            break;
          }
        } catch { /* file read error */
          // Can't read file, assume not tagged
          allTagged = false;
          break;
        }
      }
    }

    if (allTagged) {
      stale.push({
        pattern,
        source: 'files.scan.exclude',
        matchedFileCount: matches.length,
        reason: `All ${matches.length} matched file(s) already have @arch tags`,
      });
    }
  }

  return stale;
}

/**
 * Analyze layer coverage health: orphans, phantom paths, stale exclusions.
 * Returns undefined if no layers are configured.
 * Uses pre-scanned files if provided to avoid redundant I/O.
 */
export async function analyzeLayerHealth(
  projectRoot: string,
  layers: LayerConfig[],
  scanOpts: { include: string[]; exclude: string[] },
  scanResult?: ScanResult
): Promise<LayerCoverageHealth | undefined> {
  if (layers.length === 0) {
    return undefined;
  }

  // Extract pre-scanned files map if provided
  const preScannedFiles = scanResult ? new Map(
    Array.from(scanResult.files.entries()).map(([path, metadata]) => [
      path,
      { archId: metadata.archId },
    ])
  ) : undefined;

  const orphanResult = await detectOrphanFiles(
    projectRoot,
    layers,
    scanOpts,
    preScannedFiles
  );
  const phantomPaths = await detectPhantomPaths(projectRoot, layers);
  const staleExclusions = await detectStaleExclusions(
    projectRoot,
    scanOpts.exclude,
    preScannedFiles
  );

  const coveragePercent = orphanResult.totalFiles > 0
    ? Math.round(
        ((orphanResult.coveredFiles / orphanResult.totalFiles) * 100 * 10) / 10
      )
    : 100;

  return {
    totalSourceFiles: orphanResult.totalFiles,
    coveredFiles: orphanResult.coveredFiles,
    coveragePercent,
    orphanFiles: orphanResult.orphans,
    phantomPaths,
    staleExclusions,
  };
}
