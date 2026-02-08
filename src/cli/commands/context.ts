/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Context command - generates synthesized mental model for entities or modules.
 *
 * Usage:
 *   archcodex context                          # List all entities
 *   archcodex context users                    # Full context for "users" entity
 *   archcodex context -m src/core/db/          # Unified context for a module
 *   archcodex context -e users                 # Entity context (explicit)
 *   archcodex context users,todos              # Multiple entities
 *   archcodex context --refresh                # Force cache refresh
 */
import { Command } from 'commander';
import { synthesizeContext, formatContext, listEntities } from '../../core/context/index.js';
import type { ContextFormatOptions, SynthesizedContext } from '../../core/context/types.js';
import { synthesizeUnifiedContext, formatUnifiedContext } from '../../core/unified-context/index.js';
import type { UnifiedContextFormatOptions, ContextSection } from '../../core/unified-context/types.js';
import { ALL_SECTIONS } from '../../core/unified-context/types.js';
import { logger as log } from '../../utils/logger.js';
import { getDbSync, getMeta } from '../../core/db/manager.js';
import { initializeSchema } from '../../core/db/schema.js';
import { DatabaseScanner } from '../../core/db/scanner.js';
import { getGitCommitHash } from '../../utils/git.js';

/**
 * Create the context command.
 */
export function createContextCommand(): Command {
  return new Command('context')
    .description('Get synthesized mental model for modules or entities. Use -m for modules, -e or args for entities.')
    .argument('[entities...]', 'Entity names (exact match shows full context, partial match searches)')
    .option('-m, --module <path>', 'Module/directory path for unified context (e.g., src/core/db/)')
    .option('-e, --entity <name>', 'Entity name (alternative to positional argument)')
    .option('-f, --format <format>', 'Output format: yaml (default for entities), compact (default for modules), json', 'yaml')
    .option('-o, --operation <operation>', 'Operation hint (e.g., "duplicate", "delete")')
    .option('--refresh', 'Force cache refresh (re-extract schema)')
    .option('--full', 'Show full verbose output instead of compact')
    .option('--init', 'Initialize/sync the database without showing context (run this first on large codebases)')
    .option('--sections <sections>', 'Filter to specific sections (comma-separated): project-rules,modification-order,boundaries,entities,impact,constraints')
    .option('--confirm', 'Bypass interactive mode for large modules (>30 files)')
    .option('--summary', 'Show structure summary only (submodule counts, no file lists)')
    .option('--brief', 'Minimal essential info only (arch, boundaries, forbidden)')
    .option('--without-entities', 'Exclude entities section (faster for large modules)')
    .option('--without-impact', 'Exclude impact/consumers section')
    .action(async (entities: string[], options: ContextOptions) => {
      try {
        await runContext(entities, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface ContextOptions {
  format: string;
  operation?: string;
  refresh?: boolean;
  module?: string;
  entity?: string;
  full?: boolean;
  init?: boolean;
  sections?: string;
  confirm?: boolean;
  summary?: boolean;
  brief?: boolean;
  withoutEntities?: boolean;
  withoutImpact?: boolean;
}

/**
 * Parse entity names from args - supports both space-separated and comma-separated.
 */
function parseEntityNames(args: string[]): string[] {
  const entities: string[] = [];
  for (const arg of args) {
    // Split by comma and trim whitespace
    const parts = arg.split(',').map(s => s.trim()).filter(s => s.length > 0);
    entities.push(...parts);
  }
  return entities;
}

async function runContext(rawEntities: string[], options: ContextOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Handle --init: just sync the database and exit
  if (options.init) {
    await initializeDatabase(projectRoot);
    return;
  }

  // Handle module query (unified context)
  if (options.module) {
    await handleModuleContext(options.module, projectRoot, options);
    return;
  }

  // Handle explicit entity option
  if (options.entity) {
    rawEntities = [options.entity, ...rawEntities];
  }

  // Parse entity names (handle comma-separated)
  const entities = parseEntityNames(rawEntities);

  // No argument: list all entities
  if (entities.length === 0) {
    await listAllEntities(projectRoot, options.refresh);
    return;
  }

  // Validate format for entity context
  const format = options.format as ContextFormatOptions['format'];
  if (format !== 'yaml' && format !== 'json' && format !== 'compact') {
    log.error(`Invalid format: ${options.format}. Use 'yaml', 'json', or 'compact'.`);
    process.exit(1);
  }

  // Single entity: use existing behavior (exact match or search)
  if (entities.length === 1) {
    await handleSingleEntity(entities[0], projectRoot, format, options);
    return;
  }

  // Multiple entities: get context for each
  await handleMultipleEntities(entities, projectRoot, format, options);
}

/**
 * Handle single entity - exact match or search fallback.
 */
async function handleSingleEntity(
  entity: string,
  projectRoot: string,
  format: ContextFormatOptions['format'],
  options: ContextOptions
): Promise<void> {
  // Try exact match first
  const context = await synthesizeContext({
    focus: entity,
    operation: options.operation,
    projectRoot,
  });

  if (context) {
    // Exact match found - show full context
    const output = formatContext(context, { format });
    console.log(output);

    log.info(`Entity: ${context.entity}`);
    log.info(`Fields: ${context.fields.length}, Relationships: ${context.relationships.length}, Behaviors: ${context.behaviors.length}`);
    if (context.existingOperations.length > 0) {
      log.info(`Existing operations: ${context.existingOperations.length}`);
    }
    if (context.similarOperations.length > 0) {
      log.info(`Similar operations found: ${context.similarOperations.length}`);
    }
    return;
  }

  // No exact match - search for similar entities
  const result = await listEntities({
    projectRoot,
    search: entity,
    refresh: options.refresh,
  });

  if (result.source === null) {
    log.warn('No schema source found (Convex, Prisma, etc.)');
    return;
  }

  if (result.entities.length === 0) {
    log.warn(`No entities matching "${entity}"`);
    return;
  }

  // Show search results
  const cacheStatus = result.fromCache ? '(cached)' : '(fresh)';
  console.log(`No exact match for "${entity}". Similar entities ${cacheStatus}:`);

  for (const e of result.entities) {
    console.log(`  - ${e}`);
  }

  log.info(`Found ${result.entities.length} matching entities. Use exact name for full context.`);
}

/**
 * Handle multiple entities - get context for each.
 */
async function handleMultipleEntities(
  entities: string[],
  projectRoot: string,
  format: ContextFormatOptions['format'],
  options: ContextOptions
): Promise<void> {
  const contexts: SynthesizedContext[] = [];
  const notFound: string[] = [];

  // Get context for each entity
  for (const entity of entities) {
    const context = await synthesizeContext({
      focus: entity,
      operation: options.operation,
      projectRoot,
    });

    if (context) {
      contexts.push(context);
    } else {
      notFound.push(entity);
    }
  }

  // Warn about entities not found
  if (notFound.length > 0) {
    log.warn(`Entities not found: ${notFound.join(', ')}`);
  }

  if (contexts.length === 0) {
    log.error('No matching entities found');
    process.exit(1);
  }

  // Output all contexts
  for (let i = 0; i < contexts.length; i++) {
    const context = contexts[i];
    const output = formatContext(context, { format });
    console.log(output);

    // Add separator between entities (except after last)
    if (i < contexts.length - 1) {
      console.log('\n' + '═'.repeat(50) + '\n');
    }
  }

  // Summary
  log.info(`Showed context for ${contexts.length} entities: ${contexts.map(c => c.entity).join(', ')}`);
}

/**
 * List all entities in the schema.
 */
async function listAllEntities(projectRoot: string, refresh?: boolean): Promise<void> {
  const result = await listEntities({
    projectRoot,
    refresh,
  });

  if (result.source === null) {
    log.warn('No schema source found (Convex, Prisma, etc.)');
    return;
  }

  if (result.entities.length === 0) {
    log.warn('No entities found in schema');
    return;
  }

  const cacheStatus = result.fromCache ? '(cached)' : '(fresh)';
  console.log(`Available entities ${cacheStatus}:`);

  for (const e of result.entities) {
    console.log(`  - ${e}`);
  }

  log.info(`Found ${result.entities.length} entities from ${result.source}`);
}

/**
 * Initialize/sync the database for faster subsequent queries.
 */
async function initializeDatabase(projectRoot: string): Promise<void> {
  log.info('Initializing architecture database...');

  const db = getDbSync(projectRoot);
  initializeSchema(db);

  const scanner = new DatabaseScanner(db, projectRoot);
  const lastCommit = getMeta(db, 'last_git_commit');
  const currentCommit = getGitCommitHash(projectRoot);

  if (currentCommit && lastCommit !== currentCommit) {
    log.info('Git commit changed, running incremental sync...');
    const stats = await scanner.incrementalSync();
    log.info(`Done in ${(stats.durationMs / 1000).toFixed(1)}s`);
    log.info(`Files scanned: ${stats.filesScanned}, with @arch tags: ${stats.filesWithArch}`);
    log.info(`Imports: ${stats.importCount}, entity refs: ${stats.entityRefCount}`);
  } else if (scanner.needsFullScan()) {
    log.info('No existing data, running full scan (this may take a while on large codebases)...');
    const stats = await scanner.fullScan();
    log.info(`Done in ${(stats.durationMs / 1000).toFixed(1)}s`);
    log.info(`Files scanned: ${stats.filesScanned}, with @arch tags: ${stats.filesWithArch}`);
    log.info(`Imports: ${stats.importCount}, entity refs: ${stats.entityRefCount}`);
  } else {
    log.info('Database already up to date');
    return;
  }

  log.info('Database ready. Subsequent context queries will be fast.');
}

/**
 * Parse sections from comma-separated string.
 */
function parseSections(sectionsStr: string | undefined, options: ContextOptions): ContextSection[] | undefined {
  // Handle --without-* flags
  if (options.withoutEntities || options.withoutImpact) {
    let sections = [...ALL_SECTIONS];
    if (options.withoutEntities) {
      sections = sections.filter(s => s !== 'entities');
    }
    if (options.withoutImpact) {
      sections = sections.filter(s => s !== 'impact');
    }
    return sections;
  }

  // Handle explicit --sections flag
  if (!sectionsStr) {
    return undefined;
  }

  const validSections = new Set(ALL_SECTIONS);
  const requested = sectionsStr.split(',').map(s => s.trim()) as ContextSection[];
  const valid = requested.filter(s => validSections.has(s));

  if (valid.length !== requested.length) {
    const invalid = requested.filter(s => !validSections.has(s));
    log.warn(`Invalid sections ignored: ${invalid.join(', ')}`);
    log.info(`Valid sections: ${ALL_SECTIONS.join(', ')}`);
  }

  return valid.length > 0 ? valid : undefined;
}

/**
 * Handle module context query (unified context).
 */
async function handleModuleContext(
  modulePath: string,
  projectRoot: string,
  options: ContextOptions
): Promise<void> {
  // Parse sections
  const sections = parseSections(options.sections, options);

  const context = await synthesizeUnifiedContext(projectRoot, {
    module: modulePath,
    sections,
    confirm: options.confirm,
    summary: options.summary,
    brief: options.brief,
  });

  if (!context || !context.module) {
    log.error(`No module found at "${modulePath}"`);
    log.info('Tips:');
    log.info('  - Check the path is correct (e.g., "src/core/db/" not "src/core/db")');
    log.info('  - Ensure the module has files with @arch tags');
    log.info('  - Try "archcodex map" for an overview of available modules');
    process.exit(1);
  }

  // Determine format
  let format: UnifiedContextFormatOptions['format'] = 'compact';
  if (options.full) {
    format = 'full';
  } else if (options.format === 'json') {
    format = 'json';
  }

  const output = formatUnifiedContext(context, { format, markdown: false, sections });
  console.log(output);

  // Summary (skip for interactive/summary modes)
  if (!context.module.isLargeModule && !context.module.isSummary) {
    log.info(`Module: ${context.module.modulePath}`);
    log.info(`Files: ${context.module.fileCount}, Lines: ${context.module.lineCount}, Entities: ${context.module.entityCount}`);
    if (context.module.consumers.length > 0) {
      log.info(`External consumers: ${context.module.consumers.length}`);
    }
  }
}
