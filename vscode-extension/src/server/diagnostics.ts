/**
 * @arch extension.server.diagnostics
 *
 * Maps ArchCodex violations to LSP diagnostics.
 */
import {
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
} from 'vscode-languageserver/node';
import type { Violation } from '../../../src/core/constraints/types.js';
import type { ValidationResult } from '../../../src/core/validation/types.js';

/**
 * Extended diagnostic data for code actions.
 */
export interface ArchCodexDiagnosticData {
  rule: string;
  value: unknown;
  fixHint?: string;
  suggestion?: {
    action: string;
    target?: string;
    replacement?: string;
  };
  didYouMean?: {
    file: string;
    export: string;
    description?: string;
  };
}

/**
 * Convert a single violation to an LSP diagnostic.
 */
export function violationToDiagnostic(violation: Violation): Diagnostic {
  const severity = violation.severity === 'error'
    ? DiagnosticSeverity.Error
    : DiagnosticSeverity.Warning;

  // LSP uses 0-based line numbers, violations may use 1-based or null
  const line = violation.line ? violation.line - 1 : 0;
  const column = violation.column ? violation.column - 1 : 0;

  const diagnostic: Diagnostic = {
    severity,
    range: {
      start: { line, character: column },
      end: { line, character: column + 100 }, // Highlight the line
    },
    message: violation.message,
    source: 'archcodex',
    code: violation.code,
    data: {
      rule: violation.rule,
      value: violation.value,
      fixHint: violation.fixHint,
      suggestion: violation.suggestion,
      didYouMean: violation.didYouMean,
    } as ArchCodexDiagnosticData,
  };

  // Add "why" to message if available
  if (violation.why) {
    diagnostic.message += `\n${violation.why}`;
  }

  // Mark deprecated constraints with diagnostic tag
  if (violation.code === 'D001') {
    diagnostic.tags = [DiagnosticTag.Deprecated];
  }

  return diagnostic;
}

/**
 * Convert validation result to LSP diagnostics array.
 */
export function resultToDiagnostics(result: ValidationResult): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Add error violations
  for (const violation of result.violations) {
    diagnostics.push(violationToDiagnostic(violation));
  }

  // Add warning violations
  for (const warning of result.warnings) {
    diagnostics.push(violationToDiagnostic(warning));
  }

  return diagnostics;
}

/**
 * Create a diagnostic for files without @arch tag.
 */
export function createUntaggedDiagnostic(severity: 'error' | 'warning'): Diagnostic {
  return {
    severity: severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
    message: 'File has no @arch tag. Add /** @arch domain.name */ to define architectural constraints.',
    source: 'archcodex',
    code: 'S001',
    data: {
      rule: 'missing_arch_tag',
      value: null,
    } as ArchCodexDiagnosticData,
  };
}
