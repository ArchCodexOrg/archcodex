/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Unified context formatter - formats context for LLM consumption.
 * Designed for token efficiency (~1-2k tokens) while remaining actionable.
 */

import type {
  UnifiedContext,
  UnifiedModuleContext,
  UnifiedFileInfo,
  InlineEntitySchema,
  UnifiedContextFormatOptions,
  ProjectRules,
  ContextSection,
} from './types.js';
import { ALL_SECTIONS } from './types.js';
import { formatEntityCompact, formatEntityFull } from './formatter-entity.js';

/**
 * Format unified context for output.
 */
export function formatUnifiedContext(
  context: UnifiedContext,
  options: UnifiedContextFormatOptions = { format: 'compact' }
): string {
  // Handle special module modes first
  if (context.module) {
    // Interactive mode for large modules
    if (context.module.isLargeModule) {
      return formatInteractiveMenu(context.module);
    }
    // Summary mode
    if (context.module.isSummary) {
      return formatModuleSummary(context.module);
    }
    // Brief mode
    if (context.module.isBrief) {
      return formatModuleBrief(context.module);
    }
  }

  switch (options.format) {
    case 'json':
      return JSON.stringify(context, null, 2);
    case 'full':
      return context.module
        ? formatModuleFull(context.module, options.markdown, options.sections)
        : formatEntityFull(context.entity!, options.markdown);
    case 'compact':
    default:
      return context.module
        ? formatModuleCompact(context.module, options.sections)
        : formatEntityCompact(context.entity!);
  }
}

/**
 * Format module context in compact LLM-optimized format (~1-2k tokens).
 */
function formatModuleCompact(context: UnifiedModuleContext, sections?: ContextSection[]): string {
  const requestedSections = sections ?? context.requestedSections ?? ALL_SECTIONS;
  const lines: string[] = [];

  // Header
  lines.push(`# ${context.modulePath} (${context.fileCount} files, ${context.entityCount} entities)`);
  lines.push('');

  // Section 0: Project Rules (layer hierarchy + shared constraints)
  if (requestedSections.includes('project-rules') && context.projectRules) {
    lines.push(formatProjectRulesCompact(context.projectRules));
    lines.push('');
  }

  // Section 1: Modification Order
  if (requestedSections.includes('modification-order')) {
    lines.push('## 1. Modification Order');
    lines.push('');

    if (context.files.defines.length > 0) {
      lines.push('DEFINES (modify first):');
      for (const file of context.files.defines) {
        lines.push(formatFileCompact(file));
      }
      lines.push('');
    }

    if (context.files.implements.length > 0) {
      lines.push('IMPLEMENTS (update when contracts change):');
      for (const file of context.files.implements) {
        lines.push(formatFileCompact(file));
      }
      lines.push('');
    }

    if (context.files.orchestrates.length > 0) {
      lines.push('ORCHESTRATES (modify last):');
      for (const file of context.files.orchestrates) {
        lines.push(formatFileCompact(file));
      }
      lines.push('');
    }
  }

  // Section 2: Boundaries
  if (requestedSections.includes('boundaries') && context.boundaries) {
    lines.push('## 2. Boundaries');
    lines.push('');
    lines.push(`layer: ${context.boundaries.layer}`);
    if (context.boundaries.canImport.length > 0) {
      lines.push(`CAN import: [${context.boundaries.canImport.join(', ')}]`);
      // Show common import examples
      if (context.boundaries.commonImports && context.boundaries.commonImports.length > 0) {
        for (const imp of context.boundaries.commonImports) {
          const exportStr = imp.exports.join(', ');
          const relativePath = imp.path.replace(/^src\//, '../../').replace(/\.ts$/, '.js');
          lines.push(`  Common: import { ${exportStr} } from '${relativePath}'`);
        }
      }
    }
    if (context.boundaries.cannotImport.length > 0) {
      lines.push(`CANNOT import: [${context.boundaries.cannotImport.join(', ')}]`);
    }
    lines.push('');
  }

  // Section 3: Entity Schemas
  if (requestedSections.includes('entities') && context.entities.length > 0) {
    lines.push('## 3. Entity Schemas');
    lines.push('');
    for (const entity of context.entities) {
      lines.push(formatEntitySchemaCompact(entity));
      lines.push('');
    }
  }

  // Section 4: Impact
  if (requestedSections.includes('impact') && context.consumers.length > 0) {
    lines.push('## 4. Impact');
    lines.push('');
    lines.push('Consumers (will break if you change exports):');
    const shown = context.consumers.slice(0, 10);
    for (const consumer of shown) {
      lines.push(`  ${consumer.path}`);
    }
    if (context.consumers.length > 10) {
      lines.push(`  ... +${context.consumers.length - 10} more`);
    }
    lines.push('');
  }

  // Section 5: ArchCodex (constraints)
  if (requestedSections.includes('constraints')) {
    lines.push('## 5. ArchCodex');
    lines.push('');
    lines.push(`architecture: ${context.archcodex.architecture}`);

    const hasConstraints = context.archcodex.forbid?.length ||
      context.archcodex.patterns?.length ||
      context.archcodex.require?.length;

    if (hasConstraints) {
      lines.push('constraints:');
      if (context.archcodex.forbid && context.archcodex.forbid.length > 0) {
        lines.push(`  forbid: [${context.archcodex.forbid.join(', ')}]`);
      }
      if (context.archcodex.patterns && context.archcodex.patterns.length > 0) {
        lines.push(`  patterns: [${context.archcodex.patterns.join(', ')}]`);
      }
      if (context.archcodex.require && context.archcodex.require.length > 0) {
        lines.push(`  require: [${context.archcodex.require.join(', ')}]`);
      }
    }

    // Show all hints (not just first)
    if (context.archcodex.hints && context.archcodex.hints.length > 0) {
      if (context.archcodex.hints.length === 1) {
        lines.push(`hint: ${context.archcodex.hints[0]}`);
      } else {
        lines.push('hints:');
        for (const hint of context.archcodex.hints) {
          lines.push(`  - ${hint}`);
        }
      }
    }
    lines.push('');
  }

  // Always add Available Actions footer
  lines.push('---');
  lines.push(formatAvailableActions(context, requestedSections));

  return lines.join('\n');
}

/**
 * Get a tip suggesting the parent module for better context.
 * Returns null if the module is not deeply nested.
 */
function getParentModuleTip(modulePath: string): string | null {
  // Normalize path and split into segments
  const normalized = modulePath.replace(/\/$/, '');
  const segments = normalized.split('/').filter(s => s.length > 0);

  // Only suggest parent if 3+ levels deep (e.g., src/modules/billing/invoices)
  if (segments.length < 3) {
    return null;
  }

  // Get parent path (one level up)
  const parentSegments = segments.slice(0, -1);
  const parentPath = parentSegments.join('/') + '/';

  return parentPath;
}

/**
 * Format interactive menu for large modules.
 * Asks LLM to choose a submodule or confirm full output.
 */
function formatInteractiveMenu(context: UnifiedModuleContext): string {
  const lines: string[] = [];

  lines.push(`# ${context.modulePath} contains ${context.fileCount} files`);
  lines.push('');
  lines.push('This module is large. To avoid overwhelming context, please choose:');
  lines.push('');

  // Submodule options
  if (context.topSubmodules && context.topSubmodules.length > 0) {
    lines.push('## Submodules (pick one for focused context):');
    lines.push('');
    for (let i = 0; i < context.topSubmodules.length; i++) {
      const sub = context.topSubmodules[i];
      const archInfo = sub.dominantArch ? ` - ${sub.dominantArch}` : '';
      lines.push(`  ${i + 1}. archcodex_context { "module": "${sub.path}" }  # ${sub.fileCount} files${archInfo}`);
    }
    lines.push('');
  }

  // Full output option
  lines.push('## Or get everything anyway:');
  lines.push(`  archcodex_context { "module": "${context.modulePath}", "confirm": true }`);
  lines.push('');

  // Summary option
  lines.push('## Or get a summary only (structure, no file lists):');
  lines.push(`  archcodex_context { "module": "${context.modulePath}", "summary": true }`);

  return lines.join('\n');
}

/**
 * Format module summary (structure overview, no file lists).
 */
function formatModuleSummary(context: UnifiedModuleContext): string {
  const lines: string[] = [];

  lines.push(`# ${context.modulePath} (${context.fileCount} files)`);
  lines.push('');

  // Submodule table
  if (context.topSubmodules && context.topSubmodules.length > 0) {
    lines.push('## Structure Summary');
    lines.push('');
    lines.push('| Submodule | Files | Dominant Architecture |');
    lines.push('|-----------|-------|----------------------|');
    for (const sub of context.topSubmodules) {
      const arch = sub.dominantArch ?? '(mixed)';
      lines.push(`| ${sub.path} | ${sub.fileCount} | ${arch} |`);
    }
    lines.push('');
  }

  // Layer boundaries
  if (context.projectRules) {
    lines.push('## Layer Boundaries');
    lines.push('');
    for (const layer of context.projectRules.layers) {
      const imports = layer.canImport.length > 0
        ? `[${layer.canImport.join(', ')}]`
        : '(leaf)';
      lines.push(`${layer.name} → ${imports}`);
    }
    lines.push('');

    // Shared constraints
    if (context.projectRules.shared) {
      lines.push('## Shared Constraints');
      lines.push('');
      if (context.projectRules.shared.forbid?.length) {
        lines.push(`forbid: ${context.projectRules.shared.forbid.join(', ')}`);
      }
      if (context.projectRules.shared.patterns?.length) {
        lines.push(`patterns: ${context.projectRules.shared.patterns.join(', ')}`);
      }
      lines.push('');
    }
  }

  // Next steps
  lines.push('---');
  lines.push('## Next Steps');
  lines.push('');
  lines.push('**For detailed context on a submodule:**');
  if (context.topSubmodules && context.topSubmodules.length > 0) {
    lines.push(`  archcodex_context { "module": "${context.topSubmodules[0].path}" }`);
  }
  lines.push('');
  lines.push('**For full output (all files):**');
  lines.push(`  archcodex_context { "module": "${context.modulePath}", "confirm": true }`);

  return lines.join('\n');
}

/**
 * Format module brief (minimal essential info only).
 */
function formatModuleBrief(context: UnifiedModuleContext): string {
  const lines: string[] = [];

  // Architecture
  lines.push(`@arch: ${context.archcodex.architecture}`);
  lines.push('');

  // Boundaries
  if (context.boundaries) {
    lines.push(`CAN import: [${context.boundaries.canImport.join(', ')}]`);
    lines.push(`CANNOT import: [${context.boundaries.cannotImport.join(', ')}]`);

    // Common imports with examples
    if (context.boundaries.commonImports && context.boundaries.commonImports.length > 0) {
      lines.push('');
      lines.push('Common:');
      for (const imp of context.boundaries.commonImports) {
        const exportStr = imp.exports.join(', ');
        // Convert absolute path to relative import
        const relativePath = imp.path.replace(/^src\//, '../../').replace(/\.ts$/, '.js');
        lines.push(`  import { ${exportStr} } from '${relativePath}'`);
      }
    }
  }

  // Forbidden
  if (context.archcodex.forbid?.length || context.archcodex.patterns?.length) {
    lines.push('');
    const forbidden: string[] = [];
    if (context.archcodex.forbid) {
      forbidden.push(...context.archcodex.forbid);
    }
    if (context.archcodex.patterns) {
      forbidden.push(...context.archcodex.patterns);
    }
    lines.push(`Forbidden: ${forbidden.join(', ')}`);
  }

  // Brief footer
  lines.push('');
  lines.push('---');
  lines.push(`Full context: archcodex_context { "module": "${context.modulePath}" }`);

  return lines.join('\n');
}

/**
 * Format the "Available Actions" footer that tells LLMs what they can do next.
 */
function formatAvailableActions(context: UnifiedModuleContext, requestedSections: ContextSection[]): string {
  const lines: string[] = ['## Available Actions', ''];

  // What was included
  lines.push(`This response includes: ${requestedSections.join(', ')}`);

  // What was excluded (if any)
  const excludedSections = ALL_SECTIONS.filter(s => !requestedSections.includes(s));
  if (excludedSections.length > 0) {
    lines.push(`Excluded: ${excludedSections.join(', ')}`);
    lines.push('');
    lines.push('**Request specific sections:**');
    const allSectionsJson = [...requestedSections, excludedSections[0]].map(s => `"${s}"`).join(', ');
    lines.push(`  archcodex_context { "module": "${context.modulePath}", "sections": [${allSectionsJson}] }`);
  }

  // Large module warning with submodule suggestions
  if (context.topSubmodules && context.topSubmodules.length > 0 && context.fileCount > 50) {
    lines.push('');
    lines.push(`Large module (${context.fileCount} files). For focused context, try:`);
    for (const sub of context.topSubmodules.slice(0, 3)) {
      lines.push(`  archcodex_context { "module": "${sub.path}" }  # ${sub.fileCount} files`);
    }
  }

  // Deep module: suggest parent
  const parentPath = getParentModuleTip(context.modulePath);
  if (parentPath && context.fileCount < 15) {
    lines.push('');
    lines.push('**For broader context:**');
    lines.push(`  archcodex_context { "module": "${parentPath}" }`);
  }

  // Entity suggestions if entities exist
  if (context.entities.length > 0) {
    lines.push('');
    lines.push('**For entity details:**');
    for (const entity of context.entities.slice(0, 3)) {
      lines.push(`  archcodex_context { "entity": "${entity.name}" }`);
    }
  }

  // Always show validation command
  lines.push('');
  lines.push('**Validate after changes:**');
  lines.push(`  archcodex_check { "files": ["${context.modulePath}**/*.ts"] }`);

  return lines.join('\n');
}

/**
 * Format a single file in compact form.
 */
function formatFileCompact(file: UnifiedFileInfo): string {
  const archTag = file.archId ? `[${file.archId}]` : '[no @arch]';
  const breakIndicator = file.breaks > 0
    ? (file.breaks >= 3 ? ` 🔴${file.breaks}` : ` 🟡${file.breaks}`)
    : '';
  const reason = file.roleReason ? ` - ${file.roleReason}` : '';

  return `  ${file.path} ${archTag}${breakIndicator}${reason}`;
}

/**
 * Format project rules (layer hierarchy + shared constraints) in compact form.
 */
function formatProjectRulesCompact(rules: ProjectRules): string {
  const lines: string[] = [];

  lines.push('## 0. Project Rules');
  lines.push('');

  // Layer hierarchy
  lines.push('Layer Hierarchy:');
  for (const layer of rules.layers) {
    const imports = layer.canImport.length > 0
      ? `[${layer.canImport.join(', ')}]`
      : '(leaf)';
    lines.push(`  ${layer.name} → ${imports}`);
  }

  // Shared constraints
  if (rules.shared) {
    lines.push('');
    lines.push('Shared Constraints (apply to ALL files):');
    if (rules.shared.forbid && rules.shared.forbid.length > 0) {
      lines.push(`  forbid: ${rules.shared.forbid.join(', ')}`);
    }
    if (rules.shared.patterns && rules.shared.patterns.length > 0) {
      lines.push(`  patterns: ${rules.shared.patterns.join(', ')}`);
    }
    if (rules.shared.hints && rules.shared.hints.length > 0) {
      // Truncate hints if too many
      const displayHints = rules.shared.hints.slice(0, 3);
      lines.push(`  hints: ${displayHints.join('; ')}`);
      if (rules.shared.hints.length > 3) {
        lines.push(`  ... +${rules.shared.hints.length - 3} more hints`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format entity schema in compact form.
 */
function formatEntitySchemaCompact(entity: InlineEntitySchema): string {
  const lines: string[] = [];

  lines.push(`${entity.name}:`);
  lines.push(`  fields: [${entity.fields.join(', ')}]`);

  if (entity.relationships && entity.relationships.length > 0) {
    lines.push(`  rels: ${entity.relationships.join(', ')}`);
  }

  if (entity.behaviors && entity.behaviors.length > 0) {
    lines.push(`  behaviors: ${entity.behaviors.join(', ')}`);
  } else {
    lines.push('  behaviors: none');
  }

  if (entity.operations.length > 0) {
    lines.push(`  ops: ${entity.operations.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Format module context in full verbose mode.
 */
function formatModuleFull(context: UnifiedModuleContext, markdown?: boolean, sections?: ContextSection[]): string {
  const requestedSections = sections ?? context.requestedSections ?? ALL_SECTIONS;
  const lines: string[] = [];
  const md = markdown ?? false;

  // Header
  if (md) {
    lines.push(`# Module: ${context.modulePath}`);
    lines.push('');
    lines.push(`**${context.fileCount} files** | **${context.lineCount} lines** | **${context.entityCount} entities**`);
  } else {
    lines.push('═'.repeat(60));
    lines.push(`Module: ${context.modulePath}`);
    lines.push(`${context.fileCount} files | ${context.lineCount} lines | ${context.entityCount} entities`);
    lines.push('═'.repeat(60));
  }
  lines.push('');

  // Project rules
  if (requestedSections.includes('project-rules') && context.projectRules) {
    if (md) {
      lines.push('## Project Rules');
    } else {
      lines.push('─ Project Rules ─');
    }
    lines.push('');
    lines.push('Layer Hierarchy:');
    for (const layer of context.projectRules.layers) {
      const imports = layer.canImport.length > 0
        ? `[${layer.canImport.join(', ')}]`
        : '(leaf)';
      lines.push(`  ${layer.name} → ${imports}`);
    }
    if (context.projectRules.shared) {
      lines.push('');
      lines.push('Shared Constraints:');
      if (context.projectRules.shared.forbid?.length) {
        lines.push(`  Forbid: ${context.projectRules.shared.forbid.join(', ')}`);
      }
      if (context.projectRules.shared.patterns?.length) {
        lines.push(`  Patterns: ${context.projectRules.shared.patterns.join(', ')}`);
      }
      if (context.projectRules.shared.hints?.length) {
        lines.push(`  Hints: ${context.projectRules.shared.hints.join('; ')}`);
      }
    }
    lines.push('');
  }

  // Files by role
  if (requestedSections.includes('modification-order')) {
    if (md) {
      lines.push('## Modification Order');
    } else {
      lines.push('─ Modification Order ─');
    }
    lines.push('');

    for (const [role, roleFiles] of Object.entries(context.files)) {
      if (roleFiles.length === 0) continue;

      const roleLabel = role.toUpperCase();
      const hint = getRoleHint(role);

      if (md) {
        lines.push(`### ${roleLabel}`);
        lines.push(`*${hint}*`);
      } else {
        lines.push(`${roleLabel} (${hint}):`);
      }
      lines.push('');

      for (const file of roleFiles) {
        const archTag = file.archId ? `[${file.archId}]` : '[no @arch]';
        const breakIndicator = file.breaks > 0
          ? (file.breaks >= 3 ? `🔴breaks: ${file.breaks}` : `🟡breaks: ${file.breaks}`)
          : '';

        if (md) {
          lines.push(`- **${file.path}** ${archTag} ${breakIndicator}`);
          if (file.roleReason) {
            lines.push(`  - ${file.roleReason}`);
          }
        } else {
          lines.push(`  ${file.path} ${archTag} ${breakIndicator}`);
          if (file.roleReason) {
            lines.push(`    └─ ${file.roleReason}`);
          }
        }
      }
      lines.push('');
    }
  }

  // Boundaries
  if (requestedSections.includes('boundaries') && context.boundaries) {
    if (md) {
      lines.push('## Layer Boundaries');
    } else {
      lines.push('─ Layer Boundaries ─');
    }
    lines.push('');
    lines.push(`Layer: ${context.boundaries.layer}`);
    lines.push(`CAN import: ${context.boundaries.canImport.join(', ') || '(none)'}`);
    lines.push(`CANNOT import: ${context.boundaries.cannotImport.join(', ') || '(none)'}`);
    lines.push('');
  }

  // Entity schemas
  if (requestedSections.includes('entities') && context.entities.length > 0) {
    if (md) {
      lines.push('## Entity Schemas');
    } else {
      lines.push('─ Entity Schemas ─');
    }
    lines.push('');

    for (const entity of context.entities) {
      if (md) {
        lines.push(`### ${entity.name}`);
      } else {
        lines.push(`${entity.name}:`);
      }

      lines.push(`  Fields: ${entity.fields.join(', ')}`);

      if (entity.relationships && entity.relationships.length > 0) {
        lines.push(`  Relationships: ${entity.relationships.join(', ')}`);
      }

      if (entity.behaviors && entity.behaviors.length > 0) {
        lines.push(`  Behaviors: ${entity.behaviors.join(', ')}`);
      }

      if (entity.operations.length > 0) {
        lines.push(`  Operations: ${entity.operations.join(', ')}`);
      }
      lines.push('');
    }
  }

  // Consumers
  if (requestedSections.includes('impact') && context.consumers.length > 0) {
    if (md) {
      lines.push('## External Consumers');
    } else {
      lines.push('─ External Consumers ─');
    }
    lines.push('');

    for (const consumer of context.consumers) {
      const archInfo = consumer.archId ? ` [${consumer.archId}]` : '';
      lines.push(md ? `- ${consumer.path}${archInfo}` : `  ${consumer.path}${archInfo}`);
    }
    lines.push('');
  }

  // ArchCodex constraints
  if (requestedSections.includes('constraints')) {
    if (md) {
      lines.push('## ArchCodex Constraints');
    } else {
      lines.push('─ ArchCodex Constraints ─');
    }
    lines.push('');
    lines.push(`Architecture: ${context.archcodex.architecture}`);

    if (context.archcodex.forbid && context.archcodex.forbid.length > 0) {
      lines.push(`Forbid: ${context.archcodex.forbid.join(', ')}`);
    }
    if (context.archcodex.patterns && context.archcodex.patterns.length > 0) {
      lines.push(`Patterns: ${context.archcodex.patterns.join(', ')}`);
    }
    if (context.archcodex.require && context.archcodex.require.length > 0) {
      lines.push(`Require: ${context.archcodex.require.join(', ')}`);
    }
    if (context.archcodex.hints && context.archcodex.hints.length > 0) {
      if (context.archcodex.hints.length === 1) {
        lines.push(`Hint: ${context.archcodex.hints[0]}`);
      } else {
        lines.push('Hints:');
        for (const hint of context.archcodex.hints) {
          lines.push(`  - ${hint}`);
        }
      }
    }
    lines.push('');
  }

  // Always add Available Actions footer
  lines.push('---');
  lines.push(formatAvailableActions(context, requestedSections));

  return lines.join('\n');
}

/**
 * Get hint text for a role.
 */
function getRoleHint(role: string): string {
  switch (role) {
    case 'defines':
      return 'modify first - type definitions, schemas, interfaces';
    case 'implements':
      return 'update if contracts change - core logic';
    case 'orchestrates':
      return 'modify last - coordinates implementations';
    default:
      return '';
  }
}
