/**
 * @arch archcodex.cli.formatter
 * @intent:cli-output
 *
 * Formatters for the garden command output.
 */
import chalk from 'chalk';
import type {
  GardenReport,
  PatternReport,
  InconsistencyReport,
  KeywordSuggestion,
  KeywordCleanupSuggestion,
  TypeDuplicateReport,
} from '../../core/garden/types.js';

const CLEANUP_REASON_LABELS: Record<string, string> = {
  stopword: 'stopword',
  too_common: 'too common',
  too_short: 'too short',
  duplicate: 'duplicate',
  non_descriptive: 'non-descriptive',
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: 'exact',
  renamed: 'renamed',
  similar: 'similar',
};

export function printGardenReport(report: GardenReport, appliedKeywords = false, appliedCleanup = false): void {
  console.log();
  console.log(chalk.bold.green('🌱 GARDEN REPORT'));
  console.log();

  if (report.patterns.length > 0) {
    console.log(chalk.bold(`PATTERNS DETECTED (${report.patterns.length})`));
    for (const pattern of report.patterns) {
      printPattern(pattern);
    }
    console.log();
  }

  if (report.inconsistencies.length > 0) {
    console.log(chalk.bold.yellow(`INCONSISTENCIES (${report.inconsistencies.length})`));
    for (const inconsistency of report.inconsistencies) {
      printInconsistency(inconsistency);
    }
    console.log();
  }

  if (report.keywordSuggestions.length > 0) {
    console.log(chalk.bold(`KEYWORD SUGGESTIONS (${report.keywordSuggestions.length})`));
    for (const suggestion of report.keywordSuggestions) {
      printKeywordSuggestion(suggestion);
    }
    console.log();
  }

  if (report.keywordCleanups.length > 0) {
    const totalCleanups = report.keywordCleanups.reduce((sum, c) => sum + c.keywordsToRemove.length, 0);
    console.log(chalk.bold.red(`KEYWORD CLEANUPS (${totalCleanups} keywords in ${report.keywordCleanups.length} architectures)`));
    for (const cleanup of report.keywordCleanups) {
      printKeywordCleanup(cleanup);
    }
    console.log();
  }

  if (report.typeDuplicates.length > 0) {
    console.log(chalk.bold.magenta(`TYPE DUPLICATES (${report.typeDuplicates.length})`));
    for (const dup of report.typeDuplicates) {
      printTypeDuplicate(dup);
    }
    console.log();
  }

  printSummary(report, appliedKeywords, appliedCleanup);
}

function printPattern(pattern: PatternReport): void {
  const status = pattern.inIndex ? chalk.green('✓') : chalk.yellow('⚠');
  console.log(`${status} ${chalk.cyan(pattern.pattern)} (${pattern.files.length} files)`);
  if (pattern.archId) {
    console.log(chalk.dim(`  → ${pattern.archId}`));
  }
  if (!pattern.inIndex && pattern.suggestedKeywords.length > 0) {
    console.log(chalk.dim(`  Suggested keywords: ${pattern.suggestedKeywords.join(', ')}`));
  }
}

function printInconsistency(inconsistency: InconsistencyReport): void {
  console.log(chalk.yellow(`⚠ ${inconsistency.location}`));
  const byArch = new Map<string, string[]>();
  for (const file of inconsistency.files) {
    const arch = file.archId || '(none)';
    const group = byArch.get(arch) || [];
    group.push(file.path);
    byArch.set(arch, group);
  }
  for (const [arch, files] of byArch) {
    const isDominant = arch === inconsistency.dominantArch;
    const marker = isDominant ? '' : chalk.red(' ← outlier');
    console.log(`  ${chalk.dim(arch)} (${files.length} files)${marker}`);
    for (const file of files.slice(0, 3)) {
      console.log(chalk.dim(`    ${file}`));
    }
    if (files.length > 3) {
      console.log(chalk.dim(`    ... and ${files.length - 3} more`));
    }
  }
  if (inconsistency.dominantArch) {
    console.log(chalk.dim(`  Suggestion: outliers should probably use ${inconsistency.dominantArch}`));
  }
}

function printKeywordSuggestion(suggestion: KeywordSuggestion): void {
  console.log(chalk.cyan(suggestion.archId));
  if (suggestion.currentKeywords.length > 0) {
    console.log(chalk.dim(`  Current: ${suggestion.currentKeywords.slice(0, 10).join(', ')}${suggestion.currentKeywords.length > 10 ? '...' : ''}`));
  }
  console.log(`  ${chalk.green('+')} ${suggestion.suggestedKeywords.join(', ')}`);
  console.log(chalk.dim(`  Based on: ${suggestion.basedOnFiles.slice(0, 3).join(', ')}${suggestion.basedOnFiles.length > 3 ? '...' : ''}`));
}

function printKeywordCleanup(cleanup: KeywordCleanupSuggestion): void {
  console.log(chalk.cyan(cleanup.archId) + chalk.dim(` (${cleanup.currentCount} → ${cleanup.afterCleanupCount} keywords)`));
  const byReason = new Map<string, string[]>();
  for (const kw of cleanup.keywordsToRemove) {
    const group = byReason.get(kw.reason) || [];
    const label = kw.usedByCount && kw.usedByCount > 3 ? `${kw.keyword} (${kw.usedByCount} archs)` : kw.keyword;
    group.push(label);
    byReason.set(kw.reason, group);
  }
  for (const [reason, keywords] of byReason) {
    const reasonLabel = CLEANUP_REASON_LABELS[reason] || reason;
    console.log(`  ${chalk.red('-')} ${chalk.dim(`[${reasonLabel}]`)} ${keywords.slice(0, 8).join(', ')}${keywords.length > 8 ? ` (+${keywords.length - 8} more)` : ''}`);
  }
}

function printTypeDuplicate(dup: TypeDuplicateReport): void {
  const matchLabel = MATCH_TYPE_LABELS[dup.matchType] || dup.matchType;
  const similarity = dup.similarity ? ` (${Math.round(dup.similarity * 100)}%)` : '';
  console.log(chalk.magenta(`⚠ ${dup.name}`) + chalk.dim(` [${matchLabel}${similarity}]`));
  for (const loc of dup.locations) {
    const nameLabel = loc.name !== dup.name ? chalk.dim(` as ${loc.name}`) : '';
    console.log(chalk.dim(`  → ${loc.file}:${loc.line}${nameLabel}`));
  }
  console.log(chalk.dim(`  Suggestion: ${dup.suggestion}`));
}

function printSummary(report: GardenReport, appliedKeywords: boolean, appliedCleanup: boolean): void {
  console.log(chalk.bold('─'.repeat(50)));
  console.log();
  console.log(chalk.bold('SUMMARY'));
  console.log(`  Files scanned: ${report.summary.filesScanned}`);
  console.log(`  Patterns detected: ${report.summary.patternsDetected}`);
  console.log(`  Inconsistencies: ${report.summary.inconsistenciesFound}`);
  console.log(`  Keyword suggestions: ${report.summary.keywordSuggestionCount}`);
  console.log(`  Keywords to clean up: ${report.summary.keywordCleanupCount}`);
  console.log(`  Type duplicates: ${report.summary.typeDuplicateCount}`);
  console.log();

  if (appliedKeywords && appliedCleanup) {
    console.log(chalk.green('Keywords added and cleaned up. Garden is healthy! 🌱'));
  } else if (appliedKeywords) {
    console.log(chalk.green('Keywords applied to index. Garden is healthy! 🌱'));
  } else if (appliedCleanup) {
    console.log(chalk.green('Keywords cleaned up. Garden is healthy! 🌱'));
  } else if (report.summary.hasIssues) {
    const actions: string[] = [];
    if (report.summary.keywordSuggestionCount > 0) {
      actions.push('--apply-keywords to add suggestions');
    }
    if (report.summary.keywordCleanupCount > 0) {
      actions.push('--apply-cleanup to remove low-quality keywords');
    }
    if (actions.length > 0) {
      console.log(chalk.yellow(`Run with ${actions.join(' or ')}`));
    }
    if (report.summary.typeDuplicateCount > 0) {
      console.log(chalk.magenta(`Use 'archcodex types duplicates' for detailed type analysis`));
    }
  } else {
    console.log(chalk.green('No issues found. Garden is healthy! 🌱'));
  }
}
