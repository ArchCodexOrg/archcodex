/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Property-based test generator for SpecCodex.
 * Generates fast-check property tests from spec invariants and boundaries.
 *
 * Based on spec.speccodex.generate.property:
 * - Each invariant → one property test
 * - Boundaries with 'property' field → property tests
 * - Generated arbitraries match input schema types
 * - String inputs with max → fc.string({ maxLength })
 */
import type {
  ResolvedSpec,
  InputField,
  Invariant,
  BoundaryExample,
} from '../schema.js';
import { resolveImplementation } from '../resolver.js';
import { isPlaceholder, expandPlaceholder, isPlaceholderError } from '../placeholders.js';
import { escapeString, specIdToFunctionName, suggestImportPath, generateMockScaffolding } from './shared.js';
import { extractDependencies } from './signature-extractor.js';
import {
  parseInvariant,
  parseInvariantMetadata,
  calculateInvariantStats,
  placeholderToAssertion,
  type StructuredInvariant,
  type InvariantStats,
} from './invariant-dsl.js';

// Re-export invariant DSL types and functions for backward compatibility
export {
  parseInvariantStrict,
  parseInvariant,
  parseInvariantMetadata,
  placeholderToAssertion,
  type InvariantParseError,
  type InvariantParseResult,
  type InvariantType,
  type StructuredInvariant,
  type InvariantStats,
} from './invariant-dsl.js';

// =============================================================================
// PROPERTY TEST GENERATOR
// =============================================================================

/**
 * Options for property test generation.
 */
export interface PropertyGeneratorOptions {
  /** Test framework to use */
  framework?: 'fast-check';
  /** Number of test runs */
  numRuns?: number;
  /** Seed for reproducibility */
  seed?: number;
  /** Add regeneration markers */
  markers?: boolean;
  /** Import path for the function under test */
  importPath?: string;
  /** Function name to test */
  functionName?: string;
  /** Output file path (for calculating relative imports) */
  outputPath?: string;
  /** Project root for resolving implementation paths */
  projectRoot?: string;
}

/**
 * Result of property test generation.
 */
export interface PropertyGeneratorResult {
  valid: boolean;
  propertyCount: number;
  code: string;
  errors: Array<{ code: string; message: string }>;
  /** Structured metadata for each invariant (Improvement #3) */
  structuredInvariants: StructuredInvariant[];
  /** Statistics about invariant types */
  invariantStats: InvariantStats;
}

const MARKER_START = '// @speccodex:property:start - DO NOT EDIT BETWEEN MARKERS';
const MARKER_END = '// @speccodex:property:end';

/**
 * Generate property-based tests from a resolved spec.
 */
export function generatePropertyTests(
  spec: ResolvedSpec,
  options: PropertyGeneratorOptions = {}
): PropertyGeneratorResult {
  const {
    numRuns = 100,
    seed,
    markers = true,
  } = options;

  // Auto-resolve implementation if not explicitly provided
  let { importPath, functionName } = options;
  if (!importPath || !functionName) {
    const resolved = resolveImplementation(spec, options.outputPath);
    if (resolved) {
      importPath = importPath || resolved.importPath;
      functionName = functionName || resolved.functionName;
    }
  }

  const errors: Array<{ code: string; message: string }> = [];
  const lines: string[] = [];

  const node = spec.node;

  // Check for invariants or boundaries with property field
  const invariants = node.invariants || [];
  const boundariesWithProperty = (node.examples?.boundaries || [])
    .filter((b: BoundaryExample) => b.property);

  // Parse invariants into structured metadata (Improvement #3)
  const structuredInvariants = invariants.map(parseInvariantMetadata);
  const invariantStats = calculateInvariantStats(structuredInvariants);

  // Empty result helper with structured metadata
  const emptyResult = (errorCode: string, errorMessage: string): PropertyGeneratorResult => ({
    valid: false,
    propertyCount: 0,
    code: '',
    errors: [{ code: errorCode, message: errorMessage }],
    structuredInvariants,
    invariantStats,
  });

  if (invariants.length === 0 && boundariesWithProperty.length === 0) {
    return emptyResult('NO_INVARIANTS', 'Spec has no invariants or boundaries with property field');
  }

  // Validate spec has intent
  if (!node.intent) {
    return emptyResult('INVALID_SPEC', 'Spec is missing required field: intent');
  }

  let propertyCount = 0;

  // Extract dependencies for mock scaffolding.
  // Only mock external packages and node builtins, not relative imports.
  // Relative imports are sibling utilities that pure functions depend on
  // and should execute as-is in property tests.
  const { projectRoot } = options;
  const allDependencies = spec.node.implementation
    ? extractDependencies(spec.node.implementation, { projectRoot })
    : [];
  const dependencies = allDependencies.filter(dep => !dep.importPath.startsWith('.'));

  // Generate imports
  lines.push(generateImports(importPath, functionName, spec.specId, node.architectures));
  lines.push('');

  // Generate mock scaffolding from implementation dependencies
  if (dependencies.length > 0) {
    lines.push(...generateMockScaffolding(dependencies, ''));
  }

  // Start markers
  if (markers) {
    lines.push(MARKER_START);
  }

  // Main describe block
  const describeName = functionName || specIdToFunctionName(spec.specId);
  lines.push(`describe('${describeName} properties', () => {`);

  // Clear mocks between tests to prevent state leakage
  lines.push('  beforeEach(() => {');
  lines.push('    vi.clearAllMocks();');
  lines.push('  });');
  lines.push('');

  // Generate arbitraries from inputs
  const inputs = node.inputs || {};
  if (Object.keys(inputs).length > 0) {
    lines.push('  // Arbitraries from input schema');
    lines.push(`  const inputArbitrary = ${generateInputArbitrary(inputs)};`);
    lines.push('');
  }

  // Generate fc.assert options
  const assertOptions: string[] = [];
  if (numRuns !== 100) {
    assertOptions.push(`numRuns: ${numRuns}`);
  }
  if (seed !== undefined) {
    assertOptions.push(`seed: ${seed}`);
  }
  const assertOptionsStr = assertOptions.length > 0
    ? `, { ${assertOptions.join(', ')} }`
    : '';

  // Generate property tests from invariants
  if (invariants.length > 0) {
    lines.push('  describe(\'invariants\', () => {');
    for (const invariant of invariants) {
      const testCode = generateInvariantProperty(invariant, inputs, spec.specId, assertOptionsStr);
      lines.push(testCode);
      propertyCount++;
    }
    lines.push('  });');
    lines.push('');
  }

  // Generate property tests from boundaries
  if (boundariesWithProperty.length > 0) {
    lines.push('  describe(\'boundary properties\', () => {');
    for (const boundary of boundariesWithProperty as BoundaryExample[]) {
      const testCode = generateBoundaryProperty(boundary, spec.specId, assertOptionsStr);
      lines.push(testCode);
      propertyCount++;
    }
    lines.push('  });');
  }

  lines.push('});');

  // End markers
  if (markers) {
    lines.push(MARKER_END);
  }

  return {
    valid: true,
    propertyCount,
    code: lines.join('\n'),
    errors,
    structuredInvariants,
    invariantStats,
  };
}

// =============================================================================
// IMPORT AND ARBITRARY GENERATION
// =============================================================================

/**
 * Generate imports section.
 */
function generateImports(
  importPath?: string,
  functionName?: string,
  specId?: string,
  architectures?: string[]
): string {
  const lines: string[] = [];

  // Framework imports
  lines.push(`import { describe, it, expect, beforeEach, vi } from 'vitest';`);
  lines.push(`import * as fc from 'fast-check';`);

  // Function import
  if (importPath && functionName) {
    lines.push(`import { ${functionName} } from '${importPath}';`);
  } else if (specId) {
    const suggestedPath = suggestImportPath(specId, architectures);
    const funcName = specIdToFunctionName(specId);
    lines.push(`import { ${funcName} } from '${suggestedPath}';`);
  }

  return lines.join('\n');
}

/**
 * Generate fast-check arbitrary from input schema.
 */
function generateInputArbitrary(inputs: Record<string, InputField>): string {
  const entries = Object.entries(inputs);
  if (entries.length === 0) {
    return 'fc.constant({})';
  }

  const fields = entries.map(([key, field]) => {
    return `${key}: ${fieldToArbitrary(field)}`;
  });

  return `fc.record({\n    ${fields.join(',\n    ')}\n  })`;
}

/**
 * Convert an input field schema to a fast-check arbitrary.
 */
function fieldToArbitrary(field: InputField): string {
  const { type, validate, min, max, values } = field;

  switch (type) {
    case 'string': {
      // Check for special validators
      if (validate === 'url') {
        return 'fc.webUrl()';
      }
      if (validate === 'email') {
        return 'fc.emailAddress()';
      }
      // Check for constraints
      const strOpts: string[] = [];
      if (min !== undefined) strOpts.push(`minLength: ${min}`);
      if (max !== undefined) strOpts.push(`maxLength: ${max}`);
      if (strOpts.length > 0) {
        return `fc.string({ ${strOpts.join(', ')} })`;
      }
      return 'fc.string()';
    }

    case 'number': {
      const numOpts: string[] = [];
      if (min !== undefined) numOpts.push(`min: ${min}`);
      if (max !== undefined) numOpts.push(`max: ${max}`);
      if (numOpts.length > 0) {
        return `fc.integer({ ${numOpts.join(', ')} })`;
      }
      return 'fc.integer()';
    }

    case 'boolean':
      return 'fc.boolean()';

    case 'enum':
      if (values && values.length > 0) {
        return `fc.constantFrom(${values.map(v => `'${v}'`).join(', ')})`;
      }
      return 'fc.string()';

    case 'array':
      return 'fc.array(fc.anything())';

    case 'object':
      return 'fc.object()';

    case 'id':
      // Generate ID-like strings
      return 'fc.hexaString({ minLength: 24, maxLength: 24 })';

    default:
      return 'fc.anything()';
  }
}

// =============================================================================
// INVARIANT PROPERTY GENERATION
// =============================================================================

/**
 * Generate a property test from an invariant.
 */
function generateInvariantProperty(
  invariant: Invariant,
  inputs: Record<string, InputField>,
  specId: string,
  assertOptions: string
): string {
  const lines: string[] = [];
  const indent = '    ';

  // Parse invariant into a test name and assertion
  const { testName, assertion } = parseInvariant(invariant);

  lines.push(`${indent}it('${escapeString(testName)}', async () => {`);

  // Generate the property test
  const fnName = specIdToFunctionName(specId);
  const hasInputs = Object.keys(inputs).length > 0;

  if (hasInputs) {
    lines.push(`${indent}  await fc.assert(`);
    lines.push(`${indent}    fc.asyncProperty(inputArbitrary, async (input) => {`);
    lines.push(`${indent}      vi.clearAllMocks();`);
    lines.push(`${indent}      const result = await ${fnName}(input);`);
    lines.push(`${indent}      ${assertion}`);
    lines.push(`${indent}    })${assertOptions}`);
    lines.push(`${indent}  );`);
  } else {
    lines.push(`${indent}  await fc.assert(`);
    lines.push(`${indent}    fc.asyncProperty(fc.constant({}), async () => {`);
    lines.push(`${indent}      vi.clearAllMocks();`);
    lines.push(`${indent}      const result = await ${fnName}();`);
    lines.push(`${indent}      ${assertion}`);
    lines.push(`${indent}    })${assertOptions}`);
    lines.push(`${indent}  );`);
  }

  lines.push(`${indent}});`);
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// BOUNDARY PROPERTY GENERATION
// =============================================================================

/**
 * Generate a property test from a boundary with property field.
 */
function generateBoundaryProperty(
  boundary: BoundaryExample,
  specId: string,
  assertOptions: string
): string {
  const lines: string[] = [];
  const indent = '    ';

  const testName = boundary.name;
  const propertyHint = boundary.property || '';

  lines.push(`${indent}it('${escapeString(testName)}', async () => {`);
  lines.push(`${indent}  // Property: ${propertyHint}`);

  // Parse the boundary to understand the property
  const fnName = specIdToFunctionName(specId);
  const { arbitrary, assertion } = parseBoundaryProperty(boundary);

  lines.push(`${indent}  await fc.assert(`);
  lines.push(`${indent}    fc.asyncProperty(${arbitrary}, async (input) => {`);
  lines.push(`${indent}      vi.clearAllMocks();`);
  lines.push(`${indent}      try {`);
  lines.push(`${indent}        const result = await ${fnName}(input);`);
  lines.push(`${indent}        ${assertion.success}`);
  lines.push(`${indent}      } catch (error) {`);
  lines.push(`${indent}        ${assertion.error}`);
  lines.push(`${indent}      }`);
  lines.push(`${indent}    })${assertOptions}`);
  lines.push(`${indent}  );`);
  lines.push(`${indent}});`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Parse a boundary example to extract arbitrary and assertions.
 */
function parseBoundaryProperty(
  boundary: BoundaryExample
): { arbitrary: string; assertion: { success: string; error: string } } {
  const propertyHint = boundary.property || '';

  // Parse the boundary values to determine the arbitrary
  const given = { ...boundary };
  delete (given as Record<string, unknown>).name;
  delete (given as Record<string, unknown>).then;
  delete (given as Record<string, unknown>).property;
  delete (given as Record<string, unknown>).description;
  delete (given as Record<string, unknown>).given;
  delete (given as Record<string, unknown>).when;

  // Look for length patterns in property hint
  // e.g., "forall url.length > 2048, returns URL_TOO_LONG"
  const lengthMatch = propertyHint.match(/(\w+)\.length\s*([<>]=?)\s*(\d+)/);
  if (lengthMatch) {
    const [, field, op, threshold] = lengthMatch;
    const num = parseInt(threshold, 10);

    let arbitrary: string;
    if (op === '>' || op === '>=') {
      const minLen = op === '>' ? num + 1 : num;
      arbitrary = `fc.record({ ${field}: fc.string({ minLength: ${minLen}, maxLength: ${minLen + 1000} }) })`;
    } else {
      const maxLen = op === '<' ? num - 1 : num;
      arbitrary = `fc.record({ ${field}: fc.string({ minLength: 0, maxLength: ${maxLen} }) })`;
    }

    // Determine expected outcome
    const errorMatch = propertyHint.match(/returns?\s+(\w+)/);
    const expectedError = errorMatch ? errorMatch[1] : 'error';

    return {
      arbitrary,
      assertion: {
        success: `throw new Error('Expected error but got success');`,
        error: `expect((error as { data?: { code: string } }).data?.code).toBe('${expectedError}');`,
      },
    };
  }

  // Default: generate arbitrary from boundary values
  const fields: string[] = [];
  for (const [key, value] of Object.entries(given)) {
    if (isPlaceholder(value)) {
      const result = expandPlaceholder(value);
      if (!isPlaceholderError(result) && result.type === 'value') {
        if (typeof result.value === 'string') {
          const len = result.value.length;
          fields.push(`${key}: fc.string({ minLength: ${len}, maxLength: ${len + 100} })`);
        } else {
          fields.push(`${key}: fc.constant(${JSON.stringify(result.value)})`);
        }
      }
    } else {
      fields.push(`${key}: fc.constant(${JSON.stringify(value)})`);
    }
  }

  const arbitrary = fields.length > 0
    ? `fc.record({ ${fields.join(', ')} })`
    : 'fc.constant({})';

  // Check the then clause for expected outcome
  const expectedError = boundary.then?.error || boundary.then?.['error.code'];
  if (expectedError) {
    return {
      arbitrary,
      assertion: {
        success: `throw new Error('Expected error but got success');`,
        error: `expect((error as { data?: { code: string } }).data?.code).toBe('${expectedError}');`,
      },
    };
  }

  // Check for success assertions in then clause (result.*, @exists, @defined, etc.)
  if (boundary.then) {
    const successAssertions = generateBoundarySuccessAssertions(boundary.then);
    if (successAssertions) {
      return {
        arbitrary,
        assertion: {
          success: successAssertions,
          error: `throw error; // Unexpected error`,
        },
      };
    }
  }

  return {
    arbitrary,
    assertion: {
      success: `expect(result).toBeDefined();`,
      error: `throw error;`,
    },
  };
}

/**
 * Generate success assertions from a boundary's then clause.
 * Handles patterns like:
 * - result.results: "@exists"
 * - result.total: "@gte(0)"
 * - result: "@defined"
 */
function generateBoundarySuccessAssertions(then: Record<string, unknown>): string | null {
  const assertions: string[] = [];

  for (const [key, value] of Object.entries(then)) {
    // Skip error-related keys
    if (key === 'error' || key.startsWith('error.')) {
      continue;
    }

    // Determine the variable path
    const varPath = key === 'result' ? 'result' :
      key.startsWith('result.') ? key : `result.${key}`;

    // Handle placeholder assertions
    if (isPlaceholder(value)) {
      const result = expandPlaceholder(value as string);
      if (!isPlaceholderError(result)) {
        if (result.type === 'assertion') {
          assertions.push(placeholderToAssertion(result, varPath));
        } else if (result.type === 'value') {
          assertions.push(`expect(${varPath}).toBe(${JSON.stringify(result.value)});`);
        }
      }
    } else if (typeof value === 'string') {
      assertions.push(`expect(${varPath}).toBe(${JSON.stringify(value)});`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      assertions.push(`expect(${varPath}).toBe(${value});`);
    } else if (value === null) {
      assertions.push(`expect(${varPath}).toBeNull();`);
    }
  }

  if (assertions.length === 0) {
    return null;
  }

  return assertions.join('\n        ');
}

// Note: Natural language parsing functions (_parseEqualsExpression, _parseComparisonInvariant,
// normalizeInvariantPath) were removed in favor of strict DSL parsing.
// See spec.speccodex.invariantDSL for the strict DSL specification.

// escapeString is imported from ./shared.js
