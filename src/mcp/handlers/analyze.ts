/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handler for schema-inferred analysis.
 *
 * @see spec.archcodex.analyze in .arch/specs/archcodex/analyze-engine.spec.yaml
 */
import {
  runAllAnalyses,
  formatAnalysisResult,
  type AnalysisCategory,
  type AnalysisSeverity,
} from '../../core/analysis/index.js';
import { isProjectInitialized, findNearbyProject } from '../utils.js';

// ============================================================================
// HANDLER
// ============================================================================

export interface AnalyzeOptions {
  category?: string;
  severity?: string;
  specIds?: string[];
}

const VALID_CATEGORIES: AnalysisCategory[] = [
  'logic', 'security', 'data', 'consistency', 'completeness', 'other',
];

const VALID_SEVERITIES: AnalysisSeverity[] = ['error', 'warning', 'info'];

/**
 * Handle analyze MCP tool request.
 * Runs schema-inferred analysis across spec/arch/component-group registries.
 */
export async function handleAnalyze(
  projectRoot: string,
  options: AnalyzeOptions = {},
) {
  try {
    // Validate project is initialized
    const isInitialized = await isProjectInitialized(projectRoot);
    if (!isInitialized) {
      const nearbyProject = await findNearbyProject(projectRoot);

      return {
        content: [{
          type: 'text',
          text: `Error: Project not initialized with ArchCodex.\n\n` +
            `Project root: ${projectRoot}\n` +
            `Expected .arch/ directory not found.\n\n` +
            (nearbyProject
              ? `Found nearby project: ${nearbyProject}\n` +
                `Use: archcodex_analyze with projectRoot="${nearbyProject}"\n\n`
              : `To initialize this project, run:\n` +
                `  cd ${projectRoot}\n` +
                `  archcodex init\n\n`) +
            `Or provide the correct project root using the projectRoot parameter.`,
        }],
        isError: true,
      };
    }

    // Parse categories
    let categories: AnalysisCategory[] | undefined;
    if (options.category) {
      const requested = options.category.split(',').map((c) => c.trim());
      const invalid = requested.filter(
        (c) => !VALID_CATEGORIES.includes(c as AnalysisCategory),
      );
      if (invalid.length > 0) {
        return {
          content: [{
            type: 'text',
            text: `Invalid category: ${invalid.join(', ')}\n\nValid categories: ${VALID_CATEGORIES.join(', ')}`,
          }],
          isError: true,
        };
      }
      categories = requested as AnalysisCategory[];
    }

    // Parse severity
    let severity: AnalysisSeverity | undefined;
    if (options.severity) {
      if (!VALID_SEVERITIES.includes(options.severity as AnalysisSeverity)) {
        return {
          content: [{
            type: 'text',
            text: `Invalid severity: ${options.severity}\n\nValid severities: ${VALID_SEVERITIES.join(', ')}`,
          }],
          isError: true,
        };
      }
      severity = options.severity as AnalysisSeverity;
    }

    const result = await runAllAnalyses(projectRoot, {
      categories,
      severity,
      specIds: options.specIds,
    });

    return {
      content: [{
        type: 'text',
        text: formatAnalysisResult(result),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [{
        type: 'text',
        text: `Error running analysis: ${errorMessage}\n\n` +
          `Project root: ${projectRoot}\n\n` +
          `Try checking:\n` +
          `  1. Is the project root correct?\n` +
          `  2. Does .arch/specs/ directory exist with spec YAML files?\n` +
          `  3. Does .arch/registry/ directory exist with architecture YAML?\n` +
          `  4. Run: archcodex analyze --help for CLI usage.`,
      }],
      isError: true,
    };
  }
}
