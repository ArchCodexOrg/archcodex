/**
 * @arch archcodex.core.engine
 */
import * as path from 'node:path';
import os from 'node:os';
import type { Config } from '../config/schema.js';
import type { Registry, IntentRegistry, ConstraintRule } from '../registry/schema.js';
import { resolveArchitecture } from '../registry/resolver.js';
import { parseArchTags, validateOverride } from '../arch-tag/parser.js';
import { getValidator } from '../constraints/index.js';
import {
  validatorRegistry,
  type ILanguageValidator,
} from '../../validators/validator-registry.js';
import { TypeScriptValidator } from '../../validators/typescript.js';
import { TYPESCRIPT_CAPABILITIES } from '../../validators/capabilities.js';
import { readFile, basename } from '../../utils/file-system.js';
import type {
  ValidationResult,
  ValidationOptions,
  BatchValidationResult,
  ActiveOverride,
} from './types.js';
import type { Violation, ConstraintContext } from '../constraints/types.js';
import { evaluateCondition, hasCondition } from '../constraints/condition-evaluator.js';
import type { OverrideTag, IntentAnnotation } from '../arch-tag/types.js';
import type { PatternRegistry } from '../patterns/types.js';
import { stringSimilarity } from '../../utils/pattern-matcher.js';

// Register the TypeScript validator on module load
validatorRegistry.register('typescript', () => new TypeScriptValidator(),
  ['typescript', 'javascript'], ['.ts', '.tsx', '.js', '.jsx'], TYPESCRIPT_CAPABILITIES);

/** Validation engine that orchestrates constraint checking. */
export class ValidationEngine {
  private config: Config;
  private registry: Registry;
  private projectRoot: string;
  private patternRegistry?: PatternRegistry;
  private intentRegistry?: IntentRegistry;
  /** Shared content cache from ProjectAnalyzer to avoid duplicate file reads */
  private contentCache?: Map<string, string>;

  constructor(projectRoot: string, config: Config, registry: Registry, patternRegistry?: PatternRegistry, intentRegistry?: IntentRegistry) {
    this.projectRoot = projectRoot;
    this.config = config;
    this.registry = registry;
    this.patternRegistry = patternRegistry;
    this.intentRegistry = intentRegistry;
  }

  /**
   * Set the intent registry for validation.
   */
  setIntentRegistry(intentRegistry: IntentRegistry): void {
    this.intentRegistry = intentRegistry;
  }

  /**
   * Set a shared content cache from ProjectAnalyzer.
   * This avoids reading files that were already read during import graph building.
   */
  setContentCache(cache: Map<string, string>): void {
    this.contentCache = cache;
  }

  /**
   * Get file content from cache or read from disk.
   */
  private async getFileContent(filePath: string): Promise<string> {
    if (this.contentCache?.has(filePath)) {
      return this.contentCache.get(filePath)!;
    }
    const content = await readFile(filePath);
    // Store in cache if available
    if (this.contentCache) {
      this.contentCache.set(filePath, content);
    }
    return content;
  }

  private getValidatorForFile(filePath: string): ILanguageValidator | null {
    return validatorRegistry.getForExtension(path.extname(filePath).toLowerCase());
  }

  /** Validate a single file. */
  async validateFile(
    filePath: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const startTime = performance.now();
    const timing = { parseMs: 0, resolutionMs: 0, validationMs: 0, totalMs: 0 };

    // Phase 1: Parse file and extract tags
    const parseStart = performance.now();
    const absolutePath = path.resolve(this.projectRoot, filePath);
    const content = await this.getFileContent(absolutePath);
    const { archTag, overrides, intents } = parseArchTags(content);

    // Get the appropriate validator for this file type
    const validator = this.getValidatorForFile(absolutePath);
    if (!validator) {
      // No validator for this file type - skip validation
      timing.parseMs = performance.now() - parseStart;
      return this.createSkippedResult(filePath, timing, startTime);
    }

    // Parse the file into SemanticModel (pass content to avoid re-reading)
    const parsedFile = await validator.parseFile(absolutePath, content);
    timing.parseMs = performance.now() - parseStart;

    // If no @arch tag, return early with appropriate result
    if (!archTag) {
      return this.createUntaggedResult(filePath, timing, startTime);
    }

    // Phase 2: Resolve architecture
    const resolveStart = performance.now();
    let resolution;
    try {
      resolution = resolveArchitecture(this.registry, archTag.archId, {
        inlineMixins: archTag.inlineMixins,
      });
    } catch (error) {
      // Architecture not found
      return this.createErrorResult(
        filePath,
        archTag.archId,
        error instanceof Error ? error.message : 'Unknown error',
        timing,
        startTime
      );
    }
    timing.resolutionMs = performance.now() - resolveStart;

    const { architecture, conflicts } = resolution;

    // Phase 3: Validate constraints
    const validationStart = performance.now();
    const allViolations: Violation[] = [];

    // Add inline mixin governance violations
    for (const conflict of conflicts) {
      if (conflict.rule === 'mixin_inline_forbidden' || conflict.rule === 'mixin_inline_only') {
        allViolations.push({
          code: 'E027',
          rule: conflict.rule,
          value: conflict.value,
          severity: 'warning',
          line: archTag.line,
          column: archTag.column,
          message: conflict.resolution,
          source: conflict.loser,
        });
      }
    }

    // Check for missing expected intents
    if (architecture.expected_intents?.length) {
      const declaredIntentNames = new Set(intents.map(i => i.name));
      for (const expectedIntent of architecture.expected_intents) {
        if (!declaredIntentNames.has(expectedIntent)) {
          allViolations.push({
            code: 'E028',
            rule: 'missing_expected_intent',
            value: expectedIntent,
            severity: 'warning',
            line: archTag.line,
            column: archTag.column,
            message: `Architecture '${archTag.archId}' expects @intent:${expectedIntent} but file lacks it`,
            source: archTag.archId,
            fixHint: `Add @intent:${expectedIntent} to the file header`,
          });
        }
      }
    }

    const context: ConstraintContext = {
      filePath: absolutePath,
      fileName: basename(absolutePath),
      parsedFile,
      archId: archTag.archId,
      constraintSource: archTag.archId,
      patternRegistry: this.patternRegistry,
      intents,
      intentRegistry: this.intentRegistry,
      config: {
        table_detection: this.config.table_detection,
      },
    };

    // Check for undefined intents and add warnings/errors based on config
    const undefinedIntentWarnings = this.checkUndefinedIntents(intents, filePath);

    for (const constraint of architecture.constraints) {
      // Skip if rule is excluded
      if (options.skipRules?.includes(constraint.rule)) {
        continue;
      }

      // Skip if severity doesn't match filter
      if (options.severities && !options.severities.includes(constraint.severity)) {
        continue;
      }

      // Check for missing 'why' on forbid_* rules
      const missingWhyBehavior = this.config.validation.missing_why ?? 'ignore';
      if (missingWhyBehavior !== 'ignore' && constraint.rule.startsWith('forbid_') && !constraint.why) {
        allViolations.push({
          code: 'C001',
          rule: 'missing_why',
          value: `${constraint.rule}:${Array.isArray(constraint.value) ? constraint.value.join(',') : constraint.value}`,
          severity: missingWhyBehavior === 'error' ? 'error' : 'warning',
          line: archTag.line,
          column: archTag.column,
          message: `Constraint '${constraint.rule}' is missing 'why' field - explain why this is forbidden`,
          source: constraint.source,
          fixHint: `Add 'why: "explanation"' to the ${constraint.rule} constraint in the registry`,
        });
      }

      // Check applies_when - constraint only applies if pattern matches file content
      if (constraint.applies_when) {
        try {
          const pattern = new RegExp(constraint.applies_when, 's');
          if (!pattern.test(content)) {
            // Pattern not found, skip this constraint
            continue;
          }
        } catch {
          // Invalid regex, skip (should we warn?)
          continue;
        }
      }

      // Check unless - constraint is skipped if any exception condition is met
      if (constraint.unless && constraint.unless.length > 0) {
        const shouldSkip = constraint.unless.some(exception => {
          return checkUnlessCondition(exception, parsedFile, intents);
        });
        if (shouldSkip) {
          continue;
        }
      }

      // Check conditional constraint (when clause)
      if (hasCondition(constraint.when)) {
        const conditionResult = evaluateCondition(constraint.when!, {
          parsedFile,
          filePath: absolutePath,
        });
        if (!conditionResult.satisfied) {
          // Condition not met, skip this constraint
          continue;
        }
      }

      const validator = getValidator(constraint.rule);
      if (!validator) {
        // No validator for this rule - skip
        continue;
      }

      // Update context with constraint source
      context.constraintSource = constraint.source;

      const result = validator.validate(constraint, context);
      allViolations.push(...result.violations);
    }

    // Add undefined intent warnings/errors
    allViolations.push(...undefinedIntentWarnings);
    timing.validationMs = performance.now() - validationStart;

    // Phase 4: Apply overrides
    const { violations, warnings, activeOverrides } = this.applyOverrides(
      allViolations,
      overrides
    );

    // Apply strict mode if enabled
    const finalViolations = options.strict
      ? [...violations, ...warnings]
      : violations;
    const finalWarnings = options.strict ? [] : warnings;

    timing.totalMs = performance.now() - startTime;

    // Determine status
    let status: 'pass' | 'fail' | 'warn';
    if (finalViolations.length > 0) {
      status = 'fail';
    } else if (finalWarnings.length > 0) {
      status = 'warn';
    } else {
      status = 'pass';
    }

    return {
      status,
      file: filePath,
      archId: archTag.archId,
      inheritanceChain: architecture.inheritanceChain,
      mixinsApplied: architecture.appliedMixins,
      violations: finalViolations,
      warnings: finalWarnings,
      overridesActive: activeOverrides,
      passed: finalViolations.length === 0,
      errorCount: finalViolations.length,
      warningCount: finalWarnings.length,
      timing,
    };
  }

  /** Validate multiple files. */
  async validateFiles(
    filePaths: string[],
    options: ValidationOptions = {}
  ): Promise<BatchValidationResult> {
    const results: ValidationResult[] = [];

    // Process files with concurrency limit using Promise.allSettled
    // to ensure one file failure doesn't break the entire batch
    // Use configured concurrency, or default to 75% of available CPUs (min 2, max 16)
    const CONCURRENCY = this.config.validation.concurrency ??
      Math.min(Math.max(Math.floor(os.cpus().length * 0.75), 2), 16);
    for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
      const batch = filePaths.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((fp) => this.validateFile(fp, options))
      );

      // Process results, converting rejected promises to error results
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Create error result for failed validation
          results.push({
            status: 'fail',
            file: batch[j],
            archId: null,
            inheritanceChain: [],
            mixinsApplied: [],
            violations: [{
              code: 'S999',
              rule: 'internal_error',
              value: batch[j],
              severity: 'error',
              line: null,
              column: null,
              message: `Validation failed: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`,
              source: 'engine',
            }],
            warnings: [],
            overridesActive: [],
            passed: false,
            errorCount: 1,
            warningCount: 0,
            timing: { parseMs: 0, resolutionMs: 0, validationMs: 0, totalMs: 0 },
          });
        }
      }
    }

    // Check for singleton violations (architectures marked singleton: true used by multiple files)
    this.checkSingletonViolations(results);

    // Build summary
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === 'pass').length,
      failed: results.filter((r) => r.status === 'fail').length,
      warned: results.filter((r) => r.status === 'warn').length,
      totalErrors: results.reduce((sum, r) => sum + r.errorCount, 0),
      totalWarnings: results.reduce((sum, r) => sum + r.warningCount, 0),
      activeOverrides: results.reduce(
        (sum, r) => sum + r.overridesActive.length,
        0
      ),
    };

    return { results, summary };
  }

  /**
   * Check for singleton architecture violations.
   * Adds violations to results for files using singleton architectures that are used by multiple files.
   */
  private checkSingletonViolations(results: ValidationResult[]): void {
    // Build map of archId -> files using it
    const filesByArch = new Map<string, string[]>();
    for (const result of results) {
      if (!result.archId) continue;
      const files = filesByArch.get(result.archId) || [];
      files.push(result.file);
      filesByArch.set(result.archId, files);
    }

    // Check for singleton violations
    for (const [archId, files] of filesByArch) {
      const node = this.registry.nodes[archId];
      if (!node?.singleton || files.length <= 1) continue;

      // Add violation to each file using this singleton architecture
      const otherFiles = files.map(f => path.basename(f)).join(', ');
      for (const file of files) {
        const result = results.find(r => r.file === file);
        if (!result) continue;

        const violation: Violation = {
          code: 'E027',
          rule: 'singleton_violation',
          value: archId,
          severity: 'error',
          line: 1,
          column: 1,
          message: `Architecture '${archId}' is marked singleton but is used by ${files.length} files: ${otherFiles}`,
          source: 'engine',
        };

        result.violations.push(violation);
        result.errorCount++;
        result.passed = false;
        result.status = 'fail';
      }
    }
  }

  /** Apply overrides to violations. */
  private applyOverrides(
    allViolations: Violation[],
    overrides: OverrideTag[]
  ): {
    violations: Violation[];
    warnings: Violation[];
    activeOverrides: ActiveOverride[];
  } {
    const activeOverrides: ActiveOverride[] = [];
    const violations: Violation[] = [];
    const warnings: Violation[] = [];

    // Validate and collect valid overrides
    const validOverrides: OverrideTag[] = [];
    for (const override of overrides) {
      const validation = validateOverride(override, {
        requiredFields: this.config.overrides.required_fields,
        warnNoExpiry: this.config.overrides.warn_no_expiry,
        maxExpiryDays: this.config.overrides.max_expiry_days,
        failOnExpired: this.config.validation.fail_on_expired_override,
      });

      if (validation.valid) {
        validOverrides.push(override);

        activeOverrides.push({
          rule: override.rule,
          value: override.value,
          reason: override.reason || '',
          expires: override.expires,
          ticket: override.ticket,
          approvedBy: override.approvedBy,
          warning: validation.warnings.length > 0
            ? validation.warnings.join('; ')
            : undefined,
        });
      } else {
        // Add override errors as violations
        for (const error of validation.errors) {
          violations.push({
            code: 'O003',
            rule: override.rule as ConstraintRule,
            value: override.value,
            severity: 'error',
            line: override.line,
            column: null,
            message: error,
            source: 'override',
          });
        }
      }
    }

    // Check override limit
    if (overrides.length > this.config.validation.max_overrides_per_file) {
      violations.push({
        code: 'O005',
        rule: 'override_limit',
        value: overrides.length,
        severity: 'error',
        line: null,
        column: null,
        message: `File has ${overrides.length} overrides, maximum is ${this.config.validation.max_overrides_per_file}`,
        source: 'config',
      });
    }

    // Apply overrides to violations
    for (const violation of allViolations) {
      const matchingOverride = this.findMatchingOverride(violation, validOverrides);

      if (matchingOverride) {
        // Overridden violations are tracked in activeOverrides, not counted as warnings
        // They're legitimate exceptions that shouldn't affect the warning count
      } else if (violation.severity === 'error') {
        violations.push(violation);
      } else {
        warnings.push(violation);
      }
    }

    return { violations, warnings, activeOverrides };
  }

  /** Find an override that matches a violation (handles array-valued constraints). */
  private findMatchingOverride(
    violation: Violation,
    overrides: OverrideTag[]
  ): OverrideTag | undefined {
    for (const override of overrides) {
      // Rule must match
      if (override.rule !== violation.rule) {
        continue;
      }

      // Wildcard override matches any value
      if (override.value === '*') {
        return override;
      }

      // Check if violation message contains the specific overridden value
      // This handles cases like:
      // - Override: forbid_import:express
      // - Violation: Import 'express' is forbidden (from array constraint)
      if (violation.message.includes(`'${override.value}'`)) {
        return override;
      }

      // Direct value match (handles string or single-value cases)
      const violationValue = Array.isArray(violation.value)
        ? violation.value.join(',')
        : String(violation.value);

      if (violationValue === override.value) {
        return override;
      }

      // Check if override value is in the array
      if (Array.isArray(violation.value)) {
        if (violation.value.includes(override.value)) {
          return override;
        }
      }
    }

    return undefined;
  }

  /** Create result for untagged file. */
  private createUntaggedResult(
    filePath: string, timing: { parseMs: number; resolutionMs: number; validationMs: number; totalMs: number }, startTime: number
  ): ValidationResult {
    timing.totalMs = performance.now() - startTime;
    const policy = this.config.files.untagged.policy;
    const base = { file: filePath, archId: null, inheritanceChain: [], mixinsApplied: [], overridesActive: [], timing };
    // Build helpful message based on file type
    const hint = getUntaggedHint(filePath);

    if (policy === 'deny') {
      return { ...base, status: 'fail', violations: [{
        code: 'S001', rule: 'naming_pattern' , value: '@arch', severity: 'error',
        line: null, column: null, message: `Missing @arch tag. ${hint}`, source: 'config',
      }], warnings: [], passed: false, errorCount: 1, warningCount: 0 };
    }
    if (policy === 'warn') {
      return { ...base, status: 'warn', violations: [], warnings: [{
        code: 'S001', rule: 'naming_pattern' , value: '@arch', severity: 'warning',
        line: null, column: null, message: `Missing @arch tag. ${hint}`, source: 'config',
      }], passed: true, errorCount: 0, warningCount: 1 };
    }
    return { ...base, status: 'pass', violations: [], warnings: [], passed: true, errorCount: 0, warningCount: 0 };
  }

  /** Create error result for architecture resolution failure. */
  private createErrorResult(
    filePath: string, archId: string, errorMessage: string,
    timing: { parseMs: number; resolutionMs: number; validationMs: number; totalMs: number }, startTime: number
  ): ValidationResult {
    timing.totalMs = performance.now() - startTime;
    return {
      status: 'fail', file: filePath, archId, inheritanceChain: [], mixinsApplied: [],
      violations: [{ code: 'S002', rule: 'naming_pattern' , value: archId, severity: 'error',
        line: null, column: null, message: errorMessage, source: 'registry' }],
      warnings: [], overridesActive: [], passed: false, errorCount: 1, warningCount: 0, timing,
    };
  }

  /** Create result for files with no registered validator. */
  private createSkippedResult(
    filePath: string, timing: { parseMs: number; resolutionMs: number; validationMs: number; totalMs: number }, startTime: number
  ): ValidationResult {
    timing.totalMs = performance.now() - startTime;
    return {
      status: 'pass', file: filePath, archId: null, inheritanceChain: [], mixinsApplied: [],
      violations: [], warnings: [], overridesActive: [], passed: true, errorCount: 0, warningCount: 0,
      timing, skipped: true, skipReason: 'No validator registered for this file type',
    };
  }

  /**
   * Check for undefined intents and return violations based on config.
   */
  private checkUndefinedIntents(
    intents: IntentAnnotation[],
    _filePath: string
  ): Violation[] {
    const violations: Violation[] = [];
    const behavior = this.config.intents?.undefined_intent ?? 'warning';

    // If behavior is 'ignore', skip checking
    if (behavior === 'ignore' || !this.intentRegistry) {
      return violations;
    }

    for (const intent of intents) {
      if (!(intent.name in this.intentRegistry.intents)) {
        // Find similar intents for suggestion
        const similarIntents = this.findSimilarIntents(intent.name);
        const suggestion = similarIntents.length > 0
          ? ` Did you mean: ${similarIntents.join(', ')}?`
          : ' Define it in .arch/registry/_intents.yaml';

        violations.push({
          code: 'I001',
          rule: 'verify_intent' ,
          value: intent.name,
          severity: behavior === 'error' ? 'error' : 'warning',
          line: intent.line,
          column: intent.column,
          message: `Unknown intent '@intent:${intent.name}'.${suggestion}`,
          source: 'intent-registry',
        });
      }
    }

    return violations;
  }

  /** Cache for similarity computations. */
  private similarityCache = new Map<string, number>();

  /**
   * Find similar intent names using Levenshtein distance.
   */
  private findSimilarIntents(name: string): string[] {
    if (!this.intentRegistry) return [];

    const definedIntents = Object.keys(this.intentRegistry.intents);
    const scored: Array<{ name: string; score: number }> = [];

    for (const defined of definedIntents) {
      // Substring match gets high priority
      if (defined.includes(name) || name.includes(defined)) {
        scored.push({ name: defined, score: 0.8 });
        continue;
      }

      // Use Levenshtein-based similarity (threshold: 0.5)
      const similarity = this.getSimilarity(name, defined);
      if (similarity > 0.5) {
        scored.push({ name: defined, score: similarity });
      }
    }

    // Sort by score descending and return top 3
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.name);
  }

  /**
   * Get cached similarity score between two strings.
   */
  private getSimilarity(a: string, b: string): number {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (this.similarityCache.has(key)) {
      return this.similarityCache.get(key)!;
    }

    const score = stringSimilarity(a, b);
    this.similarityCache.set(key, score);
    return score;
  }

  /** Dispose resources. */
  dispose(): void { validatorRegistry.disposeAll(); }
}

/**
 * Get a helpful hint for untagged files based on file path patterns.
 * Suggests .archignore for files that typically shouldn't need @arch tags.
 */
function getUntaggedHint(filePath: string): string {
  const lowerPath = filePath.toLowerCase();

  // Public assets / static files
  if (lowerPath.includes('/public/') || lowerPath.startsWith('public/')) {
    return 'Public assets typically belong in .archignore';
  }

  // Web workers
  if (lowerPath.includes('worker.') || lowerPath.endsWith('worker.js') || lowerPath.endsWith('worker.ts')) {
    return 'Worker files may need .archignore if they have special bundling';
  }

  // Bookmarklets / browser scripts
  if (lowerPath.includes('bookmarklet')) {
    return 'Bookmarklet files typically belong in .archignore';
  }

  // Generated / build output
  if (lowerPath.includes('/generated/') || lowerPath.includes('.generated.') || lowerPath.includes('/dist/')) {
    return 'Generated files should be in .archignore';
  }

  // Config files at root
  if (!lowerPath.includes('/') && (lowerPath.endsWith('.config.ts') || lowerPath.endsWith('.config.js'))) {
    return 'Config files may belong in .archignore or need @arch tag';
  }

  // Default: show supported comment formats
  return 'Use /** @arch domain.name */ or // @arch domain.name, or add to .archignore';
}

/**
 * Check if an "unless" condition is met.
 * Supported formats:
 * - "import:moduleName" - file imports this module
 * - "@intent:name" - file has this @intent annotation
 * - "decorator:@Name" - file uses this decorator
 * - Plain string - treated as import (backwards compatibility)
 */
function checkUnlessCondition(
  exception: string,
  parsedFile: { imports: Array<{ moduleSpecifier: string }>; decorators?: Array<{ name: string }> },
  intents: IntentAnnotation[]
): boolean {
  // Check for @intent: prefix
  if (exception.startsWith('@intent:')) {
    const intentName = exception.slice(8).toLowerCase();
    return intents.some(i => i.name.toLowerCase() === intentName);
  }

  // Check for decorator: prefix
  if (exception.startsWith('decorator:')) {
    const decoratorName = exception.slice(10);
    // Handle both @Decorator and Decorator formats
    const normalized = decoratorName.startsWith('@') ? decoratorName.slice(1) : decoratorName;
    return parsedFile.decorators?.some(d => {
      const dName = d.name.startsWith('@') ? d.name.slice(1) : d.name;
      return dName === normalized;
    }) ?? false;
  }

  // Check for import: prefix or plain string (backwards compatibility)
  const moduleName = exception.startsWith('import:') ? exception.slice(7) : exception;
  return parsedFile.imports.some(imp => {
    // Check if import source contains or matches the module name
    return imp.moduleSpecifier === moduleName ||
           imp.moduleSpecifier.includes(moduleName) ||
           imp.moduleSpecifier.endsWith(`/${moduleName}`);
  });
}