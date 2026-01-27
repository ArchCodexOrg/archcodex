/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * CLI command for impact analysis.
 * Shows what files depend on a file before refactoring.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, relative } from 'path';
import { ProjectAnalyzer } from '../../core/imports/analyzer.js';
import { logger } from '../../utils/logger.js';

interface ImpactOptions {
  depth: string;
  json?: boolean;
}

/**
 * Create the impact command.
 */
export function createImpactCommand(): Command {
  return new Command('impact')
    .description('Show what files depend on a file - call BEFORE refactoring')
    .argument('<file>', 'File to analyze impact for')
    .option('--depth <n>', 'Max depth for transitive dependents', '2')
    .option('--json', 'Output as JSON')
    .action(async (file: string, options: ImpactOptions) => {
      try {
        await runImpact(file, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runImpact(file: string, options: ImpactOptions): Promise<void> {
  const projectRoot = process.cwd();
  const depth = parseInt(options.depth, 10) || 2;

  const analyzer = new ProjectAnalyzer(projectRoot);

  try {
    // Build import graph
    if (!options.json) {
      console.log(chalk.dim('Building import graph...'));
    }
    const graphResult = await analyzer.buildImportGraph();

    // Resolve paths
    const absolutePath = resolve(projectRoot, file);
    const relativePath = relative(projectRoot, absolutePath);

    // Get direct importers
    const importers = analyzer.getImporters(relativePath);

    // Get transitive dependents
    const dependents = analyzer.getDependents(new Set([absolutePath]), depth);

    // Group by architecture
    const archGroups = new Map<string, string[]>();
    for (const depPath of dependents) {
      const relPath = relative(projectRoot, depPath);
      const node = graphResult.graph.nodes.get(depPath);
      const archId = node?.archId || 'untagged';
      if (!archGroups.has(archId)) archGroups.set(archId, []);
      archGroups.get(archId)!.push(relPath);
    }

    if (options.json) {
      const response: Record<string, unknown> = {
        file: relativePath,
        directImporters: importers.length,
        totalDependents: dependents.size,
        transitiveDepth: depth,
      };

      if (importers.length > 0) {
        response.importedBy = importers.map(i => ({
          file: relative(projectRoot, i.filePath),
          architecture: i.archId || 'untagged',
        }));
      }

      if (dependents.size > 5) {
        response.dependentsByArchitecture = Object.fromEntries(
          Array.from(archGroups.entries()).map(([arch, files]) => [arch, files.length])
        );
      }

      if (dependents.size > 10) {
        response.warning = `High impact: ${dependents.size} files depend on this`;
      }

      console.log(JSON.stringify(response, null, 2));
      return;
    }

    // Human-readable output
    console.log();
    console.log(chalk.bold(`Impact Analysis: ${chalk.cyan(relativePath)}`));
    console.log();

    // Summary
    console.log(`  ${chalk.bold('Direct importers:')} ${importers.length}`);
    console.log(`  ${chalk.bold('Total dependents:')} ${dependents.size} (depth: ${depth})`);

    // Warning for high impact
    if (dependents.size > 10) {
      console.log();
      console.log(chalk.yellow(`  ⚠️  High impact: ${dependents.size} files depend on this file`));
    }

    // Show direct importers
    if (importers.length > 0) {
      console.log();
      console.log(chalk.bold('  Imported by:'));
      for (const imp of importers.slice(0, 15)) {
        const relFile = relative(projectRoot, imp.filePath);
        const arch = imp.archId ? chalk.dim(` (${imp.archId})`) : '';
        console.log(`    ${chalk.cyan(relFile)}${arch}`);
      }
      if (importers.length > 15) {
        console.log(chalk.dim(`    ... and ${importers.length - 15} more`));
      }
    }

    // Show architecture breakdown for large impact
    if (archGroups.size > 1 && dependents.size > 5) {
      console.log();
      console.log(chalk.bold('  Dependents by architecture:'));
      const sorted = Array.from(archGroups.entries())
        .sort((a, b) => b[1].length - a[1].length);
      for (const [arch, files] of sorted) {
        console.log(`    ${chalk.cyan(arch)}: ${files.length} files`);
      }
    }

    // Suggestion
    console.log();
    if (dependents.size > 0) {
      console.log(chalk.dim('  Tip: Run `archcodex check` on dependents after making changes'));
    } else {
      console.log(chalk.green('  ✓ No dependents - safe to modify'));
    }
    console.log();

  } finally {
    analyzer.dispose();
  }
}
