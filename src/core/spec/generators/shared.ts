/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Shared utilities for test generators.
 * Extracted from unit.ts to enable reuse across property and integration generators.
 */
import type { ResolvedSpec, BoundaryExample } from '../schema.js';
import {
  isPlaceholder,
  expandPlaceholder,
  isPlaceholderError,
  assertionToExpect,
  type PlaceholderContext,
} from '../placeholders.js';

// Re-export for convenience
export type { PlaceholderContext };

// =============================================================================
// Architecture-Aware Error Patterns
// =============================================================================

/**
 * Error pattern for generated test assertions.
 * - 'convex': `.rejects.toMatchObject({ data: { code: 'X' } })`
 * - 'standard': `.rejects.toThrow('X')`
 * - 'result': errors returned as values (e.g., `{ valid: false, error: 'X' }`)
 */
export type ErrorPattern = 'convex' | 'standard' | 'result';

/**
 * Check if architectures indicate a Convex backend.
 */
export function isConvexArchitecture(architectures?: string[]): boolean {
  if (!architectures) return false;
  return architectures.some(a =>
    a.startsWith('convex.') || a.includes('.convex')
  );
}

/**
 * Resolve the error pattern to use for generated tests.
 * Explicit pattern takes priority, then architecture detection, then default to standard.
 */
export function resolveErrorPattern(
  architectures?: string[],
  explicitPattern?: ErrorPattern
): ErrorPattern {
  if (explicitPattern) return explicitPattern;
  if (isConvexArchitecture(architectures)) return 'convex';
  return 'standard';
}

/**
 * Generate a descriptive test name from example given/then data.
 * Used when examples don't have explicit names.
 *
 * Strategy:
 * 1. Look at key outputs in 'then' (e.g., "returns user when valid")
 * 2. Look at distinctive inputs in 'given' (e.g., "with empty title")
 * 3. Combine: "returns {output} when {input condition}"
 *
 * @param given - Input data
 * @param then - Expected output data
 * @param isError - Whether this is an error case
 */
export function deriveTestName(
  given?: Record<string, unknown>,
  then?: Record<string, unknown>,
  isError = false
): string {
  const parts: string[] = [];

  // Determine what the test produces (from 'then')
  if (then) {
    if (then.error || then['error.code']) {
      const errorCode = then.error || then['error.code'];
      parts.push(`throws ${errorCode}`);
    } else if (then['result.valid'] === false) {
      parts.push('returns invalid');
    } else if (then.result === '@created' || then.result === '@exists') {
      parts.push('creates successfully');
    } else {
      // Look for meaningful result fields
      const resultKeys = Object.keys(then).filter(k => k.startsWith('result.'));
      if (resultKeys.length > 0) {
        const firstKey = resultKeys[0].replace('result.', '');
        parts.push(`returns ${firstKey}`);
      } else {
        parts.push(isError ? 'fails' : 'succeeds');
      }
    }
  } else {
    parts.push(isError ? 'fails' : 'succeeds');
  }

  // Determine the condition (from 'given')
  if (given) {
    const conditions: string[] = [];
    for (const [key, value] of Object.entries(given)) {
      if (key === '<<' || key === 'user') continue; // Skip anchors and common fixtures

      if (value === null || value === undefined) {
        conditions.push(`${key} is missing`);
      } else if (value === '') {
        conditions.push(`${key} is empty`);
      } else if (typeof value === 'string' && value.startsWith('@')) {
        // Placeholder - describe it
        if (value === '@authenticated') continue; // Common, skip
        if (value.includes('string(')) {
          const match = value.match(/@string\((\d+)\)/);
          if (match) conditions.push(`${key} has ${match[1]} chars`);
        } else if (value.includes('url(')) {
          const match = value.match(/@url\((\d+)\)/);
          if (match) conditions.push(`${key} is long URL`);
        }
      } else if (typeof value === 'string' && value.length > 0) {
        // Use a shortened version of actual value
        conditions.push(`${key}="${value.slice(0, 15)}${value.length > 15 ? '...' : ''}"`);
      } else if (typeof value === 'number') {
        conditions.push(`${key}=${value}`);
      } else if (typeof value === 'boolean') {
        conditions.push(`${key}=${value}`);
      }
    }

    if (conditions.length > 0) {
      parts.push('when ' + conditions.slice(0, 2).join(' and '));
    }
  }

  return parts.join(' ') || (isError ? 'error case' : 'success case');
}

/**
 * Call pattern for generated function calls.
 */
export type CallPattern = 'direct' | 'destructured' | 'factory';

/**
 * Convert a spec ID segment to a valid JavaScript identifier.
 * Handles:
 * - Hyphens: share-entry → shareEntry
 * - Underscores: share_entry → shareEntry (optional)
 * - Numbers at start: 123abc → _123abc
 * - Reserved words: class → _class
 */
export function toValidIdentifier(name: string): string {
  if (!name) return 'fn';

  // Convert hyphen-case and snake_case to camelCase
  let result = name.replace(/[-_]([a-z])/gi, (_, char) => char.toUpperCase());

  // If starts with a number, prefix with underscore
  if (/^\d/.test(result)) {
    result = '_' + result;
  }

  // Check for reserved words
  const reserved = new Set([
    'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof',
    'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var',
    'void', 'while', 'with', 'class', 'const', 'enum', 'export', 'extends',
    'import', 'super', 'implements', 'interface', 'let', 'package', 'private',
    'protected', 'public', 'static', 'yield', 'await', 'async',
  ]);

  if (reserved.has(result)) {
    result = '_' + result;
  }

  return result;
}

/**
 * Extract the function name from a spec ID and ensure it's a valid identifier.
 */
export function specIdToFunctionName(specId: string): string {
  const lastSegment = specId.split('.').pop() || 'fn';
  return toValidIdentifier(lastSegment);
}

/**
 * Check if an object key needs to be quoted in JavaScript.
 * Keys need quoting if they contain special characters, start with a number,
 * or are reserved words.
 */
export function needsKeyQuoting(key: string): boolean {
  // Valid unquoted identifier: starts with letter/underscore/$, contains only alphanumeric/underscore/$
  const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
  if (!validIdentifier.test(key)) {
    return true;
  }
  // Reserved words that can't be used as unquoted keys
  const reserved = new Set([
    'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof',
    'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var',
    'void', 'while', 'with', 'class', 'const', 'enum', 'export', 'extends',
    'import', 'super', 'implements', 'interface', 'let', 'package', 'private',
    'protected', 'public', 'static', 'yield',
  ]);
  return reserved.has(key);
}

/**
 * Format an object key for JavaScript output, quoting if necessary.
 */
export function formatObjectKey(key: string): string {
  return needsKeyQuoting(key) ? JSON.stringify(key) : key;
}

/**
 * Expand a value, handling placeholders.
 * Converts spec values to valid JavaScript code strings.
 *
 * @param value - The value to expand
 * @param context - Optional placeholder context for fixture resolution
 */
export function expandValue(value: unknown, context?: PlaceholderContext): string {
  if (isPlaceholder(value)) {
    const result = expandPlaceholder(value, context);
    if (isPlaceholderError(result)) {
      return JSON.stringify(value); // Keep original on error
    }
    if (result.type === 'value') {
      return JSON.stringify(result.value);
    }
    if (result.type === 'user') {
      // Return a test user object
      return `{ id: '${result.id}', permissions: ${JSON.stringify(result.permissions)} }`;
    }
    return JSON.stringify(value);
  }

  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(v => expandValue(v, context)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => k !== '<<')
      .map(([k, v]) => `${formatObjectKey(k)}: ${expandValue(v, context)}`);
    return `{ ${entries.join(', ')} }`;
  }

  return JSON.stringify(value);
}

/**
 * Convert a key like "result.url" to a variable path.
 */
export function keyToVarPath(key: string): string {
  // Handle common patterns
  if (key === 'result') return 'result';
  if (key.startsWith('result.')) {
    const path = key.slice(7); // Remove "result."
    // Handle array access: result.errors[0].code → result.errors[0].code
    return `result.${path}`;
  }
  return key;
}

/**
 * Generate an assertion for a then clause.
 */
export function generateAssertion(key: string, value: unknown): string {
  // Handle placeholder assertions
  if (isPlaceholder(value)) {
    const result = expandPlaceholder(value as string);
    if (!isPlaceholderError(result) && result.type === 'assertion') {
      const varPath = keyToVarPath(key);
      return assertionToExpect(result, varPath) + ';';
    }
  }

  // Handle result.x paths
  const varPath = keyToVarPath(key);

  // Handle error assertions
  if (key === 'error' || key === 'error.code') {
    return `expect(result).toMatchObject({ code: '${value}' });`;
  }

  // Standard equality assertion
  if (typeof value === 'string') {
    return `expect(${varPath}).toBe('${escapeString(value)}');`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `expect(${varPath}).toBe(${value});`;
  }
  if (value === null) {
    return `expect(${varPath}).toBeNull();`;
  }
  if (typeof value === 'object') {
    return `expect(${varPath}).toMatchObject(${JSON.stringify(value)});`;
  }

  return `expect(${varPath}).toBe(${JSON.stringify(value)});`;
}

/**
 * Escape a string for use in generated code.
 */
export function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

/**
 * Generate function call code based on call pattern.
 */
export function generateFunctionCallCode(
  fnName: string,
  args: string[],
  callPattern: CallPattern
): string {
  const argsStr = args.join(', ');

  switch (callPattern) {
    case 'direct':
      // Pass arguments positionally: fnName(arg1, arg2)
      return `${fnName}(${argsStr})`;

    case 'factory':
      // Factory pattern: fnName()(...) - needs special handling
      // For now, treat like destructured but with a note
      return `${fnName}(${argsStr ? `{ ${argsStr} }` : ''})`;

    case 'destructured':
    default:
      // Pass as object literal: fnName({ arg1, arg2 })
      return `${fnName}(${argsStr ? `{ ${argsStr} }` : ''})`;
  }
}

/**
 * Suggest an import path based on spec ID and architectures.
 * Used when no explicit implementation path is provided.
 *
 * @param specId - The spec ID (e.g., "spec.product.create")
 * @param architectures - Optional architectures from the spec
 * @returns Suggested import path
 */
export function suggestImportPath(
  specId: string,
  architectures?: string[]
): string {
  // Remove "spec." prefix
  const parts = specId.replace(/^spec\./, '').split('.');

  if (parts.length === 0) return './module';

  // Check if architectures give hints about the path structure
  const firstArch = architectures?.[0]?.toLowerCase() || '';

  // Convex patterns: convex/[resource]/[type].ts
  if (firstArch.startsWith('convex.')) {
    const archType = firstArch.split('.')[1]; // query, mutation, action, helper
    if (parts.length >= 2) {
      const resource = parts[0];
      // convex.mutation → convex/products/mutations.js
      const typeMap: Record<string, string> = {
        query: 'queries',
        mutation: 'mutations',
        action: 'actions',
        helper: 'helpers',
      };
      const fileName = typeMap[archType] || archType;
      return `convex/${resource}/${fileName}.js`;
    }
    return `convex/${parts[0]}.js`;
  }

  // Frontend patterns: src/[type]/[resource]
  if (firstArch.startsWith('frontend.')) {
    const archType = firstArch.split('.')[1]; // component, hook, utility
    if (archType === 'hook' && parts.length >= 1) {
      return `src/hooks/${parts.join('/')}.js`;
    }
    if (archType === 'component' && parts.length >= 1) {
      return `src/components/${parts.join('/')}.js`;
    }
    return `src/${parts.join('/')}.js`;
  }

  // Default: use spec structure as path
  // spec.product.create → ./product/create.js or ./product.js
  if (parts.length === 1) {
    return `./${parts[0]}.js`;
  }
  if (parts.length === 2) {
    return `./${parts[0]}/${parts[1]}.js`;
  }

  // For longer paths, use last two segments
  return `./${parts.slice(-2).join('/')}.js`;
}

/**
 * Generate assertions based on output schema.
 * Creates specific assertions instead of generic toBeDefined().
 *
 * @param outputs - The outputs schema from the spec
 * @param indent - Indentation string
 * @returns Array of assertion code lines
 */
export function generateOutputSchemaAssertions(
  outputs: Record<string, unknown> | undefined,
  indent: string
): string[] {
  if (!outputs) {
    return [`${indent}expect(result).toBeDefined();`];
  }

  const lines: string[] = [];

  // First, check result is defined
  lines.push(`${indent}expect(result).toBeDefined();`);

  // Then add type-specific assertions for key output fields
  for (const [key, fieldDef] of Object.entries(outputs)) {
    const field = fieldDef as { type?: string; values?: string[] };

    if (key === '_id' || key === 'id') {
      // ID fields should be strings
      lines.push(`${indent}expect(typeof result.${key}).toBe('string');`);
    } else if (field?.type === 'string') {
      lines.push(`${indent}expect(typeof result.${key}).toBe('string');`);
    } else if (field?.type === 'number') {
      lines.push(`${indent}expect(typeof result.${key}).toBe('number');`);
    } else if (field?.type === 'boolean') {
      lines.push(`${indent}expect(typeof result.${key}).toBe('boolean');`);
    } else if (field?.type === 'enum' && field.values?.length) {
      // Enum should be one of the valid values
      lines.push(`${indent}expect(${JSON.stringify(field.values)}).toContain(result.${key});`);
    } else if (field?.type === 'array') {
      lines.push(`${indent}expect(Array.isArray(result.${key})).toBe(true);`);
    } else if (field?.type === 'object') {
      lines.push(`${indent}expect(typeof result.${key}).toBe('object');`);
    }

    // Only add assertions for first 3 fields to avoid verbose tests
    if (lines.length > 4) break;
  }

  return lines;
}

/**
 * Extract first available example output (then clause) from a resolved spec.
 * Used by integration generators to create specific assertions.
 *
 * Priority: success examples > boundary examples > null
 */
export function extractExampleOutput(spec: ResolvedSpec): Record<string, unknown> | null {
  const examples = spec.node.examples;

  if (!examples) {
    return null;
  }

  // Prefer success examples
  if (examples.success && examples.success.length > 0) {
    const firstSuccess = examples.success[0];
    if (firstSuccess.then) {
      return firstSuccess.then;
    }
  }

  // Fall back to boundary examples
  if (examples.boundaries && examples.boundaries.length > 0) {
    const firstBoundary = examples.boundaries[0];
    if ('then' in firstBoundary && firstBoundary.then) {
      return firstBoundary.then as Record<string, unknown>;
    }
  }

  return null;
}

/**
 * Generate multiple assertions from a then clause.
 * Used to create specific field-level assertions instead of generic toBeDefined().
 *
 * @param then - The then clause from an example
 * @param indent - Indentation string
 * @returns Array of assertion code lines
 */
export function generateAssertionsFromThen(
  then: Record<string, unknown>,
  indent: string
): string[] {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(then)) {
    // Skip error keys - they indicate failure cases, not success assertions
    if (key === 'error' || key.startsWith('error.')) {
      continue;
    }

    const assertion = generateAssertion(key, value);
    lines.push(`${indent}${assertion}`);
  }

  return lines;
}

/**
 * Extract first available example input from a resolved spec.
 * Used by integration and property generators to get concrete test data.
 *
 * Priority: success examples > boundary examples > null
 */
export function extractExampleInput(spec: ResolvedSpec): Record<string, unknown> | null {
  const examples = spec.node.examples;

  // No examples at all
  if (!examples) {
    return null;
  }

  // Prefer success examples - they have the cleanest test data
  if (examples.success && examples.success.length > 0) {
    const firstSuccess = examples.success[0];
    if (firstSuccess.given) {
      return firstSuccess.given;
    }
  }

  // Fall back to boundary examples
  if (examples.boundaries && examples.boundaries.length > 0) {
    const firstBoundary = examples.boundaries[0] as BoundaryExample;
    // Boundaries store values directly on the object, not in 'given'
    // We need to extract the actual input values and exclude metadata fields
    const boundaryInput: Record<string, unknown> = {};
    const metadataFields = new Set(['name', 'then', 'property', 'description', 'given', 'when']);

    for (const [key, value] of Object.entries(firstBoundary)) {
      if (!metadataFields.has(key)) {
        boundaryInput[key] = value;
      }
    }

    // If boundary has a 'given' field, use that instead
    if ('given' in firstBoundary && firstBoundary.given) {
      return firstBoundary.given as Record<string, unknown>;
    }

    return Object.keys(boundaryInput).length > 0 ? boundaryInput : null;
  }

  return null;
}

// =============================================================================
// Mock Scaffolding
// =============================================================================

/**
 * Dependency info for mock generation.
 * Matches ExtractedDependency from signature-extractor (kept here as a
 * plain interface to avoid importing from the infra layer).
 */
export interface MockDependency {
  importPath: string;
  importedNames: string[];
  isNodeBuiltin: boolean;
  suggestedMockType: 'full' | 'partial' | 'spy';
}

/**
 * Generate vi.mock() scaffolding from extracted dependencies.
 * Produces mock declarations that should be placed before the describe block.
 *
 * @param dependencies - Dependencies extracted from the implementation file
 * @param indent - Indentation prefix for each line
 * @returns Array of vi.mock() declaration lines
 */
export function generateMockScaffolding(
  dependencies: MockDependency[],
  indent: string
): string[] {
  if (dependencies.length === 0) return [];

  const lines: string[] = [];
  lines.push(`${indent}// Auto-generated mock scaffolding from implementation imports`);

  for (const dep of dependencies) {
    const mockPath = dep.isNodeBuiltin && !dep.importPath.startsWith('node:')
      ? `node:${dep.importPath}`
      : dep.importPath;

    if (dep.importedNames.length > 0) {
      const mockFns = dep.importedNames
        .map(name => `${name}: vi.fn()`)
        .join(', ');
      lines.push(`${indent}vi.mock('${mockPath}', () => ({ ${mockFns} }));`);
    } else {
      lines.push(`${indent}vi.mock('${mockPath}');`);
    }
  }

  lines.push('');
  return lines;
}
