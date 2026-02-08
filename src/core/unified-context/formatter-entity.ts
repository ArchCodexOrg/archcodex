/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Entity formatting functions for unified context output.
 * Split from formatter.ts for file size compliance.
 */

import type {
  UnifiedEntityContext,
} from './types.js';

/**
 * Format entity context in compact form.
 */
export function formatEntityCompact(context: UnifiedEntityContext): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Entity: ${context.name}`);
  lines.push('');

  // Schema
  lines.push('## Schema');
  lines.push('');
  const fieldNames = context.fields
    .filter(f => !f.name.startsWith('_'))
    .map(f => f.optional ? `${f.name}?` : f.name);
  lines.push(`fields: [${fieldNames.join(', ')}]`);

  if (context.relationships.length > 0) {
    const rels = context.relationships.map(r =>
      `${shortRelType(r.type)} ${r.target}${r.field ? ` via ${r.field}` : ''}`
    );
    lines.push(`relationships: ${rels.join(', ')}`);
  }

  if (context.behaviors.length > 0) {
    lines.push(`behaviors: ${context.behaviors.map(b => b.type).join(', ')}`);
  }
  lines.push('');

  // Operations
  if (context.operations.length > 0) {
    lines.push('## Operations');
    lines.push('');
    lines.push(`existing: ${context.operations.join(', ')}`);
    if (context.similarOperations && context.similarOperations.length > 0) {
      lines.push(`similar: ${context.similarOperations.join(', ')}`);
    }
    lines.push('');
  }

  // Files by role
  lines.push('## Files');
  lines.push('');

  const allFiles = [
    ...context.files.defines,
    ...context.files.implements,
    ...context.files.orchestrates,
  ];

  if (allFiles.length > 0) {
    if (context.files.defines.length > 0) {
      lines.push('DEFINES:');
      for (const file of context.files.defines) {
        lines.push(`  ${file.path} [${file.archId ?? 'no @arch'}]`);
      }
    }
    if (context.files.implements.length > 0) {
      lines.push('IMPLEMENTS:');
      for (const file of context.files.implements) {
        const breakIndicator = file.breaks > 0 ? ` 🔴${file.breaks}` : '';
        lines.push(`  ${file.path} [${file.archId ?? 'no @arch'}]${breakIndicator}`);
      }
    }
    if (context.files.orchestrates.length > 0) {
      lines.push('ORCHESTRATES:');
      for (const file of context.files.orchestrates) {
        lines.push(`  ${file.path} [${file.archId ?? 'no @arch'}]`);
      }
    }
  } else {
    lines.push('(no files found referencing this entity)');
  }

  return lines.join('\n');
}

/**
 * Format entity context in full verbose mode.
 */
export function formatEntityFull(context: UnifiedEntityContext, markdown?: boolean): string {
  const lines: string[] = [];
  const md = markdown ?? false;

  // Header
  if (md) {
    lines.push(`# Entity: ${context.name}`);
  } else {
    lines.push('═'.repeat(50));
    lines.push(`Entity: ${context.name}`);
    lines.push('═'.repeat(50));
  }
  lines.push('');

  // Fields
  if (md) {
    lines.push('## Fields');
  } else {
    lines.push('─ Fields ─');
  }
  lines.push('');

  for (const field of context.fields) {
    const optional = field.optional ? ' (optional)' : '';
    const ref = field.isReference ? ` → ${field.referenceTarget}` : '';
    lines.push(md
      ? `- **${field.name}**: ${field.type}${optional}${ref}`
      : `  ${field.name}: ${field.type}${optional}${ref}`);
  }
  lines.push('');

  // Relationships
  if (context.relationships.length > 0) {
    if (md) {
      lines.push('## Relationships');
    } else {
      lines.push('─ Relationships ─');
    }
    lines.push('');

    for (const rel of context.relationships) {
      const fieldInfo = rel.field ? ` (via ${rel.field})` : '';
      lines.push(md
        ? `- **${rel.name}**: ${rel.type} → ${rel.target}${fieldInfo}`
        : `  ${rel.name}: ${rel.type} → ${rel.target}${fieldInfo}`);
    }
    lines.push('');
  }

  // Behaviors
  if (context.behaviors.length > 0) {
    if (md) {
      lines.push('## Detected Behaviors');
    } else {
      lines.push('─ Detected Behaviors ─');
    }
    lines.push('');

    for (const behavior of context.behaviors) {
      lines.push(md
        ? `- **${behavior.type}**: ${behavior.fields.join(', ')} field(s)`
        : `  ${behavior.type}: ${behavior.fields.join(', ')} field(s)`);
    }
    lines.push('');
  }

  // Operations
  if (context.operations.length > 0) {
    if (md) {
      lines.push('## Operations');
    } else {
      lines.push('─ Operations ─');
    }
    lines.push('');
    lines.push(`Existing: ${context.operations.join(', ')}`);
    if (context.similarOperations && context.similarOperations.length > 0) {
      lines.push(`Similar: ${context.similarOperations.join(', ')}`);
    }
    lines.push('');
  }

  // Files
  if (md) {
    lines.push('## Files');
  } else {
    lines.push('─ Files ─');
  }
  lines.push('');

  for (const [role, files] of Object.entries(context.files)) {
    if (files.length === 0) continue;

    lines.push(`${role.toUpperCase()}:`);
    for (const file of files) {
      const archTag = file.archId ? `[${file.archId}]` : '[no @arch]';
      const breakIndicator = file.breaks > 0 ? ` (breaks: ${file.breaks})` : '';
      lines.push(md
        ? `- ${file.path} ${archTag}${breakIndicator}`
        : `  ${file.path} ${archTag}${breakIndicator}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Short form for relationship types.
 */
export function shortRelType(type: string): string {
  switch (type) {
    case 'has_many': return '1:N';
    case 'belongs_to': return 'N:1';
    case 'many_to_many': return 'N:N';
    case 'has_one': return '1:1';
    default: return type;
  }
}
