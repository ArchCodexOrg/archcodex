/**
 * @arch archcodex.core.domain
 * @intent:registry-infrastructure
 *
 * Utilities for loading registry from git refs.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { RegistrySchema, type Registry } from '../registry/schema.js';
import { parseYaml } from '../../utils/yaml.js';

const execAsync = promisify(exec);
const DEFAULT_REGISTRY_PATH = '.arch/registry.yaml';

/**
 * Validate registry path format to prevent command injection.
 * Only allows safe characters for file paths.
 */
function isValidRegistryPath(registryPath: string): boolean {
  // Allow alphanumeric, dots, dashes, underscores, forward slashes
  // Must not contain path traversal patterns
  const validPathPattern = /^[a-zA-Z0-9._\-/]+$/;
  const dangerousPatterns = [
    /\.\.\//,           // Parent directory traversal
    /^\//,              // Absolute paths (Unix)
    /^[a-zA-Z]:\\/,     // Absolute paths (Windows)
    /\/\.\.\//,         // Embedded parent traversal
  ];

  if (!validPathPattern.test(registryPath)) {
    return false;
  }

  for (const pattern of dangerousPatterns) {
    if (pattern.test(registryPath)) {
      return false;
    }
  }

  return registryPath.length < 256;
}

/**
 * Load registry content from a git ref.
 */
export async function loadRegistryFromRef(
  projectRoot: string,
  ref: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<Registry> {
  try {
    // Validate ref format (basic sanitization)
    if (!isValidGitRef(ref)) {
      throw new Error(`Invalid git ref format: '${ref}'`);
    }

    // Validate registry path to prevent path traversal
    if (!isValidRegistryPath(registryPath)) {
      throw new Error(`Invalid registry path format: '${registryPath}'`);
    }

    // Use git show to get file content at ref
    const { stdout } = await execAsync(`git show ${ref}:${registryPath}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB for large registries
    });

    // Parse YAML and validate with schema
    const rawData = parseYaml(stdout);
    return RegistrySchema.parse(rawData);
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message;
      // Check for common git errors
      if (message.includes('does not exist') || message.includes('exists on disk')) {
        throw new Error(`Registry file '${registryPath}' does not exist at ref '${ref}'`);
      }
      if (message.includes('unknown revision') || message.includes('bad revision')) {
        throw new Error(`Unknown git ref: '${ref}'`);
      }
      if (message.includes('not a git repository')) {
        throw new Error('Not a git repository');
      }
      throw new Error(`Failed to load registry from ${ref}: ${message}`);
    }
    throw error;
  }
}

/**
 * Parse a git range into from/to refs.
 * Supports formats:
 * - "main..feature" -> { from: "main", to: "feature" }
 * - "HEAD~3" -> { from: "HEAD~3", to: "HEAD" }
 * - "abc123" -> { from: "abc123", to: "HEAD" }
 */
export function parseGitRange(range: string): { from: string; to: string } {
  // Handle double-dot notation: main..feature
  if (range.includes('..')) {
    const [from, to] = range.split('..');
    return {
      from: from || 'HEAD',
      to: to || 'HEAD',
    };
  }

  // Single ref - compare to HEAD
  return {
    from: range,
    to: 'HEAD',
  };
}

/**
 * Check if a git ref exists.
 */
export async function gitRefExists(projectRoot: string, ref: string): Promise<boolean> {
  try {
    if (!isValidGitRef(ref)) {
      return false;
    }
    await execAsync(`git rev-parse --verify ${ref}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    return true;
  } catch { /* git ref does not exist or git unavailable */
    return false;
  }
}

/**
 * Get short commit hash for display.
 */
export async function getShortHash(projectRoot: string, ref: string): Promise<string> {
  try {
    if (!isValidGitRef(ref)) {
      return ref;
    }
    const { stdout } = await execAsync(`git rev-parse --short ${ref}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    return stdout.trim();
  } catch { /* git command failed, return ref as-is */
    return ref;
  }
}

/**
 * Validate git ref format to prevent command injection.
 * Allows: branch names, tags, commit hashes, HEAD, HEAD~n, etc.
 */
function isValidGitRef(ref: string): boolean {
  // Allow common git ref patterns:
  // - alphanumeric with dots, dashes, underscores, slashes
  // - HEAD, HEAD~n, HEAD^n
  // - commit hashes (hex)
  // - branch names like feature/my-branch
  const validRefPattern = /^[a-zA-Z0-9._\-/~^]+$/;
  return validRefPattern.test(ref) && ref.length < 256;
}
