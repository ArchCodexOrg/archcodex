/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Migration planner - generates actionable migration tasks from registry diffs.
 */
import type { Registry } from '../registry/schema.js';
import type { RegistryDiff, ArchitectureChange, ConstraintChange } from '../diff/types.js';
import { compareRegistries } from '../diff/comparator.js';
import { loadRegistryFromRef, parseGitRange } from '../diff/git-loader.js';
import { loadRegistry } from '../registry/loader.js';
import { globFiles, readFile } from '../../utils/file-system.js';
import { extractArchId } from '../arch-tag/parser.js';
import { formatConstraintValue } from '../../utils/format.js';
import type {
  MigrationPlan,
  MigrationTask,
  AffectedFileMigration,
  MigrationStep,
  MigratePlanOptions,
} from './types.js';

/**
 * Generate a migration plan from a git range.
 */
export async function createMigrationPlan(
  projectRoot: string,
  range: string,
  options: MigratePlanOptions = {}
): Promise<MigrationPlan> {
  const { from, to } = parseGitRange(range);

  // Load registries
  const fromRegistry = await loadRegistryFromRef(projectRoot, from);
  const toRegistry = to === 'HEAD'
    ? await loadRegistry(projectRoot)
    : await loadRegistryFromRef(projectRoot, to);

  // Get diff
  const diff = await compareRegistries(
    fromRegistry,
    toRegistry,
    from,
    to,
    projectRoot,
    { includeAffectedFiles: options.includeFiles !== false }
  );

  // Convert diff to migration tasks
  const tasks = await generateMigrationTasks(
    diff,
    fromRegistry,
    toRegistry,
    projectRoot,
    options
  );

  // Calculate summary
  const totalFiles = tasks.reduce((sum, t) => sum + t.fileCount, 0);
  const autoApplicableFiles = tasks.reduce(
    (sum, t) => sum + t.affectedFiles.filter(f =>
      f.steps.every(s => s.autoApplicable)
    ).length,
    0
  );

  return {
    fromRef: from,
    toRef: to,
    tasks,
    summary: {
      totalTasks: tasks.length,
      totalFiles,
      autoApplicableFiles,
      manualReviewFiles: totalFiles - autoApplicableFiles,
    },
  };
}

/**
 * Generate migration tasks from a registry diff.
 */
async function generateMigrationTasks(
  diff: RegistryDiff,
  _fromRegistry: Registry,
  toRegistry: Registry,
  projectRoot: string,
  options: MigratePlanOptions
): Promise<MigrationTask[]> {
  const tasks: MigrationTask[] = [];

  // Get all files if needed
  const fileArchMap = options.includeFiles !== false
    ? await buildFileArchMap(projectRoot, options.filePatterns)
    : new Map<string, string>();

  // Process architecture changes
  for (const change of diff.architectureChanges) {
    const task = await createTaskForArchChange(
      change,
      toRegistry,
      fileArchMap
    );
    if (task) {
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Build a map of file paths to their @arch IDs.
 */
async function buildFileArchMap(
  projectRoot: string,
  filePatterns?: string[]
): Promise<Map<string, string>> {
  const patterns = filePatterns || ['src/**/*.ts', 'src/**/*.tsx'];
  const files = await globFiles(patterns, {
    cwd: projectRoot,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
  });

  const map = new Map<string, string>();

  for (const filePath of files) {
    try {
      const content = await readFile(filePath);
      const archId = extractArchId(content);
      if (archId) {
        map.set(filePath, archId);
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return map;
}

/**
 * Create a migration task for an architecture change.
 */
async function createTaskForArchChange(
  change: ArchitectureChange,
  toRegistry: Registry,
  fileArchMap: Map<string, string>
): Promise<MigrationTask | null> {
  const affectedFiles: AffectedFileMigration[] = [];

  // Find files using this architecture
  for (const [filePath, archId] of fileArchMap) {
    if (archId === change.archId) {
      const steps = generateStepsForFile(change, toRegistry);
      if (steps.length > 0) {
        affectedFiles.push({
          filePath,
          currentArchId: archId,
          newArchId: change.type === 'removed' ? undefined : archId,
          steps,
        });
      }
    }
  }

  // Skip if no affected files and not a significant change
  if (affectedFiles.length === 0 && change.type !== 'added') {
    return null;
  }

  const details = generateChangeDetails(change);
  const fullyAutoApplicable = affectedFiles.every(f =>
    f.steps.every(s => s.autoApplicable)
  );

  return {
    archId: change.archId,
    changeType: change.type === 'added' ? 'added' :
                change.type === 'removed' ? 'removed' : 'modified',
    summary: generateChangeSummary(change),
    details,
    affectedFiles,
    fileCount: affectedFiles.length,
    fullyAutoApplicable,
  };
}

/**
 * Generate migration steps for a file based on the change.
 */
function generateStepsForFile(
  change: ArchitectureChange,
  _toRegistry: Registry
): MigrationStep[] {
  const steps: MigrationStep[] = [];

  if (change.type === 'removed') {
    steps.push({
      action: 'manual_review',
      description: `Architecture '${change.archId}' has been removed. Update @arch tag to a valid architecture.`,
      autoApplicable: false,
    });
    return steps;
  }

  if (change.type === 'modified' && change.constraintChanges) {
    for (const cc of change.constraintChanges) {
      const step = generateStepForConstraintChange(cc, change.archId);
      if (step) {
        steps.push(step);
      }
    }
  }

  return steps;
}

/**
 * Generate a migration step for a constraint change.
 */
function generateStepForConstraintChange(
  change: ConstraintChange,
  _archId: string
): MigrationStep | null {
  if (change.type === 'added') {
    switch (change.rule) {
      case 'require_decorator':
        return {
          action: 'add_decorator',
          description: `Add required decorator @${change.newValue}`,
          value: String(change.newValue),
          autoApplicable: false, // Decorators need manual placement
        };
      case 'require_import':
        return {
          action: 'add_import',
          description: `Add required import: ${change.newValue}`,
          value: String(change.newValue),
          autoApplicable: true,
        };
      case 'forbid_import':
        return {
          action: 'remove_import',
          description: `Remove forbidden import: ${formatValue(change.newValue)}`,
          value: String(change.newValue),
          autoApplicable: false, // May need refactoring
        };
      case 'forbid_decorator':
        return {
          action: 'remove_decorator',
          description: `Remove forbidden decorator @${change.newValue}`,
          value: String(change.newValue),
          autoApplicable: false,
        };
      default:
        return {
          action: 'manual_review',
          description: `New constraint: ${change.rule} = ${formatValue(change.newValue)}`,
          autoApplicable: false,
        };
    }
  }

  if (change.type === 'removed') {
    // Constraint removed - usually no action needed
    return null;
  }

  // Modified (e.g., severity change)
  return null;
}

/**
 * Generate a human-readable summary of a change.
 */
function generateChangeSummary(change: ArchitectureChange): string {
  switch (change.type) {
    case 'added':
      return `New architecture '${change.archId}'`;
    case 'removed':
      return `Architecture '${change.archId}' removed`;
    case 'modified': {
      const parts: string[] = [];
      if (change.constraintChanges?.length) {
        const added = change.constraintChanges.filter(c => c.type === 'added').length;
        const removed = change.constraintChanges.filter(c => c.type === 'removed').length;
        if (added) parts.push(`+${added} constraints`);
        if (removed) parts.push(`-${removed} constraints`);
      }
      if (change.inheritsChange) {
        parts.push('inheritance changed');
      }
      if (change.mixinChanges) {
        const { added, removed } = change.mixinChanges;
        if (added.length) parts.push(`+${added.length} mixins`);
        if (removed.length) parts.push(`-${removed.length} mixins`);
      }
      return `Modified '${change.archId}': ${parts.join(', ') || 'minor changes'}`;
    }
    default:
      return `Changed '${change.archId}'`;
  }
}

/**
 * Generate detailed change descriptions.
 */
function generateChangeDetails(change: ArchitectureChange): string[] {
  const details: string[] = [];

  if (change.type === 'added' && change.newNode) {
    details.push(`Description: ${change.newNode.description || 'No description'}`);
    if (change.newNode.inherits) {
      details.push(`Inherits: ${change.newNode.inherits}`);
    }
  }

  if (change.type === 'removed' && change.oldNode) {
    details.push(`Was: ${change.oldNode.description || 'No description'}`);
  }

  if (change.inheritsChange) {
    const { old: oldVal, new: newVal } = change.inheritsChange;
    if (oldVal && newVal) {
      details.push(`Inheritance: ${oldVal} → ${newVal}`);
    } else if (newVal) {
      details.push(`Added inheritance: ${newVal}`);
    } else if (oldVal) {
      details.push(`Removed inheritance: ${oldVal}`);
    }
  }

  if (change.mixinChanges) {
    for (const m of change.mixinChanges.added) {
      details.push(`Added mixin: ${m}`);
    }
    for (const m of change.mixinChanges.removed) {
      details.push(`Removed mixin: ${m}`);
    }
  }

  if (change.constraintChanges) {
    for (const cc of change.constraintChanges) {
      if (cc.type === 'added') {
        details.push(`Added constraint: ${cc.rule} = ${formatValue(cc.newValue)}`);
      } else if (cc.type === 'removed') {
        details.push(`Removed constraint: ${cc.rule} = ${formatValue(cc.oldValue)}`);
      } else if (cc.type === 'modified') {
        details.push(`Modified constraint: ${cc.rule} severity ${cc.oldSeverity} → ${cc.newSeverity}`);
      }
    }
  }

  return details;
}

/** Format a constraint value for display. */
const formatValue = (value: unknown): string =>
  formatConstraintValue(value, { handleUndefined: true, wrapArrays: true, arraySeparator: ', ' });
