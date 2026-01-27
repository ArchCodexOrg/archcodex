/**
 * @arch archcodex.core.types
 *
 * Types for neighborhood analysis - showing import boundaries for a file.
 */

/**
 * Options for neighborhood analysis.
 */
export interface NeighborhoodOptions {
  /** Depth of import tree to traverse (default: 1 = immediate neighbors) */
  depth?: number;
  /** Include external/node_modules imports */
  includeExternal?: boolean;
  /** Output format */
  format?: 'human' | 'json' | 'yaml' | 'ai';
  /** Include pattern registry suggestions */
  withPatterns?: boolean;
  /** Only show violations */
  violationsOnly?: boolean;
}

/**
 * Layer boundary information from config.
 */
export interface LayerInfo {
  /** Layer name from config */
  name: string;
  /** Layers this layer can import from */
  canImport: string[];
  /** Layers this layer cannot import from (derived) */
  cannotImport: string[];
}

/**
 * An import with its validation status.
 */
export interface ImportStatus {
  /** The import path (relative or absolute) */
  path: string;
  /** Whether this import is allowed */
  allowed: boolean;
  /** If forbidden, the rule that forbids it */
  forbiddenBy?: string;
  /** Why it's forbidden (from constraint) */
  why?: string;
  /** The layer of the imported file */
  layer?: string;
  /** Layer violation message if applicable */
  layerViolation?: string;
}

/**
 * A forbidden import constraint with full context.
 */
export interface ForbiddenImportConstraint {
  /** The forbidden patterns */
  value: string[];
  /** Why it's forbidden */
  why?: string;
  /** Simple alternative */
  alternative?: string;
  /** Detailed alternatives */
  alternatives?: Array<{
    module: string;
    export?: string;
    description?: string;
  }>;
}

/**
 * A required import that's missing.
 */
export interface MissingRequiredImport {
  /** The required import */
  import: string;
  /** Why it's required */
  why?: string;
  /** Match mode (all or any) */
  match?: 'all' | 'any';
  /** Suggested import statement */
  suggestion?: {
    statement: string;
    insertAt: 'top' | 'bottom';
  };
}

/**
 * Pattern suggestion from pattern registry.
 */
export interface PatternSuggestion {
  /** Pattern name */
  name: string;
  /** Relevance score (high/medium/low) */
  relevance: 'high' | 'medium' | 'low';
  /** Canonical file path */
  canonical: string;
  /** Exports from this pattern */
  exports?: string[];
  /** Usage description */
  usage?: string;
  /** Example code */
  example?: string;
}

/**
 * Constraints summary with full context.
 */
export interface ConstraintsSummary {
  /** Forbidden imports with context */
  forbidImport: ForbiddenImportConstraint[];
  /** Required imports */
  requireImport: Array<{
    value: string[];
    match?: 'all' | 'any';
    why?: string;
  }>;
  /** Who can import this file */
  importableBy?: {
    patterns: string[];
    why?: string;
  };
}

/**
 * Complete neighborhood analysis result.
 */
export interface Neighborhood {
  /** The analyzed file path */
  file: string;
  /** Architecture ID from @arch tag (null if untagged) */
  architecture: string | null;
  /** Layer information from config */
  layer: LayerInfo;

  /** Files that import this file */
  importedBy: ImportedByInfo[];

  /** Who can import this file (from importable_by constraint) */
  importableBy?: {
    patterns: string[];
    why?: string;
  };

  /** Current imports with status */
  currentImports: ImportStatus[];

  /** Required imports that are missing */
  missingRequired: MissingRequiredImport[];

  /** Allowed import patterns from constraints */
  allowedImports: string[];

  /** Forbidden import constraints with full context */
  forbiddenImports: ForbiddenImportConstraint[];

  /** Full constraints summary */
  constraints: ConstraintsSummary;

  /** Patterns for modules in the same layer (implicitly allowed) */
  sameLayerPatterns: string[];

  /** Suggested patterns from pattern registry */
  suggestedPatterns?: PatternSuggestion[];

  /** AI-friendly summary */
  aiSummary?: string;
}

/**
 * Info about a file that imports the analyzed file.
 */
export interface ImportedByInfo {
  /** Path of the importing file */
  file: string;
  /** Architecture ID of the importing file */
  architecture: string | null;
}

/**
 * Formatted neighborhood output (for JSON/YAML).
 */
export interface FormattedNeighborhood {
  file: string;
  architecture: string | null;
  layer: {
    name: string;
    can_import: string[];
    cannot_import: string[];
  };
  imported_by: Array<{
    file: string;
    architecture: string | null;
  }>;
  importable_by?: {
    patterns: string[];
    why?: string;
  };
  current_imports: Array<{
    path: string;
    status: 'allowed' | 'forbidden' | 'layer_violation';
    why?: string;
    layer?: string;
  }>;
  missing_required: Array<{
    import: string;
    why?: string;
    suggestion?: string;
  }>;
  constraints: {
    forbid_import: Array<{
      value: string[];
      why?: string;
      alternative?: string;
    }>;
    require_import: Array<{
      value: string[];
      match?: 'all' | 'any';
      why?: string;
    }>;
  };
  suggested_patterns?: Array<{
    name: string;
    canonical: string;
    exports?: string[];
    usage?: string;
  }>;
  ai_summary?: string;
}
