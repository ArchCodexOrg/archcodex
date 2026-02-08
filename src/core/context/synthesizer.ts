/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Context synthesizer - combines schema extraction, behavior detection,
 * and operation finding into a unified mental model for LLMs.
 */

import type {
  ContextRequest,
  SynthesizedContext,
  EntityContext,
  ContextListOptions,
  SchemaSource,
  EntityFilesByArchitecture,
  EntityFileReference,
  FileRelevance,
} from './types.js';
import {
  createConvexExtractor,
  detectBehaviors,
  findOperations,
} from './extraction/index.js';
import type { ISchemaExtractor, SchemaExtractionResult } from './extraction/types.js';
import { createSchemaCacheManager } from './cache.js';
import { getDbSync } from '../db/manager.js';
import { initializeSchema } from '../db/schema.js';
import { EntityRepository } from '../db/repositories/entities.js';

/**
 * Available schema extractors.
 */
const EXTRACTORS: ISchemaExtractor[] = [
  createConvexExtractor(),
  // Future: createPrismaExtractor(), createTypeORMExtractor(), etc.
];

/**
 * Get file references for an entity from the architecture map database.
 * Returns files grouped by architecture ID.
 */
function getEntityFileReferences(
  projectRoot: string,
  entityName: string
): EntityFilesByArchitecture[] {
  try {
    const db = getDbSync(projectRoot);
    initializeSchema(db);
    const entityRepo = new EntityRepository(db);

    // Get all files referencing this entity
    const files = entityRepo.getFilesForEntity(entityName);

    if (files.length === 0) {
      return [];
    }

    // Group by architecture
    const byArch = new Map<string, EntityFilesByArchitecture>();
    for (const file of files) {
      const archId = file.archId ?? '(untagged)';
      if (!byArch.has(archId)) {
        byArch.set(archId, { archId, files: [] });
      }
      byArch.get(archId)!.files.push({
        path: file.path,
        refType: file.refType,
        lineNumber: file.lineNumber,
      });
    }

    return Array.from(byArch.values());
  } catch {
    // Database not available or error - silently return empty
    return [];
  }
}

/**
 * Detect which schema source is available in the project.
 */
async function detectSchemaSource(projectRoot: string): Promise<ISchemaExtractor | null> {
  for (const extractor of EXTRACTORS) {
    const canExtract = await extractor.canExtract(projectRoot);
    if (canExtract) {
      return extractor;
    }
  }
  return null;
}

/** Default maximum file references to return. */
const DEFAULT_MAX_FILES = 15;

/** CRUD operation prefixes for related-file detection. */
const CRUD_PREFIXES = ['create', 'update', 'delete', 'get', 'list', 'search', 'find', 'remove', 'patch', 'insert'];

/**
 * Score file relevance based on operation hint and file characteristics.
 */
export function scoreFileRelevance(
  file: EntityFileReference,
  operation?: string
): FileRelevance {
  const filename = (file.path.split('/').pop() || '').toLowerCase();
  const refType = (file.refType || '').toLowerCase();

  // Check peripheral patterns FIRST — tests, types, barrels, schemas
  // are always peripheral regardless of operation match
  if (refType === 'type' || refType === 'test' || refType === 'barrel' || refType === 'schema') {
    return 'peripheral';
  }

  if (filename === 'index.ts' || filename === 'index.js') {
    return 'peripheral';
  }

  if (filename.includes('.test.') || filename.includes('.spec.') || filename.includes('__test__')) {
    return 'peripheral';
  }

  if (filename === 'types.ts' || filename === 'types.d.ts' || filename.endsWith('.types.ts')) {
    return 'peripheral';
  }

  // Then check operation relevance
  if (operation) {
    const opLower = operation.toLowerCase();
    const kebab = operation.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

    // Direct match: operation name in filename
    if (filename.includes(opLower) || filename.includes(kebab)) {
      return 'direct';
    }

    // Related: same-entity CRUD operation in similar directory
    const isCrudOp = CRUD_PREFIXES.some(p => opLower.startsWith(p));
    const isCrudFile = CRUD_PREFIXES.some(p => filename.startsWith(p) || filename.includes(p));
    if (isCrudOp && isCrudFile) {
      return 'related';
    }
  }

  return 'peripheral';
}

/**
 * Result of filtering file references.
 */
export interface FilterResult {
  /** Filtered file reference groups */
  filtered: EntityFilesByArchitecture[];
  /** Number of files omitted */
  truncated: number;
}

/**
 * Filter file references by relevance, truncating peripheral files if over limit.
 * Direct and related files are never truncated.
 */
export function filterFileReferences(
  fileGroups: EntityFilesByArchitecture[],
  maxFiles: number,
  operation?: string
): FilterResult {
  // Flatten all files with their arch group for scoring
  const allFiles: Array<{ file: EntityFileReference; archId: string; relevance: FileRelevance }> = [];

  for (const group of fileGroups) {
    for (const file of group.files) {
      const relevance = file.relevance || scoreFileRelevance(file, operation);
      allFiles.push({ file: { ...file, relevance }, archId: group.archId, relevance });
    }
  }

  const totalFiles = allFiles.length;
  if (totalFiles <= maxFiles) {
    // Under limit — return all with relevance annotations
    const result = rebuildGroups(allFiles);
    return { filtered: result, truncated: 0 };
  }

  // Separate by tier
  const direct = allFiles.filter(f => f.relevance === 'direct');
  const related = allFiles.filter(f => f.relevance === 'related');
  const peripheral = allFiles.filter(f => f.relevance === 'peripheral');

  // Always keep direct + related; fill remaining slots with peripheral
  const guaranteedCount = direct.length + related.length;
  const peripheralSlots = Math.max(0, maxFiles - guaranteedCount);
  const keptPeripheral = peripheral.slice(0, peripheralSlots);

  const kept = [...direct, ...related, ...keptPeripheral];
  const truncated = totalFiles - kept.length;

  return { filtered: rebuildGroups(kept), truncated };
}

/**
 * Rebuild architecture-grouped file references from flat list.
 */
function rebuildGroups(
  files: Array<{ file: EntityFileReference; archId: string }>
): EntityFilesByArchitecture[] {
  const byArch = new Map<string, EntityFilesByArchitecture>();

  for (const { file, archId } of files) {
    if (!byArch.has(archId)) {
      byArch.set(archId, { archId, files: [] });
    }
    byArch.get(archId)!.files.push(file);
  }

  return Array.from(byArch.values());
}

/**
 * Synthesize context for an entity.
 *
 * This is the main entry point for context generation. It:
 * 1. Detects the schema source (Convex, Prisma, etc.)
 * 2. Extracts schema information (fields, relationships)
 * 3. Detects behavior patterns (soft_delete, ordering, etc.)
 * 4. Finds existing and similar operations
 * 5. Combines everything into a unified context
 */
export async function synthesizeContext(
  request: ContextRequest
): Promise<SynthesizedContext | null> {
  const { focus, projectRoot } = request;

  // Detect and use appropriate schema extractor
  const extractor = await detectSchemaSource(projectRoot);
  if (!extractor) {
    return null;
  }

  // Extract schema (without filtering, so we can do exact matching)
  const schemaResult = await extractor.extract({
    projectRoot,
  });

  // Find entity by EXACT match only (name or name + 's' for singular/plural)
  const normalizedFocus = focus.toLowerCase();
  const entity = schemaResult.entities.find(
    e => e.name.toLowerCase() === normalizedFocus ||
         e.name.toLowerCase() === normalizedFocus + 's'
  );

  // Return null if no exact match - let caller handle search fallback
  if (!entity) {
    return null;
  }

  // Detect behaviors from fields
  const behaviorResult = detectBehaviors(entity.name, entity.fields);

  // Find existing operations and similar operations
  const operationResult = await findOperations(projectRoot, entity.name);

  // Get file references from architecture map database
  const fileReferences = getEntityFileReferences(projectRoot, entity.name);

  // Synthesize into unified context
  const context: SynthesizedContext = {
    entity: entity.name,
    fields: entity.fields,
    relationships: entity.relationships,
    behaviors: behaviorResult.behaviors,
    existingOperations: operationResult.existingOperations,
    similarOperations: operationResult.similarOperations,
  };

  // Filter and include file references if we found any
  if (fileReferences.length > 0) {
    const maxFiles = request.maxFiles ?? DEFAULT_MAX_FILES;
    const verbose = request.verbose ?? false;

    if (!verbose) {
      const { filtered, truncated } = filterFileReferences(
        fileReferences, maxFiles, request.operation
      );
      context.fileReferences = filtered;
      if (truncated > 0) {
        context.truncatedFiles = truncated;
      }
    } else {
      context.fileReferences = fileReferences;
    }
  }

  return context;
}

/**
 * Synthesize context for multiple entities.
 */
export async function synthesizeContextForEntities(
  projectRoot: string,
  entityNames: string[]
): Promise<EntityContext[]> {
  const contexts: EntityContext[] = [];

  for (const entityName of entityNames) {
    const context = await synthesizeContext({
      focus: entityName,
      projectRoot,
    });

    if (context) {
      contexts.push({
        name: context.entity,
        fields: context.fields,
        relationships: context.relationships,
        behaviors: context.behaviors,
        existingOperations: context.existingOperations,
        similarOperations: context.similarOperations,
      });
    }
  }

  return contexts;
}

/**
 * Get all entities from the project schema.
 * Uses cache when available for fast repeated access.
 */
export async function getAllEntities(
  projectRoot: string,
  options?: { refresh?: boolean }
): Promise<string[]> {
  const result = await getAllEntitiesWithCache(projectRoot, options);
  return result.entities;
}

/**
 * Result from cached entity listing.
 */
export interface CachedEntitiesResult {
  /** Entity names */
  entities: string[];
  /** Whether result came from cache */
  fromCache: boolean;
  /** Schema source type */
  source: SchemaSource | null;
}

/**
 * Get all entities with cache support.
 * Returns additional metadata about cache status.
 */
export async function getAllEntitiesWithCache(
  projectRoot: string,
  options?: { refresh?: boolean; search?: string }
): Promise<CachedEntitiesResult> {
  const extractor = await detectSchemaSource(projectRoot);
  if (!extractor) {
    return { entities: [], fromCache: false, source: null };
  }

  const cacheManager = createSchemaCacheManager(projectRoot);

  try {
    // Find schema path for cache key
    const schemaPath = await findSchemaPath(extractor, projectRoot);
    if (!schemaPath) {
      return { entities: [], fromCache: false, source: extractor.source };
    }

    // Check cache unless refresh requested
    if (!options?.refresh) {
      const cachedEntities = await cacheManager.get(schemaPath);
      if (cachedEntities) {
        let entities = cachedEntities;
        if (options?.search) {
          entities = cacheManager.searchEntities(entities, options.search);
        }
        return {
          entities: entities.map(e => e.name),
          fromCache: true,
          source: extractor.source,
        };
      }
    }

    // Extract fresh data
    const schemaResult = await extractor.extract({ projectRoot });

    // Build full entity contexts with behaviors
    const entityContexts = await buildEntityContexts(projectRoot, schemaResult);

    // Cache the results
    await cacheManager.set(extractor.source, schemaPath, entityContexts);

    // Apply search filter if provided
    let entities = entityContexts;
    if (options?.search) {
      entities = cacheManager.searchEntities(entities, options.search);
    }

    return {
      entities: entities.map(e => e.name),
      fromCache: false,
      source: extractor.source,
    };
  } catch { /* schema extraction failed, return empty */
    return { entities: [], fromCache: false, source: extractor.source };
  } finally {
    cacheManager.dispose();
  }
}

/**
 * Find the schema file path for an extractor.
 */
async function findSchemaPath(
  extractor: ISchemaExtractor,
  projectRoot: string
): Promise<string | null> {
  try {
    const result = await extractor.extract({ projectRoot });
    return result.schemaPath;
  } catch { /* extractor cannot process this project */
    return null;
  }
}

/**
 * Build full entity contexts with behaviors from extraction result.
 */
async function buildEntityContexts(
  projectRoot: string,
  schemaResult: SchemaExtractionResult
): Promise<EntityContext[]> {
  const contexts: EntityContext[] = [];

  for (const entity of schemaResult.entities) {
    const behaviorResult = detectBehaviors(entity.name, entity.fields);
    const operationResult = await findOperations(projectRoot, entity.name);

    contexts.push({
      name: entity.name,
      fields: entity.fields,
      relationships: entity.relationships,
      behaviors: behaviorResult.behaviors,
      existingOperations: operationResult.existingOperations,
      similarOperations: operationResult.similarOperations,
    });
  }

  return contexts;
}

/**
 * List entities with search and cache support.
 */
export async function listEntities(
  options: ContextListOptions
): Promise<CachedEntitiesResult> {
  return getAllEntitiesWithCache(options.projectRoot, {
    refresh: options.refresh,
    search: options.search,
  });
}

/**
 * Clear the schema cache for a project.
 */
export async function clearSchemaCache(projectRoot: string): Promise<void> {
  const cacheManager = createSchemaCacheManager(projectRoot);
  await cacheManager.clear();
  cacheManager.dispose();
}
