/**
 * @arch archcodex.core.domain
 * @intent:stateless
 *
 * Consistency checker — detects cross-schema consistency issues.
 * 11 analyses: CON-1 through CON-11.
 */

import type {
  AnalysisIssue,
  AnalysisContext,
  Checker,
  ResolvedSpecEntry,
} from '../types.js';
import type { SpecNode } from '../../spec/schema.js';

function addToMapArray<V>(map: Map<string, V[]>, key: string, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAuth(node: SpecNode): string | undefined {
  const sec = node.security as Record<string, unknown> | undefined;
  return sec?.authentication as string | undefined;
}

function getEffects(node: SpecNode): Record<string, unknown>[] {
  return (node.effects as Record<string, unknown>[]) ?? [];
}

function getArchitectures(node: SpecNode): string[] {
  return (node.architectures as string[]) ?? [];
}

function getTouchpoints(node: SpecNode): Record<string, unknown>[] {
  const ui = node.ui as Record<string, unknown> | undefined;
  return (ui?.touchpoints as Record<string, unknown>[]) ?? [];
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

function checkSpecs(context: AnalysisContext): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const { specs, archRegistry, componentGroups } = context;

  const archNodes = (archRegistry.nodes ?? archRegistry) as Record<
    string,
    Record<string, unknown>
  >;

  for (const { specId, node } of specs) {
    const architectures = getArchitectures(node);

    // CON-1: Architecture-spec security mismatch
    if (getAuth(node) === 'required') {
      for (const archId of architectures) {
        const arch = archNodes[archId] as Record<string, unknown> | undefined;
        if (!arch) continue;
        const constraints = (arch.constraints as Record<string, unknown>[]) ?? [];
        const hasAuthConstraint = constraints.some((c) => {
          const rule = c.rule as string;
          const value = c.value;
          return (
            (rule === 'require_import' || rule === 'require_call') &&
            JSON.stringify(value).toLowerCase().includes('auth')
          );
        });
        if (!hasAuthConstraint) {
          issues.push({
            id: 'CON-1',
            category: 'consistency',
            severity: 'warning',
            specId,
            archId,
            message: `Spec requires authentication but architecture '${archId}' has no auth-related constraints`,
            suggestion: 'Add require_import or require_call constraint for auth functions',
          });
        }
      }
    }

    // CON-2: Component group vs touchpoints mismatch
    const touchpoints = getTouchpoints(node);
    if (touchpoints.length > 0) {
      const groups = componentGroups?.['component-groups'] as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (groups) {
        for (const [groupName, group] of Object.entries(groups)) {
          const components =
            (group.components as Record<string, unknown>[]) ?? [];
          if (touchpoints.length < components.length) {
            const touchpointNames = new Set(
              touchpoints.map(
                (t) => t.component as string,
              ),
            );
            const missing = components.filter((c) => {
              const path = c.path as string;
              const name = path.split('/').pop()?.replace(/\.tsx?$/, '') ?? '';
              return !touchpointNames.has(name);
            });
            if (missing.length > 0) {
              issues.push({
                id: 'CON-2',
                category: 'consistency',
                severity: 'error',
                specId,
                message: `Spec touchpoints (${touchpoints.length}) fewer than component group '${groupName}' (${components.length})`,
                suggestion: `Add touchpoints for: ${missing.map((m) => (m.path as string).split('/').pop()).join(', ')}`,
              });
            }
          }
        }
      }
    }

    // CON-4: Layer-effect alignment (side effects in pure layer)
    if (getEffects(node).length > 0) {
      for (const archId of architectures) {
        const arch = archNodes[archId] as Record<string, unknown> | undefined;
        if (!arch) continue;
        const desc = (arch.description as string)?.toLowerCase() ?? '';
        if (
          desc.includes('pure') ||
          desc.includes('utility') ||
          archId.includes('util')
        ) {
          issues.push({
            id: 'CON-4',
            category: 'consistency',
            severity: 'warning',
            specId,
            archId,
            message: `Spec declares effects but architecture '${archId}' is a pure/utility layer`,
            suggestion: 'Move side-effecting logic to an engine or service layer',
          });
        }
      }
    }

    // CON-5: Intent-constraint drift (stateless with cache)
    for (const archId of architectures) {
      const arch = archNodes[archId] as Record<string, unknown> | undefined;
      if (!arch) continue;
      const expectedIntents =
        (arch.expected_intents as string[]) ?? [];
      if (expectedIntents.includes('stateless')) {
        const hasCacheEffect = getEffects(node).some(
          (e) => e['cache'] !== undefined,
        );
        if (hasCacheEffect) {
          issues.push({
            id: 'CON-5',
            category: 'consistency',
            severity: 'warning',
            specId,
            archId,
            message: `Spec has cache effects but architecture '${archId}' expects stateless intent`,
            suggestion: 'Remove cache effects or change architecture to one that allows state',
          });
        }
      }
    }

    // CON-7: Deprecated architecture usage
    for (const archId of architectures) {
      const arch = archNodes[archId] as Record<string, unknown> | undefined;
      if (!arch) continue;
      if (arch.deprecated_from) {
        issues.push({
          id: 'CON-7',
          category: 'consistency',
          severity: 'warning',
          specId,
          archId,
          message: `Architecture '${archId}' is deprecated since ${arch.deprecated_from}`,
          suggestion: (arch.migration_guide as string) ?? 'Migrate to a supported architecture',
        });
      }
    }
  }

  // CON-3: Mixin-constraint contradiction
  issues.push(...checkMixinConstraintConflicts(specs, archNodes));

  // CON-8: Inheritance constraint conflicts
  issues.push(...checkInheritanceConflicts(archNodes));

  // CON-6: Action checklist vs spec coverage
  issues.push(...checkActionCoverage(context));

  // CON-9: Architecture pattern drift
  issues.push(...checkArchPatternDrift(context));

  // CON-10: Architecture mismatch (bridged from verifier --deep)
  if (context.verifierResults) {
    for (const { specId } of specs) {
      const drift = context.verifierResults.get(specId);
      if (!drift?.architectureMismatch) continue;
      issues.push({
        id: 'CON-10',
        category: 'consistency',
        severity: 'warning',
        specId,
        message: `Architecture tag mismatch: spec expects '${drift.missingArchTag ?? 'unknown'}', implementation has '${drift.actualArchTag ?? 'none'}'`,
        suggestion: 'Update the @arch tag in the implementation file to match the spec',
      });
    }
  }

  // CON-11: Layer leak (spec implementation path in wrong layer)
  issues.push(...checkLayerLeak(specs, archNodes));

  return issues;
}

function checkMixinConstraintConflicts(
  specs: ResolvedSpecEntry[],
  archNodes: Record<string, Record<string, unknown>>,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const { specId, node } of specs) {
    const mixins = node.mixins as unknown[] | undefined;
    if (!mixins) continue;
    const architectures = getArchitectures(node);

    for (const archId of architectures) {
      const arch = archNodes[archId];
      if (!arch) continue;
      const constraints = (arch.constraints as Record<string, unknown>[]) ?? [];
      const forbiddenImports = constraints
        .filter((c) => c.rule === 'forbid_import')
        .flatMap((c) => (Array.isArray(c.value) ? c.value : [c.value]) as string[]);

      for (const mixin of mixins) {
        const mixinName =
          typeof mixin === 'string'
            ? mixin
            : typeof mixin === 'object' && mixin !== null
              ? Object.keys(mixin)[0]
              : null;
        if (!mixinName) continue;

        // Check if mixin implies imports that are forbidden
        if (
          (mixinName === 'logs_audit' &&
            forbiddenImports.some((f) => f.includes('audit'))) ||
          (mixinName === 'requires_auth' &&
            forbiddenImports.some((f) => f.includes('auth')))
        ) {
          issues.push({
            id: 'CON-3',
            category: 'consistency',
            severity: 'error',
            specId,
            archId,
            message: `Mixin '${mixinName}' implies imports forbidden by architecture '${archId}'`,
            suggestion: `Remove mixin '${mixinName}' or change architecture`,
          });
        }
      }
    }
  }

  return issues;
}

function checkInheritanceConflicts(
  archNodes: Record<string, Record<string, unknown>>,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const [archId, arch] of Object.entries(archNodes)) {
    const parentId = arch.inherits as string | undefined;
    if (!parentId) continue;
    const parent = archNodes[parentId];
    if (!parent) continue;

    const parentConstraints = (parent.constraints as Record<string, unknown>[]) ?? [];
    const childConstraints = (arch.constraints as Record<string, unknown>[]) ?? [];

    const parentForbids = new Set(
      parentConstraints
        .filter((c) => c.rule === 'forbid_import')
        .flatMap((c) => (Array.isArray(c.value) ? c.value : [c.value]) as string[]),
    );

    for (const constraint of childConstraints) {
      if (constraint.rule === 'require_import') {
        const values = Array.isArray(constraint.value)
          ? (constraint.value as string[])
          : [constraint.value as string];
        for (const val of values) {
          if (parentForbids.has(val)) {
            issues.push({
              id: 'CON-8',
              category: 'consistency',
              severity: 'error',
              archId,
              message: `Architecture '${archId}' requires import '${val}' but parent '${parentId}' forbids it`,
              suggestion: `Use allow_import to explicitly override parent's forbid, or restructure inheritance`,
            });
          }
        }
      }
    }
  }

  return issues;
}

function checkActionCoverage(context: AnalysisContext): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const actions = (context.archRegistry as Record<string, unknown>).actions as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!actions) return issues;

  const specIds = new Set(context.specs.map((s) => s.specId));

  for (const [actionName, action] of Object.entries(actions)) {
    const checklist = action.checklist as string[] | undefined;
    if (!checklist || checklist.length === 0) continue;

    // Simple heuristic: if there are no specs at all for this action's domain, flag it
    if (specIds.size === 0) {
      issues.push({
        id: 'CON-6',
        category: 'consistency',
        severity: 'info',
        message: `Action '${actionName}' has ${checklist.length} checklist items but no specs exist for validation`,
        suggestion: 'Create specs for the action checklist items',
      });
    }
  }

  return issues;
}

function checkArchPatternDrift(context: AnalysisContext): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const { specs, graph } = context;

  for (const [archId, specIds] of graph.archToSpecs) {
    if (specIds.length < 3) continue;

    const archSpecs = specIds
      .map((id) => specs.find((s) => s.specId === id))
      .filter((s): s is ResolvedSpecEntry => !!s);

    // Compare authentication patterns
    const authPatterns = new Map<string, string[]>();
    for (const { specId, node } of archSpecs) {
      const auth = getAuth(node) ?? 'unset';
      addToMapArray(authPatterns, auth, specId);
    }

    if (authPatterns.size > 1) {
      const sorted = [...authPatterns.entries()].sort((a, b) => b[1].length - a[1].length);
      const [majorityAuth] = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        const [minorityAuth, minoritySpecs] = sorted[i];
        for (const specId of minoritySpecs) {
          issues.push({
            id: 'CON-9',
            category: 'consistency',
            severity: 'warning',
            specId,
            archId,
            message: `Auth pattern '${minorityAuth}' diverges from majority '${majorityAuth}' in architecture '${archId}'`,
            suggestion: `Align authentication to '${majorityAuth}' or document the exception`,
          });
        }
      }
    }

    // Compare inherits patterns
    const inheritsPatterns = new Map<string, string[]>();
    for (const { specId, node } of archSpecs) {
      const inherits = ((node as Record<string, unknown>).inherits as string) ?? 'none';
      addToMapArray(inheritsPatterns, inherits, specId);
    }

    if (inheritsPatterns.size > 1) {
      const sorted = [...inheritsPatterns.entries()].sort((a, b) => b[1].length - a[1].length);
      const [majorityInherits] = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        const [minorityInherits, minoritySpecs] = sorted[i];
        for (const specId of minoritySpecs) {
          issues.push({
            id: 'CON-9',
            category: 'consistency',
            severity: 'warning',
            specId,
            archId,
            message: `Inherits pattern '${minorityInherits}' diverges from majority '${majorityInherits}' in architecture '${archId}'`,
            suggestion: `Align base spec to '${majorityInherits}' or document the exception`,
          });
        }
      }
    }
  }

  return issues;
}

function checkLayerLeak(
  specs: ResolvedSpecEntry[],
  archNodes: Record<string, Record<string, unknown>>,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const { specId, node } of specs) {
    const impl = (node as Record<string, unknown>).implementation as string | undefined;
    if (!impl) continue;
    const implPath = impl.split('#')[0];
    const architectures = getArchitectures(node);

    for (const archId of architectures) {
      const arch = archNodes[archId] as Record<string, unknown> | undefined;
      if (!arch) continue;
      const layer = arch.layer as string | undefined;
      if (!layer) continue;

      // Check if implementation path is consistent with the architecture's layer
      const expectedLayers = [layer, ...(arch.allowed_layers as string[] ?? [])];
      const pathContainsLayer = expectedLayers.some((l) =>
        implPath.includes(`/${l}/`) || implPath.startsWith(`${l}/`),
      );

      if (!pathContainsLayer && implPath.includes('/')) {
        issues.push({
          id: 'CON-11',
          category: 'consistency',
          severity: 'warning',
          specId,
          archId,
          message: `Implementation '${implPath}' may be in wrong layer for architecture '${archId}' (expected layer: ${layer})`,
          suggestion: `Move implementation to the '${layer}' layer or change architecture assignment`,
        });
      }
    }
  }

  return issues;
}

export const consistencyChecker: Checker = {
  id: 'consistency',
  name: 'Consistency Checker',
  category: 'consistency',
  check(context: AnalysisContext): AnalysisIssue[] {
    return checkSpecs(context);
  },
};
