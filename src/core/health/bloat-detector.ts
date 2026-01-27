/**
 * @arch archcodex.core.domain
 *
 * Registry bloat detection: identifies similar, redundant, and deeply nested architectures.
 */
import { resolveArchitecture } from '../registry/resolver.js';
import type { Registry } from '../registry/schema.js';
import type { SimilarArchPair, RedundantArch, DeepInheritance, LowUsageArch, ArchUsage, SingletonViolation } from './types.js';

/** Default minimum Jaccard similarity to flag as similar */
const DEFAULT_SIMILARITY_THRESHOLD = 0.8;

/** Default maximum inheritance depth before flagging */
const DEFAULT_MAX_DEPTH = 4;

/** Default threshold for low usage detection (flag archs with <= this many files) */
const DEFAULT_LOW_USAGE_THRESHOLD = 2;

/**
 * Options for bloat detection functions.
 * All thresholds can be configured via .arch/config.yaml under the `health` key.
 */
export interface BloatDetectorOptions {
  /** Minimum Jaccard similarity to flag as similar (0-1, default: 0.8) */
  similarityThreshold?: number;
  /** Maximum inheritance depth before flagging (default: 4) */
  maxInheritanceDepth?: number;
  /** Maximum files to consider "low usage" (default: 2) */
  lowUsageThreshold?: number;
  /** Compare only direct constraints, excluding inherited (default: true) */
  excludeInheritedSimilarity?: boolean;
}

/**
 * Detect similar architectures based on constraint overlap.
 * By default, compares only DIRECT constraints (what each architecture adds),
 * excluding inherited constraints from parent architectures.
 * This prevents false positives where siblings appear similar simply because
 * they share a common parent's constraints.
 */
export function detectSimilarArchitectures(registry: Registry, archIds: string[], options?: BloatDetectorOptions): SimilarArchPair[] {
  const similar: SimilarArchPair[] = [];
  const constraintSets = new Map<string, Set<string>>();
  const threshold = options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const excludeInherited = options?.excludeInheritedSimilarity ?? true;

  // Build constraint sets for each architecture
  for (const archId of archIds) {
    const node = registry.nodes[archId];
    if (!node) continue;

    let constraints: Set<string>;

    if (excludeInherited) {
      // Compare DIRECT constraints only (what this arch adds on top of parent)
      const directConstraints = node.constraints ?? [];
      constraints = new Set(
        directConstraints.map(c => `${c.rule}:${JSON.stringify(c.value)}`)
      );
    } else {
      // Legacy: compare resolved constraints (includes all inherited)
      try {
        const resolved = resolveArchitecture(registry, archId);
        constraints = new Set(
          resolved.architecture.constraints.map(c => `${c.rule}:${JSON.stringify(c.value)}`)
        );
      } catch {
        continue;
      }
    }

    constraintSets.set(archId, constraints);
  }

  // Compare sibling architectures (same parent)
  const siblingGroups = new Map<string, string[]>();
  for (const archId of archIds) {
    const node = registry.nodes[archId];
    // Skip root architectures - they have no siblings
    if (!node?.inherits) continue;
    const parent = node.inherits;
    if (!siblingGroups.has(parent)) {
      siblingGroups.set(parent, []);
    }
    siblingGroups.get(parent)!.push(archId);
  }

  // Check similarity within each sibling group
  for (const siblings of siblingGroups.values()) {
    if (siblings.length < 2) continue;

    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const arch1 = siblings[i];
        const arch2 = siblings[j];
        const set1 = constraintSets.get(arch1);
        const set2 = constraintSets.get(arch2);

        if (!set1 || !set2) continue;

        // Skip pairs where both have empty direct constraint sets
        if (set1.size === 0 && set2.size === 0) continue;

        // Calculate Jaccard similarity
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        const similarity = union.size > 0 ? intersection.size / union.size : 0;

        if (similarity >= threshold && intersection.size > 0) {
          similar.push({
            archId1: arch1,
            archId2: arch2,
            similarity: Math.round(similarity * 100) / 100,
            reason: `${intersection.size} shared direct constraints, consider consolidating with mixins`,
          });
        }
      }
    }
  }

  return similar;
}

/**
 * Detect redundant architectures that add no unique constraints.
 * Flags leaf nodes with no constraints, mixins, hints, or pointers.
 */
export function detectRedundantArchitectures(registry: Registry, archIds: string[]): RedundantArch[] {
  const redundant: RedundantArch[] = [];

  for (const archId of archIds) {
    const node = registry.nodes[archId];
    if (!node?.inherits) continue; // Skip root architectures

    // Check if this arch adds any unique constraints
    const directConstraints = node.constraints ?? [];
    const hasMixins = (node.mixins ?? []).length > 0;
    const hasHints = (node.hints ?? []).length > 0;
    const hasPointers = (node.pointers ?? []).length > 0;

    // If no direct constraints, no mixins, no hints, no pointers - it's likely redundant
    if (directConstraints.length === 0 && !hasMixins && !hasHints && !hasPointers) {
      // But only flag if it's a leaf node (not inherited by others)
      const isInherited = archIds.some(id => registry.nodes[id]?.inherits === archId);
      if (!isInherited) {
        redundant.push({
          archId,
          parentArchId: node.inherits,
          reason: 'No constraints, mixins, hints, or pointers - could use parent directly',
        });
      }
    }
  }

  return redundant;
}

/**
 * Detect deep inheritance chains exceeding the configured depth.
 * Default threshold is 4 levels.
 */
export function detectDeepInheritance(registry: Registry, archIds: string[], options?: BloatDetectorOptions): DeepInheritance[] {
  const maxDepth = options?.maxInheritanceDepth ?? DEFAULT_MAX_DEPTH;
  const deep: DeepInheritance[] = [];

  for (const archId of archIds) {
    const chain: string[] = [archId];
    let current = archId;

    // Walk up the inheritance chain
    while (registry.nodes[current]?.inherits) {
      const parent = registry.nodes[current].inherits!;
      chain.push(parent);
      current = parent;

      // Safety limit to avoid infinite loops
      if (chain.length > 10) break;
    }

    if (chain.length > maxDepth) {
      deep.push({
        archId,
        chain: chain.reverse(),
        depth: chain.length,
      });
    }
  }

  return deep;
}

/**
 * Detect architectures with low file usage (potentially over-specific).
 * @param archUsage - File counts per architecture from coverage metrics
 * @param registry - Registry to check for parent architectures
 * @param options - Configurable thresholds (uses lowUsageThreshold, default: 2)
 */
export function detectLowUsageArchitectures(
  archUsage: ArchUsage[],
  registry: Registry,
  options?: BloatDetectorOptions
): LowUsageArch[] {
  const threshold = options?.lowUsageThreshold ?? DEFAULT_LOW_USAGE_THRESHOLD;
  const lowUsage: LowUsageArch[] = [];

  for (const usage of archUsage) {
    if (usage.fileCount > threshold) continue;

    // Skip root architectures (base, etc.) - they're meant to be inherited
    const node = registry.nodes[usage.archId];
    if (!node) continue;

    // Skip architectures that are inherited by others (they're structural)
    const isInherited = Object.values(registry.nodes).some(n => n.inherits === usage.archId);
    if (isInherited) continue;

    // Skip singletons - they're intentionally single-file
    if (node.singleton) continue;

    const parentId = node.inherits;
    const severity = usage.fileCount === 1 ? 'warning' : 'info';
    const suggestion = parentId
      ? `Consider using parent '${parentId}' with mixins instead`
      : 'Consider if a dedicated architecture is needed';

    lowUsage.push({
      archId: usage.archId,
      fileCount: usage.fileCount,
      severity,
      suggestion,
    });
  }

  // Sort by file count (lowest first), then by archId
  return lowUsage.sort((a, b) => a.fileCount - b.fileCount || a.archId.localeCompare(b.archId));
}

/**
 * Detect singleton architectures used by multiple files.
 * @param filesByArch - Map of architecture ID to files using it
 * @param registry - Registry to check for singleton flags
 */
export function detectSingletonViolations(
  filesByArch: Map<string, string[]>,
  registry: Registry
): SingletonViolation[] {
  const violations: SingletonViolation[] = [];

  for (const [archId, files] of filesByArch) {
    const node = registry.nodes[archId];
    if (!node?.singleton) continue;

    // Singleton should only be used by one file
    if (files.length > 1) {
      violations.push({
        archId,
        fileCount: files.length,
        files: files.slice().sort(), // Sort for consistent output
      });
    }
  }

  return violations.sort((a, b) => b.fileCount - a.fileCount || a.archId.localeCompare(b.archId));
}
