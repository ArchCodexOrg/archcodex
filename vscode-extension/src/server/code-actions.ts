/**
 * @arch extension.server.diagnostics
 *
 * Code Actions Provider for ArchCodex violations.
 *
 * Provides quick fixes based on violation data:
 * - suggestion.action (replace, remove, add, rename)
 * - didYouMean import suggestions
 * - Add @arch tag for untagged files
 */
import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  TextEdit,
  Range,
  Position,
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ArchCodexDiagnosticData } from './diagnostics.js';

/**
 * Generate code actions for a diagnostic.
 */
export function getCodeActionsForDiagnostic(
  diagnostic: Diagnostic,
  document: TextDocument
): CodeAction[] {
  const actions: CodeAction[] = [];
  const data = diagnostic.data as ArchCodexDiagnosticData | undefined;

  if (!data) {
    return actions;
  }

  // Handle suggestion-based fixes
  if (data.suggestion) {
    const suggestionAction = createSuggestionAction(diagnostic, document, data);
    if (suggestionAction) {
      actions.push(suggestionAction);
    }
  }

  // Handle "Did you mean" suggestions
  if (data.didYouMean) {
    const didYouMeanAction = createDidYouMeanAction(diagnostic, document, data);
    if (didYouMeanAction) {
      actions.push(didYouMeanAction);
    }
  }

  // Handle missing @arch tag
  if (data.rule === 'missing_arch_tag' || diagnostic.code === 'S001') {
    const archTagAction = createAddArchTagAction(diagnostic, document);
    actions.push(archTagAction);
  }

  // Add fix hint as a generic action if no other actions
  if (actions.length === 0 && data.fixHint) {
    actions.push({
      title: `Fix: ${data.fixHint}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      isPreferred: false,
    });
  }

  return actions;
}

/**
 * Create a code action from a suggestion.
 */
function createSuggestionAction(
  diagnostic: Diagnostic,
  document: TextDocument,
  data: ArchCodexDiagnosticData
): CodeAction | null {
  const suggestion = data.suggestion;
  if (!suggestion) return null;

  const edits: TextEdit[] = [];
  let title = '';

  switch (suggestion.action) {
    case 'remove': {
      if (suggestion.target) {
        const targetRange = findTargetRange(document, suggestion.target, diagnostic.range);
        if (targetRange) {
          // Remove the entire line if it's an import
          const line = document.getText({
            start: { line: targetRange.start.line, character: 0 },
            end: { line: targetRange.start.line + 1, character: 0 },
          });

          if (line.trim().startsWith('import')) {
            edits.push({
              range: {
                start: { line: targetRange.start.line, character: 0 },
                end: { line: targetRange.start.line + 1, character: 0 },
              },
              newText: '',
            });
          } else {
            edits.push({ range: targetRange, newText: '' });
          }
          title = `Remove '${suggestion.target}'`;
        }
      }
      break;
    }

    case 'replace': {
      if (suggestion.target && suggestion.replacement) {
        const targetRange = findTargetRange(document, suggestion.target, diagnostic.range);
        if (targetRange) {
          edits.push({ range: targetRange, newText: suggestion.replacement });
          title = `Replace '${suggestion.target}' with '${suggestion.replacement}'`;
        }
      }
      break;
    }

    case 'add': {
      if (suggestion.importStatement) {
        // Add import at the top of the file (after existing imports)
        const insertPosition = findImportInsertPosition(document);
        edits.push({
          range: { start: insertPosition, end: insertPosition },
          newText: suggestion.importStatement + '\n',
        });
        title = `Add import: ${suggestion.importStatement}`;
      } else if (suggestion.replacement) {
        const insertPosition = getInsertPosition(document, diagnostic.range, suggestion.insertAt);
        edits.push({
          range: { start: insertPosition, end: insertPosition },
          newText: suggestion.replacement,
        });
        title = `Add '${suggestion.replacement}'`;
      }
      break;
    }

    case 'rename': {
      if (suggestion.target && suggestion.replacement) {
        const targetRange = findTargetRange(document, suggestion.target, diagnostic.range);
        if (targetRange) {
          edits.push({ range: targetRange, newText: suggestion.replacement });
          title = `Rename '${suggestion.target}' to '${suggestion.replacement}'`;
        }
      }
      break;
    }
  }

  if (edits.length === 0) {
    return null;
  }

  return {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    isPreferred: true,
    edit: {
      changes: {
        [document.uri]: edits,
      },
    },
  };
}

/**
 * Create a "Did you mean" code action.
 */
function createDidYouMeanAction(
  diagnostic: Diagnostic,
  document: TextDocument,
  data: ArchCodexDiagnosticData
): CodeAction | null {
  const didYouMean = data.didYouMean;
  if (!didYouMean) return null;

  const edits: TextEdit[] = [];

  // Find the offending import line
  const lineText = document.getText({
    start: { line: diagnostic.range.start.line, character: 0 },
    end: { line: diagnostic.range.start.line + 1, character: 0 },
  });

  if (lineText.includes('import')) {
    // Build the new import statement
    const exportName = didYouMean.export || 'default';
    const newImport = exportName === 'default'
      ? `import ${getImportAlias(lineText)} from '${didYouMean.file}';`
      : `import { ${exportName} } from '${didYouMean.file}';`;

    edits.push({
      range: {
        start: { line: diagnostic.range.start.line, character: 0 },
        end: { line: diagnostic.range.start.line + 1, character: 0 },
      },
      newText: newImport + '\n',
    });
  }

  if (edits.length === 0) {
    return null;
  }

  const title = didYouMean.export
    ? `Import '${didYouMean.export}' from '${didYouMean.file}'`
    : `Import from '${didYouMean.file}'`;

  return {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    isPreferred: false,
    edit: {
      changes: {
        [document.uri]: edits,
      },
    },
  };
}

/**
 * Create an "Add @arch tag" code action.
 */
function createAddArchTagAction(
  diagnostic: Diagnostic,
  document: TextDocument
): CodeAction {
  const edits: TextEdit[] = [];

  // Check if file already has a doc comment at the top
  const firstLine = document.getText({
    start: { line: 0, character: 0 },
    end: { line: 1, character: 0 },
  });

  const archTagTemplate = '/** @arch ARCHITECTURE_ID */\n';

  if (firstLine.startsWith('/**')) {
    // Insert @arch into existing doc comment
    edits.push({
      range: {
        start: { line: 0, character: 3 }, // After /**
        end: { line: 0, character: 3 },
      },
      newText: '\n * @arch ARCHITECTURE_ID\n *',
    });
  } else {
    // Add new doc comment at the top
    edits.push({
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      newText: archTagTemplate,
    });
  }

  return {
    title: 'Add @arch tag',
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    isPreferred: true,
    edit: {
      changes: {
        [document.uri]: edits,
      },
    },
  };
}

/**
 * Find the range of a target string in the document.
 */
function findTargetRange(
  document: TextDocument,
  target: string,
  hintRange: Range
): Range | null {
  // First try to find on the diagnostic line
  const lineText = document.getText({
    start: { line: hintRange.start.line, character: 0 },
    end: { line: hintRange.start.line + 1, character: 0 },
  });

  const index = lineText.indexOf(target);
  if (index !== -1) {
    return {
      start: { line: hintRange.start.line, character: index },
      end: { line: hintRange.start.line, character: index + target.length },
    };
  }

  // Search the entire document
  const text = document.getText();
  const globalIndex = text.indexOf(target);
  if (globalIndex !== -1) {
    const start = document.positionAt(globalIndex);
    const end = document.positionAt(globalIndex + target.length);
    return { start, end };
  }

  return null;
}

/**
 * Find the position to insert a new import statement.
 */
function findImportInsertPosition(document: TextDocument): Position {
  const text = document.getText();
  const lines = text.split('\n');

  let lastImportLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments at the top
    if (i === 0 && (line === '' || line.startsWith('/**') || line.startsWith('//'))) {
      continue;
    }

    // Track import statements
    if (line.startsWith('import ') || line.startsWith('import{')) {
      lastImportLine = i;
    }

    // Stop at first non-import statement (excluding comments)
    if (
      lastImportLine !== -1 &&
      !line.startsWith('import') &&
      !line.startsWith('//') &&
      !line.startsWith('*') &&
      !line.startsWith('*/') &&
      line !== ''
    ) {
      break;
    }
  }

  if (lastImportLine !== -1) {
    // Insert after the last import
    return { line: lastImportLine + 1, character: 0 };
  }

  // No imports found, insert at the beginning (after doc comment if present)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('*/')) {
      return { line: i + 1, character: 0 };
    }
    if (!line.startsWith('/**') && !line.startsWith('*') && !line.startsWith('//') && line !== '') {
      return { line: i, character: 0 };
    }
  }

  return { line: 0, character: 0 };
}

/**
 * Get insert position based on insertAt directive.
 */
function getInsertPosition(
  document: TextDocument,
  range: Range,
  insertAt?: 'before' | 'after' | 'start' | 'end'
): Position {
  switch (insertAt) {
    case 'before':
      return range.start;
    case 'after':
      return range.end;
    case 'start':
      return { line: 0, character: 0 };
    case 'end': {
      const text = document.getText();
      return document.positionAt(text.length);
    }
    default:
      return range.start;
  }
}

/**
 * Extract import alias from an import statement.
 */
function getImportAlias(importLine: string): string {
  // Match: import Foo from '...' or import { Foo } from '...'
  const defaultMatch = importLine.match(/import\s+(\w+)\s+from/);
  if (defaultMatch) {
    return defaultMatch[1];
  }

  const namedMatch = importLine.match(/import\s*{\s*(\w+)/);
  if (namedMatch) {
    return namedMatch[1];
  }

  return 'imported';
}
