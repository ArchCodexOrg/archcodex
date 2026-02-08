/**
 * @arch archcodex.cli.command.meta
 * @intent:cli-output
 *
 * Generate Claude Code hooks for ArchCodex integration.
 * Creates .claude/hooks/ scripts and .claude/settings.json.
 */
import { Command } from 'commander';
import * as path from 'node:path';
import { chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import chalk from 'chalk';
import { fileExists, ensureDir, writeFile, readFile } from '../../utils/file-system.js';
import { logger as log } from '../../utils/logger.js';
import { HOOK_FILES, HOOKS_SETTINGS } from './init-hooks-templates.js';

interface InitHooksOptions {
  force?: boolean;
  command?: string;
}

export function createInitHooksCommand(): Command {
  return new Command('init-hooks')
    .description('Generate Claude Code hooks for ArchCodex integration')
    .option('--force', 'Overwrite existing hooks')
    .option('--command <cmd>', 'Command to run archcodex (default: auto-detect)')
    .action(async (options: InitHooksOptions) => {
      try {
        await runInitHooks(options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runInitHooks(options: InitHooksOptions): Promise<void> {
  const projectRoot = process.cwd();
  const hooksDir = path.join(projectRoot, '.claude', 'hooks');
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');

  // Check if .arch/ exists
  if (!(await fileExists(path.join(projectRoot, '.arch')))) {
    log.error('No .arch/ directory found. Run "archcodex init" first.');
    process.exit(1);
  }

  // Check for existing hooks
  if (!options.force && (await fileExists(hooksDir))) {
    const hasExistingHooks = await hasArchcodexHooks(hooksDir);
    if (hasExistingHooks) {
      log.warn('ArchCodex hooks already exist in .claude/hooks/. Use --force to overwrite.');
      return;
    }
  }

  // Detect or use provided archcodex command
  const cmd = options.command || (await detectArchcodexCommand(projectRoot));

  console.log();
  console.log(chalk.bold('Initializing Claude Code hooks for ArchCodex...'));
  console.log(chalk.dim(`Using command: ${cmd}`));
  console.log();

  // Create hooks directory
  await ensureDir(hooksDir);

  // Write hook scripts
  const hookEntries = Object.entries(HOOK_FILES);
  for (const [filename, template] of hookEntries) {
    const content = template.replace(/\{\{CMD\}\}/g, cmd);
    const hookPath = path.join(hooksDir, filename);
    await writeFile(hookPath, content);
    await chmod(hookPath, 0o755);
    console.log(`  ${chalk.green('+')} .claude/hooks/${filename}`);
  }

  // Generate or merge settings.json
  await mergeSettings(settingsPath);
  console.log(`  ${chalk.green('+')} .claude/settings.json`);

  console.log();
  console.log(chalk.bold.green(`Created ${hookEntries.length} hooks and settings.json`));
  console.log();
  console.log(chalk.dim('What these hooks do:'));
  console.log(`  ${chalk.cyan('SessionStart')}     Load architectural overview at session start`);
  console.log(`  ${chalk.cyan('PreToolUse:Read')}  Auto-inject constraints when reading src/ files`);
  console.log(`  ${chalk.cyan('PreToolUse:Write')} Warn about missing @arch tags on new files`);
  console.log(`  ${chalk.cyan('PreToolUse:Edit')}  Show workflow reminders`);
  console.log(`  ${chalk.cyan('PreToolUse:Plan')}  Guide plan mode with scoped constraints`);
  console.log(`  ${chalk.cyan('PostToolUse')}      ${chalk.bold('Block')} edits with architectural violations`);
  console.log();
  console.log(chalk.dim('Next steps:'));
  console.log(`  1. Start a Claude Code session in this project`);
  console.log(`  2. Hooks will activate automatically`);
  console.log(`  3. Commit .claude/ to share with your team`);
}

async function detectArchcodexCommand(projectRoot: string): Promise<string> {
  // Try global/PATH install (safe: no user input, no shell)
  try {
    execFileSync('which', ['archcodex'], { stdio: 'ignore' });
    return 'archcodex';
  } catch { /* not in PATH */ }

  // Try local node_modules
  const localBin = path.join(projectRoot, 'node_modules', '.bin', 'archcodex');
  if (await fileExists(localBin)) {
    return 'npx archcodex';
  }

  // Fallback
  return 'npx archcodex';
}

async function hasArchcodexHooks(hooksDir: string): Promise<boolean> {
  for (const filename of Object.keys(HOOK_FILES)) {
    if (await fileExists(path.join(hooksDir, filename))) {
      return true;
    }
  }
  return false;
}

async function mergeSettings(settingsPath: string): Promise<void> {
  let settings: Record<string, unknown> = {};

  // Read existing settings if present
  if (await fileExists(settingsPath)) {
    try {
      const content = await readFile(settingsPath);
      settings = JSON.parse(content);
    } catch { /* settings.json missing or malformed, start fresh */
      log.warn('Existing .claude/settings.json was malformed, creating new one');
      settings = {};
    }
  }

  // Replace hooks section (we own all archcodex hooks)
  settings.hooks = HOOKS_SETTINGS;

  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}
