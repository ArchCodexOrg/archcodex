/**
 * @arch archcodex.core.domain
 *
 * FeedbackAnalyzer - analyzes violation patterns and generates recommendations.
 */
import type {
  ViolationEntry,
  ViolationStats,
  Recommendation,
  FeedbackReport,
} from './types.js';
import type { FeedbackStore } from './store.js';
import type { ConstraintRule } from '../registry/schema.js';

/**
 * Options for generating a feedback report.
 */
export interface AnalyzerOptions {
  /** Number of days to analyze (default: 30) */
  days?: number;
  /** Number of top violations to include (default: 10) */
  topN?: number;
  /** Minimum violation count to consider for recommendations */
  minViolationCount?: number;
}

/**
 * Analyzes violation patterns and generates recommendations.
 */
export class FeedbackAnalyzer {
  private store: FeedbackStore;

  constructor(store: FeedbackStore) {
    this.store = store;
  }

  /**
   * Generate a comprehensive feedback report.
   */
  async generateReport(options: AnalyzerOptions = {}): Promise<FeedbackReport> {
    const days = options.days ?? 30;
    const topN = options.topN ?? 10;

    const entries = await this.store.getEntries({ days });
    const stats = this.aggregateStats(entries);
    const topViolations = this.getTopViolations(stats, topN);
    const recommendations = this.generateRecommendations(stats, options);

    const now = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    return {
      generatedAt: now.toISOString(),
      period: {
        from: from.toISOString(),
        to: now.toISOString(),
        days,
      },
      summary: {
        totalViolations: entries.length,
        totalOverrides: entries.filter((e) => e.wasOverridden).length,
        uniqueRules: new Set(entries.map((e) => e.rule)).size,
        uniqueFiles: new Set(entries.map((e) => e.file)).size,
      },
      topViolations,
      recommendations,
    };
  }

  /**
   * Get violation statistics grouped by rule+value.
   */
  async getViolationStats(options: AnalyzerOptions = {}): Promise<ViolationStats[]> {
    const days = options.days ?? 30;
    const entries = await this.store.getEntries({ days });
    return this.aggregateStats(entries);
  }

  /**
   * Aggregate entries into statistics.
   */
  private aggregateStats(entries: ViolationEntry[]): ViolationStats[] {
    const statsMap = new Map<string, ViolationStats>();

    for (const entry of entries) {
      const key = `${entry.rule}:${entry.value}`;

      if (!statsMap.has(key)) {
        statsMap.set(key, {
          rule: entry.rule,
          value: entry.value,
          count: 0,
          overrideCount: 0,
          affectedFiles: [],
          affectedArchIds: [],
          firstSeen: entry.timestamp,
          lastSeen: entry.timestamp,
        });
      }

      const stat = statsMap.get(key)!;
      stat.count++;
      if (entry.wasOverridden) {
        stat.overrideCount++;
      }

      if (!stat.affectedFiles.includes(entry.file)) {
        stat.affectedFiles.push(entry.file);
      }

      if (entry.archId && !stat.affectedArchIds.includes(entry.archId)) {
        stat.affectedArchIds.push(entry.archId);
      }

      if (entry.timestamp < stat.firstSeen) {
        stat.firstSeen = entry.timestamp;
      }
      if (entry.timestamp > stat.lastSeen) {
        stat.lastSeen = entry.timestamp;
      }
    }

    return Array.from(statsMap.values());
  }

  /**
   * Get top N violated constraints by count.
   */
  private getTopViolations(stats: ViolationStats[], n: number): ViolationStats[] {
    return [...stats]
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }

  /**
   * Generate recommendations based on violation patterns.
   */
  private generateRecommendations(
    stats: ViolationStats[],
    options: AnalyzerOptions
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const minCount = options.minViolationCount ?? 3;

    for (const stat of stats) {
      // Skip if not enough violations
      if (stat.count < minCount) {
        continue;
      }

      // High override ratio suggests the constraint may be too strict
      const overrideRatio = stat.overrideCount / stat.count;
      if (overrideRatio >= 0.5 && stat.overrideCount >= 3) {
        recommendations.push(this.createRelaxConstraintRecommendation(stat));
      }

      // Many violations in same architecture suggests architectural change
      if (stat.affectedArchIds.length === 1 && stat.count >= 5) {
        recommendations.push(this.createArchitectureUpdateRecommendation(stat));
      }

      // Widespread violations suggest reviewing the pattern
      if (stat.affectedFiles.length >= 5 && stat.overrideCount < 2) {
        recommendations.push(this.createReviewPatternRecommendation(stat));
      }
    }

    // Sort by priority
    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Create recommendation to relax a constraint.
   */
  private createRelaxConstraintRecommendation(stat: ViolationStats): Recommendation {
    const displayValue = this.formatConstraintValue(stat.rule, stat.value);

    return {
      type: 'relax_constraint',
      priority: 80 + Math.min(stat.overrideCount * 2, 20),
      title: `Consider relaxing ${stat.rule}`,
      description: `The constraint ${stat.rule}${displayValue} has been overridden ${stat.overrideCount} times out of ${stat.count} violations. This high override ratio suggests the constraint may be too strict for your codebase.`,
      rule: stat.rule,
      value: stat.value,
      suggestedAction: this.getSuggestedRelaxAction(stat),
      evidence: {
        violationCount: stat.count,
        overrideCount: stat.overrideCount,
        affectedFileCount: stat.affectedFiles.length,
      },
    };
  }

  /**
   * Create recommendation to update architecture.
   */
  private createArchitectureUpdateRecommendation(stat: ViolationStats): Recommendation {
    const archId = stat.affectedArchIds[0];
    const displayValue = this.formatConstraintValue(stat.rule, stat.value);

    return {
      type: 'update_architecture',
      priority: 70 + Math.min(stat.count, 30),
      title: `Update ${archId} architecture`,
      description: `All ${stat.count} violations of ${stat.rule}${displayValue} occur in files with architecture '${archId}'. Consider updating this architecture's constraints or creating a more specific child architecture.`,
      rule: stat.rule,
      value: stat.value,
      suggestedAction: `Review the '${archId}' architecture and consider:\n  - Adding an allow_* rule to permit this pattern\n  - Creating a child architecture with relaxed constraints\n  - Using a mixin to selectively apply different rules`,
      evidence: {
        violationCount: stat.count,
        overrideCount: stat.overrideCount,
        affectedFileCount: stat.affectedFiles.length,
      },
    };
  }

  /**
   * Create recommendation to review pattern.
   */
  private createReviewPatternRecommendation(stat: ViolationStats): Recommendation {
    const displayValue = this.formatConstraintValue(stat.rule, stat.value);

    return {
      type: 'review_pattern',
      priority: 50 + Math.min(stat.affectedFiles.length * 2, 30),
      title: `Review widespread ${stat.rule} violations`,
      description: `${stat.count} violations of ${stat.rule}${displayValue} across ${stat.affectedFiles.length} files with few overrides. This may indicate a systemic issue that should be addressed at the code level.`,
      rule: stat.rule,
      value: stat.value,
      suggestedAction: `Review the affected files and consider:\n  - Refactoring to comply with the constraint\n  - Updating documentation to clarify the expected pattern\n  - Using archcodex why to understand constraint origin`,
      evidence: {
        violationCount: stat.count,
        overrideCount: stat.overrideCount,
        affectedFileCount: stat.affectedFiles.length,
      },
    };
  }

  /**
   * Format constraint value for display.
   */
  private formatConstraintValue(rule: ConstraintRule, value: string): string {
    if (!value || value === 'undefined') {
      return '';
    }
    // For some rules, show the value inline
    if (['forbid_import', 'require_import', 'forbid_call', 'forbid_mutation'].includes(rule)) {
      return `:${value}`;
    }
    return ` (${value})`;
  }

  /**
   * Get suggested action for relaxing a constraint.
   */
  private getSuggestedRelaxAction(stat: ViolationStats): string {
    switch (stat.rule) {
      case 'forbid_import':
        return `Add 'allow_import: [${stat.value}]' to the architecture or create an override group`;
      case 'max_file_lines':
        return `Consider increasing max_file_lines from ${stat.value} to a higher value`;
      case 'max_public_methods':
        return `Consider increasing max_public_methods from ${stat.value} to a higher value`;
      case 'forbid_call':
        return `Review if '${stat.value}' should be allowed and update forbid_call constraint`;
      default:
        return `Review the ${stat.rule} constraint and consider relaxing the value`;
    }
  }
}
