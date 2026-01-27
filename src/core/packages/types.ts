/**
 * @arch archcodex.core.types
 *
 * Types for package boundary validation in monorepos.
 */

/**
 * A package boundary violation.
 */
export interface PackageBoundaryViolation {
  /** The file that contains the invalid import */
  sourceFile: string;
  /** The source package path */
  sourcePackage: string;
  /** The file being imported */
  importedFile: string;
  /** The target package path */
  targetPackage: string;
  /** Packages the source is allowed to import from */
  allowedImports: string[];
  /** Human-readable message */
  message: string;
}

/**
 * Result of package boundary validation.
 */
export interface PackageBoundaryResult {
  /** Whether all boundaries are respected */
  passed: boolean;
  /** All violations found */
  violations: PackageBoundaryViolation[];
  /** Summary statistics */
  summary: {
    /** Total files checked */
    filesChecked: number;
    /** Total imports analyzed */
    importsAnalyzed: number;
    /** Number of violations */
    violationCount: number;
  };
}

/**
 * Normalized package configuration with resolved paths.
 */
export interface ResolvedPackage {
  /** Package name (or path if name not specified) */
  name: string;
  /** Normalized path (with trailing /) */
  path: string;
  /** Packages this package can import from (by name) */
  canImport: string[];
}
