/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Batch entity schema retrieval - extracts schema ONCE and looks up multiple entities.
 * Avoids the N+1 problem of calling synthesizeContext for each entity.
 */

import type { Field, Relationship, DetectedBehavior } from './types.js';
import {
  createConvexExtractor,
  detectBehaviors,
} from './extraction/index.js';
import type { ISchemaExtractor, ExtractedEntity } from './extraction/types.js';

/**
 * Simplified entity schema for batch retrieval.
 * Omits expensive operation scanning.
 */
export interface BatchEntitySchema {
  name: string;
  fields: Field[];
  relationships: Relationship[];
  behaviors: DetectedBehavior[];
  operations: string[]; // Empty - skipped for performance
}

/**
 * Available schema extractors.
 */
const EXTRACTORS: ISchemaExtractor[] = [
  createConvexExtractor(),
];

/**
 * In-memory cache for batch schema extraction.
 * Cached per session to avoid repeated extraction.
 */
let cachedExtraction: {
  projectRoot: string;
  entities: Map<string, ExtractedEntity>;
  timestamp: number;
} | null = null;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get the schema extractor for a project.
 */
async function getExtractor(projectRoot: string): Promise<ISchemaExtractor | null> {
  for (const extractor of EXTRACTORS) {
    if (await extractor.canExtract(projectRoot)) {
      return extractor;
    }
  }
  return null;
}

/**
 * Extract all entities from schema (cached).
 */
async function extractAllEntities(projectRoot: string): Promise<Map<string, ExtractedEntity>> {
  // Check cache validity
  if (
    cachedExtraction &&
    cachedExtraction.projectRoot === projectRoot &&
    Date.now() - cachedExtraction.timestamp < CACHE_TTL_MS
  ) {
    return cachedExtraction.entities;
  }

  const extractor = await getExtractor(projectRoot);
  if (!extractor) {
    return new Map();
  }

  const result = await extractor.extract({ projectRoot });

  // Build lookup map (both exact name and lowercase for case-insensitive matching)
  const entityMap = new Map<string, ExtractedEntity>();
  for (const entity of result.entities) {
    entityMap.set(entity.name, entity);
    entityMap.set(entity.name.toLowerCase(), entity);
  }

  // Cache the result
  cachedExtraction = {
    projectRoot,
    entities: entityMap,
    timestamp: Date.now(),
  };

  return entityMap;
}

/**
 * Get entity schemas for multiple entities in a single batch.
 * Extracts schema ONCE and looks up each entity.
 * Skips expensive operation scanning for performance.
 *
 * @param projectRoot - Project root directory
 * @param entityNames - Entity names to look up
 * @returns Array of entity schemas (may be fewer than requested if some not found)
 */
export async function getEntitySchemasBatch(
  projectRoot: string,
  entityNames: string[]
): Promise<BatchEntitySchema[]> {
  const entityMap = await extractAllEntities(projectRoot);

  if (entityMap.size === 0) {
    return [];
  }

  const results: BatchEntitySchema[] = [];

  for (const name of entityNames) {
    // Try exact match, then lowercase, then with 's' suffix
    const entity =
      entityMap.get(name) ||
      entityMap.get(name.toLowerCase()) ||
      entityMap.get(name.toLowerCase() + 's');

    if (entity) {
      // Detect behaviors from fields
      const behaviorResult = detectBehaviors(entity.name, entity.fields);

      results.push({
        name: entity.name,
        fields: entity.fields,
        relationships: entity.relationships,
        behaviors: behaviorResult.behaviors,
        operations: [], // Skip operation scanning for performance
      });
    }
  }

  return results;
}

/**
 * Clear the extraction cache.
 * Call this when schema files change.
 */
export function clearBatchCache(): void {
  cachedExtraction = null;
}
