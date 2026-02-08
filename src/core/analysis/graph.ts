/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Builds cross-reference maps from a spec registry, enabling
 * multi-spec analysis (cascade detection, type mismatches, etc.).
 */

import type { SpecNode } from '../spec/schema.js';
import type {
  CrossReferenceGraph,
  TableWriter,
  TableReader,
} from './types.js';

/**
 * Extract entity prefix from a spec ID.
 * Uses all middle segments (between "spec." and the last part) so that
 * multi-level namespaces produce distinct entities:
 *
 * "spec.tag.create"                   → "tag"
 * "spec.product.share"                → "product"
 * "spec.test.calculator.add"          → "test.calculator"
 * "spec.speccodex.placeholders.hasItem" → "speccodex.placeholders"
 * "spec.base"                         → null (no entity)
 */
function extractEntity(specId: string): string | null {
  const parts = specId.split('.');
  // Must have at least 3 parts: "spec", entity..., operation
  if (parts.length < 3) return null;
  // Join all middle segments (skip "spec." prefix and last operation segment)
  return parts.slice(1, -1).join('.');
}

/**
 * Check if a spec is a base/abstract spec (should be excluded from entity grouping).
 */
function isBaseSpec(node: SpecNode): boolean {
  return node.type === 'base';
}

/**
 * Extract database effects from a spec's effects array.
 */
function extractDatabaseEffects(
  effects: Record<string, unknown>[] | undefined,
): Array<{ table: string; operation: string }> {
  if (!effects) return [];
  const result: Array<{ table: string; operation: string }> = [];

  for (const effect of effects) {
    const db = effect['database'] as
      | { table?: string; operation?: string }
      | undefined;
    if (db?.table && db?.operation) {
      result.push({ table: db.table, operation: db.operation });
    }
  }

  return result;
}

/**
 * Extract id-typed inputs that reference database tables.
 */
function extractIdInputs(
  inputs: Record<string, Record<string, unknown>> | undefined,
): Array<{ field: string; table: string }> {
  if (!inputs) return [];
  const result: Array<{ field: string; table: string }> = [];

  for (const [field, def] of Object.entries(inputs)) {
    if (def.type === 'id' && typeof def.table === 'string') {
      result.push({ field, table: def.table });
    }
  }

  return result;
}

function addToMapArray<V>(map: Map<string, V[]>, key: string, value: V): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

/**
 * Build a cross-reference graph from a spec registry.
 * This graph enables multi-spec analysis like cascade detection,
 * cross-spec type mismatches, and fan-in calculations.
 */
export function buildCrossReferenceGraph(
  nodes: Record<string, SpecNode>,
): CrossReferenceGraph {
  const entityToSpecs = new Map<string, string[]>();
  const tableToWriters = new Map<string, TableWriter[]>();
  const tableToReaders = new Map<string, TableReader[]>();
  const specDependents = new Map<string, string[]>();
  const archToSpecs = new Map<string, string[]>();

  for (const [specId, node] of Object.entries(nodes)) {
    // Skip base specs from entity grouping
    if (!isBaseSpec(node)) {
      const entity = extractEntity(specId);
      if (entity) {
        addToMapArray(entityToSpecs, entity, specId);
      }
    }

    // Database effects → tableToWriters
    const dbEffects = extractDatabaseEffects(
      node.effects as Record<string, unknown>[] | undefined,
    );
    for (const { table, operation } of dbEffects) {
      addToMapArray(tableToWriters, table, { specId, operation });
    }

    // ID inputs → tableToReaders
    const idInputs = extractIdInputs(
      node.inputs as Record<string, Record<string, unknown>> | undefined,
    );
    for (const { field, table } of idInputs) {
      addToMapArray(tableToReaders, table, { specId, inputField: field });
    }

    // depends_on → specDependents (reverse lookup)
    const dependsOn = node.depends_on as string[] | undefined;
    if (dependsOn) {
      for (const depId of dependsOn) {
        addToMapArray(specDependents, depId, specId);
      }
    }

    // architectures → archToSpecs
    const architectures = node.architectures as string[] | undefined;
    if (architectures) {
      for (const archId of architectures) {
        addToMapArray(archToSpecs, archId, specId);
      }
    }
  }

  return {
    entityToSpecs,
    tableToWriters,
    tableToReaders,
    specDependents,
    archToSpecs,
  };
}
