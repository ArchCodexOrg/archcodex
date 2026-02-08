/**
 * @arch archcodex.cli.command.complex
 * @intent:cli-output
 *
 * Garden command for pattern detection and index maintenance.
 */
import { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../../core/config/loader.js';
import { loadIndex } from '../../core/discovery/loader.js';
import { loadRegistry } from '../../core/registry/loader.js';
import { PatternDetector } from '../../core/garden/detector.js';
import type { KeywordSuggestion, KeywordCleanupSuggestion, TypeDuplicateReport } from '../../core/garden/types.js';
import { printGardenReport } from '../formatters/garden.js';
import { DuplicateDetector } from '../../core/types/duplicate-detector.js';
import type { DuplicateGroup } from '../../core/types/types.js';
import { globFiles, readFile, writeFile } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';
import { loadArchConfig } from '../../utils/archconfig.js';
import { extractArchId } from '../../core/arch-tag/parser.js';
import { logger } from '../../utils/logger.js';
import { parseYaml, stringifyYaml } from '../../utils/yaml.js';
import type { Index } from '../../core/discovery/index.js';
import { getAvailableProvider } from '../../llm/providers/index.js';
import { reindexArchitecture } from '../../llm/reindexer.js';
import { generateConcepts } from '../../core/discovery/concept-generator.js';

interface GardenCommandOptions {
  detectPatterns: boolean;
  checkConsistency: boolean;
  suggestKeywords: boolean;
  cleanupKeywords: boolean;
  detectTypeDuplicates: boolean;
  applyKeywords: boolean;
  applyCleanup: boolean;
  json: boolean;
  config: string;
  minClusterSize: string;
  maxKeywordUsage: string;
  semantic: boolean;
  llm: boolean;
  concepts: boolean;
}

/**
 * Create the garden command.
 */
export function createGardenCommand(): Command {
  return new Command('garden')
    .description('Analyze codebase for pattern consistency and index health')
    .option('--detect-patterns', 'Find file clusters that might need dedicated architectures', true)
    .option('--check-consistency', 'Find files with similar names but different @arch tags', true)
    .option('--suggest-keywords', 'Generate missing keywords for existing architectures', true)
    .option('--cleanup-keywords', 'Analyze existing keywords and suggest removals', true)
    .option('--detect-type-duplicates', 'Find duplicate/similar type definitions across files (slow)', false)
    .option('--no-detect-patterns', 'Skip pattern detection')
    .option('--no-check-consistency', 'Skip consistency checking')
    .option('--no-suggest-keywords', 'Skip keyword suggestions')
    .option('--no-cleanup-keywords', 'Skip keyword cleanup analysis')
    .option('--no-detect-type-duplicates', 'Skip type duplicate detection')
    .option('--apply-keywords', 'Add suggested keywords to .arch/index.yaml', false)
    .option('--apply-cleanup', 'Remove low-quality keywords from .arch/index.yaml', false)
    .option('--json', 'Output as JSON', false)
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .option('--min-cluster-size <n>', 'Minimum files to report a pattern', '2')
    .option('--max-keyword-usage <n>', 'Max architectures a keyword can appear in before being "too common"', '3')
    .option('--semantic', 'Use AST-based semantic analysis (slower but more accurate)', false)
    .option('--llm', 'Use LLM for enhanced keyword suggestions (requires configured provider)', false)
    .option('--concepts', 'Generate/update concepts.yaml using LLM (requires --llm)', false)
    .action(async (options: GardenCommandOptions) => {
      try {
        await runGarden(options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runGarden(options: GardenCommandOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Load configuration
  const config = await loadConfig(projectRoot, options.config);

  // Load discovery index
  const index = await loadIndex(projectRoot);

  // Load archignore patterns
  const archIgnore = await loadArchIgnore(projectRoot);

  // Get file patterns from config (with defaults)
  const includePatterns = config.files?.scan?.include ?? ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
  const excludePatterns = config.files?.scan?.exclude ?? [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.d.ts',
    '**/*.test.ts',
    '**/*.spec.ts',
  ];

  // Find all source files using config patterns
  const allFiles: string[] = [];
  for (const pattern of includePatterns) {
    const matches = await globFiles(pattern, {
      cwd: projectRoot,
      absolute: true,
      ignore: excludePatterns,
    });
    allFiles.push(...matches);
  }

  // Dedupe and filter by archignore
  const uniqueFiles = [...new Set(allFiles)];
  const files = uniqueFiles.filter(f => !archIgnore.ignores(path.relative(projectRoot, f)));

  // Extract @arch tags from all files
  const filesWithArch = await extractArchTags(files);

  // Read file contents if semantic analysis is requested
  let fileContents: Map<string, string> | undefined;
  if (options.semantic) {
    fileContents = new Map<string, string>();
    for (const file of files) {
      try {
        const content = await readFile(file);
        fileContents.set(file, content);
      } catch { /* file read failed, skip */ }
    }
  }

  // Run type duplicate detection if enabled (deprecated — use health --detect-type-duplicates)
  let typeDuplicates: TypeDuplicateReport[] = [];
  if (options.detectTypeDuplicates) {
    console.log(chalk.yellow('⚠ --detect-type-duplicates in garden is deprecated. Use: archcodex health --detect-type-duplicates'));
    const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
    if (tsFiles.length > 0) {
      const duplicateDetector = new DuplicateDetector(projectRoot, {
        skipImplementations: true,
      });
      const duplicateReport = await duplicateDetector.scanFiles(tsFiles);
      typeDuplicates = convertToTypeDuplicateReports(duplicateReport.groups);
      duplicateDetector.dispose();
    }
  }

  // Run pattern detection
  const detector = new PatternDetector(projectRoot, index.entries);
  const report = detector.analyze(filesWithArch, {
    detectPatterns: options.detectPatterns,
    checkConsistency: options.checkConsistency,
    suggestKeywords: options.suggestKeywords,
    cleanupKeywords: options.cleanupKeywords,
    detectTypeDuplicates: options.detectTypeDuplicates,
    fix: options.applyKeywords || options.applyCleanup,
    minClusterSize: parseInt(options.minClusterSize, 10),
    maxKeywordUsage: parseInt(options.maxKeywordUsage, 10),
    useSemanticAnalysis: options.semantic,
  }, fileContents, typeDuplicates);

  // Clean up AST resources if semantic analysis was used
  if (options.semantic) {
    detector.dispose();
  }

  // Enhance keyword suggestions with LLM if requested
  if (options.llm && options.suggestKeywords) {
    const archConfig = await loadArchConfig(projectRoot);
    const provider = getAvailableProvider(undefined, config.llm, archConfig);

    // Check if we have a real LLM provider (not prompt)
    if (provider.name !== 'prompt' && provider.isAvailable()) {
      console.log(chalk.cyan(`\n🤖 Using LLM provider: ${provider.name}`));

      // Load registry for LLM keyword generation
      const registry = await loadRegistry(projectRoot);

      // Get unique architectures that need keywords
      const archsNeedingKeywords = new Set<string>();
      for (const file of filesWithArch) {
        if (file.archId) {
          archsNeedingKeywords.add(file.archId);
        }
      }

      // Generate LLM keywords for each architecture
      let llmSuccess = 0;
      let llmErrors = 0;

      for (const archId of archsNeedingKeywords) {
        const result = await reindexArchitecture(archId, registry, {
          llmSettings: config.llm,
          archConfig,
        });

        if (result.error) {
          llmErrors++;
          if (!options.json) {
            console.log(chalk.yellow(`  ⚠ ${archId}: ${result.error}`));
          }
        } else if (result.keywords.length > 0) {
          llmSuccess++;
          // Find or create suggestion for this arch
          let suggestion = report.keywordSuggestions.find(s => s.archId === archId);
          if (suggestion) {
            // Merge LLM keywords with heuristic keywords (dedupe)
            const merged = new Set([...suggestion.suggestedKeywords, ...result.keywords]);
            suggestion.suggestedKeywords = Array.from(merged);
          } else {
            // Add new suggestion from LLM
            const indexEntry = index.entries.find(e => e.arch_id === archId);
            report.keywordSuggestions.push({
              archId,
              currentKeywords: indexEntry?.keywords || [],
              suggestedKeywords: result.keywords,
              basedOnFiles: filesWithArch.filter(f => f.archId === archId).map(f => path.relative(projectRoot, f.path)),
            });
          }
          if (!options.json) {
            console.log(chalk.green(`  ✓ ${archId}: +${result.keywords.length} keywords`));
          }
        }
      }

      // Update summary counts
      report.summary.keywordSuggestionCount = report.keywordSuggestions.length;

      if (!options.json) {
        if (llmSuccess > 0 || llmErrors > 0) {
          console.log(chalk.dim(`  LLM: ${llmSuccess} succeeded, ${llmErrors} failed\n`));
        }
      }

      // Generate/update concepts if requested
      if (options.concepts) {
        if (!options.json) console.log(chalk.cyan('\n🧠 Generating concepts from registry...'));
        const result = await generateConcepts(projectRoot, registry, provider);
        if (!options.json && result.success) {
          if (result.validation?.invalidReferences.length)
            result.validation.invalidReferences.slice(0, 5).forEach(r =>
              console.log(chalk.gray(`  ⚠ "${r.conceptName}" → unknown ${r.archId}`)));
          console.log(chalk.green(`  ✓ Generated ${result.conceptCount} concepts (${result.coverage}% coverage)`));
        } else if (!options.json) {
          console.log(chalk.yellow(`  ⚠ Failed: ${result.error}`));
        }
      }
    } else {
      console.log(chalk.yellow(`\n⚠ --llm requested but no LLM provider configured.`));
      console.log(chalk.dim(`  Set OPENAI_API_KEY or ANTHROPIC_API_KEY, or configure in .arch/config.yaml\n`));
    }
  } else if (options.concepts) {
    console.log(chalk.yellow(`\n⚠ --concepts requires --llm flag. Run: archcodex garden --llm --concepts`));
  }

  // Apply keyword suggestions if requested
  if (options.applyKeywords && report.keywordSuggestions.length > 0) {
    const applied = await applyKeywordSuggestions(projectRoot, report.keywordSuggestions);
    if (applied > 0) {
      console.log(chalk.green(`\n✓ Applied ${applied} keyword suggestions to .arch/index.yaml`));
    }
  }

  // Apply keyword cleanups if requested
  if (options.applyCleanup && report.keywordCleanups.length > 0) {
    const removed = await applyKeywordCleanups(projectRoot, report.keywordCleanups);
    if (removed > 0) {
      console.log(chalk.green(`\n✓ Removed ${removed} low-quality keywords from .arch/index.yaml`));
    }
  }

  // Output results
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printGardenReport(report, options.applyKeywords, options.applyCleanup);
  }

  // Exit with non-zero if issues found (but not if we just applied changes)
  if (report.summary.hasIssues && !options.applyKeywords && !options.applyCleanup) {
    process.exit(1);
  }
}

async function extractArchTags(
  files: string[]
): Promise<Array<{ path: string; archId: string | null }>> {
  const results: Array<{ path: string; archId: string | null }> = [];

  for (const file of files) {
    try {
      const content = await readFile(file);
      const archId = extractArchId(content);
      results.push({ path: file, archId });
    } catch { /* file read failed, mark archId as null */
      results.push({ path: file, archId: null });
    }
  }

  return results;
}

/**
 * Apply keyword suggestions to the index.yaml file.
 */
async function applyKeywordSuggestions(
  projectRoot: string,
  suggestions: KeywordSuggestion[]
): Promise<number> {
  const indexPath = path.join(projectRoot, '.arch', 'index.yaml');

  // Load current index
  let indexContent: string;
  try {
    indexContent = await readFile(indexPath);
  } catch { /* index.yaml not found */
    logger.error('Could not read .arch/index.yaml');
    return 0;
  }

  const index = parseYaml(indexContent) as Index;
  if (!index.entries) {
    index.entries = [];
  }

  let applied = 0;

  for (const suggestion of suggestions) {
    // Find or create entry for this arch_id
    let entry = index.entries.find(e => e.arch_id === suggestion.archId);

    if (!entry) {
      // Create new entry
      entry = {
        arch_id: suggestion.archId,
        keywords: [],
      };
      index.entries.push(entry);
    }

    // Ensure keywords array exists
    if (!entry.keywords) {
      entry.keywords = [];
    }

    // Add new keywords (avoiding duplicates)
    for (const keyword of suggestion.suggestedKeywords) {
      if (!entry.keywords.includes(keyword)) {
        entry.keywords.push(keyword);
        applied++;
      }
    }
  }

  // Write updated index
  if (applied > 0) {
    await writeFile(indexPath, stringifyYaml(index));
  }

  return applied;
}

/**
 * Apply keyword cleanup suggestions to the index.yaml file.
 */
async function applyKeywordCleanups(
  projectRoot: string,
  cleanups: KeywordCleanupSuggestion[]
): Promise<number> {
  const indexPath = path.join(projectRoot, '.arch', 'index.yaml');

  // Load current index
  let indexContent: string;
  try {
    indexContent = await readFile(indexPath);
  } catch { /* index.yaml not found */
    logger.error('Could not read .arch/index.yaml');
    return 0;
  }

  const index = parseYaml(indexContent) as Index;
  if (!index.entries) {
    return 0;
  }

  let removed = 0;

  for (const cleanup of cleanups) {
    const entry = index.entries.find(e => e.arch_id === cleanup.archId);
    if (!entry?.keywords) continue;

    const keywordsToRemove = new Set(
      cleanup.keywordsToRemove.map(k => k.keyword.toLowerCase())
    );

    const originalLength = entry.keywords.length;
    entry.keywords = entry.keywords.filter(
      k => !keywordsToRemove.has(k.toLowerCase())
    );
    removed += originalLength - entry.keywords.length;
  }

  // Write updated index
  if (removed > 0) {
    await writeFile(indexPath, stringifyYaml(index));
  }

  return removed;
}

/**
 * Convert DuplicateGroup[] to TypeDuplicateReport[] for garden report.
 * @deprecated Use HealthAnalyzer.analyze({ detectTypeDuplicates: true }) instead.
 */
function convertToTypeDuplicateReports(groups: DuplicateGroup[]): TypeDuplicateReport[] {
  return groups.map(group => {
    const locations = [
      { file: group.canonical.file, line: group.canonical.line, name: group.canonical.name },
      ...group.duplicates.map(d => ({
        file: d.type.file,
        line: d.type.line,
        name: d.type.name,
      })),
    ];

    // Determine match type (use the worst match type in the group)
    let matchType: 'exact' | 'renamed' | 'similar' = 'exact';
    let minSimilarity = 1;
    for (const dup of group.duplicates) {
      if (dup.matchType === 'similar') {
        matchType = 'similar';
        minSimilarity = Math.min(minSimilarity, dup.similarity);
      } else if (dup.matchType === 'renamed' && matchType !== 'similar') {
        matchType = 'renamed';
      }
    }

    return {
      name: group.canonical.name,
      matchType,
      similarity: matchType === 'similar' ? minSimilarity : undefined,
      locations,
      suggestion: group.suggestion,
    };
  });
}
