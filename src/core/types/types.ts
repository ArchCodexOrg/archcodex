/**
 * @arch archcodex.core.types
 *
 * Type information structures for cross-file type consistency analysis.
 * Used to detect duplicate and similar type definitions across a codebase.
 */

import type { SourceLocation } from '../../validators/semantic.types.js';

/**
 * Kind of type definition.
 */
export type TypeKind = 'interface' | 'type' | 'enum' | 'class';

/**
 * Property information within a type.
 */
export interface PropertyInfo {
  /** Property name */
  name: string;
  /** Type annotation as string (e.g., "string", "number[]", "User | null") */
  type: string;
  /** Whether the property is optional (?) */
  optional: boolean;
  /** Whether the property is readonly */
  readonly: boolean;
}

/**
 * Method signature within a type.
 */
export interface MethodSignature {
  /** Method name */
  name: string;
  /** Parameter types (e.g., ["string", "number"]) */
  parameters: Array<{ name: string; type: string; optional: boolean }>;
  /** Return type */
  returnType: string;
}

/**
 * Full type definition information.
 */
export interface TypeInfo {
  /** Type name */
  name: string;
  /** Kind of type */
  kind: TypeKind;
  /** Properties defined in the type */
  properties: PropertyInfo[];
  /** Methods defined in the type */
  methods: MethodSignature[];
  /** Extended types (for interfaces/classes) */
  extends?: string[];
  /** Generic type parameters (e.g., ["T", "K extends string"]) */
  generics?: string[];
  /** File path where type is defined */
  file: string;
  /** Line number */
  line: number;
  /** Whether the type is exported */
  isExported: boolean;
  /** Source location */
  location: SourceLocation;
  // Cached fields for performance (computed once during extraction)
  /** Cached structural signature for fast comparison */
  _cachedStructure?: TypeStructure;
  /** Pre-computed property names for similarity calculation */
  _propertyNames?: Set<string>;
  /** Pre-computed method names for similarity calculation */
  _methodNames?: Set<string>;
}

/**
 * Structural hash for quick comparison.
 */
export interface TypeStructure {
  /** Sorted property names and types */
  propertySignature: string;
  /** Sorted method signatures */
  methodSignature: string;
  /** Number of properties */
  propertyCount: number;
  /** Number of methods */
  methodCount: number;
}

/**
 * Duplicate type match.
 */
export interface DuplicateMatch {
  /** The type being compared */
  type: TypeInfo;
  /** The reference type it matches */
  reference: TypeInfo;
  /** Similarity score (0-1) */
  similarity: number;
  /** Type of match */
  matchType: 'exact' | 'renamed' | 'similar';
  /** Properties missing in type compared to reference */
  missingProperties: string[];
  /** Properties in type not in reference */
  extraProperties: string[];
  /** Properties with different types */
  typeDifferences: Array<{ name: string; expected: string; actual: string }>;
}

/**
 * Duplicate detection report.
 */
export interface DuplicateReport {
  /** Total types scanned */
  totalTypes: number;
  /** Number of exact duplicates found */
  exactDuplicates: number;
  /** Number of renamed duplicates (same structure, different name) */
  renamedDuplicates: number;
  /** Number of similar types (>80% overlap) */
  similarTypes: number;
  /** Grouped duplicate matches */
  groups: DuplicateGroup[];
}

/**
 * A group of duplicate/similar types.
 */
export interface DuplicateGroup {
  /** Canonical type (the one to keep) */
  canonical: TypeInfo;
  /** Duplicate/similar types */
  duplicates: DuplicateMatch[];
  /** Suggestion for resolution */
  suggestion: string;
}
