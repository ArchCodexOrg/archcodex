/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 * @intent:cli-subcommand
 *
 * Validate all intent usage in the codebase.
 */
import * as path from 'node:path';
import chalk from 'chalk';
import { globFiles, readFile } from '../../../utils/file-system.js';
import { extractIntents, parseArchTags } from '../../../core/arch-tag/parser.js';
import { patternMatches } from '../../../utils/pattern-matcher.js';
import { TypeScriptValidator } from '../../../validators/typescript.js';
import type { IntentRegistry } from '../../../core/registry/schema.js';
import type { Config } from '../../../core/config/schema.js';
import type { ValidationIssue } from './types.js';
import { logger as log } from '../../../utils/logger.js';

/**
 * Intent location details for validation.
 */
interface IntentLocation {
  name: string;
  location: 'file' | 'function';
  functionName?: string;
  /** The content scope to validate against (function body or full file) */
  contentScope: string;
  line?: number;
}

/**
 * Extract intents with their content scope for validation.
 * For file-level intents, scope is the full file.
 * For function-level intents, scope is the function body.
 */
async function extractIntentsWithScope(
  filePath: string,
  content: string
): Promise<IntentLocation[]> {
  const locations: IntentLocation[] = [];

  // Parse file-level intents
  const parseResult = parseArchTags(content);
  for (const intent of parseResult.intents) {
    locations.push({
      name: intent.name,
      location: 'file',
      contentScope: content, // Full file content
      line: intent.line,
    });
  }

  // Extract function-level intents using TypeScript validator
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
    try {
      const validator = new TypeScriptValidator();
      const model = await validator.parseFile(filePath, content);
      const lines = content.split('\n');

      // Check functions
      for (const func of model.functions) {
        if (func.intents?.length && func.startLine && func.endLine) {
          // Extract function body from content
          const funcBody = lines.slice(func.startLine - 1, func.endLine).join('\n');

          for (const intentName of func.intents) {
            // Check if this is also a file-level intent (avoid duplicates)
            const isFileLevel = parseResult.intents.some(i => i.name === intentName);
            if (!isFileLevel) {
              locations.push({
                name: intentName,
                location: 'function',
                functionName: func.name,
                contentScope: funcBody,
                line: func.startLine,
              });
            }
          }
        }
      }

      // Check class methods
      for (const cls of model.classes) {
        for (const method of cls.methods) {
          if (method.intents?.length && method.startLine && method.endLine) {
            // Extract method body from content
            const methodBody = lines.slice(method.startLine - 1, method.endLine).join('\n');

            for (const intentName of method.intents) {
              // Check if this is also a file-level intent (avoid duplicates)
              const isFileLevel = parseResult.intents.some(i => i.name === intentName);
              if (!isFileLevel) {
                locations.push({
                  name: intentName,
                  location: 'function',
                  functionName: `${cls.name}.${method.name}`,
                  contentScope: methodBody,
                  line: method.startLine,
                });
              }
            }
          }
        }
      }
    } catch { /* TypeScript parsing failed, file-level intents already captured */ }
  }

  return locations;
}

/**
 * Extended validation issue with function context.
 */
interface ExtendedValidationIssue extends ValidationIssue {
  functionName?: string;
  location?: 'file' | 'function';
}

/**
 * Validate all intent usage in the codebase.
 */
export async function validateIntents(
  projectRoot: string,
  config: Config,
  registry: IntentRegistry,
  json?: boolean
): Promise<void> {
  const patterns = config.files?.scan?.include || ['**/*.ts', '**/*.tsx'];
  const exclude = config.files?.scan?.exclude || ['**/node_modules/**', '**/dist/**'];

  const files = await globFiles(patterns, {
    cwd: projectRoot,
    ignore: exclude,
    absolute: true,
  });

  const issues: ExtendedValidationIssue[] = [];
  let totalIntents = 0;
  let fileLevelIntents = 0;
  let functionLevelIntents = 0;

  for (const filePath of files) {
    try {
      const content = await readFile(filePath);
      const relativePath = path.relative(projectRoot, filePath);

      // Get intents with their proper scope
      const intentLocations = await extractIntentsWithScope(filePath, content);

      // Track all intent names in file for conflict checking
      const allIntentsInFile = extractIntents(content);

      for (const intentLoc of intentLocations) {
        totalIntents++;
        if (intentLoc.location === 'file') {
          fileLevelIntents++;
        } else {
          functionLevelIntents++;
        }

        const definition = registry.intents[intentLoc.name];

        // Check for undefined
        if (!definition) {
          issues.push({
            file: relativePath,
            intent: intentLoc.name,
            type: 'undefined',
            message: `Unknown intent '@intent:${intentLoc.name}'`,
            functionName: intentLoc.functionName,
            location: intentLoc.location,
          });
          continue;
        }

        // Check requires - validate against the appropriate scope
        if (definition.requires) {
          for (const pattern of definition.requires) {
            if (!patternMatches(pattern, intentLoc.contentScope)) {
              const locationHint = intentLoc.location === 'function'
                ? ` in function '${intentLoc.functionName}'`
                : '';
              issues.push({
                file: relativePath,
                intent: intentLoc.name,
                type: 'missing_pattern',
                message: `Intent '@intent:${intentLoc.name}'${locationHint} requires pattern '${pattern}'`,
                functionName: intentLoc.functionName,
                location: intentLoc.location,
              });
            }
          }
        }

        // Check forbids - validate against the appropriate scope
        if (definition.forbids) {
          for (const pattern of definition.forbids) {
            if (patternMatches(pattern, intentLoc.contentScope)) {
              const locationHint = intentLoc.location === 'function'
                ? ` in function '${intentLoc.functionName}'`
                : '';
              issues.push({
                file: relativePath,
                intent: intentLoc.name,
                type: 'forbidden_pattern',
                message: `Intent '@intent:${intentLoc.name}'${locationHint} forbids pattern '${pattern}'`,
                functionName: intentLoc.functionName,
                location: intentLoc.location,
              });
            }
          }
        }

        // Check conflicts
        if (definition.conflicts_with) {
          if (intentLoc.location === 'file') {
            // File-level: check against all intents in file
            for (const conflicting of definition.conflicts_with) {
              if (allIntentsInFile.includes(conflicting)) {
                issues.push({
                  file: relativePath,
                  intent: intentLoc.name,
                  type: 'conflict',
                  message: `Intent '@intent:${intentLoc.name}' conflicts with '@intent:${conflicting}'`,
                  location: intentLoc.location,
                });
              }
            }
          } else {
            // Function-level: check against other intents on the SAME function
            const sameFunction = intentLocations.filter(
              loc => loc.location === 'function' && loc.functionName === intentLoc.functionName
            );
            const sameFunctionIntents = sameFunction.map(loc => loc.name);

            for (const conflicting of definition.conflicts_with) {
              if (sameFunctionIntents.includes(conflicting)) {
                issues.push({
                  file: relativePath,
                  intent: intentLoc.name,
                  type: 'conflict',
                  message: `Intent '@intent:${intentLoc.name}' in function '${intentLoc.functionName}' conflicts with '@intent:${conflicting}'`,
                  functionName: intentLoc.functionName,
                  location: intentLoc.location,
                });
              }
            }
          }
        }
      }
    } catch (error) {
      log.warn(`Skipped ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (json) {
    console.log(JSON.stringify({
      totalIntents,
      fileLevelIntents,
      functionLevelIntents,
      issueCount: issues.length,
      issues,
      passed: issues.length === 0,
    }, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold('INTENT VALIDATION'));
  console.log(chalk.dim('='.repeat(60)));

  // Show stats
  console.log();
  console.log(chalk.dim(`  Total intents: ${totalIntents} (${fileLevelIntents} file-level, ${functionLevelIntents} function-level)`));

  if (issues.length === 0) {
    console.log(chalk.green(`\n  All ${totalIntents} intents validated successfully`));
    console.log();
    return;
  }

  // Group by type
  const byType = new Map<string, ExtendedValidationIssue[]>();
  for (const issue of issues) {
    if (!byType.has(issue.type)) {
      byType.set(issue.type, []);
    }
    byType.get(issue.type)!.push(issue);
  }

  for (const [type, typeIssues] of byType.entries()) {
    console.log();
    const typeLabel = type === 'undefined' ? 'Undefined Intents'
      : type === 'missing_pattern' ? 'Missing Required Patterns'
      : type === 'forbidden_pattern' ? 'Forbidden Patterns Found'
      : 'Conflicting Intents';

    console.log(chalk.bold.yellow(typeLabel) + chalk.dim(` (${typeIssues.length})`));

    for (const issue of typeIssues.slice(0, 10)) {
      const locationTag = issue.location === 'function'
        ? chalk.cyan(` [func: ${issue.functionName}]`)
        : chalk.dim(' [file]');
      console.log(`  ${chalk.dim(issue.file)}${locationTag}`);
      console.log(`    ${issue.message}`);
    }

    if (typeIssues.length > 10) {
      console.log(chalk.dim(`  ... ${typeIssues.length - 10} more`));
    }
  }

  console.log();
  console.log(chalk.red(`${issues.length} issues found in ${totalIntents} intents`));
  console.log();

  process.exit(1);
}
