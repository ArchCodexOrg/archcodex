/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Feature audit engine for comprehensive verification across layers.
 * Checks backend mutations, frontend hooks/handlers, and UI component wiring.
 *
 * @see spec.archcodex.featureAudit in .arch/specs/archcodex/feature-audit.spec.yaml
 */
import * as path from 'node:path';
import { globFiles, fileExists, readFile } from '../../utils/file-system.js';
import {
  loadComponentGroupsRegistry,
  findComponentGroupsByEntity,
  findComponentGroupsByMutation,
} from '../registry/component-groups.js';

// === Types ===

export type CheckStatus = 'found' | 'missing' | 'error';
export type LayerStatus = 'pass' | 'fail' | 'skip';
export type AuditStatus = 'complete' | 'incomplete' | 'error';
export type UICheckStatus = 'wired' | 'missing' | 'partial';
export type ImplementationStatus = 'stub' | 'implemented' | 'unknown';

export interface ImplementationAnalysis {
  status: ImplementationStatus;
  reason?: string;
}

export interface AuditCheck {
  name: string;
  status: CheckStatus;
  file?: string;
  expected?: string;
  details?: string;
  implementationStatus?: ImplementationStatus;
  stubReason?: string;
}

export interface UICheck {
  component: string;
  status: UICheckStatus;
  handler?: string;
  details?: string;
  implementationStatus?: ImplementationStatus;
  stubReason?: string;
}

export interface BackendAuditResult {
  status: LayerStatus;
  checks: AuditCheck[];
}

export interface FrontendAuditResult {
  status: LayerStatus;
  checks: AuditCheck[];
}

export interface UIAuditResult {
  status: LayerStatus;
  componentGroup?: string;
  checks: UICheck[];
}

export interface FeatureAuditResult {
  status: AuditStatus;
  layers: {
    backend: BackendAuditResult;
    frontend: FrontendAuditResult;
    ui: UIAuditResult;
  };
  remediation: string[];
  summary: string;
}

export interface FeatureAuditOptions {
  mutation?: string;
  entity?: string;
  projectRoot: string;
  verbose?: boolean;
}

// === Main Audit Function ===

/**
 * Audit feature implementation across all layers.
 */
export async function featureAudit(options: FeatureAuditOptions): Promise<FeatureAuditResult> {
  const { mutation, entity, projectRoot, verbose = false } = options;

  if (!mutation && !entity) {
    return {
      status: 'error',
      layers: {
        backend: { status: 'skip', checks: [] },
        frontend: { status: 'skip', checks: [] },
        ui: { status: 'skip', checks: [] },
      },
      remediation: [],
      summary: 'Either mutation or entity must be provided',
    };
  }

  const remediation: string[] = [];

  // Audit backend layer
  const backendResult = mutation
    ? await auditBackendLayer(mutation, projectRoot, verbose)
    : { status: 'skip' as LayerStatus, checks: [] };

  // Audit frontend layer
  const frontendResult = mutation
    ? await auditFrontendLayer(mutation, projectRoot, verbose)
    : { status: 'skip' as LayerStatus, checks: [] };

  // Derive handler name from mutation
  const handlerName = mutation ? deriveHandlerName(mutation) : undefined;

  // Audit UI layer
  const uiResult = entity && handlerName
    ? await auditUILayer(entity, handlerName, projectRoot, verbose)
    : { status: 'skip' as LayerStatus, checks: [] };

  // Collect remediation items
  for (const check of backendResult.checks) {
    if (check.status === 'missing') {
      remediation.push(`Backend: ${check.name} - ${check.expected || 'Create the missing item'}`);
    }
  }

  for (const check of frontendResult.checks) {
    if (check.status === 'missing') {
      remediation.push(`Frontend: ${check.name} - ${check.expected || 'Create the missing item'}`);
    }
  }

  for (const check of uiResult.checks) {
    if (check.status === 'missing' || check.status === 'partial') {
      remediation.push(`UI: Wire ${check.handler || 'handler'} to ${check.component}`);
    }
  }

  // Determine overall status
  const hasFailure =
    backendResult.status === 'fail' ||
    frontendResult.status === 'fail' ||
    uiResult.status === 'fail';

  const status: AuditStatus = hasFailure
    ? 'incomplete'
    : remediation.length > 0
      ? 'incomplete'
      : 'complete';

  // Build summary
  const summary = buildSummary(status, backendResult, frontendResult, uiResult, remediation);

  return {
    status,
    layers: {
      backend: backendResult,
      frontend: frontendResult,
      ui: uiResult,
    },
    remediation,
    summary,
  };
}

// === Backend Layer Audit ===

/**
 * Audit backend mutation/query existence and exports.
 */
export async function auditBackendLayer(
  mutation: string,
  projectRoot: string,
  _verbose = false
): Promise<BackendAuditResult> {
  const checks: AuditCheck[] = [];

  // Search for mutation in convex directory
  const convexFiles = await globFiles('convex/**/*.ts', { cwd: projectRoot });
  let mutationFile: string | undefined;
  let foundInBarrel = false;

  // Check 1: Mutation exists
  for (const file of convexFiles) {
    if (file.includes('index.ts') || file.includes('_generated')) continue;

    const fullPath = path.resolve(projectRoot, file);
    const content = await readFile(fullPath);

    // Look for mutation definition
    const exportPattern = new RegExp(`export\\s+const\\s+${mutation}\\s*=`, 'g');
    if (exportPattern.test(content)) {
      mutationFile = file;
      break;
    }
  }

  // Analyze implementation status if mutation found
  let implAnalysis: ImplementationAnalysis | undefined;
  if (mutationFile) {
    const fullMutPath = path.resolve(projectRoot, mutationFile);
    const mutContent = await readFile(fullMutPath);
    const exportIdx = mutContent.search(new RegExp(`export\\s+const\\s+${mutation}\\s*=`));
    if (exportIdx >= 0) {
      const body = extractFunctionBody(mutContent, exportIdx);
      if (body) {
        implAnalysis = analyzeImplementationStatus(body);
      }
    }
  }

  checks.push({
    name: 'mutation_exists',
    status: mutationFile ? 'found' : 'missing',
    file: mutationFile,
    expected: mutationFile ? undefined : `Create mutation ${mutation} in convex/`,
    implementationStatus: implAnalysis?.status,
    stubReason: implAnalysis?.reason,
  });

  // Check 2: Barrel export (only if mutation exists)
  if (mutationFile) {
    const moduleDir = path.dirname(mutationFile);
    const indexFile = path.join(moduleDir, 'index.ts');
    const fullIndexPath = path.resolve(projectRoot, indexFile);

    if (await fileExists(fullIndexPath)) {
      const indexContent = await readFile(fullIndexPath);
      // Check for re-export
      if (indexContent.includes(mutation)) {
        foundInBarrel = true;
      }
    }

    checks.push({
      name: 'barrel_export',
      status: foundInBarrel ? 'found' : 'missing',
      file: foundInBarrel ? indexFile : undefined,
      expected: foundInBarrel ? undefined : `Export ${mutation} from ${indexFile}`,
    });
  }

  const status: LayerStatus = checks.every((c) => c.status === 'found')
    ? 'pass'
    : checks.some((c) => c.status === 'error')
      ? 'fail'
      : 'fail';

  return { status, checks };
}

// === Frontend Layer Audit ===

/**
 * Audit frontend hooks and handlers.
 */
export async function auditFrontendLayer(
  mutation: string,
  projectRoot: string,
  _verbose = false
): Promise<FrontendAuditResult> {
  const checks: AuditCheck[] = [];

  // Search for hook wrapper
  const hookFiles = await globFiles('src/hooks/**/*.ts', { cwd: projectRoot });
  let hookFile: string | undefined;
  let handlerFile: string | undefined;

  const handlerName = deriveHandlerName(mutation);

  // Check 1: Hook wrapper
  for (const file of hookFiles) {
    const fullPath = path.resolve(projectRoot, file);
    const content = await readFile(fullPath);

    // Look for mutation usage in hook
    if (content.includes(mutation) && content.includes('useMutation')) {
      hookFile = file;
      break;
    }
  }

  checks.push({
    name: 'hook_wrapper',
    status: hookFile ? 'found' : 'missing',
    file: hookFile,
    expected: hookFile ? undefined : `Create hook wrapping ${mutation}`,
  });

  // Check 2: Handler
  let handlerAnalysis: ImplementationAnalysis | undefined;
  for (const file of hookFiles) {
    const fullPath = path.resolve(projectRoot, file);
    const content = await readFile(fullPath);

    // Look for handler function
    const handlerPattern = new RegExp(`${handlerName}\\s*[:=]`, 'g');
    if (handlerPattern.test(content)) {
      handlerFile = file;
      // Analyze implementation status
      const handlerIdx = content.search(new RegExp(`${handlerName}\\s*[:=]`));
      if (handlerIdx >= 0) {
        const body = extractFunctionBody(content, handlerIdx);
        if (body) {
          handlerAnalysis = analyzeImplementationStatus(body);
        }
      }
      break;
    }
  }

  checks.push({
    name: 'handler',
    status: handlerFile ? 'found' : 'missing',
    file: handlerFile,
    expected: handlerFile ? undefined : `Create handler ${handlerName}`,
    implementationStatus: handlerAnalysis?.status,
    stubReason: handlerAnalysis?.reason,
  });

  const status: LayerStatus = checks.every((c) => c.status === 'found')
    ? 'pass'
    : 'fail';

  return { status, checks };
}

// === UI Layer Audit ===

/**
 * Audit UI components for handler wiring.
 */
export async function auditUILayer(
  entity: string,
  handler: string,
  projectRoot: string,
  _verbose = false
): Promise<UIAuditResult> {
  const checks: UICheck[] = [];

  // Load component groups
  const registry = await loadComponentGroupsRegistry(projectRoot);

  // Find matching component group
  const matches = findComponentGroupsByEntity(registry, entity);

  if (matches.length === 0) {
    // Try mutation pattern matching
    const mutationMatches = findComponentGroupsByMutation(registry, entity);
    if (mutationMatches.length === 0) {
      return { status: 'skip', checks: [] };
    }
    matches.push(...mutationMatches);
  }

  const componentGroup = matches[0];

  // Check each component in the group
  for (const component of componentGroup.group.components) {
    const fullPath = path.resolve(projectRoot, component.path);
    const exists = await fileExists(fullPath);

    if (!exists) {
      checks.push({
        component: extractComponentName(component.path),
        status: 'missing',
        handler,
        details: `Component file not found: ${component.path}`,
      });
      continue;
    }

    const content = await readFile(fullPath);
    const componentName = extractComponentName(component.path);

    // Check if handler is used in the component
    const handlerUsed = content.includes(handler);
    const handlerImported = content.includes(`import`) && content.includes(handler);

    // Analyze component implementation status
    let compAnalysis: ImplementationAnalysis | undefined;
    if (handlerUsed) {
      const handlerIdx = content.indexOf(handler);
      const body = extractFunctionBody(content, handlerIdx);
      if (body) {
        compAnalysis = analyzeImplementationStatus(body);
      }
    }

    if (handlerUsed) {
      checks.push({
        component: componentName,
        status: 'wired',
        handler,
        implementationStatus: compAnalysis?.status,
        stubReason: compAnalysis?.reason,
      });
    } else if (handlerImported) {
      checks.push({
        component: componentName,
        status: 'partial',
        handler,
        details: 'Handler imported but not used',
      });
    } else {
      checks.push({
        component: componentName,
        status: 'missing',
        handler,
      });
    }
  }

  const status: LayerStatus = checks.every((c) => c.status === 'wired')
    ? 'pass'
    : 'fail';

  return {
    status,
    componentGroup: componentGroup.name,
    checks,
  };
}

// === Helper Functions ===

/**
 * Derive handler name from mutation name.
 * E.g., "duplicateEntry" -> "handleDuplicate"
 */
export function deriveHandlerName(mutation: string): string {
  // Remove common suffixes like Entry, Item, etc.
  const baseName = mutation
    .replace(/Entry$/, '')
    .replace(/Item$/, '')
    .replace(/Record$/, '');

  // Capitalize first letter
  const capitalized = baseName.charAt(0).toUpperCase() + baseName.slice(1);

  return `handle${capitalized}`;
}

/**
 * Analyze function body to determine if it's a stub or real implementation.
 * Uses regex heuristics (no AST) to respect core.engine constraints.
 */
export function analyzeImplementationStatus(functionBody: string): ImplementationAnalysis {
  const trimmed = functionBody.trim();

  // Heuristic 1: Empty body
  if (trimmed === '{}' || trimmed === '') {
    return { status: 'stub', reason: 'empty body' };
  }

  // Heuristic 2: TODO/FIXME markers
  if (/\/\/\s*(TODO|FIXME)/i.test(trimmed)) {
    const marker = /TODO/i.test(trimmed) ? 'TODO' : 'FIXME';
    return { status: 'stub', reason: `contains ${marker} marker` };
  }

  // Heuristic 3: Throw not-implemented
  if (/throw\s+new\s+Error\s*\(\s*['"`]not\s+implemented/i.test(trimmed)) {
    return { status: 'stub', reason: 'throws not-implemented error' };
  }

  // Heuristic 4: Single-line delegation (no validation)
  const singleLineReturn = /^\{\s*return\s+\w+\([^)]*\);\s*\}$/;
  if (singleLineReturn.test(trimmed)) {
    return { status: 'stub', reason: 'single-line delegation' };
  }

  // Heuristic 5: Minimal logic
  const lines = trimmed.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length;
  const hasBranching = /\b(if|switch|for|while)\b/.test(trimmed);
  const hasArrayMethods = /\.(filter|map|reduce|forEach|find|some|every)\b/.test(trimmed);
  const hasValidation = /\b(validate|check|verify)\b/i.test(trimmed);
  const hasErrorHandling = /\b(throw|catch)\b/.test(trimmed);

  if (lines < 3 && !hasBranching && !hasArrayMethods && !hasValidation && !hasErrorHandling) {
    return { status: 'stub', reason: 'minimal logic' };
  }

  return { status: 'implemented' };
}

/**
 * Extract function body from file content for a given export pattern.
 * Returns the body text between the outermost braces of the function.
 */
function extractFunctionBody(content: string, startIndex: number): string | undefined {
  let braceCount = 0;
  let bodyStart = -1;

  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      if (bodyStart === -1) bodyStart = i;
      braceCount++;
    } else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0 && bodyStart !== -1) {
        return content.slice(bodyStart, i + 1);
      }
    }
  }
  return undefined;
}

/**
 * Extract component name from file path.
 */
function extractComponentName(filePath: string): string {
  const fileName = path.basename(filePath);
  return fileName.replace(/\.(tsx?|jsx?)$/, '');
}

/**
 * Build human-readable summary.
 */
function buildSummary(
  status: AuditStatus,
  backend: BackendAuditResult,
  frontend: FrontendAuditResult,
  ui: UIAuditResult,
  remediation: string[]
): string {
  if (status === 'error') {
    return 'Audit failed with errors';
  }

  const parts: string[] = [];

  // Backend status
  if (backend.status !== 'skip') {
    const backendPassed = backend.checks.filter((c) => c.status === 'found').length;
    parts.push(`Backend: ${backendPassed}/${backend.checks.length} checks passed`);
  }

  // Frontend status
  if (frontend.status !== 'skip') {
    const frontendPassed = frontend.checks.filter((c) => c.status === 'found').length;
    parts.push(`Frontend: ${frontendPassed}/${frontend.checks.length} checks passed`);
  }

  // UI status
  if (ui.status !== 'skip') {
    const uiWired = ui.checks.filter((c) => c.status === 'wired').length;
    parts.push(`UI: ${uiWired}/${ui.checks.length} components wired`);
  }

  if (remediation.length > 0) {
    parts.push(`${remediation.length} items need attention`);
  }

  return status === 'complete'
    ? `Feature complete. ${parts.join('. ')}`
    : `Feature incomplete. ${parts.join('. ')}`;
}
