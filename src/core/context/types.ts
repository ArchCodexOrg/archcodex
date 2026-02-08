/**
 * @arch archcodex.core.types
 *
 * Types for context synthesis - providing LLMs with a mental model of entities.
 */

/**
 * Supported relationship types between entities.
 */
export type RelationshipType = 'has_many' | 'belongs_to' | 'many_to_many' | 'has_one';

/**
 * Detected behavior patterns in an entity.
 */
export type BehaviorType = 'soft_delete' | 'ordering' | 'audit_trail' | 'optimistic_lock';

/**
 * A field in an entity schema.
 */
export interface Field {
  /** Field name */
  name: string;
  /** Field type (string, number, boolean, etc.) */
  type: string;
  /** Whether the field is optional */
  optional?: boolean;
  /** Whether the field is an ID/reference to another entity */
  isReference?: boolean;
  /** If reference, the target entity */
  referenceTarget?: string;
}

/**
 * A relationship between entities.
 * Phase 1: Just the structural relationship, no consequences.
 */
export interface Relationship {
  /** Relationship name (e.g., "comments", "tags", "assignee") */
  name: string;
  /** Type of relationship */
  type: RelationshipType;
  /** Target entity name */
  target: string;
  /** Field that defines this relationship (for belongs_to) */
  field?: string;
}

/**
 * A detected behavior pattern in an entity.
 * Phase 1: Just detection, no consequences.
 */
export interface DetectedBehavior {
  /** Type of behavior detected */
  type: BehaviorType;
  /** Field(s) that indicate this behavior */
  fields: string[];
}

/**
 * Information about an existing operation on an entity.
 */
export interface OperationInfo {
  /** Operation name (e.g., "createTodo", "deleteTodo") */
  name: string;
  /** File where the operation is defined */
  file: string;
  /** Line number in the file */
  line: number;
}

/**
 * Information about a similar operation in the codebase.
 */
export interface SimilarOperation {
  /** Operation name (e.g., "duplicateTemplate") */
  name: string;
  /** File where the operation is defined */
  file: string;
  /** Line number in the file */
  line: number;
}

/**
 * Complete context for an entity.
 * Phase 1: Objective facts only, no inference.
 */
export interface EntityContext {
  /** Entity name */
  name: string;
  /** Fields in the entity */
  fields: Field[];
  /** Relationships to other entities */
  relationships: Relationship[];
  /** Detected behavior patterns */
  behaviors: DetectedBehavior[];
  /** Existing operations on this entity */
  existingOperations: OperationInfo[];
  /** Similar operations in the codebase (duplicate*, clone*, copy*) */
  similarOperations: SimilarOperation[];
}

/**
 * Relevance tier for file references.
 */
export type FileRelevance = 'direct' | 'related' | 'peripheral';

/**
 * Request for context synthesis.
 */
export interface ContextRequest {
  /** Entity or feature name to focus on */
  focus: string;
  /** Optional operation hint (e.g., "duplicate", "delete") */
  operation?: string;
  /** Optional specific files to include in analysis */
  files?: string[];
  /** Project root directory */
  projectRoot: string;
  /** Maximum number of file references to return (default: 15) */
  maxFiles?: number;
  /** Return all files without filtering (default: false) */
  verbose?: boolean;
}

/**
 * Architectural constraint relevant to the entity.
 */
export interface ArchConstraint {
  /** Architecture ID */
  archId: string;
  /** Key constraints */
  constraints: string[];
}

/**
 * A file reference to an entity from the architecture map.
 */
export interface EntityFileReference {
  /** File path */
  path: string;
  /** Reference type (type, function, schema, import) */
  refType: string | null;
  /** Line number where reference occurs */
  lineNumber: number | null;
  /** Relevance tier relative to the current operation */
  relevance?: FileRelevance;
}

/**
 * Files referencing an entity, grouped by architecture.
 */
export interface EntityFilesByArchitecture {
  /** Architecture ID */
  archId: string;
  /** Files in this architecture that reference the entity */
  files: EntityFileReference[];
}

/**
 * UI component in a component group.
 */
export interface UIComponentInfo {
  /** File path relative to project root */
  path: string;
  /** What this component renders (e.g., 'task', 'note') */
  renders?: string;
}

/**
 * Related files for a component group.
 */
export interface UIComponentRelated {
  /** Actions file path */
  actions?: string;
  /** Handlers file path */
  handlers?: string;
  /** Additional related files */
  [key: string]: string | undefined;
}

/**
 * UI components section from component groups registry.
 */
export interface UIComponentsContext {
  /** Component group name */
  group: string;
  /** Warning message about coupled components */
  warning?: string;
  /** Components in the group */
  components: UIComponentInfo[];
  /** Related files (handlers, actions, etc.) */
  related?: UIComponentRelated;
}

/**
 * Complete synthesized context for an entity.
 */
export interface SynthesizedContext {
  /** Entity name */
  entity: string;
  /** Fields in the entity */
  fields: Field[];
  /** Relationships to other entities */
  relationships: Relationship[];
  /** Detected behavior patterns */
  behaviors: DetectedBehavior[];
  /** Existing operations on this entity */
  existingOperations: OperationInfo[];
  /** Similar operations in the codebase */
  similarOperations: SimilarOperation[];
  /** Architectural constraints (from ArchCodex registry) */
  constraints?: ArchConstraint;
  /** Files referencing this entity, grouped by architecture (from architecture map) */
  fileReferences?: EntityFilesByArchitecture[];
  /** UI components from component groups registry (when entity matches a group) */
  uiComponents?: UIComponentsContext;
  /** Number of file references omitted by filtering */
  truncatedFiles?: number;
}

/**
 * Options for context output formatting.
 */
export interface ContextFormatOptions {
  /** Output format */
  format: 'yaml' | 'json' | 'compact';
}

/**
 * Supported ORM/schema sources.
 */
export type SchemaSource = 'convex' | 'prisma' | 'typeorm' | 'drizzle' | 'typescript';

/**
 * Result of schema source detection.
 */
export interface DetectedSchemaSource {
  /** The detected source type */
  source: SchemaSource;
  /** Path to the schema file */
  schemaPath: string;
}

/**
 * Cached schema extraction result.
 */
export interface SchemaCache {
  /** Cache version for format changes */
  version: number;
  /** Schema source type */
  source: SchemaSource;
  /** Path to the schema file */
  schemaPath: string;
  /** Schema file modification time (for invalidation) */
  schemaMtime: number;
  /** When the cache was created */
  extractedAt: string;
  /** Extracted entities */
  entities: EntityContext[];
}

/**
 * Options for context listing.
 */
export interface ContextListOptions {
  /** Search pattern to filter entities by name */
  search?: string;
  /** Force cache refresh */
  refresh?: boolean;
  /** Project root directory */
  projectRoot: string;
}
