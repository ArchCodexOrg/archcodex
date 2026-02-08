/**
 * @arch archcodex.core.types
 *
 * Type definitions for the ArchCodex database layer.
 */

/**
 * A file record in the database.
 */
export interface FileRecord {
  /** Relative path from project root */
  path: string;
  /** Architecture ID from @arch tag */
  archId: string | null;
  /** Description of the file (from @description or AI-generated) */
  description: string | null;
  /** SHA-256 checksum (16 chars) */
  checksum: string;
  /** File modification time (Unix timestamp) */
  mtime: number;
  /** Number of lines in file */
  lineCount: number | null;
  /** When this record was last updated */
  updatedAt: string;
}

/**
 * An import relationship between files.
 */
export interface ImportRecord {
  /** ID of this record */
  id: number;
  /** File that contains the import */
  fromFile: string;
  /** File being imported */
  toFile: string;
}

/**
 * An entity reference in a file.
 */
export interface EntityRefRecord {
  /** ID of this record */
  id: number;
  /** File containing the reference */
  filePath: string;
  /** Entity name being referenced */
  entityName: string;
  /** Type of reference */
  refType: 'type' | 'function' | 'variable' | 'import' | 'schema' | null;
  /** Line number of the reference */
  lineNumber: number | null;
}

/**
 * A validation result in the database.
 */
export interface ValidationRecord {
  /** File path */
  filePath: string;
  /** Validation status */
  status: 'pass' | 'fail' | 'warn';
  /** JSON array of violations */
  violations: string | null;
  /** JSON array of warnings */
  warnings: string | null;
  /** File checksum when validated */
  checksum: string;
  /** Registry checksum when validated */
  registryChecksum: string | null;
  /** When this validation was performed */
  validatedAt: string;
}

/**
 * Database row types (snake_case as stored in SQLite).
 */
export interface FileRow {
  path: string;
  arch_id: string | null;
  description: string | null;
  checksum: string;
  mtime: number;
  line_count: number | null;
  updated_at: string;
}

export interface ImportRow {
  id: number;
  from_file: string;
  to_file: string;
}

export interface EntityRefRow {
  id: number;
  file_path: string;
  entity_name: string;
  ref_type: string | null;
  line_number: number | null;
}

export interface ValidationRow {
  file_path: string;
  status: string;
  violations: string | null;
  warnings: string | null;
  checksum: string;
  registry_checksum: string | null;
  validated_at: string;
}

/**
 * Options for file queries.
 */
export interface FileQueryOptions {
  /** Filter by architecture ID */
  archId?: string;
  /** Filter by architecture pattern (LIKE query) */
  archPattern?: string;
  /** Filter by path pattern (LIKE query, e.g., 'src/core/db/%') */
  pathPattern?: string;
  /** Limit number of results */
  limit?: number;
}

/**
 * Options for entity reference queries.
 */
export interface EntityRefQueryOptions {
  /** Filter by entity name */
  entityName?: string;
  /** Filter by entity name pattern (LIKE query) */
  entityPattern?: string;
  /** Filter by reference type */
  refType?: string;
  /** Limit number of results */
  limit?: number;
}

/**
 * Result of an import graph query.
 */
export interface ImportGraphResult {
  /** Files imported by the queried file */
  imports: { path: string; archId: string | null }[];
  /** Files that import the queried file */
  importedBy: { path: string; archId: string | null }[];
}

/**
 * Summary of files by architecture.
 */
export interface ArchitectureSummary {
  /** Architecture ID */
  archId: string;
  /** Number of files */
  fileCount: number;
}

/**
 * Role of a file within a module.
 * Used to help agents understand modification order.
 *
 * - defines: Type definitions, schemas, interfaces (modify first)
 * - implements: Core logic implementing the contracts (modify second)
 * - orchestrates: Coordinates multiple implementations (modify third)
 * - consumes: Uses the module from outside (may need updates)
 */
export type FileRole = 'defines' | 'implements' | 'orchestrates' | 'consumes';
