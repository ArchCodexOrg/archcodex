/**
 * @arch archcodex.core.domain
 * @intent:stateless
 *
 * Logic checker — detects logic issues inferable from spec schemas.
 * 13 analyses: LOG-1 through LOG-13.
 */

import type {
  AnalysisIssue,
  AnalysisContext,
  Checker,
  ResolvedSpecEntry,
} from '../types.js';
import type { SpecNode } from '../../spec/schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOutputs(node: SpecNode): Record<string, Record<string, unknown>> {
  return (node.outputs as Record<string, Record<string, unknown>>) ?? {};
}

function getInputs(node: SpecNode): Record<string, Record<string, unknown>> {
  return (node.inputs as Record<string, Record<string, unknown>>) ?? {};
}

function getInvariants(node: SpecNode): unknown[] {
  return (node.invariants as unknown[]) ?? [];
}

function getAllExamples(node: SpecNode): Record<string, unknown>[] {
  const examples = node.examples as Record<string, unknown> | undefined;
  if (!examples) return [];
  const result: Record<string, unknown>[] = [];
  for (const key of ['success', 'errors', 'warnings', 'boundaries']) {
    const arr = examples[key] as Record<string, unknown>[] | undefined;
    if (arr) result.push(...arr);
  }
  return result;
}

function getSuccessExamples(node: SpecNode): Record<string, unknown>[] {
  const examples = node.examples as Record<string, unknown> | undefined;
  return (examples?.success as Record<string, unknown>[]) ?? [];
}

function getErrorExamples(node: SpecNode): Record<string, unknown>[] {
  const examples = node.examples as Record<string, unknown> | undefined;
  return (examples?.errors as Record<string, unknown>[]) ?? [];
}

/**
 * Check if a nested property path exists in an output definition.
 * Traverses `properties` objects in the schema.
 */
function hasNestedProperty(
  outputDef: Record<string, unknown>,
  path: string[],
): boolean {
  if (path.length === 0) return true;

  const [current, ...rest] = path;
  const properties = outputDef.properties as
    | Record<string, Record<string, unknown>>
    | undefined;

  if (!properties) {
    // Check if it's an array type with items that have properties
    const items = outputDef.items as Record<string, unknown> | undefined;
    if (items?.properties) {
      return hasNestedProperty(
        items as Record<string, unknown>,
        path,
      );
    }
    // No properties defined, but we'll be lenient for unstructured objects
    return outputDef.type === 'object' || outputDef.type === 'array';
  }

  const propDef = properties[current];
  if (!propDef) return false;

  if (rest.length === 0) return true;
  return hasNestedProperty(propDef, rest);
}

/** Collect all `then` keys across all examples. */
function collectAssertedFields(node: SpecNode): Set<string> {
  const fields = new Set<string>();
  for (const ex of getAllExamples(node)) {
    const then = ex.then as Record<string, unknown> | undefined;
    if (then) {
      for (const key of Object.keys(then)) {
        // Normalize "result.field" → "field"
        const stripped = key.startsWith('result.') ? key.slice(7) : key;
        fields.add(stripped);
      }
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

function checkSpecs(specs: ResolvedSpecEntry[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const { specId, node } of specs) {
    // LOG-1: Contradictory invariants
    const invariants = getInvariants(node);
    if (invariants.length >= 2) {
      // Simple heuristic: find invariants with condition strings referencing same field
      // with contradictory operators
      const conditions: string[] = [];
      for (const inv of invariants) {
        if (typeof inv === 'string') conditions.push(inv);
        if (typeof inv === 'object' && inv !== null) {
          const cond = (inv as Record<string, unknown>).condition;
          if (typeof cond === 'string') conditions.push(cond);
        }
      }
      for (let i = 0; i < conditions.length; i++) {
        for (let j = i + 1; j < conditions.length; j++) {
          if (detectContradiction(conditions[i], conditions[j])) {
            issues.push({
              id: 'LOG-1',
              category: 'logic',
              severity: 'error',
              specId,
              message: `Contradictory invariants: "${conditions[i]}" vs "${conditions[j]}"`,
              suggestion: 'Review invariants for logical consistency',
            });
          }
        }
      }
    }

    // LOG-2: Unreachable error branches
    const inputs = getInputs(node);
    for (const errEx of getErrorExamples(node)) {
      const given = errEx.given as Record<string, unknown> | undefined;
      if (!given) continue;

      // Check if another field in this example clearly violates its input constraints.
      // If so, the error is likely caused by that field, not the enum field.
      const hasOtherInvalidField = Object.entries(given).some(([f, v]) => {
        const def = inputs[f];
        if (!def) return false;
        // Check min/max violations
        if (typeof v === 'number') {
          if (def.min !== undefined && v < (def.min as number)) return true;
          if (def.max !== undefined && v > (def.max as number)) return true;
        }
        // Check pattern violations
        if (typeof v === 'string' && typeof def.pattern === 'string') {
          try { if (!new RegExp(def.pattern as string).test(v)) return true; } catch { /* ignore invalid regex */ }
        }
        // Check null/undefined for required fields
        if (def.required === true && (v === null || v === undefined)) return true;
        // Check nested objects for constraint violations on sub-properties
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          const props = def.properties as Record<string, Record<string, unknown>> | undefined;
          if (props) {
            const obj = v as Record<string, unknown>;
            // Check provided fields for violations
            const hasViolation = Object.entries(obj).some(([sf, sv]) => {
              const sp = props[sf];
              if (!sp) return false;
              if (typeof sv === 'string' && typeof sp.pattern === 'string') {
                try { if (!new RegExp(sp.pattern as string).test(sv)) return true; } catch { /* ignore */ }
              }
              if (typeof sv === 'number') {
                if (sp.min !== undefined && sv < (sp.min as number)) return true;
                if (sp.max !== undefined && sv > (sp.max as number)) return true;
              }
              // Nested enum violation
              if (sp.type === 'enum' && Array.isArray(sp.values) && typeof sv === 'string') {
                if (!sp.values.includes(sv)) return true;
              }
              // Nested required null
              if (sp.required === true && (sv === null || sv === undefined)) return true;
              return false;
            });
            if (hasViolation) return true;
            // Check for missing required nested properties
            return Object.entries(props).some(([pn, pd]) =>
              pd.required === true && !(pn in obj),
            );
          }
        }
        return false;
      });

      for (const [field, value] of Object.entries(given)) {
        const inputDef = inputs[field];
        if (!inputDef) continue;
        if (
          inputDef.type === 'enum' &&
          Array.isArray(inputDef.values) &&
          inputDef.values.includes(value as string) &&
          !hasOtherInvalidField
        ) {
          issues.push({
            id: 'LOG-2',
            category: 'logic',
            severity: 'warning',
            specId,
            field,
            message: `Error example '${errEx.name ?? '(unnamed)'}' provides valid enum value '${value}' for '${field}' — framework validators may accept this before application code`,
            suggestion: 'Use an invalid enum value for this error test or test a different error condition',
          });
        }
      }
    }

    // LOG-3: Missing default handling in examples
    for (const [field, def] of Object.entries(inputs)) {
      if (def.default !== undefined) {
        const hasExampleOmitting = getSuccessExamples(node).some((ex) => {
          const given = ex.given as Record<string, unknown> | undefined;
          return given && !(field in given);
        });
        if (!hasExampleOmitting) {
          issues.push({
            id: 'LOG-3',
            category: 'logic',
            severity: 'warning',
            specId,
            field,
            message: `Input '${field}' has default value '${def.default}' but no example omits it to test the default`,
            suggestion: `Add a success example that omits '${field}' to verify default behavior`,
          });
        }
      }
    }

    // LOG-4: Incomplete state machine
    const ui = node.ui as Record<string, unknown> | undefined;
    if (ui) {
      const interaction = ui.interaction as Record<string, unknown> | undefined;
      if (interaction) {
        const states = interaction.states as Record<string, unknown> | undefined;
        const sequence = interaction.sequence as Record<string, unknown>[] | undefined;
        if (states && sequence) {
          const definedStates = new Set(Object.keys(states));
          const reachableStates = new Set<string>();
          for (const step of sequence) {
            const then = step.then as Record<string, unknown> | undefined;
            if (then) {
              for (const val of Object.values(then)) {
                if (typeof val === 'string') reachableStates.add(val);
              }
            }
          }
          for (const state of definedStates) {
            if (!reachableStates.has(state) && state !== 'initial') {
              issues.push({
                id: 'LOG-4',
                category: 'logic',
                severity: 'warning',
                specId,
                field: `ui.interaction.states.${state}`,
                message: `UI state '${state}' is defined but not reachable from any sequence step`,
                suggestion: 'Add a sequence step that transitions to this state or remove the state definition',
              });
            }
          }
        }
      }
    }

    // LOG-5: Invariant-example contradiction
    for (const inv of invariants) {
      if (typeof inv !== 'object' || inv === null) continue;
      const cond = (inv as Record<string, unknown>).condition;
      if (typeof cond !== 'string') continue;
      // Check for simple "result.X >= N" invariants contradicted by examples
      const match = cond.match(/result\.(\w+)\s*>=\s*(\d+)/);
      if (match) {
        const [, field, minStr] = match;
        const minVal = Number(minStr);
        for (const ex of getSuccessExamples(node)) {
          const then = ex.then as Record<string, unknown> | undefined;
          if (!then) continue;
          const val = then[`result.${field}`];
          if (typeof val === 'number' && val < minVal) {
            issues.push({
              id: 'LOG-5',
              category: 'logic',
              severity: 'error',
              specId,
              field: `result.${field}`,
              message: `Success example '${ex.name ?? '(unnamed)'}' asserts result.${field} = ${val}, contradicting invariant "${cond}"`,
              suggestion: 'Fix the example assertion or update the invariant',
            });
          }
        }
      }
    }

    // LOG-6: Forall/exists scope errors
    for (const inv of invariants) {
      if (typeof inv !== 'object' || inv === null) continue;
      const record = inv as Record<string, unknown>;
      const forall = record.forall as Record<string, unknown> | undefined;
      const exists = record.exists as Record<string, unknown> | undefined;
      const quantifier = forall ?? exists;
      const quantName = forall ? 'forall' : 'exists';
      if (!quantifier) continue;

      const inPath = quantifier.in as string | undefined;
      if (!inPath) continue;

      const outputs = getOutputs(node);
      // Check if the referenced collection exists in outputs
      const fieldPath = inPath.startsWith('result.')
        ? inPath.slice(7)
        : inPath.startsWith('input.')
          ? null // input refs are checked against inputs
          : inPath;

      if (fieldPath !== null) {
        // Handle nested paths like "fees.breakdown" by checking the root field
        // and then verifying nested properties exist in the schema
        const pathParts = fieldPath.split('.');
        const rootField = pathParts[0];
        const outputDef = outputs[rootField];

        if (!outputDef) {
          issues.push({
            id: 'LOG-6',
            category: 'logic',
            severity: 'error',
            specId,
            field: inPath,
            message: `${quantName} invariant references '${inPath}' but '${rootField}' is not defined in outputs`,
            suggestion: `Add '${rootField}' to outputs or fix the invariant path`,
          });
        } else if (pathParts.length > 1) {
          // Verify nested path exists in output schema
          const nestedPath = pathParts.slice(1);
          if (!hasNestedProperty(outputDef, nestedPath)) {
            issues.push({
              id: 'LOG-6',
              category: 'logic',
              severity: 'error',
              specId,
              field: inPath,
              message: `${quantName} invariant references '${inPath}' but nested path '${nestedPath.join('.')}' is not defined in '${rootField}' output schema`,
              suggestion: `Add '${nestedPath.join('.')}' to '${rootField}.properties' or fix the invariant path`,
            });
          }
        }
      }
    }

    // LOG-7: Output-assertion gap
    const outputs = getOutputs(node);
    if (Object.keys(outputs).length > 0) {
      const asserted = collectAssertedFields(node);
      for (const field of Object.keys(outputs)) {
        if (!asserted.has(field) && !asserted.has(`${field}`)) {
          // Check if any assertion uses a prefix like "result.field.sub"
          const hasNestedAssertion = [...asserted].some((a) =>
            a.startsWith(`${field}.`),
          );
          if (!hasNestedAssertion) {
            issues.push({
              id: 'LOG-7',
              category: 'logic',
              severity: 'warning',
              specId,
              field,
              message: `Output field '${field}' is never asserted in any example`,
              suggestion: `Add assertions for 'result.${field}' in success or boundary examples`,
            });
          }
        }
      }
    }

    // LOG-8: Required input treated as optional in examples
    for (const [field, def] of Object.entries(inputs)) {
      if (def.required === true && def.default !== undefined) {
        issues.push({
          id: 'LOG-8',
          category: 'logic',
          severity: 'warning',
          specId,
          field,
          message: `Input '${field}' is marked required but has a default value — contradictory definition`,
          suggestion: `Either remove 'required: true' or remove 'default' from input '${field}'`,
        });
      }
    }
  }

  return issues;
}

/**
 * Simple contradiction detection between two invariant condition strings.
 * Detects patterns like "x > 10" vs "x < 5" or "x === true" vs "x === false".
 */
function detectContradiction(a: string, b: string): boolean {
  // Pattern: same field, opposing boolean
  const boolA = a.match(/(\w+(?:\.\w+)*)\s*===\s*(true|false)/);
  const boolB = b.match(/(\w+(?:\.\w+)*)\s*===\s*(true|false)/);
  if (boolA && boolB && boolA[1] === boolB[1] && boolA[2] !== boolB[2]) {
    return true;
  }

  // Pattern: same field, contradictory ranges
  const gtA = a.match(/(\w+(?:\.\w+)*)\s*>\s*(\d+)/);
  const ltB = b.match(/(\w+(?:\.\w+)*)\s*<\s*(\d+)/);
  if (gtA && ltB && gtA[1] === ltB[1] && Number(gtA[2]) >= Number(ltB[2])) {
    return true;
  }
  const gtB = b.match(/(\w+(?:\.\w+)*)\s*>\s*(\d+)/);
  const ltA = a.match(/(\w+(?:\.\w+)*)\s*<\s*(\d+)/);
  if (gtB && ltA && gtB[1] === ltA[1] && Number(gtB[2]) >= Number(ltA[2])) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Deep analysis checks (require implementation content)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  // Articles, conjunctions, prepositions
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'must',
  'should', 'will', 'when', 'only', 'each', 'always', 'never',
  'does', 'into', 'than', 'they', 'been', 'some', 'then', 'also',
  'about', 'after', 'before', 'between', 'where', 'which', 'while',
  // Spec/testing vocabulary
  'result', 'input', 'output', 'true', 'false', 'spec', 'returns',
  'valid', 'value', 'values', 'given', 'first', 'last', 'list',
  // Natural-language behavioral descriptions
  'strings', 'string', 'number', 'numbers', 'array', 'arrays',
  'object', 'objects', 'boolean', 'type', 'types', 'format',
  'returned', 'produces', 'identical', 'includes', 'starting',
  'ending', 'contains', 'follows', 'uses', 'listed', 'present',
  'same', 'every', 'elements', 'element', 'entries', 'entry',
  'least', 'most', 'approximately', 'characters', 'field', 'fields',
  'section', 'sections', 'generated', 'matched', 'unchanged',
  'modified', 'preserved', 'annotated', 'deleted', 'removed',
  'added', 'walked', 'expanded', 'succeeds', 'fails', 'partial',
  'full', 'empty', 'support', 'supports', 'validate', 'existence',
  'pure', 'parsing', 'flagged', 'package', 'imports', 'external',
]);

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

  // LOG-9: Undocumented error codes (bridged from verifier) — aggregated per spec
  if (context.verifierResults) {
    for (const { specId } of specs) {
      const drift = context.verifierResults.get(specId);
      if (!drift || drift.extraErrors.length === 0) continue;
      const codes = drift.extraErrors;
      issues.push({
        id: 'LOG-9',
        category: 'logic',
        severity: 'warning',
        specId,
        message: `Implementation throws ${codes.length} undocumented error code(s): ${codes.join(', ')}`,
        suggestion: 'Add error examples for each undocumented code',
      });
    }
  }

  // LOG-10: Return shape drift (bridged from verifier) — aggregated per spec
  if (context.verifierResults) {
    for (const { specId } of specs) {
      const drift = context.verifierResults.get(specId);
      if (!drift) continue;
      if (drift.missingOutputs.length > 0) {
        const fields = drift.missingOutputs;
        issues.push({
          id: 'LOG-10',
          category: 'logic',
          severity: 'warning',
          specId,
          message: `${fields.length} spec output(s) not found in implementation: ${fields.join(', ')}`,
          suggestion: 'Add missing fields to implementation return value or remove from spec outputs',
        });
      }
      // Extra outputs (impl returns more than spec declares) are not flagged:
      // the verifier's regex-based field extraction can't reliably distinguish
      // return-value fields from intermediate variables, producing false positives.
    }
  }

  // LOG-11: Invariant unasserted in code
  const implContents = context.implementationContents;
  if (implContents) {
    for (const { specId, node } of specs) {
      const implData = implContents.get(specId);
      if (!implData) continue;
      const strippedCode = stripCommentsAndStrings(implData.content).toLowerCase();
      // Also check original code — invariants may reference string literals
      const originalCode = implData.content.toLowerCase();
      const invariants = getInvariants(node);

      for (const inv of invariants) {
        const text = typeof inv === 'string'
          ? inv
          : ((inv as Record<string, unknown>).condition as string) ??
            ((inv as Record<string, unknown>).description as string) ?? '';
        if (!text) continue;

        const keywords = text
          .toLowerCase()
          .split(/[^a-zA-Z0-9]+/)
          .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

        if (keywords.length < 2) continue;

        // Match against both stripped and original — take higher coverage
        const strippedMatch = keywords.filter((kw) => strippedCode.includes(kw)).length;
        const originalMatch = keywords.filter((kw) => originalCode.includes(kw)).length;
        const matchCount = Math.max(strippedMatch, originalMatch);
        const coverage = matchCount / keywords.length;

        if (coverage < 0.3) {
          issues.push({
            id: 'LOG-11',
            category: 'logic',
            severity: 'warning',
            specId,
            message: `Invariant "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}" has low code coverage (${Math.round(coverage * 100)}% keyword match)`,
            suggestion: 'Add explicit checks or guards that enforce this invariant',
          });
        }
      }
    }
  }

  // LOG-12: Error unreachable (spec error example's code not found in impl)
  if (implContents) {
    for (const { specId, node } of specs) {
      const implData = implContents.get(specId);
      if (!implData) continue;
      const code = implData.content;
      const errorExamples = getErrorExamples(node);

      for (const ex of errorExamples) {
        const then = ex.then as Record<string, unknown> | undefined;
        if (!then?.error) continue;
        const errorCode = String(then.error);
        if (!code.includes(errorCode)) {
          issues.push({
            id: 'LOG-12',
            category: 'logic',
            severity: 'info',
            specId,
            message: `Error example '${ex.name ?? errorCode}' expects error '${errorCode}' but code doesn't contain this error code`,
            suggestion: `Verify error '${errorCode}' is thrown in the implementation or remove the spec example`,
          });
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Cross-spec checks
// ---------------------------------------------------------------------------

function checkCrossSpecErrorCollision(
  specs: ResolvedSpecEntry[],
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  // Build error code → specs map
  const errorCodeToSpecs = new Map<string, Array<{ specId: string; exampleName: string }>>();
  for (const { specId, node } of specs) {
    for (const ex of getErrorExamples(node)) {
      const then = ex.then as Record<string, unknown> | undefined;
      if (!then?.error) continue;
      const errorCode = String(then.error);
      const exName = (ex.name as string) ?? '(unnamed)';
      const existing = errorCodeToSpecs.get(errorCode);
      if (existing) existing.push({ specId, exampleName: exName });
      else errorCodeToSpecs.set(errorCode, [{ specId, exampleName: exName }]);
    }
  }

  // Flag error codes used across different specs with potentially different meanings
  for (const [errorCode, usages] of errorCodeToSpecs) {
    const uniqueSpecs = [...new Set(usages.map((u) => u.specId))];
    if (uniqueSpecs.length < 2) continue;

    // Skip standard framework/validation error codes that naturally repeat across specs.
    // These are infrastructure-level codes, not domain-specific business errors.
    const commonErrors = ['NOT_FOUND', 'NOT_AUTHENTICATED', 'PERMISSION_DENIED', 'RATE_LIMITED', 'VALIDATION_ERROR', 'INVALID_INPUT'];
    if (commonErrors.includes(errorCode)) continue;
    // Skip well-known prefixes for input validation, missing data, and invalid state
    if (/^(MISSING|INVALID|UNKNOWN|NO)_/.test(errorCode)) continue;
    // Skip validator/schema infrastructure errors shared across spec ecosystem
    if (/^(DUPLICATE|CIRCULAR|EXAMPLE|GOAL|SCHEMA|FIXTURE|RESOLUTION|RESOLVE|RENDER|TEMPLATE|UNSUPPORTED)_/.test(errorCode)) continue;

    for (const specId of uniqueSpecs.slice(1)) {
      issues.push({
        id: 'LOG-13',
        category: 'logic',
        severity: 'info',
        specId,
        message: `Error code '${errorCode}' is also used by ${uniqueSpecs[0]} — verify consistent meaning`,
        suggestion: `Ensure '${errorCode}' means the same thing across both specs, or use distinct error codes`,
        relatedSpecs: [uniqueSpecs[0]],
      });
    }
  }

  return issues;
}

export const logicChecker: Checker = {
  id: 'logic',
  name: 'Logic Checker',
  category: 'logic',
  check(context: AnalysisContext): AnalysisIssue[] {
    const issues = checkSpecs(context.specs);
    issues.push(...checkDeepSpecs(context.specs, context));
    issues.push(...checkCrossSpecErrorCollision(context.specs));
    return issues;
  },
};
