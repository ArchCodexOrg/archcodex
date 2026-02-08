/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Behavior detector - detects common patterns from entity field names.
 */

import type { Field, DetectedBehavior, BehaviorType } from '../types.js';
import type { BehaviorDetectionResult } from './types.js';

/**
 * Field patterns that indicate specific behaviors.
 */
const BEHAVIOR_PATTERNS: Record<BehaviorType, RegExp[]> = {
  soft_delete: [
    /^deleted_?at$/i,
    /^deletedAt$/,
    /^is_?deleted$/i,
    /^isDeleted$/,
  ],
  ordering: [
    /^position$/i,
    /^order$/i,
    /^sort_?order$/i,
    /^sortOrder$/,
    /^rank$/i,
    /^seq(?:uence)?$/i,
    /^index$/i,
  ],
  audit_trail: [
    /^created_?at$/i,
    /^createdAt$/,
    /^updated_?at$/i,
    /^updatedAt$/,
    /^modified_?at$/i,
    /^modifiedAt$/,
  ],
  optimistic_lock: [
    /^version$/i,
    /^_version$/i,
    /^revision$/i,
    /^lock_?version$/i,
  ],
};

/**
 * Detect which behavior a field indicates.
 */
function detectFieldBehavior(fieldName: string): { type: BehaviorType; field: string } | null {
  for (const [behaviorType, patterns] of Object.entries(BEHAVIOR_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(fieldName)) {
        return { type: behaviorType as BehaviorType, field: fieldName };
      }
    }
  }
  return null;
}

/**
 * Check if we have both created_at and updated_at (complete audit trail).
 */
function hasCompleteAuditTrail(fields: Field[]): { hasCreated: boolean; hasUpdated: boolean } {
  let hasCreated = false;
  let hasUpdated = false;

  for (const field of fields) {
    const name = field.name.toLowerCase();
    if (name.includes('created') && name.includes('at')) {
      hasCreated = true;
    }
    if ((name.includes('updated') || name.includes('modified')) && name.includes('at')) {
      hasUpdated = true;
    }
  }

  return { hasCreated, hasUpdated };
}

/**
 * Detect behaviors from entity fields.
 */
export function detectBehaviors(entityName: string, fields: Field[]): BehaviorDetectionResult {
  const behaviors: DetectedBehavior[] = [];
  const behaviorFields: Map<BehaviorType, string[]> = new Map();

  // Detect behaviors from field names
  for (const field of fields) {
    const detected = detectFieldBehavior(field.name);
    if (detected) {
      const existingFields = behaviorFields.get(detected.type) || [];
      existingFields.push(detected.field);
      behaviorFields.set(detected.type, existingFields);
    }
  }

  // Build behavior list
  for (const [type, detectedFields] of behaviorFields) {
    // For audit_trail, only add if we have at least created_at
    if (type === 'audit_trail') {
      const { hasCreated } = hasCompleteAuditTrail(fields);
      if (!hasCreated) {
        continue;
      }
    }

    behaviors.push({
      type,
      fields: detectedFields,
    });
  }

  return {
    entity: entityName,
    behaviors,
  };
}

/**
 * Detect behaviors for multiple entities.
 */
export function detectBehaviorsForEntities(
  entities: Array<{ name: string; fields: Field[] }>
): BehaviorDetectionResult[] {
  return entities.map(entity => detectBehaviors(entity.name, entity.fields));
}
