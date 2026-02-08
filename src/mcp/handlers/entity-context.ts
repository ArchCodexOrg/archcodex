/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP handler for entity context extraction - synthesized mental model for entities.
 *
 * Usage:
 *   No entity param           → list all entities
 *   Single entity             → exact match shows full context, partial shows search
 *   Multiple entities         → full context for each (array or comma-separated)
 */

import { dirname } from 'path';
import { access } from 'fs/promises';
import type {
  ContextRequest,
  SynthesizedContext,
  ContextFormatOptions,
  ContextListOptions,
  UIComponentsContext,
} from '../../core/context/types.js';
import {
  loadComponentGroupsRegistry,
  findComponentGroupsByEntity,
  type ComponentGroupMatch,
} from '../../core/registry/component-groups.js';
import type { CachedEntitiesResult } from '../../core/context/synthesizer.js';
import { getDbSync, getMeta } from '../../core/db/manager.js';
import { initializeSchema } from '../../core/db/schema.js';
import { DatabaseScanner } from '../../core/db/scanner.js';
import { getGitCommitHash } from '../../utils/git.js';

/** Function types for dynamic imports */
type SynthesizeContextFn = (request: ContextRequest) => Promise<SynthesizedContext | null>;
type FormatContextFn = (context: SynthesizedContext, options: ContextFormatOptions) => string;
type ListEntitiesFn = (options: ContextListOptions) => Promise<CachedEntitiesResult>;

/**
 * Ensure the architecture map database is up-to-date.
 * Does incremental sync if git commit changed since last sync.
 */
async function ensureDbUpToDate(projectRoot: string): Promise<void> {
  try {
    const db = getDbSync(projectRoot);
    initializeSchema(db);
    const scanner = new DatabaseScanner(db, projectRoot);

    if (scanner.needsFullScan()) {
      await scanner.fullScan();
    } else {
      const lastCommit = getMeta(db, 'last_git_commit');
      const currentCommit = getGitCommitHash(projectRoot);
      if (currentCommit && lastCommit !== currentCommit) {
        await scanner.incrementalSync();
      }
    }
  } catch { /* database sync best-effort, don't fail request */ }
}

/** Known schema file patterns to look for when walking up directories */
const SCHEMA_PATTERNS = [
  'convex/schema.ts',
  'prisma/schema.prisma',
  // Future: add more patterns as extractors are added
];

/** Session-level cache for resolved schema project root */
let cachedSchemaProjectRoot: string | null = null;

/**
 * Find a nearby project with a schema source by walking up directories.
 */
async function findNearbySchemaProject(startDir: string): Promise<string | null> {
  let dir = startDir;
  const root = dirname(dir) === dir ? dir : '/';

  while (dir !== root) {
    for (const pattern of SCHEMA_PATTERNS) {
      try {
        await access(`${dir}/${pattern}`);
        return dir;
      } catch { /* schema not found at this pattern, continue */ }
    }
    dir = dirname(dir);
  }

  return null;
}

/**
 * Resolve the project root by checking if schema exists, otherwise walk up directories.
 * Caches the result for the session so subsequent calls don't need to re-discover.
 *
 * @param projectRoot - The project root to check
 * @param explicit - If true, projectRoot was explicitly provided and should override cache
 * @returns The resolved root (may be same as input if schema found there).
 */
async function resolveSchemaProjectRoot(projectRoot: string, explicit: boolean): Promise<string> {
  // If explicit projectRoot provided, use it and update cache (don't use old cache)
  if (explicit) {
    // Check if schema exists at explicit root
    for (const pattern of SCHEMA_PATTERNS) {
      try {
        await access(`${projectRoot}/${pattern}`);
        cachedSchemaProjectRoot = projectRoot;
        return projectRoot;
      } catch { /* continue checking other patterns */ }
    }
    // Try walking up from explicit root
    const nearbyProject = await findNearbySchemaProject(projectRoot);
    if (nearbyProject) {
      cachedSchemaProjectRoot = nearbyProject;
      return nearbyProject;
    }
    // Explicit root has no schema, still cache it as the intended root
    cachedSchemaProjectRoot = projectRoot;
    return projectRoot;
  }

  // Use cached root if available and still valid
  if (cachedSchemaProjectRoot) {
    // Verify the cached root still has a schema
    for (const pattern of SCHEMA_PATTERNS) {
      try {
        await access(`${cachedSchemaProjectRoot}/${pattern}`);
        return cachedSchemaProjectRoot;
      } catch { /* continue checking other patterns */ }
    }
    // Cache invalid, clear it
    cachedSchemaProjectRoot = null;
  }

  // First check if schema exists at current projectRoot
  for (const pattern of SCHEMA_PATTERNS) {
    try {
      await access(`${projectRoot}/${pattern}`);
      cachedSchemaProjectRoot = projectRoot;
      return projectRoot;
    } catch { /* continue checking other patterns */ }
  }

  // Not found at current root, try walking up
  const nearbyProject = await findNearbySchemaProject(projectRoot);
  if (nearbyProject) {
    cachedSchemaProjectRoot = nearbyProject;
    return nearbyProject;
  }

  return projectRoot;
}

/**
 * Build a helpful error message when no schema source is found.
 */
function buildNoSchemaError(projectRoot: string, nearbyProject: string | null): string {
  const lines = [
    'No schema source found (Convex, Prisma, etc.) in this project.',
    '',
    `Current project root: ${projectRoot}`,
    '',
    'Supported schema sources:',
    '  - Convex: convex/schema.ts',
    '  - Prisma: prisma/schema.prisma (coming soon)',
    '',
  ];

  if (nearbyProject && nearbyProject !== projectRoot) {
    lines.push(
      `Found a schema in a parent directory: ${nearbyProject}`,
      '',
      'To use it, either:',
      `  1. Use projectRoot parameter: { "projectRoot": "${nearbyProject}", "entity": "..." }`,
      `  2. Run from the project root directory`,
    );
  } else {
    lines.push(
      'Make sure you are running from the project root directory,',
      'or provide the projectRoot parameter explicitly.',
    );
  }

  return lines.join('\n');
}

export interface EntityContextOptions {
  /** Entity name(s) - string, comma-separated string, or array */
  entity?: string | string[];
  /** Operation hint (e.g., "duplicate", "delete") */
  operation?: string;
  /** Output format */
  format?: 'yaml' | 'json' | 'compact';
  /** Force cache refresh */
  refresh?: boolean;
  /** Whether projectRoot was explicitly provided (overrides cache) */
  explicitProjectRoot?: boolean;
  /** Maximum number of file references to return (default: 15) */
  maxFiles?: number;
  /** Return all file references without filtering (default: false) */
  verbose?: boolean;
}

/**
 * Parse entity names from input - supports string, comma-separated string, or array.
 */
function parseEntityNames(input: string | string[] | undefined): string[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    // Flatten any comma-separated values in the array
    const entities: string[] = [];
    for (const item of input) {
      const parts = item.split(',').map(s => s.trim()).filter(s => s.length > 0);
      entities.push(...parts);
    }
    return entities;
  }

  // Single string - split by comma
  return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

export async function handleEntityContext(projectRoot: string, options: EntityContextOptions) {
  const { synthesizeContext, formatContext, listEntities } = await import('../../core/context/index.js');

  // Auto-resolve projectRoot by walking up directories to find a schema source
  const resolvedRoot = await resolveSchemaProjectRoot(projectRoot, options.explicitProjectRoot ?? false);

  // Ensure architecture map database is up-to-date for file references
  await ensureDbUpToDate(resolvedRoot);

  // Parse entity names
  const entities = parseEntityNames(options.entity);

  // No entity param: list all entities
  if (entities.length === 0) {
    const result = await listEntities({
      projectRoot: resolvedRoot,
      refresh: options.refresh,
    });

    if (result.source === null) {
      // No schema found even after walking up - show helpful error
      return {
        content: [{
          type: 'text',
          text: buildNoSchemaError(projectRoot, null),
        }],
        isError: true,
      };
    }

    if (result.entities.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No entities found in schema.',
        }],
      };
    }

    const cacheStatus = result.fromCache ? 'cached' : 'fresh';
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          entities: result.entities,
          count: result.entities.length,
          source: result.source,
          cacheStatus,
          hint: 'Provide entity parameter for full context (exact name) or to search (partial name)',
        }, null, 2),
      }],
    };
  }

  // Single entity: exact match or search fallback
  if (entities.length === 1) {
    return handleSingleEntity(entities[0], resolvedRoot, options, synthesizeContext, formatContext, listEntities);
  }

  // Multiple entities: get context for each
  return handleMultipleEntities(entities, resolvedRoot, options, synthesizeContext, formatContext);
}

/**
 * Convert a ComponentGroupMatch to UIComponentsContext.
 */
function matchToUIContext(match: ComponentGroupMatch): UIComponentsContext {
  return {
    group: match.name,
    warning: match.group.warning,
    components: match.group.components.map((c) => ({
      path: c.path,
      renders: c.renders,
    })),
    related: match.group.related as UIComponentsContext['related'],
  };
}

/**
 * Attach UI components to context if a matching component group is found.
 */
async function attachUIComponents(
  context: SynthesizedContext,
  projectRoot: string
): Promise<SynthesizedContext> {
  try {
    const registry = await loadComponentGroupsRegistry(projectRoot);
    const matches = findComponentGroupsByEntity(registry, context.entity);

    if (matches.length > 0) {
      // Use the first matching group
      return {
        ...context,
        uiComponents: matchToUIContext(matches[0]),
      };
    }
  } catch { /* component groups optional enrichment */ }

  return context;
}

/**
 * Handle single entity - exact match or search fallback.
 */
async function handleSingleEntity(
  entity: string,
  projectRoot: string,
  options: EntityContextOptions,
  synthesizeContext: SynthesizeContextFn,
  formatContext: FormatContextFn,
  listEntities: ListEntitiesFn
) {
  const context = await synthesizeContext({
    focus: entity,
    operation: options.operation,
    projectRoot,
    maxFiles: options.maxFiles,
    verbose: options.verbose,
  });

  if (context) {
    // Exact match found - attach UI components and return full context
    const enrichedContext = await attachUIComponents(context, projectRoot);
    const format = options.format || 'yaml';
    const output = formatContext(enrichedContext, { format });
    return {
      content: [{
        type: 'text',
        text: output,
      }],
    };
  }

  // No exact match - search for similar entities
  const result = await listEntities({
    projectRoot,
    search: entity,
    refresh: options.refresh,
  });

  if (result.source === null) {
    // Already resolved root, so no schema exists anywhere up the tree
    return {
      content: [{
        type: 'text',
        text: buildNoSchemaError(projectRoot, null),
      }],
      isError: true,
    };
  }

  if (result.entities.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No entities matching "${entity}".`,
      }],
    };
  }

  // Return search results
  const cacheStatus = result.fromCache ? 'cached' : 'fresh';
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `No exact match for "${entity}"`,
        similarEntities: result.entities,
        count: result.entities.length,
        cacheStatus,
        hint: 'Use exact entity name for full context',
      }, null, 2),
    }],
  };
}

/**
 * Handle multiple entities - get context for each.
 */
async function handleMultipleEntities(
  entities: string[],
  projectRoot: string,
  options: EntityContextOptions,
  synthesizeContext: SynthesizeContextFn,
  formatContext: FormatContextFn
) {
  const contexts: Array<{ entity: string; context: string }> = [];
  const notFound: string[] = [];

  const format = options.format || 'yaml';

  // Get context for each entity
  for (const entity of entities) {
    const context = await synthesizeContext({
      focus: entity,
      operation: options.operation,
      projectRoot,
      maxFiles: options.maxFiles,
      verbose: options.verbose,
    });

    if (context) {
      // Attach UI components if matching component group found
      const enrichedContext = await attachUIComponents(context, projectRoot);
      const output = formatContext(enrichedContext, { format });
      contexts.push({ entity: context.entity, context: output });
    } else {
      notFound.push(entity);
    }
  }

  if (contexts.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No matching entities found for: ${entities.join(', ')}`,
      }],
      isError: true,
    };
  }

  // Build combined output
  const separator = '\n\n' + '═'.repeat(50) + '\n\n';
  const combinedOutput = contexts.map(c => c.context).join(separator);

  const result: Record<string, unknown> = {
    foundEntities: contexts.map(c => c.entity),
    count: contexts.length,
  };

  if (notFound.length > 0) {
    result.notFound = notFound;
  }

  return {
    content: [
      {
        type: 'text',
        text: combinedOutput,
      },
      {
        type: 'text',
        text: '\n---\n' + JSON.stringify(result, null, 2),
      },
    ],
  };
}
