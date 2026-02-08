/**
 * @arch archcodex.core.domain
 * @intent:registry-infrastructure
 *
 * Intent registry loader - load, query, and suggest intents.
 */
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import {
  IntentRegistrySchema,
  type IntentRegistry,
} from './schema.js';
import { loadYamlWithSchema, fileExists } from '../../utils/index.js';
import { RegistryError, ErrorCodes } from '../../utils/errors.js';

const DEFAULT_REGISTRY_DIR = '.arch/registry';
const DEFAULT_INTENTS_FILE = '_intents.yaml';

/**
 * Load intent registry from _intents.yaml.
 * Returns an empty registry if file doesn't exist.
 */
export async function loadIntentRegistry(projectRoot: string): Promise<IntentRegistry> {
  const dirPath = path.resolve(projectRoot, DEFAULT_REGISTRY_DIR);
  const intentsPath = path.join(dirPath, DEFAULT_INTENTS_FILE);

  if (!(await fileExists(intentsPath))) {
    // Return empty registry if no intents file
    return { intents: {} };
  }

  try {
    return await loadYamlWithSchema(intentsPath, IntentRegistrySchema);
  } catch (error) {
    if (error instanceof RegistryError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new RegistryError(
        ErrorCodes.INVALID_REGISTRY,
        `Failed to load intent registry from ${intentsPath}: ${error.message}`,
        { path: intentsPath, originalError: error.message }
      );
    }
    throw error;
  }
}

/**
 * Check if an intent exists in the registry.
 */
export function hasIntent(intentRegistry: IntentRegistry, intentName: string): boolean {
  return intentName in intentRegistry.intents;
}

/**
 * Get all intent names from the registry.
 */
export function listIntentNames(intentRegistry: IntentRegistry): string[] {
  return Object.keys(intentRegistry.intents);
}

/**
 * Get intents grouped by category.
 */
export function getIntentsByCategory(intentRegistry: IntentRegistry): Map<string, string[]> {
  const categories = new Map<string, string[]>();

  for (const [name, definition] of Object.entries(intentRegistry.intents)) {
    const category = definition.category || 'uncategorized';
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(name);
  }

  return categories;
}

/**
 * Intent suggestion with match reason.
 */
export interface IntentSuggestion {
  /** Intent name */
  name: string;
  /** Why this intent was suggested */
  reason: 'path' | 'architecture';
  /** The pattern that matched */
  matchedPattern: string;
  /** Intent description */
  description: string;
  /** Intent category */
  category?: string;
}

/**
 * Suggest intents based on file path and/or architecture.
 * Returns intents whose suggest_for_paths or suggest_for_archs patterns match.
 */
export function suggestIntents(
  intentRegistry: IntentRegistry,
  options: {
    filePath?: string;
    archId?: string;
  }
): IntentSuggestion[] {
  const suggestions: IntentSuggestion[] = [];
  const seen = new Set<string>();

  for (const [name, definition] of Object.entries(intentRegistry.intents)) {
    // Check path patterns
    if (options.filePath && definition.suggest_for_paths) {
      for (const pattern of definition.suggest_for_paths) {
        if (minimatch(options.filePath, pattern, { dot: true })) {
          if (!seen.has(name)) {
            seen.add(name);
            suggestions.push({
              name,
              reason: 'path',
              matchedPattern: pattern,
              description: definition.description,
              category: definition.category,
            });
          }
          break;
        }
      }
    }

    // Check architecture patterns
    if (options.archId && definition.suggest_for_archs) {
      for (const pattern of definition.suggest_for_archs) {
        if (matchArchPattern(options.archId, pattern)) {
          if (!seen.has(name)) {
            seen.add(name);
            suggestions.push({
              name,
              reason: 'architecture',
              matchedPattern: pattern,
              description: definition.description,
              category: definition.category,
            });
          }
          break;
        }
      }
    }
  }

  return suggestions;
}

/**
 * Match an architecture ID against a pattern.
 * Supports:
 * - Exact match: "api.admin.users"
 * - Wildcard suffix: "api.admin.*" matches "api.admin.users", "api.admin.roles"
 * - Wildcard prefix: "*.admin.*" matches "api.admin.users", "domain.admin.roles"
 */
function matchArchPattern(archId: string, pattern: string): boolean {
  // Exact match
  if (archId === pattern) {
    return true;
  }

  // Convert pattern to regex
  // Replace * with .* but escape dots first
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '[^.]*');

  try {
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(archId);
  } catch { /* invalid regex pattern */
    return false;
  }
}
