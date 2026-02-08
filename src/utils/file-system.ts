/**
 * @arch archcodex.infra.fs
 *
 * File system operations - reading, writing, and globbing.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';

/**
 * Read a file and return its contents as a string.
 */
export async function readFile(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf-8');
}

/**
 * Read a file synchronously.
 */
export function readFileSync(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write content to a file.
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.promises.writeFile(filePath, content, 'utf-8');
}

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch { /* file not found */ }
  return false;
}

/**
 * Check if a file exists (sync).
 */
export function fileExistsSync(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Check if a path is a directory.
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isDirectory();
  } catch { /* path not found or not accessible */ }
  return false;
}

/**
 * Check if a directory exists.
 * Alias for isDirectory with clearer intent.
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  return isDirectory(dirPath);
}

/**
 * Ensure a directory exists, creating it if necessary.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Find files matching glob patterns.
 */
export async function globFiles(
  patterns: string | string[],
  options: {
    cwd?: string;
    ignore?: string[];
    absolute?: boolean;
  } = {}
): Promise<string[]> {
  return fg(patterns, {
    cwd: options.cwd || process.cwd(),
    ignore: options.ignore || ['**/node_modules/**', '**/dist/**'],
    absolute: options.absolute ?? true,
    onlyFiles: true,
  });
}

/**
 * Get the real path of a file (resolving symlinks).
 */
export async function realPath(filePath: string): Promise<string> {
  return fs.promises.realpath(filePath);
}

/**
 * Get the real path synchronously.
 */
export function realPathSync(filePath: string): string {
  return fs.realpathSync(filePath);
}

/**
 * Normalize and resolve a path relative to a base.
 */
export function resolvePath(basePath: string, ...segments: string[]): string {
  return path.resolve(basePath, ...segments);
}

/**
 * Get the relative path from one path to another.
 */
export function relativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Get the directory name of a path.
 */
export function dirname(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Get the base name of a path.
 */
export function basename(filePath: string, ext?: string): string {
  return path.basename(filePath, ext);
}

/**
 * Get the extension of a path.
 */
export function extname(filePath: string): string {
  return path.extname(filePath);
}

/**
 * Join path segments.
 */
export function joinPath(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Normalize a path.
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

/**
 * Check if a path is absolute.
 */
export function isAbsolute(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

/**
 * Get file stats.
 */
export async function getStats(filePath: string): Promise<fs.Stats> {
  return fs.promises.stat(filePath);
}

/**
 * Count lines in a file.
 */
export async function countLines(filePath: string): Promise<number> {
  const content = await readFile(filePath);
  return content.split('\n').length;
}
