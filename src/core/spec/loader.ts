/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Spec loader - loads spec YAML files from the filesystem.
 * Handles both registry specs (.arch/specs/) and colocated specs (*.spec.yaml).
 */
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { logger } from '../../utils/logger.js';
import {
  SpecNodeSchema,
  MixinDefinitionSchema,
  SPEC_NODE_CORE_FIELDS,
  KNOWN_EXTENSION_FIELDS,
  type SpecRegistry,
  type ParsedSpec,
  type SpecParseResult,
  type SpecValidationError,
} from './schema.js';
import { loadYaml, fileExists, directoryExists, parseYamlMultiDocMerged, readFile } from '../../utils/index.js';

const DEFAULT_SPECS_DIR = '.arch/specs';
const DEFAULT_BASE_FILE = '_base.yaml';
const DEFAULT_MIXINS_FILE = '_mixins.yaml';

/**
 * Load the spec registry from .arch/specs/ directory.
 * Includes base specs and mixins.
 */
export async function loadSpecRegistry(projectRoot: string): Promise<SpecRegistry> {
  const specsDir = path.resolve(projectRoot, DEFAULT_SPECS_DIR);

  if (!(await directoryExists(specsDir))) {
    // Return empty registry if no specs directory
    return { nodes: {}, mixins: {} };
  }

  const registry: SpecRegistry = { nodes: {}, mixins: {} };

  // Load base specs
  const basePath = path.join(specsDir, DEFAULT_BASE_FILE);
  if (await fileExists(basePath)) {
    const baseContent = await loadYaml<Record<string, unknown>>(basePath);
    if (baseContent) {
      for (const [key, value] of Object.entries(baseContent)) {
        if (key === 'version') continue;
        if (key.startsWith('spec.') && value && typeof value === 'object') {
          const result = SpecNodeSchema.safeParse(value);
          if (result.success) {
            registry.nodes[key] = result.data;
          }
        }
      }
    }
  }

  // Load mixins
  const mixinsPath = path.join(specsDir, DEFAULT_MIXINS_FILE);
  if (await fileExists(mixinsPath)) {
    const mixinsContent = await loadYaml<{ mixins?: Record<string, unknown>; version?: string }>(mixinsPath);
    if (mixinsContent?.mixins) {
      for (const [key, value] of Object.entries(mixinsContent.mixins)) {
        if (value && typeof value === 'object') {
          const result = MixinDefinitionSchema.safeParse(value);
          if (result.success) {
            registry.mixins[key] = result.data;
          }
        }
      }
    }
  }

  // Load all other spec files recursively
  const specFiles = await findSpecFiles(specsDir);
  for (const filePath of specFiles) {
    const fileName = path.basename(filePath);
    if (fileName === DEFAULT_BASE_FILE || fileName === DEFAULT_MIXINS_FILE) {
      continue; // Already loaded
    }

    try {
      // Use multi-document parser to support --- separators
      const fileContent = await readFile(filePath);
      const content = parseYamlMultiDocMerged<Record<string, unknown>>(fileContent);
      if (!content) continue;

      for (const [key, value] of Object.entries(content)) {
        if (key === 'version' || key === 'defaults') continue;
        if (key.startsWith('spec.') && value && typeof value === 'object') {
          const result = SpecNodeSchema.safeParse(value);
          if (result.success) {
            registry.nodes[key] = result.data;
          }
        }
      }
    } catch (error) {
      // Log but continue loading other files
      logger.warn(`Failed to load spec file ${filePath}: ${error}`);
    }
  }

  return registry;
}

/**
 * Load a single spec file and parse all specs in it.
 */
export async function loadSpecFile(filePath: string): Promise<SpecParseResult> {
  const errors: SpecValidationError[] = [];
  const warnings: SpecValidationError[] = [];
  const specs: ParsedSpec[] = [];

  if (!(await fileExists(filePath))) {
    return {
      valid: false,
      specs: [],
      errors: [{ code: 'FILE_NOT_FOUND', message: `Spec file not found: ${filePath}` }],
      warnings: [],
    };
  }

  let content: Record<string, unknown>;
  try {
    // Use multi-document parser to support --- separators
    const fileContent = await readFile(filePath);
    const parsed = parseYamlMultiDocMerged<Record<string, unknown>>(fileContent);
    if (!parsed || Object.keys(parsed).length === 0) {
      return {
        valid: false,
        specs: [],
        errors: [{ code: 'YAML_PARSE_ERROR', message: 'File is empty or invalid YAML' }],
        warnings: [],
      };
    }
    content = parsed;
  } catch (error) {
    return {
      valid: false,
      specs: [],
      errors: [{
        code: 'YAML_PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown YAML parse error',
      }],
      warnings: [],
    };
  }

  // Process each top-level key as a potential spec
  for (const [key, value] of Object.entries(content)) {
    // Skip metadata keys
    if (key === 'version' || key === 'defaults') continue;

    // Validate spec ID format
    if (!key.startsWith('spec.')) {
      if (key !== '---') { // YAML document separator
        errors.push({
          code: 'INVALID_SPEC_ID',
          message: `Invalid spec ID format: '${key}'. Spec IDs must start with 'spec.'`,
          field: key,
        });
      }
      continue;
    }

    if (!value || typeof value !== 'object') {
      errors.push({
        code: 'INVALID_SPEC_STRUCTURE',
        message: `Spec '${key}' must be an object`,
        field: key,
      });
      continue;
    }

    // Validate against schema
    const result = SpecNodeSchema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          code: 'SCHEMA_VALIDATION_ERROR',
          message: `${key}: ${issue.path.join('.')}: ${issue.message}`,
          field: issue.path.join('.'),
        });
      }
      continue;
    }

    // Check for required 'intent' field
    if (!result.data.intent) {
      errors.push({
        code: 'MISSING_FIELD',
        message: `Spec '${key}' is missing required field 'intent'`,
        field: 'intent',
      });
      continue;
    }

    // Check for unknown fields (schema drift prevention)
    const nodeValue = value as Record<string, unknown>;
    for (const field of Object.keys(nodeValue)) {
      if (!SPEC_NODE_CORE_FIELDS.has(field) && !KNOWN_EXTENSION_FIELDS.has(field)) {
        warnings.push({
          code: 'UNKNOWN_FIELD',
          message: `Spec '${key}' has unknown field '${field}'. ${suggestAlternativeField(field)}`,
          field,
        });
      }
    }

    // Warnings for best practices
    if (result.data.goal && !result.data.outcomes) {
      warnings.push({
        code: 'GOAL_WITHOUT_OUTCOMES',
        message: `Spec '${key}' has a goal but no outcomes`,
        field: 'outcomes',
      });
    }

    if (result.data.examples?.success) {
      for (let i = 0; i < result.data.examples.success.length; i++) {
        const example = result.data.examples.success[i];
        if (!example.name && !example.then) {
          warnings.push({
            code: 'EXAMPLE_MISSING_NAME',
            message: `Spec '${key}' success example ${i} is missing 'name'`,
            field: `examples.success[${i}].name`,
          });
        }
      }
    }

    specs.push({
      specId: key,
      node: result.data,
      filePath,
    });
  }

  return {
    valid: errors.length === 0,
    specs,
    errors,
    warnings,
  };
}

/**
 * Find a spec by ID in the registry or filesystem.
 * Searches:
 * 1. Registry (loaded from .arch/specs/)
 * 2. Colocated files (*.spec.yaml next to implementation)
 */
export async function findSpec(
  projectRoot: string,
  specId: string,
  registry?: SpecRegistry
): Promise<ParsedSpec | null> {
  // Check registry first
  if (registry?.nodes[specId]) {
    return {
      specId,
      node: registry.nodes[specId],
      filePath: path.join(projectRoot, DEFAULT_SPECS_DIR),
    };
  }

  // Search for colocated spec file
  // spec.product.create → search for product/create.spec.yaml, products/create.spec.yaml, etc.
  const parts = specId.replace(/^spec\./, '').split('.');
  const searchPaths = generateSearchPaths(projectRoot, parts);

  for (const searchPath of searchPaths) {
    if (await fileExists(searchPath)) {
      const result = await loadSpecFile(searchPath);
      const spec = result.specs.find(s => s.specId === specId);
      if (spec) {
        return spec;
      }
    }
  }

  return null;
}

/**
 * Generate potential file paths for a spec ID.
 */
function generateSearchPaths(projectRoot: string, parts: string[]): string[] {
  const paths: string[] = [];

  // Try common patterns
  if (parts.length >= 2) {
    // convex/products/create.spec.yaml
    paths.push(path.join(projectRoot, 'convex', ...parts.slice(0, -1), `${parts[parts.length - 1]}.spec.yaml`));
    // convex/products/mutations/create.spec.yaml
    paths.push(path.join(projectRoot, 'convex', parts[0], 'mutations', `${parts[parts.length - 1]}.spec.yaml`));
    // src/components/products/create.spec.yaml
    paths.push(path.join(projectRoot, 'src', 'components', ...parts.slice(0, -1), `${parts[parts.length - 1]}.spec.yaml`));
  }

  // Try .arch/specs directory patterns
  paths.push(path.join(projectRoot, DEFAULT_SPECS_DIR, ...parts.slice(0, -1), `${parts[parts.length - 1]}.spec.yaml`));
  paths.push(path.join(projectRoot, DEFAULT_SPECS_DIR, parts.join('/') + '.spec.yaml'));

  return paths;
}

/**
 * Find all spec files in a directory (recursively).
 */
async function findSpecFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  async function scanDir(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
        results.push(fullPath);
      }
    }
  }

  await scanDir(dirPath);
  return results.sort();
}

/**
 * Check if a spec registry exists in the project.
 */
export async function specRegistryExists(projectRoot: string): Promise<boolean> {
  const specsDir = path.resolve(projectRoot, DEFAULT_SPECS_DIR);
  return directoryExists(specsDir);
}

/**
 * Get the specs directory path.
 */
export function getSpecsDir(projectRoot: string): string {
  return path.resolve(projectRoot, DEFAULT_SPECS_DIR);
}

/**
 * List all spec IDs in the registry.
 */
export function listSpecIds(registry: SpecRegistry): string[] {
  return Object.keys(registry.nodes);
}

/**
 * List all mixin IDs in the registry.
 */
export function listSpecMixinIds(registry: SpecRegistry): string[] {
  return Object.keys(registry.mixins);
}

/**
 * Check if a spec ID exists in the registry.
 */
export function hasSpec(registry: SpecRegistry, specId: string): boolean {
  return specId in registry.nodes;
}

/**
 * Check if a mixin ID exists in the registry.
 */
export function hasSpecMixin(registry: SpecRegistry, mixinId: string): boolean {
  return mixinId in registry.mixins;
}

/**
 * Suggest alternative fields for common drift patterns.
 * Helps LLMs understand which existing constructs to use.
 */
function suggestAlternativeField(field: string): string {
  const suggestions: Record<string, string> = {
    // Common drift patterns from LLMs
    'metadata': 'Use invariants for constraints, effects for side effects',
    'copied_fields': 'Use invariants: { condition: "result.x === original.x" }',
    'reset_fields': 'Use invariants: { condition: "result.x === undefined" }',
    'field_handling': 'Use invariants to describe field behavior',
    'validation': 'Use inputs with validate option, or invariants',
    'rules': 'Use invariants section for rules',
    'constraints': 'Use invariants section for constraints',
    'preconditions': 'Use invariants with description like "before: ..."',
    'postconditions': 'Use invariants or effects section',
    'state': 'Use ui.interaction.states for UI state, or invariants for data state',
    'transitions': 'Use ui.interaction.sequence for UI transitions',
    'behavior': 'Use invariants for behavioral contracts',
    'schema': 'Use inputs and outputs to define the schema',
    'tests': 'Use examples section with success/errors/boundaries',
    'scenarios': 'Use examples section with success/errors/boundaries',
    'cases': 'Use examples section with success/errors/boundaries',
  };

  const suggestion = suggestions[field.toLowerCase()];
  if (suggestion) {
    return suggestion;
  }

  // Generic guidance
  return 'Consider using: invariants (constraints), effects (side effects), ui (interactions), or examples (test cases)';
}
