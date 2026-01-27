/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handlers for health and analysis operations (health, sync-index, consistency, types).
 */
import { resolve } from 'path';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry, getRegistryContent } from '../../core/registry/loader.js';
import { HealthAnalyzer } from '../../core/health/analyzer.js';
import { SimilarityAnalyzer } from '../../core/similarity/index.js';
import { checkIndexStaleness } from '../../core/discovery/index.js';
import { reindexAll } from '../../llm/reindexer.js';
import { globFiles } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';
import { isProjectInitialized, findNearbyProject } from '../utils.js';

// ============================================================================
// HEALTH HANDLER
// ============================================================================

export async function handleHealth(projectRoot: string, expiringDays?: number) {
  try {
    // Validate project is initialized before proceeding
    const isInitialized = await isProjectInitialized(projectRoot);
    if (!isInitialized) {
      // Try to find a nearby project to suggest
      const nearbyProject = await findNearbyProject(projectRoot);

      return {
        content: [{
          type: 'text',
          text: `Error: Project not initialized with ArchCodex.\n\n` +
            `Project root: ${projectRoot}\n` +
            `Expected .arch/ directory not found.\n\n` +
            (nearbyProject
              ? `Found nearby project: ${nearbyProject}\n` +
                `Use: archcodex_health with projectRoot="${nearbyProject}"\n\n`
              : `To initialize this project, run:\n` +
                `  cd ${projectRoot}\n` +
                `  archcodex init\n\n`) +
            `Or provide the correct project root using the projectRoot parameter.`,
        }],
        isError: true,
      };
    }

    const config = await loadConfig(projectRoot);
    const analyzer = new HealthAnalyzer(projectRoot, config);
    const health = await analyzer.analyze({ expiringDays: expiringDays ?? 30 });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(health, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [{
        type: 'text',
        text: `Error getting health metrics: ${errorMessage}\n\n` +
          `Project root: ${projectRoot}\n\n` +
          `Try checking:\n` +
          `  1. Is the project root correct? Use projectRoot parameter if needed.\n` +
          `  2. Does .arch/ directory exist and contain valid files?\n` +
          `  3. Run: archcodex health from the command line for more details.`,
      }],
      isError: true,
    };
  }
}

// ============================================================================
// SYNC-INDEX HANDLER
// ============================================================================

export async function handleSyncIndex(projectRoot: string, checkOnly?: boolean, force?: boolean) {
  try {
    // Validate project is initialized before proceeding
    const isInitialized = await isProjectInitialized(projectRoot);
    if (!isInitialized) {
      // Try to find a nearby project to suggest
      const nearbyProject = await findNearbyProject(projectRoot);

      return {
        content: [{
          type: 'text',
          text: `Error: Project not initialized with ArchCodex.\n\n` +
            `Project root: ${projectRoot}\n` +
            `Expected .arch/ directory not found.\n\n` +
            (nearbyProject
              ? `Found nearby project: ${nearbyProject}\n` +
                `Use: archcodex_sync_index with projectRoot="${nearbyProject}"\n\n`
              : `To initialize this project, run:\n` +
                `  cd ${projectRoot}\n` +
                `  archcodex init\n\n`) +
            `Or provide the correct project root using the projectRoot parameter.`,
        }],
        isError: true,
      };
    }

    // Default to check-only mode for safety
    const isCheckOnly = checkOnly !== false;

    const staleness = await checkIndexStaleness(projectRoot);

    if (isCheckOnly || (!staleness.isStale && !force)) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            isStale: staleness.isStale,
            reason: staleness.reason,
            missingArchIds: staleness.missingArchIds,
            message: staleness.isStale
              ? 'Index is stale. Set check=false to update.'
              : 'Index is up to date.',
          }, null, 2),
        }],
      };
    }

    // Sync the index
    const registryContent = await getRegistryContent(projectRoot);
    const registry = await loadRegistry(projectRoot);

    const indexPath = resolve(projectRoot, '.arch/index.yaml');
    const summary = await reindexAll(registry, indexPath, {
      auto: true,
      registryContent,
    });

    const count = summary.results.filter(r => r.keywords.length > 0).length;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          updated: true,
          architecturesIndexed: count,
          previouslyMissing: staleness.missingArchIds,
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [{
        type: 'text',
        text: `Error syncing index: ${errorMessage}\n\n` +
          `Project root: ${projectRoot}\n\n` +
          `Try checking:\n` +
          `  1. Is the project root correct? Use projectRoot parameter if needed.\n` +
          `  2. Does .arch/ directory exist and contain valid files?\n` +
          `  3. Run: archcodex sync-index from the command line for more details.`,
      }],
      isError: true,
    };
  }
}

// ============================================================================
// CONSISTENCY HANDLER
// ============================================================================

export interface ConsistencyOptions {
  threshold?: number;
  sameArchOnly?: boolean;
}

export async function handleConsistency(projectRoot: string, file: string, options: ConsistencyOptions = {}) {
  const config = await loadConfig(projectRoot);
  const archIgnore = await loadArchIgnore(projectRoot);

  // Get all TS/TSX files in the project (or use configured scan patterns)
  const scanPatterns = config.files.scan;
  let allFiles = await globFiles(scanPatterns.include, {
    cwd: projectRoot,
    absolute: false,
    ignore: scanPatterns.exclude,
  });
  allFiles = archIgnore.filter(allFiles);

  const analyzer = new SimilarityAnalyzer(projectRoot);
  try {
    const issues = await analyzer.findInconsistencies(file, allFiles, {
      threshold: options.threshold ?? 0.6,
      sameArchOnly: options.sameArchOnly ?? true,
      minDiff: 1,
    });

    // Format output for LLM consumption
    const formattedIssues = issues.map(issue => ({
      comparedTo: issue.referenceFile,
      similarity: Math.round(issue.similarity * 100) + '%',
      archId: issue.archId,
      missing: {
        methods: issue.missing.methods,
        exports: issue.missing.exports,
      },
      extra: {
        methods: issue.extra.methods,
        exports: issue.extra.exports,
      },
      suggestion: formatConsistencySuggestion(issue),
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          file,
          peerFilesAnalyzed: allFiles.length - 1,
          issuesFound: issues.length,
          issues: formattedIssues,
        }, null, 2),
      }],
    };
  } finally {
    analyzer.dispose();
  }
}

function formatConsistencySuggestion(issue: { referenceFile: string; missing: { methods: string[]; exports: string[] }; extra: { methods: string[]; exports: string[] } }): string | undefined {
  const suggestions: string[] = [];

  if (issue.missing.methods.length > 0) {
    suggestions.push(`Consider adding methods: ${issue.missing.methods.join(', ')} (present in ${issue.referenceFile})`);
  }
  if (issue.missing.exports.length > 0) {
    suggestions.push(`Consider adding exports: ${issue.missing.exports.join(', ')} (present in ${issue.referenceFile})`);
  }
  if (issue.extra.methods.length > 0 && issue.missing.methods.length === 0) {
    suggestions.push(`Has additional methods not in ${issue.referenceFile}: ${issue.extra.methods.join(', ')} - this may be intentional`);
  }

  return suggestions.length > 0 ? suggestions.join('. ') : undefined;
}

// ============================================================================
// TYPES HANDLER
// ============================================================================

export interface TypesToolOptions {
  files?: string[];
  threshold?: number;
  includePrivate?: boolean;
}

export async function handleTypes(projectRoot: string, options: TypesToolOptions = {}) {
  const { DuplicateDetector } = await import('../../core/types/duplicate-detector.js');

  const config = await loadConfig(projectRoot);
  const archIgnore = await loadArchIgnore(projectRoot);

  // Resolve files
  let filePaths: string[];
  if (options.files && options.files.length > 0) {
    filePaths = [];
    for (const pattern of options.files) {
      const matches = await globFiles(pattern, {
        cwd: projectRoot,
        absolute: false,
      });
      filePaths.push(...matches);
    }
  } else {
    const patterns = config.files?.scan?.include || ['**/*.ts', '**/*.tsx'];
    const exclude = config.files?.scan?.exclude || ['**/node_modules/**', '**/dist/**'];

    filePaths = [];
    for (const pattern of patterns) {
      const matches = await globFiles(pattern, {
        cwd: projectRoot,
        absolute: false,
        ignore: exclude,
      });
      filePaths.push(...matches);
    }
  }

  // Filter by archignore and TypeScript files
  filePaths = archIgnore.filter(filePaths);
  filePaths = filePaths.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

  if (filePaths.length === 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'No TypeScript files found to analyze' }, null, 2),
      }],
    };
  }

  // Run detector
  const threshold = (options.threshold ?? 80) / 100;
  const detector = new DuplicateDetector(projectRoot, {
    similarityThreshold: threshold,
    minProperties: 2,
    exportedOnly: !options.includePrivate,
    skipImplementations: true,
  });

  try {
    const report = await detector.scanFiles(filePaths);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalTypes: report.totalTypes,
          exactDuplicates: report.exactDuplicates,
          renamedDuplicates: report.renamedDuplicates,
          similarTypes: report.similarTypes,
          groups: report.groups.slice(0, 20).map(g => ({
            canonical: {
              name: g.canonical.name,
              file: g.canonical.file,
              line: g.canonical.line,
              kind: g.canonical.kind,
            },
            duplicates: g.duplicates.map(d => ({
              name: d.type.name,
              file: d.type.file,
              line: d.type.line,
              matchType: d.matchType,
              similarity: Math.round(d.similarity * 100) + '%',
              missingProperties: d.missingProperties,
              extraProperties: d.extraProperties,
            })),
            suggestion: g.suggestion,
          })),
          truncated: report.groups.length > 20 ? report.groups.length - 20 : 0,
        }, null, 2),
      }],
    };
  } finally {
    detector.dispose();
  }
}
