/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Verify subcommand - verify implementation matches spec bidirectionally.
 */
import type { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import {
  loadSpecRegistry,
  resolveSpec,
  verifyImplementation,
  formatVerifyResult,
} from '../../../core/spec/index.js';
import { readFile } from '../../../utils/file-system.js';
import { logger } from '../../../utils/logger.js';

/**
 * Register the verify subcommand on the spec command.
 */
export function registerVerifyCommand(spec: Command): void {
  spec
    .command('verify')
    .description('Verify implementation matches spec bidirectionally')
    .argument('<specId>', 'Spec ID to verify')
    .option('--impl <path>', 'Path to implementation file (inferred if colocated)')
    .option('--no-architecture', 'Skip architecture tag check')
    .option('--no-errors', 'Skip error handling check')
    .option('--no-inputs', 'Skip input parameter check')
    .option('--json', 'Output in JSON format')
    .action(async (specId: string, options) => {
      const projectRoot = process.cwd();

      try {
        const registry = await loadSpecRegistry(projectRoot);

        // Resolve the spec
        const resolved = resolveSpec(registry, specId);
        if (!resolved.valid || !resolved.spec) {
          if (options.json) {
            console.log(JSON.stringify({ valid: false, errors: resolved.errors }));
          } else {
            logger.error(`Failed to resolve spec '${specId}':`);
            for (const err of resolved.errors) {
              console.log(chalk.red(`  [${err.code}] ${err.message}`));
            }
          }
          process.exit(1);
        }

        // Determine implementation path
        let implPath = options.impl;
        if (!implPath) {
          // Try to infer from spec's implementation field
          if (resolved.spec.node.implementation) {
            // Parse implementation field format: path/to/file.ts#exportName
            const [filePath] = resolved.spec.node.implementation.split('#');
            implPath = path.resolve(projectRoot, filePath);
          } else {
            // Try colocated convention: look for spec file and infer
            logger.error('No implementation path provided and none specified in spec');
            logger.error('Use --impl <path> or add "implementation:" to the spec');
            process.exit(1);
          }
        } else {
          implPath = path.resolve(projectRoot, implPath);
        }

        // Read implementation file
        let implContent: string;
        try {
          implContent = await readFile(implPath);
        } catch { /* implementation file not found */
          if (options.json) {
            console.log(JSON.stringify({
              valid: false,
              errors: [{ code: 'IMPLEMENTATION_NOT_FOUND', message: `File not found: ${implPath}` }],
            }));
          } else {
            logger.error(`Implementation file not found: ${implPath}`);
          }
          process.exit(1);
        }

        // Verify
        const result = verifyImplementation(resolved.spec, implContent, implPath, {
          projectRoot,
          checkArchitecture: options.architecture !== false,
          checkErrors: options.errors !== false,
          checkInputs: options.inputs !== false,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatVerifyResult(result));
        }

        process.exit(result.valid ? 0 : 1);
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(error) }));
        } else {
          logger.error(`Verification failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
