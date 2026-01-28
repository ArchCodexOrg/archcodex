/**
 * @arch archcodex.cli.command.complex
 * @intent:cli-output
 */
import { Command } from 'commander';
import * as path from 'node:path';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry, loadPartialRegistry, loadRegistryFromFiles, getRegistryContent } from '../../core/registry/loader.js';
import { ValidationEngine } from '../../core/validation/engine.js';
import { JsonFormatter, HumanFormatter, CompactFormatter } from '../formatters/index.js';
import { globFiles, readFile } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';
import { logger } from '../../utils/logger.js';
import { getStagedFiles } from '../../utils/git.js';
import { createPathMatcher, hasPatternConfig } from '../../utils/path-matcher.js';
import type { BatchValidationResult } from '../../core/validation/types.js';
import type { ProjectBatchValidationResult } from '../../core/validation/project-validator.js';
import { FeedbackStore } from '../../core/feedback/store.js';
import { detectDuplicates } from '../../core/similarity/index.js';
import { loadPatternRegistry } from '../../core/patterns/loader.js';
import { CacheManager, type CacheStats } from '../../core/cache/index.js';
import {
  printDuplicateWarnings,
  parseThreshold,
  mergePrecommitSettings,
  getExitCodeWithThresholds,
  runProjectValidation,
  findAlternativeArchitectures,
} from './check-helpers.js';

/**
 * Create the check command.
 */
export function createCheckCommand(): Command {
  return new Command('check')
    .description('Validate files against architecture rules')
    .argument('[files...]', 'Files or glob patterns to validate')
    .option('--json', 'Output in JSON format')
    .option('--format <format>', 'Output format: human, json, or compact', 'human')
    .option('--strict', 'Treat warnings as errors')
    .option('--quiet', 'Suppress non-essential output')
    .option('--verbose', 'Show detailed output')
    .option('--show-all', 'Show all files including passing (by default only warnings/errors shown)')
    .option('--severity <level>', 'Only check specific severity (error or warning)')
    .option('--errors-only', 'Only show errors in output (still runs all checks)')
    .option('--config <path>', 'Path to config file')
    .option('--precommit', 'Use pre-commit settings from config')
    .option('--max-errors <n>', 'Fail if errors exceed this threshold (null=no limit)', parseThreshold)
    .option('--max-warnings <n>', 'Fail if warnings exceed this threshold (null=no limit)', parseThreshold)
    .option('--staged', 'Only check git staged files')
    .option('--include <patterns...>', 'Include patterns for gradual adoption')
    .option('--exclude <patterns...>', 'Exclude patterns for gradual adoption')
    .option('--project', 'Enable project-level validation (cross-file constraints)')
    .option('--record-violations', 'Record violations to .arch/feedback.json for analysis')
    .option('--detect-duplicates', 'Warn about files with similar structure (potential duplication)')
    .option('--similarity-threshold <n>', 'Similarity threshold for duplicate detection (0-1)', '0.7')
    .option('--no-cache', 'Disable validation caching (cache enabled by default with --project)')
    .option('--incremental', 'Only validate changed files and their dependents (requires --project)')
    .option('--registry <path>', 'Path to registry file or directory (overrides default)')
    .option('--registry-pattern <patterns...>', 'Load only matching registry patterns (e.g., "cli/**")')
    .action(async (filePatterns: string[], options) => {
      try {
        const projectRoot = process.cwd();

        // Load configuration
        const config = await loadConfig(projectRoot, options.config);

        // Merge precommit settings from config with CLI options
        const precommitConfig = options.precommit ? config.validation.precommit : undefined;
        const effectiveSettings = mergePrecommitSettings(precommitConfig, options);

        // Load registry (supports custom path, partial loading, or default)
        let registry;
        try {
          if (options.registryPattern && options.registryPattern.length > 0) {
            // Partial loading - only matching patterns
            registry = await loadPartialRegistry(projectRoot, options.registryPattern);
            if (!options.quiet) {
              logger.info(`Loaded partial registry: ${options.registryPattern.join(', ')}`);
            }
          } else if (options.registry) {
            // Custom registry path
            const registryPath = path.resolve(projectRoot, options.registry);
            if (registryPath.endsWith('.yaml') || registryPath.endsWith('.yml')) {
              // Single file - auto-resolve dependencies if in a registry directory
              const registryDir = path.resolve(projectRoot, '.arch/registry');
              const inRegistryDir = registryPath.startsWith(registryDir);
              registry = await loadRegistryFromFiles([registryPath], {
                resolveDependencies: inRegistryDir,
                registryDir: inRegistryDir ? registryDir : undefined,
              });
              if (!options.quiet && inRegistryDir) {
                logger.info(`Loaded registry with dependency resolution: ${options.registry}`);
              }
            } else {
              // Directory or pattern
              registry = await loadRegistry(projectRoot, options.registry);
            }
          } else {
            // Default loading
            registry = await loadRegistry(projectRoot);
          }
        } catch (error) {
          if (!options.quiet) {
            logger.error(
              'Failed to load registry. Make sure .arch/registry/ directory or .arch/registry file exists.',
              error instanceof Error ? error : undefined
            );
          }
          process.exit(1);
        }

        // Load archignore and pattern registry in parallel
        const [archIgnore, patternRegistry] = await Promise.all([
          loadArchIgnore(projectRoot),
          loadPatternRegistry(projectRoot),
        ]);

        // Get files to check
        let allFiles: string[];

        if (effectiveSettings.onlyStagedFiles) {
          // Only check staged files
          const stagedFiles = await getStagedFiles(projectRoot);
          allFiles = stagedFiles.filter(f => /\.(ts|tsx|js|jsx|py|go)$/.test(f));
        } else if (filePatterns.length === 0) {
          // Default: use patterns from config.files.scan (configurable)
          const scanPatterns = config.files.scan;
          allFiles = await globFiles(scanPatterns.include, {
            cwd: projectRoot,
            absolute: false,
            ignore: scanPatterns.exclude,
          });
        } else {
          allFiles = await resolveFilePatterns(filePatterns, projectRoot);
        }

        // Apply archignore filter
        let files = archIgnore.filter(allFiles);

        // Apply include/exclude patterns if configured
        if (hasPatternConfig(effectiveSettings.include, effectiveSettings.exclude)) {
          const matcher = createPathMatcher(effectiveSettings.include, effectiveSettings.exclude);
          files = matcher.filter(files);
        }

        if (files.length === 0) {
          if (!options.quiet) {
            logger.warn('No files found matching the given patterns.');
          }
          process.exit(0);
        }

        const ignoredCount = allFiles.length - files.length;
        const format = effectiveSettings.outputFormat;
        if (!options.quiet && format !== 'json' && format !== 'compact') {
          if (ignoredCount > 0) {
            logger.info(`Validating ${files.length} file(s)... (${ignoredCount} ignored)`);
          } else {
            logger.info(`Validating ${files.length} file(s)...`);
          }
        }

        // Validate --incremental requires --project
        if (options.incremental && !options.project) {
          logger.error('--incremental requires --project flag');
          process.exit(1);
        }

        // Determine severity filter
        const severities = options.severity
          ? [options.severity as 'error' | 'warning']
          : undefined;

        // Setup caching (enabled by default with --project, disabled with --no-cache)
        const useCache = options.project && options.cache !== false;
        let cacheManager: CacheManager | undefined;
        let cacheStats: CacheStats | undefined;

        if (useCache) {
          try {
            // Load config and registry content for checksum
            const configPath = `${projectRoot}/.arch/config.yaml`;
            const registryContent = await getRegistryContent(projectRoot);
            const configContent = await readFile(configPath).catch(() => '');

            cacheManager = new CacheManager(projectRoot, registryContent, configContent);
            await cacheManager.load();
          } catch {
            // Cache loading failed, continue without cache
            cacheManager = undefined;
          }
        }

        // Validate files - use ProjectValidator for cross-file constraints
        let result: BatchValidationResult | ProjectBatchValidationResult;
        let projectStats: ProjectBatchValidationResult['projectStats'] | undefined;
        let incrementalStats: { changed: number; dependents: number } | undefined;

        if (options.project) {
          // Project-level validation with caching and incremental support
          const flowResult = await runProjectValidation({
            projectRoot, config, registry, patternRegistry, files, effectiveSettings, cacheManager,
            incremental: options.incremental ?? false,
            strict: options.strict,
            severities,
            archIgnore,
          });
          result = flowResult.result;
          projectStats = flowResult.projectStats;
          incrementalStats = flowResult.incrementalStats;
          cacheStats = flowResult.cacheStats;
        } else {
          // Standard single-file validation (no caching for non-project mode)
          const engine = new ValidationEngine(projectRoot, config, registry, patternRegistry);
          result = await engine.validateFiles(files, {
            strict: options.strict,
            severities,
          });
          engine.dispose();
        }

        // Format output
        const formatter = createFormatter(format, options);
        console.log(formatter.formatBatch(result));

        // Show alternative architecture suggestions for files with violations
        if (!options.quiet && format === 'human') {
          const humanFormatter = formatter as import('../formatters/human.js').HumanFormatter;
          for (const vr of result.results) {
            if (vr.archId && vr.violations.length > 0) {
              const violatedRules = [...new Set(vr.violations.map(v => v.rule))];
              const suggestions = findAlternativeArchitectures(registry, vr.archId, violatedRules);
              if (suggestions.length > 0) {
                console.log(`\n   ${vr.file}:`);
                console.log(humanFormatter.formatSuggestions(vr.archId, suggestions));
              }
            }
          }
        }

        // Show project stats if available
        if (projectStats && !options.quiet && format === 'human') {
          console.log('');
          let statsLine = `Project analysis: ${projectStats.filesInGraph} files, ${projectStats.cyclesDetected} cycles detected (${projectStats.graphBuildTimeMs.toFixed(0)}ms)`;
          if (incrementalStats) {
            statsLine += ` | Incremental: ${incrementalStats.changed} changed, ${incrementalStats.dependents} dependents`;
          } else if (cacheStats) {
            statsLine += ` | Cache: ${cacheStats.hits} hits, ${cacheStats.misses + cacheStats.invalidated} validated`;
          }
          console.log(statsLine);

          // Show cycle details if cycles detected
          if (projectStats.cycles && projectStats.cycles.length > 0) {
            console.log('');
            console.log('  \x1b[31mCycles:\x1b[0m');
            const maxCycles = 5;
            for (const cycle of projectStats.cycles.slice(0, maxCycles)) {
              const formatted = cycle.files.map((f, i) => {
                const name = path.relative(projectRoot, f);
                const arch = cycle.archIds[i];
                return arch ? `${name} (${arch})` : name;
              }).join(' \u2192 ');
              console.log(`    ${formatted}`);
            }
            if (projectStats.cycles.length > maxCycles) {
              console.log(`    ... and ${projectStats.cycles.length - maxCycles} more`);
            }
          }
        }

        // Show package boundary violations if any
        const projectResult = result as ProjectBatchValidationResult;
        if (projectResult.packageViolations?.length && !options.quiet) {
          if (format === 'human') {
            console.log('\n\x1b[31m\x1b[1mPackage Boundary Violations:\x1b[0m');
            for (const v of projectResult.packageViolations) {
              console.log(`  \x1b[31m✗\x1b[0m ${v.sourceFile}: ${v.message} (imports: ${v.importedFile})`);
            }
          } else if (format === 'compact') {
            for (const v of projectResult.packageViolations) {
              console.log(`\x1b[31m✗ PKG\x1b[0m ${v.sourceFile}: ${v.message}`);
            }
          }
        }

        // Show layer boundary violations if any
        if (projectResult.layerViolations?.length && !options.quiet) {
          if (format === 'human') {
            console.log('\n\x1b[31m\x1b[1mLayer Boundary Violations:\x1b[0m');
            for (const v of projectResult.layerViolations) {
              console.log(`  \x1b[31m✗\x1b[0m ${v.sourceFile}: ${v.message}`);
              console.log(`    imports: ${v.importedFile}`);
            }
          } else if (format === 'compact') {
            for (const v of projectResult.layerViolations) {
              console.log(`\x1b[31m✗ LYR\x1b[0m ${v.sourceFile}: ${v.message}`);
            }
          }
        }

        // Show coverage gaps if any
        if (projectResult.coverageGaps?.length && !options.quiet) {
          if (format === 'human') {
            console.log('\n\x1b[31m\x1b[1mCoverage Gaps:\x1b[0m');
            for (const g of projectResult.coverageGaps) {
              console.log(`  \x1b[31m✗\x1b[0m "${g.value}" - no handler found`);
              console.log(`    source: ${g.sourceFile}:${g.sourceLine}`);
              console.log(`    expected in: ${g.expectedIn}`);
            }
            if (projectResult.coverageStats) {
              const stats = projectResult.coverageStats;
              console.log(`\n  Coverage: ${stats.coveredSources}/${stats.totalSources} (${stats.coveragePercent.toFixed(1)}%)`);
            }
          } else if (format === 'compact') {
            for (const g of projectResult.coverageGaps) {
              console.log(`\x1b[31m✗ COV\x1b[0m "${g.value}" missing handler (${g.sourceFile})`);
            }
          }
        }

        // Detect duplicates if requested
        if (options.detectDuplicates && files.length > 1 && !options.quiet) {
          const threshold = parseFloat(options.similarityThreshold) || 0.7;
          if (format !== 'json') logger.info(`Analyzing ${files.length} files for duplicates...`);
          const dupeWarnings = await detectDuplicates(projectRoot, files, threshold);
          if (dupeWarnings.length > 0) {
            printDuplicateWarnings(dupeWarnings, format);
          }
        }

        // Record violations if requested
        if (options.recordViolations) {
          const feedbackStore = new FeedbackStore(projectRoot);
          const recordedCount = await feedbackStore.recordViolations(result.results);
          if (!options.quiet && format !== 'json') {
            logger.info(`Recorded ${recordedCount} violation(s) to .arch/feedback.json`);
          }
        }

        // Exit with appropriate code
        const exitCode = getExitCodeWithThresholds(
          result.summary,
          config.validation.exit_codes,
          effectiveSettings.maxErrors,
          effectiveSettings.maxWarnings
        );
        process.exit(exitCode);
      } catch (error) {
        if (!options.quiet) {
          logger.error(
            'Validation failed',
            error instanceof Error ? error : undefined
          );
        }
        process.exit(1);
      }
    });
}

/** Resolve file patterns to paths. */
async function resolveFilePatterns(patterns: string[], projectRoot: string): Promise<string[]> {
  const allFiles: string[] = [];
  for (const pattern of patterns) {
    if (pattern.includes('*') || pattern.includes('?')) {
      allFiles.push(...await globFiles(pattern, { cwd: projectRoot, absolute: false }));
    } else {
      // Convert absolute paths to relative paths
      const filePath = path.isAbsolute(pattern)
        ? path.relative(projectRoot, pattern)
        : pattern;
      allFiles.push(filePath);
    }
  }
  return [...new Set(allFiles)].filter(f => /\.(ts|tsx|js|jsx|py|go)$/.test(f));
}

/** Create formatter based on output format. */
function createFormatter(format: 'human' | 'json' | 'compact', options: Record<string, unknown>) {
  const showPassing = !!(options.showAll || options.verbose);
  const errorsOnly = !!(options.errorsOnly);
  switch (format) {
    case 'json':
      return new JsonFormatter({ errorsOnly });
    case 'compact':
      return new CompactFormatter({ colors: !options.quiet, errorsOnly });
    default:
      return new HumanFormatter({
        colors: !options.quiet,
        verbose: options.verbose as boolean,
        showPassing,
        errorsOnly,
      });
  }
}
