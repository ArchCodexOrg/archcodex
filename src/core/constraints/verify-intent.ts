/**
 * @arch archcodex.core.domain.constraint
 * @intent:stateless
 *
 * Validates @intent: annotations against their definitions.
 * - Checks that 'requires' patterns exist
 * - Checks that 'forbids' patterns don't exist
 * - Detects conflicting intents
 * - Validates requires_intent chains
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';
import { patternMatches, findPatternMatch } from '../../utils/pattern-matcher.js';

/**
 * Validates intent annotations against their registry definitions.
 * Error codes: I002 (pattern violation), I003 (conflict), I004 (missing required intent)
 *
 * Example constraint:
 * ```yaml
 * - rule: verify_intent
 *   severity: warning
 * ```
 */
export class VerifyIntentValidator extends BaseConstraintValidator {
  readonly rule = 'verify_intent' as const;
  readonly errorCode = ErrorCodes.VERIFY_INTENT ?? 'I002';

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile, intents, intentRegistry } = context;

    // Skip if no intents or no registry
    if (!intents || intents.length === 0 || !intentRegistry) {
      return { passed: true, violations: [] };
    }

    const intentNames = intents.map(i => i.name);

    for (const intent of intents) {
      const definition = intentRegistry.intents[intent.name];

      // Skip undefined intents (handled by ValidationEngine)
      if (!definition) {
        continue;
      }

      // Check 'requires' patterns
      if (definition.requires) {
        for (const pattern of definition.requires) {
          if (!patternMatches(pattern, parsedFile.content)) {
            violations.push({
              code: 'I002',
              rule: this.rule,
              value: intent.name,
              severity: constraint.severity,
              line: intent.line,
              column: intent.column,
              message: `Intent '@intent:${intent.name}' requires pattern '${pattern}' but it was not found`,
              why: definition.description,
              fixHint: `Add code matching '${pattern}' or remove the @intent:${intent.name} annotation`,
              source: context.constraintSource,
            });
          }
        }
      }

      // Check 'forbids' patterns
      if (definition.forbids) {
        for (const pattern of definition.forbids) {
          const match = findPatternMatch(pattern, parsedFile.content);
          if (match.matched) {
            violations.push({
              code: 'I002',
              rule: this.rule,
              value: intent.name,
              severity: constraint.severity,
              line: match.line ?? null,
              column: null,
              message: `Intent '@intent:${intent.name}' forbids pattern '${pattern}' but it was found`,
              why: definition.description,
              fixHint: `Remove the forbidden pattern or remove the @intent:${intent.name} annotation`,
              source: context.constraintSource,
            });
          }
        }
      }

      // Check 'conflicts_with'
      if (definition.conflicts_with) {
        for (const conflicting of definition.conflicts_with) {
          if (intentNames.includes(conflicting)) {
            violations.push({
              code: 'I003',
              rule: this.rule,
              value: `${intent.name} vs ${conflicting}`,
              severity: constraint.severity,
              line: intent.line,
              column: intent.column,
              message: `Intent '@intent:${intent.name}' conflicts with '@intent:${conflicting}'`,
              why: `These intents represent mutually exclusive patterns`,
              fixHint: `Remove one of the conflicting intents`,
              source: context.constraintSource,
            });
          }
        }
      }

      // Check 'requires_intent'
      if (definition.requires_intent) {
        for (const required of definition.requires_intent) {
          if (!intentNames.includes(required)) {
            violations.push({
              code: 'I004',
              rule: this.rule,
              value: intent.name,
              severity: constraint.severity,
              line: intent.line,
              column: intent.column,
              message: `Intent '@intent:${intent.name}' requires '@intent:${required}' to also be present`,
              why: definition.description,
              fixHint: `Add @intent:${required} or remove @intent:${intent.name}`,
              source: context.constraintSource,
            });
          }
        }
      }
    }

    return { passed: violations.length === 0, violations };
  }
}
