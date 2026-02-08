/**
 * @arch archcodex.core.domain
 * @intent:stateless
 *
 * Data checker — detects data integrity issues from spec schemas.
 * 11 analyses: DAT-1 through DAT-11.
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

const SENSITIVE_PATTERNS = [
  'password', 'secret', 'token', 'apikey', 'api_key',
  'credential', 'private_key', 'privatekey',
];

function isSensitiveField(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => lower.includes(p));
}

function getInputs(node: SpecNode): Record<string, Record<string, unknown>> {
  return (node.inputs as Record<string, Record<string, unknown>>) ?? {};
}

function getOutputs(node: SpecNode): Record<string, Record<string, unknown>> {
  return (node.outputs as Record<string, Record<string, unknown>>) ?? {};
}

function getEffects(node: SpecNode): Record<string, unknown>[] {
  return (node.effects as Record<string, unknown>[]) ?? [];
}

function hasDatabaseEffect(node: SpecNode, op?: string): boolean {
  return getEffects(node).some((e) => {
    const db = e['database'] as Record<string, unknown> | undefined;
    return db && (!op || db.operation === op);
  });
}

/** Naive singularization for table name → field name matching. */
function naiveSingular(table: string): string {
  const lower = table.toLowerCase();
  if (lower.endsWith('ies')) return lower.slice(0, -3) + 'y';  // entries → entry
  if (lower.endsWith('ses') || lower.endsWith('xes') || lower.endsWith('zes')) return lower.slice(0, -2);  // statuses → status
  if (lower.endsWith('s')) return lower.slice(0, -1);  // users → user
  return lower;
}

function hasAuditLogEffect(node: SpecNode): boolean {
  return getEffects(node).some((e) => e['audit_log'] !== undefined);
}

function getAuth(node: SpecNode): string | undefined {
  const sec = node.security as Record<string, unknown> | undefined;
  return sec?.authentication as string | undefined;
}

function getExamplesThen(node: SpecNode): Set<string> {
  const fields = new Set<string>();
  const examples = node.examples as Record<string, unknown> | undefined;
  if (!examples) return fields;
  for (const key of ['success', 'errors', 'warnings', 'boundaries']) {
    const arr = examples[key] as Record<string, unknown>[] | undefined;
    if (arr) {
      for (const ex of arr) {
        const then = ex.then as Record<string, unknown> | undefined;
        if (then) {
          for (const k of Object.keys(then)) {
            fields.add(k);
          }
        }
      }
    }
  }
  return fields;
}

function hasErrorCodeInExamples(node: SpecNode, pattern: string): boolean {
  const lowerPattern = pattern.toLowerCase();
  const examples = node.examples as Record<string, unknown> | undefined;
  const errors = (examples?.errors as Record<string, unknown>[]) ?? [];
  return errors.some((ex) => {
    const then = ex.then as Record<string, unknown> | undefined;
    if (!then) return false;
    const error = then.error as string | undefined;
    return error ? error.toLowerCase().includes(lowerPattern) : false;
  });
}

interface AnnotatedExample extends Record<string, unknown> {
  _section?: string;
}

function getAllExamplesGiven(node: SpecNode): AnnotatedExample[] {
  const examples = node.examples as Record<string, unknown> | undefined;
  if (!examples) return [];
  const result: AnnotatedExample[] = [];
  for (const key of ['success', 'warnings', 'boundaries']) {
    const arr = examples[key] as Record<string, unknown>[] | undefined;
    if (arr) result.push(...arr.map((ex) => ({ ...ex, _section: key })));
  }
  // Add errors separately (they may intentionally use invalid values)
  const errs = examples.errors as Record<string, unknown>[] | undefined;
  if (errs) result.push(...errs.map((ex) => ({ ...ex, _section: 'errors' })));
  return result;
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

function checkSpecs(
  specs: ResolvedSpecEntry[],
  graph: CrossReferenceGraph,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const { specId, node } of specs) {
    const inputs = getInputs(node);
    const outputs = getOutputs(node);

    // DAT-1: Sensitive data leakage
    for (const field of Object.keys(inputs)) {
      if (isSensitiveField(field) && field in outputs) {
        issues.push({
          id: 'DAT-1',
          category: 'data',
          severity: 'error',
          specId,
          field,
          message: `Sensitive input '${field}' appears in outputs — risk of data leakage`,
          suggestion: `Remove '${field}' from outputs or return a redacted version`,
        });
      }
    }

    // DAT-2: Missing cascade effects (delete without cleanup)
    if (hasDatabaseEffect(node, 'delete')) {
      for (const effect of getEffects(node)) {
        const db = effect['database'] as Record<string, unknown> | undefined;
        if (db?.operation !== 'delete') continue;
        const table = db.table as string;
        const readers = graph.tableToReaders.get(table) ?? [];
        const referencingSpecs = readers
          .filter((r) => r.specId !== specId)
          .map((r) => r.specId);
        if (referencingSpecs.length > 0) {
          issues.push({
            id: 'DAT-2',
            category: 'data',
            severity: 'warning',
            specId,
            field: table,
            message: `Delete from '${table}' may orphan references from ${referencingSpecs.length} other spec(s)`,
            suggestion: 'Add cascade delete effects or soft-delete pattern',
            relatedSpecs: referencingSpecs,
          });
        }
      }
    }

    // DAT-4: Missing timestamp effects
    if (hasDatabaseEffect(node, 'update')) {
      const hasUpdatedAt =
        'updatedAt' in outputs ||
        'updated_at' in outputs;
      if (!hasUpdatedAt) {
        issues.push({
          id: 'DAT-4',
          category: 'data',
          severity: 'warning',
          specId,
          message: 'Database update without updatedAt in outputs',
          suggestion: 'Add updatedAt to outputs or use the timestamped mixin',
        });
      }
    }

    // DAT-6: Nullable output without coverage
    for (const [field, def] of Object.entries(outputs)) {
      if (def.nullable === true || def.optional === true) {
        // Check if any example asserts null/undefined for this field
        const examples = node.examples as Record<string, unknown> | undefined;
        let hasNullAssertion = false;
        if (examples) {
          for (const key of ['success', 'errors', 'warnings', 'boundaries']) {
            const arr = examples[key] as Record<string, unknown>[] | undefined;
            if (arr) {
              for (const ex of arr) {
                const then = ex.then as Record<string, unknown> | undefined;
                if (then) {
                  const val = then[`result.${field}`];
                  if (
                    val === null ||
                    val === '@undefined' ||
                    val === '@empty'
                  ) {
                    hasNullAssertion = true;
                  }
                }
              }
            }
          }
        }
        if (!hasNullAssertion) {
          // Only flag if we have examples but none test the null case
          const allExamples = getExamplesThen(node);
          if (allExamples.size > 0) {
            issues.push({
              id: 'DAT-6',
              category: 'data',
              severity: 'warning',
              specId,
              field,
              message: `Nullable/optional output '${field}' has no example testing the null/absent case`,
              suggestion: `Add an example with result.${field}: null or result.${field}: "@undefined"`,
            });
          }
        }
      }
    }

    // DAT-7: Authenticated mutation without audit trail
    if (
      getAuth(node) === 'required' &&
      hasDatabaseEffect(node) &&
      !hasAuditLogEffect(node)
    ) {
      issues.push({
        id: 'DAT-7',
        category: 'data',
        severity: 'warning',
        specId,
        message: 'Authenticated mutation with database effects but no audit_log effect',
        suggestion: 'Add audit_log effect or use the logs_audit mixin',
      });
    }

    // DAT-9: Unique constraint without uniqueness error example
    const invariants = (node.invariants as unknown[]) ?? [];
    for (const inv of invariants) {
      const text = typeof inv === 'string'
        ? inv
        : ((inv as Record<string, unknown>).condition as string) ??
          ((inv as Record<string, unknown>).description as string) ?? '';
      if (/unique\b/i.test(text) || /already.exists/i.test(text) || /\bduplicate\b/i.test(text)) {
        if (!hasErrorCodeInExamples(node, 'already_exists') &&
            !hasErrorCodeInExamples(node, 'duplicate') &&
            !hasErrorCodeInExamples(node, 'unique') &&
            !hasErrorCodeInExamples(node, 'conflict')) {
          issues.push({
            id: 'DAT-9',
            category: 'data',
            severity: 'warning',
            specId,
            message: 'Invariant implies uniqueness constraint but no duplicate/already_exists error example',
            suggestion: 'Add error example: { then: { error: "ALREADY_EXISTS" } }',
          });
        }
      }
    }

    // DAT-10: Enum mismatch (example value not in enum's values[])
    const allExamples = getAllExamplesGiven(node);
    for (const [field, def] of Object.entries(inputs)) {
      if (def.type !== 'enum' || !Array.isArray(def.values)) continue;
      for (const ex of allExamples) {
        const given = ex.given as Record<string, unknown> | undefined;
        if (!given || !(field in given)) continue;
        const val = given[field];
        if (typeof val === 'string' && !def.values.includes(val)) {
          // Skip error examples — they may intentionally use invalid values
          if (ex._section === 'errors') continue;
          issues.push({
            id: 'DAT-10',
            category: 'data',
            severity: 'warning',
            specId,
            field,
            message: `Example '${ex.name ?? '(unnamed)'}' uses enum value '${val}' not in allowed values [${(def.values as string[]).join(', ')}]`,
            suggestion: `Use one of [${(def.values as string[]).join(', ')}] or add '${val}' to the enum values`,
          });
        }
      }
    }
  }

  // DAT-5: Cross-spec type mismatch (needs graph)
  issues.push(...checkCrossSpecTypeMismatch(specs, graph));

  // DAT-3: Denormalization drift (needs graph)
  issues.push(...checkDenormalizationDrift(specs, graph));

  return issues;
}

function checkCrossSpecTypeMismatch(
  specs: ResolvedSpecEntry[],
  _graph: CrossReferenceGraph,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  // Build map of spec output id tables
  const outputTables = new Map<string, Map<string, string>>();
  for (const { specId, node } of specs) {
    const outputs = getOutputs(node);
    for (const [field, def] of Object.entries(outputs)) {
      if (def.type === 'id' && typeof def.table === 'string') {
        if (!outputTables.has(specId)) outputTables.set(specId, new Map());
        outputTables.get(specId)!.set(field, def.table);
      }
    }
  }

  // Check depends_on relationships for table mismatches
  for (const { specId, node } of specs) {
    const dependsOn = (node as Record<string, unknown>).depends_on as
      | string[]
      | undefined;
    if (!dependsOn) continue;

    const inputs = getInputs(node);
    for (const depId of dependsOn) {
      const depOutputs = outputTables.get(depId);
      if (!depOutputs) continue;

      for (const [inputField, inputDef] of Object.entries(inputs)) {
        if (inputDef.type !== 'id' || !inputDef.table) continue;
        // Check if the dependency produces an id for a different table
        for (const [, depTable] of depOutputs) {
          if (
            inputDef.table !== depTable &&
            inputField.toLowerCase().includes(naiveSingular(depTable))
          ) {
            issues.push({
              id: 'DAT-5',
              category: 'data',
              severity: 'error',
              specId,
              field: inputField,
              message: `Type mismatch: input '${inputField}' references table '${inputDef.table}' but dependency ${depId} outputs ids for table '${depTable}'`,
              suggestion: `Align table references between ${specId} and ${depId}`,
              relatedSpecs: [depId],
            });
          }
        }
      }
    }
  }

  return issues;
}

function checkDenormalizationDrift(
  specs: ResolvedSpecEntry[],
  _graph: CrossReferenceGraph,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  // Find specs that insert into a table and have count-related invariants
  for (const { specId, node } of specs) {
    const invariants = (node.invariants as unknown[]) ?? [];
    for (const inv of invariants) {
      if (typeof inv !== 'object' || inv === null) continue;
      const cond = (inv as Record<string, unknown>).condition;
      if (typeof cond !== 'string') continue;
      if (cond.toLowerCase().includes('count') && cond.toLowerCase().includes('increment')) {
        // This spec claims a count should be incremented
        // Check if it has an update effect on the related table
        const hasCountUpdate = getEffects(node).some((e) => {
          const db = e['database'] as Record<string, unknown> | undefined;
          return db?.operation === 'update';
        });
        if (!hasCountUpdate) {
          issues.push({
            id: 'DAT-3',
            category: 'data',
            severity: 'warning',
            specId,
            message: 'Invariant claims count is incremented but no database update effect for the count',
            suggestion: 'Add a database update effect for the denormalized count',
          });
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Deep analysis checks (require implementation content)
// ---------------------------------------------------------------------------

function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(['"`])(?:(?!\1|\\).|\\.)*\1/g, '""');
}

function checkDeepSpecs(
  specs: ResolvedSpecEntry[],
  context: AnalysisContext,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const implContents = context.implementationContents;
  if (!implContents) return issues;

  for (const { specId, node } of specs) {
    const implData = implContents.get(specId);
    if (!implData) continue;
    const code = stripCommentsAndStrings(implData.content);

    // DAT-8: Partial write (early return between effects)
    const effects = getEffects(node);
    if (effects.length >= 2) {
      const effectPatterns = [...code.matchAll(/ctx\.(db\.(patch|insert|replace|delete)|scheduler\.runAfter)/g)];
      const returnMatches = [...code.matchAll(/\breturn\b/g)];

      if (effectPatterns.length >= 2 && returnMatches.length > 0) {
        for (const ret of returnMatches) {
          const retPos = ret.index!;
          const beforeEffects = effectPatterns.filter((e) => e.index! < retPos);
          const afterEffects = effectPatterns.filter((e) => e.index! > retPos);
          if (beforeEffects.length > 0 && afterEffects.length > 0) {
            issues.push({
              id: 'DAT-8',
              category: 'data',
              severity: 'warning',
              specId,
              message: 'Early return between effects: some effects may not execute, causing partial writes',
              suggestion: 'Move all effects before early return guards, or use a transaction pattern',
            });
            break;
          }
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Cross-spec checks
// ---------------------------------------------------------------------------

function checkCrossSpecInputDrift(
  specs: ResolvedSpecEntry[],
  graph: CrossReferenceGraph,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  // Build input name → definitions map across specs in the same entity
  for (const [entity, specIds] of graph.entityToSpecs) {
    if (specIds.length < 2) continue;

    const entitySpecs = specIds
      .map((id) => specs.find((s) => s.specId === id))
      .filter((s): s is ResolvedSpecEntry => !!s);

    const inputDefs = new Map<string, Array<{ specId: string; def: Record<string, unknown> }>>();
    for (const { specId, node } of entitySpecs) {
      const inputs = getInputs(node);
      for (const [field, def] of Object.entries(inputs)) {
        const existing = inputDefs.get(field);
        if (existing) existing.push({ specId, def });
        else inputDefs.set(field, [{ specId, def }]);
      }
    }

    for (const [field, defs] of inputDefs) {
      if (defs.length < 2) continue;

      // Compare types
      const types = new Set(defs.map((d) => d.def.type as string));
      if (types.size > 1) {
        issues.push({
          id: 'DAT-11',
          category: 'data',
          severity: 'warning',
          specId: defs[1].specId,
          field,
          message: `Input '${field}' has type '${defs[1].def.type}' but '${defs[0].specId}' defines it as '${defs[0].def.type}' for entity '${entity}'`,
          suggestion: `Align input type for '${field}' across '${entity}' specs`,
          relatedSpecs: [defs[0].specId],
        });
      }

      // Compare max constraints
      const maxValues = defs.filter((d) => d.def.max !== undefined);
      if (maxValues.length >= 2) {
        const uniqueMaxes = new Set(maxValues.map((d) => d.def.max));
        if (uniqueMaxes.size > 1) {
          issues.push({
            id: 'DAT-11',
            category: 'data',
            severity: 'warning',
            specId: maxValues[1].specId,
            field,
            message: `Input '${field}' has max=${maxValues[1].def.max} but '${maxValues[0].specId}' uses max=${maxValues[0].def.max} for entity '${entity}'`,
            suggestion: `Align max constraint for '${field}' across '${entity}' specs`,
            relatedSpecs: [maxValues[0].specId],
          });
        }
      }
    }
  }

  return issues;
}

export const dataChecker: Checker = {
  id: 'data',
  name: 'Data Checker',
  category: 'data',
  check(context: AnalysisContext): AnalysisIssue[] {
    const issues = checkSpecs(context.specs, context.graph);
    issues.push(...checkDeepSpecs(context.specs, context));
    issues.push(...checkCrossSpecInputDrift(context.specs, context.graph));
    return issues;
  },
};
