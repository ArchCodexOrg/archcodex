/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Prompt builder for LLM subagents.
 * Generates optimized prompts with pre-baked architectural context.
 *
 * Based on LLM evaluation findings:
 * - Pre-provided context outperforms agent discovery
 * - Compact format (~100 tokens) is sufficient for accurate implementation
 * - Haiku needs explicit "MUST" instructions
 * - Opus responds to hints
 */

import { synthesizeUnifiedContext } from './synthesizer.js';
import type { UnifiedModuleContext } from './types.js';

export type PromptModel = 'haiku' | 'opus' | 'sonnet';
export type PromptScope = 'ui-only' | 'logic-only' | 'data-only' | 'full';

export interface PromptBuilderOptions {
  /** Target model - affects instruction style */
  model?: PromptModel;
  /** Task description to include */
  task: string;
  /** Additional requirements to append */
  requirements?: string[];
  /** Include validation reminder */
  includeValidation?: boolean;
  /** Output mode: 'execute' writes code, 'preview' shows what would be written */
  outputMode?: 'execute' | 'preview';
  /** Scope of the change - adds focus instructions */
  scope?: PromptScope;
}

export interface BuildPromptResult {
  /** The complete prompt ready for subagent */
  prompt: string;
  /** Token estimate for the context portion */
  contextTokens: number;
  /** The module path used */
  modulePath: string;
  /** The architecture tag for the module */
  archTag: string;
}

/**
 * Build a prompt with pre-baked architectural context.
 *
 * Usage:
 * ```typescript
 * const { prompt } = await buildPrompt('/path/to/project', 'src/core/db/', {
 *   model: 'haiku',
 *   task: 'Add a getById method to the repository',
 * });
 *
 * // Use with Task tool
 * await Task({
 *   description: 'Add getById method',
 *   model: 'haiku',
 *   prompt,
 *   subagent_type: 'general-purpose',
 * });
 * ```
 */
export async function buildPrompt(
  projectRoot: string,
  modulePath: string,
  options: PromptBuilderOptions
): Promise<BuildPromptResult | null> {
  const context = await synthesizeUnifiedContext(projectRoot, {
    module: modulePath,
    confirm: true,
    sections: ['boundaries', 'constraints', 'modification-order'],
  });

  if (!context?.module) {
    return null;
  }

  const compactContext = formatCompactContext(context.module);
  const prompt = assemblePrompt(compactContext, options);

  // Rough token estimate: ~4 chars per token
  const contextTokens = Math.ceil(compactContext.length / 4);

  return {
    prompt,
    contextTokens,
    modulePath: context.module.modulePath,
    archTag: context.module.archcodex.architecture,
  };
}

/**
 * Build prompts for multiple modules at once.
 * Useful for multi-module refactoring tasks.
 */
export async function buildMultiModulePrompt(
  projectRoot: string,
  modulePaths: string[],
  options: PromptBuilderOptions
): Promise<BuildPromptResult | null> {
  const contexts: string[] = [];
  let totalTokens = 0;
  const archTags: string[] = [];

  for (const modulePath of modulePaths) {
    const context = await synthesizeUnifiedContext(projectRoot, {
      module: modulePath,
      confirm: true,
      sections: ['boundaries', 'constraints'],
    });

    if (context?.module) {
      const compact = formatCompactContext(context.module);
      contexts.push(compact);
      totalTokens += Math.ceil(compact.length / 4);
      archTags.push(context.module.archcodex.architecture);
    }
  }

  if (contexts.length === 0) {
    return null;
  }

  const combinedContext = contexts.join('\n\n---\n\n');
  const prompt = assemblePrompt(combinedContext, options);

  return {
    prompt,
    contextTokens: totalTokens,
    modulePath: modulePaths.join(', '),
    archTag: archTags.join(', '),
  };
}

/**
 * Format module context in ultra-compact form (~100 tokens).
 * Optimized based on LLM evaluation findings.
 */
export function formatCompactContext(context: UnifiedModuleContext): string {
  const lines: string[] = [];

  // Header with @arch tags found in this module
  lines.push(`## Context: ${context.modulePath}`);
  lines.push('');

  // Collect unique @arch tags from all files
  const allFiles = [
    ...context.files.defines,
    ...context.files.implements,
    ...context.files.orchestrates,
  ];
  const archTags = [...new Set(allFiles.map(f => f.archId).filter(Boolean))];

  if (archTags.length === 1) {
    lines.push(`@arch: ${archTags[0]}`);
    lines.push('(Use this tag for new files in this module)');
  } else if (archTags.length > 1) {
    lines.push('@arch tags in this module:');
    for (const tag of archTags) {
      const files = allFiles.filter(f => f.archId === tag).map(f => f.path.split('/').pop());
      lines.push(`  ${tag} → ${files.slice(0, 3).join(', ')}${files.length > 3 ? '...' : ''}`);
    }
    lines.push('(Match tag to file purpose. Run: archcodex read <file> --format ai for detailed constraints)');
  } else {
    lines.push(`Architecture: ${context.archcodex.architecture}`);
  }

  // Layer boundaries (most critical for correctness)
  if (context.boundaries) {
    const can = context.boundaries.canImport.join(', ');
    const cannot = context.boundaries.cannotImport.join(', ');
    lines.push('');
    lines.push(`Layer: ${context.boundaries.layer}`);
    lines.push(`  CAN import from: [${can}]`);
    lines.push(`  CANNOT import from: [${cannot}] - will cause violations`);
  }

  // Forbidden imports/patterns (prevents violations)
  const forbidden: string[] = [];
  if (context.archcodex.forbid) {
    forbidden.push(...context.archcodex.forbid);
  }
  if (context.archcodex.patterns) {
    forbidden.push(...context.archcodex.patterns);
  }
  if (forbidden.length > 0) {
    lines.push('');
    lines.push('Forbidden (do not use these imports or patterns):');
    lines.push(`  ${forbidden.join(', ')}`);
  }

  // Required imports
  if (context.archcodex.require && context.archcodex.require.length > 0) {
    lines.push('');
    lines.push('Required (must import from these):');
    lines.push(`  ${context.archcodex.require.join(', ')}`);
  }

  // Modification order (compact)
  const orderParts: string[] = [];
  if (context.files.defines.length > 0) {
    const defines = context.files.defines.map(f => f.path.split('/').pop()).join(', ');
    orderParts.push(defines);
  }
  if (context.files.implements.length > 0) {
    const impls = context.files.implements.slice(0, 3).map(f => f.path.split('/').pop()).join(', ');
    orderParts.push(impls);
  }
  if (context.files.orchestrates.length > 0) {
    const orchs = context.files.orchestrates.map(f => f.path.split('/').pop()).join(', ');
    orderParts.push(orchs);
  }
  if (orderParts.length > 0) {
    lines.push('');
    lines.push('Modification order (change types/interfaces first, then implementations):');
    lines.push(`  ${orderParts.join(' → ')}`);
  }

  // Impact (if significant)
  if (context.consumers.length > 0) {
    lines.push('');
    lines.push(`Impact: ${context.consumers.length} files depend on this module - be careful with breaking changes`);
  }

  // Single most important hint
  if (context.archcodex.hints && context.archcodex.hints.length > 0) {
    lines.push('');
    lines.push(`Hint: ${context.archcodex.hints[0]}`);
  }

  // Tip for getting detailed file constraints
  lines.push('');
  lines.push('For detailed MUST/NEVER constraints on specific files:');
  lines.push('  archcodex read <file> --format ai');

  return lines.join('\n');
}

/**
 * Scope-specific instructions.
 */
const SCOPE_INSTRUCTIONS: Record<PromptScope, { focus: string; avoid: string }> = {
  'ui-only': {
    focus: 'Focus on UI components, styling, and visual presentation only.',
    avoid: 'Do NOT modify backend logic, API calls, or data schemas.',
  },
  'logic-only': {
    focus: 'Focus on business logic, hooks, and utilities only.',
    avoid: 'Do NOT modify UI components or data schemas.',
  },
  'data-only': {
    focus: 'Focus on data schemas, types, and database operations only.',
    avoid: 'Do NOT modify UI components or frontend logic.',
  },
  'full': {
    focus: 'This is a full-stack change spanning UI, logic, and data layers.',
    avoid: '',
  },
};

/**
 * Assemble the full prompt with context and task.
 */
function assemblePrompt(
  contextBlock: string,
  options: PromptBuilderOptions
): string {
  const {
    model = 'sonnet',
    task,
    requirements = [],
    includeValidation = true,
    outputMode = 'execute',
    scope,
  } = options;

  const lines: string[] = [];

  // Context section
  lines.push(contextBlock);
  lines.push('');

  // Task section with model-appropriate instructions
  if (model === 'haiku') {
    // Haiku needs explicit, mandatory language
    lines.push('---');
    lines.push('');
    lines.push('## Task (REQUIRED)');
    lines.push('');
    lines.push(task);
    lines.push('');

    // Scope instructions for Haiku
    if (scope) {
      const scopeInstr = SCOPE_INSTRUCTIONS[scope];
      lines.push(`SCOPE: ${scopeInstr.focus}`);
      if (scopeInstr.avoid) {
        lines.push(`DO NOT: ${scopeInstr.avoid}`);
      }
      lines.push('');
    }

    lines.push('## Requirements (MUST follow)');
    lines.push('');
    lines.push('1. New files MUST have an @arch tag (see Context for options, or check similar files)');
    lines.push('2. Follow layer boundaries - DO NOT import from "CANNOT import" layers');
    lines.push('3. NEVER use items in "Forbidden" list');
    for (let i = 0; i < requirements.length; i++) {
      lines.push(`${i + 4}. ${requirements[i]}`);
    }
  } else {
    // Opus/Sonnet can work with hints
    lines.push('---');
    lines.push('');
    lines.push('## Task');
    lines.push('');
    lines.push(task);

    // Scope instructions for Opus/Sonnet
    if (scope && scope !== 'full') {
      const scopeInstr = SCOPE_INSTRUCTIONS[scope];
      lines.push('');
      lines.push(`Scope: ${scopeInstr.focus} ${scopeInstr.avoid}`);
    } else if (scope === 'full') {
      lines.push('');
      lines.push(`Scope: ${SCOPE_INSTRUCTIONS.full.focus}`);
    }

    if (requirements.length > 0) {
      lines.push('');
      lines.push('Additional requirements:');
      for (const req of requirements) {
        lines.push(`- ${req}`);
      }
    }
  }

  // Output mode instruction
  if (outputMode === 'preview') {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('Do NOT write code to the filesystem. Show what code you WOULD write, including file paths.');
  }

  // Validation reminder
  if (includeValidation && outputMode === 'execute') {
    lines.push('');
    lines.push('---');
    if (model === 'haiku') {
      lines.push('After implementation, violations will be checked automatically.');
    } else {
      lines.push('The implementation will be validated against architectural constraints.');
    }
  }

  return lines.join('\n');
}

/**
 * Get just the compact context string (for manual prompt building).
 */
export async function getCompactContext(
  projectRoot: string,
  modulePath: string
): Promise<string | null> {
  const context = await synthesizeUnifiedContext(projectRoot, {
    module: modulePath,
    confirm: true,
    sections: ['boundaries', 'constraints', 'modification-order'],
  });

  if (!context?.module) {
    return null;
  }

  return formatCompactContext(context.module);
}
