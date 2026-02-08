/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Unified context synthesizer - combines module structure (from architecture map)
 * with entity schemas (from context synthesizer) into a single LLM-optimized output.
 */

import type {
  UnifiedContext,
  UnifiedModuleContext,
  UnifiedEntityContext,
  UnifiedContextOptions,
} from './types.js';
import { ALL_SECTIONS } from './types.js';
import type { ModuleContext, ModuleFileInfo } from '../db/formatters.js';
import { getDbSync, getMeta } from '../db/manager.js';
import { initializeSchema } from '../db/schema.js';
import { FileRepository } from '../db/repositories/files.js';
import { ImportRepository } from '../db/repositories/imports.js';
import { EntityRepository } from '../db/repositories/entities.js';
import { DatabaseScanner } from '../db/scanner.js';
import { synthesizeContext } from '../context/synthesizer.js';
import { getGitCommitHash } from '../../utils/git.js';
import { loadRegistry } from '../registry/loader.js';
import { loadConfig } from '../config/loader.js';
import {
  getTopSubmodules,
  computeFileRole,
  convertToUnifiedFiles,
  convertEntityFilesToUnified,
  fetchEntitySchemas,
  getLayerBoundaries,
  getArchConstraints,
  buildProjectRules,
} from './synthesizer-helpers.js';

/** Threshold for triggering interactive mode */
const LARGE_MODULE_THRESHOLD = 30;

/**
 * Query unified context for a module.
 */
export async function synthesizeUnifiedModuleContext(
  projectRoot: string,
  modulePath: string,
  options?: UnifiedContextOptions
): Promise<UnifiedModuleContext | null> {
  // Get database connection and ensure it's up to date
  const db = getDbSync(projectRoot);
  initializeSchema(db);

  const fileRepo = new FileRepository(db);
  const importRepo = new ImportRepository(db);
  const entityRepo = new EntityRepository(db);
  const scanner = new DatabaseScanner(db, projectRoot);

  // Auto-sync if git commit changed
  const lastCommit = getMeta(db, 'last_git_commit');
  const currentCommit = getGitCommitHash(projectRoot);
  if (currentCommit && lastCommit !== currentCommit) {
    await scanner.incrementalSync();
  } else if (scanner.needsFullScan()) {
    await scanner.fullScan();
  }

  // Query module context from architecture map
  const moduleContext = queryModuleContext(modulePath, fileRepo, importRepo, entityRepo);

  if (moduleContext.files.length === 0) {
    return null;
  }

  // Determine which sections are requested (default: all)
  const sections = options?.sections ?? ALL_SECTIONS;

  // Get top submodules for interactive menus
  const topSubmodules = getTopSubmodules(modulePath, fileRepo);

  // Interactive mode: large module without confirm flag
  if (
    moduleContext.files.length > LARGE_MODULE_THRESHOLD &&
    !options?.confirm &&
    !options?.summary &&
    !options?.brief
  ) {
    // Return minimal context for interactive menu
    return {
      modulePath: moduleContext.modulePath,
      fileCount: moduleContext.files.length,
      lineCount: 0,
      entityCount: 0,
      files: { defines: [], implements: [], orchestrates: [] },
      entities: [],
      consumers: [],
      archcodex: { architecture: '(interactive)' },
      topSubmodules,
      isLargeModule: true,
      requestedSections: sections,
    };
  }

  // Summary mode: structure overview only
  if (options?.summary) {
    const config = await loadConfig(projectRoot);
    const registry = await loadRegistry(projectRoot);
    const boundaries = await getLayerBoundaries(projectRoot, moduleContext, config, fileRepo);
    const projectRules = await buildProjectRules(projectRoot, moduleContext, config, registry);

    return {
      modulePath: moduleContext.modulePath,
      fileCount: moduleContext.files.length,
      lineCount: 0,
      entityCount: 0,
      files: { defines: [], implements: [], orchestrates: [] },
      boundaries,
      projectRules,
      entities: [],
      consumers: [],
      archcodex: { architecture: '(summary)' },
      topSubmodules,
      isSummary: true,
      requestedSections: sections,
    };
  }

  // Brief mode: minimal essential info only
  if (options?.brief) {
    const config = await loadConfig(projectRoot);
    const registry = await loadRegistry(projectRoot);
    const boundaries = await getLayerBoundaries(projectRoot, moduleContext, config, fileRepo);
    const archConstraints = await getArchConstraints(projectRoot, moduleContext, registry);

    return {
      modulePath: moduleContext.modulePath,
      fileCount: moduleContext.files.length,
      lineCount: 0,
      entityCount: 0,
      files: { defines: [], implements: [], orchestrates: [] },
      boundaries,
      entities: [],
      consumers: [],
      archcodex: archConstraints,
      isBrief: true,
      requestedSections: ['boundaries', 'constraints'],
    };
  }

  // Full mode (or confirmed large module)

  // Get entity names referenced in this module (limit to top 10 by reference count)
  const entityNames = moduleContext.entities
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(e => e.name);

  // Fetch entity schemas only if 'entities' section is requested (expensive)
  const includeEntities = sections.includes('entities');
  const entitySchemas = includeEntities && entityNames.length > 0
    ? await fetchEntitySchemas(projectRoot, entityNames)
    : [];

  // Load config for real layer hierarchy
  const config = await loadConfig(projectRoot);
  const registry = await loadRegistry(projectRoot);

  // Get layer boundaries and constraints (only if sections requested)
  const includeBoundaries = sections.includes('boundaries');
  const boundaries = includeBoundaries
    ? await getLayerBoundaries(projectRoot, moduleContext, config, fileRepo)
    : undefined;

  const includeConstraints = sections.includes('constraints');
  const archConstraints = includeConstraints
    ? await getArchConstraints(projectRoot, moduleContext, registry)
    : { architecture: '(not requested)' };

  // Build project rules (only if section requested)
  const includeProjectRules = sections.includes('project-rules');
  const projectRules = includeProjectRules
    ? await buildProjectRules(projectRoot, moduleContext, config, registry)
    : undefined;

  // Get consumers only if impact section requested
  const includeImpact = sections.includes('impact');
  const consumers = includeImpact
    ? moduleContext.externalConsumers.map(c => ({ path: c.path, archId: c.archId }))
    : [];

  // Convert to unified format
  const unifiedFiles = convertToUnifiedFiles(moduleContext);
  const totalLines = moduleContext.files.reduce((sum, f) => sum + (f.lineCount ?? 0), 0);

  return {
    modulePath: moduleContext.modulePath,
    fileCount: moduleContext.files.length,
    lineCount: totalLines,
    entityCount: entityNames.length,
    files: unifiedFiles,
    boundaries,
    projectRules,
    entities: entitySchemas,
    consumers,
    archcodex: archConstraints,
    topSubmodules: moduleContext.files.length > 50 ? topSubmodules : undefined,
    requestedSections: sections,
  };
}

/**
 * Query unified context for an entity.
 */
export async function synthesizeUnifiedEntityContext(
  projectRoot: string,
  entityName: string
): Promise<UnifiedEntityContext | null> {
  // Get entity context from existing synthesizer
  const entityContext = await synthesizeContext({
    focus: entityName,
    projectRoot,
  });

  if (!entityContext) {
    return null;
  }

  // Get database for file info
  const db = getDbSync(projectRoot);
  initializeSchema(db);
  const entityRepo = new EntityRepository(db);
  const fileRepo = new FileRepository(db);
  const importRepo = new ImportRepository(db);

  // Get files referencing this entity
  const entityFiles = entityRepo.getFilesForEntity(entityName);

  // Convert to unified file info with roles
  const unifiedFiles = convertEntityFilesToUnified(
    entityFiles,
    fileRepo,
    importRepo
  );

  return {
    name: entityContext.entity,
    fields: entityContext.fields,
    relationships: entityContext.relationships,
    behaviors: entityContext.behaviors,
    operations: entityContext.existingOperations.map(op => op.name),
    similarOperations: entityContext.similarOperations.length > 0
      ? entityContext.similarOperations.map(op => op.name)
      : undefined,
    files: unifiedFiles,
  };
}

/**
 * Main entry point - synthesize unified context based on options.
 */
export async function synthesizeUnifiedContext(
  projectRoot: string,
  options: UnifiedContextOptions
): Promise<UnifiedContext | null> {
  if (options.module) {
    const moduleContext = await synthesizeUnifiedModuleContext(projectRoot, options.module, options);
    if (!moduleContext) {
      return null;
    }
    return {
      query: { type: 'module', target: options.module },
      module: moduleContext,
    };
  }

  if (options.entity) {
    const entityContext = await synthesizeUnifiedEntityContext(projectRoot, options.entity);
    if (!entityContext) {
      return null;
    }
    return {
      query: { type: 'entity', target: options.entity },
      entity: entityContext,
    };
  }

  return null;
}

// ============================================================================
// Internal helper (kept here because it uses repositories directly)
// ============================================================================

/**
 * Query module context from database (adapted from architecture-map.ts).
 */
function queryModuleContext(
  modulePath: string,
  fileRepo: FileRepository,
  importRepo: ImportRepository,
  entityRepo: EntityRepository
): ModuleContext {
  const normalizedPath = modulePath.endsWith('/') ? modulePath : modulePath + '/';
  const pathPattern = normalizedPath + '%';

  const files = fileRepo.query({ pathPattern });
  const moduleFilePaths = new Set(files.map(f => f.path));

  const internalImportsCount = new Map<string, number>();
  const internalImportedByCount = new Map<string, number>();
  const fileImportedBy = new Map<string, string[]>();

  for (const file of files) {
    internalImportsCount.set(file.path, 0);
    internalImportedByCount.set(file.path, 0);
    fileImportedBy.set(file.path, []);
  }

  const internalImports: Array<{ from: string; to: string }> = [];
  const externalDepsMap = new Map<string, string | null>();
  const externalConsumersMap = new Map<string, string | null>();

  for (const file of files) {
    const graph = importRepo.getImportGraph(file.path);

    for (const imp of graph.imports) {
      if (moduleFilePaths.has(imp.path)) {
        internalImports.push({ from: file.path, to: imp.path });
        internalImportsCount.set(file.path, (internalImportsCount.get(file.path) ?? 0) + 1);
        internalImportedByCount.set(imp.path, (internalImportedByCount.get(imp.path) ?? 0) + 1);

        const importers = fileImportedBy.get(imp.path) ?? [];
        importers.push(file.path);
        fileImportedBy.set(imp.path, importers);
      } else {
        externalDepsMap.set(imp.path, imp.archId);
      }
    }

    for (const imp of graph.importedBy) {
      if (!moduleFilePaths.has(imp.path)) {
        externalConsumersMap.set(imp.path, imp.archId);

        const importers = fileImportedBy.get(file.path) ?? [];
        importers.push(imp.path);
        fileImportedBy.set(file.path, importers);
      }
    }
  }

  const entityCounts = new Map<string, number>();
  for (const file of files) {
    const refs = entityRepo.getEntitiesForFile(file.path);
    for (const ref of refs) {
      entityCounts.set(ref.entityName, (entityCounts.get(ref.entityName) ?? 0) + 1);
    }
  }

  const filesWithRoles: ModuleFileInfo[] = files.map(f => {
    const { role, reason } = computeFileRole(
      f.path,
      internalImportsCount.get(f.path) ?? 0,
      internalImportedByCount.get(f.path) ?? 0
    );

    const importers = fileImportedBy.get(f.path) ?? [];

    return {
      path: f.path,
      archId: f.archId,
      lineCount: f.lineCount,
      role,
      roleReason: reason,
      impact: {
        directDependents: importers.length,
        impactChain: importers,
      },
    };
  });

  const roleOrder = { defines: 0, implements: 1, orchestrates: 2 };
  filesWithRoles.sort((a, b) =>
    roleOrder[a.role as keyof typeof roleOrder] - roleOrder[b.role as keyof typeof roleOrder]
  );

  return {
    modulePath: normalizedPath,
    files: filesWithRoles,
    internalImports,
    externalDeps: Array.from(externalDepsMap.entries()).map(([path, archId]) => ({ path, archId })),
    externalConsumers: Array.from(externalConsumersMap.entries()).map(([path, archId]) => ({ path, archId })),
    entities: Array.from(entityCounts.entries()).map(([name, count]) => ({ name, count })),
    hasRoles: true,
  };
}
