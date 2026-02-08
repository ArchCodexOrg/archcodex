/**
 * @arch archcodex.core.domain
 * @intent:stateless
 *
 * Other checker — detects miscellaneous issues from spec schemas.
 * 10 analyses (OTH-7 reserved): OTH-1 through OTH-10.
 */

import type {
  AnalysisIssue,
  AnalysisContext,
  Checker,
  ResolvedSpecEntry,
  CrossReferenceGraph,
} from '../types.js';
import type { SpecNode } from '../../spec/schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEffects(node: SpecNode): Record<string, unknown>[] {
  return (node.effects as Record<string, unknown>[]) ?? [];
}

function getArchitectures(node: SpecNode): string[] {
  return (node.architectures as string[]) ?? [];
}

function getInvariants(node: SpecNode): unknown[] {
  return (node.invariants as unknown[]) ?? [];
}

function getErrorExamples(node: SpecNode): Record<string, unknown>[] {
  const examples = node.examples as Record<string, unknown> | undefined;
  return (examples?.errors as Record<string, unknown>[]) ?? [];
}

function hasErrorCode(node: SpecNode, pattern: string): boolean {
  const lowerPattern = pattern.toLowerCase();
  return getErrorExamples(node).some((ex) => {
    const then = ex.then as Record<string, unknown> | undefined;
    const error = then?.error as string | undefined;
    return error ? error.toLowerCase().includes(lowerPattern) : false;
  });
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

function checkSpecs(context: AnalysisContext): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const { specs, archRegistry, componentGroups, graph } = context;

  const archNodes = (archRegistry.nodes ?? archRegistry) as Record<
    string,
    Record<string, unknown>
  >;

  for (const { specId, node } of specs) {
    const effects = getEffects(node);

    // OTH-1: Effect chain complexity
    if (effects.length >= 8) {
      issues.push({
        id: 'OTH-1',
        category: 'other',
        severity: 'error',
        specId,
        message: `Excessive effect chain: ${effects.length} effects — consider decomposition`,
        suggestion: 'Split into smaller operations or use a saga pattern',
      });
    } else if (effects.length >= 5) {
      issues.push({
        id: 'OTH-1',
        category: 'other',
        severity: 'warning',
        specId,
        message: `Complex effect chain: ${effects.length} effects`,
        suggestion: 'Consider whether all effects belong in a single operation',
      });
    }

    // OTH-2: Deprecated architecture usage
    for (const archId of getArchitectures(node)) {
      const arch = archNodes[archId] as Record<string, unknown> | undefined;
      if (arch?.deprecated_from) {
        issues.push({
          id: 'OTH-2',
          category: 'other',
          severity: 'warning',
          specId,
          archId,
          message: `Uses deprecated architecture '${archId}' (since ${arch.deprecated_from})`,
          suggestion: (arch.migration_guide as string) ?? 'Migrate to a supported architecture',
        });
      }
    }

    // OTH-4: Scheduler without idempotency
    const hasScheduler = effects.some((e) => e['scheduler'] !== undefined);
    if (hasScheduler) {
      const invariants = getInvariants(node);
      const hasIdempotencyInvariant = invariants.some((inv) => {
        if (typeof inv === 'string')
          return inv.toLowerCase().includes('idempotent');
        if (typeof inv === 'object' && inv !== null) {
          const cond = (inv as Record<string, unknown>).condition;
          const desc = (inv as Record<string, unknown>).description;
          return (
            (typeof cond === 'string' && cond.toLowerCase().includes('idempotent')) ||
            (typeof desc === 'string' && desc.toLowerCase().includes('idempotent'))
          );
        }
        return false;
      });
      if (!hasIdempotencyInvariant) {
        issues.push({
          id: 'OTH-4',
          category: 'other',
          severity: 'warning',
          specId,
          message: 'Scheduler effect without idempotency invariant — retried jobs may cause duplicates',
          suggestion: 'Add invariant: "scheduled job is idempotent (safe to retry)"',
        });
      }
    }

    // OTH-5: Webhook without error handling
    const hasWebhook = effects.some((e) => e['webhook'] !== undefined);
    if (hasWebhook) {
      if (
        !hasErrorCode(node, 'external') &&
        !hasErrorCode(node, 'webhook') &&
        !hasErrorCode(node, 'timeout') &&
        !hasErrorCode(node, 'network')
      ) {
        issues.push({
          id: 'OTH-5',
          category: 'other',
          severity: 'warning',
          specId,
          message: 'Webhook effect without error example for external service failure',
          suggestion: 'Add error example: { then: { error: "EXTERNAL_ERROR" } }',
        });
      }
    }

    // OTH-6: N+1 query risk
    const hasForallInvariant = getInvariants(node).some((inv) => {
      if (typeof inv !== 'object' || inv === null) return false;
      return (inv as Record<string, unknown>).forall !== undefined;
    });
    const hasDbEffect = effects.some((e) => e['database'] !== undefined);
    if (hasForallInvariant && hasDbEffect) {
      issues.push({
        id: 'OTH-6',
        category: 'other',
        severity: 'info',
        specId,
        message: 'Forall invariant combined with database effect — potential N+1 query risk',
        suggestion: 'Ensure database operations are batched, not per-item',
      });
    }

    // OTH-8: Mixin parameter validation
    const mixins = node.mixins as unknown[] | undefined;
    if (mixins) {
      for (const mixin of mixins) {
        if (typeof mixin !== 'object' || mixin === null) continue;
        const entries = Object.entries(mixin as Record<string, unknown>);
        if (entries.length === 0) continue;
        const [mixinName, params] = entries[0];
        if (typeof params !== 'object' || params === null) continue;

        // Known mixin parameter requirements
        const requiredParams: Record<string, string[]> = {
          logs_audit: ['action', 'resource'],
          rate_limited: ['requests', 'window'],
          requires_permission: ['resource', 'permission'],
          requires_project_access: ['level'],
          secure_mutation: ['resource', 'action'],
          secure_action: ['resource', 'action'],
        };

        const required = requiredParams[mixinName];
        if (required) {
          const provided = new Set(Object.keys(params as Record<string, unknown>));
          for (const param of required) {
            if (!provided.has(param)) {
              issues.push({
                id: 'OTH-8',
                category: 'other',
                severity: 'error',
                specId,
                field: `mixins.${mixinName}`,
                message: `Mixin '${mixinName}' missing required parameter '${param}'`,
                suggestion: `Add '${param}' to the mixin parameters`,
              });
            }
          }
        }
      }
    }
  }

  // OTH-3: High-impact specs
  issues.push(...checkHighImpact(graph));

  // OTH-9: Cross-spec invariant consistency
  issues.push(...checkInvariantConsistency(specs, graph));

  // OTH-10: Component group handler without spec
  issues.push(...checkComponentGroupHandlers(specs, componentGroups));

  return issues;
}

function checkHighImpact(graph: CrossReferenceGraph): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const THRESHOLD = 5;

  for (const [specId, dependents] of graph.specDependents) {
    if (dependents.length >= THRESHOLD) {
      issues.push({
        id: 'OTH-3',
        category: 'other',
        severity: 'info',
        specId,
        message: `High-impact spec: ${dependents.length} other specs depend on this`,
        suggestion: 'Changes to this spec may cascade — review dependents before modifying',
        relatedSpecs: dependents,
      });
    }
  }

  return issues;
}

function checkInvariantConsistency(
  specs: ResolvedSpecEntry[],
  graph: CrossReferenceGraph,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  // Group specs by table they write to
  for (const [table, writers] of graph.tableToWriters) {
    if (writers.length < 2) continue;

    // Collect invariants that mention defaults/initial values
    const specsWithDefaults: Array<{
      specId: string;
      defaultInvariants: string[];
    }> = [];

    for (const writer of writers) {
      const spec = specs.find((s) => s.specId === writer.specId);
      if (!spec) continue;
      const invariants = getInvariants(spec.node);
      const defaultInvs = invariants
        .filter((inv) => {
          if (typeof inv !== 'object' || inv === null) return false;
          const cond = (inv as Record<string, unknown>).condition;
          return typeof cond === 'string' && cond.toLowerCase().includes('default');
        })
        .map((inv) => (inv as Record<string, unknown>).condition as string);

      if (defaultInvs.length > 0) {
        specsWithDefaults.push({
          specId: writer.specId,
          defaultInvariants: defaultInvs,
        });
      }
    }

    // If some specs have default invariants and others don't
    if (
      specsWithDefaults.length > 0 &&
      specsWithDefaults.length < writers.length
    ) {
      const withoutDefaults = writers
        .filter(
          (w) => !specsWithDefaults.some((s) => s.specId === w.specId),
        )
        .map((w) => w.specId);

      issues.push({
        id: 'OTH-9',
        category: 'other',
        severity: 'warning',
        specId: specsWithDefaults[0].specId,
        message: `Inconsistent defaults for table '${table}': ${specsWithDefaults.length} spec(s) define defaults but ${withoutDefaults.length} don't`,
        suggestion: 'Ensure all specs writing to the same table have consistent default invariants',
        relatedSpecs: withoutDefaults,
      });
    }
  }

  return issues;
}

function checkComponentGroupHandlers(
  specs: ResolvedSpecEntry[],
  componentGroups: Record<string, unknown>,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const groups = componentGroups?.['component-groups'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!groups) return issues;

  const specImplementations = new Set(
    specs
      .map((s) => s.node.implementation as string | undefined)
      .filter((impl): impl is string => !!impl),
  );

  for (const [groupName, group] of Object.entries(groups)) {
    // Only check groups where at least one component has spec coverage
    const components = (group.components ?? []) as Array<Record<string, unknown>>;
    const groupHasSpecs = components.some((comp) => {
      const compPath = comp.path as string | undefined;
      return compPath && [...specImplementations].some((impl) => impl.startsWith(compPath));
    });
    if (!groupHasSpecs) continue;

    const related = group.related as Record<string, unknown> | undefined;
    if (!related) continue;
    const handlers = related.handlers as string | string[] | undefined;
    if (!handlers) continue;
    const handlerPaths = Array.isArray(handlers) ? handlers : [handlers];

    for (const handlerPath of handlerPaths) {
      const covered = [...specImplementations].some(
        (impl) => impl.startsWith(handlerPath),
      );
      if (!covered) {
        issues.push({
          id: 'OTH-10',
          category: 'other',
          severity: 'info',
          message: `Component group '${groupName}' handler '${handlerPath}' has no spec coverage`,
          suggestion: `Create a spec with implementation: ${handlerPath}#handlerName`,
        });
      }
    }
  }

  return issues;
}

export const otherChecker: Checker = {
  id: 'other',
  name: 'Other Checker',
  category: 'other',
  check(context: AnalysisContext): AnalysisIssue[] {
    return checkSpecs(context);
  },
};
