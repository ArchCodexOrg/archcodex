/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * CLI commands for SpecCodex - spec validation and resolution.
 * Thin orchestrator that wires subcommands from handler files.
 */
import { Command } from 'commander';
import { registerHelpCommand } from './help.js';
import { registerCheckCommand } from './check.js';
import { registerResolveCommand } from './resolve.js';
import { registerListCommand } from './list.js';
import { registerDiscoverCommand } from './discover.js';
import { registerPlaceholderCommand } from './placeholder.js';
import { registerFixtureCommand } from './fixture.js';
import { registerGenerateCommand } from './generate.js';
import { registerVerifyCommand } from './verify.js';
import { registerInferCommand } from './infer.js';
import { registerSchemaCommand } from './schema.js';
import { registerDriftCommand } from './drift.js';
import { registerDocCommand } from './doc.js';
import { registerInitCommand } from './init.js';

// Re-export types used by MCP handlers
export { runSpecInit, type SpecInitOptions, type SpecInitResult } from './init.js';

/**
 * Create the spec command with all subcommands.
 */
export function createSpecCommand(): Command {
  const spec = new Command('spec')
    .description('SpecCodex - Specification by Example for code and test generation');

  registerHelpCommand(spec);
  registerCheckCommand(spec);
  registerResolveCommand(spec);
  registerListCommand(spec);
  registerDiscoverCommand(spec);
  registerPlaceholderCommand(spec);
  registerFixtureCommand(spec);
  registerGenerateCommand(spec);
  registerVerifyCommand(spec);
  registerInferCommand(spec);
  registerSchemaCommand(spec);
  registerDriftCommand(spec);
  registerDocCommand(spec);
  registerInitCommand(spec);

  return spec;
}
