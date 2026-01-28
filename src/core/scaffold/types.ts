/**
 * @arch archcodex.core.types
 *
 * Scaffold type definitions.
 */

/** Supported scaffold languages */
export type ScaffoldLanguage = 'typescript' | 'python' | 'go';

/**
 * Variables available for template substitution.
 */
export interface TemplateVariables {
  /** The architecture ID */
  ARCH_ID: string;
  /** The class/component name */
  CLASS_NAME: string;
  /** The file name (without extension) */
  FILE_NAME: string;
  /** The file path */
  FILE_PATH: string;
  /** The layer (e.g., "core", "cli") extracted from arch ID */
  LAYER: string;
  /** Current date in ISO format */
  DATE: string;
  /** Current timestamp */
  TIMESTAMP: string;
  /** The target language */
  LANGUAGE: ScaffoldLanguage;
  /** Custom variables */
  [key: string]: string | ScaffoldLanguage;
}

/**
 * Options for scaffolding.
 */
export interface ScaffoldOptions {
  /** Architecture ID to use */
  archId: string;
  /** Name for the generated class/component */
  name: string;
  /** Output path (optional, uses suggested_path from index) */
  outputPath?: string;
  /** Template to use (optional, uses template from index) */
  template?: string;
  /** Additional variables */
  variables?: Record<string, string>;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
  /** Target language (typescript, python, go). Inferred from outputPath extension if not specified. */
  language?: ScaffoldLanguage;
}

/**
 * Result of scaffolding.
 */
export interface ScaffoldResult {
  /** Whether scaffolding was successful */
  success: boolean;
  /** Path to the generated file */
  filePath?: string;
  /** Error message if failed */
  error?: string;
  /** The generated content */
  content?: string;
}
