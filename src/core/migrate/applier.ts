/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Migration applier - applies auto-fixable migration steps to files.
 */
import { readFile, writeFile } from 'node:fs/promises';
import type {
  MigrationPlan,
  MigrationResult,
  MigrateApplyOptions,
  AffectedFileMigration,
  MigrationStep,
} from './types.js';

/**
 * Apply migrations from a plan.
 */
export async function applyMigrations(
  plan: MigrationPlan,
  options: MigrateApplyOptions = {}
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: [],
    failed: [],
    skipped: [],
  };

  for (const task of plan.tasks) {
    for (const file of task.affectedFiles) {
      // Filter to specific files if provided
      if (options.files && !options.files.includes(file.filePath)) {
        continue;
      }

      // Check if file has any auto-applicable steps
      const autoSteps = file.steps.filter(s => s.autoApplicable);
      const manualSteps = file.steps.filter(s => !s.autoApplicable);

      if (autoSteps.length === 0) {
        if (!options.skipManual) {
          result.skipped.push({
            filePath: file.filePath,
            reason: 'No auto-applicable steps, manual review required',
          });
        }
        continue;
      }

      if (manualSteps.length > 0 && !options.skipManual) {
        result.skipped.push({
          filePath: file.filePath,
          reason: `${manualSteps.length} step(s) require manual review`,
        });
        continue;
      }

      // Apply auto steps
      try {
        if (!options.dryRun) {
          await applyStepsToFile(file.filePath, autoSteps);
        }
        result.success.push({
          filePath: file.filePath,
          stepsApplied: autoSteps.length,
        });
      } catch (error) {
        result.failed.push({
          filePath: file.filePath,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return result;
}

/**
 * Apply migration steps to a single file.
 */
async function applyStepsToFile(
  filePath: string,
  steps: MigrationStep[]
): Promise<void> {
  let content = await readFile(filePath, 'utf-8');

  for (const step of steps) {
    content = applyStep(content, step);
  }

  await writeFile(filePath, content, 'utf-8');
}

/**
 * Apply a single migration step to file content.
 */
function applyStep(content: string, step: MigrationStep): string {
  switch (step.action) {
    case 'update_arch_tag':
      return updateArchTag(content, step.value!);
    case 'add_import':
      return addImport(content, step.value!);
    default:
      // Other actions require manual intervention
      return content;
  }
}

/**
 * Update the @arch tag in file content.
 */
function updateArchTag(content: string, newArchId: string): string {
  // Match @arch tag in JSDoc or single-line comment
  const patterns = [
    /(@arch\s+)[\w.]+/g,
    /(\/\/\s*@arch\s+)[\w.]+/g,
  ];

  for (const pattern of patterns) {
    if (pattern.test(content)) {
      return content.replace(pattern, `$1${newArchId}`);
    }
  }

  return content;
}

/**
 * Add an import statement to file content.
 */
function addImport(content: string, importSpec: string): string {
  // Check if import already exists
  if (content.includes(importSpec)) {
    return content;
  }

  // Find the last import statement
  const importRegex = /^import\s+.*?;?\s*$/gm;
  let lastImportIndex = -1;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    lastImportIndex = match.index + match[0].length;
  }

  // Build import statement
  const importStatement = `import ${importSpec};\n`;

  if (lastImportIndex > -1) {
    // Add after last import
    return (
      content.slice(0, lastImportIndex) +
      '\n' +
      importStatement +
      content.slice(lastImportIndex)
    );
  }

  // No existing imports - add after any header comments
  const headerEnd = findHeaderEnd(content);
  return (
    content.slice(0, headerEnd) +
    importStatement +
    '\n' +
    content.slice(headerEnd)
  );
}

/**
 * Find the end of header comments (JSDoc, copyright, etc.).
 */
function findHeaderEnd(content: string): number {
  const lines = content.split('\n');
  let inBlockComment = false;
  let headerEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('/*')) {
      inBlockComment = true;
    }
    if (inBlockComment) {
      headerEnd += lines[i].length + 1;
      if (line.endsWith('*/') || line.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }
    if (line.startsWith('//') || line === '') {
      headerEnd += lines[i].length + 1;
      continue;
    }

    // First non-comment, non-empty line
    break;
  }

  return headerEnd;
}

/**
 * Check if a file has pending manual migrations.
 */
export function hasPendingManualMigrations(file: AffectedFileMigration): boolean {
  return file.steps.some(s => !s.autoApplicable);
}

/**
 * Get a summary of what would be applied.
 */
export function getMigrationSummary(plan: MigrationPlan): {
  autoApplicable: number;
  manualRequired: number;
  byAction: Record<string, number>;
} {
  const byAction: Record<string, number> = {};
  let autoApplicable = 0;
  let manualRequired = 0;

  for (const task of plan.tasks) {
    for (const file of task.affectedFiles) {
      for (const step of file.steps) {
        byAction[step.action] = (byAction[step.action] || 0) + 1;
        if (step.autoApplicable) {
          autoApplicable++;
        } else {
          manualRequired++;
        }
      }
    }
  }

  return { autoApplicable, manualRequired, byAction };
}
