/**
 * @arch archcodex.core.domain
 * @intent:registry-infrastructure
 *
 * Component groups loader and query functions.
 * Loads .arch/component-groups.yaml and provides lookup by entity/mutation.
 */
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import {
  ComponentGroupsRegistrySchema,
  type ComponentGroupsRegistry,
  type ComponentGroupDefinition,
} from './schema.js';
import { loadYamlWithSchema, fileExists } from '../../utils/index.js';
import { RegistryError, ErrorCodes } from '../../utils/errors.js';

const DEFAULT_COMPONENT_GROUPS_FILE = '.arch/component-groups.yaml';

/**
 * Match result for component group queries.
 */
export interface ComponentGroupMatch {
  /** Group name */
  name: string;
  /** The group definition */
  group: ComponentGroupDefinition;
}

/**
 * Load component groups registry from .arch/component-groups.yaml.
 * Returns an empty registry if file doesn't exist.
 */
export async function loadComponentGroupsRegistry(
  projectRoot: string
): Promise<ComponentGroupsRegistry> {
  const filePath = path.resolve(projectRoot, DEFAULT_COMPONENT_GROUPS_FILE);

  if (!(await fileExists(filePath))) {
    // Return empty registry if no component groups file
    return { 'component-groups': {} };
  }

  try {
    return await loadYamlWithSchema(filePath, ComponentGroupsRegistrySchema);
  } catch (error) {
    if (error instanceof RegistryError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new RegistryError(
        ErrorCodes.INVALID_REGISTRY,
        `Failed to load component groups from ${filePath}: ${error.message}`,
        { path: filePath, originalError: error.message }
      );
    }
    throw error;
  }
}

/**
 * Check if component groups registry has any groups defined.
 */
export function hasComponentGroups(registry: ComponentGroupsRegistry): boolean {
  return Object.keys(registry['component-groups']).length > 0;
}

/**
 * List all component group names.
 */
export function listComponentGroupNames(registry: ComponentGroupsRegistry): string[] {
  return Object.keys(registry['component-groups']);
}

/**
 * Get a component group by name.
 */
export function getComponentGroup(
  registry: ComponentGroupsRegistry,
  groupName: string
): ComponentGroupDefinition | undefined {
  return registry['component-groups'][groupName];
}

/**
 * Find component groups that match a given entity name.
 * Matches against triggers.entities array.
 */
export function findComponentGroupsByEntity(
  registry: ComponentGroupsRegistry,
  entityName: string
): ComponentGroupMatch[] {
  const matches: ComponentGroupMatch[] = [];

  for (const [name, group] of Object.entries(registry['component-groups'])) {
    if (group.triggers?.entities) {
      for (const triggerEntity of group.triggers.entities) {
        // Exact match or case-insensitive match
        if (
          triggerEntity === entityName ||
          triggerEntity.toLowerCase() === entityName.toLowerCase()
        ) {
          matches.push({ name, group });
          break;
        }
      }
    }
  }

  return matches;
}

/**
 * Find component groups that match a mutation name pattern.
 * Matches against triggers.mutation_patterns using glob-style matching.
 */
export function findComponentGroupsByMutation(
  registry: ComponentGroupsRegistry,
  mutationName: string
): ComponentGroupMatch[] {
  const matches: ComponentGroupMatch[] = [];

  for (const [name, group] of Object.entries(registry['component-groups'])) {
    if (group.triggers?.mutation_patterns) {
      for (const pattern of group.triggers.mutation_patterns) {
        // Convert glob-like pattern to work with minimatch
        // e.g., "*Entry" becomes "*Entry" which minimatch handles
        if (minimatch(mutationName, pattern, { nocase: true })) {
          matches.push({ name, group });
          break;
        }
      }
    }
  }

  return matches;
}

/**
 * Find component groups matching either entity or mutation.
 */
export function findComponentGroups(
  registry: ComponentGroupsRegistry,
  options: { entity?: string; mutation?: string }
): ComponentGroupMatch[] {
  const seen = new Set<string>();
  const matches: ComponentGroupMatch[] = [];

  if (options.entity) {
    for (const match of findComponentGroupsByEntity(registry, options.entity)) {
      if (!seen.has(match.name)) {
        seen.add(match.name);
        matches.push(match);
      }
    }
  }

  if (options.mutation) {
    for (const match of findComponentGroupsByMutation(registry, options.mutation)) {
      if (!seen.has(match.name)) {
        seen.add(match.name);
        matches.push(match);
      }
    }
  }

  return matches;
}

/**
 * Format a component group for display in context output.
 * Returns a structured object suitable for inclusion in entity_context.
 */
export function formatComponentGroupForContext(
  match: ComponentGroupMatch
): Record<string, unknown> {
  const { name, group } = match;

  const result: Record<string, unknown> = {
    group: name,
  };

  if (group.warning) {
    result.warning = group.warning;
  }

  if (group.components && group.components.length > 0) {
    result.components = group.components.map((c) => {
      const item: Record<string, string> = { path: c.path };
      if (c.renders) {
        item.renders = c.renders;
      }
      return item;
    });
  }

  if (group.related) {
    result.related = group.related;
  }

  return result;
}

// === Checklist Expansion ===
// @see spec.archcodex.actionChecklist in .arch/specs/archcodex/action-checklist.spec.yaml

/**
 * Expanded checklist with all sections populated.
 */
export interface ExpandedChecklist {
  /** Backend checklist items */
  backend?: string[];
  /** Frontend checklist items */
  frontend?: string[];
  /** UI checklist items (expanded from component groups) */
  ui?: string[];
  /** Original format for backward compatibility */
  format: 'flat' | 'structured';
  /** Flat checklist items (when format is 'flat') */
  flat?: string[];
}

/**
 * Structured checklist UI section input.
 */
interface StructuredUIInput {
  from_component_group?: string;
  items?: string[];
  additional?: string[];
}

/**
 * Structured checklist input.
 */
interface StructuredChecklistInput {
  backend?: string[];
  frontend?: string[];
  ui?: string[] | StructuredUIInput;
}

/**
 * Expand a checklist, resolving component group references.
 *
 * @param checklist - Flat array or structured checklist
 * @param registry - Component groups registry for expansion
 * @param triggers - Optional triggers for auto-matching component groups
 * @returns Expanded checklist with all sections
 *
 * @example
 * // Flat format passthrough
 * expandChecklist(['Step 1', 'Step 2'], registry)
 * // => { format: 'flat', flat: ['Step 1', 'Step 2'] }
 *
 * @example
 * // Structured with component group expansion
 * expandChecklist({
 *   backend: ['Create mutation'],
 *   ui: { from_component_group: 'product-cards', additional: ['Add to bulk toolbar'] }
 * }, registry)
 * // => { format: 'structured', backend: [...], ui: ['Wire to ALL 5 components:', '  [ ] ProductCard', ...] }
 */
export function expandChecklist(
  checklist: string[] | StructuredChecklistInput,
  registry: ComponentGroupsRegistry,
  triggers?: { entities?: string[]; mutation_patterns?: string[] }
): ExpandedChecklist {
  // Handle flat array format (backward compatible)
  if (Array.isArray(checklist)) {
    return {
      format: 'flat',
      flat: checklist,
    };
  }

  // Handle structured format
  const result: ExpandedChecklist = {
    format: 'structured',
  };

  // Copy backend and frontend directly
  if (checklist.backend && checklist.backend.length > 0) {
    result.backend = [...checklist.backend];
  }

  if (checklist.frontend && checklist.frontend.length > 0) {
    result.frontend = [...checklist.frontend];
  }

  // Handle UI section with potential component group expansion
  if (checklist.ui) {
    if (Array.isArray(checklist.ui)) {
      // Simple array of UI items
      result.ui = [...checklist.ui];
    } else {
      // Structured UI with potential component group reference
      result.ui = expandUIChecklist(checklist.ui, registry, triggers);
    }
  }

  return result;
}

/**
 * Expand UI checklist section with component group.
 */
function expandUIChecklist(
  ui: StructuredUIInput,
  registry: ComponentGroupsRegistry,
  triggers?: { entities?: string[]; mutation_patterns?: string[] }
): string[] {
  const items: string[] = [];

  // Handle from_component_group
  if (ui.from_component_group) {
    const groupName = ui.from_component_group === 'auto'
      ? findAutoMatchGroup(registry, triggers)
      : ui.from_component_group;

    if (groupName) {
      const group = getComponentGroup(registry, groupName);
      if (group) {
        // Add header with component count
        items.push(`Wire to ALL ${group.components.length} ${groupName.replace(/-/g, ' ')}:`);

        // Add each component as a checklist item
        for (const component of group.components) {
          const fileName = component.path.split('/').pop() || component.path;
          const rendersInfo = component.renders ? ` (${component.renders})` : '';
          items.push(`  [ ] ${fileName}${rendersInfo}`);
        }
      } else {
        // Group not found - add warning
        items.push(`Warning: Component group '${groupName}' not found`);
      }
    }
  }

  // Add static items
  if (ui.items) {
    items.push(...ui.items);
  }

  // Add additional items
  if (ui.additional) {
    items.push(...ui.additional);
  }

  return items;
}

/**
 * Find component group by auto-matching from triggers.
 */
function findAutoMatchGroup(
  registry: ComponentGroupsRegistry,
  triggers?: { entities?: string[]; mutation_patterns?: string[] }
): string | null {
  if (!triggers) {
    return null;
  }

  // Try matching by entity first
  if (triggers.entities) {
    for (const entity of triggers.entities) {
      const matches = findComponentGroupsByEntity(registry, entity);
      if (matches.length > 0) {
        return matches[0].name;
      }
    }
  }

  // Try matching by mutation pattern
  if (triggers.mutation_patterns) {
    for (const pattern of triggers.mutation_patterns) {
      // Use the pattern itself as a sample mutation name for matching
      const matches = findComponentGroupsByMutation(registry, pattern.replace(/\*/g, 'test'));
      if (matches.length > 0) {
        return matches[0].name;
      }
    }
  }

  return null;
}
