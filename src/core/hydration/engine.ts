/**
 * @arch archcodex.core.engine
 * @intent:stateless
 */
import type { Registry } from '../registry/schema.js';
import type { Config } from '../config/schema.js';
import { resolveArchitecture } from '../registry/resolver.js';
import { parseArchTags } from '../arch-tag/parser.js';
import { readFile } from '../../utils/file-system.js';
import type { ResolvedConstraint, FlattenedArchitecture } from '../registry/types.js';
import type { OverrideTag, IntentAnnotation } from '../arch-tag/types.js';
import type {
  HydrationOptions,
  HydrationResult,
  HydrationFormat,
  TruncationDetails,
} from './types.js';
import {
  extractForbiddenConstraints,
  extractRequiredConstraints,
  formatConstraintValue,
  groupConstraintsBySeverity,
  estimateTokens,
  findPatternSuggestion,
  selectSharpHints,
} from './helpers.js';

/**
 * Default hydration options.
 */
const DEFAULT_OPTIONS: HydrationOptions = {
  format: 'verbose',
  tokenLimit: 4000,
  includePointers: true,
  includeContent: true,
};

/**
 * Hydration engine that generates context headers from @arch tags.
 */
export class HydrationEngine {
  // Config stored for future use (e.g., custom hydration settings)
  protected config: Config;
  private registry: Registry;

  constructor(config: Config, registry: Registry) {
    this.config = config;
    this.registry = registry;
  }

  /**
   * Hydrate a file with its architectural context.
   */
  async hydrateFile(
    filePath: string,
    options: Partial<HydrationOptions> = {}
  ): Promise<HydrationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const content = await readFile(filePath);
    const { archTag, overrides, intents } = parseArchTags(content);

    // If no @arch tag, return minimal result
    if (!archTag) {
      return this.createUntaggedResult(content, opts);
    }

    // Resolve the architecture (including inline mixins from @arch tag)
    const { architecture } = resolveArchitecture(this.registry, archTag.archId, {
      inlineMixins: archTag.inlineMixins,
    });

    // Generate the header
    const header = this.generateHeader(architecture, overrides, intents, opts.format, opts);

    // Estimate tokens and apply truncation if needed
    const { finalHeader, truncationDetails } = this.applyTruncation(
      header,
      architecture,
      overrides,
      opts
    );

    // Build output
    const output = opts.includeContent
      ? `${finalHeader}\n\n${content}`
      : finalHeader;

    const tokenCount = estimateTokens(output);

    return {
      header: finalHeader,
      content: opts.includeContent ? content : undefined,
      output,
      tokenCount,
      truncated: truncationDetails !== undefined,
      truncationDetails,
    };
  }

  /**
   * Generate a hydrated header from a flattened architecture.
   */
  private generateHeader(
    architecture: FlattenedArchitecture,
    overrides: OverrideTag[],
    intents: IntentAnnotation[],
    format: HydrationFormat,
    options?: HydrationOptions
  ): string {
    // AI format uses a completely different structure
    if (format === 'ai') {
      return this.generateAIHeader(architecture, overrides, intents, options);
    }

    const lines: string[] = [];

    // Opening delimiter
    lines.push('/*');
    lines.push(' * ═══════════════════════════════════════════════════════════════════');
    lines.push(` * ARCHITECTURE: ${architecture.archId}`);
    if (architecture.version) {
      lines.push(` * VERSION: ${architecture.version}`);
    }
    lines.push(' * ═══════════════════════════════════════════════════════════════════');

    // Deprecation warning (shown prominently at the top)
    if (architecture.deprecated_from) {
      lines.push(' *');
      lines.push(' * ⚠️  DEPRECATED ⚠️');
      lines.push(` *   This architecture has been deprecated since version ${architecture.deprecated_from}.`);
      if (architecture.migration_guide) {
        lines.push(` *   Migration guide: ${architecture.migration_guide}`);
      }
      lines.push(' *   Consider migrating to a newer architecture.');
    }

    // Description
    if (architecture.description) {
      lines.push(' *');
      lines.push(` * ${architecture.description}`);
    }

    // Contract
    if (architecture.contract) {
      lines.push(' *');
      lines.push(' * CONTRACT:');
      lines.push(` *   ${architecture.contract}`);
    }

    // Inheritance chain (verbose only)
    if (format === 'verbose' && architecture.inheritanceChain.length > 1) {
      lines.push(' *');
      lines.push(' * INHERITANCE:');
      lines.push(`  *   ${architecture.inheritanceChain.join(' → ')}`);
    }

    // Applied mixins (verbose only)
    if (format === 'verbose' && architecture.appliedMixins.length > 0) {
      lines.push(' *');
      lines.push(' * MIXINS:');
      for (const mixin of architecture.appliedMixins) {
        lines.push(`  *   - ${mixin}`);
      }
    }

    // Constraints
    if (architecture.constraints.length > 0) {
      lines.push(' *');
      lines.push(' * CONSTRAINTS:');

      const groupedConstraints = groupConstraintsBySeverity(architecture.constraints);

      // Errors first (critical)
      if (groupedConstraints.error.length > 0) {
        lines.push(' *   [MUST] Errors:');
        for (const constraint of groupedConstraints.error) {
          lines.push(...this.formatConstraint(constraint, format, '     '));
        }
      }

      // Warnings
      if (groupedConstraints.warning.length > 0) {
        lines.push(' *   [SHOULD] Warnings:');
        for (const constraint of groupedConstraints.warning) {
          lines.push(...this.formatConstraint(constraint, format, '     '));
        }
      }

      // Note: Info severity not currently supported in schema
      // If needed in the future, add it here
    }

    // Active overrides
    if (overrides.length > 0) {
      lines.push(' *');
      lines.push(' * ACTIVE OVERRIDES:');
      for (const override of overrides) {
        lines.push(`  *   - ${override.rule}:${override.value}`);
        if (override.reason) {
          lines.push(`  *     Reason: ${override.reason}`);
        }
        if (override.expires) {
          lines.push(`  *     Expires: ${override.expires}`);
        }
      }
    }

    // Semantic intents
    if (intents.length > 0) {
      lines.push(' *');
      lines.push(' * INTENTS:');
      for (const intent of intents) {
        lines.push(` *   🎯 @intent:${intent.name}`);
      }
    }

    // Hints
    if (architecture.hints.length > 0) {
      lines.push(' *');
      lines.push(' * HINTS:');
      for (const hint of architecture.hints) {
        lines.push(` *   • ${hint.text}`);
        if (hint.example) {
          lines.push(` *     Example: ${hint.example}`);
        }
      }
    }

    // Pointers (verbose only)
    if (format === 'verbose' && architecture.pointers.length > 0) {
      lines.push(' *');
      lines.push(' * DOCUMENTATION:');
      for (const pointer of architecture.pointers) {
        lines.push(`  *   📖 ${pointer.label}: ${pointer.uri}`);
      }
    }

    // Closing delimiter
    lines.push(' * ═══════════════════════════════════════════════════════════════════');
    lines.push(' */');

    return lines.join('\n');
  }

  /**
   * Format a single constraint for the header.
   */
  private formatConstraint(
    constraint: ResolvedConstraint,
    format: HydrationFormat,
    indent: string
  ): string[] {
    const lines: string[] = [];
    const value = Array.isArray(constraint.value)
      ? constraint.value.join(', ')
      : String(constraint.value);

    lines.push(` *${indent}${constraint.rule}: ${value}`);

    if (format === 'verbose') {
      if (constraint.why) {
        lines.push(` *${indent}  ↳ ${constraint.why}`);
      }
      if (constraint.source !== constraint.rule) {
        lines.push(` *${indent}  (from: ${constraint.source})`);
      }
    }

    return lines;
  }

  
  /**
   * Apply token-limit truncation with priority-based removal.
   */
  private applyTruncation(
    header: string,
    architecture: FlattenedArchitecture,
    overrides: OverrideTag[],
    options: HydrationOptions
  ): { finalHeader: string; truncationDetails?: TruncationDetails } {
    const originalTokens = estimateTokens(header);

    // If under limit, no truncation needed
    if (originalTokens <= options.tokenLimit) {
      return { finalHeader: header };
    }

    // Priority-based truncation
    // 1. Never truncate: constraints (especially forbid_* rules)
    // 2. Truncate last: warnings and errors
    // 3. Truncate as needed: hints
    // 4. Truncate first: pointers, verbose details

    let truncatedArch = { ...architecture };
    let truncationDetails: TruncationDetails = {
      hintsTruncated: false,
      pointersTruncated: false,
      constraintsTruncated: false,
      originalTokens,
      finalTokens: originalTokens,
    };

    // Try removing pointers first
    if (truncatedArch.pointers.length > 0) {
      truncatedArch = { ...truncatedArch, pointers: [] };
      truncationDetails.pointersTruncated = true;

      const newHeader = this.generateHeader(truncatedArch, overrides, [], 'terse');
      const newTokens = estimateTokens(newHeader);

      if (newTokens <= options.tokenLimit) {
        truncationDetails.finalTokens = newTokens;
        return { finalHeader: newHeader, truncationDetails };
      }
    }

    // Try removing hints
    if (truncatedArch.hints.length > 0) {
      truncatedArch = { ...truncatedArch, hints: [] };
      truncationDetails.hintsTruncated = true;

      const newHeader = this.generateHeader(truncatedArch, overrides, [], 'terse');
      const newTokens = estimateTokens(newHeader);

      truncationDetails.finalTokens = newTokens;
      return { finalHeader: newHeader, truncationDetails };
    }

    // If still over limit, use terse format
    const terseHeader = this.generateHeader(truncatedArch, overrides, [], 'terse');
    truncationDetails.finalTokens = estimateTokens(terseHeader);

    return { finalHeader: terseHeader, truncationDetails };
  }

  
  /**
   * Create result for untagged file.
   */
  private createUntaggedResult(
    content: string,
    options: HydrationOptions
  ): HydrationResult {
    const header = `/*
 * ═══════════════════════════════════════════════════════════════════
 * NO ARCHITECTURE DEFINED
 * ═══════════════════════════════════════════════════════════════════
 * This file has no @arch tag. Add one to enable architectural validation.
 * Example: @arch domain.service
 */`;

    const output = options.includeContent ? `${header}\n\n${content}` : header;

    return {
      header,
      content: options.includeContent ? content : undefined,
      output,
      tokenCount: estimateTokens(output),
      truncated: false,
    };
  }

  /**
   * Generate lean AI-optimized header format.
   * Token-budgeted, action-shaped context.
   * Optimized for LLM comprehension with clear patterns and reduced choice paralysis.
   */
  private generateAIHeader(
    architecture: FlattenedArchitecture,
    overrides: OverrideTag[],
    intents: IntentAnnotation[],
    options?: HydrationOptions
  ): string {
    const lines: string[] = [];

    // 1. Architecture ID + description (compact)
    lines.push(`ARCH: ${architecture.archId}`);
    if (architecture.description) {
      lines.push(architecture.description);
    }
    lines.push('');

    // 2. Deprecation warning (if any)
    if (architecture.deprecated_from) {
      lines.push(`⚠️ DEPRECATED since ${architecture.deprecated_from}`);
      if (architecture.migration_guide) {
        lines.push(`   Migration: ${architecture.migration_guide}`);
      }
      lines.push('');
    }

    // 3. PATTERN section (if code_pattern is defined) - show expected structure first
    if (architecture.code_pattern) {
      lines.push('PATTERN:');
      // Indent each line of the pattern
      for (const line of architecture.code_pattern.split('\n')) {
        lines.push(`  ${line}`);
      }
      lines.push('');
    }

    // 4. MUST section (required constraints) - what you MUST do
    const required = extractRequiredConstraints(architecture.constraints);
    if (required.length > 0) {
      lines.push('MUST:');
      for (const c of required) {
        const value = formatConstraintValue(c.value);
        const ruleDisplay = this.formatRuleForAI(c.rule);
        lines.push(`  ✓ ${ruleDisplay}: ${value}`);

        // Show intent if available (LLM-friendly description)
        if (c.intent) {
          lines.push(`      Intent: ${c.intent}`);
        }
        // Show usage map if available (reduces choice paralysis)
        if (c.usage && Object.keys(c.usage).length > 0) {
          for (const [context, usage] of Object.entries(c.usage)) {
            lines.push(`      ${context} → ${usage}`);
          }
        } else if (c.why) {
          lines.push(`      ${c.why}`);
        }
        // Show examples if available (LLM context)
        if (c.examples && c.examples.length > 0) {
          lines.push(`      Valid: ${c.examples.join(', ')}`);
        }
        if (c.codeExample) {
          lines.push(`      Example: ${c.codeExample}`);
        }
      }
      lines.push('');
    }

    // 5. NEVER section (forbidden constraints) - what you must NOT do
    const forbidden = extractForbiddenConstraints(architecture.constraints);
    if (forbidden.length > 0) {
      lines.push('NEVER:');
      for (const c of forbidden) {
        const value = formatConstraintValue(c.value);
        const ruleDisplay = this.formatRuleForAI(c.rule);
        lines.push(`  ✗ ${ruleDisplay}: ${value}`);

        // Show intent if available (LLM-friendly description)
        if (c.intent) {
          lines.push(`      Intent: ${c.intent}`);
        }

        // Add "Use: X" from pattern registry or alternatives
        const suggestion = findPatternSuggestion(c, options?.patternRegistry);
        if (suggestion) {
          lines.push(`      → Use: ${suggestion.file} (${suggestion.export})`);
        } else if (c.alternative) {
          lines.push(`      → Use: ${c.alternative}`);
        } else if (c.why) {
          lines.push(`      → ${c.why}`);
        }

        // Show counterexamples if available (what to avoid)
        if (c.counterexamples && c.counterexamples.length > 0) {
          lines.push(`      Avoid: ${c.counterexamples.join(', ')}`);
        }
      }
      lines.push('');
    }

    // 6. BOUNDARIES section - layer boundaries and forbidden modules
    const forbiddenModules = forbidden
      .filter(c => c.rule === 'forbid_import')
      .flatMap(c => Array.isArray(c.value) ? c.value : [String(c.value)]);

    if (options?.boundaries || forbiddenModules.length > 0) {
      lines.push('BOUNDARIES:');
      if (options?.boundaries?.layer) {
        lines.push(`  layer: ${options.boundaries.layer}`);
      }
      if (options?.boundaries?.importedByCount !== undefined) {
        lines.push(`  imported_by: ${options.boundaries.importedByCount} file(s)`);
      }
      if (options?.boundaries?.canImport?.length) {
        lines.push(`  CAN import from: [${options.boundaries.canImport.join(', ')}]`);
      }
      if (options?.boundaries?.cannotImport?.length) {
        lines.push(`  CANNOT import from: [${options.boundaries.cannotImport.join(', ')}]`);
      }
      if (forbiddenModules.length > 0) {
        lines.push(`  Forbidden: [${forbiddenModules.join(', ')}]`);
      }
      lines.push('');
    }

    // 7. Active overrides (compact)
    if (overrides.length > 0) {
      lines.push('OVERRIDES:');
      for (const override of overrides) {
        lines.push(`  ⟳ ${override.rule}:${override.value} (${override.reason || 'no reason'})`);
      }
      lines.push('');
    }

    // 8. Semantic intents (constraint pattern annotations)
    if (intents.length > 0) {
      lines.push('INTENTS:');
      for (const intent of intents) {
        lines.push(`  🎯 @intent:${intent.name}`);
      }
      lines.push('');
    }

    // 8b. Intent options (expected + suggested from architecture)
    const declaredIntentNames = new Set(intents.map(i => i.name));
    const hasExpected = architecture.expected_intents?.length;
    const hasSuggested = architecture.suggested_intents?.length;
    if (hasExpected || hasSuggested) {
      lines.push('INTENT OPTIONS:');
      // Show expected intents (required)
      if (hasExpected) {
        for (const name of architecture.expected_intents!) {
          const status = declaredIntentNames.has(name) ? '✓' : '⚠ MISSING';
          lines.push(`  ${status} @intent:${name} (required)`);
        }
      }
      // Show suggested intents (optional with guidance)
      if (hasSuggested) {
        for (const { name, when } of architecture.suggested_intents!) {
          if (!declaredIntentNames.has(name)) {
            lines.push(`  + @intent:${name}`);
            lines.push(`      When: ${when}`);
          }
        }
      }
      lines.push('');
    }

    // 9. HINTS with inline examples (max 5, architecture-specific only)
    const sharpHints = selectSharpHints(architecture.hints, 5);
    if (sharpHints.length > 0) {
      lines.push('HINTS:');
      sharpHints.forEach((hint, i) => {
        lines.push(`  ${i + 1}. ${hint.text}`);
        if (hint.example) {
          lines.push(`     Example: ${hint.example}`);
        }
      });
      lines.push('');
    }

    // 10. POINTERS (max 2)
    const topPointers = architecture.pointers?.slice(0, 2) || [];
    if (topPointers.length > 0) {
      lines.push('SEE:');
      for (const p of topPointers) {
        lines.push(`  → ${p.uri} (${p.label || 'reference'})`);
      }
    }

    return lines.join('\n').trim();
  }

  /**
   * Format constraint rule name for AI readability.
   */
  private formatRuleForAI(rule: string): string {
    // Make rules more readable
    const ruleMap: Record<string, string> = {
      'require_import': 'Import',
      'require_call': 'Call',
      'require_call_before': 'Call before',
      'require_decorator': 'Decorator',
      'require_test_file': 'Test file',
      'require_pattern': 'Pattern',
      'require_export': 'Export',
      'forbid_import': 'Import',
      'forbid_call': 'Call',
      'forbid_decorator': 'Decorator',
      'forbid_mutation': 'Mutate',
      'max_file_lines': 'Max lines',
      'max_public_methods': 'Max methods',
      'must_extend': 'Extend',
      'implements': 'Implement',
    };
    return ruleMap[rule] || rule;
  }
}
