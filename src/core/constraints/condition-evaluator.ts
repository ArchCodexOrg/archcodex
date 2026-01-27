/**
 * @arch archcodex.core.domain
 *
 * Evaluates conditional constraint conditions against a SemanticModel.
 * Used to determine if a constraint should be applied based on file characteristics.
 */
import { minimatch } from 'minimatch';
import type { ConstraintCondition } from '../registry/schema.js';
import type { SemanticModel } from '../../validators/semantic.types.js';

/**
 * Result of evaluating a condition.
 */
export interface ConditionEvaluationResult {
  /** Whether the condition is satisfied */
  satisfied: boolean;
  /** Human-readable reason for the result */
  reason: string;
}

/**
 * Context for condition evaluation.
 */
export interface ConditionContext {
  /** The parsed file semantic model */
  parsedFile: SemanticModel;
  /** The absolute file path */
  filePath: string;
}

/**
 * Evaluates constraint conditions against a file's semantic model.
 * Returns true if the condition is satisfied (constraint should apply).
 * Supports both positive conditions (has_*) and negated conditions (not_*).
 */
export function evaluateCondition(
  condition: ConstraintCondition,
  context: ConditionContext
): ConditionEvaluationResult {
  const { parsedFile, filePath } = context;

  // Check has_decorator condition (positive)
  if (condition.has_decorator) {
    const decoratorName = condition.has_decorator.replace(/^@/, '');
    const hasDecorator = parsedFile.classes.some((cls) =>
      cls.decorators.some((d) => d.name === decoratorName)
    );

    return {
      satisfied: hasDecorator,
      reason: hasDecorator
        ? `Found decorator @${decoratorName}`
        : `No class has decorator @${decoratorName}`,
    };
  }

  // Check not_has_decorator condition (negated)
  if (condition.not_has_decorator) {
    const decoratorName = condition.not_has_decorator.replace(/^@/, '');
    const hasDecorator = parsedFile.classes.some((cls) =>
      cls.decorators.some((d) => d.name === decoratorName)
    );

    return {
      satisfied: !hasDecorator,
      reason: !hasDecorator
        ? `No class has decorator @${decoratorName} (negated condition satisfied)`
        : `Found decorator @${decoratorName} (negated condition not satisfied)`,
    };
  }

  // Check has_import condition (positive)
  if (condition.has_import) {
    const hasImport = checkHasImport(parsedFile, condition.has_import);
    return {
      satisfied: hasImport,
      reason: hasImport
        ? `Found import '${condition.has_import}'`
        : `No import matches '${condition.has_import}'`,
    };
  }

  // Check not_has_import condition (negated)
  if (condition.not_has_import) {
    const hasImport = checkHasImport(parsedFile, condition.not_has_import);
    return {
      satisfied: !hasImport,
      reason: !hasImport
        ? `No import matches '${condition.not_has_import}' (negated condition satisfied)`
        : `Found import '${condition.not_has_import}' (negated condition not satisfied)`,
    };
  }

  // Check extends condition (positive)
  if (condition.extends) {
    const hasExtends = checkExtends(parsedFile, condition.extends);
    return {
      satisfied: hasExtends,
      reason: hasExtends
        ? `Found class extending ${condition.extends}`
        : `No class extends ${condition.extends}`,
    };
  }

  // Check not_extends condition (negated)
  if (condition.not_extends) {
    const hasExtends = checkExtends(parsedFile, condition.not_extends);
    return {
      satisfied: !hasExtends,
      reason: !hasExtends
        ? `No class extends ${condition.not_extends} (negated condition satisfied)`
        : `Found class extending ${condition.not_extends} (negated condition not satisfied)`,
    };
  }

  // Check file_matches condition (positive)
  if (condition.file_matches) {
    const matches = minimatch(filePath, condition.file_matches, { matchBase: true });
    return {
      satisfied: matches,
      reason: matches
        ? `File path matches '${condition.file_matches}'`
        : `File path does not match '${condition.file_matches}'`,
    };
  }

  // Check not_file_matches condition (negated)
  if (condition.not_file_matches) {
    const matches = minimatch(filePath, condition.not_file_matches, { matchBase: true });
    return {
      satisfied: !matches,
      reason: !matches
        ? `File path does not match '${condition.not_file_matches}' (negated condition satisfied)`
        : `File path matches '${condition.not_file_matches}' (negated condition not satisfied)`,
    };
  }

  // Check implements condition (positive)
  if (condition.implements) {
    const hasImplements = parsedFile.classes.some((cls) =>
      cls.implements.includes(condition.implements!)
    );
    return {
      satisfied: hasImplements,
      reason: hasImplements
        ? `Found class implementing ${condition.implements}`
        : `No class implements ${condition.implements}`,
    };
  }

  // Check not_implements condition (negated)
  if (condition.not_implements) {
    const hasImplements = parsedFile.classes.some((cls) =>
      cls.implements.includes(condition.not_implements!)
    );
    return {
      satisfied: !hasImplements,
      reason: !hasImplements
        ? `No class implements ${condition.not_implements} (negated condition satisfied)`
        : `Found class implementing ${condition.not_implements} (negated condition not satisfied)`,
    };
  }

  // Check method_has_decorator condition (positive)
  if (condition.method_has_decorator) {
    const found = checkMethodHasDecorator(parsedFile, condition.method_has_decorator);
    return {
      satisfied: found,
      reason: found
        ? `Found method/function with decorator @${condition.method_has_decorator.replace(/^@/, '')}`
        : `No method/function has decorator @${condition.method_has_decorator.replace(/^@/, '')}`,
    };
  }

  // Check not_method_has_decorator condition (negated)
  if (condition.not_method_has_decorator) {
    const found = checkMethodHasDecorator(parsedFile, condition.not_method_has_decorator);
    return {
      satisfied: !found,
      reason: !found
        ? `No method/function has decorator @${condition.not_method_has_decorator.replace(/^@/, '')} (negated condition satisfied)`
        : `Found method/function with decorator @${condition.not_method_has_decorator.replace(/^@/, '')} (negated condition not satisfied)`,
    };
  }

  // No condition specified - always satisfied
  return {
    satisfied: true,
    reason: 'No condition specified',
  };
}

/** Helper: Check if file has a matching import */
function checkHasImport(parsedFile: SemanticModel, importPattern: string): boolean {
  return parsedFile.imports.some((imp) => {
    // Check module specifier (with glob support)
    if (importPattern.includes('*')) {
      if (minimatch(imp.moduleSpecifier, importPattern)) return true;
    } else {
      if (imp.moduleSpecifier === importPattern) return true;
    }
    // Check named imports
    if (imp.namedImports?.includes(importPattern)) return true;
    // Check default import
    if (imp.defaultImport === importPattern) return true;
    return false;
  });
}

/** Helper: Check if any class extends the base class */
function checkExtends(parsedFile: SemanticModel, baseClass: string): boolean {
  return parsedFile.classes.some((cls) => {
    if (cls.extends === baseClass) return true;
    if (cls.inheritanceChain?.includes(baseClass)) return true;
    return false;
  });
}

/** Helper: Check if any method/function has the decorator */
function checkMethodHasDecorator(parsedFile: SemanticModel, decorator: string): boolean {
  const decoratorName = decorator.replace(/^@/, '');
  const hasMethodDecorator = parsedFile.classes.some((cls) =>
    cls.methods.some((method) =>
      method.decorators.some((d) => d.name === decoratorName)
    )
  );
  const hasFunctionDecorator = parsedFile.functions.some((fn) =>
    fn.decorators.some((d) => d.name === decoratorName)
  );
  return hasMethodDecorator || hasFunctionDecorator;
}

/**
 * Check if a constraint has any conditions (positive or negated).
 */
export function hasCondition(condition: ConstraintCondition | undefined): boolean {
  if (!condition) return false;

  return !!(
    // Positive conditions
    condition.has_decorator ||
    condition.has_import ||
    condition.extends ||
    condition.file_matches ||
    condition.implements ||
    condition.method_has_decorator ||
    // Negated conditions
    condition.not_has_decorator ||
    condition.not_has_import ||
    condition.not_extends ||
    condition.not_file_matches ||
    condition.not_implements ||
    condition.not_method_has_decorator
  );
}
