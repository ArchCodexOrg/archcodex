/**
 * @arch archcodex.cli.command.complex
 * @intent:cli-output
 *
 * CLI command for analyzing import neighborhood of a file.
 * Shows what a file can/cannot import, what imports it, and provides
 * actionable guidance for development.
 */
import { Command } from 'commander';
import * as yaml from 'yaml';
import { NeighborhoodAnalyzer } from '../../core/neighborhood/index.js';
import { loadRegistry } from '../../core/registry/loader.js';
import { loadConfig } from '../../core/config/loader.js';
import { loadPatternRegistry } from '../../core/patterns/loader.js';
import { logger } from '../../utils/logger.js';
import type { Neighborhood, FormattedNeighborhood } from '../../core/neighborhood/types.js';

/**
 * Create the neighborhood command.
 */
export function createNeighborhoodCommand(): Command {
  const command = new Command('neighborhood')
    .description('Analyze import boundaries for a file')
    .argument('<file>', 'File to analyze')
    .option('-f, --format <format>', 'Output format: human, json, yaml, ai', 'yaml')
    .option('-d, --depth <n>', 'Import tree depth (default: 1)', '1')
    .option('--include-external', 'Include node_modules imports', false)
    .option('--with-patterns', 'Include pattern registry suggestions', false)
    .option('--violations-only', 'Only show violations', false)
    .option('-c, --config <path>', 'Path to config file')
    .action(async (file: string, options) => {
      try {
        await runNeighborhood(file, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return command;
}

/**
 * Run the neighborhood analysis.
 */
async function runNeighborhood(
  file: string,
  options: {
    format: string;
    depth: string;
    includeExternal: boolean;
    withPatterns: boolean;
    violationsOnly: boolean;
    config?: string;
  }
): Promise<void> {
  const projectRoot = process.cwd();

  // Load config and registry
  const config = await loadConfig(projectRoot, options.config);
  const registry = await loadRegistry(projectRoot, config.registry);
  const patternRegistry = options.withPatterns
    ? await loadPatternRegistry(projectRoot)
    : undefined;

  // Create analyzer with full context
  const analyzer = new NeighborhoodAnalyzer(projectRoot, registry, config, patternRegistry);

  try {
    // Analyze the file
    const neighborhood = await analyzer.analyze(file, {
      depth: parseInt(options.depth, 10),
      includeExternal: options.includeExternal,
      withPatterns: options.withPatterns,
      violationsOnly: options.violationsOnly,
      format: options.format as 'human' | 'json' | 'yaml' | 'ai',
    });

    // Format and output
    const output = formatNeighborhood(neighborhood, options.format, options.violationsOnly);
    console.log(output);
  } finally {
    analyzer.dispose();
  }
}

/**
 * Format neighborhood for output.
 */
function formatNeighborhood(
  neighborhood: Neighborhood,
  format: string,
  violationsOnly: boolean
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(toFormattedNeighborhood(neighborhood, violationsOnly), null, 2);

    case 'yaml':
      return yaml.stringify(toFormattedNeighborhood(neighborhood, violationsOnly));

    case 'ai':
      return formatAi(neighborhood);

    case 'human':
    default:
      return formatHuman(neighborhood, violationsOnly);
  }
}

/**
 * Convert to formatted output structure.
 */
function toFormattedNeighborhood(n: Neighborhood, violationsOnly: boolean): FormattedNeighborhood {
  const currentImports = violationsOnly
    ? n.currentImports.filter(i => !i.allowed)
    : n.currentImports;

  return {
    file: n.file,
    architecture: n.architecture,
    layer: {
      name: n.layer.name,
      can_import: n.layer.canImport,
      cannot_import: n.layer.cannotImport,
    },
    imported_by: n.importedBy.map(i => ({
      file: i.file,
      architecture: i.architecture,
    })),
    importable_by: n.importableBy,
    current_imports: currentImports.map(i => ({
      path: i.path,
      status: i.layerViolation ? 'layer_violation' as const : (i.allowed ? 'allowed' as const : 'forbidden' as const),
      why: i.why || i.layerViolation,
      layer: i.layer,
    })),
    missing_required: n.missingRequired.map(r => ({
      import: r.import,
      why: r.why,
      suggestion: r.suggestion?.statement,
    })),
    constraints: {
      forbid_import: n.constraints.forbidImport.map(f => ({
        value: f.value,
        why: f.why,
        alternative: f.alternative,
      })),
      require_import: n.constraints.requireImport.map(r => ({
        value: r.value,
        match: r.match,
        why: r.why,
      })),
    },
    suggested_patterns: n.suggestedPatterns?.map(p => ({
      name: p.name,
      canonical: p.canonical,
      exports: p.exports,
      usage: p.usage,
    })),
    ai_summary: n.aiSummary,
  };
}

/**
 * Format as AI-optimized output.
 */
function formatAi(n: Neighborhood): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Import Boundaries: ${n.file}`);
  lines.push(`Architecture: ${n.architecture || '(untagged)'}`);
  lines.push(`Layer: ${n.layer.name}${n.layer.canImport.length > 0 ? ` (can import: ${n.layer.canImport.join(', ')})` : ''}`);
  lines.push('');

  // Layer restrictions
  if (n.layer.cannotImport.length > 0) {
    lines.push(`## Cannot Import From Layers`);
    lines.push(n.layer.cannotImport.join(', '));
    lines.push('');
  }

  // Forbidden imports
  if (n.forbiddenImports.length > 0) {
    lines.push('## Forbidden Imports');
    for (const forbid of n.forbiddenImports) {
      lines.push(`- ${forbid.value.join(', ')}`);
      if (forbid.why) {
        lines.push(`  Why: ${forbid.why}`);
      }
      if (forbid.alternative) {
        lines.push(`  Use instead: ${forbid.alternative}`);
      }
    }
    lines.push('');
  }

  // Missing required imports
  if (n.missingRequired.length > 0) {
    lines.push('## Missing Required Imports');
    for (const req of n.missingRequired) {
      lines.push(`- ${req.import}`);
      if (req.suggestion) {
        lines.push(`  Add: ${req.suggestion.statement}`);
      }
    }
    lines.push('');
  }

  // Current violations
  const violations = n.currentImports.filter(i => !i.allowed);
  if (violations.length > 0) {
    lines.push('## Current Violations');
    for (const v of violations) {
      lines.push(`- ${v.path}`);
      lines.push(`  ${v.layerViolation || v.forbiddenBy || 'forbidden'}`);
      if (v.why) {
        lines.push(`  Why: ${v.why}`);
      }
    }
    lines.push('');
  }

  // Suggested patterns
  if (n.suggestedPatterns && n.suggestedPatterns.length > 0) {
    lines.push('## Suggested Patterns');
    for (const p of n.suggestedPatterns.filter(p => p.relevance !== 'low')) {
      lines.push(`- ${p.name}: ${p.canonical}`);
      if (p.exports?.length) {
        lines.push(`  Exports: ${p.exports.join(', ')}`);
      }
      if (p.usage) {
        lines.push(`  ${p.usage}`);
      }
    }
    lines.push('');
  }

  // Dependents
  if (n.importedBy.length > 0) {
    lines.push(`## Dependents (${n.importedBy.length} files)`);
    const shown = n.importedBy.slice(0, 5);
    for (const dep of shown) {
      lines.push(`- ${dep.file}${dep.architecture ? ` [${dep.architecture}]` : ''}`);
    }
    if (n.importedBy.length > 5) {
      lines.push(`- ... and ${n.importedBy.length - 5} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Format as human-readable output.
 */
function formatHuman(n: Neighborhood, violationsOnly: boolean): string {
  const lines: string[] = [
    '═'.repeat(70),
    `FILE: ${n.file}`,
    '═'.repeat(70),
    '',
    `Architecture: ${n.architecture || '(untagged)'}`,
    `Layer: ${n.layer.name}`,
  ];

  if (n.layer.canImport.length > 0) {
    lines.push(`  Can import from: ${n.layer.canImport.join(', ')}`);
  }
  if (n.layer.cannotImport.length > 0) {
    lines.push(`  Cannot import from: ${n.layer.cannotImport.join(', ')}`);
  }
  lines.push('');

  // Imported by
  if (!violationsOnly) {
    lines.push('─'.repeat(70));
    lines.push('IMPORTED BY:');
    lines.push('─'.repeat(70));
    if (n.importedBy.length === 0) {
      lines.push('  (none)');
    } else {
      for (const importer of n.importedBy.slice(0, 10)) {
        const arch = importer.architecture ? ` [${importer.architecture}]` : '';
        lines.push(`  • ${importer.file}${arch}`);
      }
      if (n.importedBy.length > 10) {
        lines.push(`  ... and ${n.importedBy.length - 10} more`);
      }
    }
    lines.push('');
  }

  // Importable by (if constraint exists)
  if (n.importableBy) {
    lines.push('─'.repeat(70));
    lines.push('IMPORTABLE BY:');
    lines.push('─'.repeat(70));
    for (const pattern of n.importableBy.patterns) {
      lines.push(`  • ${pattern}`);
    }
    if (n.importableBy.why) {
      lines.push(`  Why: ${n.importableBy.why}`);
    }
    lines.push('');
  }

  // Missing required imports
  if (n.missingRequired.length > 0) {
    lines.push('─'.repeat(70));
    lines.push('⚠ MISSING REQUIRED IMPORTS:');
    lines.push('─'.repeat(70));
    for (const req of n.missingRequired) {
      lines.push(`  ✗ ${req.import}`);
      if (req.why) {
        lines.push(`    Why: ${req.why}`);
      }
      if (req.suggestion) {
        lines.push(`    Add: ${req.suggestion.statement}`);
      }
    }
    lines.push('');
  }

  // Current imports
  const imports = violationsOnly
    ? n.currentImports.filter(i => !i.allowed)
    : n.currentImports;

  if (imports.length > 0) {
    lines.push('─'.repeat(70));
    lines.push(violationsOnly ? 'VIOLATIONS:' : 'CURRENT IMPORTS:');
    lines.push('─'.repeat(70));
    for (const imp of imports) {
      const icon = imp.allowed ? '✓' : '✗';
      const status = imp.allowed ? '' : ` (${imp.layerViolation || imp.forbiddenBy})`;
      const layer = imp.layer ? ` [${imp.layer}]` : '';
      lines.push(`  ${icon} ${imp.path}${layer}${status}`);
      if (!imp.allowed && imp.why) {
        lines.push(`    Why: ${imp.why}`);
      }
    }
    lines.push('');
  }

  // Forbidden imports
  if (n.forbiddenImports.length > 0 && !violationsOnly) {
    lines.push('─'.repeat(70));
    lines.push('FORBIDDEN IMPORTS:');
    lines.push('─'.repeat(70));
    for (const forbid of n.forbiddenImports) {
      lines.push(`  ✗ ${forbid.value.join(', ')}`);
      if (forbid.why) {
        lines.push(`    Why: ${forbid.why}`);
      }
      if (forbid.alternative) {
        lines.push(`    Use instead: ${forbid.alternative}`);
      }
    }
    lines.push('');
  }

  // Suggested patterns
  if (n.suggestedPatterns && n.suggestedPatterns.length > 0 && !violationsOnly) {
    lines.push('─'.repeat(70));
    lines.push('SUGGESTED PATTERNS:');
    lines.push('─'.repeat(70));
    for (const p of n.suggestedPatterns) {
      const relevance = p.relevance === 'high' ? '★' : p.relevance === 'medium' ? '☆' : '○';
      lines.push(`  ${relevance} ${p.name}: ${p.canonical}`);
      if (p.usage) {
        lines.push(`    ${p.usage}`);
      }
    }
    lines.push('');
  }

  // Same layer patterns
  if (!violationsOnly) {
    lines.push('─'.repeat(70));
    lines.push('SAME LAYER (implicitly allowed):');
    lines.push('─'.repeat(70));
    for (const pattern of n.sameLayerPatterns) {
      lines.push(`  • ${pattern}`);
    }
    lines.push('');
  }

  lines.push('═'.repeat(70));

  return lines.join('\n');
}
