/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handlers for SpecCodex operations.
 * @see spec.archcodex.scaffoldTouchpoints in .arch/specs/archcodex/scaffold-touchpoints.spec.yaml
 */
import { runSpecInit, type SpecInitOptions } from '../../cli/commands/spec/index.js';
import {
  generateTouchpointsFromEntity,
  generateSpecWithTouchpoints,
} from '../../core/spec/scaffold-touchpoints.js';
import { loadComponentGroupsRegistry } from '../../core/registry/component-groups.js';
import { isProjectInitialized, findNearbyProject } from '../utils.js';

// ============================================================================
// SPEC INIT HANDLER
// ============================================================================

export interface SpecInitMcpOptions {
  force?: boolean;
  minimal?: boolean;
  projectRoot?: string;
}

export async function handleSpecInit(projectRoot: string, options: SpecInitMcpOptions) {
  const initOptions: SpecInitOptions = {
    force: options.force,
    minimal: options.minimal,
    projectRoot,
  };

  try {
    const result = await runSpecInit({ options: initOptions });

    // Format output for MCP
    const lines: string[] = [];

    if (result.success) {
      lines.push('SpecCodex initialized successfully!');
      lines.push('');

      if (result.filesCreated.length > 0) {
        lines.push('Created:');
        for (const file of result.filesCreated) {
          lines.push(`  + ${file}`);
        }
      }

      if (result.filesSkipped.length > 0) {
        lines.push('');
        lines.push('Skipped (already exist):');
        for (const file of result.filesSkipped) {
          lines.push(`  ~ ${file}`);
        }
      }

      lines.push('');
      lines.push('Next steps:');
      lines.push('  1. Review .arch/specs/_base.yaml for base spec patterns');
      lines.push('  2. Review .arch/specs/_mixins.yaml for reusable behaviors');
      if (!options.minimal) {
        lines.push('  3. Study .arch/specs/example.spec.yaml for spec syntax');
      }
      lines.push('  4. Create your first spec in .arch/specs/');
      lines.push('  5. Generate tests: archcodex spec generate spec.your.feature --type unit');
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          filesCreated: result.filesCreated,
          filesSkipped: result.filesSkipped,
          errors: result.errors,
          message: lines.join('\n'),
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isArchNotInitialized = errorMessage.includes('ARCH_NOT_INITIALIZED');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: isArchNotInitialized
            ? 'ARCH_NOT_INITIALIZED'
            : 'INIT_FAILED',
          message: isArchNotInitialized
            ? '.arch/ directory not found. Run "archcodex init" first to initialize ArchCodex.'
            : `Initialization failed: ${errorMessage}`,
        }, null, 2),
      }],
      isError: true,
    };
  }
}

// ============================================================================
// SPEC SCAFFOLD TOUCHPOINTS HANDLER
// ============================================================================

export interface SpecScaffoldTouchpointsOptions {
  specId: string;
  entity: string;
  operation?: string;
}

/**
 * Handle spec scaffold touchpoints MCP tool request.
 * Generates a spec YAML with ui.touchpoints auto-populated from component groups.
 */
export async function handleSpecScaffoldTouchpoints(
  projectRoot: string,
  options: SpecScaffoldTouchpointsOptions
) {
  try {
    // Validate project is initialized
    const isInitialized = await isProjectInitialized(projectRoot);
    if (!isInitialized) {
      const nearbyProject = await findNearbyProject(projectRoot);

      return {
        content: [{
          type: 'text',
          text: `Error: Project not initialized with ArchCodex.\n\n` +
            `Project root: ${projectRoot}\n` +
            `Expected .arch/ directory not found.\n\n` +
            (nearbyProject
              ? `Found nearby project: ${nearbyProject}\n` +
                `Use projectRoot="${nearbyProject}" instead.\n\n`
              : `To initialize this project, run:\n` +
                `  cd ${projectRoot}\n` +
                `  archcodex init\n\n`) +
            `Or provide the correct project root using the projectRoot parameter.`,
        }],
        isError: true,
      };
    }

    // Validate inputs
    if (!options.specId) {
      return {
        content: [{
          type: 'text',
          text: formatScaffoldUsageHelp(),
        }],
      };
    }

    if (!options.entity) {
      return {
        content: [{
          type: 'text',
          text: `Error: entity parameter is required.\n\n` +
            `Usage: archcodex_spec_scaffold_touchpoints({ specId: "spec.product.duplicate", entity: "products" })`,
        }],
        isError: true,
      };
    }

    // Load component groups registry
    const registry = await loadComponentGroupsRegistry(projectRoot);

    // Generate spec with touchpoints
    const yaml = generateSpecWithTouchpoints(options.specId, options.entity, registry);

    // Also get touchpoints info for context
    const touchpointsResult = await generateTouchpointsFromEntity({
      entity: options.entity,
      operation: options.operation,
      projectRoot,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          specId: options.specId,
          entity: options.entity,
          componentGroup: touchpointsResult.componentGroup,
          touchpointsCount: touchpointsResult.touchpoints.length,
          warning: touchpointsResult.warning,
          yaml,
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [{
        type: 'text',
        text: `Error scaffolding spec with touchpoints: ${errorMessage}\n\n` +
          `Project root: ${projectRoot}\n\n` +
          `Try checking:\n` +
          `  1. Is the project root correct?\n` +
          `  2. Does .arch/component-groups.yaml exist?\n` +
          `  3. Is the entity name correct?`,
      }],
      isError: true,
    };
  }
}

/**
 * Format usage help for scaffold touchpoints.
 */
function formatScaffoldUsageHelp(): string {
  return `# Spec Scaffold with Touchpoints

Generate a spec YAML with ui.touchpoints auto-populated from component groups.

## Parameters

- **specId** (required): Spec ID to generate (e.g., 'spec.product.duplicate')
- **entity** (required): Entity name for component group lookup (e.g., 'products')
- **operation** (optional): Operation name for handler derivation (auto-derived from specId if not provided)

## Usage Examples

\`\`\`
// Generate spec with touchpoints for an entity
archcodex_spec_scaffold_touchpoints({ specId: "spec.product.duplicate", entity: "products" })

// With explicit operation name
archcodex_spec_scaffold_touchpoints({ specId: "spec.product.archive", entity: "products", operation: "archive" })
\`\`\`

## What It Does

1. Looks up component groups matching the entity
2. Derives handler name from the spec ID (e.g., duplicateEntry → handleDuplicate)
3. Generates touchpoints for each component in the matched group
4. Returns complete spec YAML with ui.touchpoints section populated
`;
}
