/**
 * @arch archcodex.cli.mcp
 *
 * Shared utilities for the MCP server - project root detection and input normalization.
 */
import { resolve, dirname, isAbsolute } from 'path';
import { access } from 'fs/promises';

// ============================================================================
// PROJECT ROOT DETECTION
// ============================================================================

/**
 * Parse --project argument or fall back to cwd.
 */
export function getDefaultProjectRoot(): string {
  const args = process.argv.slice(2);

  // 1. Explicit --project argument
  const projectIdx = args.indexOf('--project');
  if (projectIdx !== -1 && args[projectIdx + 1]) {
    return resolve(args[projectIdx + 1]);
  }

  // 2. ARCHCODEX_PROJECT_ROOT environment variable
  if (process.env.ARCHCODEX_PROJECT_ROOT) {
    return resolve(process.env.ARCHCODEX_PROJECT_ROOT);
  }

  // 3. Fall back to current working directory
  return process.cwd();
}

// Cache for discovered project roots (file path -> project root)
// LRU-style cache with max size to prevent unbounded growth
const PROJECT_ROOT_CACHE_MAX_SIZE = 1000;
const projectRootCache = new Map<string, string>();

/**
 * Add to cache with LRU eviction when cache gets too large.
 */
export function cacheProjectRoot(filePath: string, projectRoot: string): void {
  // Simple LRU: delete oldest entries when cache is full
  if (projectRootCache.size >= PROJECT_ROOT_CACHE_MAX_SIZE) {
    // Delete first 10% of entries (oldest due to Map insertion order)
    const deleteCount = Math.floor(PROJECT_ROOT_CACHE_MAX_SIZE * 0.1);
    let count = 0;
    for (const key of projectRootCache.keys()) {
      if (count >= deleteCount) break;
      projectRootCache.delete(key);
      count++;
    }
  }
  projectRootCache.set(filePath, projectRoot);
}

/**
 * Find project root by walking up from a file path looking for .arch/ directory.
 */
export async function findProjectRoot(filePath: string, defaultRoot: string): Promise<string | null> {
  // Make path absolute
  const absPath = isAbsolute(filePath) ? filePath : resolve(defaultRoot, filePath);

  // Check cache first
  if (projectRootCache.has(absPath)) {
    return projectRootCache.get(absPath)!;
  }

  let dir = dirname(absPath);
  const root = dirname(dir) === dir ? dir : '/'; // Handle root directory

  while (dir !== root) {
    try {
      await access(resolve(dir, '.arch'));
      cacheProjectRoot(absPath, dir);
      return dir;
    } catch {
      // .arch not found, go up
      dir = dirname(dir);
    }
  }

  // Check root as well
  try {
    await access(resolve(dir, '.arch'));
    cacheProjectRoot(absPath, dir);
    return dir;
  } catch {
    return null;
  }
}

/**
 * Resolve project root from:
 * 1. Explicit projectRoot argument
 * 2. Walking up from file path to find .arch/
 * 3. Default project root (cwd or --project arg)
 */
export async function resolveProjectRootFromFile(
  defaultRoot: string,
  filePath?: string,
  explicitRoot?: string
): Promise<string> {
  // Explicit root always wins
  if (explicitRoot) {
    return resolve(explicitRoot);
  }

  // Try to find from file path
  if (filePath) {
    const found = await findProjectRoot(filePath, defaultRoot);
    if (found) {
      return found;
    }
  }

  return defaultRoot;
}

/**
 * Resolve project root by trying multiple file paths.
 * Tries each file path in order until one resolves to a project with .arch/.
 * Falls back to defaultProjectRoot if none resolve.
 */
export async function resolveProjectRootFromFiles(
  defaultRoot: string,
  filePaths: string[],
  explicitRoot?: string
): Promise<string> {
  if (explicitRoot) {
    return resolve(explicitRoot);
  }

  for (const filePath of filePaths) {
    const found = await findProjectRoot(filePath, defaultRoot);
    if (found) {
      return found;
    }
  }

  return defaultRoot;
}

/**
 * Check if a project is initialized with .arch/ directory.
 */
export async function isProjectInitialized(projectRoot: string): Promise<boolean> {
  try {
    await access(resolve(projectRoot, '.arch'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to find a nearby initialized project by walking up from a starting directory.
 * Returns the path to a project with .arch/ directory, or null if none found.
 */
export async function findNearbyProject(startDir: string = process.cwd()): Promise<string | null> {
  let dir = startDir;
  const root = dirname(dir) === dir ? dir : '/';

  while (dir !== root) {
    if (await isProjectInitialized(dir)) {
      return dir;
    }
    dir = dirname(dir);
  }

  return null;
}

// ============================================================================
// INPUT NORMALIZATION HELPERS
// ============================================================================

/**
 * Normalize a file input that can be either a string path or an object with a path property.
 * Returns the string path while preserving any additional object properties.
 *
 * Examples:
 * - Input: "/path/to/file.ts" → Output: "/path/to/file.ts"
 * - Input: { path: "/path/to/file.ts", format: "ai" } → Output: "/path/to/file.ts"
 */
export function normalizeFilePath(input: string | Record<string, unknown>): string {
  if (typeof input === 'string') {
    return input;
  }
  if (typeof input === 'object' && input !== null && 'path' in input) {
    const path = input.path;
    if (typeof path === 'string') {
      return path;
    }
  }
  throw new Error(`Invalid file input. Expected string or object with 'path' property, got: ${JSON.stringify(input)}`);
}

/**
 * Normalize an array of file inputs that can be strings or objects with path properties.
 * Returns an array of string paths while preserving object metadata.
 *
 * Examples:
 * - Input: ["/path/a.ts", "/path/b.ts"] → Output: ["/path/a.ts", "/path/b.ts"]
 * - Input: [{ path: "/path/a.ts" }, "/path/b.ts"] → Output: ["/path/a.ts", "/path/b.ts"]
 */
export function normalizeFilePaths(inputs: (string | Record<string, unknown>)[] | undefined): string[] {
  if (!inputs || !Array.isArray(inputs)) {
    return [];
  }
  return inputs.map(input => {
    try {
      return normalizeFilePath(input);
    } catch (error) {
      throw new Error(`Invalid file in array: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/**
 * Normalize a file list that can be either a single string/object OR an array of strings/objects.
 * This allows parameters like "files" to accept both:
 * - { files: "/path/a.ts" } (single file as string)
 * - { files: ["/path/a.ts", "/path/b.ts"] } (array of files)
 *
 * Examples:
 * - Input: "/path/a.ts" → Output: ["/path/a.ts"]
 * - Input: ["/path/a.ts", "/path/b.ts"] → Output: ["/path/a.ts", "/path/b.ts"]
 * - Input: { path: "/path/a.ts" } → Output: ["/path/a.ts"]
 * - Input: [{ path: "/path/a.ts" }, "/path/b.ts"] → Output: ["/path/a.ts", "/path/b.ts"]
 */
export function normalizeFilesList(
  input: string | Record<string, unknown> | (string | Record<string, unknown>)[] | undefined
): string[] {
  if (!input) {
    return [];
  }

  // If it's an array, normalize it as a file list
  if (Array.isArray(input)) {
    return normalizeFilePaths(input);
  }

  // If it's a single string or object, treat it as a single file
  try {
    return [normalizeFilePath(input as string | Record<string, unknown>)];
  } catch (error) {
    throw new Error(`Invalid file list: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Normalize a simple string list that can be either a single string OR an array of strings.
 * Used for patterns, scopes, registryPatterns, etc.
 *
 * Examples:
 * - Input: "src/**" → Output: ["src/**"]
 * - Input: ["src/**", "lib/**"] → Output: ["src/**", "lib/**"]
 * - Input: undefined → Output: []
 */
export function normalizeStringList(input: string | string[] | undefined): string[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input;
  }

  return [input];
}
