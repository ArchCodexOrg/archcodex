/**
 * @arch archcodex.core.domain
 * @intent:registry-infrastructure
 */
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  RegistrySchema,
  type Registry,
  type ArchitectureNode,
} from './schema.js';

// Re-export intent, action, and feature loaders for backward compatibility
export * from './intent-loader.js';
export * from './action-loader.js';
export * from './feature-loader.js';
import { loadYamlWithSchema, loadYaml, fileExists, directoryExists } from '../../utils/index.js';
import { RegistryError, ErrorCodes } from '../../utils/errors.js';

const DEFAULT_REGISTRY_FILE = '.arch/registry.yaml';
const DEFAULT_REGISTRY_DIR = '.arch/registry';

/**
 * Load registry from either a single file or a directory.
 * Auto-detects: if .arch/registry/ directory exists, loads from there.
 * Otherwise falls back to .arch/registry.yaml.
 */
export async function loadRegistry(
  projectRoot: string,
  registryPath?: string
): Promise<Registry> {
  // If explicit path provided, use it directly
  if (registryPath) {
    const fullPath = path.resolve(projectRoot, registryPath);
    const isDir = await directoryExists(fullPath);

    if (isDir) {
      return loadRegistryFromDirectory(fullPath);
    }
    return loadRegistryFromFile(fullPath);
  }

  // Auto-detect: prefer directory over single file
  const dirPath = path.resolve(projectRoot, DEFAULT_REGISTRY_DIR);
  const filePath = path.resolve(projectRoot, DEFAULT_REGISTRY_FILE);

  if (await directoryExists(dirPath)) {
    return loadRegistryFromDirectory(dirPath);
  }

  if (await fileExists(filePath)) {
    return loadRegistryFromFile(filePath);
  }

  // Check if .arch directory exists to provide a more helpful error
  const archDir = path.resolve(projectRoot, '.arch');
  const archDirExists = await directoryExists(archDir);

  if (archDirExists) {
    // .arch exists but registry doesn't - likely incomplete setup
    throw new RegistryError(
      ErrorCodes.INVALID_REGISTRY,
      `ArchCodex is partially configured: .arch/ directory exists but registry is missing. ` +
      `Expected either ${DEFAULT_REGISTRY_DIR}/ directory or ${DEFAULT_REGISTRY_FILE} file. ` +
      `Run 'archcodex init' to complete setup or create the registry manually.`,
      { searchedPaths: [dirPath, filePath], archDirExists: true }
    );
  }

  // No .arch directory at all
  throw new RegistryError(
    ErrorCodes.INVALID_REGISTRY,
    `ArchCodex not initialized in this project. No .arch/ directory found at ${projectRoot}. ` +
    `Run 'archcodex init' to set up architectural constraints for this codebase.`,
    { searchedPaths: [dirPath, filePath], archDirExists: false }
  );
}

/**
 * Load registry from a single YAML file.
 */
async function loadRegistryFromFile(filePath: string): Promise<Registry> {
  const exists = await fileExists(filePath);

  if (!exists) {
    throw new RegistryError(
      ErrorCodes.INVALID_REGISTRY,
      `Registry file not found: ${filePath}`,
      { path: filePath }
    );
  }

  try {
    return await loadYamlWithSchema(filePath, RegistrySchema);
  } catch (error) {
    if (error instanceof RegistryError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new RegistryError(
        ErrorCodes.INVALID_REGISTRY,
        `Failed to load registry from ${filePath}: ${error.message}`,
        { path: filePath, originalError: error.message }
      );
    }
    throw error;
  }
}

/**
 * Load registry from a directory of YAML files.
 * Recursively loads all .yaml/.yml files and merges them.
 */
async function loadRegistryFromDirectory(dirPath: string): Promise<Registry> {
  const yamlFiles = await findYamlFiles(dirPath);

  if (yamlFiles.length === 0) {
    throw new RegistryError(
      ErrorCodes.INVALID_REGISTRY,
      `No YAML files found in registry directory: ${dirPath}`,
      { path: dirPath }
    );
  }

  // Load all files and merge
  const merged: { nodes: Record<string, ArchitectureNode>; mixins: Record<string, ArchitectureNode> } = {
    nodes: {},
    mixins: {},
  };

  for (const filePath of yamlFiles) {
    try {
      const content = await loadYaml<Record<string, unknown>>(filePath);

      if (!content || typeof content !== 'object') {
        continue; // Skip empty files
      }

      // Check if this is a special file that should be skipped or handled differently
      const fileName = path.basename(filePath);
      const isMixinsFile = fileName === '_mixins.yaml' || fileName === '_mixins.yml';
      const isIntentsFile = fileName === '_intents.yaml' || fileName === '_intents.yml';
      const isActionsFile = fileName === '_actions.yaml' || fileName === '_actions.yml';
      const isFeaturesFile = fileName === '_features.yaml' || fileName === '_features.yml';

      // Skip special files - they're loaded separately via dedicated loaders
      if (isIntentsFile || isActionsFile || isFeaturesFile) {
        continue;
      }

      if (isMixinsFile) {
        // File contains only mixins
        for (const [key, value] of Object.entries(content)) {
          if (value && typeof value === 'object') {
            merged.mixins[key] = value as ArchitectureNode;
          }
        }
      } else {
        // Standard file: may contain nodes and/or mixins section
        const { mixins: fileMixins, ...fileNodes } = content as {
          mixins?: Record<string, ArchitectureNode>;
          [key: string]: unknown;
        };

        // Merge mixins if present
        if (fileMixins && typeof fileMixins === 'object') {
          for (const [key, value] of Object.entries(fileMixins)) {
            if (value && typeof value === 'object') {
              merged.mixins[key] = value as ArchitectureNode;
            }
          }
        }

        // Merge nodes
        for (const [key, value] of Object.entries(fileNodes)) {
          if (value && typeof value === 'object') {
            merged.nodes[key] = value as ArchitectureNode;
          }
        }
      }
    } catch (error) {
      throw new RegistryError(
        ErrorCodes.INVALID_REGISTRY,
        `Failed to load registry file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { path: filePath, originalError: error }
      );
    }
  }

  // Validate merged registry with schema
  const result = RegistrySchema.safeParse({ ...merged.nodes, mixins: merged.mixins });

  if (!result.success) {
    throw new RegistryError(
      ErrorCodes.INVALID_REGISTRY,
      `Merged registry validation failed: ${result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`,
      { errors: result.error.issues }
    );
  }

  return result.data;
}

/**
 * Recursively find all YAML files in a directory.
 */
async function findYamlFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  async function scanDir(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
        results.push(fullPath);
      }
    }
  }

  await scanDir(dirPath);

  // Sort for deterministic loading order
  return results.sort();
}

/**
 * Get the registry path for a project.
 * Returns either the directory path (if exists) or file path.
 */
export async function getRegistryPath(projectRoot: string): Promise<string> {
  const dirPath = path.resolve(projectRoot, DEFAULT_REGISTRY_DIR);
  if (await directoryExists(dirPath)) {
    return dirPath;
  }
  return path.resolve(projectRoot, DEFAULT_REGISTRY_FILE);
}

/**
 * Get registry content for checksum/cache invalidation purposes.
 * Handles both single-file and multi-file registries.
 */
export async function getRegistryContent(projectRoot: string): Promise<string> {
  const dirPath = path.resolve(projectRoot, DEFAULT_REGISTRY_DIR);
  const filePath = path.resolve(projectRoot, DEFAULT_REGISTRY_FILE);

  if (await directoryExists(dirPath)) {
    // Multi-file: concatenate all YAML files (sorted for deterministic checksum)
    const yamlFiles = await findYamlFiles(dirPath);
    const contents: string[] = [];
    for (const file of yamlFiles) {
      const content = await fs.readFile(file, 'utf-8');
      contents.push(`--- ${path.relative(dirPath, file)} ---\n${content}`);
    }
    return contents.join('\n');
  }

  if (await fileExists(filePath)) {
    return fs.readFile(filePath, 'utf-8');
  }

  return '';
}

/**
 * Get the default registry file path (legacy single-file mode).
 */
export function getRegistryFilePath(projectRoot: string): string {
  return path.resolve(projectRoot, DEFAULT_REGISTRY_FILE);
}

/**
 * Get the default registry directory path (multi-file mode).
 */
export function getRegistryDirPath(projectRoot: string): string {
  return path.resolve(projectRoot, DEFAULT_REGISTRY_DIR);
}

/**
 * Check if a registry exists in the project (file or directory).
 */
export async function registryExists(projectRoot: string): Promise<boolean> {
  const dirPath = path.resolve(projectRoot, DEFAULT_REGISTRY_DIR);
  const filePath = path.resolve(projectRoot, DEFAULT_REGISTRY_FILE);
  return (await directoryExists(dirPath)) || (await fileExists(filePath));
}

/**
 * List all architecture IDs in the registry.
 */
export function listArchitectureIds(registry: Registry): string[] {
  return Object.keys(registry.nodes);
}

/**
 * List all mixin IDs in the registry.
 */
export function listMixinIds(registry: Registry): string[] {
  return Object.keys(registry.mixins);
}

/**
 * Check if an architecture ID exists in the registry.
 */
export function hasArchitecture(registry: Registry, archId: string): boolean {
  return archId in registry.nodes;
}

/**
 * Check if a mixin ID exists in the registry.
 */
export function hasMixin(registry: Registry, mixinId: string): boolean {
  return mixinId in registry.mixins;
}

/**
 * Load only specific architectures from a multi-file registry.
 * Supports glob patterns for selective loading.
 *
 * @example
 * // Load only subscription-related architectures
 * const registry = await loadPartialRegistry(projectRoot, [
 *   'domain/subscription',
 *   'domain/subscription/*'
 * ]);
 *
 * @example
 * // Load all CLI architectures
 * const registry = await loadPartialRegistry(projectRoot, ['cli/**']);
 *
 * @example
 * // Load base and all core architectures
 * const registry = await loadPartialRegistry(projectRoot, ['base', 'core/**']);
 */
export async function loadPartialRegistry(
  projectRoot: string,
  patterns: string[],
  options: { includeMixins?: boolean; includeBase?: boolean } = {}
): Promise<Registry> {
  const { includeMixins = true, includeBase = true } = options;
  const registryDir = path.resolve(projectRoot, DEFAULT_REGISTRY_DIR);

  if (!(await directoryExists(registryDir))) {
    throw new RegistryError(
      ErrorCodes.INVALID_REGISTRY,
      `Multi-file registry not found: ${registryDir}. Partial loading requires directory structure.`,
      { path: registryDir }
    );
  }

  // Find all matching files
  const allFiles = await findYamlFiles(registryDir);
  const matchingFiles: string[] = [];

  for (const filePath of allFiles) {
    const relativePath = path.relative(registryDir, filePath);
    const relativeWithoutExt = relativePath.replace(/\.(yaml|yml)$/, '');

    // Check if file matches any pattern
    for (const pattern of patterns) {
      if (matchesPattern(relativeWithoutExt, pattern)) {
        matchingFiles.push(filePath);
        break;
      }
    }
  }

  // Always include mixins and base if requested
  if (includeMixins) {
    const mixinsPath = path.join(registryDir, '_mixins.yaml');
    if (await fileExists(mixinsPath)) {
      if (!matchingFiles.includes(mixinsPath)) {
        matchingFiles.push(mixinsPath);
      }
    }
  }

  if (includeBase) {
    const basePath = path.join(registryDir, 'base.yaml');
    if (await fileExists(basePath)) {
      if (!matchingFiles.includes(basePath)) {
        matchingFiles.push(basePath);
      }
    }
  }

  if (matchingFiles.length === 0) {
    throw new RegistryError(
      ErrorCodes.INVALID_REGISTRY,
      `No files match patterns: ${patterns.join(', ')}`,
      { patterns, registryDir }
    );
  }

  // Load and merge matching files
  return loadRegistryFromFiles(matchingFiles);
}

/**
 * Load registry from specific files.
 * Useful for testing individual architecture files.
 *
 * @param filePaths - Array of file paths to load
 * @param options - Optional settings for dependency resolution
 * @param options.resolveDependencies - If true, automatically load parent architectures
 * @param options.registryDir - Registry directory for resolving dependencies
 *
 * @example
 * const registry = await loadRegistryFromFiles([
 *   '.arch/registry/base.yaml',
 *   '.arch/registry/cli/command.yaml'
 * ]);
 *
 * @example
 * // Auto-resolve parent architectures
 * const registry = await loadRegistryFromFiles(
 *   ['.arch/registry/cli/command.yaml'],
 *   { resolveDependencies: true, registryDir: '.arch/registry' }
 * );
 */
export async function loadRegistryFromFiles(
  filePaths: string[],
  options: { resolveDependencies?: boolean; registryDir?: string } = {}
): Promise<Registry> {
  const { resolveDependencies = false, registryDir } = options;
  const merged: { nodes: Record<string, ArchitectureNode>; mixins: Record<string, ArchitectureNode> } = {
    nodes: {},
    mixins: {},
  };
  const loadedFiles = new Set<string>();
  const filesToLoad = [...filePaths];

  // Helper to load a single file and track what was loaded
  async function loadFile(filePath: string): Promise<{ inherits: string[]; mixinRefs: string[] }> {
    if (loadedFiles.has(filePath)) {
      return { inherits: [], mixinRefs: [] };
    }
    loadedFiles.add(filePath);

    const content = await loadYaml<Record<string, unknown>>(filePath);
    if (!content || typeof content !== 'object') {
      return { inherits: [], mixinRefs: [] };
    }

    const fileName = path.basename(filePath);
    const isMixinsFile = fileName === '_mixins.yaml' || fileName === '_mixins.yml';
    const inheritsRefs: string[] = [];
    const mixinRefs: string[] = [];

    if (isMixinsFile) {
      for (const [key, value] of Object.entries(content)) {
        if (value && typeof value === 'object') {
          merged.mixins[key] = value as ArchitectureNode;
        }
      }
    } else {
      const { mixins: fileMixins, ...fileNodes } = content as {
        mixins?: Record<string, ArchitectureNode>;
        [key: string]: unknown;
      };

      if (fileMixins && typeof fileMixins === 'object') {
        for (const [key, value] of Object.entries(fileMixins)) {
          if (value && typeof value === 'object') {
            merged.mixins[key] = value as ArchitectureNode;
          }
        }
      }

      for (const [key, value] of Object.entries(fileNodes)) {
        if (value && typeof value === 'object') {
          const node = value as ArchitectureNode;
          merged.nodes[key] = node;

          // Track dependencies for resolution
          if (resolveDependencies) {
            if (node.inherits && !merged.nodes[node.inherits]) {
              inheritsRefs.push(node.inherits);
            }
            if (node.mixins) {
              for (const mixin of node.mixins) {
                if (!merged.mixins[mixin]) {
                  mixinRefs.push(mixin);
                }
              }
            }
          }
        }
      }
    }

    return { inherits: inheritsRefs, mixinRefs };
  }

  // Load files, resolving dependencies if requested
  while (filesToLoad.length > 0) {
    const currentFile = filesToLoad.shift()!;

    try {
      const { inherits, mixinRefs } = await loadFile(currentFile);

      // Resolve parent architectures
      if (resolveDependencies && registryDir) {
        for (const parentId of inherits) {
          const parentFile = await findArchitectureFile(registryDir, parentId);
          if (parentFile && !loadedFiles.has(parentFile)) {
            filesToLoad.push(parentFile);
          }
        }

        // Load mixins file if needed
        if (mixinRefs.length > 0) {
          const mixinsFile = path.join(registryDir, '_mixins.yaml');
          if (await fileExists(mixinsFile) && !loadedFiles.has(mixinsFile)) {
            filesToLoad.push(mixinsFile);
          }
        }
      }
    } catch (error) {
      throw new RegistryError(
        ErrorCodes.INVALID_REGISTRY,
        `Failed to load registry file ${currentFile}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { path: currentFile, originalError: error }
      );
    }
  }

  // Validate merged registry
  const result = RegistrySchema.safeParse({ ...merged.nodes, mixins: merged.mixins });

  if (!result.success) {
    throw new RegistryError(
      ErrorCodes.INVALID_REGISTRY,
      `Registry validation failed: ${result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`,
      { errors: result.error.issues }
    );
  }

  return result.data;
}

/**
 * Find the file containing an architecture ID in the registry directory.
 * Maps architecture IDs to file paths:
 * - archcodex.cli → cli/_index.yaml
 * - archcodex.cli.command → cli/command.yaml
 * - base → base.yaml
 */
async function findArchitectureFile(registryDir: string, archId: string): Promise<string | null> {
  // Try direct mapping first (e.g., "base" → "base.yaml")
  const directPath = path.join(registryDir, `${archId}.yaml`);
  if (await fileExists(directPath)) {
    return directPath;
  }

  // Try hierarchical mapping (e.g., "archcodex.cli.command" → "cli/command.yaml")
  const parts = archId.split('.');

  // Skip common prefix (e.g., "archcodex")
  const startIdx = parts[0] === 'archcodex' ? 1 : 0;
  const relevantParts = parts.slice(startIdx);

  if (relevantParts.length === 0) {
    return null;
  }

  // Try as file (e.g., cli/command.yaml)
  const filePath = path.join(registryDir, ...relevantParts.slice(0, -1), `${relevantParts[relevantParts.length - 1]}.yaml`);
  if (await fileExists(filePath)) {
    return filePath;
  }

  // Try as _index file (e.g., cli/_index.yaml for archcodex.cli)
  const indexPath = path.join(registryDir, ...relevantParts, '_index.yaml');
  if (await fileExists(indexPath)) {
    return indexPath;
  }

  // Try parent directory's _index file
  if (relevantParts.length > 0) {
    const parentIndexPath = path.join(registryDir, ...relevantParts.slice(0, -1), '_index.yaml');
    if (await fileExists(parentIndexPath)) {
      // Check if this file contains the architecture
      const content = await loadYaml<Record<string, unknown>>(parentIndexPath);
      if (content && archId in content) {
        return parentIndexPath;
      }
    }
  }

  return null;
}

/**
 * Check if a path matches a glob-like pattern.
 * Supports:
 * - Exact match: 'cli/command' matches 'cli/command'
 * - Single wildcard: 'cli/*' matches 'cli/command' but not 'cli/sub/item'
 * - Double wildcard: 'cli/**' matches 'cli/command' and 'cli/sub/item'
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Normalize paths
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Exact match
  if (normalizedPath === normalizedPattern) {
    return true;
  }

  // Handle _index files (cli/_index matches cli pattern)
  if (normalizedPath.endsWith('/_index') && normalizedPattern === path.dirname(normalizedPath)) {
    return true;
  }

  // Handle ** (matches any depth)
  if (normalizedPattern.includes('**')) {
    const parts = normalizedPattern.split('**');
    if (parts.length === 2) {
      const [prefix, suffix] = parts;
      const startsOk = !prefix || normalizedPath.startsWith(prefix);
      const endsOk = !suffix || normalizedPath.endsWith(suffix.replace(/^\//, ''));
      return startsOk && endsOk;
    }
  }

  // Handle * (matches single level)
  if (normalizedPattern.includes('*') && !normalizedPattern.includes('**')) {
    const regex = new RegExp('^' + normalizedPattern.replace(/\*/g, '[^/]+') + '$');
    return regex.test(normalizedPath);
  }

  return false;
}

