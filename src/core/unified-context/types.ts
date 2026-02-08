/**
 * @arch archcodex.core.types
 *
 * Types for unified architecture context - combines module structure with entity schemas.
 * Designed for LLM consumption with token efficiency in mind.
 */

import type { Field, Relationship, DetectedBehavior } from '../context/types.js';

/**
 * Available sections for context output.
 * LLMs can request specific sections to reduce token usage.
 */
export type ContextSection =
  | 'project-rules'
  | 'modification-order'
  | 'boundaries'
  | 'entities'
  | 'impact'
  | 'constraints';

/**
 * All available sections in display order.
 */
export const ALL_SECTIONS: ContextSection[] = [
  'project-rules',
  'modification-order',
  'boundaries',
  'entities',
  'impact',
  'constraints',
];

/**
 * Options for unified context queries.
 */
export interface UnifiedContextOptions {
  /** Module/directory path to get context for */
  module?: string;
  /** Entity name to get context for */
  entity?: string;
  /** Output format */
  format?: 'compact' | 'full' | 'json';
  /** Filter to specific sections (default: all) */
  sections?: ContextSection[];
  /** Bypass interactive mode for large modules */
  confirm?: boolean;
  /** Return structure summary only (no file lists) */
  summary?: boolean;
  /** Return minimal essential info only (arch, boundaries, forbidden) */
  brief?: boolean;
}

/**
 * File role within a module.
 */
export type FileRole = 'defines' | 'implements' | 'orchestrates';

/**
 * A file in the unified context with role and impact information.
 */
export interface UnifiedFileInfo {
  /** Relative path within module */
  path: string;
  /** Architecture ID (@arch tag) */
  archId: string | null;
  /** Role in the module */
  role: FileRole;
  /** Why this role was assigned */
  roleReason: string;
  /** Number of files that depend on this file (would break if changed) */
  breaks: number;
  /** Exported signatures (for compact display) */
  signatures?: string[];
}

/**
 * Common import example for layer boundaries.
 */
export interface CommonImport {
  /** Layer this import is from */
  layer: string;
  /** Example import path */
  path: string;
  /** Export name(s) */
  exports: string[];
}

/**
 * Layer boundary information.
 */
export interface LayerBoundary {
  /** Current layer name */
  layer: string;
  /** Layers that can be imported */
  canImport: string[];
  /** Layers that cannot be imported */
  cannotImport: string[];
  /** Common import examples */
  commonImports?: CommonImport[];
}

/**
 * Inline entity schema for compact display.
 */
export interface InlineEntitySchema {
  /** Entity name */
  name: string;
  /** Field names with optional markers (e.g., ["path", "archId?", "checksum"]) */
  fields: string[];
  /** Relationships in compact form (e.g., ["N:1 FileRecord via fromFile"]) */
  relationships?: string[];
  /** Detected behaviors (e.g., ["soft_delete", "ordering"]) */
  behaviors?: string[];
  /** Operation names (e.g., ["getFile", "queryFiles"]) */
  operations: string[];
}

/**
 * ArchCodex-specific constraints for a module.
 */
export interface ArchConstraints {
  /** Primary architecture ID for the module */
  architecture: string;
  /** Forbidden imports */
  forbid?: string[];
  /** Forbidden code patterns (regex) */
  patterns?: string[];
  /** Required imports/patterns */
  require?: string[];
  /** Architectural hints (all hints, not just first) */
  hints?: string[];
}

/**
 * Layer hierarchy entry from config.yaml.
 */
export interface LayerHierarchyEntry {
  /** Layer name */
  name: string;
  /** Layers this layer can import from (empty = leaf layer) */
  canImport: string[];
}

/**
 * Constraints shared across all architectures in the module.
 */
export interface SharedConstraints {
  /** Forbidden imports shared by all */
  forbid?: string[];
  /** Forbidden patterns shared by all */
  patterns?: string[];
  /** Hints shared by all */
  hints?: string[];
}

/**
 * Project-wide rules from session context.
 */
export interface ProjectRules {
  /** Layer hierarchy graph */
  layers: LayerHierarchyEntry[];
  /** Constraints shared across ALL architectures in the module */
  shared?: SharedConstraints;
}

/**
 * External dependency or consumer.
 */
export interface ExternalFile {
  /** File path */
  path: string;
  /** Architecture ID if known */
  archId?: string | null;
}

/**
 * Submodule information for interactive menus.
 */
export interface SubmoduleInfo {
  /** Submodule path (e.g., "src/core/") */
  path: string;
  /** Number of files in this submodule */
  fileCount: number;
  /** Dominant architecture ID (most common) */
  dominantArch?: string;
}

/**
 * Complete unified context for a module.
 */
export interface UnifiedModuleContext {
  /** Module path */
  modulePath: string;
  /** Total file count */
  fileCount: number;
  /** Total line count */
  lineCount: number;
  /** Entity count */
  entityCount: number;

  /** Files grouped by role with modification order */
  files: {
    defines: UnifiedFileInfo[];
    implements: UnifiedFileInfo[];
    orchestrates: UnifiedFileInfo[];
  };

  /** Layer boundaries */
  boundaries?: LayerBoundary;

  /** Project-wide rules (layer hierarchy, shared constraints) */
  projectRules?: ProjectRules;

  /** Entity schemas referenced in this module */
  entities: InlineEntitySchema[];

  /** External consumers (files that import from this module) */
  consumers: ExternalFile[];

  /** ArchCodex-specific constraints */
  archcodex: ArchConstraints;

  /** Top submodules by file count (for interactive menus) */
  topSubmodules?: SubmoduleInfo[];

  /** True if this is a large module response (interactive mode) */
  isLargeModule?: boolean;

  /** True if this is a summary-only response */
  isSummary?: boolean;

  /** True if this is a brief/minimal response */
  isBrief?: boolean;

  /** Sections that were requested (for Available Actions footer) */
  requestedSections?: ContextSection[];
}

/**
 * Complete unified context for an entity.
 */
export interface UnifiedEntityContext {
  /** Entity name */
  name: string;
  /** Full field definitions */
  fields: Field[];
  /** Relationships to other entities */
  relationships: Relationship[];
  /** Detected behaviors */
  behaviors: DetectedBehavior[];
  /** Existing operations */
  operations: string[];
  /** Similar operations (duplicate*, clone*, etc.) */
  similarOperations?: string[];

  /** Files grouped by role */
  files: {
    defines: UnifiedFileInfo[];
    implements: UnifiedFileInfo[];
    orchestrates: UnifiedFileInfo[];
  };
}

/**
 * Result of a unified context query.
 */
export interface UnifiedContext {
  /** Query metadata */
  query: {
    type: 'module' | 'entity';
    target: string;
  };

  /** Module context (when query.type === 'module') */
  module?: UnifiedModuleContext;

  /** Entity context (when query.type === 'entity') */
  entity?: UnifiedEntityContext;
}

/**
 * Format options for unified context output.
 */
export interface UnifiedContextFormatOptions {
  /** Output format */
  format: 'compact' | 'full' | 'json';
  /** Use markdown formatting */
  markdown?: boolean;
  /** Sections to include (for Available Actions footer) */
  sections?: ContextSection[];
}
