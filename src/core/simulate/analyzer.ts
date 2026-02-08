/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Simulation analyzer - compares validation results between current and proposed registries.
 */
import type { Registry } from '../registry/schema.js';
import type { Config } from '../config/schema.js';
import { ValidationEngine } from '../validation/engine.js';
import { compareRegistries } from '../diff/comparator.js';
import { globFiles } from '../../utils/file-system.js';
import type {
  SimulationResult,
  SimulationOptions,
  SimulationSummary,
  FileImpact,
  RiskLevel,
  FormattedChanges,
  FormattedArchChange,
} from './types.js';
import type { Violation } from '../constraints/types.js';

/**
 * Analyzer for simulating the impact of registry changes.
 */
export class SimulationAnalyzer {
  private projectRoot: string;
  private config: Config;

  constructor(projectRoot: string, config: Config) {
    this.projectRoot = projectRoot;
    this.config = config;
  }

  /**
   * Simulate the impact of applying a proposed registry.
   */
  async simulate(
    currentRegistry: Registry,
    proposedRegistry: Registry,
    options: SimulationOptions = {}
  ): Promise<SimulationResult> {
    // Step 1: Generate registry diff
    const diff = await compareRegistries(
      currentRegistry,
      proposedRegistry,
      'current',
      'proposed',
      this.projectRoot,
      {
        includeAffectedFiles: true,
        filePatterns: options.filePatterns,
      }
    );

    // Step 2: Find all files with @arch tags
    const patterns = options.filePatterns || ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.py', 'src/**/*.go'];
    const files = await globFiles(patterns, {
      cwd: this.projectRoot,
      absolute: false,
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
    });

    // Apply max files limit if specified
    const filesToAnalyze = options.maxFiles
      ? files.slice(0, options.maxFiles)
      : files;

    // Step 3: Run validation with current registry
    const currentEngine = new ValidationEngine(
      this.projectRoot,
      this.config,
      currentRegistry
    );
    const currentResults = await currentEngine.validateFiles(filesToAnalyze);
    currentEngine.dispose();

    // Step 4: Run validation with proposed registry
    const proposedEngine = new ValidationEngine(
      this.projectRoot,
      this.config,
      proposedRegistry
    );
    const proposedResults = await proposedEngine.validateFiles(filesToAnalyze);
    proposedEngine.dispose();

    // Step 5: Compare results and categorize files
    const fileImpacts: FileImpact[] = [];
    const wouldBreak: FileImpact[] = [];
    const wouldFix: FileImpact[] = [];

    for (let i = 0; i < filesToAnalyze.length; i++) {
      const file = filesToAnalyze[i];
      const currentResult = currentResults.results[i];
      const proposedResult = proposedResults.results[i];

      // Skip files with no @arch tag in either registry
      if (!currentResult.archId && !proposedResult.archId) {
        continue;
      }

      // Filter by archId if specified
      if (options.filterArchIds && options.filterArchIds.length > 0) {
        const archId = currentResult.archId || proposedResult.archId;
        if (archId && !options.filterArchIds.includes(archId)) {
          continue;
        }
      }

      const impact = this.categorizeImpact(currentResult, proposedResult, file);
      fileImpacts.push(impact);

      if (impact.impact === 'would_break') {
        wouldBreak.push(impact);
      } else if (impact.impact === 'would_fix') {
        wouldFix.push(impact);
      }
    }

    // Step 6: Build summary
    const summary = this.buildSummary(
      fileImpacts,
      currentResults.summary,
      diff
    );

    // Step 7: Generate recommendations
    const recommendations = this.generateRecommendations(
      summary,
      wouldBreak,
      wouldFix
    );

    return {
      fromRef: 'current',
      toRef: 'proposed',
      diff,
      fileImpacts,
      wouldBreak,
      wouldFix,
      summary,
      recommendations,
    };
  }

  /**
   * Categorize the impact of changes on a single file.
   */
  private categorizeImpact(
    current: { status: string; violations: Violation[]; warnings: Violation[]; archId: string | null },
    proposed: { status: string; violations: Violation[]; warnings: Violation[]; archId: string | null },
    file: string
  ): FileImpact {
    const currentStatus = this.normalizeStatus(current.status, current.archId);
    const projectedStatus = this.normalizeStatus(proposed.status, proposed.archId);

    // Find new violations (in proposed but not in current)
    const newViolations = this.findNewViolations(
      current.violations,
      proposed.violations
    );

    // Find resolved violations (in current but not in proposed)
    const resolvedViolations = this.findNewViolations(
      proposed.violations,
      current.violations
    );

    // Determine impact type
    let impact: FileImpact['impact'];
    let reason: string | undefined;

    if (currentStatus === 'pass' && projectedStatus === 'fail') {
      impact = 'would_break';
      reason = this.formatViolationReason(newViolations);
    } else if (currentStatus === 'fail' && projectedStatus === 'pass') {
      impact = 'would_fix';
      reason = this.formatResolutionReason(resolvedViolations);
    } else if (currentStatus === 'untagged' && projectedStatus !== 'untagged') {
      impact = 'new_coverage';
      reason = `Would gain architecture coverage: ${proposed.archId}`;
    } else {
      impact = 'unchanged';
    }

    return {
      file,
      archId: current.archId || proposed.archId,
      impact,
      currentStatus,
      projectedStatus,
      newViolations,
      resolvedViolations,
      reason,
    };
  }

  /**
   * Normalize status to our standard types.
   */
  private normalizeStatus(
    status: string,
    archId: string | null
  ): 'pass' | 'fail' | 'warn' | 'untagged' {
    if (!archId) return 'untagged';
    if (status === 'pass') return 'pass';
    if (status === 'fail') return 'fail';
    if (status === 'warn') return 'warn';
    return 'pass';
  }

  /**
   * Find violations that exist in `target` but not in `source`.
   */
  private findNewViolations(
    source: Violation[],
    target: Violation[]
  ): Violation[] {
    const sourceKeys = new Set(
      source.map((v) => this.violationKey(v))
    );
    return target.filter((v) => !sourceKeys.has(this.violationKey(v)));
  }

  /**
   * Generate a unique key for a violation for comparison.
   */
  private violationKey(v: Violation): string {
    return `${v.rule}:${JSON.stringify(v.value)}:${v.line || 'null'}`;
  }

  /**
   * Format violation reason for display.
   */
  private formatViolationReason(violations: Violation[]): string {
    if (violations.length === 0) return 'Unknown reason';
    if (violations.length === 1) return violations[0].message;
    return `${violations.length} new violations: ${violations[0].message}`;
  }

  /**
   * Format resolution reason for display.
   */
  private formatResolutionReason(resolved: Violation[]): string {
    if (resolved.length === 0) return 'Violations resolved';
    if (resolved.length === 1) return `Fixed: ${resolved[0].message}`;
    return `${resolved.length} violations resolved`;
  }

  /**
   * Build summary statistics.
   */
  private buildSummary(
    impacts: FileImpact[],
    currentSummary: { total: number; passed: number; failed: number },
    diff: { summary: { architecturesAdded: number; architecturesRemoved: number; architecturesModified: number } }
  ): SimulationSummary {
    const wouldBreak = impacts.filter((i) => i.impact === 'would_break').length;
    const wouldFix = impacts.filter((i) => i.impact === 'would_fix').length;
    const unchanged = impacts.filter((i) => i.impact === 'unchanged').length;
    const newCoverage = impacts.filter((i) => i.impact === 'new_coverage').length;

    return {
      filesScanned: currentSummary.total,
      currentlyPassing: currentSummary.passed,
      currentlyFailing: currentSummary.failed,
      wouldBreak,
      wouldFix,
      unchanged,
      newCoverage,
      riskLevel: this.calculateRiskLevel(wouldBreak, currentSummary.total),
      architecturesAdded: diff.summary.architecturesAdded,
      architecturesRemoved: diff.summary.architecturesRemoved,
      architecturesModified: diff.summary.architecturesModified,
    };
  }

  /**
   * Calculate risk level based on breaking changes.
   */
  private calculateRiskLevel(wouldBreak: number, total: number): RiskLevel {
    if (total === 0) return 'low';

    const breakPercentage = (wouldBreak / total) * 100;

    if (wouldBreak === 0) return 'low';
    if (breakPercentage < 5) return 'low';
    if (breakPercentage < 15) return 'medium';
    if (breakPercentage < 30) return 'high';
    return 'critical';
  }

  /**
   * Generate recommendations based on analysis.
   */
  private generateRecommendations(
    summary: SimulationSummary,
    wouldBreak: FileImpact[],
    _wouldFix: FileImpact[]
  ): string[] {
    const recommendations: string[] = [];

    if (summary.wouldBreak > 0) {
      recommendations.push(
        `Review the ${summary.wouldBreak} breaking changes before applying`
      );
      recommendations.push(
        'Run: archcodex simulate <registry> --verbose'
      );
    }

    if (summary.riskLevel === 'critical') {
      recommendations.push(
        'Consider applying changes incrementally to reduce risk'
      );
    }

    if (summary.architecturesRemoved > 0) {
      const affectedByRemoval = wouldBreak.filter((f) =>
        f.reason?.includes('removed') || f.reason?.includes('not found')
      );
      if (affectedByRemoval.length > 0) {
        recommendations.push(
          `${affectedByRemoval.length} files use removed architectures - update @arch tags`
        );
      }
    }

    if (summary.wouldBreak === 0 && summary.wouldFix > 0) {
      recommendations.push(
        `Safe to apply: ${summary.wouldFix} files would be fixed, no breakage`
      );
    }

    if (summary.wouldBreak === 0 && summary.wouldFix === 0) {
      recommendations.push('No impact on current files');
    }

    recommendations.push(
      'After review: cp <proposed-registry> .arch/registry/'
    );

    return recommendations;
  }
}

/**
 * Format registry changes for human-readable output.
 */
export function formatRegistryChanges(
  diff: SimulationResult['diff']
): FormattedChanges {
  const added: FormattedArchChange[] = [];
  const removed: FormattedArchChange[] = [];
  const modified: FormattedArchChange[] = [];

  for (const change of diff.architectureChanges) {
    const formatted: FormattedArchChange = {
      archId: change.archId,
      type: change.type,
      description: formatArchChangeDescription(change),
    };

    if (change.constraintChanges && change.constraintChanges.length > 0) {
      formatted.constraintChanges = change.constraintChanges.map((c) => ({
        type: c.type,
        rule: c.rule,
        description: formatConstraintChangeDescription(c),
      }));
    }

    if (change.type === 'added') {
      added.push(formatted);
    } else if (change.type === 'removed') {
      removed.push(formatted);
    } else {
      modified.push(formatted);
    }
  }

  return { added, removed, modified };
}

/**
 * Format a single architecture change description.
 */
function formatArchChangeDescription(
  change: { type: string; constraintChanges?: Array<{ type: string; rule: string }>; mixinChanges?: { added: string[]; removed: string[] } }
): string {
  const parts: string[] = [];

  if (change.constraintChanges) {
    const added = change.constraintChanges.filter((c) => c.type === 'added');
    const removed = change.constraintChanges.filter((c) => c.type === 'removed');

    if (added.length > 0) {
      parts.push(`added constraint: ${added.map((c) => c.rule).join(', ')}`);
    }
    if (removed.length > 0) {
      parts.push(`removed constraint: ${removed.map((c) => c.rule).join(', ')}`);
    }
  }

  if (change.mixinChanges) {
    if (change.mixinChanges.added.length > 0) {
      parts.push(`added mixin: ${change.mixinChanges.added.join(', ')}`);
    }
    if (change.mixinChanges.removed.length > 0) {
      parts.push(`removed mixin: ${change.mixinChanges.removed.join(', ')}`);
    }
  }

  return parts.length > 0 ? parts.join('; ') : 'metadata changes';
}

/**
 * Format a constraint change description.
 */
function formatConstraintChangeDescription(
  change: { type: string; rule: string; oldValue?: unknown; newValue?: unknown; oldSeverity?: string; newSeverity?: string }
): string {
  if (change.type === 'added') {
    return `${change.rule}: ${JSON.stringify(change.newValue)}`;
  }
  if (change.type === 'removed') {
    return `${change.rule}: ${JSON.stringify(change.oldValue)}`;
  }
  // Modified
  if (change.oldSeverity !== change.newSeverity) {
    return `${change.rule}: severity ${change.oldSeverity} → ${change.newSeverity}`;
  }
  return `${change.rule}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`;
}
