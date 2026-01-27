/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry } from '../../core/registry/loader.js';
import { resolveArchitecture } from '../../core/registry/resolver.js';
import { extractArchId } from '../../core/arch-tag/parser.js';
import { logger as log } from '../../utils/logger.js';
import type { ResolvedConstraint, FlattenedArchitecture } from '../../core/registry/types.js';

interface WhyOptions {
  config: string;
  json?: boolean;
}

/**
 * Create the why command.
 */
export function createWhyCommand(): Command {
  return new Command('why')
    .description('Explain why a constraint applies to a file')
    .argument('<file>', 'File path to analyze')
    .argument('[constraint]', 'Constraint to explain (e.g., forbid_import:axios)')
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .option('--json', 'Output as JSON')
    .action(async (file: string, constraint: string | undefined, options: WhyOptions) => {
      try {
        await runWhy(file, constraint, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runWhy(
  filePath: string,
  constraintArg: string | undefined,
  options: WhyOptions
): Promise<void> {
  const projectRoot = process.cwd();
  const absolutePath = path.resolve(projectRoot, filePath);

  // Check file exists
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Read file and extract @arch tag
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const archId = extractArchId(content);

  if (!archId) {
    throw new Error(`No @arch tag found in ${filePath}`);
  }

  // Load configuration and registry
  const configPath = path.resolve(projectRoot, options.config);
  const config = await loadConfig(configPath);
  const registry = await loadRegistry(projectRoot, config.registry);

  // Resolve the architecture
  const { architecture } = resolveArchitecture(registry, archId);

  // Parse constraint argument if provided
  let targetRule: string | undefined;
  let targetValue: string | undefined;

  if (constraintArg) {
    const colonIndex = constraintArg.indexOf(':');
    if (colonIndex > 0) {
      targetRule = constraintArg.substring(0, colonIndex);
      targetValue = constraintArg.substring(colonIndex + 1);
    } else {
      targetRule = constraintArg;
    }
  }

  // Find matching constraints
  const matchingConstraints = architecture.constraints.filter((c) => {
    if (!targetRule) return true;
    if (c.rule !== targetRule) return false;
    if (!targetValue) return true;

    // Check if value matches
    if (Array.isArray(c.value)) {
      return c.value.some((v) => typeof v === 'string' && v.toLowerCase() === targetValue!.toLowerCase());
    }
    if (typeof c.value === 'string') {
      return c.value.toLowerCase() === targetValue.toLowerCase();
    }
    return String(c.value).toLowerCase() === targetValue.toLowerCase();
  });

  // Build result
  const result = {
    file: filePath,
    archId,
    inheritanceChain: architecture.inheritanceChain,
    appliedMixins: architecture.appliedMixins,
    query: constraintArg || 'all',
    version: architecture.version,
    deprecated_from: architecture.deprecated_from,
    migration_guide: architecture.migration_guide,
    constraints: matchingConstraints.map((c) => ({
      rule: c.rule,
      value: c.value,
      severity: c.severity,
      source: c.source,
      why: c.why,
    })),
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Human-readable output
  printHumanOutput(result, architecture, matchingConstraints);
}

function printHumanOutput(
  result: {
    file: string;
    archId: string;
    inheritanceChain: string[];
    appliedMixins: string[];
    query: string;
    version?: string;
    deprecated_from?: string;
    migration_guide?: string;
    constraints: Array<{
      rule: string;
      value: unknown;
      severity: string;
      source: string;
      why?: string;
    }>;
  },
  architecture: FlattenedArchitecture,
  constraints: ResolvedConstraint[]
): void {
  const inheritanceChain = architecture.inheritanceChain;
  console.log();
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('WHY: Constraint Trace'));
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));

  // File info
  console.log();
  console.log(chalk.dim('File:'));
  console.log(`  ${result.file}`);

  // Architecture tag
  console.log();
  console.log(chalk.dim('Architecture Tag:'));
  const versionSuffix = result.version ? chalk.dim(` (v${result.version})`) : '';
  console.log(`  @arch ${chalk.cyan(result.archId)}${versionSuffix}`);

  // Deprecation warning
  if (result.deprecated_from) {
    console.log();
    console.log(chalk.yellow.bold('⚠️  DEPRECATED'));
    console.log(chalk.yellow(`  This architecture has been deprecated since version ${result.deprecated_from}.`));
    if (result.migration_guide) {
      console.log(chalk.yellow(`  Migration guide: ${chalk.underline(result.migration_guide)}`));
    }
  }

  // Inheritance chain
  console.log();
  console.log(chalk.dim('Inheritance Chain:'));
  const chainDisplay = inheritanceChain.map((id, i) => {
    if (i === 0) return chalk.cyan(id);
    return id;
  }).join(chalk.dim(' → '));
  console.log(`  ${chainDisplay}`);

  // Applied mixins
  if (result.appliedMixins.length > 0) {
    console.log();
    console.log(chalk.dim('Applied Mixins:'));
    console.log(`  ${result.appliedMixins.join(', ')}`);
  }

  // Constraints
  console.log();
  if (constraints.length === 0) {
    if (result.query === 'all') {
      console.log(chalk.yellow('No constraints apply to this architecture.'));
    } else {
      console.log(chalk.yellow(`No constraint matching "${result.query}" found.`));
      console.log();
      console.log(chalk.dim('Tip: Use "archcodex why <file>" to see all constraints.'));
    }
  } else {
    console.log(chalk.dim(`Matching Constraints (${constraints.length}):`));
    console.log();

    for (const constraint of constraints) {
      const value = Array.isArray(constraint.value)
        ? constraint.value.join(', ')
        : String(constraint.value);

      const severityColor =
        constraint.severity === 'error' ? chalk.red :
        constraint.severity === 'warning' ? chalk.yellow : chalk.blue;

      // Constraint header
      console.log(
        `  ${severityColor(`[${constraint.severity.toUpperCase()}]`)} ` +
        `${chalk.bold(constraint.rule)}: ${value}`
      );

      // Source trace
      console.log(`  ${chalk.dim('Source:')} ${constraint.source}`);

      // Trace through inheritance to show where it came from
      const sourceIndex = inheritanceChain.indexOf(constraint.source);
      if (sourceIndex > 0) {
        const trace = inheritanceChain.slice(0, sourceIndex + 1);
        console.log(`  ${chalk.dim('Trace:')}  ${trace.join(chalk.dim(' → '))}`);
      }

      // Why explanation
      if (constraint.why) {
        console.log(`  ${chalk.dim('Why:')}    ${chalk.italic(constraint.why)}`);
      }

      console.log();
    }
  }
}
