/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Discover subcommand - find specs by intent or description.
 */
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  loadSpecRegistry,
  listSpecIds,
} from '../../../core/spec/index.js';
import { logger } from '../../../utils/logger.js';

/**
 * Register the discover subcommand on the spec command.
 */
export function registerDiscoverCommand(spec: Command): void {
  spec
    .command('discover')
    .description('Find specs by intent or description')
    .argument('<query>', 'Search query (e.g., "save a url")')
    .option('--json', 'Output in JSON format')
    .option('--limit <n>', 'Maximum results', '5')
    .action(async (query: string, options) => {
      const projectRoot = process.cwd();

      try {
        const registry = await loadSpecRegistry(projectRoot);
        const specIds = listSpecIds(registry);

        // Simple keyword matching for now (can be enhanced with embeddings later)
        const queryTerms = query.toLowerCase().split(/\s+/);
        const scored = specIds.map((id) => {
          const node = registry.nodes[id];
          const searchText = [
            id,
            node.intent,
            node.description,
            node.goal,
            ...(node.outcomes || []),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          let score = 0;
          for (const term of queryTerms) {
            if (searchText.includes(term)) score++;
          }
          return { id, score, intent: node.intent };
        });

        const matches = scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, parseInt(options.limit, 10));

        if (options.json) {
          console.log(JSON.stringify({ query, matches }));
        } else {
          if (matches.length === 0) {
            console.log(chalk.yellow(`No specs found matching "${query}"`));
          } else {
            console.log(chalk.bold(`Specs matching "${query}":`));
            console.log('');
            for (const match of matches) {
              console.log(`  ${chalk.cyan(match.id)}`);
              if (match.intent) {
                console.log(`    ${chalk.dim(match.intent)}`);
              }
            }
          }
        }
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(error) }));
        } else {
          logger.error(`Spec discover failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
