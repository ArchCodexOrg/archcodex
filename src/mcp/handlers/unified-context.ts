/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handler for unified architecture context.
 * Combines module structure (from architecture map) with entity schemas.
 */

import {
  synthesizeUnifiedContext,
  formatUnifiedContext,
} from '../../core/unified-context/index.js';
import type { UnifiedContextFormatOptions, ContextSection } from '../../core/unified-context/types.js';
import { isProjectInitialized, findNearbyProject } from '../utils.js';

/**
 * Options for the unified context tool.
 */
export interface UnifiedContextOptions {
  /** Module/directory path to get context for */
  module?: string;
  /** Entity name to get context for */
  entity?: string;
  /** Output format: compact (default), full, or json */
  format?: 'compact' | 'full' | 'json';
  /** Filter to specific sections (default: all) */
  sections?: ContextSection[];
  /** Bypass interactive mode for large modules (>30 files) */
  confirm?: boolean;
  /** Return structure summary only (no file lists) */
  summary?: boolean;
  /** Return minimal essential info only (arch, boundaries, forbidden) */
  brief?: boolean;
}

/**
 * Handle the unified context tool request.
 */
export async function handleUnifiedContext(
  projectRoot: string,
  options: UnifiedContextOptions = {}
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
                `Use: archcodex_context with projectRoot="${nearbyProject}"\n\n`
              : `To initialize this project, run:\n` +
                `  cd ${projectRoot}\n` +
                `  archcodex init\n\n`) +
            `Or provide the correct project root using the projectRoot parameter.`,
        }],
        isError: true,
      };
    }

    // Require at least one of module or entity
    if (!options.module && !options.entity) {
      return {
        content: [{
          type: 'text',
          text: `Error: Either 'module' or 'entity' parameter is required.\n\n` +
            `Examples:\n` +
            `  archcodex_context { "module": "src/core/db/" }  - Get module context\n` +
            `  archcodex_context { "entity": "User" }         - Get entity context\n\n` +
            `The module query provides:\n` +
            `  - Modification order (DEFINES → IMPLEMENTS → ORCHESTRATES)\n` +
            `  - Layer boundaries (CAN/CANNOT import)\n` +
            `  - Entity schemas referenced in the module\n` +
            `  - Impact (external consumers)\n` +
            `  - ArchCodex constraints and validation command`,
        }],
        isError: true,
      };
    }

    // Synthesize the unified context
    const context = await synthesizeUnifiedContext(projectRoot, {
      module: options.module,
      entity: options.entity,
      sections: options.sections,
      confirm: options.confirm,
      summary: options.summary,
      brief: options.brief,
    });

    if (!context) {
      const target = options.module ?? options.entity;
      const type = options.module ? 'module' : 'entity';

      return {
        content: [{
          type: 'text',
          text: `No ${type} found matching "${target}".\n\n` +
            (options.module
              ? `Tips:\n` +
                `  - Check the path is correct (e.g., "src/core/db/" not "src/core/db")\n` +
                `  - Ensure the module has files with @arch tags\n` +
                `  - Try archcodex_map for an overview of available modules`
              : `Tips:\n` +
                `  - Check the entity name spelling\n` +
                `  - Try archcodex_entity_context without parameters to list all entities`),
        }],
        isError: true,
      };
    }

    // Format the output
    const format = options.format ?? 'compact';
    const formatOptions: UnifiedContextFormatOptions = {
      format,
      markdown: true,
      sections: options.sections,
    };

    const output = formatUnifiedContext(context, formatOptions);

    return {
      content: [{
        type: 'text',
        text: output,
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [{
        type: 'text',
        text: `Error getting unified context: ${errorMessage}\n\n` +
          `Project root: ${projectRoot}\n\n` +
          `Try checking:\n` +
          `  1. Is the project root correct? Use projectRoot parameter if needed.\n` +
          `  2. Does .arch/ directory exist?\n` +
          `  3. Is the module path or entity name correct?`,
      }],
      isError: true,
    };
  }
}
