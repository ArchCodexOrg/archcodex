/**
 * @arch archcodex.core.domain
 * @intent:registry-infrastructure
 *
 * Action registry loader - load, query, and match actions.
 */
import * as path from 'node:path';
import {
  ActionRegistrySchema,
  type ActionRegistry,
  type ActionDefinition,
} from './schema.js';
import { loadYamlWithSchema, fileExists } from '../../utils/index.js';
import { RegistryError, ErrorCodes } from '../../utils/errors.js';

const DEFAULT_REGISTRY_DIR = '.arch/registry';
const DEFAULT_ACTIONS_FILE = '_actions.yaml';

/**
 * Load action registry from _actions.yaml.
 * Returns an empty registry if file doesn't exist.
 */
export async function loadActionRegistry(projectRoot: string): Promise<ActionRegistry> {
  const dirPath = path.resolve(projectRoot, DEFAULT_REGISTRY_DIR);
  const actionsPath = path.join(dirPath, DEFAULT_ACTIONS_FILE);

  if (!(await fileExists(actionsPath))) {
    // Return empty registry if no actions file
    return { actions: {} };
  }

  try {
    return await loadYamlWithSchema(actionsPath, ActionRegistrySchema);
  } catch (error) {
    if (error instanceof RegistryError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new RegistryError(
        ErrorCodes.INVALID_REGISTRY,
        `Failed to load action registry from ${actionsPath}: ${error.message}`,
        { path: actionsPath, originalError: error.message }
      );
    }
    throw error;
  }
}

/**
 * Check if an action exists in the registry.
 */
export function hasAction(actionRegistry: ActionRegistry, actionName: string): boolean {
  return actionName in actionRegistry.actions;
}

/**
 * Get all action names from the registry.
 */
export function listActionNames(actionRegistry: ActionRegistry): string[] {
  return Object.keys(actionRegistry.actions);
}

/**
 * Get an action definition by name.
 */
export function getAction(actionRegistry: ActionRegistry, actionName: string): ActionDefinition | undefined {
  return actionRegistry.actions[actionName];
}

/**
 * Action match result with relevance score.
 */
export interface ActionMatch {
  /** Action name */
  name: string;
  /** Match relevance score (0-1) */
  score: number;
  /** How the match was found */
  matchType: 'exact' | 'alias' | 'description';
  /** The action definition */
  action: ActionDefinition;
}

/**
 * Match a query string to actions in the registry.
 * Searches action names, aliases, and descriptions.
 *
 * @param actionRegistry - The action registry to search
 * @param query - The search query (e.g., "add view", "create component")
 * @returns Matching actions sorted by relevance
 */
export function matchAction(actionRegistry: ActionRegistry, query: string): ActionMatch[] {
  const matches: ActionMatch[] = [];
  const normalizedQuery = query.toLowerCase().trim();
  const queryWords = normalizedQuery.split(/\s+/);

  for (const [name, action] of Object.entries(actionRegistry.actions)) {
    const normalizedName = name.toLowerCase().replace(/-/g, ' ');

    // Exact name match
    if (normalizedName === normalizedQuery || name.toLowerCase() === normalizedQuery) {
      matches.push({
        name,
        score: 1.0,
        matchType: 'exact',
        action,
      });
      continue;
    }

    // Check aliases
    if (action.aliases) {
      for (const alias of action.aliases) {
        const normalizedAlias = alias.toLowerCase();
        if (normalizedAlias === normalizedQuery) {
          matches.push({
            name,
            score: 0.95,
            matchType: 'alias',
            action,
          });
          break;
        }
        // Partial alias match
        if (normalizedAlias.includes(normalizedQuery) || normalizedQuery.includes(normalizedAlias)) {
          matches.push({
            name,
            score: 0.8,
            matchType: 'alias',
            action,
          });
          break;
        }
      }
    }

    // Skip if already matched
    if (matches.some(m => m.name === name)) {
      continue;
    }

    // Check name contains query words
    const nameWords = normalizedName.split(/\s+/);
    const nameMatchCount = queryWords.filter(qw =>
      nameWords.some(nw => nw.includes(qw) || qw.includes(nw))
    ).length;

    if (nameMatchCount > 0) {
      const score = (nameMatchCount / queryWords.length) * 0.7;
      matches.push({
        name,
        score,
        matchType: 'exact',
        action,
      });
      continue;
    }

    // Check description
    const normalizedDesc = action.description.toLowerCase();
    const descMatchCount = queryWords.filter(qw => normalizedDesc.includes(qw)).length;

    if (descMatchCount >= queryWords.length / 2) {
      const score = (descMatchCount / queryWords.length) * 0.5;
      matches.push({
        name,
        score,
        matchType: 'description',
        action,
      });
    }
  }

  // Sort by score descending
  return matches.sort((a, b) => b.score - a.score);
}
