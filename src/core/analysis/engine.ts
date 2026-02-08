/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Analysis engine orchestrator — loads registries, builds the cross-reference
 * graph, runs all checkers, and returns filtered/sorted results.
 *
 * @see spec.archcodex.analyze in .arch/specs/archcodex/analyze-engine.spec.yaml
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { loadSpecRegistry } from '../spec/loader.js';
import { loadRegistry } from '../registry/loader.js';
import { loadComponentGroupsRegistry } from '../registry/component-groups.js';
import { loadConfig } from '../config/loader.js';
import { verifyImplementation } from '../spec/verifier.js';
import { buildCrossReferenceGraph } from './graph.js';
import {
  securityChecker,
  logicChecker,
  dataChecker,
  consistencyChecker,
  completenessChecker,
  otherChecker,
} from './checkers/index.js';
import type {
  AnalysisIssue,
  AnalysisResult,
  AnalysisSummary,
  AnalysisOptions,
  AnalysisContext,
  Checker,
  ResolvedSpecEntry,
  ImplementationData,
  VerifierDriftSummary,
} from './types.js';
import { compareSeverity, severityAtLeast } from './types.js';

// ---------------------------------------------------------------------------
// All registered checkers
// ---------------------------------------------------------------------------

const ALL_CHECKERS: Checker[] = [
  securityChecker,
  logicChecker,
  dataChecker,
  consistencyChecker,
  completenessChecker,
  otherChecker,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all analyses on the given project.
 *
 * 1. Loads spec registry, arch registry, and component groups.
 * 2. Builds cross-reference graph.
 * 3. Runs checkers matching the requested categories.
 * 4. Filters by severity threshold and specId filter.
 * 5. Returns sorted issues + summary.
 */
export async function runAllAnalyses(
  projectRoot: string,
  options: AnalysisOptions = {},
): Promise<AnalysisResult> {
  // Load registries and config
  const specRegistry = await loadSpecRegistry(projectRoot);
  const archRegistry = await loadRegistry(projectRoot);
  const componentGroups = await loadComponentGroupsRegistry(projectRoot);
  const config = await loadConfig(projectRoot);

  // Build resolved spec entries (skip test fixture specs)
  const specs: ResolvedSpecEntry[] = Object.entries(specRegistry.nodes)
    .filter(([, node]) => (node as Record<string, unknown>).type !== 'test')
    .map(([specId, node]) => ({ specId, node }));

  // Build cross-reference graph
  const graph = buildCrossReferenceGraph(specRegistry.nodes);

  // Assemble context
  const context: AnalysisContext = {
    specs,
    graph,
    archRegistry: archRegistry.nodes as Record<string, Record<string, unknown>>,
    componentGroups,
    deepPatterns: config.analysis.deep_patterns,
    toolEntities: config.analysis.tool_entities,
  };

  // Deep analysis: load implementation files and run verifier
  if (options.deep) {
    const implementationContents = new Map<string, ImplementationData>();
    const verifierResults = new Map<string, VerifierDriftSummary>();

    for (const { specId, node } of specs) {
      const impl = (node as Record<string, unknown>).implementation as string | undefined;
      if (!impl) continue;
      const [filePath, functionName] = impl.split('#');
      const absPath = resolve(projectRoot, filePath);

      try {
        const content = await readFile(absPath, 'utf-8');
        implementationContents.set(specId, { content, filePath: absPath, functionName });

        // Run verifier for bridge rules
        const resolvedSpec = { specId, inheritanceChain: [], appliedMixins: [], node };
        const verifyResult = verifyImplementation(resolvedSpec, content, absPath);
        verifierResults.set(specId, summarizeDrift(verifyResult));
      } catch {
        // File not found — skip silently (completeness rules already flag missing files)
      }
    }

    context.implementationContents = implementationContents;
    context.verifierResults = verifierResults;
  }

  // Select checkers
  const checkers = options.categories
    ? ALL_CHECKERS.filter((c) => options.categories!.includes(c.category))
    : ALL_CHECKERS;

  // Run checkers and collect issues
  let issues: AnalysisIssue[] = [];
  for (const checker of checkers) {
    issues.push(...checker.check(context));
  }

  // Filter by severity threshold
  if (options.severity) {
    issues = issues.filter((issue) =>
      severityAtLeast(issue.severity, options.severity!),
    );
  }

  // Filter by specId
  if (options.specIds && options.specIds.length > 0) {
    const specIdSet = new Set(options.specIds);
    issues = issues.filter(
      (issue) => !issue.specId || specIdSet.has(issue.specId),
    );
  }

  // Sort: errors first, then warnings, then info
  issues.sort((a, b) => compareSeverity(a.severity, b.severity));

  // Build summary
  const summary = buildSummary(issues, specs.length);

  return { issues, summary };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(
  issues: AnalysisIssue[],
  specsAnalyzed: number,
): AnalysisSummary {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const issue of issues) {
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
  }

  return {
    total: issues.length,
    byCategory,
    bySeverity,
    specsAnalyzed,
  };
}

// ---------------------------------------------------------------------------
// Deep Analysis Helpers
// ---------------------------------------------------------------------------

function summarizeDrift(result: {
  drift: Array<{ type: string; severity: string; errorCode?: string; field?: string; expected?: string; actual?: string; specField?: string; implField?: string }>;
}): VerifierDriftSummary {
  const extraErrors: string[] = [];
  const missingOutputs: string[] = [];
  const extraOutputs: string[] = [];
  let architectureMismatch = false;
  let missingArchTag: string | undefined;
  let actualArchTag: string | undefined;

  for (const item of result.drift) {
    if (item.type === 'extra_error' && item.errorCode) {
      extraErrors.push(item.errorCode);
    } else if (item.type === 'missing_output' && item.specField) {
      missingOutputs.push(item.specField);
    } else if (item.type === 'extra_output' && item.implField) {
      extraOutputs.push(item.implField);
    } else if (item.type === 'architecture_mismatch') {
      architectureMismatch = true;
      missingArchTag = item.expected;
      actualArchTag = item.actual;
    }
  }

  return { extraErrors, missingOutputs, extraOutputs, architectureMismatch, missingArchTag, actualArchTag };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const SEVERITY_ICONS: Record<string, string> = {
  error: 'ERR',
  warning: 'WRN',
  info: 'INF',
};

/**
 * Format an analysis result as a human-readable string.
 */
export function formatAnalysisResult(result: AnalysisResult): string {
  const lines: string[] = [];

  if (result.issues.length === 0) {
    lines.push('No issues found.');
    lines.push('');
    lines.push(`Specs analyzed: ${result.summary.specsAnalyzed}`);
    return lines.join('\n');
  }

  // Group issues by category
  const byCategory = new Map<string, AnalysisIssue[]>();
  for (const issue of result.issues) {
    const existing = byCategory.get(issue.category);
    if (existing) {
      existing.push(issue);
    } else {
      byCategory.set(issue.category, [issue]);
    }
  }

  for (const [category, categoryIssues] of byCategory) {
    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)} (${categoryIssues.length})`);
    lines.push('');

    for (const issue of categoryIssues) {
      const icon = SEVERITY_ICONS[issue.severity] ?? '???';
      const specLabel = issue.specId ? ` [${issue.specId}]` : '';
      const fieldLabel = issue.field ? ` (${issue.field})` : '';
      lines.push(`  [${icon}] ${issue.id}${specLabel}${fieldLabel}`);
      lines.push(`        ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`        -> ${issue.suggestion}`);
      }
      lines.push('');
    }
  }

  // Summary
  lines.push('---');
  lines.push(
    `${result.summary.total} issue(s) across ${result.summary.specsAnalyzed} spec(s)`,
  );

  const severityCounts: string[] = [];
  if (result.summary.bySeverity['error']) {
    severityCounts.push(`${result.summary.bySeverity['error']} error(s)`);
  }
  if (result.summary.bySeverity['warning']) {
    severityCounts.push(`${result.summary.bySeverity['warning']} warning(s)`);
  }
  if (result.summary.bySeverity['info']) {
    severityCounts.push(`${result.summary.bySeverity['info']} info`);
  }
  if (severityCounts.length > 0) {
    lines.push(severityCounts.join(', '));
  }

  return lines.join('\n');
}
