/**
 * @arch archcodex.core.domain.resolver
 * @intent:spec-infrastructure
 *
 * Spec resolver - resolves inheritance and mixins to produce flattened specs.
 * Similar to architecture resolution but for specs.
 */
import type {
  SpecRegistry,
  SpecNode,
  MixinDefinition,
  MixinRef,
  ResolvedSpec,
  SpecResolveResult,
  SpecValidationError,
  Example,
  Security,
  InputField,
  UI,
} from './schema.js';
import { RegistryError, ErrorCodes } from '../../utils/errors.js';

/**
 * Options for resolving a spec.
 */
export interface SpecResolveOptions {
  /** Whether to expand mixins (default: true) */
  expandMixins?: boolean;
  /** Whether to resolve inheritance (default: true) */
  resolveInherits?: boolean;
  /** Variables to substitute in mixins */
  variables?: Record<string, string>;
}

/**
 * Resolve a spec ID to its fully flattened form.
 * Handles inheritance, mixins, and variable substitution.
 *
 * Precedence (highest to lowest):
 * 1. Self (the spec node)
 * 2. Mixins (in declaration order, last wins)
 * 3. Parent (inherited from base spec)
 */
export function resolveSpec(
  registry: SpecRegistry,
  specId: string,
  options: SpecResolveOptions = {}
): SpecResolveResult {
  const { expandMixins = true, resolveInherits = true, variables = {} } = options;
  const errors: SpecValidationError[] = [];

  // Validate spec exists
  if (!registry.nodes[specId]) {
    return {
      valid: false,
      errors: [{
        code: 'SPEC_NOT_FOUND',
        message: `Spec '${specId}' not found in registry`,
      }],
    };
  }

  const inheritanceChain: string[] = [];
  const appliedMixins: string[] = [];
  const visited = new Set<string>();

  // Build inheritance chain (detect cycles)
  try {
    buildInheritanceChain(registry, specId, inheritanceChain, visited, resolveInherits);
  } catch (error) {
    if (error instanceof RegistryError) {
      // Translate internal error codes to descriptive strings for spec consumers
      const codeMap: Record<string, string> = {
        [ErrorCodes.CIRCULAR_INHERITANCE]: 'CIRCULAR_INHERITANCE',
        [ErrorCodes.UNKNOWN_ARCH]: 'UNKNOWN_PARENT',
      };
      return {
        valid: false,
        errors: [{ code: codeMap[error.code] || error.code, message: error.message }],
      };
    }
    return {
      valid: false,
      errors: [{ code: 'RESOLUTION_ERROR', message: error instanceof Error ? error.message : String(error) }],
    };
  }

  // Start with empty node and merge from parent to child
  let resolved: SpecNode = { intent: '' };
  const reversedChain = [...inheritanceChain].reverse();

  for (const nodeId of reversedChain) {
    const node = registry.nodes[nodeId];
    if (!node) continue;

    // Merge node into resolved
    resolved = mergeSpecNodes(resolved, node);
  }

  // Process mixins for the leaf node
  const leafNode = registry.nodes[specId];
  if (expandMixins && leafNode?.mixins) {
    for (const mixinRef of leafNode.mixins) {
      const { mixinId, params } = parseMixinRef(mixinRef);
      const mixin = registry.mixins[mixinId];

      if (!mixin) {
        errors.push({
          code: 'UNKNOWN_MIXIN',
          message: `Mixin '${mixinId}' not found in registry`,
          field: 'mixins',
        });
        continue;
      }

      appliedMixins.push(mixinId);

      // Substitute variables in mixin
      const allVariables = { ...variables, ...params };
      const expandedMixin = substituteMixinVariables(mixin, allVariables);

      // Check for leftover unresolved ${} placeholders
      const expandedJson = JSON.stringify(expandedMixin);
      const leftoverVars = expandedJson.match(/\$\{([^}]+)\}/g);
      if (leftoverVars) {
        errors.push({
          code: 'UNRESOLVED_VARIABLE',
          message: `Mixin '${mixinId}' has unresolved variables: ${leftoverVars.join(', ')}`,
          field: 'mixins',
        });
      }

      // Handle composite mixins (mixins that include other mixins)
      if (expandedMixin.compose) {
        for (const composedRef of expandedMixin.compose) {
          const { mixinId: composedId, params: composedParams } = parseMixinRef(composedRef);
          const composedMixin = registry.mixins[composedId];

          if (composedMixin) {
            const composedVariables = { ...allVariables, ...composedParams };
            const expandedComposed = substituteMixinVariables(composedMixin, composedVariables);
            resolved = mergeMixinIntoSpec(resolved, expandedComposed);
            appliedMixins.push(composedId);
          } else {
            errors.push({
              code: 'UNKNOWN_MIXIN',
              message: `Composed mixin '${composedId}' not found in registry`,
              field: 'mixins',
            });
          }
        }
      }

      // Merge mixin into resolved
      resolved = mergeMixinIntoSpec(resolved, expandedMixin);
    }
  }

  // Note: leafNode is already applied via the inheritance chain (it's the first item before reversing)
  // No need to apply it again here

  // Strip inherits/mixins from resolved node (fully resolved = no metadata fields)
  delete resolved.inherits;
  delete resolved.mixins;

  return {
    valid: errors.length === 0,
    spec: {
      specId,
      inheritanceChain,
      appliedMixins,
      node: resolved,
    },
    errors,
  };
}

/**
 * Build the inheritance chain by traversing parents.
 */
function buildInheritanceChain(
  registry: SpecRegistry,
  specId: string,
  chain: string[],
  visited: Set<string>,
  resolveInherits: boolean
): void {
  if (visited.has(specId)) {
    throw new RegistryError(
      ErrorCodes.CIRCULAR_INHERITANCE,
      `Circular inheritance detected in specs: ${Array.from(visited).join(' → ')} → ${specId}`,
      { cycle: [...visited, specId] }
    );
  }

  visited.add(specId);
  chain.push(specId);

  const node = registry.nodes[specId];
  if (resolveInherits && node?.inherits) {
    if (!registry.nodes[node.inherits]) {
      throw new RegistryError(
        ErrorCodes.UNKNOWN_ARCH,
        `Parent spec '${node.inherits}' not found (referenced by '${specId}')`,
        { specId, parent: node.inherits }
      );
    }
    buildInheritanceChain(registry, node.inherits, chain, visited, resolveInherits);
  }
}

/**
 * Parse a mixin reference into ID and parameters.
 * Handles both string refs and object refs with params.
 */
function parseMixinRef(ref: MixinRef): { mixinId: string; params: Record<string, string> } {
  if (typeof ref === 'string') {
    return { mixinId: ref, params: {} };
  }

  // Object ref: { logs_audit: { action: "test", resource: "test" } }
  const keys = Object.keys(ref);
  if (keys.length !== 1) {
    return { mixinId: keys[0] || '', params: {} };
  }

  const mixinId = keys[0];
  const params = ref[mixinId] as Record<string, unknown>;

  // Convert all param values to strings
  const stringParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    stringParams[key] = String(value);
  }

  return { mixinId, params: stringParams };
}

/**
 * Substitute ${variable} placeholders in a mixin definition.
 */
function substituteMixinVariables(
  mixin: MixinDefinition,
  variables: Record<string, string>
): MixinDefinition {
  const json = JSON.stringify(mixin);
  let substituted = json;

  for (const [key, value] of Object.entries(variables)) {
    // Escape regex metacharacters in variable key
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const placeholder = new RegExp(`\\$\\{${escapedKey}\\}`, 'g');
    substituted = substituted.replace(placeholder, value);
  }

  return JSON.parse(substituted) as MixinDefinition;
}

/**
 * Merge two spec nodes (parent into child).
 * Child values take precedence.
 */
function mergeSpecNodes(parent: SpecNode, child: SpecNode): SpecNode {
  const merged: SpecNode = { ...parent };

  // Simple overrides (child wins)
  if (child.intent) merged.intent = child.intent;
  if (child.version) merged.version = child.version;
  if (child.description) merged.description = child.description;
  if (child.rationale) merged.rationale = child.rationale;
  if (child.goal) merged.goal = child.goal;
  if (child.implementation) merged.implementation = child.implementation;
  if (child.parent) merged.parent = child.parent;

  // Arrays: concat (child adds to parent)
  if (child.outcomes) {
    merged.outcomes = [...(parent.outcomes || []), ...child.outcomes];
  }
  if (child.architectures) {
    merged.architectures = [...new Set([...(parent.architectures || []), ...child.architectures])];
  }
  if (child.depends_on) {
    merged.depends_on = [...new Set([...(parent.depends_on || []), ...child.depends_on])];
  }
  if (child.invariants) {
    merged.invariants = [...(parent.invariants || []), ...child.invariants];
  }
  if (child.effects) {
    merged.effects = [...(parent.effects || []), ...child.effects];
  }

  // Objects: deep merge
  if (child.security) {
    merged.security = mergeSecurity(parent.security, child.security);
  }
  if (child.inputs) {
    merged.inputs = { ...(parent.inputs || {}), ...child.inputs };
  }
  if (child.examples) {
    merged.examples = mergeExamples(parent.examples, child.examples);
  }
  if (child.defaults) {
    merged.defaults = { ...(parent.defaults || {}), ...child.defaults };
  }
  if (child.ui || parent.ui) {
    merged.ui = mergeUI(parent.ui, child.ui);
  }

  // Don't inherit these (child-only)
  if (child.mixins) merged.mixins = child.mixins;
  if (child.inherits) merged.inherits = child.inherits;

  return merged;
}

/**
 * Merge mixin definition into a spec node.
 */
function mergeMixinIntoSpec(spec: SpecNode, mixin: MixinDefinition): SpecNode {
  const merged: SpecNode = { ...spec };

  // Merge security
  if (mixin.security) {
    merged.security = mergeSecurity(spec.security, mixin.security);
  }

  // Merge invariants
  if (mixin.invariants) {
    merged.invariants = [...(spec.invariants || []), ...mixin.invariants];
  }

  // Merge examples
  if (mixin.examples) {
    merged.examples = mergeExamples(spec.examples, mixin.examples);
  }

  // Merge effects
  if (mixin.effects) {
    merged.effects = [...(spec.effects || []), ...mixin.effects];
  }

  // Merge UI
  if (mixin.ui) {
    merged.ui = mergeUI(spec.ui, mixin.ui);
  }

  return merged;
}

/**
 * Merge security settings.
 */
function mergeSecurity(parent?: Security, child?: Security): Security {
  if (!parent) return child || {};
  if (!child) return parent;

  return {
    authentication: child.authentication ?? parent.authentication,
    rate_limit: child.rate_limit ?? parent.rate_limit,
    permissions: child.permissions
      ? [...new Set([...(parent.permissions || []), ...child.permissions])]
      : parent.permissions,
    sanitization: child.sanitization
      ? [...new Set([...(parent.sanitization || []), ...child.sanitization])]
      : parent.sanitization,
  };
}

/**
 * Merge UI specifications.
 * Child values override parent values at each sub-level.
 */
function mergeUI(parent?: UI, child?: UI): UI {
  if (!parent) return child || {};
  if (!child) return parent;

  return {
    trigger: child.trigger
      ? { ...(parent.trigger || {}), ...child.trigger }
      : parent.trigger,
    interaction: child.interaction
      ? { ...(parent.interaction || {}), ...child.interaction }
      : parent.interaction,
    feedback: child.feedback
      ? { ...(parent.feedback || {}), ...child.feedback }
      : parent.feedback,
    accessibility: child.accessibility
      ? { ...(parent.accessibility || {}), ...child.accessibility }
      : parent.accessibility,
  };
}

/**
 * Merge examples.
 */
function mergeExamples(
  parent?: { success?: Example[]; errors?: Example[]; warnings?: Example[] },
  child?: { success?: Example[]; errors?: Example[]; warnings?: Example[] }
): { success?: Example[]; errors?: Example[]; warnings?: Example[] } {
  if (!parent) return child || {};
  if (!child) return parent;

  return {
    success: [...(parent.success || []), ...(child.success || [])],
    errors: [...(parent.errors || []), ...(child.errors || [])],
    warnings: [...(parent.warnings || []), ...(child.warnings || [])],
  };
}

/**
 * Format a resolved spec for LLM consumption (compact YAML-like format).
 */
export function formatSpecForLLM(spec: ResolvedSpec): string {
  const lines: string[] = [];

  lines.push(`# ${spec.specId}`);
  if (spec.inheritanceChain.length > 1) {
    lines.push(`# Inherits: ${spec.inheritanceChain.slice(1).join(' → ')}`);
  }
  if (spec.appliedMixins.length > 0) {
    lines.push(`# Mixins: ${spec.appliedMixins.join(', ')}`);
  }
  lines.push('');

  const node = spec.node;

  if (node.goal) {
    lines.push(`goal: "${node.goal}"`);
  }
  if (node.outcomes?.length) {
    lines.push(`outcomes: [${node.outcomes.map(o => `"${o}"`).join(', ')}]`);
  }
  lines.push(`intent: "${node.intent}"`);

  if (node.security) {
    lines.push('security:');
    if (node.security.authentication) {
      lines.push(`  authentication: ${node.security.authentication}`);
    }
    if (node.security.rate_limit) {
      lines.push(`  rate_limit: { requests: ${node.security.rate_limit.requests}, window: "${node.security.rate_limit.window}" }`);
    }
    if (node.security.permissions?.length) {
      lines.push(`  permissions: [${node.security.permissions.join(', ')}]`);
    }
  }

  if (node.inputs && Object.keys(node.inputs).length > 0) {
    lines.push('inputs:');
    for (const [name, field] of Object.entries(node.inputs)) {
      const inputField = field as InputField;
      const parts = [`type: ${inputField.type}`];
      if (inputField.required) parts.push('required: true');
      if (inputField.validate) parts.push(`validate: ${inputField.validate}`);
      lines.push(`  ${name}: { ${parts.join(', ')} }`);
    }
  }

  if (node.invariants?.length) {
    lines.push('invariants:');
    for (const inv of node.invariants) {
      if (typeof inv === 'string') {
        lines.push(`  - "${inv}"`);
      } else {
        lines.push(`  - ${JSON.stringify(inv)}`);
      }
    }
  }

  if (node.examples) {
    lines.push('examples:');
    if (node.examples.success?.length) {
      lines.push('  success:');
      for (const ex of node.examples.success) {
        lines.push(`    - ${JSON.stringify(ex)}`);
      }
    }
    if (node.examples.errors?.length) {
      lines.push('  errors:');
      for (const ex of node.examples.errors) {
        lines.push(`    - ${JSON.stringify(ex)}`);
      }
    }
  }

  if (node.effects?.length) {
    lines.push('effects:');
    for (const effect of node.effects) {
      lines.push(`  - ${JSON.stringify(effect)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get all ancestor spec IDs for a spec.
 */
export function getSpecAncestors(registry: SpecRegistry, specId: string): string[] {
  const result = resolveSpec(registry, specId);
  if (!result.spec) return [];
  return result.spec.inheritanceChain.slice(1); // Exclude self
}

/**
 * Get all specs that depend on a given spec.
 */
export function getSpecDependents(registry: SpecRegistry, specId: string): string[] {
  const dependents: string[] = [];

  for (const [id, node] of Object.entries(registry.nodes)) {
    if (node.depends_on?.includes(specId)) {
      dependents.push(id);
    }
  }

  return dependents;
}

// === Implementation Resolution ===

/**
 * Parsed implementation reference.
 */
export interface ParsedImplementation {
  /** Relative path to the implementation file */
  path: string;
  /** Export name (named export from the module) */
  exportName: string;
  /** Whether this is a default export */
  isDefault: boolean;
}

/**
 * Resolved implementation with import-ready paths.
 */
export interface ResolvedImplementation {
  /** Import path for use in generated tests */
  importPath: string;
  /** Function name to import */
  functionName: string;
  /** Original implementation string */
  original: string;
}

/**
 * Parse an implementation string into path and export name.
 *
 * Formats supported:
 * - "path/to/file.ts#exportName" → named export
 * - "path/to/file.ts#default" → default export
 * - "path/to/file.ts" → infers export name from spec ID
 *
 * @example
 * parseImplementation("src/domain/products/mutations/create.ts#create")
 * // → { path: "src/domain/products/mutations/create.ts", exportName: "create", isDefault: false }
 *
 * parseImplementation("src/domain/products/mutations/create.ts")
 * // → { path: "src/domain/products/mutations/create.ts", exportName: "", isDefault: false }
 */
export function parseImplementation(implementation: string): ParsedImplementation {
  const hashIndex = implementation.lastIndexOf('#');

  if (hashIndex === -1) {
    // No hash - path only, export name needs to be inferred
    return {
      path: implementation,
      exportName: '',
      isDefault: false,
    };
  }

  const path = implementation.slice(0, hashIndex);
  const exportName = implementation.slice(hashIndex + 1);

  return {
    path,
    exportName: exportName === 'default' ? '' : exportName,
    isDefault: exportName === 'default',
  };
}

/**
 * Resolve implementation from a spec into import-ready format.
 *
 * @param spec - Resolved spec with implementation field
 * @param testFilePath - Optional path to the test file (for relative imports).
 *   When provided, the import path is calculated relative to the test file.
 *   When not provided, the full implementation path is used (safer default).
 * @returns Resolved implementation or null if not specified
 */
export function resolveImplementation(
  spec: ResolvedSpec,
  testFilePath?: string
): ResolvedImplementation | null {
  const implementation = spec.node.implementation;
  if (!implementation) {
    return null;
  }

  const parsed = parseImplementation(implementation);

  // Infer export name from spec ID if not provided
  // e.g., spec.product.create → "create"
  const exportName = parsed.exportName || spec.specId.split('.').pop() || 'default';

  // Calculate import path
  let importPath = parsed.path;

  // Replace source extension with .js for ESM imports
  importPath = importPath.replace(/\.(ts|tsx)$/, '.js');
  // Keep existing .js/.jsx as-is; strip nothing

  // If test file path provided, calculate relative path
  if (testFilePath) {
    importPath = calculateRelativeImport(testFilePath, importPath);
  } else {
    // Default: preserve full path with relative indicator
    // User should use --output flag to get proper relative imports
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      importPath = './' + importPath;
    }
  }

  return {
    importPath,
    functionName: parsed.isDefault ? 'default' : exportName,
    original: implementation,
  };
}

/**
 * Calculate relative import path from test file to implementation.
 */
function calculateRelativeImport(testFilePath: string, implementationPath: string): string {
  // Normalize paths
  const normalizeTestPath = testFilePath.replace(/\\/g, '/');
  const normalizeImplPath = implementationPath.replace(/\\/g, '/');

  // Check if paths are in completely different locations (e.g., /tmp vs project dir)
  // If test file is at an absolute path outside the project, provide a helpful comment
  const testIsAbsolute = normalizeTestPath.startsWith('/') || /^[a-zA-Z]:/.test(normalizeTestPath);
  const implIsRelative = !normalizeImplPath.startsWith('/') && !/^[a-zA-Z]:/.test(normalizeImplPath);

  if (testIsAbsolute && implIsRelative) {
    // Test output is outside project (e.g., /tmp/tests/), implementation is relative to project
    // Return a path relative to project root - user will adjust when moving the file
    const pathWithJsExt = normalizeImplPath.replace(/\.(ts|tsx)$/, '.js');
    return `./${pathWithJsExt}`;
  }

  // Both paths need to be comparable - either both absolute or both relative
  const testParts = normalizeTestPath.split('/').filter(Boolean);
  const implParts = normalizeImplPath.split('/').filter(Boolean);

  // Remove filename from test path
  testParts.pop();

  // Find common prefix
  let commonPrefixLength = 0;
  for (let i = 0; i < Math.min(testParts.length, implParts.length); i++) {
    if (testParts[i] === implParts[i]) {
      commonPrefixLength++;
    } else {
      break;
    }
  }

  // Calculate relative path
  const upCount = testParts.length - commonPrefixLength;
  const ups = '../'.repeat(upCount);
  const relativePath = implParts.slice(commonPrefixLength).join('/');

  // Replace .ts/.tsx with .js for ESM imports
  const pathWithJsExt = relativePath.replace(/\.(ts|tsx)$/, '.js');

  const result = ups + pathWithJsExt;
  // Ensure local imports have ./ prefix (otherwise they're treated as node modules)
  if (result && !result.startsWith('.') && !result.startsWith('/')) {
    return './' + result;
  }
  return result || './';
}
