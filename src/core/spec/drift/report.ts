/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Combined drift analysis report.
 * Implementation of spec.speccodex.drift.report
 */
import type { SpecRegistry } from '../schema.js';
import { findUnwiredSpecs } from './unwired.js';
import {
  findUndocumentedImplementations,
} from './undocumented.js';
import { verifyImplementation } from '../verifier.js';
import { resolveSpec } from '../resolver.js';
import { readFile } from '../../../utils/file-system.js';
import * as path from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export type IssueType =
  | 'unwired_spec'
  | 'undocumented_impl'
  | 'missing_file'
  | 'missing_export'
  | 'signature_mismatch'
  | 'behavior_failure';

export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * A single drift issue found during analysis.
 */
export interface DriftIssue {
  type: IssueType;
  severity: IssueSeverity;
  specId?: string;
  path?: string;
  message: string;
  suggestion?: string;
}

/**
 * Options for generating a drift report.
 */
export interface DriftReportOptions {
  /** Run signature verification on wired specs (default: true) */
  includeSignatureCheck?: boolean;
  /** Run behavior verification (default: false, reserved for future) */
  includeBehaviorCheck?: boolean;
  /** Output format (default: terminal) */
  format?: 'json' | 'markdown' | 'terminal';
  /** Glob patterns for undocumented file scanning */
  patterns?: string[];
  /** Glob patterns to exclude from scanning */
  exclude?: string[];
  /** Filter to specs matching glob pattern */
  pattern?: string;
  /** Include base/abstract specs in unwired check */
  includeBase?: boolean;
}

/**
 * Summary counts for the drift report.
 */
export interface DriftReportSummary {
  errors: number;
  warnings: number;
  info: number;
  /** Percentage of specs with implementation references */
  specCoverage: number;
  /** Percentage of implementation files with specs */
  implCoverage: number;
}

/**
 * Complete drift report result.
 */
export interface DriftReportResult {
  /** True if no error-severity issues found */
  valid: boolean;
  /** All drift issues, sorted by severity */
  issues: DriftIssue[];
  /** Aggregate counts */
  summary: DriftReportSummary;
  /** Pre-formatted report in requested format */
  formattedOutput: string;
}

// ─── Severity Ordering ──────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function sortIssues(issues: DriftIssue[]): DriftIssue[] {
  return [...issues].sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    // Within same severity, sort by specId/path
    const aKey = a.specId || a.path || '';
    const bKey = b.specId || b.path || '';
    return aKey.localeCompare(bKey);
  });
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Generate a comprehensive drift analysis report.
 *
 * Combines three checks:
 * 1. Unwired specs (specs without implementation references)
 * 2. Undocumented implementations (files without specs)
 * 3. Signature mismatches (wired specs where implementation doesn't match)
 *
 * @param projectRoot - Absolute path to project root
 * @param registry - Loaded spec registry
 * @param options - Report configuration
 * @returns Complete drift report with issues, summary, and formatted output
 */
export async function generateDriftReport(
  projectRoot: string,
  registry: SpecRegistry,
  options: DriftReportOptions = {}
): Promise<DriftReportResult> {
  if (!projectRoot) {
    throw new Error('MISSING_PROJECTROOT: projectRoot is required');
  }

  const {
    includeSignatureCheck = true,
    format = 'terminal',
    patterns,
    exclude,
    pattern,
    includeBase,
  } = options;

  const issues: DriftIssue[] = [];

  // Phase 1: Unwired specs
  const unwiredResult = findUnwiredSpecs(registry, {
    includeBase: includeBase || false,
    pattern,
  });

  for (const spec of unwiredResult.unwired) {
    issues.push({
      type: 'unwired_spec',
      severity: spec.hasExamples ? 'error' : 'warning',
      specId: spec.specId,
      message: `Spec '${spec.specId}' has no implementation reference`,
      suggestion: spec.suggestedPath
        ? `Add implementation: ${spec.suggestedPath}#${spec.specId.split('.').pop() || 'default'}`
        : undefined,
    });
  }

  // Phase 2: Undocumented implementations
  const undocumentedResult = await findUndocumentedImplementations(
    projectRoot,
    registry,
    { patterns, exclude }
  );

  for (const file of undocumentedResult.undocumented) {
    issues.push({
      type: 'undocumented_impl',
      severity: 'info',
      path: file.path,
      message: `Implementation '${file.path}' has no corresponding spec`,
      suggestion: `Create spec with id: ${file.suggestedSpecId}`,
    });
  }

  // Phase 3: Signature checks
  if (includeSignatureCheck) {
    for (const [specId, node] of Object.entries(registry.nodes)) {
      if (!node.implementation) continue;
      if (pattern && !specId.includes(pattern.replace(/\*/g, ''))) continue;

      const [filePath] = node.implementation.split('#');
      const absPath = path.resolve(projectRoot, filePath);

      // Try to read the implementation file
      let content: string;
      try {
        content = await readFile(absPath);
      } catch { /* implementation file not found */
        issues.push({
          type: 'missing_file',
          severity: 'error',
          specId,
          path: filePath,
          message: `Implementation file not found: ${filePath}`,
          suggestion: `Create the file or update the spec's implementation field`,
        });
        continue;
      }

      // Resolve spec and verify
      const resolved = resolveSpec(registry, specId);
      if (!resolved.valid || !resolved.spec) continue;

      const verifyResult = verifyImplementation(
        resolved.spec,
        content,
        absPath
      );

      // Convert verification drift items to report issues
      for (const drift of verifyResult.drift) {
        if (drift.severity === 'error') {
          issues.push({
            type: 'signature_mismatch',
            severity: 'error',
            specId,
            path: filePath,
            message: `${drift.type}: ${drift.field || drift.errorCode || 'unknown'}${drift.expected ? ` (expected: ${drift.expected})` : ''}`,
            suggestion: drift.actual
              ? `Found: ${drift.actual}`
              : undefined,
          });
        }
      }
    }
  }

  // Phase 4: Behavior checks (reserved for future)
  // No-op

  // Post-processing
  const sortedIssues = sortIssues(issues);

  const errorCount = sortedIssues.filter(i => i.severity === 'error').length;
  const warningCount = sortedIssues.filter(i => i.severity === 'warning').length;
  const infoCount = sortedIssues.filter(i => i.severity === 'info').length;

  const implCoverage = undocumentedResult.summary.filesScanned > 0
    ? Math.round(
        (undocumentedResult.summary.filesWithSpecs /
          undocumentedResult.summary.filesScanned) *
          1000
      ) / 10
    : 100;

  const summary: DriftReportSummary = {
    errors: errorCount,
    warnings: warningCount,
    info: infoCount,
    specCoverage: unwiredResult.coverage.percentage,
    implCoverage,
  };

  const result: DriftReportResult = {
    valid: errorCount === 0,
    issues: sortedIssues,
    summary,
    formattedOutput: '',
  };

  // Format output
  result.formattedOutput = formatDriftReport(result, format);

  return result;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

/**
 * Format a drift report result as a string.
 * Uses plain text labels (ERROR/WARNING/INFO) — the CLI layer adds colors.
 */
export function formatDriftReport(
  result: DriftReportResult,
  format?: 'json' | 'markdown' | 'terminal'
): string {
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'markdown':
      return formatMarkdown(result);
    default:
      return formatTerminal(result);
  }
}

function formatTerminal(result: DriftReportResult): string {
  const lines: string[] = [];
  const { summary, issues } = result;

  lines.push('Drift Report');
  lines.push('============');
  lines.push(`Errors: ${summary.errors}  Warnings: ${summary.warnings}  Info: ${summary.info}`);
  lines.push('');
  lines.push(`Spec Coverage: ${summary.specCoverage}%`);
  lines.push(`Impl Coverage: ${summary.implCoverage}%`);
  lines.push('');

  if (issues.length === 0) {
    lines.push('No drift detected.');
    return lines.join('\n');
  }

  lines.push('Issues:');

  for (const issue of issues) {
    const label = issue.severity.toUpperCase();
    const ref = issue.specId || issue.path || '';
    lines.push(`  ${label} [${issue.type}] ${ref}`);
    lines.push(`    ${issue.message}`);
    if (issue.suggestion) {
      lines.push(`    suggestion: ${issue.suggestion}`);
    }
  }

  return lines.join('\n');
}

function formatMarkdown(result: DriftReportResult): string {
  const lines: string[] = [];
  const { summary, issues } = result;

  lines.push('# Drift Report');
  lines.push('');
  lines.push(`**Spec Coverage:** ${summary.specCoverage}%  |  **Impl Coverage:** ${summary.implCoverage}%`);
  lines.push('');

  if (issues.length === 0) {
    lines.push('No drift detected.');
    return lines.join('\n');
  }

  // Group by severity
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  if (errors.length > 0) {
    lines.push(`## Errors (${errors.length})`);
    lines.push('');
    lines.push('| Type | Spec/Path | Message |');
    lines.push('|------|-----------|---------|');
    for (const issue of errors) {
      lines.push(`| ${issue.type} | ${issue.specId || issue.path || ''} | ${issue.message} |`);
    }
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push(`## Warnings (${warnings.length})`);
    lines.push('');
    lines.push('| Type | Spec/Path | Message |');
    lines.push('|------|-----------|---------|');
    for (const issue of warnings) {
      lines.push(`| ${issue.type} | ${issue.specId || issue.path || ''} | ${issue.message} |`);
    }
    lines.push('');
  }

  if (infos.length > 0) {
    lines.push(`## Info (${infos.length})`);
    lines.push('');
    lines.push('| Type | Path | Suggested Spec |');
    lines.push('|------|------|----------------|');
    for (const issue of infos) {
      lines.push(`| ${issue.type} | ${issue.path || ''} | ${issue.suggestion || ''} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatJson(result: DriftReportResult): string {
  // Exclude formattedOutput to avoid recursion
  return JSON.stringify({
    valid: result.valid,
    issues: result.issues,
    summary: result.summary,
  }, null, 2);
}
