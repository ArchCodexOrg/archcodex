/**
 * @arch archcodex.core.domain
 * @intent:stateless
 *
 * Scaffold touchpoints from component groups for spec generation.
 * Auto-populates ui.touchpoints when creating specs for entities with component groups.
 *
 * @see spec.archcodex.scaffoldTouchpoints in .arch/specs/archcodex/scaffold-touchpoints.spec.yaml
 */
import {
  loadComponentGroupsRegistry,
  findComponentGroupsByEntity,
  type ComponentGroupMatch,
} from '../registry/component-groups.js';
import type { ComponentGroupsRegistry } from '../registry/schema.js';

// === Types ===

export interface UITouchpoint {
  component: string;
  location?: string;
  handler?: string;
  wired: boolean;
  priority: 'required' | 'optional';
}

export interface ScaffoldTouchpointsResult {
  touchpoints: UITouchpoint[];
  componentGroup?: string;
  warning?: string;
}

export interface ScaffoldTouchpointsOptions {
  entity: string;
  operation?: string;
  projectRoot: string;
}

// === Main Functions ===

/**
 * Generate UI touchpoints from component groups for a given entity.
 *
 * @param options - Options including entity name, operation, and project root
 * @returns Result with touchpoints array, matched group name, and warning
 *
 * @example
 * const result = await generateTouchpointsFromEntity({
 *   entity: 'products',
 *   operation: 'duplicate',
 *   projectRoot: '/path/to/project',
 * });
 * // result.touchpoints = [
 * //   { component: 'ProductCard', handler: 'handleDuplicate', ... },
 * //   { component: 'ProductListItem', handler: 'handleDuplicate', ... },
 * //   ...
 * // ]
 */
export async function generateTouchpointsFromEntity(
  options: ScaffoldTouchpointsOptions
): Promise<ScaffoldTouchpointsResult> {
  const { entity, operation, projectRoot } = options;

  // Load component groups registry
  const registry = await loadComponentGroupsRegistry(projectRoot);

  // Find matching component group
  const matches = findComponentGroupsByEntity(registry, entity);

  if (matches.length === 0) {
    return { touchpoints: [] };
  }

  const match = matches[0];
  return generateTouchpointsFromMatch(match, operation);
}

/**
 * Generate touchpoints from a component group match.
 * Can be used with pre-loaded registry for efficiency.
 */
export function generateTouchpointsFromMatch(
  match: ComponentGroupMatch,
  operation?: string
): ScaffoldTouchpointsResult {
  const { name, group } = match;

  // Derive handler name from operation
  const handler = operation ? deriveHandlerName(operation) : undefined;

  // Generate touchpoint for each component
  const touchpoints: UITouchpoint[] = group.components.map((component) => {
    const componentName = extractComponentName(component.path);

    return {
      component: componentName,
      location: 'context menu', // Default location
      handler,
      wired: false,
      priority: 'required' as const,
    };
  });

  return {
    touchpoints,
    componentGroup: name,
    warning: group.warning,
  };
}

/**
 * Generate touchpoints from registry without loading.
 * Useful when registry is already loaded.
 */
export function generateTouchpointsFromRegistry(
  registry: ComponentGroupsRegistry,
  entity: string,
  operation?: string
): ScaffoldTouchpointsResult {
  const matches = findComponentGroupsByEntity(registry, entity);

  if (matches.length === 0) {
    return { touchpoints: [] };
  }

  return generateTouchpointsFromMatch(matches[0], operation);
}

// === Helper Functions ===

/**
 * Derive handler function name from operation name.
 *
 * @param operation - Operation name (e.g., 'duplicate', 'archive', 'bulkDelete')
 * @returns Handler name (e.g., 'handleDuplicate', 'handleArchive', 'handleBulkDelete')
 *
 * @example
 * deriveHandlerName('duplicate') // 'handleDuplicate'
 * deriveHandlerName('bulkDelete') // 'handleBulkDelete'
 * deriveHandlerName('Archive') // 'handleArchive'
 */
export function deriveHandlerName(operation: string): string {
  // Normalize: ensure first character is uppercase
  const normalized = operation.charAt(0).toUpperCase() + operation.slice(1);
  return `handle${normalized}`;
}

/**
 * Extract operation name from spec ID.
 * Assumes spec ID format: spec.domain.operationName
 *
 * @param specId - Spec ID (e.g., 'spec.orders.duplicateOrder')
 * @returns Operation name (e.g., 'duplicate')
 */
export function extractOperationFromSpecId(specId: string): string | undefined {
  const parts = specId.split('.');
  if (parts.length < 2) return undefined;

  const lastPart = parts[parts.length - 1];

  // Remove common suffixes like Entry, Item, etc.
  const operation = lastPart
    .replace(/Entry$/, '')
    .replace(/Item$/, '')
    .replace(/Record$/, '');

  return operation || undefined;
}

/**
 * Extract component name from file path.
 */
function extractComponentName(filePath: string): string {
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.(tsx?|jsx?)$/, '');
}

// === Spec YAML Generation ===

/**
 * Generate YAML snippet for ui.touchpoints section.
 *
 * @param touchpoints - Array of touchpoints to serialize
 * @returns YAML string for touchpoints section
 */
export function generateTouchpointsYaml(touchpoints: UITouchpoint[]): string {
  if (touchpoints.length === 0) {
    return '';
  }

  const lines: string[] = ['    touchpoints:'];

  for (const tp of touchpoints) {
    lines.push(`      - component: ${tp.component}`);
    if (tp.location) {
      lines.push(`        location: ${tp.location}`);
    }
    if (tp.handler) {
      lines.push(`        handler: ${tp.handler}`);
    }
    // wired defaults to false, only include if true
    if (tp.wired) {
      lines.push(`        wired: true`);
    }
    // priority defaults to required, only include if optional
    if (tp.priority === 'optional') {
      lines.push(`        priority: optional`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a complete spec YAML with touchpoints for an entity.
 *
 * @param specId - Spec ID (e.g., 'spec.orders.duplicateOrder')
 * @param entity - Entity name for component group lookup
 * @param registry - Pre-loaded component groups registry
 * @returns Complete spec YAML string with ui.touchpoints populated
 */
export function generateSpecWithTouchpoints(
  specId: string,
  entity: string,
  registry: ComponentGroupsRegistry
): string {
  // Extract operation from spec ID
  const operation = extractOperationFromSpecId(specId);

  // Generate touchpoints
  const result = generateTouchpointsFromRegistry(registry, entity, operation);

  // Build spec YAML
  const lines: string[] = [
    `# Auto-generated spec with touchpoints from component group: ${result.componentGroup || 'none'}`,
    '',
    `${specId}:`,
    '  inherits: spec.function',
    '',
    `  intent: "TODO: Describe the operation"`,
    '',
  ];

  // Add warning as comment if present
  if (result.warning) {
    lines.push(`  # WARNING: ${result.warning}`);
    lines.push('');
  }

  // Add inputs placeholder
  lines.push('  inputs:');
  lines.push('    # TODO: Define inputs');
  lines.push('');

  // Add outputs placeholder
  lines.push('  outputs:');
  lines.push('    # TODO: Define outputs');
  lines.push('');

  // Add ui section with touchpoints
  if (result.touchpoints.length > 0) {
    lines.push('  ui:');
    lines.push(generateTouchpointsYaml(result.touchpoints));
    lines.push('');
  }

  // Add examples placeholder
  lines.push('  examples:');
  lines.push('    success:');
  lines.push('      - name: "TODO: Add success example"');
  lines.push('        given: {}');
  lines.push('        then: {}');
  lines.push('');

  return lines.join('\n');
}
