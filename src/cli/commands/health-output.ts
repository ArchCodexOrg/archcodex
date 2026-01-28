/**
 * @arch archcodex.cli
 * @intent:cli-output
 *
 * Print helpers for the health dashboard command.
 */
import chalk from 'chalk';
import type { HealthRecommendation, LayerCoverageHealth, TypeDuplicateReport } from '../../core/health/types.js';

export function printLayerCoverage(layerHealth: LayerCoverageHealth, verbose: boolean): void {
  console.log();
  console.log(chalk.bold('Layer Coverage'));
  console.log(chalk.dim('─'.repeat(40)));

  const coverageColor = layerHealth.coveragePercent >= 95 ? chalk.green :
    layerHealth.coveragePercent >= 80 ? chalk.yellow : chalk.red;

  console.log(`  Files in layers: ${layerHealth.coveredFiles}/${layerHealth.totalSourceFiles} (${coverageColor(layerHealth.coveragePercent + '%')})`);

  if (layerHealth.orphanFiles.length > 0) {
    console.log(`  Orphan files:    ${chalk.yellow(layerHealth.orphanFiles.length)}`);
    const displayFiles = verbose ? layerHealth.orphanFiles : layerHealth.orphanFiles.slice(0, 5);
    for (const file of displayFiles) {
      console.log(chalk.dim(`    ${file}`));
    }
    if (!verbose && layerHealth.orphanFiles.length > 5) {
      console.log(chalk.dim(`    ... and ${layerHealth.orphanFiles.length - 5} more (use --verbose to see all)`));
    }
  }

  if (layerHealth.phantomPaths.length > 0) {
    console.log(`  ${chalk.yellow('⚠')} ${layerHealth.phantomPaths.length} phantom layer path(s) (matches no files)`);
    for (const phantom of layerHealth.phantomPaths) {
      console.log(chalk.dim(`    ${phantom.layerName}: "${phantom.pattern}"`));
    }
  }

  if (layerHealth.staleExclusions.length > 0) {
    console.log(`  ${chalk.dim('ℹ')} ${layerHealth.staleExclusions.length} stale exclusion(s)`);
    for (const stale of layerHealth.staleExclusions) {
      console.log(chalk.dim(`    "${stale.pattern}" — ${stale.reason}`));
    }
  }

  if (layerHealth.orphanFiles.length === 0 && layerHealth.phantomPaths.length === 0 && layerHealth.staleExclusions.length === 0) {
    console.log(chalk.green('  ✓ All files are covered by layers'));
  }
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: 'exact',
  renamed: 'renamed',
  similar: 'similar',
};

export function printTypeDuplicates(duplicates: TypeDuplicateReport[]): void {
  console.log();
  console.log(chalk.bold('Type Duplicates'));
  console.log(chalk.dim('─'.repeat(40)));

  for (const dup of duplicates) {
    const matchLabel = MATCH_TYPE_LABELS[dup.matchType] || dup.matchType;
    const similarity = dup.similarity ? ` (${Math.round(dup.similarity * 100)}%)` : '';
    console.log(chalk.magenta(`  ⚠ ${dup.name}`) + chalk.dim(` [${matchLabel}${similarity}]`));
    for (const loc of dup.locations) {
      const nameLabel = loc.name !== dup.name ? chalk.dim(` as ${loc.name}`) : '';
      console.log(chalk.dim(`    → ${loc.file}:${loc.line}${nameLabel}`));
    }
    console.log(chalk.dim(`    Suggestion: ${dup.suggestion}`));
  }
}

export function printRecommendation(rec: HealthRecommendation): void {
  const icon = rec.type === 'warning' ? chalk.yellow('⚠') :
    rec.type === 'action' ? chalk.blue('→') : chalk.dim('ℹ');

  const titleColor = rec.type === 'warning' ? chalk.yellow :
    rec.type === 'action' ? chalk.cyan : chalk.white;

  console.log(`  ${icon} ${titleColor(rec.title)}`);
  console.log(`    ${chalk.dim(rec.message)}`);

  if (rec.command) {
    console.log(`    ${chalk.dim('Run:')} ${chalk.cyan(rec.command)}`);
  }

  console.log();
}
