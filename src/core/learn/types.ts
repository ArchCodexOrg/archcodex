/**
 * @arch archcodex.core.types
 *
 * Types for codebase skeleton extraction and LLM-driven architecture learning.
 */

/**
 * Summary of a directory's contents.
 */
export interface DirectorySummary {
  /** Relative path from project root */
  path: string;
  /** Number of files in this directory (non-recursive) */
  fileCount: number;
  /** Common file patterns detected (e.g., *.controller.ts) */
  patterns?: string[];
}

/**
 * Summary of a class definition.
 */
export interface ClassSummary {
  /** Class name */
  name: string;
  /** Exported public methods */
  methods: string[];
  /** Base class if extends */
  extends?: string;
  /** Implemented interfaces */
  implements: string[];
  /** Class decorators */
  decorators: string[];
}

/**
 * Summary of a single module (file).
 */
export interface ModuleSummary {
  /** Relative path from project root */
  path: string;
  /** Exported symbols (classes, functions, types) */
  exports: string[];
  /** Internal imports (relative paths, not node_modules) */
  imports: string[];
  /** Class definitions in this file */
  classes?: ClassSummary[];
  /** Standalone function names */
  functions?: string[];
  /** Interface names */
  interfaces?: string[];
  /** Existing @arch tag if any */
  existingArch?: string;
}

/**
 * A detected cluster of related files based on import patterns.
 */
export interface ImportCluster {
  /** Suggested name for this cluster (e.g., "CLI Layer", "Core Domain") */
  name: string;
  /** Glob pattern matching files in this cluster */
  pattern: string;
  /** File paths belonging to this cluster */
  files: string[];
  /** Patterns this cluster imports from */
  importsFrom: string[];
  /** Patterns that import from this cluster */
  importedBy: string[];
  /** Suggested layer level (0 = lowest, higher = depends on more) */
  layerLevel: number;
}

/**
 * A file that already has an @arch tag.
 */
export interface ExistingTag {
  /** File path */
  file: string;
  /** Architecture ID */
  archId: string;
}

/**
 * Complete project skeleton - the input for LLM analysis.
 */
export interface ProjectSkeleton {
  /** Project root path */
  rootPath: string;
  /** Total number of source files */
  totalFiles: number;
  /** Directory summaries */
  directories: DirectorySummary[];
  /** Module summaries */
  modules: ModuleSummary[];
  /** Auto-detected import clusters */
  importClusters: ImportCluster[];
  /** Files already tagged with @arch */
  existingTags: ExistingTag[];
  /** Detected patterns and conventions */
  detectedPatterns: DetectedPatterns;
}

/**
 * Patterns detected in the codebase.
 */
export interface DetectedPatterns {
  /** Naming conventions (e.g., "*.controller.ts", "*.service.ts") */
  namingConventions: string[];
  /** Directory-based layers (e.g., src/cli, src/core) */
  directoryLayers: string[];
  /** Common import patterns */
  importPatterns: string[];
  /** Framework/library hints (e.g., "express", "react") */
  frameworkHints: string[];
}

/**
 * Options for skeleton extraction.
 */
export interface SkeletonOptions {
  /** File patterns to include (default: src/**\/*.ts) */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Maximum files to analyze (for large codebases) */
  maxFiles?: number;
  /** Skip class/function extraction (faster but less detailed) */
  skipDetails?: boolean;
}

/**
 * Result of skeleton extraction.
 */
export interface SkeletonResult {
  /** The extracted skeleton */
  skeleton: ProjectSkeleton;
  /** Extraction timing in milliseconds */
  extractionTimeMs: number;
  /** Warnings encountered during extraction */
  warnings: string[];
}

/**
 * Request to learn architecture from skeleton.
 */
export interface LearnRequest {
  /** The project skeleton */
  skeleton: ProjectSkeleton;
  /** Additional context or hints from user */
  userHints?: string;
  /** Existing registry content (for incremental learning) */
  existingRegistry?: string;
}

/**
 * Response from LLM with draft registry.
 */
export interface LearnResponse {
  /** Generated registry YAML content */
  registryYaml: string;
  /** LLM's explanation of the architecture */
  explanation: string;
  /** Suggested next steps */
  suggestions: string[];
  /** Confidence level (0-1) */
  confidence: number;
}

/**
 * Complete result of the learn command.
 */
export interface LearnResult {
  /** The extracted skeleton */
  skeleton: ProjectSkeleton;
  /** The generated registry YAML */
  registryYaml: string;
  /** LLM explanation */
  explanation: string;
  /** Suggestions for refinement */
  suggestions: string[];
  /** Output path where registry was written */
  outputPath: string;
  /** Total processing time */
  totalTimeMs: number;
}

/**
 * YAML-serializable version of skeleton for LLM prompt.
 * More compact than full ProjectSkeleton.
 */
export interface SkeletonYaml {
  /** Comment/header */
  _comment: string;
  /** Total files */
  files: number;
  /** Directory list with file counts */
  directories: Array<{ path: string; files: number }>;
  /** Simplified module info */
  modules: Array<{
    path: string;
    exports: string[];
    imports: string[];
    classes?: Array<{ name: string; methods: string[] }>;
  }>;
  /** Import clusters */
  import_clusters: Array<{
    name: string;
    pattern: string;
    imports_from: string[];
    imported_by: string[];
  }>;
  /** Existing tags */
  existing_tags: Array<{ file: string; arch: string }>;
}
