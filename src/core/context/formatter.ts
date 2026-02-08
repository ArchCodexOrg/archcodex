/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Context formatter - formats synthesized context for different output targets.
 */

import type {
  SynthesizedContext,
  ContextFormatOptions,
  Field,
  Relationship,
  DetectedBehavior,
} from './types.js';

/**
 * Format a synthesized context for output.
 */
export function formatContext(
  context: SynthesizedContext,
  options: ContextFormatOptions = { format: 'yaml' }
): string {
  switch (options.format) {
    case 'json':
      return formatAsJson(context);
    case 'compact':
      return formatAsCompact(context);
    case 'yaml':
    default:
      return formatAsYaml(context);
  }
}

/**
 * Format context as YAML (LLM-friendly, human-readable).
 */
function formatAsYaml(context: SynthesizedContext): string {
  const lines: string[] = [];

  lines.push(`entity: ${context.entity}`);
  lines.push('─'.repeat(50));
  lines.push('');

  // Fields
  if (context.fields.length > 0) {
    const fieldNames = context.fields.map(f => formatFieldName(f)).join(', ');
    lines.push(`fields: [${fieldNames}]`);
    lines.push('');
  }

  // Relationships
  if (context.relationships.length > 0) {
    lines.push('relationships:');
    for (const rel of context.relationships) {
      lines.push(`  ${rel.name}: ${rel.type} ${rel.target}`);
    }
    lines.push('');
  }

  // Behaviors
  if (context.behaviors.length > 0) {
    lines.push('behaviors:');
    for (const behavior of context.behaviors) {
      lines.push(`  - ${behavior.type}: ${behavior.fields.join(', ')} field${behavior.fields.length > 1 ? 's' : ''}`);
    }
    lines.push('');
  }

  // Existing operations
  if (context.existingOperations.length > 0) {
    lines.push('existing_operations:');
    for (const op of context.existingOperations) {
      lines.push(`  - ${op.name} (${op.file}:${op.line})`);
    }
    lines.push('');
  }

  // Similar operations
  if (context.similarOperations.length > 0) {
    lines.push('similar_operations:');
    for (const op of context.similarOperations) {
      lines.push(`  - ${op.name} (${op.file}:${op.line})`);
    }
    lines.push('');
  }

  // Constraints
  if (context.constraints) {
    lines.push('constraints:');
    lines.push(`  architecture: ${context.constraints.archId}`);
    if (context.constraints.constraints.length > 0) {
      for (const constraint of context.constraints.constraints) {
        lines.push(`  - ${constraint}`);
      }
    }
    lines.push('');
  }

  // File references from architecture map
  if (context.fileReferences && context.fileReferences.length > 0) {
    lines.push('file_references:');
    for (const archGroup of context.fileReferences) {
      lines.push(`  ${archGroup.archId}:`);
      for (const file of archGroup.files) {
        const lineInfo = file.lineNumber ? `:${file.lineNumber}` : '';
        const refInfo = file.refType ? ` (${file.refType})` : '';
        const relInfo = file.relevance ? ` [${file.relevance}]` : '';
        lines.push(`    - ${file.path}${lineInfo}${refInfo}${relInfo}`);
      }
    }
    if (context.truncatedFiles && context.truncatedFiles > 0) {
      lines.push(`  # (${context.truncatedFiles} peripheral files omitted - use verbose: true to see all)`);
    }
    lines.push('');
  }

  // UI components from component groups
  if (context.uiComponents) {
    lines.push('ui_components:');
    lines.push(`  group: ${context.uiComponents.group}`);
    if (context.uiComponents.warning) {
      lines.push(`  warning: "${context.uiComponents.warning}"`);
    }
    if (context.uiComponents.components.length > 0) {
      lines.push('  components:');
      for (const comp of context.uiComponents.components) {
        const rendersInfo = comp.renders ? ` (renders: ${comp.renders})` : '';
        lines.push(`    - ${comp.path}${rendersInfo}`);
      }
    }
    if (context.uiComponents.related) {
      lines.push('  related:');
      for (const [key, value] of Object.entries(context.uiComponents.related)) {
        if (value) {
          lines.push(`    ${key}: ${value}`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format context as JSON (machine-readable).
 */
function formatAsJson(context: SynthesizedContext): string {
  return JSON.stringify(context, null, 2);
}

/**
 * Format context as compact output (minimal tokens for LLM efficiency).
 */
function formatAsCompact(context: SynthesizedContext): string {
  const parts: string[] = [];

  // Entity with inline fields
  const fieldTypes = context.fields
    .filter(f => !f.name.startsWith('_')) // Skip internal fields
    .map(f => `${f.name}${f.optional ? '?' : ''}`)
    .join(',');
  parts.push(`${context.entity}(${fieldTypes})`);

  // Relationships in short form
  if (context.relationships.length > 0) {
    const rels = context.relationships
      .map(r => `${shortRelType(r.type)}:${r.target}`)
      .join(',');
    parts.push(`rels[${rels}]`);
  }

  // Behaviors in short form
  if (context.behaviors.length > 0) {
    const behaviors = context.behaviors
      .map(b => shortBehavior(b.type))
      .join(',');
    parts.push(`behaviors[${behaviors}]`);
  }

  // Operation count
  if (context.existingOperations.length > 0) {
    parts.push(`ops:${context.existingOperations.length}`);
  }

  // Similar operations count
  if (context.similarOperations.length > 0) {
    parts.push(`similar:${context.similarOperations.length}`);
  }

  // File references count
  if (context.fileReferences && context.fileReferences.length > 0) {
    const totalFiles = context.fileReferences.reduce((sum, g) => sum + g.files.length, 0);
    parts.push(`files:${totalFiles}`);
  }

  // UI components count
  if (context.uiComponents) {
    parts.push(`ui:${context.uiComponents.components.length}`);
  }

  return parts.join(' | ');
}

/**
 * Format a field name with optional indicator.
 */
function formatFieldName(field: Field): string {
  if (field.optional) {
    return `${field.name}?`;
  }
  return field.name;
}

/**
 * Short form for relationship types.
 */
function shortRelType(type: Relationship['type']): string {
  switch (type) {
    case 'has_many': return '1:N';
    case 'belongs_to': return 'N:1';
    case 'many_to_many': return 'N:N';
    case 'has_one': return '1:1';
    default: return type;
  }
}

/**
 * Short form for behavior types.
 */
function shortBehavior(type: DetectedBehavior['type']): string {
  switch (type) {
    case 'soft_delete': return 'soft_del';
    case 'ordering': return 'ord';
    case 'audit_trail': return 'audit';
    case 'optimistic_lock': return 'opt_lock';
    default: return type;
  }
}

/**
 * Format multiple contexts.
 */
export function formatContexts(
  contexts: SynthesizedContext[],
  options: ContextFormatOptions = { format: 'yaml' }
): string {
  if (options.format === 'json') {
    return JSON.stringify(contexts, null, 2);
  }

  return contexts.map(c => formatContext(c, options)).join('\n\n');
}
