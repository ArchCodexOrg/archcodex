/**
 * @arch archcodex.core.domain.resolver
 */
import type { Registry, Constraint, Pointer, ArchitectureNode } from './schema.js';
import type {
  FlattenedArchitecture,
  ResolvedConstraint,
  ResolvedHint,
  ConflictReport,
  ResolutionResult,
} from './types.js';
import { RegistryError, ErrorCodes } from '../../utils/errors.js';
import { getPatternFromConstraint } from '../constraints/pattern-utils.js';
import { makeConstraintKey } from '../../utils/format.js';

/**
 * Options for resolving an architecture.
 */
export interface ResolveOptions {
  /** Inline mixins from @arch tag (e.g., @arch archId +mixin1 +mixin2) */
  inlineMixins?: string[];
}

/**
 * Resolve an architecture ID to its fully flattened form.
 * Handles inheritance, mixins, and conflict resolution.
 *
 * Precedence (highest to lowest):
 * 1. Self (the current architecture node)
 * 2. Inline mixins (from @arch tag, processed after registry mixins - last wins)
 * 3. Registry mixins (in declaration order - last wins)
 * 4. Parent (inherited constraints)
 *
 * Special rules:
 * - allow_import explicitly removes matching forbid_import
 * - allow_pattern explicitly removes matching forbid_pattern
 * - forbid_* beats require_* when in conflict
 */
export function resolveArchitecture(
  registry: Registry,
  archId: string,
  options?: ResolveOptions
): ResolutionResult {
  // Validate architecture exists
  if (!registry.nodes[archId]) {
    throw new RegistryError(
      ErrorCodes.UNKNOWN_ARCH,
      `Architecture '${archId}' not found in registry`,
      { archId, available: Object.keys(registry.nodes) }
    );
  }

  const inheritanceChain: string[] = [];
  const appliedMixins: string[] = [];
  const conflicts: ConflictReport[] = [];
  const visited = new Set<string>();

  // Build inheritance chain (detect cycles)
  buildInheritanceChain(registry, archId, inheritanceChain, visited);

  // Collect constraints from inheritance chain (parent first, child last)
  const reversedChain = [...inheritanceChain].reverse();
  const constraintMap = new Map<string, ResolvedConstraint>();
  const hintMap = new Map<string, ResolvedHint>();
  const pointerMap = new Map<string, Pointer>();

  // Process inheritance chain (parent → child)
  // Note: Skip leaf node's exclude_constraints here - they're applied after mixins
  for (const nodeId of reversedChain) {
    const node = registry.nodes[nodeId];
    if (!node) continue;

    processNodeConstraints(node, nodeId, constraintMap, conflicts);
    // Apply exclude_constraints after processing node's own constraints
    // (but skip leaf node - its exclusions are applied after mixin processing)
    if (nodeId !== archId) {
      applyExcludeConstraints(node, nodeId, constraintMap, conflicts);
    }
    processNodeHints(node, hintMap);
    processNodePointers(node, pointerMap);
  }

  // Process mixins for the leaf node (in declaration order, last wins)
  // Inline mixins are processed after registry mixins (higher precedence)
  const leafNode = registry.nodes[archId];
  const registryMixins = leafNode?.mixins || [];
  const inlineMixins = options?.inlineMixins || [];
  const allMixins = [...registryMixins, ...inlineMixins];

  if (allMixins.length > 0) {
    // First, detect conflicts between mixins before processing
    detectMixinConflicts(registry, allMixins, conflicts);

    // Validate inline mixin usage modes
    validateMixinInlineUsage(registry, registryMixins, inlineMixins, archId, conflicts);

    for (const mixinId of allMixins) {
      const mixin = registry.mixins[mixinId];
      if (!mixin) {
        throw new RegistryError(
          ErrorCodes.MISSING_MIXIN,
          `Mixin '${mixinId}' not found in registry`,
          { mixinId, archId, available: Object.keys(registry.mixins) }
        );
      }

      appliedMixins.push(mixinId);
      processNodeConstraints(mixin, `mixin:${mixinId}`, constraintMap, conflicts);
      // Note: Mixins don't support exclude_constraints - only architecture nodes do
      processNodeHints(mixin, hintMap);
      processNodePointers(mixin, pointerMap);
    }
  }

  // Process self constraints (highest priority, overrides everything)
  processNodeConstraints(leafNode, archId, constraintMap, conflicts);
  // Apply leaf node's exclude_constraints last (can exclude mixin constraints too)
  applyExcludeConstraints(leafNode, archId, constraintMap, conflicts);

  // Handle allow_import removing forbid_import
  processAllowImports(constraintMap, conflicts, archId);

  // Handle allow_pattern removing forbid_pattern
  processAllowPatterns(constraintMap, conflicts, archId);

  // Resolve forbid/require conflicts (forbid wins)
  resolveForbidRequireConflicts(constraintMap, conflicts);

  // Build final architecture
  const architecture: FlattenedArchitecture = {
    archId,
    inheritanceChain,
    appliedMixins,
    constraints: Array.from(constraintMap.values()),
    hints: Array.from(hintMap.values()),
    pointers: Array.from(pointerMap.values()),
    contract: leafNode?.contract,
    description: leafNode?.description,
    rationale: leafNode?.rationale,
    kind: leafNode?.kind,
    version: leafNode?.version,
    deprecated_from: leafNode?.deprecated_from,
    migration_guide: leafNode?.migration_guide,
    reference_implementations: leafNode?.reference_implementations,
    file_pattern: leafNode?.file_pattern,
    default_path: leafNode?.default_path,
    code_pattern: leafNode?.code_pattern,
    expected_intents: leafNode?.expected_intents,
    suggested_intents: leafNode?.suggested_intents,
  };

  return { architecture, conflicts };
}

/**
 * Build the inheritance chain by traversing parents.
 */
function buildInheritanceChain(
  registry: Registry,
  archId: string,
  chain: string[],
  visited: Set<string>
): void {
  if (visited.has(archId)) {
    throw new RegistryError(
      ErrorCodes.CIRCULAR_INHERITANCE,
      `Circular inheritance detected: ${Array.from(visited).join(' → ')} → ${archId}`,
      { cycle: [...visited, archId] }
    );
  }

  visited.add(archId);
  chain.push(archId);

  const node = registry.nodes[archId];
  if (node?.inherits) {
    if (!registry.nodes[node.inherits]) {
      throw new RegistryError(
        ErrorCodes.UNKNOWN_ARCH,
        `Parent architecture '${node.inherits}' not found (referenced by '${archId}')`,
        { archId, parent: node.inherits }
      );
    }
    buildInheritanceChain(registry, node.inherits, chain, visited);
  }
}

/**
 * Process constraints from a node into the constraint map.
 * Handles the `override` flag which removes ALL parent constraints with the same rule.
 */
function processNodeConstraints(
  node: ArchitectureNode,
  source: string,
  constraintMap: Map<string, ResolvedConstraint>,
  conflicts: ConflictReport[]
): void {
  if (!node.constraints) return;

  for (const constraint of node.constraints) {
    // Handle override flag: remove ALL existing constraints with the same rule
    if (constraint.override) {
      const toRemove: string[] = [];
      for (const [key, existing] of constraintMap) {
        if (existing.rule === constraint.rule) {
          toRemove.push(key);
          conflicts.push({
            rule: constraint.rule,
            value: String(existing.value),
            winner: source,
            loser: existing.source,
            resolution: `'${source}' override flag removes '${existing.source}' constraint (rule: ${constraint.rule})`,
            severity: 'info',
          });
        }
      }
      for (const key of toRemove) {
        constraintMap.delete(key);
      }
    }

    const key = makeConstraintKey(constraint);
    const existing = constraintMap.get(key);

    if (existing && existing.source !== source) {
      // Track conflict
      conflicts.push({
        rule: constraint.rule,
        value: String(constraint.value),
        winner: source,
        loser: existing.source,
        resolution: `'${source}' overrides '${existing.source}' due to precedence`,
        severity: 'info',
      });
    }

    constraintMap.set(key, {
      ...constraint,
      source,
    });
  }
}

/**
 * Apply exclude_constraints from a node - removes matching constraints from the map.
 * Patterns can be "rule:value" (e.g., "forbid_import:console") or just "rule" (e.g., "max_file_lines").
 */
function applyExcludeConstraints(
  node: ArchitectureNode,
  source: string,
  constraintMap: Map<string, ResolvedConstraint>,
  conflicts: ConflictReport[]
): void {
  if (!node.exclude_constraints) return;

  for (const exclusion of node.exclude_constraints) {
    const toRemove: string[] = [];

    for (const [key, constraint] of constraintMap) {
      // Match "rule:value" exactly
      if (key === exclusion) {
        toRemove.push(key);
      }
      // Match just "rule" (removes all constraints with that rule)
      else if (exclusion === constraint.rule) {
        toRemove.push(key);
      }
      // Match "rule:" prefix (e.g., "forbid_import:" removes all forbid_import)
      else if (exclusion.endsWith(':') && key.startsWith(exclusion)) {
        toRemove.push(key);
      }
    }

    // Warn if exclusion didn't match any constraint
    if (toRemove.length === 0) {
      conflicts.push({
        rule: 'exclude_constraints',
        value: exclusion,
        winner: source,
        loser: source,
        resolution: `exclude_constraints pattern '${exclusion}' doesn't match any inherited constraint`,
        severity: 'warning',
      });
    }

    for (const key of toRemove) {
      const removed = constraintMap.get(key)!;
      conflicts.push({
        rule: removed.rule,
        value: String(removed.value),
        winner: source,
        loser: removed.source,
        resolution: `'${source}' exclude_constraints removes '${removed.source}' constraint matching '${exclusion}'`,
        severity: 'info',
      });
      constraintMap.delete(key);
    }
  }
}

/**
 * Process hints from a node.
 * Normalizes string hints to { text: string } form.
 */
function processNodeHints(node: ArchitectureNode, hintMap: Map<string, ResolvedHint>): void {
  if (!node.hints) return;
  for (const hint of node.hints) {
    // Normalize to object form
    const resolved: ResolvedHint = typeof hint === 'string'
      ? { text: hint }
      : { text: hint.text, example: hint.example };

    // Use text as key for deduplication
    hintMap.set(resolved.text, resolved);
  }
}

/**
 * Process pointers from a node.
 */
function processNodePointers(
  node: ArchitectureNode,
  pointerMap: Map<string, Pointer>
): void {
  if (!node.pointers) return;
  for (const pointer of node.pointers) {
    pointerMap.set(pointer.uri, pointer);
  }
}

/**
 * Handle allow_import constraints - they remove matching forbid_import.
 */
function processAllowImports(
  constraintMap: Map<string, ResolvedConstraint>,
  conflicts: ConflictReport[],
  _selfSource: string
): void {
  // Find all allow_import from the registry (would need node access)
  // For now, we'll check if any current constraints can be removed
  const toRemove: string[] = [];

  for (const [key, constraint] of constraintMap) {
    if (constraint.rule === 'allow_import') {
      const rawValues = Array.isArray(constraint.value)
        ? constraint.value
        : [constraint.value];
      // allow_import values are always strings
      const values = rawValues.filter((v): v is string => typeof v === 'string');

      for (const value of values) {
        const forbidKey = `forbid_import:${value}`;
        if (constraintMap.has(forbidKey)) {
          toRemove.push(forbidKey);
          conflicts.push({
            rule: 'allow_import',
            value,
            winner: constraint.source,
            loser: constraintMap.get(forbidKey)!.source,
            resolution: `allow_import:${value} explicitly removes forbid_import:${value}`,
            severity: 'info',
          });
        }
      }
      // Remove the allow_import itself
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    constraintMap.delete(key);
  }
}

/**
 * Handle allow_pattern constraints - they remove matching forbid_pattern.
 * Matches are based on the pattern field (regex string).
 */
function processAllowPatterns(
  constraintMap: Map<string, ResolvedConstraint>,
  conflicts: ConflictReport[],
  _selfSource: string
): void {
  const toRemove: string[] = [];

  for (const [key, constraint] of constraintMap) {
    if (constraint.rule === 'allow_pattern') {
      // Get pattern from allow_pattern - could be in pattern field or value
      const allowPattern = getPatternFromConstraint(constraint);

      if (allowPattern) {
        // Find matching forbid_pattern
        for (const [forbidKey, forbidConstraint] of constraintMap) {
          if (forbidConstraint.rule === 'forbid_pattern') {
            const forbidPattern = getPatternFromConstraint(forbidConstraint);
            if (forbidPattern === allowPattern) {
              toRemove.push(forbidKey);
              conflicts.push({
                rule: 'allow_pattern',
                value: allowPattern,
                winner: constraint.source,
                loser: forbidConstraint.source,
                resolution: `allow_pattern explicitly removes forbid_pattern with pattern: ${allowPattern}`,
                severity: 'info',
              });
            }
          }
        }
      }
      // Remove the allow_pattern itself
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    constraintMap.delete(key);
  }
}


/**
 * Resolve forbid/require conflicts (forbid wins).
 */
function resolveForbidRequireConflicts(
  constraintMap: Map<string, ResolvedConstraint>,
  conflicts: ConflictReport[]
): void {
  const toRemove: string[] = [];

  for (const [key, constraint] of constraintMap) {
    if (constraint.rule === 'require_decorator') {
      const forbidKey = `forbid_decorator:${constraint.value}`;
      if (constraintMap.has(forbidKey)) {
        toRemove.push(key);
        conflicts.push({
          rule: 'decorator_conflict',
          value: String(constraint.value),
          winner: 'forbid_decorator',
          loser: 'require_decorator',
          resolution: 'forbid_decorator takes precedence (deny wins)',
          severity: 'warning',
        });
      }
    }

    if (constraint.rule === 'require_import') {
      const rawValues = Array.isArray(constraint.value)
        ? constraint.value
        : [constraint.value];
      // require_import values are always strings
      const values = rawValues.filter((v): v is string => typeof v === 'string');

      for (const value of values) {
        const forbidKey = `forbid_import:${value}`;
        if (constraintMap.has(forbidKey)) {
          // This is an unresolvable conflict - both can't be true
          // For now, we keep both and let validation fail
          conflicts.push({
            rule: 'import_conflict',
            value,
            winner: 'both',
            loser: 'none',
            resolution: `Unresolvable: require_import:${value} conflicts with forbid_import:${value}`,
            severity: 'error',
          });
        }
      }
    }
  }

  for (const key of toRemove) {
    constraintMap.delete(key);
  }
}

/**
 * Validate inline mixin usage modes.
 * Emits warnings for:
 * - Mixins with inline:'forbidden' used as inline (+mixin)
 * - Mixins with inline:'only' used in registry mixins:[]
 */
function validateMixinInlineUsage(
  registry: Registry,
  registryMixins: string[],
  inlineMixins: string[],
  archId: string,
  conflicts: ConflictReport[]
): void {
  // Check inline mixins for 'forbidden' mode
  for (const mixinId of inlineMixins) {
    const mixin = registry.mixins[mixinId];
    if (mixin?.inline === 'forbidden') {
      conflicts.push({
        rule: 'mixin_inline_forbidden',
        value: mixinId,
        winner: archId,
        loser: `mixin:${mixinId}`,
        resolution: `Mixin '${mixinId}' has inline:'forbidden' but is used inline (+${mixinId}). Move to registry mixins:[] instead.`,
        severity: 'warning',
      });
    }
  }

  // Check registry mixins for 'only' mode
  for (const mixinId of registryMixins) {
    const mixin = registry.mixins[mixinId];
    if (mixin?.inline === 'only') {
      conflicts.push({
        rule: 'mixin_inline_only',
        value: mixinId,
        winner: archId,
        loser: `mixin:${mixinId}`,
        resolution: `Mixin '${mixinId}' has inline:'only' but is in registry mixins:[]. Use inline (+${mixinId}) instead.`,
        severity: 'warning',
      });
    }
  }
}

/**
 * Detect conflicts between mixins before they are applied.
 * This catches cases where two mixins have contradictory constraints.
 */
function detectMixinConflicts(
  registry: Registry,
  mixinIds: string[],
  conflicts: ConflictReport[]
): void {
  // Collect all constraints from all mixins
  const mixinConstraints: Map<string, { constraint: Constraint; mixinId: string }[]> = new Map();

  for (const mixinId of mixinIds) {
    const mixin = registry.mixins[mixinId];
    if (!mixin?.constraints) continue;

    for (const constraint of mixin.constraints) {
      // Group by rule type for conflict detection
      const key = constraint.rule;
      if (!mixinConstraints.has(key)) {
        mixinConstraints.set(key, []);
      }
      mixinConstraints.get(key)!.push({ constraint, mixinId });
    }
  }

  // Check for forbid vs allow/require conflicts
  const forbidImports = mixinConstraints.get('forbid_import') || [];
  const allowImports = mixinConstraints.get('allow_import') || [];
  const requireImports = mixinConstraints.get('require_import') || [];

  // Check forbid_import vs allow_import
  for (const forbid of forbidImports) {
    const forbidRaw = Array.isArray(forbid.constraint.value) ? forbid.constraint.value : [forbid.constraint.value];
    const forbidValues = forbidRaw.filter((v): v is string => typeof v === 'string');

    for (const allow of allowImports) {
      if (allow.mixinId === forbid.mixinId) continue; // Same mixin, not a conflict

      const allowRaw = Array.isArray(allow.constraint.value) ? allow.constraint.value : [allow.constraint.value];
      const allowValues = allowRaw.filter((v): v is string => typeof v === 'string');

      const overlap = forbidValues.filter((v) => allowValues.includes(v));
      for (const value of overlap) {
        conflicts.push({
          rule: 'mixin_conflict',
          value,
          winner: `mixin:${allow.mixinId}`,
          loser: `mixin:${forbid.mixinId}`,
          resolution: `Mixins conflict: '${allow.mixinId}' allows '${value}' but '${forbid.mixinId}' forbids it`,
          severity: 'warning',
        });
      }
    }
  }

  // Check forbid_import vs require_import
  for (const forbid of forbidImports) {
    const forbidRaw = Array.isArray(forbid.constraint.value) ? forbid.constraint.value : [forbid.constraint.value];
    const forbidValues = forbidRaw.filter((v): v is string => typeof v === 'string');

    for (const require of requireImports) {
      if (require.mixinId === forbid.mixinId) continue;

      const requireRaw = Array.isArray(require.constraint.value) ? require.constraint.value : [require.constraint.value];
      const requireValues = requireRaw.filter((v): v is string => typeof v === 'string');

      const overlap = forbidValues.filter((v) => requireValues.includes(v));
      for (const value of overlap) {
        conflicts.push({
          rule: 'mixin_conflict',
          value,
          winner: 'unresolved',
          loser: 'unresolved',
          resolution: `Mixins conflict: '${require.mixinId}' requires '${value}' but '${forbid.mixinId}' forbids it`,
          severity: 'error',
        });
      }
    }
  }

  // Check forbid_decorator vs require_decorator
  const forbidDecorators = mixinConstraints.get('forbid_decorator') || [];
  const requireDecorators = mixinConstraints.get('require_decorator') || [];

  for (const forbid of forbidDecorators) {
    const forbidValue = String(forbid.constraint.value);

    for (const require of requireDecorators) {
      if (require.mixinId === forbid.mixinId) continue;

      const requireValue = String(require.constraint.value);

      if (forbidValue === requireValue) {
        conflicts.push({
          rule: 'mixin_conflict',
          value: forbidValue,
          winner: 'unresolved',
          loser: 'unresolved',
          resolution: `Mixins conflict: '${require.mixinId}' requires decorator '${forbidValue}' but '${forbid.mixinId}' forbids it`,
          severity: 'error',
        });
      }
    }
  }

  // Check for conflicting max_* values (different limits from different mixins)
  for (const rule of ['max_public_methods', 'max_file_lines'] as const) {
    const maxConstraints = mixinConstraints.get(rule) || [];
    if (maxConstraints.length < 2) continue;

    // Find different values
    const values = new Map<number, string>();
    for (const { constraint, mixinId } of maxConstraints) {
      const value = Number(constraint.value);
      if (!values.has(value)) {
        values.set(value, mixinId);
      }
    }

    if (values.size > 1) {
      const entries = Array.from(values.entries());
      const [min, minMixin] = entries.reduce((a, b) => (a[0] < b[0] ? a : b));
      const [max, maxMixin] = entries.reduce((a, b) => (a[0] > b[0] ? a : b));

      conflicts.push({
        rule: 'mixin_conflict',
        value: `${rule}: ${min} vs ${max}`,
        winner: `mixin:${minMixin}`,
        loser: `mixin:${maxMixin}`,
        resolution: `Mixins have different ${rule} limits: '${minMixin}' sets ${min}, '${maxMixin}' sets ${max} (stricter wins)`,
        severity: 'warning',
      });
    }
  }
}

// makeConstraintKey imported from ../../utils/format.js

/**
 * Get all ancestor IDs for an architecture.
 */
export function getAncestors(registry: Registry, archId: string): string[] {
  const result = resolveArchitecture(registry, archId);
  return result.architecture.inheritanceChain.slice(1); // Exclude self
}

/**
 * Get all constraints for an architecture (flattened).
 */
export function getConstraints(
  registry: Registry,
  archId: string
): ResolvedConstraint[] {
  const result = resolveArchitecture(registry, archId);
  return result.architecture.constraints;
}

/**
 * Get all hints for an architecture (flattened).
 */
export function getHints(registry: Registry, archId: string): ResolvedHint[] {
  const result = resolveArchitecture(registry, archId);
  return result.architecture.hints;
}

/**
 * Get all pointers for an architecture (flattened).
 */
export function getPointers(registry: Registry, archId: string): Pointer[] {
  const result = resolveArchitecture(registry, archId);
  return result.architecture.pointers;
}
