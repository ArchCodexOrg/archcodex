/**
 * @arch archcodex.core.domain
 * @intent:stateless
 *
 * Security checker — detects security gaps inferable from spec schemas.
 * 14 analyses: SEC-1 through SEC-14.
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

function getAuth(node: SpecNode): string | undefined {
  const sec = node.security as Record<string, unknown> | undefined;
  return sec?.authentication as string | undefined;
}

function getRateLimit(node: SpecNode): unknown {
  const sec = node.security as Record<string, unknown> | undefined;
  return sec?.rate_limit;
}

function getPermissions(node: SpecNode): string[] {
  const sec = node.security as Record<string, unknown> | undefined;
  return (sec?.permissions as string[]) ?? [];
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

function hasEffectType(node: SpecNode, type: string): boolean {
  return getEffects(node).some((e) => e[type] !== undefined);
}

function getErrorExamples(node: SpecNode): Record<string, unknown>[] {
  const examples = node.examples as Record<string, unknown> | undefined;
  return (examples?.errors as Record<string, unknown>[]) ?? [];
}

function hasErrorCode(node: SpecNode, pattern: string): boolean {
  const lowerPattern = pattern.toLowerCase();
  return getErrorExamples(node).some((ex) => {
    const then = ex.then as Record<string, unknown> | undefined;
    if (!then) return false;
    const error = then.error as string | undefined;
    return error ? error.toLowerCase().includes(lowerPattern) : false;
  });
}

function getInputs(
  node: SpecNode,
): Record<string, Record<string, unknown>> {
  return (node.inputs as Record<string, Record<string, unknown>>) ?? {};
}

/** Check if the spec implies it operates on soft-deletable data. */
function specImpliesSoftDelete(node: SpecNode): boolean {
  const softDeletePatterns = /\b(soft.?delet\w*|isDeleted|is_deleted|archived|isArchived|deleted)\b/i;
  // Check inherits/mixins
  const inherits = (node as Record<string, unknown>).inherits as string | undefined;
  if (inherits && softDeletePatterns.test(inherits)) return true;
  const mixins = ((node as Record<string, unknown>).mixins as string[]) ?? [];
  if (mixins.some((m) => softDeletePatterns.test(m))) return true;
  // Check invariants
  const invariants = getInvariants(node);
  for (const inv of invariants) {
    const text = typeof inv === 'string'
      ? inv
      : ((inv as Record<string, unknown>).condition as string) ??
        ((inv as Record<string, unknown>).description as string) ?? '';
    if (softDeletePatterns.test(text)) return true;
  }
  // Check effects for soft-delete references
  const effects = getEffects(node);
  for (const eff of effects) {
    const desc = typeof eff === 'string' ? eff : ((eff as Record<string, unknown>).description as string) ?? '';
    if (softDeletePatterns.test(desc)) return true;
  }
  // Check inputs/outputs for isDeleted fields
  const inputs = getInputs(node);
  if ('isDeleted' in inputs || 'isArchived' in inputs) return true;
  const outputs = (node.outputs as Record<string, unknown>) ?? {};
  if ('isDeleted' in outputs || 'isArchived' in outputs) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

function checkSpecs(
  specs: ResolvedSpecEntry[],
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const { specId, node } of specs) {
    const auth = getAuth(node);
    const rateLimit = getRateLimit(node);
    const permissions = getPermissions(node);
    const hasDbWrite =
      hasDatabaseEffect(node, 'insert') ||
      hasDatabaseEffect(node, 'update') ||
      hasDatabaseEffect(node, 'delete');
    const hasAnyEffect = getEffects(node).length > 0;

    // SEC-1: Unauthenticated mutation with effects
    if (
      (auth === 'none' || auth === undefined) &&
      hasDbWrite
    ) {
      issues.push({
        id: 'SEC-1',
        category: 'security',
        severity: 'error',
        specId,
        message: `Unauthenticated database write: spec has database effects but authentication is '${auth ?? 'unset'}'`,
        suggestion: 'Add security.authentication: required or inherit from spec.mutation',
      });
    }

    // SEC-2: Missing rate limit on public endpoint
    if (
      (auth === 'none' || auth === 'optional') &&
      !rateLimit
    ) {
      const severity = hasAnyEffect ? 'error' : 'warning';
      issues.push({
        id: 'SEC-2',
        category: 'security',
        severity,
        specId,
        message: `Public endpoint without rate limit: authentication is '${auth}' but no rate_limit defined`,
        suggestion: 'Add security.rate_limit: { requests: 60, window: "15m" }',
      });
    }

    // SEC-3: Permission-effect mismatch (delete needs admin)
    if (
      hasDatabaseEffect(node, 'delete') &&
      permissions.length > 0 &&
      !permissions.some((p) => p.includes('admin') || p.includes('delete'))
    ) {
      issues.push({
        id: 'SEC-3',
        category: 'security',
        severity: 'error',
        specId,
        message:
          'Delete operation without admin/delete permission: spec deletes data but permissions only grant edit-level access',
        suggestion:
          'Add an admin or delete permission to security.permissions',
      });
    }

    // SEC-4: Missing input sanitization
    if (hasDbWrite) {
      const inputs = getInputs(node);
      const sanitization = (
        (node.security as Record<string, unknown> | undefined)
          ?.sanitization as string[]
      ) ?? [];

      for (const [field, def] of Object.entries(inputs)) {
        if (
          def.type === 'string' &&
          !def.validate &&
          !def.pattern &&
          sanitization.length === 0
        ) {
          issues.push({
            id: 'SEC-4',
            category: 'security',
            severity: 'warning',
            specId,
            field,
            message: `Unsanitized string '${field}' stored to database: no validate, pattern, or sanitization defined`,
            suggestion: `Add validate, pattern, or security.sanitization for input '${field}'`,
          });
        }
      }
    }

    // SEC-5: Missing auth/permission/rate-limit error examples
    if (auth === 'required') {
      if (!hasErrorCode(node, 'not_authenticated') && !hasErrorCode(node, 'unauthenticated')) {
        issues.push({
          id: 'SEC-5',
          category: 'security',
          severity: 'warning',
          specId,
          message: 'Missing NOT_AUTHENTICATED error example: spec requires auth but no auth error case',
          suggestion: 'Add error example: { given: { user: null }, then: { error: "NOT_AUTHENTICATED" } }',
        });
      }
    }

    // SEC-6: Overly broad permissions
    if (
      !hasAnyEffect &&
      permissions.some((p) => p.includes('admin') || p === '*')
    ) {
      issues.push({
        id: 'SEC-6',
        category: 'security',
        severity: 'warning',
        specId,
        message: 'Overly broad permissions: admin-level permission on a read-only operation',
        suggestion: 'Use view-level permission instead of admin for read operations',
      });
    }

    // SEC-7: Scheduler without rate limit
    if (hasEffectType(node, 'scheduler') && !rateLimit) {
      issues.push({
        id: 'SEC-7',
        category: 'security',
        severity: 'warning',
        specId,
        message: 'Scheduler effect without rate limit: risk of job queue flooding',
        suggestion: 'Add security.rate_limit to prevent scheduler abuse',
      });
    }

    // SEC-8: Missing NOT_FOUND for ID inputs
    const inputs = getInputs(node);
    for (const [field, def] of Object.entries(inputs)) {
      if (def.type === 'id' && def.table) {
        const tableName = def.table as string;
        if (
          !hasErrorCode(node, 'not_found') &&
          !hasErrorCode(node, `${tableName}_not_found`)
        ) {
          issues.push({
            id: 'SEC-8',
            category: 'security',
            severity: 'warning',
            specId,
            field,
            message: `Missing NOT_FOUND error for id input '${field}' (table: ${tableName})`,
            suggestion: `Add error example testing non-existent ${tableName} ID`,
          });
        }
      }
    }

    // SEC-9: Unbounded bulk operation (array input without max)
    for (const [field, def] of Object.entries(inputs)) {
      if (def.type === 'array' && def.max === undefined && hasDbWrite) {
        issues.push({
          id: 'SEC-9',
          category: 'security',
          severity: 'warning',
          specId,
          field,
          message: `Unbounded array input '${field}' with database write effects — potential DoS vector`,
          suggestion: `Add max constraint to input '${field}' (e.g., max: 100)`,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Deep analysis checks (require implementation content)
// ---------------------------------------------------------------------------

function getInvariants(node: SpecNode): unknown[] {
  return (node.invariants as unknown[]) ?? [];
}

function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(['"`])(?:(?!\1|\\).|\\.)*\1/g, '""');
}

/** Compile an array of regex pattern strings into RegExp objects. */
function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map((p) => new RegExp(p));
}

function checkDeepSpecs(
  specs: ResolvedSpecEntry[],
  context: AnalysisContext,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const implContents = context.implementationContents;
  if (!implContents) return issues;

  // Compile configurable patterns once (configured via .arch/config.yaml analysis.deep_patterns)
  const dp = context.deepPatterns;
  if (!dp) return issues;
  const authChecks = compilePatterns(dp.auth_check);
  const ownerChecks = compilePatterns(dp.ownership_check);
  const permissionRe = dp.permission_call ? new RegExp(dp.permission_call, 'g') : null;
  const softDeleteFilters = compilePatterns(dp.soft_delete_filter);
  const dbQueryPatterns = compilePatterns(dp.db_query);
  const dbGetPatterns = compilePatterns(dp.db_get);

  for (const { specId, node } of specs) {
    const implData = implContents.get(specId);
    if (!implData) continue;
    const auth = getAuth(node);
    const code = stripCommentsAndStrings(implData.content);

    // SEC-10: Auth required but code never checks user identity
    if (auth === 'required' && authChecks.length > 0) {
      const hasUserCheck = authChecks.some((re) => re.test(code));
      if (!hasUserCheck) {
        issues.push({
          id: 'SEC-10',
          category: 'security',
          severity: 'error',
          specId,
          message: 'Spec requires authentication but implementation never checks user identity',
          suggestion: 'Ensure implementation verifies the authenticated user (e.g., ctx.userId, req.user)',
        });
      }
    }

    // SEC-11: Owner-scoped invariant without owner check in code
    const invariants = getInvariants(node);
    const hasOwnerInvariant = invariants.some((inv) => {
      const text = typeof inv === 'string'
        ? inv
        : ((inv as Record<string, unknown>).condition as string) ??
          ((inv as Record<string, unknown>).description as string) ?? '';
      const lower = text.toLowerCase();
      return /own(er|s)?\b/.test(lower) || /user can only/.test(lower) || /only\s+.*\s+own/.test(lower);
    });

    if (hasOwnerInvariant && ownerChecks.length > 0 && dbGetPatterns.length > 0) {
      const hasDirectGet = dbGetPatterns.some((re) => re.test(code));
      const hasOwnerCheck = ownerChecks.some((re) => re.test(code));
      if (hasDirectGet && !hasOwnerCheck) {
        issues.push({
          id: 'SEC-11',
          category: 'security',
          severity: 'error',
          specId,
          message: 'Invariant requires owner-scoped access but code fetches record without owner check',
          suggestion: 'Verify record ownership after fetching (e.g., item.userId === ctx.userId)',
        });
      }
    }

    // SEC-13: Permission drift (spec permission vs code permission check)
    // Use original content (not stripped) — permission names are in string literals
    const specPermissions = getPermissions(node);
    if (specPermissions.length > 0 && permissionRe) {
      const permissionCalls = [...implData.content.matchAll(permissionRe)];
      for (const match of permissionCalls) {
        const codePermission = match[1];
        if (!codePermission) continue;
        const matchesSpec = specPermissions.some((p) => p.includes(codePermission));
        if (!matchesSpec) {
          issues.push({
            id: 'SEC-13',
            category: 'security',
            severity: 'error',
            specId,
            message: `Code checks permission '${codePermission}' but spec declares permissions [${specPermissions.join(', ')}]`,
            suggestion: `Align permission checks with spec: use one of [${specPermissions.join(', ')}]`,
          });
        }
      }
    }

    // SEC-14: Soft-delete leak (query without isDeleted filter)
    const hasSoftDeleteSignal = softDeleteFilters.length > 0 && dbQueryPatterns.length > 0 && specImpliesSoftDelete(node);
    if (hasSoftDeleteSignal) {
      const hasQueryEffect = getEffects(node).length === 0 || !hasDatabaseEffect(node);
      const inheritsQuery = ((node as Record<string, unknown>).inherits as string)?.includes('query') ?? false;
      if (hasQueryEffect || inheritsQuery) {
        const hasDbQuery = dbQueryPatterns.some((re) => re.test(code));
        const hasDeleteFilter = softDeleteFilters.some((re) => re.test(code));
        if (hasDbQuery && !hasDeleteFilter) {
          issues.push({
            id: 'SEC-14',
            category: 'security',
            severity: 'warning',
            specId,
            message: 'Query operation without soft-delete filter — may return deleted records to users',
            suggestion: 'Add soft-delete filtering to database queries',
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

function checkCrossSpecPermissions(
  specs: ResolvedSpecEntry[],
  graph: AnalysisContext['graph'],
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const [entity, specIds] of graph.entityToSpecs) {
    if (specIds.length < 2) continue;

    const entitySpecs = specIds
      .map((id) => specs.find((s) => s.specId === id))
      .filter((s): s is ResolvedSpecEntry => !!s);

    // Group permission models
    const permModels = new Map<string, string[]>();
    for (const { specId, node } of entitySpecs) {
      const perms = getPermissions(node);
      if (perms.length === 0) continue;
      const model = perms.sort().join(',');
      const existing = permModels.get(model);
      if (existing) existing.push(specId);
      else permModels.set(model, [specId]);
    }

    if (permModels.size > 1) {
      const sorted = [...permModels.entries()].sort((a, b) => b[1].length - a[1].length);
      const [majorityModel] = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        const [minorityModel, minoritySpecs] = sorted[i];
        for (const specId of minoritySpecs) {
          issues.push({
            id: 'SEC-12',
            category: 'security',
            severity: 'warning',
            specId,
            message: `Permission model [${minorityModel}] differs from majority [${majorityModel}] for entity '${entity}'`,
            suggestion: `Align permissions with other '${entity}' specs or document the exception`,
            relatedSpecs: sorted[0][1],
          });
        }
      }
    }
  }

  return issues;
}

export const securityChecker: Checker = {
  id: 'security',
  name: 'Security Checker',
  category: 'security',
  check(context: AnalysisContext): AnalysisIssue[] {
    const issues = checkSpecs(context.specs);
    issues.push(...checkDeepSpecs(context.specs, context));
    issues.push(...checkCrossSpecPermissions(context.specs, context.graph));
    return issues;
  },
};
