/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 * @intent:cli-subcommand
 *
 * Show intent usage across the codebase.
 */
import * as path from 'node:path';
import chalk from 'chalk';
import { globFiles, readFile } from '../../../utils/file-system.js';
import { extractIntents, parseArchTags } from '../../../core/arch-tag/parser.js';
import { TypeScriptValidator } from '../../../validators/typescript.js';
import type { IntentRegistry } from '../../../core/registry/schema.js';
import type { Config } from '../../../core/config/schema.js';
import { logger as log } from '../../../utils/logger.js';

/**
 * Intent usage entry with location details.
 */
interface IntentUsageEntry {
  file: string;
  location: 'file' | 'function';
  functionName?: string;
  line?: number;
}

/**
 * Extract intents with location details from a file.
 */
async function extractIntentDetails(
  filePath: string,
  content: string
): Promise<IntentUsageEntry[]> {
  const entries: IntentUsageEntry[] = [];
  const relativePath = filePath;

  // Parse file-level intents from the header
  const parseResult = parseArchTags(content);
  const fileIntentNames = new Set(parseResult.intents.map(i => i.name));

  for (const intent of parseResult.intents) {
    entries.push({
      file: relativePath,
      location: 'file',
      line: intent.line,
    });
  }

  // Try to extract function-level intents using TypeScript validator
  // Only for .ts/.tsx files
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
    try {
      const validator = new TypeScriptValidator();
      const model = await validator.parseFile(filePath, content);

      // Check functions for intents
      for (const func of model.functions) {
        if (func.intents?.length) {
          for (const intentName of func.intents) {
            // Skip if this intent was already counted as file-level
            // (intents in the file header are also found by regex in functions sometimes)
            if (fileIntentNames.has(intentName) && func.startLine && func.startLine <= 10) {
              continue;
            }
            entries.push({
              file: relativePath,
              location: 'function',
              functionName: func.name,
              line: func.startLine,
            });
          }
        }
      }

      // Check class methods for intents
      for (const cls of model.classes) {
        for (const method of cls.methods) {
          if (method.intents?.length) {
            for (let i = 0; i < method.intents.length; i++) {
              entries.push({
                file: relativePath,
                location: 'function',
                functionName: `${cls.name}.${method.name}`,
                line: method.startLine,
              });
            }
          }
        }
      }
    } catch { /* TypeScript parsing failed, fall back to regex-only */ }
  }

  return entries;
}

/**
 * Detailed usage entry for JSON output.
 */
interface DetailedUsageEntry {
  file: string;
  location: 'file' | 'function';
  functionName?: string;
  line?: number;
}

/**
 * Show intent usage across the codebase.
 */
export async function showUsage(
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

  // Track detailed usage with location info
  const usage = new Map<string, DetailedUsageEntry[]>();
  const undefinedIntents = new Map<string, DetailedUsageEntry[]>();

  for (const filePath of files) {
    try {
      const content = await readFile(filePath);
      const relativePath = path.relative(projectRoot, filePath);

      // Use extractIntents for simple intent name extraction (for registry lookup)
      const allIntents = extractIntents(content);

      // Get detailed intent info (file vs function level)
      const detailedIntents = await extractIntentDetails(relativePath, content);

      // Map intent names to their detailed entries
      const intentToEntries = new Map<string, DetailedUsageEntry[]>();
      for (const entry of detailedIntents) {
        // Find which intent this entry belongs to by re-parsing
        const parseResult = parseArchTags(content);

        if (entry.location === 'file') {
          // Find the intent by line number
          const matchingIntent = parseResult.intents.find(i => i.line === entry.line);
          if (matchingIntent) {
            if (!intentToEntries.has(matchingIntent.name)) {
              intentToEntries.set(matchingIntent.name, []);
            }
            intentToEntries.get(matchingIntent.name)!.push(entry);
          }
        }
      }

      // Also extract function-level intents with their names
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        try {
          const validator = new TypeScriptValidator();
          const model = await validator.parseFile(filePath, content);

          for (const func of model.functions) {
            if (func.intents?.length) {
              for (const intentName of func.intents) {
                if (!intentToEntries.has(intentName)) {
                  intentToEntries.set(intentName, []);
                }
                intentToEntries.get(intentName)!.push({
                  file: relativePath,
                  location: 'function',
                  functionName: func.name,
                  line: func.startLine,
                });
              }
            }
          }

          for (const cls of model.classes) {
            for (const method of cls.methods) {
              if (method.intents?.length) {
                for (const intentName of method.intents) {
                  if (!intentToEntries.has(intentName)) {
                    intentToEntries.set(intentName, []);
                  }
                  intentToEntries.get(intentName)!.push({
                    file: relativePath,
                    location: 'function',
                    functionName: `${cls.name}.${method.name}`,
                    line: method.startLine,
                  });
                }
              }
            }
          }
        } catch { /* TypeScript parsing failed, use simple extraction */
          for (const intent of allIntents) {
            if (!intentToEntries.has(intent)) {
              intentToEntries.set(intent, []);
            }
            intentToEntries.get(intent)!.push({
              file: relativePath,
              location: 'file',
            });
          }
        }
      } else {
        // Non-TS files: all intents are file-level
        for (const intent of allIntents) {
          if (!intentToEntries.has(intent)) {
            intentToEntries.set(intent, []);
          }
          intentToEntries.get(intent)!.push({
            file: relativePath,
            location: 'file',
          });
        }
      }

      // Categorize intents as defined or undefined
      for (const [intentName, entries] of intentToEntries.entries()) {
        if (registry.intents[intentName]) {
          if (!usage.has(intentName)) {
            usage.set(intentName, []);
          }
          usage.get(intentName)!.push(...entries);
        } else {
          if (!undefinedIntents.has(intentName)) {
            undefinedIntents.set(intentName, []);
          }
          undefinedIntents.get(intentName)!.push(...entries);
        }
      }
    } catch (error) {
      log.warn(`Skipped ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (json) {
    const output = {
      defined: Object.fromEntries(
        Array.from(usage.entries()).map(([k, entries]) => {
          const fileLevelCount = entries.filter(e => e.location === 'file').length;
          const functionLevelCount = entries.filter(e => e.location === 'function').length;
          return [k, {
            count: entries.length,
            fileLevelCount,
            functionLevelCount,
            entries,
          }];
        })
      ),
      undefined: Object.fromEntries(
        Array.from(undefinedIntents.entries()).map(([k, entries]) => {
          const fileLevelCount = entries.filter(e => e.location === 'file').length;
          const functionLevelCount = entries.filter(e => e.location === 'function').length;
          return [k, {
            count: entries.length,
            fileLevelCount,
            functionLevelCount,
            entries,
          }];
        })
      ),
      summary: {
        totalIntents: Array.from(usage.values()).reduce((sum, e) => sum + e.length, 0) +
          Array.from(undefinedIntents.values()).reduce((sum, e) => sum + e.length, 0),
        fileLevelIntents: Array.from(usage.values()).flat().filter(e => e.location === 'file').length +
          Array.from(undefinedIntents.values()).flat().filter(e => e.location === 'file').length,
        functionLevelIntents: Array.from(usage.values()).flat().filter(e => e.location === 'function').length +
          Array.from(undefinedIntents.values()).flat().filter(e => e.location === 'function').length,
      },
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold('INTENT USAGE'));
  console.log(chalk.dim('='.repeat(60)));

  if (usage.size === 0 && undefinedIntents.size === 0) {
    console.log(chalk.yellow('\n  No intents found in codebase.'));
    return;
  }

  // Sort by usage count (descending)
  const sortedUsage = Array.from(usage.entries()).sort((a, b) => b[1].length - a[1].length);

  for (const [intent, entries] of sortedUsage) {
    const fileLevelCount = entries.filter(e => e.location === 'file').length;
    const functionLevelCount = entries.filter(e => e.location === 'function').length;

    console.log();
    console.log(
      chalk.bold.green(`@intent:${intent}`) +
      chalk.dim(` (${entries.length} total: ${fileLevelCount} file-level, ${functionLevelCount} function-level)`)
    );

    // Show file-level entries
    const fileEntries = entries.filter(e => e.location === 'file').slice(0, 3);
    if (fileEntries.length > 0) {
      for (const entry of fileEntries) {
        console.log(`  ${chalk.dim('file')}  ${entry.file}`);
      }
      const moreFileLevel = fileLevelCount - fileEntries.length;
      if (moreFileLevel > 0) {
        console.log(chalk.dim(`        ... ${moreFileLevel} more file-level`));
      }
    }

    // Show function-level entries
    const funcEntries = entries.filter(e => e.location === 'function').slice(0, 5);
    if (funcEntries.length > 0) {
      for (const entry of funcEntries) {
        const loc = entry.line ? `:${entry.line}` : '';
        console.log(`  ${chalk.cyan('func')}  ${entry.file}${loc} → ${chalk.cyan(entry.functionName || 'anonymous')}`);
      }
      const moreFuncLevel = functionLevelCount - funcEntries.length;
      if (moreFuncLevel > 0) {
        console.log(chalk.dim(`        ... ${moreFuncLevel} more function-level`));
      }
    }
  }

  if (undefinedIntents.size > 0) {
    console.log();
    console.log(chalk.bold.yellow('UNDEFINED INTENTS'));
    console.log(chalk.dim('-'.repeat(40)));

    for (const [intent, entries] of undefinedIntents.entries()) {
      const fileLevelCount = entries.filter(e => e.location === 'file').length;
      const functionLevelCount = entries.filter(e => e.location === 'function').length;

      console.log(
        chalk.yellow(`@intent:${intent}`) +
        chalk.dim(` (${entries.length} total: ${fileLevelCount} file, ${functionLevelCount} func)`)
      );

      const displayEntries = entries.slice(0, 3);
      for (const entry of displayEntries) {
        if (entry.location === 'function') {
          console.log(`  ${chalk.dim('func')}  ${entry.file} → ${entry.functionName}`);
        } else {
          console.log(`  ${chalk.dim('file')}  ${entry.file}`);
        }
      }
      if (entries.length > 3) {
        console.log(chalk.dim(`  +-- ... ${entries.length - 3} more`));
      }
    }
  }

  console.log();
}
