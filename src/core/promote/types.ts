/**
 * @arch archcodex.core.types
 *
 * Type definitions for the promote engine.
 */

/**
 * Input parameters for the promote engine.
 */
export interface PromoteInput {
  /** Constraint rule (e.g., "forbid_pattern") */
  rule: string;
  /** Constraint value pattern (e.g., "console") — substring match */
  value: string;
  /** Intent name to promote to */
  intentName: string;
  /** Description for a new intent definition */
  description?: string;
  /** Category for a new intent definition */
  category?: string;
  /** Whether to apply changes (false = dry-run preview) */
  apply: boolean;
}

/**
 * Represents a file whose override will be promoted to an intent.
 */
export interface PromoteFileChange {
  /** Relative file path */
  filePath: string;
  /** Architecture ID from @arch tag */
  archId: string | null;
  /** Start line of the override block */
  overrideStartLine: number;
  /** End line of the override block (inclusive) */
  overrideEndLine: number;
  /** The override rule */
  overrideRule: string;
  /** The override value */
  overrideValue: string;
  /** Whether the intent is already annotated on this file */
  intentAlreadyPresent: boolean;
}

/**
 * Represents a registry YAML file needing an `unless` clause update.
 */
export interface PromoteRegistryChange {
  /** Absolute path to the registry YAML file */
  filePath: string;
  /** Architecture ID containing the constraint */
  archId: string;
  /** The constraint rule */
  constraintRule: string;
  /** The constraint value */
  constraintValue: string;
  /** Whether `unless` array already exists on this constraint */
  unlessAlreadyExists: boolean;
  /** Whether the intent is already in the unless array */
  intentAlreadyInUnless: boolean;
}

/**
 * Represents the intent definition change.
 */
export interface PromoteIntentChange {
  /** Whether a new intent needs to be created */
  isNew: boolean;
  /** Intent name */
  name: string;
  /** Description (for new intents) */
  description?: string;
  /** Category (for new intents) */
  category?: string;
}

/**
 * Complete result from the promote engine.
 */
export interface PromoteResult {
  /** Files whose overrides will be / were promoted */
  fileChanges: PromoteFileChange[];
  /** Registry YAML files that need unless updates */
  registryChanges: PromoteRegistryChange[];
  /** Intent definition change (new or existing) */
  intentChange: PromoteIntentChange;
  /** Whether changes were applied */
  applied: boolean;
  /** Non-fatal warnings */
  warnings: string[];
  /** Errors that prevented full promotion */
  errors: string[];
}
