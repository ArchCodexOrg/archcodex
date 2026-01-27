/**
 * @arch archcodex.core.types
 *
 * Types for architecture registry diffing.
 */
import type { ArchitectureNode, ConstraintValue } from '../registry/schema.js';

/**
 * Types of changes detected in a diff.
 */
export type ChangeType = 'added' | 'removed' | 'modified';

/**
 * A change to a constraint.
 */
export interface ConstraintChange {
  type: ChangeType;
  rule: string;
  /** Old value (for modified/removed) */
  oldValue?: ConstraintValue;
  /** New value (for modified/added) */
  newValue?: ConstraintValue;
  /** Old severity */
  oldSeverity?: string;
  /** New severity */
  newSeverity?: string;
}

/**
 * A change to an architecture node.
 */
export interface ArchitectureChange {
  archId: string;
  type: ChangeType;
  /** Constraint changes (for modified nodes) */
  constraintChanges?: ConstraintChange[];
  /** Inheritance change */
  inheritsChange?: {
    old?: string;
    new?: string;
  };
  /** Mixin changes */
  mixinChanges?: {
    added: string[];
    removed: string[];
  };
  /** Description change */
  descriptionChange?: {
    old?: string;
    new?: string;
  };
  /** Old node (for removed/modified) */
  oldNode?: ArchitectureNode;
  /** New node (for added/modified) */
  newNode?: ArchitectureNode;
}

/**
 * A change to a mixin.
 */
export interface MixinChange {
  mixinId: string;
  type: ChangeType;
  constraintChanges?: ConstraintChange[];
  oldNode?: ArchitectureNode;
  newNode?: ArchitectureNode;
}

/**
 * File affected by architecture changes.
 */
export interface AffectedFile {
  filePath: string;
  archId: string;
  /** Why this file is affected */
  reason: 'new_arch' | 'removed_arch' | 'constraint_change' | 'mixin_change';
}

/**
 * Complete diff result between two registry versions.
 */
export interface RegistryDiff {
  /** Source ref (e.g., 'main', 'HEAD~1', commit SHA) */
  fromRef: string;
  /** Target ref */
  toRef: string;
  /** Architecture changes */
  architectureChanges: ArchitectureChange[];
  /** Mixin changes */
  mixinChanges: MixinChange[];
  /** Files affected by changes */
  affectedFiles: AffectedFile[];
  /** Summary statistics */
  summary: {
    architecturesAdded: number;
    architecturesRemoved: number;
    architecturesModified: number;
    mixinsAdded: number;
    mixinsRemoved: number;
    mixinsModified: number;
    totalAffectedFiles: number;
  };
}

/**
 * Options for diffing registries.
 */
export interface DiffOptions {
  /** Include affected files scan */
  includeAffectedFiles?: boolean;
  /** File patterns to scan for affected files */
  filePatterns?: string[];
}
