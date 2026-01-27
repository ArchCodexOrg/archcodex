/**
 * @arch archcodex.core.domain
 *
 * Registry health analysis - detects unused architectures and bloat.
 */
import { loadRegistry, listArchitectureIds } from '../registry/loader.js';
import {
  detectSimilarArchitectures,
  detectRedundantArchitectures,
  detectDeepInheritance,
  detectLowUsageArchitectures,
  detectSingletonViolations,
  type BloatDetectorOptions,
} from './bloat-detector.js';
import type {
  ArchUsage,
  RegistryHealth,
} from './types.js';

/**
 * Analyzes registry health metrics (unused architectures, bloat, etc).
 */
export class RegistryAnalyzer {
  constructor(private projectRoot: string) {}

  async analyze(
    usedArchIds: string[],
    archUsage: ArchUsage[],
    filesByArch: Map<string, string[]>,
    bloatOptions: BloatDetectorOptions,
    preloadedRegistry?: Awaited<ReturnType<typeof loadRegistry>>
  ): Promise<RegistryHealth> {
    const registry = preloadedRegistry ?? await loadRegistry(this.projectRoot);
    const allArchIds = listArchitectureIds(registry);
    const usedSet = new Set(usedArchIds);

    // Find architectures that are inherited by others (parent architectures)
    const inheritedArchIds = new Set<string>();
    for (const archId of allArchIds) {
      const node = registry.nodes[archId];
      if (node?.inherits) {
        inheritedArchIds.add(node.inherits);
      }
    }

    // An architecture is truly unused if:
    // - No files use it directly AND
    // - No other architectures inherit from it
    const unusedArchIds = allArchIds.filter(id =>
      !usedSet.has(id) && !inheritedArchIds.has(id)
    );

    const totalArchitectures = allArchIds.length;
    const usedArchitectures = allArchIds.length - unusedArchIds.length;
    const usagePercent = totalArchitectures > 0
      ? Math.round((usedArchitectures / totalArchitectures) * 100)
      : 100;

    // Detect bloat: similar architectures, redundant archs, deep inheritance, low usage
    const similarArchitectures = detectSimilarArchitectures(registry, allArchIds, bloatOptions);
    const redundantArchitectures = detectRedundantArchitectures(registry, allArchIds);
    const deepInheritance = detectDeepInheritance(registry, allArchIds, bloatOptions);
    const lowUsageArchitectures = detectLowUsageArchitectures(archUsage, registry, bloatOptions);
    const singletonViolations = detectSingletonViolations(filesByArch, registry);

    return {
      totalArchitectures,
      usedArchitectures,
      unusedArchitectures: unusedArchIds.length,
      unusedArchIds,
      usagePercent,
      similarArchitectures: similarArchitectures.length > 0 ? similarArchitectures : undefined,
      redundantArchitectures: redundantArchitectures.length > 0 ? redundantArchitectures : undefined,
      deepInheritance: deepInheritance.length > 0 ? deepInheritance : undefined,
      lowUsageArchitectures: lowUsageArchitectures.length > 0 ? lowUsageArchitectures : undefined,
      singletonViolations: singletonViolations.length > 0 ? singletonViolations : undefined,
    };
  }
}
