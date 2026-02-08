/**
 * @arch archcodex.cli.barrel
 */
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createCheckCommand } from './commands/check.js';
import { createReadCommand } from './commands/read.js';
import { createResolveCommand } from './commands/resolve.js';
import { createFetchCommand } from './commands/fetch.js';
import { createDiscoverCommand } from './commands/discover.js';
import { createScaffoldCommand } from './commands/scaffold.js';
import { createInitCommand } from './commands/init.js';
import { createInitHooksCommand } from './commands/init-hooks.js';
import { createAuditCommand } from './commands/audit.js';
import { createVerifyCommand } from './commands/verify.js';
import { createReindexCommand } from './commands/reindex.js';
import { createGardenCommand } from './commands/garden.js';
import { createWhyCommand } from './commands/why.js';
import { createHealthCommand } from './commands/health.js';
import { createGraphCommand } from './commands/graph.js';
import { createWatchCommand } from './commands/watch.js';
import { createDiffCommand } from './commands/diff.js';
import { createDiffArchCommand } from './commands/diff-arch.js';
import { createMigrateCommand } from './commands/migrate.js';
import { createFeedbackCommand } from './commands/feedback.js';
import { createSyncIndexCommand } from './commands/sync-index.js';
import { createSimulateCommand } from './commands/simulate.js';
import { createLearnCommand } from './commands/learn.js';
import { createNeighborhoodCommand } from './commands/neighborhood.js';
import { createTagCommand } from './commands/tag.js';
import { createInferCommand } from './commands/infer.js';
import { createBootstrapCommand } from './commands/bootstrap.js';
import { createSchemaCommand } from './commands/schema.js';
import { createDecideCommand } from './commands/decide.js';
import { createMigrateRegistryCommand } from './commands/migrate-registry.js';
import { createIntentsCommand } from './commands/intents/index.js';
import { createActionCommand } from './commands/action.js';
import { createFeatureCommand } from './commands/feature.js';
import { createTypesCommand } from './commands/types.js';
import { createEssentialsCommand } from './commands/essentials.js';
import { createHelpCommand, getEssentialsHelp } from './commands/help.js';
import { createSimilarityCommand } from './commands/similarity.js';
import { createSessionContextCommand } from './commands/session-context.js';
import { createImpactCommand } from './commands/impact.js';
import { createTestPatternCommand } from './commands/test-pattern.js';
import { createPromoteCommand } from './commands/promote.js';
import { createPlanContextCommand } from './commands/plan-context.js';
import { createValidatePlanCommand } from './commands/validate-plan.js';
import { createContextCommand } from './commands/context.js';
import { createMapCommand } from './commands/map.js';
import { createPromptCommand } from './commands/prompt.js';
import { createSpecCommand } from './commands/spec/index.js';
import { createDocCommand } from './commands/doc.js';
import { createFeatureAuditCommand } from './commands/feature-audit.js';
import { createAnalyzeCommand } from './commands/analyze.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')).version;
/** Create the CLI program. */
export function createCli(): Command {
  const program = new Command()
    .name('archcodex')
    .description('The Architectural Compiler for LLM Agents')
    .version(VERSION)
    .configureHelp({
      formatHelp: () => getEssentialsHelp(VERSION),
    });
  [createCheckCommand, createReadCommand, createResolveCommand, createFetchCommand, createDiscoverCommand, createScaffoldCommand,
   createInitCommand, createInitHooksCommand, createAuditCommand, createVerifyCommand, createReindexCommand, createGardenCommand, createWhyCommand,
   createHealthCommand, createGraphCommand, createWatchCommand, createDiffCommand, createDiffArchCommand, createMigrateCommand,
   createFeedbackCommand, createSyncIndexCommand, createSimulateCommand, createLearnCommand, createNeighborhoodCommand,
   createTagCommand, createInferCommand, createBootstrapCommand, createSchemaCommand, createDecideCommand,
   createMigrateRegistryCommand, createIntentsCommand, createActionCommand, createFeatureCommand, createTypesCommand,
   createEssentialsCommand, createHelpCommand, createSimilarityCommand, createSessionContextCommand, createImpactCommand,
   createTestPatternCommand, createPromoteCommand, createPlanContextCommand, createValidatePlanCommand, createContextCommand, createMapCommand, createPromptCommand, createSpecCommand, createDocCommand, createFeatureAuditCommand, createAnalyzeCommand].forEach((cmd) => program.addCommand(cmd()));
  return program;
}
