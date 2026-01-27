/**
 * @arch archcodex.core.engine
 * @intent:stateless
 */
import * as path from 'node:path';
import { globFiles, readFile } from '../../utils/file-system.js';
import { parseArchTags, validateOverride } from '../arch-tag/parser.js';
import type { Config } from '../config/schema.js';
import type {
  AuditedOverride,
  FileAuditResult,
  AuditReport,
  AuditSummary,
  AuditOptions,
  OverrideStatus,
} from './types.js';
import type { FileMetadata } from '../health/scanner.js';

/**
 * Audit scanner for finding and analyzing overrides.
 */
export class AuditScanner {
  private projectRoot: string;
  private config: Config;

  constructor(projectRoot: string, config: Config) {
    this.projectRoot = projectRoot;
    this.config = config;
  }

  /**
   * Scan files and generate an audit report.
   * Accepts optional pre-scanned files to avoid redundant file reads.
   */
  async scan(
    options: AuditOptions = {},
    preScannedFiles?: Map<string, FileMetadata>
  ): Promise<AuditReport> {
    const {
      expiringDays = 30,
      expiredOnly = false,
      expiringOnly = false,
      include = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude = ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
    } = options;

    // Use pre-scanned files if provided, otherwise glob
    const files = preScannedFiles
      ? Array.from(preScannedFiles.keys())
      : await globFiles(include, {
          cwd: this.projectRoot,
          ignore: exclude,
          absolute: false,
        });

    // Scan each file
    const fileResults: FileAuditResult[] = [];
    for (const filePath of files) {
      // Use pre-scanned data if available, otherwise scan file
      const result = preScannedFiles
        ? await this.scanFileFromMetadata(
            filePath,
            preScannedFiles.get(filePath)!,
            expiringDays
          )
        : await this.scanFile(filePath, expiringDays);

      if (result.overrideCount > 0) {
        // Apply filters
        if (expiredOnly) {
          result.overrides = result.overrides.filter((o) => o.status === 'expired');
        } else if (expiringOnly) {
          result.overrides = result.overrides.filter((o) => o.status === 'expiring');
        }

        if (result.overrides.length > 0) {
          result.overrideCount = result.overrides.length;
          fileResults.push(result);
        }
      }
    }

    // Build summary
    const summary = this.buildSummary(fileResults);

    return {
      files: fileResults,
      summary,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Scan a single file using pre-scanned metadata (no file reads).
   */
  private async scanFileFromMetadata(
    filePath: string,
    metadata: FileMetadata,
    expiringDays: number
  ): Promise<FileAuditResult> {
    const auditedOverrides: AuditedOverride[] = [];

    for (const override of metadata.overrides) {
      const validation = validateOverride(override, {
        requiredFields: this.config.overrides.required_fields,
        warnNoExpiry: this.config.overrides.warn_no_expiry,
        maxExpiryDays: this.config.overrides.max_expiry_days,
        failOnExpired: true,
      });

      const daysUntilExpiry = override.expires
        ? this.calculateDaysUntilExpiry(override.expires)
        : null;

      const status = this.determineStatus(
        validation.valid,
        daysUntilExpiry,
        expiringDays
      );

      auditedOverrides.push({
        ...override,
        filePath,
        archId: metadata.archId || null,
        status,
        daysUntilExpiry,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    return {
      filePath,
      archId: metadata.archId || null,
      overrides: auditedOverrides,
      overrideCount: auditedOverrides.length,
      hasExpired: auditedOverrides.some((o) => o.status === 'expired'),
      hasExpiring: auditedOverrides.some((o) => o.status === 'expiring'),
    };
  }

  /**
   * Scan a single file for overrides.
   */
  private async scanFile(
    filePath: string,
    expiringDays: number
  ): Promise<FileAuditResult> {
    const absolutePath = path.resolve(this.projectRoot, filePath);
    const content = await readFile(absolutePath);
    const { archTag, overrides } = parseArchTags(content);

    const auditedOverrides: AuditedOverride[] = [];

    for (const override of overrides) {
      const validation = validateOverride(override, {
        requiredFields: this.config.overrides.required_fields,
        warnNoExpiry: this.config.overrides.warn_no_expiry,
        maxExpiryDays: this.config.overrides.max_expiry_days,
        failOnExpired: true,
      });

      const daysUntilExpiry = override.expires
        ? this.calculateDaysUntilExpiry(override.expires)
        : null;

      const status = this.determineStatus(
        validation.valid,
        daysUntilExpiry,
        expiringDays
      );

      auditedOverrides.push({
        ...override,
        filePath,
        archId: archTag?.archId || null,
        status,
        daysUntilExpiry,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    return {
      filePath,
      archId: archTag?.archId || null,
      overrides: auditedOverrides,
      overrideCount: auditedOverrides.length,
      hasExpired: auditedOverrides.some((o) => o.status === 'expired'),
      hasExpiring: auditedOverrides.some((o) => o.status === 'expiring'),
    };
  }

  /**
   * Calculate days until expiry.
   */
  private calculateDaysUntilExpiry(expiryDate: string): number {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Determine override status.
   */
  private determineStatus(
    valid: boolean,
    daysUntilExpiry: number | null,
    expiringDays: number
  ): OverrideStatus {
    if (!valid) {
      return 'invalid';
    }

    if (daysUntilExpiry !== null) {
      if (daysUntilExpiry < 0) {
        return 'expired';
      }
      if (daysUntilExpiry <= expiringDays) {
        return 'expiring';
      }
    }

    return 'active';
  }

  /**
   * Build summary statistics.
   */
  private buildSummary(files: FileAuditResult[]): AuditSummary {
    let totalOverrides = 0;
    let activeOverrides = 0;
    let expiringOverrides = 0;
    let expiredOverrides = 0;
    let invalidOverrides = 0;

    for (const file of files) {
      for (const override of file.overrides) {
        totalOverrides++;
        switch (override.status) {
          case 'active':
            activeOverrides++;
            break;
          case 'expiring':
            expiringOverrides++;
            break;
          case 'expired':
            expiredOverrides++;
            break;
          case 'invalid':
            invalidOverrides++;
            break;
        }
      }
    }

    return {
      totalFiles: files.length,
      filesWithOverrides: files.filter((f) => f.overrideCount > 0).length,
      totalOverrides,
      activeOverrides,
      expiringOverrides,
      expiredOverrides,
      invalidOverrides,
    };
  }
}
