/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Session context command - primes AI agent context with architecture summaries.
 * Reduces tool calls by providing compact overview of constraints for multiple files.
 *
 * Defaults: compact + deduplicated + with-layers (optimized for agents).
 * Use --full for verbose output, --with-duplicates to keep repetition.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { getSessionContext } from '../../core/session/index.js';
import type { SessionContextResult } from '../../core/session/index.js';

interface SessionContextOptions {
  json?: boolean;
  full?: boolean;
  withPatterns?: boolean;
  withDuplicates?: boolean;
  withoutLayers?: boolean;
  scope?: string[];
  config: string;
}

/**
 * Create the session-context command.
 */
export function createSessionContextCommand(): Command {
  return new Command('session-context')
    .description('Get compact architecture summary for multiple files (primes AI agent context)')
    .argument('[patterns...]', 'Glob patterns for files to analyze (default: from config.files.scan)')
    .option('--json', 'Output as JSON', false)
    .option('--full', 'Verbose output with all details (default is compact)', false)
    .option('--with-patterns', 'Include canonical patterns from .arch/patterns.yaml', false)
    .option('--with-duplicates', 'Keep duplicate constraints per architecture (default deduplicates)', false)
    .option('--without-layers', 'Exclude layer boundary map (default includes layers)', false)
    .option('--scope <paths...>', 'Filter to specific directory paths')
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .action(async (patterns: string[], options: SessionContextOptions) => {
      try {
        await runSessionContext(patterns, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runSessionContext(
  patterns: string[],
  options: SessionContextOptions
): Promise<void> {
  const projectRoot = process.cwd();

  // Defaults: compact=true, deduplicate=true, withLayers=true
  // Opt-out: --full, --with-duplicates, --without-layers
  const compact = !options.full;
  const deduplicate = !options.withDuplicates;
  const withLayers = !options.withoutLayers;

  const result = await getSessionContext(projectRoot, patterns, {
    compact,
    withPatterns: options.withPatterns,
    deduplicate,
    withLayers,
    scope: options.scope,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (compact) {
    printCompactOutput(result);
  } else {
    printHumanOutput(result);
  }
}

function printHumanOutput(result: SessionContextResult): void {
  console.log();
  console.log(chalk.bold('Session Context Summary'));
  console.log(chalk.dim(`Scanned ${result.filesScanned} files`));
  console.log();

  if (result.architecturesInScope.length === 0) {
    console.log(chalk.yellow('No architectures found in scanned files.'));
    console.log(chalk.dim('Try different patterns or ensure files have @arch tags.'));
    return;
  }

  // Show layers if available
  if (result.layers && result.layers.length > 0) {
    console.log(chalk.bold('Layer Boundaries:'));
    for (const layer of result.layers) {
      const imports = layer.canImport.length > 0 ? layer.canImport.join(', ') : '(leaf)';
      console.log(`  ${chalk.cyan(layer.name)} → [${imports}]`);
    }
    console.log();
  }

  console.log(chalk.bold('Architectures in Scope:'));
  console.log();

  for (const arch of result.architecturesInScope) {
    console.log(`  ${chalk.cyan(arch.archId)} ${chalk.dim(`(${arch.fileCount} files)`)}`);

    if (arch.description) {
      console.log(`    ${arch.description}`);
    }

    if (arch.forbid.length > 0) {
      console.log(`    ${chalk.red('Forbid:')} ${arch.forbid.join(', ')}`);
    }

    if (arch.patterns.length > 0) {
      console.log(`    ${chalk.red('Patterns:')} ${arch.patterns.join(', ')}`);
    }

    if (arch.require.length > 0) {
      console.log(`    ${chalk.green('Require:')} ${arch.require.join(', ')}`);
    }

    if (arch.hints.length > 0) {
      console.log(`    ${chalk.blue('Hints:')} ${arch.hints.slice(0, 2).join('; ')}${arch.hints.length > 2 ? '...' : ''}`);
    }

    if (arch.mixins.length > 0) {
      console.log(`    ${chalk.magenta('Mixins:')} ${arch.mixins.join(', ')}`);
    }

    console.log();
  }

  if (result.untaggedFiles.length > 0) {
    console.log(chalk.yellow(`${result.untaggedFiles.length} untagged files`));
    console.log(chalk.dim('  Run: archcodex infer --files "pattern" to suggest architectures'));
  }

  // Print canonical patterns if included
  if (result.canonicalPatterns && result.canonicalPatterns.length > 0) {
    console.log();
    console.log(chalk.bold('Canonical Patterns (use instead of creating new):'));
    console.log();
    for (const pattern of result.canonicalPatterns) {
      console.log(`  ${chalk.cyan(pattern.name)}: ${pattern.canonical}`);
      if (pattern.exports.length > 0) {
        console.log(`    ${chalk.dim('exports:')} ${pattern.exports.join(', ')}`);
      }
      if (pattern.usage) {
        console.log(`    ${chalk.dim(pattern.usage)}`);
      }
    }
  }

  console.log();
}

function printCompactOutput(result: SessionContextResult): void {
  // Ultra-compact format for maximum context efficiency
  console.log('# ArchCodex Session Context');
  console.log(`# ${result.filesScanned} files scanned`);
  console.log();

  // Show layer boundaries if available
  if (result.layers && result.layers.length > 0) {
    console.log('## Layers');
    for (const layer of result.layers) {
      const imports = layer.canImport.length > 0 ? layer.canImport.join(', ') : '(leaf)';
      console.log(`${layer.name} -> [${imports}]`);
    }
    console.log();
  }

  // Show shared constraints if deduplicated
  if (result.sharedConstraints && result.sharedConstraints.length > 0) {
    console.log('## Shared (all archs)');
    for (const group of result.sharedConstraints) {
      console.log(`- ${group.type}: ${group.values.join(', ')}`);
    }
    console.log();
  }

  for (const arch of result.architecturesInScope) {
    console.log(`## ${arch.archId} (${arch.fileCount})`);
    if (arch.forbid.length > 0) {
      console.log(`- forbid: ${arch.forbid.join(', ')}`);
    }
    if (arch.patterns.length > 0) {
      console.log(`- patterns: ${arch.patterns.join(', ')}`);
    }
    if (arch.require.length > 0) {
      console.log(`- require: ${arch.require.join(', ')}`);
    }
    if (arch.hints.length > 0) {
      console.log(`- hint: ${arch.hints[0]}`);
    }
  }

  // Print canonical patterns if included (compact format)
  if (result.canonicalPatterns && result.canonicalPatterns.length > 0) {
    console.log();
    console.log('## Canonical Patterns');
    for (const p of result.canonicalPatterns) {
      const exports = p.exports.length > 0 ? ` [${p.exports.join(', ')}]` : '';
      console.log(`- ${p.name}: ${p.canonical}${exports}`);
    }
  }
}
