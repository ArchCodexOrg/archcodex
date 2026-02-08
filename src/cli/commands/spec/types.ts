/**
 * @arch archcodex.cli.data
 * @intent:cli-output
 *
 * Shared types and helpers for spec sub-commands.
 */
import * as path from 'node:path';
import { ensureDir } from '../../../utils/file-system.js';

/**
 * Resolve output path - auto-detect if directory and generate filename.
 * @param outputPath - User-provided output path (file or directory)
 * @param specId - Spec ID for generating filename
 * @param testType - Test type (unit, property, integration, docs)
 * @returns Resolved file path
 */
export async function resolveOutputPath(
  outputPath: string,
  specId: string,
  testType: string
): Promise<string> {
  const fs = await import('node:fs/promises');

  try {
    const stat = await fs.stat(outputPath);
    if (stat.isDirectory()) {
      // Auto-generate filename based on spec ID and test type
      const safeName = specId.replace(/\./g, '-');
      const extension = testType === 'docs' ? '.md' : '.test.ts';
      return path.join(outputPath, `${safeName}.${testType}${extension}`);
    }
  } catch { /* path doesn't exist yet */
    // Path doesn't exist yet - check if it looks like a directory
    if (outputPath.endsWith('/') || outputPath.endsWith(path.sep)) {
      // Ensure directory exists and generate filename
      await ensureDir(outputPath);
      const safeName = specId.replace(/\./g, '-');
      const extension = testType === 'docs' ? '.md' : '.test.ts';
      return path.join(outputPath, `${safeName}.${testType}${extension}`);
    }
  }

  // It's a file path - ensure parent directory exists
  const parentDir = path.dirname(outputPath);
  if (parentDir && parentDir !== '.') {
    await ensureDir(parentDir);
  }

  return outputPath;
}
