/**
 * @arch archcodex.core.domain
 * @intent:stateless
 *
 * Completeness checker — detects coverage gaps in specs.
 * 8 analyses: CMP-1 through CMP-8.
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

function getInputs(node: SpecNode): Record<string, Record<string, unknown>> {
  return (node.inputs as Record<string, Record<string, unknown>>) ?? {};
}

function getInvariants(node: SpecNode): unknown[] {
  return (node.invariants as unknown[]) ?? [];
}

function getEffects(node: SpecNode): Record<string, unknown>[] {
  return (node.effects as Record<string, unknown>[]) ?? [];
}

function getExamples(node: SpecNode): Record<string, unknown> | undefined {
  return node.examples as Record<string, unknown> | undefined;
}

function getBoundaryExamples(node: SpecNode): Record<string, unknown>[] {
  return (getExamples(node)?.boundaries as Record<string, unknown>[]) ?? [];
}

function getErrorExamples(node: SpecNode): Record<string, unknown>[] {
  return (getExamples(node)?.errors as Record<string, unknown>[]) ?? [];
}

// ---------------------------------------------------------------------------
// CRUD detection helpers
// ---------------------------------------------------------------------------

const CRUD_OPERATIONS = ['create', 'get', 'list', 'update', 'delete'];

function detectCrudOp(specId: string): string | null {
  const parts = specId.split('.');
  const last = parts[parts.length - 1]?.toLowerCase();
  if (!last) return null;
  for (const op of CRUD_OPERATIONS) {
    if (last.includes(op)) return op;
  }
  if (last.includes('read') || last.includes('find') || last.includes('fetch')) return 'get';
  if (last.includes('remove') || last.includes('archive')) return 'delete';
  if (last.includes('edit') || last.includes('patch') || last.includes('modify')) return 'update';
  if (last.includes('add') || last.includes('insert') || last.includes('new')) return 'create';
  return null;
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

function checkSpecs(
  specs: ResolvedSpecEntry[],
  graph: CrossReferenceGraph,
  toolEntities: string[],
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const { specId, node } of specs) {
    const inputs = getInputs(node);

    // CMP-1: Missing boundary examples for constrained inputs
    for (const [field, def] of Object.entries(inputs)) {
      const hasConstraint =
        def.max !== undefined ||
        def.min !== undefined ||
        (def.type === 'number' && (def.max !== undefined || def.min !== undefined));

      if (hasConstraint && getBoundaryExamples(node).length === 0) {
        issues.push({
          id: 'CMP-1',
          category: 'completeness',
          severity: 'warning',
          specId,
          field,
          message: `Input '${field}' has min/max constraint but no boundary examples`,
          suggestion: 'Add examples.boundaries testing values at and beyond the limits',
        });
      }
    }

    // CMP-2: Missing mixin effects (informational)
    const mixins = node.mixins as unknown[] | undefined;
    if (mixins) {
      for (const mixin of mixins) {
        const mixinName =
          typeof mixin === 'string'
            ? mixin
            : typeof mixin === 'object' && mixin !== null
              ? Object.keys(mixin)[0]
              : null;
        if (mixinName === 'logs_audit') {
          const hasAuditEffect = getEffects(node).some(
            (e) => e['audit_log'] !== undefined,
          );
          if (!hasAuditEffect) {
            issues.push({
              id: 'CMP-2',
              category: 'completeness',
              severity: 'info',
              specId,
              message: `Mixin 'logs_audit' is applied but audit_log effect not explicitly listed in spec effects`,
              suggestion: 'Effects from mixins are inherited — consider listing them explicitly for clarity',
            });
          }
        }
      }
    }

    // CMP-5: Missing constraint error examples
    for (const [field, def] of Object.entries(inputs)) {
      if (def.max !== undefined) {
        const hasTooLongError = getErrorExamples(node).some((ex) => {
          const then = ex.then as Record<string, unknown> | undefined;
          const error = then?.error as string | undefined;
          return error?.toLowerCase().includes('too_long') ||
            error?.toLowerCase().includes('max') ||
            error?.toLowerCase().includes(field.toLowerCase());
        });
        if (!hasTooLongError) {
          issues.push({
            id: 'CMP-5',
            category: 'completeness',
            severity: 'warning',
            specId,
            field,
            message: `Input '${field}' has max constraint (${def.max}) but no error example for exceeding it`,
            suggestion: `Add error example with '${field}' exceeding max length`,
          });
        }
      }
    }

    // CMP-6: Mutation without invariants
    const inherits = node.inherits as string | undefined;
    if (
      (inherits === 'spec.mutation' || inherits === 'spec.action') &&
      getInvariants(node).length === 0
    ) {
      issues.push({
        id: 'CMP-6',
        category: 'completeness',
        severity: 'warning',
        specId,
        message: `Mutation/action spec has no invariants — no behavioral contract to verify`,
        suggestion: 'Add invariants describing what must be true about the result',
      });
    }

    // CMP-7: UI without accessibility
    const ui = node.ui as Record<string, unknown> | undefined;
    if (ui) {
      const hasTrigger = ui.trigger !== undefined;
      const hasInteraction = ui.interaction !== undefined;
      const hasAccessibility = ui.accessibility !== undefined;
      if ((hasTrigger || hasInteraction) && !hasAccessibility) {
        issues.push({
          id: 'CMP-7',
          category: 'completeness',
          severity: 'warning',
          specId,
          message: 'UI spec has trigger/interaction but no accessibility section',
          suggestion: 'Add ui.accessibility with role, label, and keyboardNav',
        });
      }
    }

    // CMP-8: Optimistic UI without feedback
    if (ui) {
      const interaction = ui.interaction as Record<string, unknown> | undefined;
      if (interaction?.optimistic === true && !ui.feedback) {
        issues.push({
          id: 'CMP-8',
          category: 'completeness',
          severity: 'warning',
          specId,
          message: 'Optimistic UI interaction without feedback definition',
          suggestion: 'Add ui.feedback with success and error messages',
        });
      }
    }
  }

  // CMP-3: Orphaned specs
  issues.push(...checkOrphanedSpecs(specs, graph));

  // CMP-4: Missing CRUD coverage
  issues.push(...checkCrudCoverage(graph, toolEntities));

  return issues;
}

function checkOrphanedSpecs(
  specs: ResolvedSpecEntry[],
  graph: CrossReferenceGraph,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const { specId, node } of specs) {
    if (node.type === 'base' || node.type === 'test') continue;
    const dependsOn = (node as Record<string, unknown>).depends_on as string[] | undefined;
    const parent = (node as Record<string, unknown>).parent as string | undefined;
    const hasDependencies = (dependsOn && dependsOn.length > 0) || parent;
    const hasDependents = graph.specDependents.has(specId);

    // Check entity group size
    const entity = specId.split('.').length >= 3 ? specId.split('.')[1] : null;
    const entitySpecs = entity ? graph.entityToSpecs.get(entity) ?? [] : [];
    const isOnlySpecForEntity = entitySpecs.length <= 1;

    if (!hasDependencies && !hasDependents && isOnlySpecForEntity) {
      issues.push({
        id: 'CMP-3',
        category: 'completeness',
        severity: 'info',
        specId,
        message: `Orphaned spec: no depends_on, no dependents, only spec for entity`,
        suggestion: 'Consider adding related specs (CRUD operations, depends_on relationships)',
      });
    }
  }

  return issues;
}

function checkCrudCoverage(graph: CrossReferenceGraph, toolEntities: string[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  const toolEntitySet = new Set(toolEntities);

  for (const [entity, specIds] of graph.entityToSpecs) {
    if (specIds.length < 2) continue; // Too few specs to judge
    // Skip tool namespaces and their sub-entities (e.g. archcodex.componentGroups)
    const rootEntity = entity.split('.')[0];
    if (toolEntitySet.has(rootEntity)) continue;

    const foundOps = new Set<string>();
    for (const specId of specIds) {
      const op = detectCrudOp(specId);
      if (op) foundOps.add(op);
    }

    // Only flag if we have some CRUD ops but missing key ones
    if (foundOps.size > 0 && foundOps.size < 3) {
      const missingOps = CRUD_OPERATIONS.filter((op) => !foundOps.has(op));
      issues.push({
        id: 'CMP-4',
        category: 'completeness',
        severity: 'info',
        specId: `spec.${entity}.*`,
        message: `Entity '${entity}' has ${foundOps.size} CRUD operations (${[...foundOps].join(', ')}) — missing: ${missingOps.join(', ')}`,
        suggestion: `Consider adding specs for: ${missingOps.map((op) => `spec.${entity}.${op}`).join(', ')}`,
      });
    }
  }

  return issues;
}

export const completenessChecker: Checker = {
  id: 'completeness',
  name: 'Completeness Checker',
  category: 'completeness',
  check(context: AnalysisContext): AnalysisIssue[] {
    return checkSpecs(context.specs, context.graph, context.toolEntities ?? ['archcodex', 'speccodex', 'test']);
  },
};
