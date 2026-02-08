/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Registry comparator - compares two registry versions and generates diff.
 */
import type { Registry, ArchitectureNode, Constraint } from '../registry/schema.js';
import type {
  RegistryDiff,
  ArchitectureChange,
  MixinChange,
  ConstraintChange,
  AffectedFile,
  DiffOptions,
} from './types.js';
import { globFiles, readFile } from '../../utils/file-system.js';
import { extractArchId } from '../arch-tag/parser.js';
import { makeConstraintKey } from '../../utils/format.js';

/**
 * Compare two registries and generate a diff.
 */
export async function compareRegistries(
  fromRegistry: Registry,
  toRegistry: Registry,
  fromRef: string,
  toRef: string,
  projectRoot: string,
  options: DiffOptions = {}
): Promise<RegistryDiff> {
  // Compare architectures
  const architectureChanges = compareArchitectures(
    fromRegistry.nodes,
    toRegistry.nodes
  );

  // Compare mixins
  const mixinChanges = compareMixins(
    fromRegistry.mixins,
    toRegistry.mixins
  );

  // Find affected files if requested
  let affectedFiles: AffectedFile[] = [];
  if (options.includeAffectedFiles !== false) {
    affectedFiles = await findAffectedFiles(
      architectureChanges,
      mixinChanges,
      projectRoot,
      options.filePatterns
    );
  }

  // Build summary
  const summary = {
    architecturesAdded: architectureChanges.filter(c => c.type === 'added').length,
    architecturesRemoved: architectureChanges.filter(c => c.type === 'removed').length,
    architecturesModified: architectureChanges.filter(c => c.type === 'modified').length,
    mixinsAdded: mixinChanges.filter(c => c.type === 'added').length,
    mixinsRemoved: mixinChanges.filter(c => c.type === 'removed').length,
    mixinsModified: mixinChanges.filter(c => c.type === 'modified').length,
    totalAffectedFiles: affectedFiles.length,
  };

  return {
    fromRef,
    toRef,
    architectureChanges,
    mixinChanges,
    affectedFiles,
    summary,
  };
}

/**
 * Compare architecture nodes between two registries.
 */
function compareArchitectures(
  fromNodes: Record<string, ArchitectureNode>,
  toNodes: Record<string, ArchitectureNode>
): ArchitectureChange[] {
  const changes: ArchitectureChange[] = [];
  const allArchIds = new Set([...Object.keys(fromNodes), ...Object.keys(toNodes)]);

  for (const archId of allArchIds) {
    const oldNode = fromNodes[archId];
    const newNode = toNodes[archId];

    if (!oldNode && newNode) {
      // Added
      changes.push({
        archId,
        type: 'added',
        newNode,
      });
    } else if (oldNode && !newNode) {
      // Removed
      changes.push({
        archId,
        type: 'removed',
        oldNode,
      });
    } else if (oldNode && newNode) {
      // Check for modifications
      const nodeChanges = compareNodes(oldNode, newNode);
      if (nodeChanges) {
        changes.push({
          archId,
          type: 'modified',
          ...nodeChanges,
          oldNode,
          newNode,
        });
      }
    }
  }

  return changes;
}

/**
 * Compare mixin definitions between two registries.
 */
function compareMixins(
  fromMixins: Record<string, ArchitectureNode>,
  toMixins: Record<string, ArchitectureNode>
): MixinChange[] {
  const changes: MixinChange[] = [];
  const allMixinIds = new Set([...Object.keys(fromMixins), ...Object.keys(toMixins)]);

  for (const mixinId of allMixinIds) {
    const oldNode = fromMixins[mixinId];
    const newNode = toMixins[mixinId];

    if (!oldNode && newNode) {
      changes.push({
        mixinId,
        type: 'added',
        newNode,
      });
    } else if (oldNode && !newNode) {
      changes.push({
        mixinId,
        type: 'removed',
        oldNode,
      });
    } else if (oldNode && newNode) {
      const nodeChanges = compareNodes(oldNode, newNode);
      if (nodeChanges?.constraintChanges) {
        changes.push({
          mixinId,
          type: 'modified',
          constraintChanges: nodeChanges.constraintChanges,
          oldNode,
          newNode,
        });
      }
    }
  }

  return changes;
}

/**
 * Compare two architecture nodes for changes.
 */
function compareNodes(
  oldNode: ArchitectureNode,
  newNode: ArchitectureNode
): Partial<ArchitectureChange> | null {
  const changes: Partial<ArchitectureChange> = {};
  let hasChanges = false;

  // Compare constraints
  const constraintChanges = compareConstraints(
    oldNode.constraints || [],
    newNode.constraints || []
  );
  if (constraintChanges.length > 0) {
    changes.constraintChanges = constraintChanges;
    hasChanges = true;
  }

  // Compare inherits
  if (oldNode.inherits !== newNode.inherits) {
    changes.inheritsChange = {
      old: oldNode.inherits,
      new: newNode.inherits,
    };
    hasChanges = true;
  }

  // Compare mixins
  const oldMixins = new Set(oldNode.mixins || []);
  const newMixins = new Set(newNode.mixins || []);
  const addedMixins = [...newMixins].filter(m => !oldMixins.has(m));
  const removedMixins = [...oldMixins].filter(m => !newMixins.has(m));
  if (addedMixins.length > 0 || removedMixins.length > 0) {
    changes.mixinChanges = {
      added: addedMixins,
      removed: removedMixins,
    };
    hasChanges = true;
  }

  // Compare description
  if (oldNode.description !== newNode.description) {
    changes.descriptionChange = {
      old: oldNode.description,
      new: newNode.description,
    };
    hasChanges = true;
  }

  return hasChanges ? changes : null;
}

/**
 * Compare constraint arrays for changes.
 */
function compareConstraints(
  oldConstraints: Constraint[],
  newConstraints: Constraint[]
): ConstraintChange[] {
  const changes: ConstraintChange[] = [];

  // Build maps by rule+value key for comparison
  const oldMap = new Map<string, Constraint>();
  const newMap = new Map<string, Constraint>();

  for (const c of oldConstraints) {
    const key = makeConstraintKey(c);
    oldMap.set(key, c);
  }

  for (const c of newConstraints) {
    const key = makeConstraintKey(c);
    newMap.set(key, c);
  }

  // Find added and modified
  for (const [key, newConstraint] of newMap) {
    const oldConstraint = oldMap.get(key);
    if (!oldConstraint) {
      // Added
      changes.push({
        type: 'added',
        rule: newConstraint.rule,
        newValue: newConstraint.value,
        newSeverity: newConstraint.severity,
      });
    } else {
      // Check for modifications (e.g., severity change)
      if (oldConstraint.severity !== newConstraint.severity) {
        changes.push({
          type: 'modified',
          rule: newConstraint.rule,
          oldValue: oldConstraint.value,
          newValue: newConstraint.value,
          oldSeverity: oldConstraint.severity,
          newSeverity: newConstraint.severity,
        });
      }
    }
  }

  // Find removed
  for (const [key, oldConstraint] of oldMap) {
    if (!newMap.has(key)) {
      changes.push({
        type: 'removed',
        rule: oldConstraint.rule,
        oldValue: oldConstraint.value,
        oldSeverity: oldConstraint.severity,
      });
    }
  }

  return changes;
}

// Constraint key generation delegated to makeConstraintKey from ../../utils/format.js

/**
 * Find files affected by architecture changes.
 */
async function findAffectedFiles(
  archChanges: ArchitectureChange[],
  _mixinChanges: MixinChange[],
  projectRoot: string,
  filePatterns?: string[]
): Promise<AffectedFile[]> {
  const affected: AffectedFile[] = [];
  const patterns = filePatterns || ['src/**/*.ts', 'src/**/*.tsx'];

  // Get all source files
  const files = await globFiles(patterns, {
    cwd: projectRoot,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
  });

  // Build sets for quick lookup
  const addedArchIds = new Set(
    archChanges.filter(c => c.type === 'added').map(c => c.archId)
  );
  const removedArchIds = new Set(
    archChanges.filter(c => c.type === 'removed').map(c => c.archId)
  );
  const modifiedArchIds = new Set(
    archChanges.filter(c => c.type === 'modified').map(c => c.archId)
  );

  // FUTURE: Check if file uses affected mixins via inheritance chain resolution
  // const affectedMixins = new Set(mixinChanges.map(c => c.mixinId));

  // Scan files for @arch tags
  for (const filePath of files) {
    try {
      const content = await readFile(filePath);
      const archId = extractArchId(content);

      if (!archId) continue;

      // Check direct architecture changes
      if (addedArchIds.has(archId)) {
        affected.push({
          filePath,
          archId,
          reason: 'new_arch',
        });
      } else if (removedArchIds.has(archId)) {
        affected.push({
          filePath,
          archId,
          reason: 'removed_arch',
        });
      } else if (modifiedArchIds.has(archId)) {
        affected.push({
          filePath,
          archId,
          reason: 'constraint_change',
        });
      }

      // FUTURE: Check if file uses affected mixins (requires full inheritance chain resolution)
    } catch { /* file read or parse error */
      // Skip files that can't be read
    }
  }

  return affected;
}
