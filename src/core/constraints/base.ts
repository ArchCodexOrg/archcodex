/**
 * @arch archcodex.core.domain.constraint
 */
import type { Constraint, ConstraintRule } from '../registry/schema.js';
import type {
  IConstraintValidator,
  ConstraintContext,
  ConstraintResult,
  Violation,
  Suggestion,
  DidYouMean,
} from './types.js';

/**
 * Extended violation options for structured suggestions.
 */
export interface ViolationOptions {
  line?: number | null;
  column?: number | null;
  actual?: string;
  suggestion?: Suggestion;
  didYouMean?: DidYouMean;
}

/**
 * Base class for constraint validators.
 * Provides common utilities for creating violations.
 */
export abstract class BaseConstraintValidator implements IConstraintValidator {
  abstract readonly rule: ConstraintRule;
  abstract readonly errorCode: string;

  abstract validate(
    constraint: Constraint,
    context: ConstraintContext
  ): ConstraintResult;

  /**
   * Create a violation object with optional structured suggestions.
   */
  protected createViolation(
    constraint: Constraint,
    message: string,
    context: ConstraintContext,
    options: ViolationOptions = {}
  ): Violation {
    const violation: Violation = {
      code: this.errorCode,
      rule: this.rule,
      value: constraint.value,
      severity: constraint.severity,
      line: options.line ?? null,
      column: options.column ?? null,
      message,
      why: constraint.why,
      fixHint: this.getFixHint(constraint, options.actual),
      source: context.constraintSource,
    };

    // Add structured suggestion if provided
    if (options.suggestion) {
      violation.suggestion = options.suggestion;
    }

    // Add "did you mean" if provided
    if (options.didYouMean) {
      violation.didYouMean = options.didYouMean;
    }

    // Add alternatives from constraint if defined
    if (constraint.alternatives && constraint.alternatives.length > 0) {
      violation.alternatives = constraint.alternatives;
    }

    return violation;
  }

  /**
   * Get a suggested fix for the violation.
   * Override in subclasses for specific hints.
   */
  protected getFixHint(_constraint: Constraint, _actual?: string): string {
    return `Fix the ${this.rule} constraint violation`;
  }

  /**
   * Normalize constraint value to array.
   * Coverage constraints (object values) return empty array since they use CoverageValidator.
   */
  protected normalizeToArray(value: unknown): string[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'object' && value !== null) return []; // Coverage constraints
    return [String(value)];
  }
}
