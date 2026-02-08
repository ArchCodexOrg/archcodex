/**
 * @arch archcodex.core.engine
 * @intent:stateless
 */
import { createHash } from 'node:crypto';
import { loadArchIgnore } from '../../utils/archignore.js';
import { loadRegistry } from '../registry/loader.js';
import { AuditScanner } from '../audit/scanner.js';
import { UnifiedHealthScanner } from './scanner.js';
import { RegistryAnalyzer } from './registry-analyzer.js';
import { IntentAnalyzer } from './intent-analyzer.js';
import type { ScanResult } from './scanner.js';
import type { BloatDetectorOptions } from './bloat-detector.js';
import type { Config } from '../config/schema.js';
import {
  findTopViolatedConstraints,
  findTopOverriddenArchitectures,
  findFilesWithMultipleOverrides,
} from './audit-stats.js';
import { analyzeLayerHealth } from './layer-health.js';
import { DuplicateDetector } from '../types/duplicate-detector.js';
import type { DuplicateGroup } from '../types/types.js';
import type {
  HealthReport,
  HealthOptions,
  OverrideDebt,
  CoverageMetrics,
  RegistryHealth,
  ConstraintStats,
  HealthRecommendation,
  ArchUsage,
  ArchOverrideStats,
  FileOverrideStats,
  IntentHealth,
  LayerCoverageHealth,
  TypeDuplicateReport,
} from './types.js';

/**
 * Default health check options (for values not in config.files.scan).
 * Note: .archignore is also applied after globbing for consistency with other commands.
 */
const DEFAULT_OPTIONS: Omit<Required<HealthOptions>, 'include' | 'exclude'> = {
  expiringDays: 30,
  untaggedSampleSize: 10,
  includeArchUsage: false,
  lowUsageThreshold: 2,
  useCache: true,
  skipLayers: false,
  detectTypeDuplicates: false,
};

/**
 * Health analyzer for architectural health metrics.
 */
export class HealthAnalyzer {
  private projectRoot: string;
  private config: Config;

  constructor(projectRoot: string, config: Config) {
    this.projectRoot = projectRoot;
    this.config = config;
  }

  /**
   * Calculate a numeric health score (0-100) from a health report.
   * Factors considered:
   * - Coverage (weight: 25%): Higher coverage = higher score
   * - Override debt (weight: 25%): Expired/no-expiry overrides reduce score
   * - Registry health (weight: 20%): Unused/redundant/similar architectures reduce score
   * - Intent health (weight: 15%): Undefined/unused intents reduce score
   * - Layer coverage (weight: 15%): Orphan files/phantom paths reduce score
   *
   * @param report The health report to score
   * @returns A numeric score from 0-100
   */
  getHealthScore(report: HealthReport): number {
    let score = 100;

    // === Coverage Score (25% weight) ===
    // 100% coverage = +0, less coverage scales down
    const coverageScore = report.coverage.coveragePercent;
    const coverageFactor = (100 - coverageScore) * 0.25; // Up to 25 points lost
    score -= coverageFactor;

    // === Override Debt Score (25% weight) ===
    // Each expired override = -5 points, each no-expiry = -2 points
    const expiredPenalty = (report.overrideDebt.expired * 5);
    const noExpiryPenalty = (report.overrideDebt.noExpiry * 2);
    const expiringPenalty = (report.overrideDebt.expiringSoon * 1);
    const totalDebtPenalty = Math.min(expiredPenalty + noExpiryPenalty + expiringPenalty, 25); // Cap at 25 points
    score -= totalDebtPenalty;

    // === Registry Health Score (20% weight) ===
    // Unused architectures = -1 point each (up to 10 points)
    // Similar architectures = -2 points each (up to 5 points)
    // Redundant architectures = -1 point each (up to 5 points)
    let registryPenalty = 0;
    registryPenalty += Math.min(report.registryHealth.unusedArchitectures, 10);
    registryPenalty += Math.min(
      (report.registryHealth.similarArchitectures?.length ?? 0) * 2,
      5
    );
    registryPenalty += Math.min(
      (report.registryHealth.redundantArchitectures?.length ?? 0),
      5
    );
    registryPenalty += Math.min(
      (report.registryHealth.lowUsageArchitectures?.length ?? 0) * 0.5,
      3
    );
    registryPenalty += Math.min(
      (report.registryHealth.singletonViolations?.length ?? 0) * 2,
      5
    );
    const cappedRegistryPenalty = Math.min(registryPenalty, 20);
    score -= cappedRegistryPenalty;

    // === Intent Health Score (15% weight) ===
    // Each undefined intent = -3 points, each unused = -1 point
    if (report.intentHealth) {
      const undefinedPenalty = Math.min(
        report.intentHealth.undefinedIntents.length * 3,
        10
      );
      const unusedPenalty = Math.min(
        report.intentHealth.unusedIntents.length * 1,
        5
      );
      const validationPenalty = Math.min(
        report.intentHealth.validationIssues * 2,
        5
      );
      const intentPenalty = Math.min(
        undefinedPenalty + unusedPenalty + validationPenalty,
        15
      );
      score -= intentPenalty;

      // Registry error = -15 points
      if (report.intentHealth.registryError) {
        score -= 15;
      }
    }

    // === Layer Coverage Score (15% weight) ===
    if (report.layerHealth) {
      let layerPenalty = 0;
      layerPenalty += Math.min(
        report.layerHealth.orphanFiles.length * 1,
        10
      );
      layerPenalty += Math.min(
        report.layerHealth.phantomPaths.length * 1,
        3
      );
      layerPenalty += Math.min(
        report.layerHealth.staleExclusions.length * 0.5,
        2
      );
      const cappedLayerPenalty = Math.min(layerPenalty, 15);
      score -= cappedLayerPenalty;
    }

    // === Type Duplicates (bonus/penalty) ===
    if (report.typeDuplicates && report.typeDuplicates.length > 0) {
      const exactDuplicates = report.typeDuplicates.filter(
        (d) => d.matchType === 'exact'
      ).length;
      const renamedDuplicates = report.typeDuplicates.filter(
        (d) => d.matchType === 'renamed'
      ).length;
      const typePenalty = Math.min(exactDuplicates * 3 + renamedDuplicates * 1, 10);
      score -= typePenalty;
    }

    // Ensure score stays within bounds
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Generate a complete health report.
   */
  async analyze(options: HealthOptions = {}): Promise<HealthReport> {
    // Use config.files.scan for defaults, allow options to override
    const scanPatterns = this.config.files.scan;
    const opts = {
      include: options.include ?? scanPatterns.include,
      exclude: options.exclude ?? scanPatterns.exclude,
      expiringDays: options.expiringDays ?? DEFAULT_OPTIONS.expiringDays,
      untaggedSampleSize: options.untaggedSampleSize ?? DEFAULT_OPTIONS.untaggedSampleSize,
      includeArchUsage: options.includeArchUsage ?? false,
      lowUsageThreshold: options.lowUsageThreshold ?? DEFAULT_OPTIONS.lowUsageThreshold,
    };

    // === Phase 1 Optimization: Unified Scanner ===
    // Perform single glob + parallel file reads instead of multiple sequential operations
    const scanner = new UnifiedHealthScanner(this.projectRoot);

    // Compute registry checksum for cache invalidation
    const registry = await loadRegistry(this.projectRoot);
    const registryChecksum = createHash('sha256')
      .update(JSON.stringify(registry))
      .digest('hex')
      .slice(0, 16);

    const scanResult = await scanner.scan({
      include: opts.include,
      exclude: opts.exclude,
      useCache: options.useCache ?? true, // Use cache by default
      registryChecksum,
    });

    // Run audit scan for override data (now uses pre-scanned data)
    const auditScanner = new AuditScanner(this.projectRoot, this.config);
    const auditReport = await auditScanner.scan(
      {
        expiringDays: opts.expiringDays,
        include: opts.include,
        exclude: opts.exclude,
      },
      scanResult.files // Pass pre-scanned file metadata to avoid re-reading files
    );

    // Calculate override debt
    const overrideDebt = this.calculateOverrideDebt(auditReport);

    // Calculate coverage (now uses cached metadata from scanner)
    const coverageResult = await this.calculateCoverage(opts, scanResult);
    const { _internalArchUsage, _internalFilesByArch, ...coverage } = coverageResult as CoverageMetrics & { _internalArchUsage: ArchUsage[]; _internalFilesByArch: Map<string, string[]> };

    // Calculate registry health (unused architectures and bloat detection)
    const bloatOptions: BloatDetectorOptions = {
      similarityThreshold: this.config.health?.similarity_threshold,
      maxInheritanceDepth: this.config.health?.max_inheritance_depth,
      lowUsageThreshold: options.lowUsageThreshold ?? this.config.health?.low_usage_threshold,
      excludeInheritedSimilarity: this.config.health?.exclude_inherited_similarity,
    };
    const registryAnalyzer = new RegistryAnalyzer(this.projectRoot);
    const registryHealth = await registryAnalyzer.analyze(
      coverage.usedArchIds,
      _internalArchUsage,
      _internalFilesByArch,
      bloatOptions,
      registry
    );

    // Calculate intent health (skip expensive AST parsing for function-level intents)
    const intentAnalyzer = new IntentAnalyzer(this.projectRoot);
    const intentHealth = await intentAnalyzer.analyze(scanResult, scanner, { skipFunctionLevel: true });

    // Calculate layer coverage health (now uses cached metadata)
    const layerHealth = options.skipLayers ? undefined : await analyzeLayerHealth(
      this.projectRoot,
      this.config.layers ?? [],
      { include: opts.include, exclude: opts.exclude },
      scanResult // Pass pre-scanned data to avoid re-globbing
    );

    // Find top violated constraints
    const topViolatedConstraints = findTopViolatedConstraints(auditReport);

    // Find top overridden architectures
    const topOverriddenArchs = findTopOverriddenArchitectures(auditReport);

    // Find files with multiple overrides
    const filesWithMultipleOverrides = findFilesWithMultipleOverrides(auditReport);

    // Run type duplicate detection if enabled
    let typeDuplicates: TypeDuplicateReport[] | undefined;
    if (options.detectTypeDuplicates) {
      const allFiles = Array.from(scanResult.files.keys());
      const tsFiles = allFiles.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
      if (tsFiles.length > 0) {
        const duplicateDetector = new DuplicateDetector(this.projectRoot, {
          skipImplementations: true,
        });
        const duplicateReport = await duplicateDetector.scanFiles(tsFiles);
        typeDuplicates = this.convertToTypeDuplicateReports(duplicateReport.groups);
        duplicateDetector.dispose();
      }
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      overrideDebt,
      coverage,
      registryHealth,
      topViolatedConstraints,
      topOverriddenArchs,
      filesWithMultipleOverrides,
      intentHealth,
      layerHealth,
      typeDuplicates
    );

    return {
      overrideDebt,
      coverage,
      registryHealth,
      topViolatedConstraints,
      topOverriddenArchs,
      filesWithMultipleOverrides,
      intentHealth,
      layerHealth,
      typeDuplicates,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate override debt from audit report.
   */
  private calculateOverrideDebt(auditReport: {
    files: Array<{
      overrides: Array<{
        status: string;
        expires?: string;
      }>;
    }>;
    summary: {
      totalOverrides: number;
      filesWithOverrides: number;
      expiredOverrides: number;
      expiringOverrides: number;
    };
  }): OverrideDebt {
    let noExpiry = 0;

    for (const file of auditReport.files) {
      for (const override of file.overrides) {
        if (!override.expires) {
          noExpiry++;
        }
      }
    }

    return {
      active: auditReport.summary.totalOverrides,
      filesWithOverrides: auditReport.summary.filesWithOverrides,
      expiringSoon: auditReport.summary.expiringOverrides,
      expired: auditReport.summary.expiredOverrides,
      noExpiry,
    };
  }

  /**
   * Calculate architecture coverage.
   * Uses pre-scanned data to avoid redundant file reads.
   * Coverage metrics respect config excludes and archignore (for untagged file reporting).
   * UsedArchIds includes ALL scanned files to avoid false positives in registry health.
   */
  private async calculateCoverage(
    opts: { include: string[]; exclude: string[]; untaggedSampleSize: number; includeArchUsage: boolean },
    scanResult: ScanResult
  ): Promise<CoverageMetrics> {
    // Apply archignore filter to scanned files
    const archIgnore = await loadArchIgnore(this.projectRoot);
    const allScannedFiles = Array.from(scanResult.files.keys());
    const filteredFiles = archIgnore.filter(allScannedFiles);

    let taggedFiles = 0;
    const untaggedFiles: string[] = [];
    const usedArchIdSet = new Set<string>();
    const archCountMap = new Map<string, number>();
    const filesByArch = new Map<string, string[]>();

    // Use cached metadata for filtered files (respecting archignore)
    for (const filePath of filteredFiles) {
      const metadata = scanResult.files.get(filePath);
      if (!metadata) continue; // File not in scanned set (shouldn't happen)

      if (metadata.archId) {
        taggedFiles++;
        usedArchIdSet.add(metadata.archId);
        archCountMap.set(metadata.archId, (archCountMap.get(metadata.archId) || 0) + 1);
        if (!filesByArch.has(metadata.archId)) filesByArch.set(metadata.archId, []);
        filesByArch.get(metadata.archId)!.push(filePath);
      } else {
        untaggedFiles.push(filePath);
      }
    }

    // For registry health: use ALL scanned files (even those in exclude patterns)
    // This prevents test/example architectures from being flagged as "unused"
    const processedFiles = new Set(filteredFiles);
    for (const [filePath, metadata] of scanResult.files.entries()) {
      if (processedFiles.has(filePath)) continue;
      if (metadata.archId) {
        usedArchIdSet.add(metadata.archId);
        archCountMap.set(metadata.archId, (archCountMap.get(metadata.archId) || 0) + 1);
        if (!filesByArch.has(metadata.archId)) filesByArch.set(metadata.archId, []);
        filesByArch.get(metadata.archId)!.push(filePath);
      }
    }

    const totalFiles = filteredFiles.length;
    const coveragePercent = totalFiles > 0
      ? Math.round((taggedFiles / totalFiles) * 100)
      : 100;

    // Build archUsage array sorted by count descending (always calculated for low usage detection)
    const fullArchUsage = Array.from(archCountMap.entries())
      .map(([archId, fileCount]) => ({ archId, fileCount }))
      .sort((a, b) => b.fileCount - a.fileCount);

    return {
      totalFiles,
      taggedFiles,
      untaggedFiles: untaggedFiles.length,
      coveragePercent,
      untaggedSample: untaggedFiles.slice(0, opts.untaggedSampleSize),
      usedArchIds: Array.from(usedArchIdSet).sort(),
      // Only include archUsage in output if requested, but always available internally
      archUsage: opts.includeArchUsage ? fullArchUsage : undefined,
      // Internal fields (always populated)
      _internalArchUsage: fullArchUsage,
      _internalFilesByArch: filesByArch,
    } as CoverageMetrics & { _internalArchUsage: ArchUsage[]; _internalFilesByArch: Map<string, string[]> };
  }



  /**
   * Convert DuplicateGroup[] to TypeDuplicateReport[] for health report.
   */
  private convertToTypeDuplicateReports(groups: DuplicateGroup[]): TypeDuplicateReport[] {
    return groups.map(group => {
      const locations = [
        { file: group.canonical.file, line: group.canonical.line, name: group.canonical.name },
        ...group.duplicates.map(d => ({
          file: d.type.file,
          line: d.type.line,
          name: d.type.name,
        })),
      ];

      let matchType: 'exact' | 'renamed' | 'similar' = 'exact';
      let minSimilarity = 1;
      for (const dup of group.duplicates) {
        if (dup.matchType === 'similar') {
          matchType = 'similar';
          minSimilarity = Math.min(minSimilarity, dup.similarity);
        } else if (dup.matchType === 'renamed' && matchType !== 'similar') {
          matchType = 'renamed';
        }
      }

      return {
        name: group.canonical.name,
        matchType,
        similarity: matchType === 'similar' ? minSimilarity : undefined,
        locations,
        suggestion: group.suggestion,
      };
    });
  }

  /**
   * Generate actionable recommendations.
   */
  private generateRecommendations(
    overrideDebt: OverrideDebt,
    coverage: CoverageMetrics,
    registryHealth: RegistryHealth,
    topViolated: ConstraintStats[],
    topOverriddenArchs: ArchOverrideStats[],
    filesWithMultipleOverrides: FileOverrideStats[],
    intentHealth: IntentHealth,
    layerHealth?: LayerCoverageHealth,
    typeDuplicates?: TypeDuplicateReport[]
  ): HealthRecommendation[] {
    const recommendations: HealthRecommendation[] = [];

    // Expired overrides
    if (overrideDebt.expired > 0) {
      recommendations.push({
        type: 'warning',
        title: 'Expired overrides',
        message: `${overrideDebt.expired} override(s) have expired and should be resolved or renewed.`,
        command: 'archcodex audit --expired',
      });
    }

    // Expiring soon
    if (overrideDebt.expiringSoon > 0) {
      recommendations.push({
        type: 'info',
        title: 'Overrides expiring soon',
        message: `${overrideDebt.expiringSoon} override(s) will expire within 30 days.`,
        command: 'archcodex audit --expiring 30',
      });
    }

    // Overrides without expiry
    if (overrideDebt.noExpiry > 0) {
      recommendations.push({
        type: 'info',
        title: 'Overrides without expiry',
        message: `${overrideDebt.noExpiry} override(s) have no expiration date. Consider adding @expires.`,
      });
    }

    // Unused architectures
    if (registryHealth.unusedArchitectures > 0) {
      const sample = registryHealth.unusedArchIds.slice(0, 3).join(', ');
      const more = registryHealth.unusedArchitectures > 3
        ? ` and ${registryHealth.unusedArchitectures - 3} more`
        : '';
      recommendations.push({
        type: 'info',
        title: 'Unused architectures',
        message: `${registryHealth.unusedArchitectures} architecture(s) have no files using them: ${sample}${more}. Consider deprecating or removing unused definitions.`,
        command: 'archcodex health --json | jq .registryHealth.unusedArchIds',
      });
    }

    // Low coverage
    if (coverage.coveragePercent < 80) {
      recommendations.push({
        type: 'action',
        title: 'Improve architecture coverage',
        message: `Only ${coverage.coveragePercent}% of files have @arch tags. Consider tagging more files.`,
        command: 'archcodex garden --check-consistency',
      });
    }

    // Untagged files
    if (coverage.untaggedFiles > 10) {
      recommendations.push({
        type: 'info',
        title: 'Many untagged files',
        message: `${coverage.untaggedFiles} files lack @arch tags. Use discover to find appropriate architectures.`,
        command: 'archcodex discover "your description"',
      });
    }

    // Top violated constraint
    if (topViolated.length > 0 && topViolated[0].overrideCount >= 3) {
      const top = topViolated[0];
      recommendations.push({
        type: 'action',
        title: 'Frequently overridden constraint',
        message: `'${top.constraint}' has ${top.overrideCount} overrides. Consider relaxing this constraint or adding an allow_import.`,
      });
    }

    // Architecture with many overrides
    if (topOverriddenArchs.length > 0 && topOverriddenArchs[0].overrideCount >= 3) {
      const top = topOverriddenArchs[0];
      recommendations.push({
        type: 'action',
        title: 'Architecture with many overrides',
        message: `'${top.archId}' has ${top.overrideCount} overrides across ${top.filesWithOverrides} files. Consider relaxing constraints or creating a sub-architecture.`,
        command: `archcodex resolve ${top.archId}`,
      });
    }

    // Files with multiple overrides (potential architecture mismatch)
    if (filesWithMultipleOverrides.length > 0 && filesWithMultipleOverrides[0].overrideCount >= 3) {
      const top = filesWithMultipleOverrides[0];
      recommendations.push({
        type: 'warning',
        title: 'File with many overrides',
        message: `'${top.filePath}' has ${top.overrideCount} overrides. This may indicate wrong architecture assignment.`,
        command: `archcodex discover "${top.filePath}"`,
      });
    }

    // Intent registry error
    if (intentHealth.registryError) {
      recommendations.push({
        type: 'warning',
        title: 'Intent registry error',
        message: `Failed to load intent registry: ${intentHealth.registryError}`,
        command: 'archcodex intents --list',
      });
    }

    // Undefined intents
    if (intentHealth.undefinedIntents.length > 0) {
      const sample = intentHealth.undefinedIntents.slice(0, 3).join(', ');
      const more = intentHealth.undefinedIntents.length > 3
        ? ` and ${intentHealth.undefinedIntents.length - 3} more`
        : '';
      recommendations.push({
        type: 'warning',
        title: 'Undefined intents',
        message: `${intentHealth.undefinedIntents.length} intent(s) are used but not defined: ${sample}${more}. Add them to .arch/registry/_intents.yaml.`,
        command: 'archcodex intents --validate',
      });
    }

    // Intent validation issues
    if (intentHealth.validationIssues > 0 && intentHealth.undefinedIntents.length === 0) {
      recommendations.push({
        type: 'warning',
        title: 'Intent validation issues',
        message: `${intentHealth.validationIssues} intent validation issue(s) found (conflicts, missing patterns).`,
        command: 'archcodex intents --validate',
      });
    }

    // Unused intents
    if (intentHealth.unusedIntents.length > 0) {
      const sample = intentHealth.unusedIntents.slice(0, 3).join(', ');
      const more = intentHealth.unusedIntents.length > 3
        ? ` and ${intentHealth.unusedIntents.length - 3} more`
        : '';
      recommendations.push({
        type: 'info',
        title: 'Unused intents',
        message: `${intentHealth.unusedIntents.length} defined intent(s) are not used: ${sample}${more}. Consider documenting or removing them.`,
        command: 'archcodex intents --list',
      });
    }

    // Similar architectures (bloat detection)
    if (registryHealth.similarArchitectures && registryHealth.similarArchitectures.length > 0) {
      const top = registryHealth.similarArchitectures[0];
      recommendations.push({
        type: 'warning',
        title: 'Similar architectures detected',
        message: `'${top.archId1}' and '${top.archId2}' are ${Math.round(top.similarity * 100)}% similar. ${top.reason}`,
        command: `archcodex resolve ${top.archId1} && archcodex resolve ${top.archId2}`,
      });
    }

    // Redundant architectures (bloat detection)
    if (registryHealth.redundantArchitectures && registryHealth.redundantArchitectures.length > 0) {
      const sample = registryHealth.redundantArchitectures.slice(0, 3).map(r => r.archId).join(', ');
      const more = registryHealth.redundantArchitectures.length > 3
        ? ` and ${registryHealth.redundantArchitectures.length - 3} more`
        : '';
      recommendations.push({
        type: 'info',
        title: 'Redundant architectures',
        message: `${registryHealth.redundantArchitectures.length} architecture(s) add no unique value: ${sample}${more}. Consider using parent directly or adding constraints.`,
      });
    }

    // Deep inheritance chains (bloat detection)
    if (registryHealth.deepInheritance && registryHealth.deepInheritance.length > 0) {
      const top = registryHealth.deepInheritance[0];
      recommendations.push({
        type: 'info',
        title: 'Deep inheritance chain',
        message: `'${top.archId}' has ${top.depth} levels of inheritance (${top.chain.join(' → ')}). Consider flattening or using mixins.`,
      });
    }

    // Low usage architectures (bloat detection)
    if (registryHealth.lowUsageArchitectures && registryHealth.lowUsageArchitectures.length > 0) {
      // Separate by severity
      const warnings = registryHealth.lowUsageArchitectures.filter(a => a.severity === 'warning');
      const infos = registryHealth.lowUsageArchitectures.filter(a => a.severity === 'info');

      if (warnings.length > 0) {
        const sample = warnings.slice(0, 3).map(a => a.archId).join(', ');
        const more = warnings.length > 3 ? ` and ${warnings.length - 3} more` : '';
        recommendations.push({
          type: 'warning',
          title: 'Single-file architectures',
          message: `${warnings.length} architecture(s) are used by only 1 file: ${sample}${more}. These may be over-specific.`,
        });
      }

      if (infos.length > 0) {
        const sample = infos.slice(0, 3).map(a => a.archId).join(', ');
        const more = infos.length > 3 ? ` and ${infos.length - 3} more` : '';
        recommendations.push({
          type: 'info',
          title: 'Low-usage architectures',
          message: `${infos.length} architecture(s) are used by only 2 files: ${sample}${more}. Consider if parent architecture with mixins would suffice.`,
        });
      }
    }

    // Singleton violations (architectures marked singleton but used by multiple files)
    if (registryHealth.singletonViolations && registryHealth.singletonViolations.length > 0) {
      const sample = registryHealth.singletonViolations.slice(0, 3).map(v => `${v.archId} (${v.fileCount} files)`).join(', ');
      const more = registryHealth.singletonViolations.length > 3
        ? ` and ${registryHealth.singletonViolations.length - 3} more`
        : '';
      recommendations.push({
        type: 'warning',
        title: 'Singleton violations',
        message: `${registryHealth.singletonViolations.length} singleton architecture(s) are used by multiple files: ${sample}${more}. Either remove singleton flag or consolidate to one file.`,
      });
    }

    // Layer coverage issues
    if (layerHealth) {
      if (layerHealth.orphanFiles.length > 0) {
        recommendations.push({
          type: 'warning',
          title: 'Orphan files (no layer coverage)',
          message: `${layerHealth.orphanFiles.length} file(s) not in any layer — no import boundary enforcement.`,
        });
      }

      if (layerHealth.phantomPaths.length > 0) {
        recommendations.push({
          type: 'info',
          title: 'Phantom layer paths',
          message: `${layerHealth.phantomPaths.length} layer path(s) match no files — consider removing.`,
        });
      }

      if (layerHealth.staleExclusions.length > 0) {
        recommendations.push({
          type: 'info',
          title: 'Stale exclusions',
          message: `${layerHealth.staleExclusions.length} exclusion pattern(s) are stale — matched files already have @arch tags.`,
        });
      }
    }

    // Type duplicates
    if (typeDuplicates && typeDuplicates.length > 0) {
      const exact = typeDuplicates.filter(d => d.matchType === 'exact').length;
      const renamed = typeDuplicates.filter(d => d.matchType === 'renamed').length;
      const similar = typeDuplicates.filter(d => d.matchType === 'similar').length;
      const parts: string[] = [];
      if (exact > 0) parts.push(`${exact} exact`);
      if (renamed > 0) parts.push(`${renamed} renamed`);
      if (similar > 0) parts.push(`${similar} similar`);
      recommendations.push({
        type: exact > 0 ? 'warning' : 'info',
        title: 'Type duplicates detected',
        message: `${typeDuplicates.length} duplicate type(s) found (${parts.join(', ')}). Consider consolidating to reduce maintenance burden.`,
        command: 'archcodex health --detect-type-duplicates --json | jq .typeDuplicates',
      });
    }

    // All clear
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'info',
        title: 'Architecture is healthy',
        message: 'No immediate actions needed. Keep up the good work!',
      });
    }

    return recommendations;
  }
}
