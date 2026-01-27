/**
 * @arch archcodex.core.domain
 *
 * Constraint validator registry - maps rules to validators.
 */
import type { ConstraintRule } from '../registry/schema.js';
import type { IConstraintValidator } from './types.js';

import { MustExtendValidator } from './must-extend.js';
import { ImplementsValidator } from './implements.js';
import { ForbidImportValidator } from './forbid-import.js';
import { RequireImportValidator } from './require-import.js';
import { RequireDecoratorValidator } from './require-decorator.js';
import { ForbidDecoratorValidator } from './forbid-decorator.js';
import { NamingPatternValidator } from './naming-pattern.js';
import { LocationPatternValidator } from './location-pattern.js';
import { MaxPublicMethodsValidator } from './max-public-methods.js';
import { MaxFileLinesValidator } from './max-file-lines.js';
import { RequireTestFileValidator } from './require-test-file.js';
import { ImportableByValidator } from './importable-by.js';
import { ForbidCircularDepsValidator } from './forbid-circular-deps.js';
import { ForbidCallValidator } from './forbid-call.js';
import { RequireTryCatchValidator } from './require-try-catch.js';
import { ForbidMutationValidator } from './forbid-mutation.js';
import { RequireCallValidator } from './require-call.js';
import { RequirePatternValidator } from './require-pattern.js';
import { RequireExportValidator } from './require-export.js';
import { RequireCallBeforeValidator } from './require-call-before.js';
import { ForbidPatternValidator } from './forbid-pattern.js';
import { AllowPatternValidator } from './allow-pattern.js';
import { RequireOneOfValidator } from './require-one-of.js';
import { VerifyIntentValidator } from './verify-intent.js';
import { RequireCompanionCallValidator } from './require-companion-call.js';
import { RequireCompanionFileValidator } from './require-companion-file.js';

/**
 * Registry of all constraint validators.
 */
const validatorRegistry = new Map<ConstraintRule, IConstraintValidator>();

// Register all validators
validatorRegistry.set('must_extend', new MustExtendValidator());
validatorRegistry.set('implements', new ImplementsValidator());
validatorRegistry.set('forbid_import', new ForbidImportValidator());
validatorRegistry.set('require_import', new RequireImportValidator());
validatorRegistry.set('require_decorator', new RequireDecoratorValidator());
validatorRegistry.set('forbid_decorator', new ForbidDecoratorValidator());
validatorRegistry.set('naming_pattern', new NamingPatternValidator());
validatorRegistry.set('location_pattern', new LocationPatternValidator());
validatorRegistry.set('max_public_methods', new MaxPublicMethodsValidator());
validatorRegistry.set('max_file_lines', new MaxFileLinesValidator());
validatorRegistry.set('require_test_file', new RequireTestFileValidator());
// Cross-file validators (require --project flag)
validatorRegistry.set('importable_by', new ImportableByValidator());
validatorRegistry.set('forbid_circular_deps', new ForbidCircularDepsValidator());
// Runtime/dynamic constraints (v2.0)
validatorRegistry.set('forbid_call', new ForbidCallValidator());
validatorRegistry.set('require_try_catch', new RequireTryCatchValidator());
validatorRegistry.set('forbid_mutation', new ForbidMutationValidator());
// Additional constraints (v2.1)
validatorRegistry.set('require_call', new RequireCallValidator());
validatorRegistry.set('require_pattern', new RequirePatternValidator());
validatorRegistry.set('require_export', new RequireExportValidator());
validatorRegistry.set('require_call_before', new RequireCallBeforeValidator());
// Pattern constraints (v2.2)
validatorRegistry.set('forbid_pattern', new ForbidPatternValidator());
validatorRegistry.set('allow_pattern', new AllowPatternValidator());
// Business logic constraints (v2.3)
validatorRegistry.set('require_one_of', new RequireOneOfValidator());
// Intent validation (v2.6)
validatorRegistry.set('verify_intent', new VerifyIntentValidator());
// Companion call constraints (v2.7)
validatorRegistry.set('require_companion_call', new RequireCompanionCallValidator());
// Companion file constraints (v2.8)
validatorRegistry.set('require_companion_file', new RequireCompanionFileValidator());

/**
 * Get a validator for a specific rule.
 */
export function getValidator(rule: ConstraintRule): IConstraintValidator | undefined {
  return validatorRegistry.get(rule);
}

/**
 * Get all registered validators.
 */
export function getAllValidators(): Map<ConstraintRule, IConstraintValidator> {
  return validatorRegistry;
}

/**
 * Check if a validator exists for a rule.
 */
export function hasValidator(rule: ConstraintRule): boolean {
  return validatorRegistry.has(rule);
}
