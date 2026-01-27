/**
 * @arch archcodex.core.domain
 *
 * Detects when the discovery index is out of sync with the registry.
 */
import { computeChecksum } from '../../utils/checksum.js';
import { loadIndex, indexExists } from './loader.js';
import { loadRegistry, listArchitectureIds, getRegistryContent } from '../registry/loader.js';

/**
 * Reasons why an index might be stale.
 */
export type StalenessReason =
  | 'no_checksum'         // Index exists but has no checksum (legacy)
  | 'checksum_mismatch'   // Registry has been modified
  | 'missing_architectures' // Some architectures not in index
  | 'no_index';           // Index file doesn't exist

/**
 * Result of staleness check.
 */
export interface StalenessResult {
  /** Whether the index is stale and needs updating */
  isStale: boolean;
  /** The reason for staleness (if stale) */
  reason?: StalenessReason;
  /** Architecture IDs in registry but missing from index */
  missingArchIds?: string[];
  /** Architecture IDs in index but not in registry */
  extraArchIds?: string[];
  /** Current checksum of registry.yaml */
  currentChecksum: string;
  /** Stored checksum in index.yaml (if present) */
  storedChecksum?: string;
}

/**
 * Check if the discovery index is stale relative to the registry.
 *
 * An index is considered stale if:
 * 1. The index file doesn't exist
 * 2. The index has no registry_checksum field (legacy format)
 * 3. The stored checksum doesn't match the current registry checksum
 * 4. There are architectures in the registry that aren't in the index
 */
export async function checkIndexStaleness(
  projectRoot: string
): Promise<StalenessResult> {
  // Read registry content (supports both single file and multi-file registry)
  const registryContent = await getRegistryContent(projectRoot);

  // If registry doesn't exist or is empty, we can't determine staleness
  if (!registryContent) {
    return {
      isStale: false,
      currentChecksum: '',
    };
  }

  const currentChecksum = computeChecksum(registryContent);

  // Check if index exists
  const hasIndex = await indexExists(projectRoot);
  if (!hasIndex) {
    return {
      isStale: true,
      reason: 'no_index',
      currentChecksum,
    };
  }

  // Load index and registry
  const index = await loadIndex(projectRoot);
  const registry = await loadRegistry(projectRoot);

  // Check for missing checksum (legacy index)
  if (!index.registry_checksum) {
    const registryIds = listArchitectureIds(registry);
    const indexedIds = new Set(index.entries.map((e) => e.arch_id));
    const missingArchIds = registryIds.filter((id) => !indexedIds.has(id));
    const extraArchIds = [...indexedIds].filter((id) => !(id in registry.nodes));

    return {
      isStale: true,
      reason: 'no_checksum',
      currentChecksum,
      missingArchIds: missingArchIds.length > 0 ? missingArchIds : undefined,
      extraArchIds: extraArchIds.length > 0 ? extraArchIds : undefined,
    };
  }

  // Check checksum match
  if (index.registry_checksum !== currentChecksum) {
    const registryIds = listArchitectureIds(registry);
    const indexedIds = new Set(index.entries.map((e) => e.arch_id));
    const missingArchIds = registryIds.filter((id) => !indexedIds.has(id));
    const extraArchIds = [...indexedIds].filter((id) => !(id in registry.nodes));

    return {
      isStale: true,
      reason: 'checksum_mismatch',
      currentChecksum,
      storedChecksum: index.registry_checksum,
      missingArchIds: missingArchIds.length > 0 ? missingArchIds : undefined,
      extraArchIds: extraArchIds.length > 0 ? extraArchIds : undefined,
    };
  }

  // Even with matching checksum, verify no missing architectures
  const registryIds = listArchitectureIds(registry);
  const indexedIds = new Set(index.entries.map((e) => e.arch_id));
  const missingArchIds = registryIds.filter((id) => !indexedIds.has(id));

  if (missingArchIds.length > 0) {
    return {
      isStale: true,
      reason: 'missing_architectures',
      currentChecksum,
      storedChecksum: index.registry_checksum,
      missingArchIds,
    };
  }

  // Index is up to date
  return {
    isStale: false,
    currentChecksum,
    storedChecksum: index.registry_checksum,
  };
}

/**
 * Get a human-readable message for staleness result.
 */
export function getStalenessMessage(result: StalenessResult): string {
  if (!result.isStale) {
    return 'Index is up to date.';
  }

  switch (result.reason) {
    case 'no_index':
      return 'Discovery index does not exist. Run "archcodex sync-index" to create it.';
    case 'no_checksum':
      return 'Discovery index is missing checksum (legacy format). Run "archcodex sync-index" to update.';
    case 'checksum_mismatch':
      return 'Registry has been modified. Run "archcodex sync-index" to update the index.';
    case 'missing_architectures':
      return `Index is missing ${result.missingArchIds?.length ?? 0} architecture(s). Run "archcodex sync-index" to update.`;
    default:
      return 'Index may be out of date. Run "archcodex sync-index" to verify.';
  }
}
