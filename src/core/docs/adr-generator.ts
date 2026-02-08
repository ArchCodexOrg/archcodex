/**
 * @arch archcodex.core.domain
 *
 * ADR (Architecture Decision Record) generator for ArchCodex.
 * Transforms resolved architectures into human-readable Markdown ADRs.
 *
 * Based on spec.archcodex.docs.adr:
 * - Generate standard ADR format (Title, Status, Context, Decision, Consequences)
 * - Extract context from description and rationale
 * - Document constraints as decisions
 * - Document consequences (what's forbidden/required)
 * - Include reference implementations as examples
 * - Link to parent architecture and mixins
 */
import type { FlattenedArchitecture, ResolvedConstraint } from '../registry/types.js';

// ============================================================================
// Types
// ============================================================================

export interface AdrGeneratorOptions {
  /** Show inheritance chain in ADR */
  includeInheritance?: boolean;
  /** Include hints as guidelines */
  includeHints?: boolean;
  /** Include reference implementations */
  includeReferences?: boolean;
  /** Output format */
  format?: 'standard' | 'compact' | 'detailed';
}

export interface AdrGeneratorResult {
  valid: boolean;
  markdown: string;
  sections: string[];
  errors: Array<{ code: string; message: string }>;
}

export interface AllAdrsOptions {
  /** Output directory for generated files */
  outputDir?: string;
  /** Generate index.md linking all ADRs */
  includeIndex?: boolean;
  /** Group ADRs by layer/category */
  groupBy?: 'layer' | 'flat';
  /** Skip base/abstract architectures */
  skipAbstract?: boolean;
}

export interface AllAdrsResult {
  valid: boolean;
  files: Array<{ name: string; content: string; archId: string }>;
  index?: string;
  errors: Array<{ code: string; message: string }>;
}

// Registry interface for generateAllAdrs
interface RegistryLike {
  nodes: Record<string, { description?: string; kind?: string }>;
}

// ============================================================================
// Single ADR Generator
// ============================================================================

/**
 * Generate an ADR Markdown document from a resolved architecture.
 */
export function generateAdr(
  architecture: FlattenedArchitecture,
  options: AdrGeneratorOptions = {}
): AdrGeneratorResult {
  const {
    includeInheritance = true,
    includeHints = true,
    includeReferences = true,
    format = 'standard',
  } = options;

  // Validate required fields
  if (!architecture.archId) {
    return {
      valid: false,
      markdown: '',
      sections: [],
      errors: [{ code: 'MISSING_ARCH_ID', message: 'Architecture must have an archId' }],
    };
  }

  const sections: string[] = [];
  const lines: string[] = [];

  // Title
  const title = formatArchIdAsTitle(architecture.archId);
  lines.push(`# ADR: ${title}`);
  lines.push('');

  // Status
  sections.push('status');
  lines.push('## Status');
  lines.push('');
  if (architecture.deprecated_from) {
    lines.push(`**Deprecated** (since ${architecture.deprecated_from})`);
    if (architecture.migration_guide) {
      lines.push('');
      lines.push(`See [Migration Guide](${architecture.migration_guide})`);
    }
  } else {
    lines.push('**Active**');
  }
  lines.push('');

  // Context
  sections.push('context');
  lines.push('## Context');
  lines.push('');
  if (architecture.rationale) {
    lines.push(architecture.rationale);
    lines.push('');
  } else if (architecture.description) {
    lines.push(architecture.description);
    lines.push('');
  } else {
    lines.push(`Architecture pattern for ${architecture.archId.replace(/\./g, ' ')} components.`);
    lines.push('');
  }

  // Inheritance chain
  if (includeInheritance && architecture.inheritanceChain.length > 1) {
    lines.push('### Inheritance');
    lines.push('');
    lines.push(`Inherits from: ${architecture.inheritanceChain.slice(1).map(id => `\`${id}\``).join(' → ')}`);
    lines.push('');
  }

  // Mixins
  if (architecture.appliedMixins.length > 0) {
    lines.push('### Applied Mixins');
    lines.push('');
    lines.push(architecture.appliedMixins.map(m => `- \`${m}\``).join('\n'));
    lines.push('');
  }

  // Decision
  sections.push('decision');
  lines.push('## Decision');
  lines.push('');

  if (architecture.constraints.length > 0) {
    lines.push('Files using this architecture must follow these constraints:');
    lines.push('');

    // Group constraints by rule type
    const grouped = groupConstraintsByRule(architecture.constraints);

    for (const [rule, constraints] of Object.entries(grouped)) {
      const ruleTitle = formatRuleAsTitle(rule);
      lines.push(`### ${ruleTitle}`);
      lines.push('');

      for (const constraint of constraints) {
        const value = Array.isArray(constraint.value)
          ? constraint.value.join(', ')
          : String(constraint.value);

        if (format === 'detailed' && constraint.why) {
          lines.push(`- **${value}**`);
          lines.push(`  - *Why*: ${constraint.why}`);
          if (constraint.source !== architecture.archId) {
            lines.push(`  - *Source*: \`${constraint.source}\``);
          }
        } else if (format === 'compact') {
          lines.push(`- ${value}`);
        } else {
          // standard format
          const why = constraint.why ? ` — ${constraint.why}` : '';
          lines.push(`- \`${value}\`${why}`);
        }
      }
      lines.push('');
    }
  } else {
    lines.push('No specific constraints defined. Inherits base constraints only.');
    lines.push('');
  }

  // File patterns
  if (architecture.file_pattern || architecture.default_path) {
    lines.push('### File Conventions');
    lines.push('');
    if (architecture.file_pattern) {
      lines.push(`- **Naming pattern**: \`${architecture.file_pattern}\``);
    }
    if (architecture.default_path) {
      lines.push(`- **Default location**: \`${architecture.default_path}\``);
    }
    lines.push('');
  }

  // Consequences
  sections.push('consequences');
  lines.push('## Consequences');
  lines.push('');

  const forbidden = architecture.constraints.filter(c =>
    c.rule === 'forbid_import' || c.rule === 'forbid_pattern'
  );
  const required = architecture.constraints.filter(c =>
    c.rule === 'require_import' || c.rule === 'require_pattern' || c.rule === 'require_test_file'
  );

  if (forbidden.length > 0) {
    lines.push('### Forbidden');
    lines.push('');
    for (const c of forbidden) {
      const values = Array.isArray(c.value) ? c.value : [c.value];
      for (const v of values) {
        lines.push(`- \`${v}\`${c.why ? ` — ${c.why}` : ''}`);
      }
    }
    lines.push('');
  }

  if (required.length > 0) {
    lines.push('### Required');
    lines.push('');
    for (const c of required) {
      const values = Array.isArray(c.value) ? c.value : [c.value];
      for (const v of values) {
        lines.push(`- \`${v}\`${c.why ? ` — ${c.why}` : ''}`);
      }
    }
    lines.push('');
  }

  if (forbidden.length === 0 && required.length === 0) {
    lines.push('This architecture has no explicit forbidden or required items.');
    lines.push('');
  }

  // Guidelines (hints)
  if (includeHints && architecture.hints.length > 0) {
    sections.push('guidelines');
    lines.push('## Guidelines');
    lines.push('');
    for (const hint of architecture.hints) {
      lines.push(`- ${hint.text}`);
      if (hint.example) {
        lines.push(`  - Example: ${hint.example}`);
      }
    }
    lines.push('');
  }

  // Reference implementations
  if (includeReferences && architecture.reference_implementations?.length) {
    sections.push('references');
    lines.push('## References');
    lines.push('');
    lines.push('### Reference Implementations');
    lines.push('');
    for (const ref of architecture.reference_implementations) {
      lines.push(`- [\`${ref}\`](${ref})`);
    }
    lines.push('');
  }

  // Code pattern
  if (format === 'detailed' && architecture.code_pattern) {
    lines.push('### Code Pattern');
    lines.push('');
    lines.push('```typescript');
    lines.push(architecture.code_pattern);
    lines.push('```');
    lines.push('');
  }

  // Expected intents
  if (architecture.expected_intents?.length || architecture.suggested_intents?.length) {
    lines.push('### Intent Annotations');
    lines.push('');
    if (architecture.expected_intents?.length) {
      lines.push('**Expected:**');
      for (const intent of architecture.expected_intents) {
        lines.push(`- \`@intent:${intent}\``);
      }
      lines.push('');
    }
    if (architecture.suggested_intents?.length) {
      lines.push('**Suggested:**');
      for (const { name, when } of architecture.suggested_intents) {
        lines.push(`- \`@intent:${name}\` — ${when}`);
      }
      lines.push('');
    }
  }

  return {
    valid: true,
    markdown: lines.join('\n'),
    sections,
    errors: [],
  };
}

// ============================================================================
// All ADRs Generator
// ============================================================================

/**
 * Generate ADRs for all architectures in a registry.
 */
export function generateAllAdrs(
  registry: RegistryLike,
  resolveArch: (archId: string) => FlattenedArchitecture | undefined,
  options: AllAdrsOptions = {}
): AllAdrsResult {
  const {
    includeIndex = true,
    groupBy = 'layer',
    skipAbstract = true,
  } = options;

  const errors: Array<{ code: string; message: string }> = [];
  const files: Array<{ name: string; content: string; archId: string }> = [];

  // Get all architecture IDs
  const archIds = Object.keys(registry.nodes);

  // Filter out abstract/base architectures if requested
  const filteredIds = skipAbstract
    ? archIds.filter(id => {
        const node = registry.nodes[id];
        // Skip if it's marked as abstract or is a base architecture
        if (node.kind === 'definition') return false;
        if (id === 'base' || id.endsWith('.base')) return false;
        return true;
      })
    : archIds;

  // Generate ADR for each architecture
  for (const archId of filteredIds) {
    const architecture = resolveArch(archId);
    if (!architecture) {
      errors.push({ code: 'RESOLVE_FAILED', message: `Failed to resolve ${archId}` });
      continue;
    }

    const result = generateAdr(architecture);
    if (result.valid) {
      const fileName = `${archId.replace(/\./g, '-')}.md`;
      files.push({ name: fileName, content: result.markdown, archId });
    } else {
      errors.push(...result.errors.map(e => ({ ...e, message: `${archId}: ${e.message}` })));
    }
  }

  // Generate index if requested
  let index: string | undefined;
  if (includeIndex && files.length > 0) {
    index = generateIndex(files, registry, groupBy);
  }

  return {
    valid: errors.length === 0,
    files,
    index,
    errors,
  };
}

/**
 * Generate index markdown linking all ADRs.
 */
function generateIndex(
  files: Array<{ name: string; content: string; archId: string }>,
  registry: RegistryLike,
  groupBy: 'layer' | 'flat'
): string {
  const lines: string[] = [];

  lines.push('# Architecture Decision Records');
  lines.push('');
  lines.push('This document indexes all Architecture Decision Records (ADRs) for this project.');
  lines.push('');

  if (groupBy === 'layer') {
    // Group by first segment of archId (e.g., "convex", "frontend", "core")
    const grouped = new Map<string, typeof files>();

    for (const file of files) {
      const layer = file.archId.split('.')[0];
      if (!grouped.has(layer)) {
        grouped.set(layer, []);
      }
      grouped.get(layer)!.push(file);
    }

    // Sort layers alphabetically
    const sortedLayers = Array.from(grouped.keys()).sort();

    for (const layer of sortedLayers) {
      const layerFiles = grouped.get(layer)!;
      lines.push(`## ${capitalize(layer)}`);
      lines.push('');

      // Sort files within layer
      layerFiles.sort((a, b) => a.archId.localeCompare(b.archId));

      for (const file of layerFiles) {
        const description = registry.nodes[file.archId]?.description || '';
        const descStr = description ? ` - ${description}` : '';
        lines.push(`- [\`${file.archId}\`](./${file.name})${descStr}`);
      }
      lines.push('');
    }
  } else {
    // Flat list, sorted alphabetically
    const sortedFiles = [...files].sort((a, b) => a.archId.localeCompare(b.archId));

    lines.push('## All Architectures');
    lines.push('');

    for (const file of sortedFiles) {
      const description = registry.nodes[file.archId]?.description || '';
      const descStr = description ? ` - ${description}` : '';
      lines.push(`- [\`${file.archId}\`](./${file.name})${descStr}`);
    }
    lines.push('');
  }

  // Statistics
  lines.push('---');
  lines.push('');
  lines.push(`*Generated: ${new Date().toISOString().split('T')[0]}*`);
  lines.push(`*Total ADRs: ${files.length}*`);
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format archId as a human-readable title.
 * convex.mutation.guarded → Convex Mutation Guarded
 */
function formatArchIdAsTitle(archId: string): string {
  return archId
    .split('.')
    .map(capitalize)
    .join(' ');
}

/**
 * Format constraint rule as a section title.
 * forbid_import → Forbidden Imports
 */
function formatRuleAsTitle(rule: string): string {
  const titles: Record<string, string> = {
    forbid_import: 'Forbidden Imports',
    require_import: 'Required Imports',
    forbid_pattern: 'Forbidden Patterns',
    require_pattern: 'Required Patterns',
    require_test_file: 'Test Requirements',
    layer: 'Layer Constraints',
    max_lines: 'Size Limits',
    naming: 'Naming Conventions',
  };

  return titles[rule] || rule.split('_').map(capitalize).join(' ');
}

/**
 * Group constraints by their rule type.
 */
function groupConstraintsByRule(
  constraints: ResolvedConstraint[]
): Record<string, ResolvedConstraint[]> {
  const grouped: Record<string, ResolvedConstraint[]> = {};

  for (const constraint of constraints) {
    if (!grouped[constraint.rule]) {
      grouped[constraint.rule] = [];
    }
    grouped[constraint.rule].push(constraint);
  }

  return grouped;
}

/**
 * Capitalize first letter of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
