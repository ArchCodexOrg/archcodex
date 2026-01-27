/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry } from '../../core/registry/loader.js';
import { GraphBuilder } from '../../core/graph/index.js';
import type { GraphFormat } from '../../core/graph/types.js';
import { logger as log } from '../../utils/logger.js';

interface GraphOptions {
  config: string;
  format: string;
  showFiles?: boolean;
  showMixins?: boolean;
  root?: string;
  maxDepth?: string;
}

/**
 * Create the graph command.
 */
export function createGraphCommand(): Command {
  return new Command('graph')
    .description('Visualize architecture hierarchy and relationships')
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .option('-f, --format <format>', 'Output format (mermaid, graphviz, json)', 'mermaid')
    .option('--show-files', 'Show files that use each architecture')
    .option('--show-mixins', 'Show mixin relationships', true)
    .option('--no-show-mixins', 'Hide mixin relationships')
    .option('--root <arch>', 'Filter to specific architecture subtree')
    .option('--max-depth <n>', 'Maximum depth to traverse')
    .action(async (options: GraphOptions) => {
      try {
        await runGraph(options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runGraph(options: GraphOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Validate format
  const validFormats: GraphFormat[] = ['mermaid', 'graphviz', 'json'];
  const format = options.format as GraphFormat;
  if (!validFormats.includes(format)) {
    throw new Error(`Invalid format: ${options.format}. Use: ${validFormats.join(', ')}`);
  }

  // Load configuration and registry
  const configPath = path.resolve(projectRoot, options.config);
  const config = await loadConfig(configPath);
  const registry = await loadRegistry(projectRoot, config.registry);

  // Build graph
  const builder = new GraphBuilder(projectRoot, registry);
  const graph = await builder.build({
    format,
    showFiles: options.showFiles,
    showMixins: options.showMixins,
    root: options.root,
    maxDepth: options.maxDepth ? parseInt(options.maxDepth, 10) : undefined,
  });

  // Check if graph has any content
  if (graph.nodes.length === 0) {
    log.warn('No architectures found in registry');
    return;
  }

  // Output formatted graph
  const output = builder.format(graph, format);

  if (format === 'json') {
    console.log(output);
  } else {
    // Add header for diagram formats
    console.log();
    console.log(chalk.bold(`Architecture Graph (${format})`));
    console.log(chalk.dim('─'.repeat(50)));
    console.log();
    console.log(output);
    console.log();

    // Print summary
    const archCount = graph.nodes.filter(n => n.type === 'architecture').length;
    const mixinCount = graph.nodes.filter(n => n.type === 'mixin').length;

    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.dim(`Architectures: ${archCount}, Mixins: ${mixinCount}, Edges: ${graph.edges.length}`));

    if (options.showFiles) {
      const filesUsed = graph.nodes
        .filter(n => n.fileCount && n.fileCount > 0)
        .reduce((sum, n) => sum + (n.fileCount || 0), 0);
      console.log(chalk.dim(`Files using architectures: ${filesUsed}`));
    }
  }
}
