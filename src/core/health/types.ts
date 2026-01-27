/**
 * @arch archcodex.core.types
 */

/**
 * Override debt metrics.
 */
export interface OverrideDebt {
  /** Total active overrides */
  active: number;
  /** Files with overrides */
  filesWithOverrides: number;
  /** Overrides expiring within threshold */
  expiringSoon: number;
  /** Already expired overrides */
  expired: number;
  /** Overrides without expiry date */
  noExpiry: number;
}

/**
 * Architecture usage entry.
 */
export interface ArchUsage {
  /** Architecture ID */
  archId: string;
  /** Number of files using this architecture */
  fileCount: number;
}

/**
 * Architecture coverage metrics.
 */
export interface CoverageMetrics {
  /** Total source files scanned */
  totalFiles: number;
  /** Files with @arch tags */
  taggedFiles: number;
  /** Files without @arch tags */
  untaggedFiles: number;
  /** Coverage percentage */
  coveragePercent: number;
  /** Sample of untagged files (up to 10) */
  untaggedSample: string[];
  /** Set of architecture IDs actually used by files */
  usedArchIds: string[];
  /** File count per architecture (sorted by count descending) */
  archUsage?: ArchUsage[];
}

/**
 * Pair of similar architectures (potential bloat).
 */
export interface SimilarArchPair {
  /** First architecture ID */
  archId1: string;
  /** Second architecture ID */
  archId2: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** What makes them similar */
  reason: string;
}

/**
 * Redundant architecture (adds no unique value).
 */
export interface RedundantArch {
  /** Architecture ID */
  archId: string;
  /** Parent it could be replaced with */
  parentArchId: string;
  /** Why it's considered redundant */
  reason: string;
}

/**
 * Deep inheritance chain (overly complex hierarchy).
 */
export interface DeepInheritance {
  /** Architecture ID */
  archId: string;
  /** Full inheritance chain */
  chain: string[];
  /** Depth of the chain */
  depth: number;
}

/**
 * Low usage architecture (potentially over-specific).
 */
export interface LowUsageArch {
  /** Architecture ID */
  archId: string;
  /** Number of files using this architecture */
  fileCount: number;
  /** Severity: 'warning' for 1 file, 'info' for 2 files */
  severity: 'warning' | 'info';
  /** Suggestion for consolidation */
  suggestion: string;
}

/**
 * Singleton violation (singleton arch used by multiple files).
 */
export interface SingletonViolation {
  /** Architecture ID */
  archId: string;
  /** Number of files using this singleton architecture */
  fileCount: number;
  /** Files using this architecture */
  files: string[];
}

/**
 * Registry health metrics.
 */
export interface RegistryHealth {
  /** Total architectures defined in registry */
  totalArchitectures: number;
  /** Architectures used by at least one file */
  usedArchitectures: number;
  /** Architectures with no files using them */
  unusedArchitectures: number;
  /** List of unused architecture IDs */
  unusedArchIds: string[];
  /** Usage percentage */
  usagePercent: number;
  /** Similar architecture pairs (potential consolidation) */
  similarArchitectures?: SimilarArchPair[];
  /** Architectures that add no unique constraints */
  redundantArchitectures?: RedundantArch[];
  /** Architectures with deep inheritance chains (>3 levels) */
  deepInheritance?: DeepInheritance[];
  /** Architectures with low file usage (potentially over-specific) */
  lowUsageArchitectures?: LowUsageArch[];
  /** Singleton architectures used by multiple files */
  singletonViolations?: SingletonViolation[];
}

/**
 * Constraint violation statistics.
 */
export interface ConstraintStats {
  /** Constraint rule:value */
  constraint: string;
  /** Number of overrides for this constraint */
  overrideCount: number;
  /** Files with this override */
  files: string[];
}

/**
 * Architecture override statistics.
 */
export interface ArchOverrideStats {
  /** Architecture ID */
  archId: string;
  /** Total number of overrides in files using this architecture */
  overrideCount: number;
  /** Number of files with overrides */
  filesWithOverrides: number;
}

/**
 * File override statistics (files with multiple overrides).
 */
export interface FileOverrideStats {
  /** File path */
  filePath: string;
  /** Architecture ID of the file */
  archId: string | null;
  /** Number of overrides in this file */
  overrideCount: number;
}

/**
 * Health recommendation.
 */
export interface HealthRecommendation {
  /** Recommendation type */
  type: 'warning' | 'info' | 'action';
  /** Short title */
  title: string;
  /** Detailed message */
  message: string;
  /** Suggested command to run */
  command?: string;
}

/**
 * Discovery index status.
 */
export interface IndexStatus {
  /** Whether the index is stale */
  isStale: boolean;
  /** Reason for staleness */
  reason?: string;
  /** Missing architecture IDs */
  missingArchIds?: string[];
}

/**
 * Intent health metrics.
 */
export interface IntentHealth {
  /** Total files scanned */
  totalFiles: number;
  /** Files with intent annotations */
  filesWithIntents: number;
  /** Total intent annotations found */
  totalIntents: number;
  /** File-level intents (in file headers) */
  fileLevelIntents: number;
  /** Function-level intents (on individual functions/methods) */
  functionLevelIntents: number;
  /** Number of unique intents used */
  uniqueIntents: number;
  /** Intents used but not defined in registry */
  undefinedIntents: string[];
  /** Defined intents that aren't used anywhere */
  unusedIntents: string[];
  /** Number of validation issues (conflicts, missing patterns) */
  validationIssues: number;
  /** Intent coverage percentage */
  intentCoveragePercent: number;
  /** Error loading intent registry (if any) */
  registryError?: string;
}

/**
 * A layer path pattern that matches no files on disk.
 */
export interface PhantomLayerPath {
  /** Layer name */
  layerName: string;
  /** The path pattern that matches nothing */
  pattern: string;
}

/**
 * An exclusion pattern where all matched files already have @arch tags.
 */
export interface StaleExclusion {
  /** The exclusion pattern */
  pattern: string;
  /** Source of the pattern (e.g., "files.scan.exclude") */
  source: string;
  /** Number of files matching this exclusion */
  matchedFileCount: number;
  /** Why it's considered stale */
  reason: string;
}

/**
 * Layer coverage health metrics.
 */
export interface LayerCoverageHealth {
  /** Total source files considered */
  totalSourceFiles: number;
  /** Files covered by at least one layer */
  coveredFiles: number;
  /** Coverage percentage */
  coveragePercent: number;
  /** Files not in any layer */
  orphanFiles: string[];
  /** Layer paths that match no files */
  phantomPaths: PhantomLayerPath[];
  /** Exclusion patterns that are no longer needed */
  staleExclusions: StaleExclusion[];
}

/**
 * Complete health report.
 */
export interface HealthReport {
  /** Override debt metrics */
  overrideDebt: OverrideDebt;
  /** Architecture coverage */
  coverage: CoverageMetrics;
  /** Registry health (unused architectures) */
  registryHealth: RegistryHealth;
  /** Top violated constraints */
  topViolatedConstraints: ConstraintStats[];
  /** Top architectures by override count */
  topOverriddenArchs?: ArchOverrideStats[];
  /** Files with multiple overrides (sorted by count descending) */
  filesWithMultipleOverrides?: FileOverrideStats[];
  /** Discovery index status */
  indexStatus?: IndexStatus;
  /** Intent health metrics */
  intentHealth?: IntentHealth;
  /** Layer coverage health */
  layerHealth?: LayerCoverageHealth;
  /** Actionable recommendations */
  recommendations: HealthRecommendation[];
  /** Report generation timestamp */
  generatedAt: string;
}

/**
 * Health check options.
 */
export interface HealthOptions {
  /** Include patterns */
  include?: string[];
  /** Exclude patterns */
  exclude?: string[];
  /** Days threshold for "expiring soon" */
  expiringDays?: number;
  /** Max untagged files to sample */
  untaggedSampleSize?: number;
  /** Include file counts per architecture */
  includeArchUsage?: boolean;
  /** Threshold for low usage warning (default: 2 = flag archs with <=2 files) */
  lowUsageThreshold?: number;
  /** Enable progressive caching (default: true) */
  useCache?: boolean;
  /** Skip layer coverage analysis (faster) */
  skipLayers?: boolean;
}
