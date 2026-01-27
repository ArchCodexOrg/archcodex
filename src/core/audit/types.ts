/**
 * @arch archcodex.core.types
 *
 * Audit type definitions.
 */
import type { OverrideTag } from '../arch-tag/types.js';

/**
 * Status of an override.
 */
export type OverrideStatus = 'active' | 'expiring' | 'expired' | 'invalid';

/**
 * Extended override information for audit.
 */
export interface AuditedOverride extends OverrideTag {
  /** File path */
  filePath: string;
  /** Architecture ID */
  archId: string | null;
  /** Override status */
  status: OverrideStatus;
  /** Days until expiry (negative if expired) */
  daysUntilExpiry: number | null;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Audit result for a single file.
 */
export interface FileAuditResult {
  filePath: string;
  archId: string | null;
  overrides: AuditedOverride[];
  overrideCount: number;
  hasExpired: boolean;
  hasExpiring: boolean;
}

/**
 * Complete audit report.
 */
export interface AuditReport {
  files: FileAuditResult[];
  summary: AuditSummary;
  generatedAt: string;
}

/**
 * Audit summary statistics.
 */
export interface AuditSummary {
  totalFiles: number;
  filesWithOverrides: number;
  totalOverrides: number;
  activeOverrides: number;
  expiringOverrides: number;
  expiredOverrides: number;
  invalidOverrides: number;
}

/**
 * Options for auditing.
 */
export interface AuditOptions {
  /** Days threshold for "expiring" status */
  expiringDays?: number;
  /** Only include expired overrides */
  expiredOnly?: boolean;
  /** Only include expiring overrides */
  expiringOnly?: boolean;
  /** Glob patterns for files to scan */
  include?: string[];
  /** Glob patterns for files to exclude */
  exclude?: string[];
}

/**
 * A cluster of overrides sharing the same rule:value pattern.
 * Used to suggest intent promotions.
 */
export interface OverrideCluster {
  /** Constraint key: "rule:value" */
  constraintKey: string;
  /** Number of files with this override */
  fileCount: number;
  /** File paths with this override */
  files: string[];
  /** Common reasons (deduplicated) */
  commonReasons: string[];
  /** Suggested intent name (derived from pattern) */
  suggestedIntent: string;
  /** Suggested promote command */
  promoteCommand: string;
}
