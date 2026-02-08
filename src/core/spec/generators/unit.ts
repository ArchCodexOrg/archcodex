/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Unit test generator for SpecCodex.
 * Generates unit tests from spec examples deterministically.
 *
 * Based on spec.speccodex.generate.unit:
 * - Each success example → one test case
 * - Each error example → one test case
 * - Each boundary → at least one test case
 * - Generated code is valid TypeScript
 * - Regeneration preserves code outside markers
 */
import type { ResolvedSpec, Example, BoundaryExample, InputField } from '../schema.js';
import { resolveImplementation } from '../resolver.js';
import {
  extractFunctionSignature,
  extractDependencies,
  type ExtractedSignature,
} from './signature-extractor.js';
import {
  expandValue,
  generateAssertion,
  escapeString,
  generateFunctionCallCode,
  specIdToFunctionName,
  deriveTestName,
  generateOutputSchemaAssertions,
  suggestImportPath,
  resolveErrorPattern,
  generateMockScaffolding,
  type CallPattern,
  type ErrorPattern,
  type PlaceholderContext,
} from './shared.js';
import type { FixtureRegistry } from '../fixtures.js';

/**
 * Options for unit test generation.
 */
export interface UnitGeneratorOptions {
  /** Test framework to use */
  framework?: 'vitest' | 'jest';
  /** Output file path */
  outputPath?: string;
  /** Add regeneration markers */
  markers?: boolean;
  /** Import path for the function under test */
  importPath?: string;
  /** Function name to test */
  functionName?: string;
  /**
   * Improvement #7: Coverage mode
   * - 'examples': Only generate tests from explicit examples (default)
   * - 'full': Generate additional tests from input schema:
   *   - Required vs optional field combinations
   *   - Enum value coverage
   *   - Boundary values (min/max)
   */
  coverage?: 'examples' | 'full';
  /** Project root for resolving implementation paths */
  projectRoot?: string;
  /** Fixture registry for resolving @fixtureName placeholders */
  fixtureRegistry?: FixtureRegistry;
}

/**
 * Result of unit test generation.
 */
export interface UnitGeneratorResult {
  valid: boolean;
  testCount: number;
  code: string;
  errors: Array<{ code: string; message: string }>;
  /** Improvement #4: Warnings about naming issues */
  warnings: Array<{ code: string; message: string }>;
  /** Test names generated (for traceability) */
  testNames: string[];
  /** Improvement #7: Coverage statistics */
  coverageStats?: {
    fromExamples: number;
    generated: number;
    enumCoverage: number;
    boundaryCoverage: number;
  };
}

const MARKER_START = '// @speccodex:start - DO NOT EDIT BETWEEN MARKERS';
const MARKER_END = '// @speccodex:end';

/**
 * Context for test generation, derived from signature extraction.
 */
interface TestContext {
  /** How to call the function: direct positional, destructured object, or factory */
  callPattern: CallPattern;
  /** Whether the function is async */
  isAsync: boolean;
  /** Whether errors are returned as values (vs thrown) */
  errorsAsReturnValues: boolean;
  /** Error assertion pattern based on architecture */
  errorPattern: ErrorPattern;
}

/**
 * Generate unit tests from a resolved spec.
 */
export function generateUnitTests(
  spec: ResolvedSpec,
  options: UnitGeneratorOptions = {}
): UnitGeneratorResult {
  const {
    framework = 'vitest',
    markers = true,
    coverage = 'examples',
    projectRoot,
    fixtureRegistry,
  } = options;

  // Create placeholder context for fixture resolution
  const placeholderContext: PlaceholderContext | undefined = fixtureRegistry
    ? { fixtureRegistry }
    : undefined;

  // Auto-resolve implementation if not explicitly provided
  let { importPath, functionName } = options;
  if (!importPath || !functionName) {
    const resolved = resolveImplementation(spec, options.outputPath);
    if (resolved) {
      importPath = importPath || resolved.importPath;
      functionName = functionName || resolved.functionName;
    }
  }

  // Extract function signature to determine call pattern
  let signature: ExtractedSignature | null = null;
  if (spec.node.implementation) {
    signature = extractFunctionSignature(spec.node.implementation, { projectRoot });
  }

  // Determine call pattern: direct positional, destructured object, or factory
  // If signature extraction worked, use detected pattern
  // Otherwise, infer from spec inputs: single object input = direct, multiple inputs = destructured
  let callPattern: CallPattern = 'destructured';
  if (signature?.valid) {
    callPattern = signature.callPattern;
  } else {
    // Infer from spec inputs when no signature available
    const inputs = spec.node.inputs;
    if (inputs) {
      const inputKeys = Object.keys(inputs);
      // Single input that is an object type should be passed directly
      if (inputKeys.length === 1) {
        const singleInput = inputs[inputKeys[0]];
        if (singleInput && typeof singleInput === 'object' && (singleInput as { type?: string }).type === 'object') {
          callPattern = 'direct';
        }
      }
    }
  }
  const isAsync = signature?.isAsync ?? true; // Default to async if unknown

  // Determine error handling: does spec define errors as return values?
  const errorsAsReturnValues = Boolean(spec.node.outputs && 'error' in (spec.node.outputs as Record<string, unknown>));

  const errors: Array<{ code: string; message: string }> = [];
  const lines: string[] = [];
  let generatedCount = 0;
  let enumCoverageCount = 0;
  let boundaryCoverageCount = 0;

  // Validate spec has examples
  const node = spec.node;
  if (!node.examples || (!node.examples.success?.length && !node.examples.errors?.length && !node.examples.boundaries?.length)) {
    return {
      valid: false,
      testCount: 0,
      code: '',
      errors: [{ code: 'NO_EXAMPLES', message: 'Spec has no examples to generate tests from' }],
      warnings: [],
      testNames: [],
    };
  }

  // Validate spec has intent
  if (!node.intent) {
    return {
      valid: false,
      testCount: 0,
      code: '',
      errors: [{ code: 'INVALID_SPEC', message: 'Spec is missing required field: intent' }],
      warnings: [],
      testNames: [],
    };
  }

  let testCount = 0;
  const warnings: Array<{ code: string; message: string }> = [];
  const testNames: string[] = [];
  const usedNames = new Set<string>();
  let unnamedCount = 0;

  // Extract dependencies for mock scaffolding.
  // Only mock external packages and node builtins, not relative imports.
  // Relative imports are sibling utilities that pure functions depend on
  // and should execute as-is in unit tests.
  const allDependencies = spec.node.implementation
    ? extractDependencies(spec.node.implementation, { projectRoot })
    : [];
  const dependencies = allDependencies.filter(dep => !dep.importPath.startsWith('.'));

  // Generate imports (add vi if we have dependencies to mock)
  const needsVi = dependencies.length > 0;
  lines.push(generateImports(framework, importPath, functionName, spec.specId, node.architectures, needsVi));
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
  const describeName = functionName || spec.specId.replace('spec.', '');
  lines.push(`describe('${describeName}', () => {`);

  // Helper to track and validate test names (Improvement #4)
  const trackName = (example: { name?: string }, category: string): string => {
    let name = example.name;
    if (!name) {
      unnamedCount++;
      name = `example ${unnamedCount}`;
      warnings.push({
        code: 'MISSING_NAME',
        message: `${category} example missing name, using '${name}'`,
      });
    } else if (usedNames.has(name)) {
      errors.push({
        code: 'DUPLICATE_NAME',
        message: `Duplicate example name: '${name}'`,
      });
    }
    usedNames.add(name);
    testNames.push(name);
    return name;
  };

  // Use resolved function name for test bodies, fallback to spec ID suffix
  const testFnName = functionName || specIdToFunctionName(spec.specId);

  // Resolve error pattern from architecture
  const errorPattern = resolveErrorPattern(node.architectures);

  // Test generation context
  const testCtx = { callPattern, isAsync, errorsAsReturnValues, errorPattern };

  // Success examples
  if (node.examples.success?.length) {
    lines.push(`  describe('success cases', () => {`);
    for (const example of node.examples.success) {
      trackName(example, 'success');
      const testCode = generateSuccessTest(example, testFnName, false, testCtx, placeholderContext);
      lines.push(testCode);
      testCount++;
    }
    lines.push(`  });`);
    lines.push('');
  }

  // Error examples
  if (node.examples.errors?.length) {
    lines.push(`  describe('error cases', () => {`);
    for (const example of node.examples.errors) {
      trackName(example, 'error');
      const testCode = generateErrorTest(example, testFnName, testCtx, placeholderContext);
      lines.push(testCode);
      testCount++;
    }
    lines.push(`  });`);
    lines.push('');
  }

  // Warning examples
  if (node.examples.warnings?.length) {
    lines.push(`  describe('warning cases', () => {`);
    for (const example of node.examples.warnings) {
      trackName(example, 'warning');
      const testCode = generateSuccessTest(example, testFnName, true, testCtx, placeholderContext);
      lines.push(testCode);
      testCount++;
    }
    lines.push(`  });`);
    lines.push('');
  }

  // Boundary examples
  if (node.examples.boundaries?.length) {
    lines.push(`  describe('boundary cases', () => {`);
    for (const boundary of node.examples.boundaries as BoundaryExample[]) {
      trackName(boundary, 'boundary');
      const testCode = generateBoundaryTest(boundary, testFnName, testCtx, placeholderContext);
      lines.push(testCode);
      testCount++;
    }
    lines.push(`  });`);
  }

  // Improvement #7: Full coverage generation
  if (coverage === 'full' && node.inputs) {
    const coverageResult = generateCoverageTests(
      node.inputs,
      testFnName,
      usedNames,
      trackName,
      node.outputs as Record<string, unknown> | undefined
    );
    if (coverageResult.code) {
      lines.push('');
      lines.push(coverageResult.code);
      testCount += coverageResult.testCount;
      generatedCount = coverageResult.testCount;
      enumCoverageCount = coverageResult.enumTests;
      boundaryCoverageCount = coverageResult.boundaryTests;
    }
  }

  lines.push(`});`);

  // End markers
  if (markers) {
    lines.push(MARKER_END);
  }

  // If there are duplicate name errors, mark as invalid
  const hasDuplicateErrors = errors.some(e => e.code === 'DUPLICATE_NAME');

  const fromExamples = testCount - generatedCount;

  return {
    valid: !hasDuplicateErrors,
    testCount,
    code: lines.join('\n'),
    errors,
    warnings,
    testNames,
    // Improvement #7: Coverage statistics
    coverageStats: coverage === 'full' ? {
      fromExamples,
      generated: generatedCount,
      enumCoverage: enumCoverageCount,
      boundaryCoverage: boundaryCoverageCount,
    } : undefined,
  };
}

/**
 * Generate imports section.
 */
function generateImports(
  framework: 'vitest' | 'jest',
  importPath?: string,
  functionName?: string,
  specId?: string,
  architectures?: string[],
  needsVi = false
): string {
  const lines: string[] = [];

  // Framework imports
  if (framework === 'vitest') {
    if (needsVi) {
      lines.push(`import { describe, it, expect, vi } from 'vitest';`);
    } else {
      lines.push(`import { describe, it, expect } from 'vitest';`);
    }
  }
  // Jest uses globals, no imports needed

  // Function import
  if (importPath && functionName) {
    lines.push(`import { ${functionName} } from '${importPath}';`);
  } else if (specId) {
    // Generate a suggested import based on spec context
    const suggestedFn = specIdToFunctionName(specId);
    const suggestedPath = suggestImportPath(specId, architectures);
    lines.push(`// TODO: Verify import path matches your project structure`);
    lines.push(`import { ${suggestedFn} } from '${suggestedPath}';`);
  }

  return lines.join('\n');
}

/**
 * Generate a success test case.
 */
function generateSuccessTest(
  example: Example,
  fnName: string,
  _isWarning = false,
  ctx: TestContext = { callPattern: 'destructured', isAsync: true, errorsAsReturnValues: false, errorPattern: 'standard' },
  placeholderCtx?: PlaceholderContext
): string {
  const lines: string[] = [];
  // Derive descriptive name from given/then if not explicitly named
  const testName = example.name || deriveTestName(example.given, example.then, false);
  const indent = '    ';

  const asyncPrefix = ctx.isAsync ? 'async ' : '';
  lines.push(`${indent}it('${escapeString(testName)}', ${asyncPrefix}() => {`);

  // Setup - expand given values
  if (example.given) {
    lines.push(`${indent}  // Arrange`);
    for (const [key, value] of Object.entries(example.given)) {
      if (key === '<<') continue; // Skip YAML anchor merge
      const expandedValue = expandValue(value, placeholderCtx);
      lines.push(`${indent}  const ${key} = ${expandedValue};`);
    }
    lines.push('');
  }

  // Act
  lines.push(`${indent}  // Act`);
  const awaitPrefix = ctx.isAsync ? 'await ' : '';
  const args = example.given
    ? Object.keys(example.given).filter(k => k !== '<<')
    : [];
  const callCode = generateFunctionCallCode(fnName, args, ctx.callPattern);
  lines.push(`${indent}  const result = ${awaitPrefix}${callCode};`);
  lines.push('');

  // Assert
  lines.push(`${indent}  // Assert`);
  if (example.then) {
    for (const [key, value] of Object.entries(example.then)) {
      const assertion = generateAssertion(key, value);
      lines.push(`${indent}  ${assertion}`);
    }
  }

  lines.push(`${indent}});`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate an error test case.
 */
function generateErrorTest(
  example: Example,
  fnName: string,
  ctx: TestContext = { callPattern: 'destructured', isAsync: true, errorsAsReturnValues: false, errorPattern: 'standard' },
  placeholderCtx?: PlaceholderContext
): string {
  const lines: string[] = [];
  // Derive descriptive name from given/then if not explicitly named
  const testName = example.name || deriveTestName(example.given, example.then, true);
  const indent = '    ';

  const asyncPrefix = ctx.isAsync ? 'async ' : '';
  lines.push(`${indent}it('${escapeString(testName)}', ${asyncPrefix}() => {`);

  // Setup - expand given values
  if (example.given) {
    lines.push(`${indent}  // Arrange`);
    for (const [key, value] of Object.entries(example.given)) {
      if (key === '<<') continue;
      const expandedValue = expandValue(value, placeholderCtx);
      lines.push(`${indent}  const ${key} = ${expandedValue};`);
    }
    lines.push('');
  }

  // Get args for function call
  const args = example.given
    ? Object.keys(example.given).filter(k => k !== '<<')
    : [];
  const callCode = generateFunctionCallCode(fnName, args, ctx.callPattern);

  // Check what error is expected
  const expectedError = example.then?.error || example.then?.['error.code'];
  const expectedResultError = example.then?.['result.error'];

  // Check if any result.* assertions exist (indicates return value pattern)
  const hasResultAssertions = example.then && Object.keys(example.then).some(
    key => key.startsWith('result.') && key !== 'result.error'
  );

  // Determine error handling pattern based on spec outputs and then clause
  // Use return value pattern if:
  // - Spec defines outputs.error (errorsAsReturnValues)
  // - Example has result.valid: false
  // - Example has result.error assertion
  // - Example has any other result.* assertions (not a thrown error)
  const useReturnValuePattern = ctx.errorsAsReturnValues ||
    example.then?.['result.valid'] === false ||
    expectedResultError !== undefined ||
    hasResultAssertions;

  if (useReturnValuePattern) {
    // Errors are returned as values (e.g., { valid: false, error: "CODE" })
    lines.push(`${indent}  // Act`);
    const awaitPrefix = ctx.isAsync ? 'await ' : '';
    lines.push(`${indent}  const result = ${awaitPrefix}${callCode};`);
    lines.push('');
    lines.push(`${indent}  // Assert`);

    // Generate assertions for all result.* fields in then clause
    if (example.then) {
      for (const [key, value] of Object.entries(example.then)) {
        if (key.startsWith('result.') || key === 'result') {
          const assertion = generateAssertion(key, value);
          lines.push(`${indent}  ${assertion}`);
        }
      }
    }

    // Fallback: if no result.* assertions but we have error code, add it
    if (!hasResultAssertions && !example.then?.['result.error']) {
      if (expectedResultError) {
        lines.push(`${indent}  expect(result.error).toBe('${expectedResultError}');`);
      } else if (expectedError) {
        lines.push(`${indent}  expect(result.error).toBe('${expectedError}');`);
      }
    }
  } else {
    // Errors are thrown as exceptions
    lines.push(`${indent}  // Act & Assert`);
    if (expectedError) {
      const awaitPrefix = ctx.isAsync ? 'await ' : '';
      if (ctx.errorPattern === 'convex') {
        // Convex: errors wrapped in ConvexError with data.code
        lines.push(`${indent}  ${awaitPrefix}expect(${callCode})`);
        lines.push(`${indent}    .rejects.toMatchObject({ data: { code: '${expectedError}' } });`);
      } else {
        // Standard: plain thrown errors
        lines.push(`${indent}  ${awaitPrefix}expect(${callCode})`);
        lines.push(`${indent}    .rejects.toThrow('${expectedError}');`);
      }
    } else {
      const awaitPrefix = ctx.isAsync ? 'await ' : '';
      lines.push(`${indent}  ${awaitPrefix}expect(${callCode})`);
      lines.push(`${indent}    .rejects.toThrow();`);
    }
  }

  lines.push(`${indent}});`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate a boundary test case.
 */
function generateBoundaryTest(
  boundary: BoundaryExample,
  fnName: string,
  ctx: TestContext = { callPattern: 'destructured', isAsync: true, errorsAsReturnValues: false, errorPattern: 'standard' },
  placeholderCtx?: PlaceholderContext
): string {
  const lines: string[] = [];
  const testName = boundary.name;
  const indent = '    ';

  const asyncPrefix = ctx.isAsync ? 'async ' : '';
  lines.push(`${indent}it('${escapeString(testName)}', ${asyncPrefix}() => {`);

  // Expand boundary values (they often use @ placeholders)
  lines.push(`${indent}  // Arrange - boundary condition`);
  const given = { ...boundary };
  delete (given as Record<string, unknown>).name;
  delete (given as Record<string, unknown>).then;
  delete (given as Record<string, unknown>).property;
  delete (given as Record<string, unknown>).description;

  for (const [key, value] of Object.entries(given)) {
    const expandedValue = expandValue(value, placeholderCtx);
    lines.push(`${indent}  const ${key} = ${expandedValue};`);
  }
  lines.push('');

  // Act
  lines.push(`${indent}  // Act`);
  const awaitPrefix = ctx.isAsync ? 'await ' : '';
  const args = Object.keys(given);
  const callCode = generateFunctionCallCode(fnName, args, ctx.callPattern);
  lines.push(`${indent}  const result = ${awaitPrefix}${callCode};`);
  lines.push('');

  // Assert
  lines.push(`${indent}  // Assert`);
  if (boundary.then) {
    for (const [key, value] of Object.entries(boundary.then)) {
      const assertion = generateAssertion(key, value);
      lines.push(`${indent}  ${assertion}`);
    }
  }

  lines.push(`${indent}});`);
  lines.push('');

  return lines.join('\n');
}

// Key quoting, value expansion, assertion generation, and escaping
// are imported from ./shared.js to enable reuse across generators

/**
 * Improvement #7: Generate additional coverage tests from input schema.
 * Creates tests for:
 * - Enum values not covered by examples
 * - Boundary values (min/max) not covered by examples
 * - Optional field combinations
 */
function generateCoverageTests(
  inputs: Record<string, InputField>,
  fnName: string,
  usedNames: Set<string>,
  trackName: (example: { name?: string }, category: string) => string,
  outputs?: Record<string, unknown>
): {
  code: string;
  testCount: number;
  enumTests: number;
  boundaryTests: number;
} {
  const lines: string[] = [];
  let testCount = 0;
  let enumTests = 0;
  let boundaryTests = 0;
  const indent = '    ';

  // Generate output-specific assertions instead of generic toBeDefined()
  const outputAssertions = generateOutputSchemaAssertions(outputs, `${indent}  `);

  // Collect generated tests
  const enumTestLines: string[] = [];
  const boundaryTestLines: string[] = [];

  for (const [field, inputDef] of Object.entries(inputs)) {
    // Generate enum value tests
    if (inputDef.type === 'enum' && inputDef.values?.length) {
      for (const value of inputDef.values) {
        const testName = `handles ${field}=${value}`;
        if (!usedNames.has(testName)) {
          trackName({ name: testName }, 'generated');
          enumTestLines.push(`${indent}it('${escapeString(testName)}', async () => {`);
          enumTestLines.push(`${indent}  // Generated: enum value coverage`);
          enumTestLines.push(`${indent}  const result = await ${fnName}({ ${field}: '${value}' });`);
          enumTestLines.push(...outputAssertions);
          enumTestLines.push(`${indent}});`);
          enumTestLines.push('');
          testCount++;
          enumTests++;
        }
      }
    }

    // Generate boundary tests for numeric fields
    if (inputDef.type === 'number') {
      // Min boundary
      if (inputDef.min !== undefined) {
        const testName = `${field} at minimum (${inputDef.min})`;
        if (!usedNames.has(testName)) {
          trackName({ name: testName }, 'generated');
          boundaryTestLines.push(`${indent}it('${escapeString(testName)}', async () => {`);
          boundaryTestLines.push(`${indent}  // Generated: minimum boundary`);
          boundaryTestLines.push(`${indent}  const result = await ${fnName}({ ${field}: ${inputDef.min} });`);
          boundaryTestLines.push(...outputAssertions);
          boundaryTestLines.push(`${indent}});`);
          boundaryTestLines.push('');
          testCount++;
          boundaryTests++;
        }

        // Below min should fail
        const belowMinName = `${field} below minimum fails`;
        if (!usedNames.has(belowMinName)) {
          trackName({ name: belowMinName }, 'generated');
          boundaryTestLines.push(`${indent}it('${escapeString(belowMinName)}', async () => {`);
          boundaryTestLines.push(`${indent}  // Generated: below minimum boundary`);
          boundaryTestLines.push(`${indent}  await expect(${fnName}({ ${field}: ${inputDef.min - 1} }))`);
          boundaryTestLines.push(`${indent}    .rejects.toThrow();`);
          boundaryTestLines.push(`${indent}});`);
          boundaryTestLines.push('');
          testCount++;
          boundaryTests++;
        }
      }

      // Max boundary
      if (inputDef.max !== undefined) {
        const testName = `${field} at maximum (${inputDef.max})`;
        if (!usedNames.has(testName)) {
          trackName({ name: testName }, 'generated');
          boundaryTestLines.push(`${indent}it('${escapeString(testName)}', async () => {`);
          boundaryTestLines.push(`${indent}  // Generated: maximum boundary`);
          boundaryTestLines.push(`${indent}  const result = await ${fnName}({ ${field}: ${inputDef.max} });`);
          boundaryTestLines.push(...outputAssertions);
          boundaryTestLines.push(`${indent}});`);
          boundaryTestLines.push('');
          testCount++;
          boundaryTests++;
        }

        // Above max should fail
        const aboveMaxName = `${field} above maximum fails`;
        if (!usedNames.has(aboveMaxName)) {
          trackName({ name: aboveMaxName }, 'generated');
          boundaryTestLines.push(`${indent}it('${escapeString(aboveMaxName)}', async () => {`);
          boundaryTestLines.push(`${indent}  // Generated: above maximum boundary`);
          boundaryTestLines.push(`${indent}  await expect(${fnName}({ ${field}: ${inputDef.max + 1} }))`);
          boundaryTestLines.push(`${indent}    .rejects.toThrow();`);
          boundaryTestLines.push(`${indent}});`);
          boundaryTestLines.push('');
          testCount++;
          boundaryTests++;
        }
      }
    }

    // Generate boundary tests for string fields with max length
    if (inputDef.type === 'string' && inputDef.max !== undefined) {
      const testName = `${field} at max length (${inputDef.max})`;
      if (!usedNames.has(testName)) {
        trackName({ name: testName }, 'generated');
        boundaryTestLines.push(`${indent}it('${escapeString(testName)}', async () => {`);
        boundaryTestLines.push(`${indent}  // Generated: string max length boundary`);
        boundaryTestLines.push(`${indent}  const ${field} = 'a'.repeat(${inputDef.max});`);
        boundaryTestLines.push(`${indent}  const result = await ${fnName}({ ${field} });`);
        boundaryTestLines.push(...outputAssertions);
        boundaryTestLines.push(`${indent}});`);
        boundaryTestLines.push('');
        testCount++;
        boundaryTests++;
      }

      // Above max should fail
      const aboveMaxName = `${field} exceeds max length fails`;
      if (!usedNames.has(aboveMaxName)) {
        trackName({ name: aboveMaxName }, 'generated');
        boundaryTestLines.push(`${indent}it('${escapeString(aboveMaxName)}', async () => {`);
        boundaryTestLines.push(`${indent}  // Generated: string above max length`);
        boundaryTestLines.push(`${indent}  const ${field} = 'a'.repeat(${inputDef.max + 1});`);
        boundaryTestLines.push(`${indent}  await expect(${fnName}({ ${field} }))`);
        boundaryTestLines.push(`${indent}    .rejects.toThrow();`);
        boundaryTestLines.push(`${indent}});`);
        boundaryTestLines.push('');
        testCount++;
        boundaryTests++;
      }
    }
  }

  // Build output
  if (enumTestLines.length > 0) {
    lines.push(`  describe('enum value coverage (generated)', () => {`);
    lines.push(...enumTestLines);
    lines.push(`  });`);
  }

  if (boundaryTestLines.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`  describe('boundary coverage (generated)', () => {`);
    lines.push(...boundaryTestLines);
    lines.push(`  });`);
  }

  return {
    code: lines.join('\n'),
    testCount,
    enumTests,
    boundaryTests,
  };
}

// escapeString and generateFunctionCallCode are imported from ./shared.js

/**
 * Extract generated code between markers from existing file content.
 * Used for regeneration to preserve manual additions.
 */
export function extractManualCode(existingContent: string): { before: string; after: string } | null {
  const startIndex = existingContent.indexOf(MARKER_START);
  const endIndex = existingContent.indexOf(MARKER_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  return {
    before: existingContent.slice(0, startIndex),
    after: existingContent.slice(endIndex + MARKER_END.length),
  };
}

/**
 * Merge generated code with existing manual code.
 */
export function mergeWithExisting(
  generatedCode: string,
  existingContent: string
): string {
  const manual = extractManualCode(existingContent);

  if (!manual) {
    // No markers found, return generated code only
    return generatedCode;
  }

  // Replace content between markers
  const startIndex = generatedCode.indexOf(MARKER_START);
  const endIndex = generatedCode.indexOf(MARKER_END);

  // If generated code has no markers, preserve existing manual code by finding markers in existing content
  if (startIndex === -1 || endIndex === -1) {
    const manualFromExisting = extractManualCode(existingContent);
    if (manualFromExisting) {
      return manualFromExisting.before + generatedCode + manualFromExisting.after;
    }
    return generatedCode;
  }

  const generatedSection = generatedCode.slice(startIndex, endIndex + MARKER_END.length);

  return manual.before + generatedSection + manual.after;
}
