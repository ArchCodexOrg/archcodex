/**
 * @arch archcodex.core.types
 *
 * Types for context extraction from various schema sources.
 */

import type {
  Field,
  Relationship,
  DetectedBehavior,
  OperationInfo,
  SimilarOperation,
  SchemaSource,
} from '../types.js';

/**
 * Raw entity extracted from a schema source.
 */
export interface ExtractedEntity {
  /** Entity/table name */
  name: string;
  /** Fields in the entity */
  fields: Field[];
  /** Relationships to other entities */
  relationships: Relationship[];
}

/**
 * Result of schema extraction.
 */
export interface SchemaExtractionResult {
  /** The schema source type */
  source: SchemaSource;
  /** Path to the schema file */
  schemaPath: string;
  /** All extracted entities */
  entities: ExtractedEntity[];
}

/**
 * Options for schema extraction.
 */
export interface ExtractionOptions {
  /** Project root directory */
  projectRoot: string;
  /** Specific entity to focus on (optional) */
  focusEntity?: string;
}

/**
 * Result of behavior detection for an entity.
 */
export interface BehaviorDetectionResult {
  /** Entity name */
  entity: string;
  /** Detected behaviors */
  behaviors: DetectedBehavior[];
}

/**
 * Result of operation finding for an entity.
 */
export interface OperationFindResult {
  /** Entity name */
  entity: string;
  /** Existing operations */
  existingOperations: OperationInfo[];
  /** Similar operations (duplicate*, clone*, copy*) */
  similarOperations: SimilarOperation[];
}

/**
 * Interface for schema extractors (Convex, Prisma, etc.).
 */
export interface ISchemaExtractor {
  /** The schema source type */
  readonly source: SchemaSource;

  /**
   * Check if this extractor can handle the project.
   */
  canExtract(projectRoot: string): Promise<boolean>;

  /**
   * Extract schema from the project.
   */
  extract(options: ExtractionOptions): Promise<SchemaExtractionResult>;
}
