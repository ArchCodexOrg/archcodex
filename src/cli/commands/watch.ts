/**
 * @arch archcodex.cli.command.complex
 * @intent:cli-output
 */
import { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import chokidar from 'chokidar';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry, getRegistryFilePath, getRegistryDirPath } from '../../core/registry/loader.js';
import { ValidationEngine } from '../../core/validation/engine.js';
import { loadArchIgnore } from '../../utils/archignore.js';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { fileExists } from '../../utils/file-system.js';
import { logger as log } from '../../utils/logger.js';
import { CACHE_PATH } from '../../core/cache/types.js';
import type { ValidationResult } from '../../core/validation/types.js';
import type { Config } from '../../core/config/schema.js';
import type { Registry } from '../../core/registry/schema.js';

interface WatchOptions {
  config?: string;
  clear?: boolean;
  debounce?: string;
}

/**
 * Create the watch command.
 */
export function createWatchCommand(): Command {
  return new Command('watch')
    .description('Watch files and re-validate on changes')
    .argument('[patterns...]', 'File patterns to watch (default: uses config.files.scan patterns)')
    .option('-c, --config <path>', 'Path to config file')
    .option('--clear', 'Clear terminal between runs')
    .option('--debounce <ms>', 'Debounce delay in milliseconds', '300')
    .action(async (patterns: string[], options: WatchOptions) => {
      try {
        await runWatch(patterns.length > 0 ? patterns : undefined, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runWatch(patterns: string[] | undefined, options: WatchOptions): Promise<void> {
  const projectRoot = process.cwd();
  const parsedDebounce = parseInt(options.debounce || '300', 10);
  const debounceMs = isNaN(parsedDebounce) || parsedDebounce < 0 ? 300 : parsedDebounce;

  // Load configuration and registry (mutable to allow reloading)
  let config: Config = await loadConfig(projectRoot, options.config);
  let registry: Registry = await loadRegistry(projectRoot);
  let archIgnore = await loadArchIgnore(projectRoot);

  // Use config patterns if none provided
  const watchPatterns = patterns ?? config.files?.scan?.include ?? ['**/*.ts', '**/*.tsx'];

  // Create validation engine (mutable to allow recreation)
  let engine = new ValidationEngine(projectRoot, config, registry);

  // Get registry paths for watching
  const registryFilePath = path.relative(projectRoot, getRegistryFilePath(projectRoot));
  const registryDirPath = path.relative(projectRoot, getRegistryDirPath(projectRoot));
  const configFilePath = '.arch/config.yaml';

  console.log();
  console.log(chalk.bold.cyan('ArchCodex Watch Mode'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim(`Watching: ${watchPatterns.join(', ')}`));
  console.log(chalk.dim(`Registry: ${registryFilePath}, ${registryDirPath}/**/*.yaml`));
  console.log(chalk.dim(`Config:   ${configFilePath}`));
  console.log(chalk.dim(`Debounce: ${debounceMs}ms`));
  console.log(chalk.dim('Press Ctrl+C to stop'));
  console.log();

  // Track pending validations for debouncing
  const pendingFiles = new Map<string, ReturnType<typeof setTimeout>>();

  // Track if ready message has been shown (chokidar fires ready per pattern)
  let fileWatcherReady = false;
  let registryWatcherReady = false;

  // Chokidar v4+ removed glob support, so we need to:
  // 1. Watch source directories directly
  // 2. Filter events using fast-glob's micromatch
  const watchDirs = ['src', 'lib', 'app', 'pages', 'components'].filter(dir => {
    return existsSync(path.join(projectRoot, dir));
  });

  // If no standard dirs found, watch current directory
  if (watchDirs.length === 0) {
    watchDirs.push('.');
  }

  // Create a matcher function for the watch patterns
  const isMatchingFile = (filePath: string): boolean => {
    // Check extension first (most common filter)
    const ext = path.extname(filePath);
    if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.go'].includes(ext)) return false;
    if (filePath.endsWith('.d.ts')) return false;

    // Check if file should be ignored
    if (archIgnore.ignores(filePath)) return false;

    // Check if file matches any watch pattern (simple glob-to-regex)
    const matches = watchPatterns.some(pattern => {
      // Convert glob pattern to regex:
      // 1. Escape dots first
      // 2. Replace ** with a placeholder, then * with [^/]*, then restore **
      const regex = new RegExp(
        '^' + pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '\0GLOBSTAR\0')  // Placeholder for **
          .replace(/\*/g, '[^/]*')
          .replace(/\0GLOBSTAR\0/g, '.*')    // Restore ** as .*
          .replace(/\?/g, '.') + '$'
      );
      return regex.test(filePath);
    });

    return matches;
  };

  const watcher = chokidar.watch(watchDirs.map(d => path.join(projectRoot, d)), {
    ignored: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
    ],
    ignoreInitial: true,
    persistent: true,
    usePolling: true,  // Use polling to avoid EMFILE errors
    interval: 500,     // Check every 500ms
    binaryInterval: 1000,
  });

  const validateFileWithContext = async (filePath: string): Promise<void> => {
    // Check if file should be ignored
    if (archIgnore.ignores(filePath)) {
      return;
    }

    if (options.clear) {
      console.clear();
      console.log(chalk.bold.cyan('ArchCodex Watch Mode'));
      console.log(chalk.dim('─'.repeat(50)));
    }

    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.dim(`[${timestamp}]`), chalk.yellow('Validating:'), filePath);

    try {
      const results = await engine.validateFiles([filePath]);

      if (results.results.length > 0) {
        printValidationResult(filePath, results.results[0]);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(chalk.red('  ✗ Error:'), errorMessage);
    }

    console.log();
  };

  const scheduleValidation = (filePath: string): void => {
    // Clear any existing timeout for this file
    const existing = pendingFiles.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule new validation with proper async handling
    const timeout = setTimeout(() => {
      pendingFiles.delete(filePath);
      // Wrap async call to catch any unhandled rejections
      validateFileWithContext(filePath).catch((err) => {
        log.error(`Async validation error for ${filePath}: ${err instanceof Error ? err.message : 'Unknown'}`);
      });
    }, debounceMs);

    pendingFiles.set(filePath, timeout);
  };

  // Handle file changes
  watcher
    .on('ready', () => {
      if (fileWatcherReady) return;
      fileWatcherReady = true;
      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.dim(`[${timestamp}]`), chalk.green('✓ Watching for file changes...'));
      console.log();
    })
    .on('change', (filePath) => {
      // Convert to relative path for matching
      const relativePath = path.relative(projectRoot, filePath);
      if (!isMatchingFile(relativePath)) return;

      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.dim(`[${timestamp}]`), chalk.blue('Change detected:'), relativePath);
      scheduleValidation(relativePath);
    })
    .on('add', (filePath) => {
      // Convert to relative path for matching
      const relativePath = path.relative(projectRoot, filePath);
      if (!isMatchingFile(relativePath)) return;

      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.dim(`[${timestamp}]`), chalk.blue('File added:'), relativePath);
      scheduleValidation(relativePath);
    })
    .on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.error(`Watcher error: ${message}`);
    });

  // Watch registry and config files for cache invalidation
  // Chokidar v4+ doesn't support globs, so watch the directory directly
  const registryWatchPaths = [
    path.join(projectRoot, registryFilePath),
    path.join(projectRoot, registryDirPath),  // Watch directory, filter by extension
    path.join(projectRoot, configFilePath),
  ].filter(p => existsSync(p));

  const registryWatcher = chokidar.watch(registryWatchPaths, {
    ignoreInitial: true,
    persistent: true,
    usePolling: true,
    interval: 500,
  });

  let registryReloadTimeout: ReturnType<typeof setTimeout> | null = null;

  const handleRegistryChange = async (changedFile: string): Promise<void> => {
    const timestamp = new Date().toLocaleTimeString();
    const isConfig = changedFile.endsWith('config.yaml');
    const fileType = isConfig ? 'Config' : 'Registry';

    console.log(chalk.dim(`[${timestamp}]`), chalk.magenta(`${fileType} changed:`), changedFile);

    // Clear validation cache
    const cachePath = path.join(projectRoot, CACHE_PATH);
    if (await fileExists(cachePath)) {
      await unlink(cachePath);
      console.log(chalk.dim(`[${timestamp}]`), chalk.cyan('Cache cleared'));
    }

    // Reload config, registry, and recreate engine
    try {
      config = await loadConfig(projectRoot, options.config);
      registry = await loadRegistry(projectRoot);
      archIgnore = await loadArchIgnore(projectRoot);

      // Dispose old engine and create new one
      engine.dispose();
      engine = new ValidationEngine(projectRoot, config, registry);

      console.log(chalk.dim(`[${timestamp}]`), chalk.green('✓ Reloaded registry and config'));
      console.log();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(chalk.dim(`[${timestamp}]`), chalk.red('✗ Reload failed:'), errorMessage);
      console.log();
    }
  };

  registryWatcher
    .on('ready', () => {
      if (registryWatcherReady) return;
      registryWatcherReady = true;
      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.dim(`[${timestamp}]`), chalk.green('✓ Watching registry/config...'));
      console.log();
    })
    .on('change', (filePath) => {
      // Debounce registry reloads
      if (registryReloadTimeout) {
        clearTimeout(registryReloadTimeout);
      }
      registryReloadTimeout = setTimeout(() => {
        registryReloadTimeout = null;
        handleRegistryChange(filePath).catch((err) => {
          log.error(`Registry reload error: ${err instanceof Error ? err.message : 'Unknown'}`);
        });
      }, debounceMs);
    })
    .on('add', (filePath) => {
      // New registry file added
      if (registryReloadTimeout) {
        clearTimeout(registryReloadTimeout);
      }
      registryReloadTimeout = setTimeout(() => {
        registryReloadTimeout = null;
        handleRegistryChange(filePath).catch((err) => {
          log.error(`Registry reload error: ${err instanceof Error ? err.message : 'Unknown'}`);
        });
      }, debounceMs);
    })
    .on('unlink', (filePath) => {
      // Registry file deleted
      if (registryReloadTimeout) {
        clearTimeout(registryReloadTimeout);
      }
      registryReloadTimeout = setTimeout(() => {
        registryReloadTimeout = null;
        handleRegistryChange(filePath).catch((err) => {
          log.error(`Registry reload error: ${err instanceof Error ? err.message : 'Unknown'}`);
        });
      }, debounceMs);
    })
    .on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.error(`Registry watcher error: ${message}`);
    });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log();
    console.log(chalk.dim('Stopping watch mode...'));
    watcher.close();
    registryWatcher.close();
    engine.dispose();
    process.exit(0);
  });
}

function printValidationResult(_filePath: string, result: ValidationResult): void {
  const archId = result.archId;

  if (result.status === 'pass') {
    console.log(chalk.green('  ✓ PASS'), archId ? chalk.dim(`(${archId})`) : '');
    return;
  }

  if (result.status === 'warn') {
    console.log(chalk.yellow('  ⚠ WARN'), archId ? chalk.dim(`(${archId})`) : '');
    for (const warning of result.warnings) {
      console.log(chalk.yellow('    •'), warning.message);
    }
    return;
  }

  console.log(chalk.red('  ✗ FAIL'), archId ? chalk.dim(`(${archId})`) : '');

  for (const violation of result.violations) {
    console.log(chalk.red('    •'), violation.message);
    if (violation.fixHint) {
      console.log(chalk.dim('      Fix:'), violation.fixHint);
    }
  }

  for (const warning of result.warnings) {
    console.log(chalk.yellow('    •'), warning.message);
  }
}
