/**
 * @arch archcodex.core.types
 *
 * Arch tag type definitions.
 */

/**
 * Extracted @arch tag from a source file.
 */
export interface ArchTag {
  /** The architecture ID (e.g., "domain.payment.processor") */
  archId: string;
  /** Inline mixins specified with +mixin syntax (e.g., "@arch convex.mutation +profile-counts") */
  inlineMixins?: string[];
  /** Line number where the tag was found */
  line: number;
  /** Column number where the tag starts */
  column: number;
}

/**
 * Extracted @override annotation.
 */
export interface OverrideTag {
  /** The rule being overridden (e.g., "forbid_import") */
  rule: string;
  /** The specific value being overridden (e.g., "http") */
  value: string;
  /** Required: reason for the override */
  reason?: string;
  /** Optional: expiration date (ISO format YYYY-MM-DD) */
  expires?: string;
  /** Optional: ticket reference */
  ticket?: string;
  /** Optional: who approved */
  approvedBy?: string;
  /** Line number where the override starts */
  line: number;
}

/**
 * Semantic intent annotation (@intent:name).
 * These are first-class patterns that can satisfy constraints like require_one_of.
 * Example: @intent:includes-deleted, @intent:admin-only, @intent:public-endpoint
 */
export interface IntentAnnotation {
  /** The intent name (e.g., "includes-deleted", "admin-only") */
  name: string;
  /** Line number where the annotation was found */
  line: number;
  /** Column number where the annotation starts */
  column: number;
}

/**
 * Result of parsing a source file for arch tags.
 */
export interface ParseResult {
  /** The @arch tag if found */
  archTag: ArchTag | null;
  /** All @override tags found */
  overrides: OverrideTag[];
  /** Semantic intent annotations (@intent:name) */
  intents: IntentAnnotation[];
  /** Any parsing errors encountered */
  errors: ParseError[];
}

/**
 * A parsing error.
 */
export interface ParseError {
  /** Error message */
  message: string;
  /** Line number where error occurred */
  line: number;
  /** Column number if available */
  column?: number;
}
