/**
 * @arch archcodex.core.domain
 * @intent:stateless
 *
 * Resolves effective intents for a given code location.
 * Handles the precedence between function-level and file-level intents.
 */
import type { IntentAnnotation } from '../arch-tag/types.js';
import type { SemanticModel } from '../../validators/semantic.types.js';

/**
 * Function or method with intent annotations and line range.
 */
interface FunctionWithIntents {
  name: string;
  intents?: string[];
  startLine?: number;
  endLine?: number;
}

/**
 * Get all functions and methods from a semantic model as a unified list.
 */
export function getAllFunctionsWithIntents(model: SemanticModel): FunctionWithIntents[] {
  const result: FunctionWithIntents[] = [];

  // Add standalone functions
  for (const func of model.functions) {
    result.push({
      name: func.name,
      intents: func.intents,
      startLine: func.startLine,
      endLine: func.endLine,
    });
  }

  // Add class methods
  for (const cls of model.classes) {
    for (const method of cls.methods) {
      const fullName = cls.name !== 'Anonymous' ? `${cls.name}.${method.name}` : method.name;
      result.push({
        name: fullName,
        intents: method.intents,
        startLine: method.startLine,
        endLine: method.endLine,
      });
    }
  }

  return result;
}

/**
 * Find the containing function for a given line number.
 * Returns the innermost function if nested (for closures).
 */
export function findContainingFunction(
  line: number,
  functions: FunctionWithIntents[]
): FunctionWithIntents | undefined {
  // Find all functions that contain this line
  const containing = functions.filter(f =>
    f.startLine !== undefined &&
    f.endLine !== undefined &&
    line >= f.startLine &&
    line <= f.endLine
  );

  if (containing.length === 0) {
    return undefined;
  }

  // If multiple functions contain this line (nested functions/closures),
  // return the one with the smallest range (innermost)
  return containing.reduce((innermost, current) => {
    const innermostRange = (innermost.endLine ?? 0) - (innermost.startLine ?? 0);
    const currentRange = (current.endLine ?? 0) - (current.startLine ?? 0);
    return currentRange < innermostRange ? current : innermost;
  });
}

/**
 * Find a function by name from the list of functions.
 * Supports both simple names (e.g., "myFunc") and qualified names (e.g., "MyClass.myMethod").
 */
export function findFunctionByName(
  name: string,
  functions: FunctionWithIntents[]
): FunctionWithIntents | undefined {
  return functions.find(f => f.name === name);
}

/**
 * Get the effective intents for a given line in the code.
 *
 * Resolution order:
 * 1. If the line is inside a function with intents → use function intents
 * 2. Otherwise → use file-level intents
 *
 * Function-level intents take precedence (more specific wins).
 */
export function getEffectiveIntents(
  line: number,
  fileIntents: IntentAnnotation[],
  functions: FunctionWithIntents[]
): string[] {
  // Check if line is inside a function with intents
  const containingFunc = findContainingFunction(line, functions);

  if (containingFunc?.intents?.length) {
    return containingFunc.intents;
  }

  // Fall back to file-level intents
  return fileIntents.map(i => i.name);
}

/**
 * Get the effective intents for a function call, using parent function info.
 *
 * Resolution order:
 * 1. If parentFunction is set and that function has intents → use function intents
 * 2. If no parent (module scope) or parent has no intents → use file-level intents
 */
export function getEffectiveIntentsForCall(
  parentFunctionName: string | undefined,
  fileIntents: IntentAnnotation[],
  functions: FunctionWithIntents[]
): string[] {
  // If call is at module scope, use file intents
  if (!parentFunctionName) {
    return fileIntents.map(i => i.name);
  }

  // Find the parent function
  const parentFunc = findFunctionByName(parentFunctionName, functions);

  // If parent function has intents, use them
  if (parentFunc?.intents?.length) {
    return parentFunc.intents;
  }

  // Fall back to file-level intents
  return fileIntents.map(i => i.name);
}

/**
 * Check if any of the given intents match a required intent pattern.
 * Supports exact matching and wildcard patterns.
 */
export function hasIntent(intents: string[], requiredIntent: string): boolean {
  const required = requiredIntent.toLowerCase();

  for (const intent of intents) {
    const current = intent.toLowerCase();

    // Exact match
    if (current === required) {
      return true;
    }

    // Wildcard patterns could be added here if needed
    // e.g., "cli-*" matching "cli-output", "cli-input"
  }

  return false;
}

/**
 * Check if a set of intents allows a specific action.
 * Uses the intent registry to determine what's allowed.
 */
export function intentAllows(
  intents: string[],
  action: string,
  intentRegistry?: Map<string, { requires?: string[]; forbids?: string[] }>
): boolean {
  if (!intentRegistry) {
    // Without a registry, we can't make decisions
    return false;
  }

  for (const intentName of intents) {
    const intentDef = intentRegistry.get(intentName);
    if (!intentDef) continue;

    // Check if this intent requires something that allows the action
    if (intentDef.requires?.includes(action)) {
      return true;
    }

    // Check if this intent forbids the action
    if (intentDef.forbids?.includes(action)) {
      return false;
    }
  }

  // Default: not explicitly allowed or forbidden
  return false;
}
