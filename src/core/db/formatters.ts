/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Shared formatters for architecture map output.
 * Used by both CLI and MCP handlers.
 */

import type { FileRole } from './types.js';

// Re-export for convenience
export type { FileRole };

/**
 * File with entity reference info.
 */
export interface EntityFileInfo {
  path: string;
  archId: string | null;
  refType: string | null;
  lineNumber: number | null;
}

/**
 * File with line count info.
 */
export interface ArchFileInfo {
  path: string;
  lineCount: number | null;
}

/**
 * Import graph file info.
 */
export interface ImportFileInfo {
  path: string;
  archId: string | null;
}

/**
 * Import graph result.
 */
export interface ImportGraph {
  imports: ImportFileInfo[];
  importedBy: ImportFileInfo[];
}

/**
 * Architecture summary item.
 */
export interface ArchSummaryItem {
  archId: string;
  fileCount: number;
}

/**
 * Database statistics.
 */
export interface DbStats {
  fileCount: number;
  importCount: number;
  entityRefCount: number;
  lastScan: string | null;
}

/**
 * Common formatter options.
 * - markdown: Use markdown formatting (default for MCP)
 * - full: Show verbose output for humans (default: false, optimized for LLMs)
 */
export interface FormatOptions {
  /** Use markdown formatting */
  markdown?: boolean;
  /** Show full verbose output (for humans). Default: compact LLM-optimized output */
  full?: boolean;
}

/**
 * Format entity query results for display.
 */
export function formatEntityResults(
  entityName: string,
  files: EntityFileInfo[],
  options: FormatOptions = {}
): string {
  const md = options.markdown ?? false;
  const full = options.full ?? false;
  const lines: string[] = [];

  // Compact header for LLMs
  if (full) {
    if (md) {
      lines.push(`# Files Related to Entity: ${entityName}`, '');
    } else {
      lines.push('═'.repeat(60));
      lines.push(`Entity: ${entityName}`);
      lines.push('═'.repeat(60));
      lines.push('');
    }
  } else {
    lines.push(`Entity "${entityName}" - ${files.length} file${files.length !== 1 ? 's' : ''}:`);
    lines.push('');
  }

  if (files.length === 0) {
    lines.push(`No files found referencing "${entityName}".`);
    return lines.join('\n');
  }

  // Group by architecture
  const byArch = new Map<string, EntityFileInfo[]>();
  for (const file of files) {
    const arch = file.archId ?? '(untagged)';
    if (!byArch.has(arch)) {
      byArch.set(arch, []);
    }
    byArch.get(arch)!.push(file);
  }

  for (const [arch, archFiles] of byArch) {
    if (full) {
      lines.push(md ? `## ${arch}` : `─ ${arch} ─`);
    } else {
      lines.push(`[${arch}]`);
    }
    for (const file of archFiles) {
      const lineInfo = file.lineNumber ? `:${file.lineNumber}` : '';
      // Only show refType in full mode
      const refInfo = full && file.refType ? ` (${file.refType})` : '';
      lines.push(full ? (md ? `- ${file.path}${lineInfo}${refInfo}` : `  ${file.path}${lineInfo}${refInfo}`) : `  ${file.path}${lineInfo}`);
    }
    if (full) lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format architecture query results for display.
 */
export function formatArchitectureResults(
  archId: string,
  files: ArchFileInfo[],
  options: FormatOptions = {}
): string {
  const md = options.markdown ?? false;
  const full = options.full ?? false;
  const lines: string[] = [];

  if (full) {
    if (md) {
      lines.push(`# Files in Architecture: ${archId}`, '');
    } else {
      lines.push('═'.repeat(60));
      lines.push(`Architecture: ${archId}`);
      lines.push('═'.repeat(60));
      lines.push('');
    }
  } else {
    lines.push(`Architecture "${archId}" - ${files.length} file${files.length !== 1 ? 's' : ''}:`);
    lines.push('');
  }

  if (files.length === 0) {
    lines.push(`No files found with architecture "${archId}".`);
    return lines.join('\n');
  }

  for (const file of files) {
    // Only show line counts in full mode
    const lineInfo = full && file.lineCount ? ` (${file.lineCount} lines)` : '';
    lines.push(full ? (md ? `- ${file.path}${lineInfo}` : `  ${file.path}${lineInfo}`) : `  ${file.path}`);
  }

  if (full) {
    lines.push('');
    lines.push(md ? `**Total**: ${files.length} file${files.length !== 1 ? 's' : ''}` : `Total: ${files.length} file${files.length !== 1 ? 's' : ''}`);
  }

  return lines.join('\n');
}

/**
 * Format file import graph results for display.
 */
export function formatImportGraph(
  filePath: string,
  fileInfo: { archId: string | null } | null,
  graph: ImportGraph,
  transitiveImports: string[],
  transitiveImporters: string[],
  options: FormatOptions = {}
): string {
  const md = options.markdown ?? false;
  const full = options.full ?? false;
  const lines: string[] = [];

  // Compact header
  if (full) {
    if (md) {
      lines.push(`# Import Graph: ${filePath}`, '');
      if (fileInfo) {
        lines.push(`**Architecture**: ${fileInfo.archId ?? '(none)'}`);
        lines.push('');
      }
    } else {
      lines.push('═'.repeat(60));
      lines.push(`File: ${filePath}`);
      if (fileInfo) {
        lines.push(`Architecture: ${fileInfo.archId ?? '(none)'}`);
      }
      lines.push('═'.repeat(60));
      lines.push('');
    }
  } else {
    const arch = fileInfo?.archId ? ` [${fileInfo.archId}]` : '';
    lines.push(`${filePath}${arch}`);
    lines.push('');
  }

  // Direct imports - always show
  if (full) {
    lines.push(md ? '## Direct Imports' : '─ Direct Imports ─');
  } else {
    lines.push(`Imports (${graph.imports.length}):`);
  }
  if (graph.imports.length === 0) {
    lines.push(full ? (md ? '(none)' : '  (none)') : '  (none)');
  } else {
    for (const imp of graph.imports) {
      // Only show arch IDs in full mode
      const archInfo = full && imp.archId ? ` [${imp.archId}]` : '';
      lines.push(full ? (md ? `- ${imp.path}${archInfo}` : `  ${imp.path}${archInfo}`) : `  ${imp.path}`);
    }
  }
  lines.push('');

  // Imported by - always show
  if (full) {
    lines.push(md ? '## Imported By' : '─ Imported By ─');
  } else {
    lines.push(`Imported by (${graph.importedBy.length}):`);
  }
  if (graph.importedBy.length === 0) {
    lines.push(full ? (md ? '(none)' : '  (none)') : '  (none)');
  } else {
    for (const imp of graph.importedBy) {
      const archInfo = full && imp.archId ? ` [${imp.archId}]` : '';
      lines.push(full ? (md ? `- ${imp.path}${archInfo}` : `  ${imp.path}${archInfo}`) : `  ${imp.path}`);
    }
  }

  // Transitive dependencies - only in full mode
  if (full && transitiveImports.length > graph.imports.length) {
    lines.push('');
    const additional = transitiveImports.filter(
      p => !graph.imports.some(i => i.path === p)
    );
    lines.push(md ? `## Transitive Dependencies (${transitiveImports.length} total)` : `─ Transitive Dependencies (${transitiveImports.length} total) ─`);
    const shown = additional.slice(0, 10);
    for (const p of shown) {
      lines.push(md ? `- ${p}` : `  ${p}`);
    }
    if (additional.length > 10) {
      lines.push(md ? `- ... and ${additional.length - 10} more` : `  ... and ${additional.length - 10} more`);
    }
  }

  if (full && transitiveImporters.length > graph.importedBy.length) {
    lines.push('');
    const additional = transitiveImporters.filter(
      p => !graph.importedBy.some(i => i.path === p)
    );
    lines.push(md ? `## Transitive Dependents (${transitiveImporters.length} total)` : `─ Transitive Dependents (${transitiveImporters.length} total) ─`);
    const shown = additional.slice(0, 10);
    for (const p of shown) {
      lines.push(md ? `- ${p}` : `  ${p}`);
    }
    if (additional.length > 10) {
      lines.push(md ? `- ... and ${additional.length - 10} more` : `  ... and ${additional.length - 10} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Dependency direction for a file.
 */
export interface DependencyDirection {
  /** Number of imports from external modules */
  external: number;
  /** Number of imports from same module */
  internal: number;
}

/**
 * Change impact information for a file.
 */
export interface ChangeImpact {
  /** Number of files that directly depend on this file */
  directDependents: number;
  /** Files that would break if this file's contract changes */
  impactChain: string[];
}

/**
 * Module file info with architecture and role.
 */
export interface ModuleFileInfo {
  path: string;
  archId: string | null;
  lineCount: number | null;
  /** Role of this file within the module */
  role?: FileRole;
  /** Brief description of why this file has this role */
  roleReason?: string;
  /** Dependency direction indicators */
  dependencies?: DependencyDirection;
  /** Change impact preview */
  impact?: ChangeImpact;
}

/**
 * Internal import within a module.
 */
export interface ModuleInternalImport {
  from: string;
  to: string;
}

/**
 * External dependency of a module.
 */
export interface ModuleExternalDep {
  path: string;
  archId: string | null;
}

/**
 * Entity reference in a module.
 */
export interface ModuleEntityRef {
  name: string;
  count: number;
}

/**
 * Complete module context.
 */
export interface ModuleContext {
  /** Module path pattern */
  modulePath: string;
  /** Files in the module */
  files: ModuleFileInfo[];
  /** Internal imports (within the module) */
  internalImports: ModuleInternalImport[];
  /** External dependencies (imports from outside the module) */
  externalDeps: ModuleExternalDep[];
  /** Files that import this module from outside */
  externalConsumers: ModuleExternalDep[];
  /** Entities referenced in the module */
  entities: ModuleEntityRef[];
  /** Whether role-based grouping is enabled */
  hasRoles?: boolean;
}

/**
 * Format module context for display.
 */
export function formatModuleContext(
  context: ModuleContext,
  options: FormatOptions & { availableModules?: string[] } = {}
): string {
  const md = options.markdown ?? false;
  const full = options.full ?? false;
  const lines: string[] = [];

  const totalLines = context.files.reduce((sum, f) => sum + (f.lineCount ?? 0), 0);

  // Handle empty module (no files found)
  if (context.files.length === 0) {
    if (full) {
      if (md) {
        lines.push(`# Module Not Found: ${context.modulePath}`, '');
        lines.push(`No files found in \`${context.modulePath}\`.`);
        lines.push('');
        lines.push('**Tips:**');
        lines.push('- Check the path is correct (e.g., `src/core/db/` not `src/core/db`)');
        lines.push('- Run with `refresh: true` to re-scan the project');
      } else {
        lines.push('═'.repeat(60));
        lines.push(`Module Not Found: ${context.modulePath}`);
        lines.push('═'.repeat(60));
        lines.push('');
        lines.push(`No files found in "${context.modulePath}".`);
        lines.push('');
        lines.push('Tips:');
        lines.push('  - Check the path is correct (e.g., src/core/db/ not src/core/db)');
        lines.push('  - Run with --refresh to re-scan the project');
      }
    } else {
      lines.push(`Module "${context.modulePath}" not found.`);
    }
    if (options.availableModules && options.availableModules.length > 0) {
      lines.push('');
      lines.push(full ? (md ? '**Available modules:**' : 'Available modules:') : 'Available:');
      const limit = full ? 10 : 5;
      for (const mod of options.availableModules.slice(0, limit)) {
        lines.push(full ? (md ? `- \`${mod}\`` : `  ${mod}`) : `  ${mod}`);
      }
      if (options.availableModules.length > limit) {
        lines.push(full ? (md ? `- ... and ${options.availableModules.length - limit} more` : `  ... and ${options.availableModules.length - limit} more`) : `  ... +${options.availableModules.length - limit} more`);
      }
    }
    return lines.join('\n');
  }

  // Header
  if (full) {
    if (md) {
      lines.push(`# Module: ${context.modulePath}`, '');
      lines.push(`**${context.files.length} files** | **${totalLines} lines**`);
      lines.push('');
    } else {
      lines.push('═'.repeat(60));
      lines.push(`Module: ${context.modulePath}`);
      lines.push(`${context.files.length} files | ${totalLines} lines`);
      lines.push('═'.repeat(60));
      lines.push('');
    }
  } else {
    lines.push(`${context.modulePath} (${context.files.length} files, ${totalLines} lines)`);
    lines.push('');
  }

  // Check if we have role information
  const hasRoles = context.hasRoles && context.files.some(f => f.role);

  if (hasRoles) {
    // Role-based grouping (optimized for agents)
    const roleOrder: FileRole[] = ['defines', 'implements', 'orchestrates'];
    const roleLabels: Record<FileRole, { title: string; hint: string }> = {
      defines: { title: 'DEFINES', hint: 'modify first - type definitions, schemas, interfaces' },
      implements: { title: 'IMPLEMENTS', hint: 'update if contracts change - core logic' },
      orchestrates: { title: 'ORCHESTRATES', hint: 'coordinates implementations' },
      consumes: { title: 'CONSUMES', hint: 'external files, may need updates' },
    };

    for (const role of roleOrder) {
      const filesWithRole = context.files.filter(f => f.role === role);
      if (filesWithRole.length === 0) continue;

      const label = roleLabels[role];
      if (full) {
        lines.push(md ? `## ${label.title}` : `─ ${label.title} ─`);
        lines.push(md ? `*${label.hint}*` : `  (${label.hint})`);
      } else {
        lines.push(`${label.title} (${label.hint}):`);
      }

      for (const file of filesWithRole) {
        const shortPath = file.path.replace(context.modulePath.replace('**/*', ''), '');
        const reason = file.roleReason ? ` - ${file.roleReason}` : '';
        const lineInfo = full && file.lineCount ? ` (${file.lineCount} lines)` : '';

        // Build indicators string
        const indicators: string[] = [];

        // @arch tag compliance
        if (file.archId) {
          indicators.push(`[${file.archId}]`);
        } else {
          indicators.push('[no @arch]');
        }

        // Dependency direction (compact mode only shows if notable)
        if (file.dependencies) {
          const deps = file.dependencies;
          if (full || deps.external > 0) {
            const depParts: string[] = [];
            if (deps.external > 0) depParts.push(`↑${deps.external} ext`);
            if (deps.internal > 0) depParts.push(`↔${deps.internal} int`);
            if (depParts.length > 0) {
              indicators.push(`(${depParts.join(', ')})`);
            }
          }
        }

        // Change impact preview
        if (file.impact && file.impact.directDependents > 0) {
          const impactIcon = file.impact.directDependents >= 3 ? '🔴' : file.impact.directDependents >= 1 ? '🟡' : '';
          indicators.push(`${impactIcon}breaks: ${file.impact.directDependents}`);
        }

        const indicatorStr = indicators.length > 0 ? ' ' + indicators.join(' ') : '';

        if (full) {
          // Full mode: show everything including impact chain
          let line = md ? `- ${shortPath}${reason}${lineInfo}${indicatorStr}` : `  ${shortPath}${reason}${lineInfo}${indicatorStr}`;
          lines.push(line);

          // Show impact chain for high-impact files
          if (file.impact && file.impact.impactChain.length > 0 && file.impact.directDependents >= 2) {
            const chain = file.impact.impactChain.slice(0, 3).map(p => p.replace(context.modulePath.replace('**/*', ''), '')).join(' → ');
            const more = file.impact.impactChain.length > 3 ? ` (+${file.impact.impactChain.length - 3} more)` : '';
            lines.push(md ? `  - Impact: ${chain}${more}` : `    → ${chain}${more}`);
          }
        } else {
          // Compact mode: single line with key indicators
          lines.push(`  ${shortPath}${reason}${indicatorStr}`);
        }
      }
      lines.push('');
    }

    // External consumers as a separate section
    if (context.externalConsumers.length > 0) {
      const label = roleLabels.consumes;
      if (full) {
        lines.push(md ? `## ${label.title}` : `─ ${label.title} ─`);
        lines.push(md ? `*${label.hint}*` : `  (${label.hint})`);
      } else {
        lines.push(`${label.title} (${label.hint}):`);
      }
      const limit = full ? context.externalConsumers.length : 10;
      for (const consumer of context.externalConsumers.slice(0, limit)) {
        const archInfo = full && consumer.archId ? ` [${consumer.archId}]` : '';
        lines.push(full ? (md ? `- ${consumer.path}${archInfo}` : `  ${consumer.path}${archInfo}`) : `  ${consumer.path}`);
      }
      if (!full && context.externalConsumers.length > limit) {
        lines.push(`  ... +${context.externalConsumers.length - limit} more`);
      }
      lines.push('');
    }
  } else {
    // Legacy: Files grouped by architecture
    if (full) {
      lines.push(md ? '## Files' : '─ Files ─');
    } else {
      lines.push('Files:');
    }
    const byArch = new Map<string, ModuleFileInfo[]>();
    for (const file of context.files) {
      const arch = file.archId ?? '(untagged)';
      if (!byArch.has(arch)) {
        byArch.set(arch, []);
      }
      byArch.get(arch)!.push(file);
    }
    for (const [arch, files] of byArch) {
      if (full) {
        lines.push(md ? `### ${arch}` : `  [${arch}]`);
      } else {
        lines.push(`  [${arch}]`);
      }
      for (const file of files) {
        // Only show line counts in full mode
        const lineInfo = full && file.lineCount ? ` (${file.lineCount} lines)` : '';
        const shortPath = file.path.replace(context.modulePath.replace('**/*', ''), '');
        lines.push(full ? (md ? `- ${shortPath}${lineInfo}` : `    ${shortPath}${lineInfo}`) : `    ${shortPath}`);
      }
    }
    lines.push('');
  }

  // Internal imports - only show in full mode (usually noise for LLMs)
  if (full && context.internalImports.length > 0) {
    lines.push(md ? '## Internal Dependencies' : '─ Internal Dependencies ─');
    const importsByFrom = new Map<string, string[]>();
    for (const imp of context.internalImports) {
      const fromShort = imp.from.replace(context.modulePath.replace('**/*', ''), '');
      const toShort = imp.to.replace(context.modulePath.replace('**/*', ''), '');
      if (!importsByFrom.has(fromShort)) {
        importsByFrom.set(fromShort, []);
      }
      importsByFrom.get(fromShort)!.push(toShort);
    }
    for (const [from, tos] of importsByFrom) {
      lines.push(md ? `- **${from}** → ${tos.join(', ')}` : `  ${from} → ${tos.join(', ')}`);
    }
    lines.push('');
  }

  // External dependencies - always useful
  if (context.externalDeps.length > 0) {
    if (full) {
      lines.push(md ? '## External Dependencies' : '─ External Dependencies ─');
    } else {
      lines.push(`Dependencies (${context.externalDeps.length}):`);
    }
    const limit = full ? context.externalDeps.length : 10;
    for (const dep of context.externalDeps.slice(0, limit)) {
      const archInfo = full && dep.archId ? ` [${dep.archId}]` : '';
      lines.push(full ? (md ? `- ${dep.path}${archInfo}` : `  ${dep.path}${archInfo}`) : `  ${dep.path}`);
    }
    if (!full && context.externalDeps.length > limit) {
      lines.push(`  ... +${context.externalDeps.length - limit} more`);
    }
    lines.push('');
  }

  // External consumers - only show separately when not using role-based grouping
  if (!hasRoles && context.externalConsumers.length > 0) {
    if (full) {
      lines.push(md ? '## Used By (External)' : '─ Used By (External) ─');
    } else {
      lines.push(`Used by (${context.externalConsumers.length}):`);
    }
    const limit = full ? context.externalConsumers.length : 10;
    for (const consumer of context.externalConsumers.slice(0, limit)) {
      const archInfo = full && consumer.archId ? ` [${consumer.archId}]` : '';
      lines.push(full ? (md ? `- ${consumer.path}${archInfo}` : `  ${consumer.path}${archInfo}`) : `  ${consumer.path}`);
    }
    if (!full && context.externalConsumers.length > limit) {
      lines.push(`  ... +${context.externalConsumers.length - limit} more`);
    }
    lines.push('');
  }

  // Entities - only in full mode (often confusing for LLMs)
  if (full && context.entities.length > 0) {
    lines.push(md ? '## Entities Referenced' : '─ Entities Referenced ─');
    const sorted = [...context.entities].sort((a, b) => b.count - a.count);
    const shown = sorted.slice(0, 15);
    for (const entity of shown) {
      lines.push(md ? `- **${entity.name}**: ${entity.count} refs` : `  ${entity.name}: ${entity.count} refs`);
    }
    if (sorted.length > 15) {
      lines.push(md ? `- ... and ${sorted.length - 15} more` : `  ... and ${sorted.length - 15} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format overview output for display.
 */
export function formatOverview(
  summary: ArchSummaryItem[],
  stats: DbStats,
  options: FormatOptions = {}
): string {
  const md = options.markdown ?? false;
  const full = options.full ?? false;
  const lines: string[] = [];

  if (full) {
    if (md) {
      lines.push('# Architecture Map Overview', '');
    } else {
      lines.push('═'.repeat(60));
      lines.push('Architecture Map Overview');
      lines.push('═'.repeat(60));
      lines.push('');
    }
  } else {
    lines.push(`Architecture Map: ${stats.fileCount} files, ${summary.length} architectures`);
    lines.push('');
  }

  if (summary.length === 0) {
    lines.push('No files with @arch tags found.');
    return lines.join('\n');
  }

  if (full) {
    lines.push(md ? '## Architectures by File Count' : '─ Architectures by File Count ─');
    lines.push('');
  } else {
    lines.push('Architectures:');
  }
  for (const { archId, fileCount } of summary) {
    if (full) {
      lines.push(md ? `- **${archId}**: ${fileCount} file${fileCount !== 1 ? 's' : ''}` : `  ${archId}: ${fileCount} file${fileCount !== 1 ? 's' : ''}`);
    } else {
      lines.push(`  ${archId}: ${fileCount}`);
    }
  }

  // Statistics - only in full mode
  if (full) {
    lines.push('');
    lines.push(md ? '## Statistics' : '─ Statistics ─');
    lines.push('');
    if (md) {
      lines.push(`**Total files tracked**: ${stats.fileCount}`);
      lines.push(`**Import relationships**: ${stats.importCount}`);
      lines.push(`**Entity references**: ${stats.entityRefCount}`);
      if (stats.lastScan) {
        lines.push(`**Last scan**: ${stats.lastScan}`);
      }
    } else {
      lines.push(`  Total files tracked: ${stats.fileCount}`);
      lines.push(`  Import relationships: ${stats.importCount}`);
      lines.push(`  Entity references: ${stats.entityRefCount}`);
      if (stats.lastScan) {
        lines.push(`  Last scan: ${stats.lastScan}`);
      }
    }

    // Query options - ONLY in full mode (pure noise for LLMs)
    lines.push('');
    lines.push(md ? '## Query Options' : '─ Query Options ─');
    lines.push('');
    if (md) {
      lines.push('- `entity`: Find files related to an entity (e.g., "todos", "User")');
      lines.push('- `architecture`: List files in an architecture (e.g., "convex.mutation")');
      lines.push('- `file`: Get import graph for a file');
      lines.push('- `refresh`: Force re-scan before query');
    } else {
      lines.push('  --entity <name>       Find files related to an entity');
      lines.push('  --architecture <id>   List files in an architecture (use % for wildcard)');
      lines.push('  --file <path>         Get import graph for a file');
      lines.push('  --refresh             Force re-scan the project');
    }
  }

  return lines.join('\n');
}
