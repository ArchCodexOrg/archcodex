/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Bidirectional verification for SpecCodex.
 * Verifies that implementation matches spec and vice versa.
 *
 * Based on spec.speccodex.verify:
 * - All spec inputs have corresponding function parameters
 * - All error examples have corresponding error handling
 * - Implementation architecture matches spec.architectures
 * - Reports drift between spec and implementation
 */
import type { ResolvedSpec, Example } from './schema.js';

/**
 * Options for verification.
 */
export interface VerifyOptions {
  /** Project root for resolving paths */
  projectRoot?: string;
  /** Check architecture tag matches */
  checkArchitecture?: boolean;
  /** Check error handling */
  checkErrors?: boolean;
  /** Check input parameters */
  checkInputs?: boolean;
  /** Check output schema matches (Improvement #6) */
  checkOutputs?: boolean;
}

/**
 * Drift item - a difference between spec and implementation.
 */
export interface DriftItem {
  type:
    | 'missing_input'
    | 'extra_input'
    | 'missing_error'
    | 'extra_error'
    | 'architecture_mismatch'
    // Improvement #6: Output schema verification
    | 'missing_output'
    | 'extra_output'
    | 'output_type_mismatch';
  severity: 'error' | 'warning';
  field?: string;
  errorCode?: string;
  expected?: string;
  actual?: string;
  specField?: string;
  implField?: string;
  message: string;
}

/**
 * Result of verification.
 */
export interface VerifyResult {
  valid: boolean;
  specId: string;
  implementationPath: string;
  drift: DriftItem[];
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  coverage: {
    inputsCovered: number;
    inputsTotal: number;
    errorsCovered: number;
    errorsTotal: number;
    /** Improvement #6: Output coverage */
    outputsCovered: number;
    outputsTotal: number;
  };
}

/**
 * Extracted implementation info from source code.
 */
interface ImplementationInfo {
  parameters: string[];
  errorCodes: string[];
  archTags: string[];
  functionName?: string;
  /** Improvement #6: Return type fields extracted from implementation */
  returnFields: string[];
}

/**
 * Verify that an implementation matches its spec.
 */
export function verifyImplementation(
  spec: ResolvedSpec,
  implementationContent: string,
  implementationPath: string,
  options: VerifyOptions = {}
): VerifyResult {
  const {
    checkArchitecture = true,
    checkErrors = true,
    checkInputs = true,
    checkOutputs = true,
  } = options;

  const drift: DriftItem[] = [];

  // Extract info from implementation
  const implInfo = extractImplementationInfo(implementationContent);

  // Get spec info
  const specInputs = Object.keys(spec.node.inputs || {});
  const specOutputs = Object.keys(spec.node.outputs || {});
  const specErrors = extractSpecErrorCodes(spec);
  const specArchitectures = spec.node.architectures || [];

  let inputsCovered = 0;
  let errorsCovered = 0;
  let outputsCovered = 0;

  // Check inputs
  if (checkInputs && specInputs.length > 0) {
    for (const input of specInputs) {
      if (implInfo.parameters.includes(input)) {
        inputsCovered++;
      } else {
        // Check if it's in a destructured args object
        const inArgsObject = implInfo.parameters.some(p =>
          p === 'args' || p === 'input' || p === 'params'
        );

        if (inArgsObject) {
          // Check if the input name appears in the code (strip comments/strings to reduce false positives)
          const codeOnly = implementationContent
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(['"`])(?:(?!\1|\\).|\\.)*\1/g, '""');
          const inputPattern = new RegExp(`\\b${escapeRegex(input)}\\b`);
          if (inputPattern.test(codeOnly)) {
            inputsCovered++;
          } else {
            drift.push({
              type: 'missing_input',
              severity: 'error',
              field: input,
              message: `Spec input '${input}' not found in implementation`,
            });
          }
        } else {
          drift.push({
            type: 'missing_input',
            severity: 'error',
            field: input,
            message: `Spec input '${input}' not found in implementation parameters`,
          });
        }
      }
    }

    // Check for extra parameters (warning only)
    for (const param of implInfo.parameters) {
      if (!specInputs.includes(param) && !isCommonParameter(param)) {
        drift.push({
          type: 'extra_input',
          severity: 'warning',
          field: param,
          message: `Implementation parameter '${param}' not defined in spec inputs`,
        });
      }
    }
  }

  // Check error handling
  if (checkErrors && specErrors.length > 0) {
    for (const errorCode of specErrors) {
      if (implInfo.errorCodes.includes(errorCode)) {
        errorsCovered++;
      } else {
        // Check if error code appears anywhere in the file
        if (implementationContent.includes(errorCode)) {
          errorsCovered++;
        } else {
          drift.push({
            type: 'missing_error',
            severity: 'error',
            errorCode,
            message: `Spec error '${errorCode}' not handled in implementation`,
          });
        }
      }
    }

    // Check for extra error codes (warning)
    for (const errorCode of implInfo.errorCodes) {
      if (!specErrors.includes(errorCode) && !isCommonErrorCode(errorCode)) {
        drift.push({
          type: 'extra_error',
          severity: 'warning',
          errorCode,
          message: `Implementation throws '${errorCode}' but no spec example for it`,
        });
      }
    }
  }

  // Improvement #6: Check outputs
  if (checkOutputs && specOutputs.length > 0) {
    for (const output of specOutputs) {
      // Check if the output field appears in the return type or in the code
      const outputPattern = new RegExp(`\\b${escapeRegex(output)}\\b`);
      if (implInfo.returnFields.includes(output) || outputPattern.test(implementationContent)) {
        outputsCovered++;
      } else {
        drift.push({
          type: 'missing_output',
          severity: 'error',
          specField: output,
          field: output,
          message: `Spec output '${output}' not found in implementation return type`,
        });
      }
    }

    // Check for extra return fields (warning only)
    for (const field of implInfo.returnFields) {
      if (!specOutputs.includes(field) && !isCommonOutputField(field)) {
        drift.push({
          type: 'extra_output',
          severity: 'warning',
          implField: field,
          field: field,
          message: `Implementation returns '${field}' but not defined in spec outputs`,
        });
      }
    }
  }

  // Check architecture
  if (checkArchitecture && specArchitectures.length > 0) {
    for (const arch of specArchitectures) {
      if (!implInfo.archTags.includes(arch)) {
        drift.push({
          type: 'architecture_mismatch',
          severity: 'error',
          expected: arch,
          actual: implInfo.archTags[0] || 'none',
          message: `Expected @arch ${arch}, found ${implInfo.archTags[0] || 'no @arch tag'}`,
        });
      }
    }
  }

  // Determine validity
  const hasErrors = drift.some(d => d.severity === 'error');

  return {
    valid: !hasErrors,
    specId: spec.specId,
    implementationPath,
    drift,
    // Fix #1: Populate errors array from drift items with severity='error'
    errors: drift.filter(d => d.severity === 'error').map(d => ({
      code: d.type.toUpperCase(),
      message: d.message,
    })),
    warnings: drift.filter(d => d.severity === 'warning').map(d => ({
      code: d.type.toUpperCase(),
      message: d.message,
    })),
    coverage: {
      inputsCovered,
      inputsTotal: specInputs.length,
      errorsCovered,
      errorsTotal: specErrors.length,
      outputsCovered,
      outputsTotal: specOutputs.length,
    },
  };
}

/**
 * Extract implementation info from source code.
 */
function extractImplementationInfo(content: string): ImplementationInfo {
  const parameters: string[] = [];
  const errorCodes: string[] = [];
  const archTags: string[] = [];
  const returnFields: string[] = [];

  // Extract @arch tags
  const archMatches = content.matchAll(/@arch\s+([a-zA-Z0-9_.-]+)/g);
  for (const match of archMatches) {
    archTags.push(match[1]);
  }

  // Extract function parameters
  // Match: function name(params), const name = (params) =>, async (params) =>
  const funcPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(([^)]*)\)/g,
    /(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g,
    /(?:export\s+)?const\s+\w+\s*=\s*make\w+\(\s*(?:async\s+)?\(([^)]*)\)\s*=>/g,
    /(?:export\s+)?const\s+\w+\s*=\s*make\w+\(\s*\{[^}]*\},\s*(?:async\s+)?\(([^)]*)\)\s*=>/g,
  ];

  for (const pattern of funcPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const paramStr = match[1];
      if (paramStr) {
        // Parse parameters (handle destructuring, types, defaults)
        const params = parseParameters(paramStr);
        parameters.push(...params);
      }
    }
  }

  // Extract error codes from ConvexError, throw new Error, etc.
  const errorPatterns = [
    /ConvexError\s*\(\s*\{\s*code:\s*['"]([^'"]+)['"]/g,
    /ConvexError\s*\(\s*['"]([^'"]+)['"]/g,
    /throw\s+new\s+\w*Error\s*\(\s*\{\s*code:\s*['"]([^'"]+)['"]/g,
    /throw\s+new\s+\w*Error\s*\(\s*['"]([^'"]+)['"]/g,
    /error:\s*['"]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)['"]/g,
    /code:\s*['"]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)['"]/g,
  ];

  for (const pattern of errorPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const code = match[1];
      if (code && isErrorCode(code)) {
        errorCodes.push(code);
      }
    }
  }

  // Improvement #6: Extract return type fields
  // Look for return type annotations and object returns
  const returnPatterns = [
    // TypeScript return type: }: Promise<{ field1, field2 }>
    /\)\s*:\s*(?:Promise<)?\{\s*([^}]+)\s*\}/g,
    // Return statements: return { field1, field2 }
    /return\s+\{\s*([^}]+)\s*\}/g,
    // Interface/type definitions that might be return types
    /(?:interface|type)\s+\w*(?:Result|Response|Output)\w*\s*(?:=\s*)?\{\s*([^}]+)\s*\}/g,
  ];

  for (const pattern of returnPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const fieldsStr = match[1];
      if (fieldsStr) {
        // Extract field names from object notation
        const fields = extractObjectFields(fieldsStr);
        returnFields.push(...fields);
      }
    }
  }

  return {
    parameters: [...new Set(parameters)],
    errorCodes: [...new Set(errorCodes)],
    archTags: [...new Set(archTags)],
    returnFields: [...new Set(returnFields)],
  };
}

/**
 * Parse function parameters from a parameter string.
 */
function parseParameters(paramStr: string): string[] {
  const params: string[] = [];

  // Remove type annotations
  let cleaned = paramStr
    .replace(/:\s*[^,)=]+/g, '') // Remove type annotations
    .replace(/\s*=\s*[^,)]+/g, '') // Remove default values
    .trim();

  // Handle destructured objects: { a, b, c }
  const destructuredMatch = cleaned.match(/\{\s*([^}]+)\s*\}/);
  if (destructuredMatch) {
    const innerParams = destructuredMatch[1].split(',').map(p => p.trim());
    for (const p of innerParams) {
      // Handle renamed params: original: renamed
      const renamed = p.split(':')[0].trim();
      if (renamed && !renamed.startsWith('...')) {
        params.push(renamed);
      }
    }
  } else {
    // Simple parameters
    const simpleParams = cleaned.split(',').map(p => p.trim());
    for (const p of simpleParams) {
      if (p && !p.startsWith('...')) {
        params.push(p);
      }
    }
  }

  return params.filter(p => p.length > 0);
}

/**
 * Extract error codes from spec error examples.
 */
function extractSpecErrorCodes(spec: ResolvedSpec): string[] {
  const errorCodes: string[] = [];
  const errorExamples = spec.node.examples?.errors || [];

  for (const example of errorExamples as Example[]) {
    const then = example.then || {};

    // Check various error code patterns
    if (then.error) {
      errorCodes.push(String(then.error));
    }
    if (then['error.code']) {
      errorCodes.push(String(then['error.code']));
    }
    if (then['result.error']) {
      errorCodes.push(String(then['result.error']));
    }
    if (then['result.errors[0].code']) {
      errorCodes.push(String(then['result.errors[0].code']));
    }
  }

  return [...new Set(errorCodes)];
}

/**
 * Check if a string looks like an error code.
 */
function isErrorCode(str: string): boolean {
  // Error codes are UPPER_SNAKE_CASE with at least one underscore (NOT_FOUND, PERMISSION_DENIED)
  // This excludes false positives like PROD, RGB, USA, ACTIVE
  return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(str);
}

/**
 * Check if a parameter is a common/framework parameter.
 */
function isCommonParameter(param: string): boolean {
  const common = ['ctx', 'context', 'args', 'input', 'params', 'options', 'db', 'auth', 'user'];
  return common.includes(param.toLowerCase());
}

/**
 * Check if an error code is a common/framework error.
 */
function isCommonErrorCode(code: string): boolean {
  const common = ['NOT_FOUND', 'UNAUTHORIZED', 'FORBIDDEN', 'INTERNAL_ERROR', 'VALIDATION_ERROR'];
  return common.includes(code);
}

/**
 * Check if an output field is a common/framework field.
 * Improvement #6: Output schema verification
 */
function isCommonOutputField(field: string): boolean {
  const common = ['_id', 'id', '_creationTime', 'createdAt', 'updatedAt', 'creationTime'];
  return common.includes(field);
}

/**
 * Extract field names from an object notation string.
 * Improvement #6: Output schema verification
 */
function extractObjectFields(fieldsStr: string): string[] {
  const fields: string[] = [];

  // Split by commas, handling nested structures
  const parts = fieldsStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Handle "field: type" or "field: value" or just "field"
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const fieldName = trimmed.slice(0, colonIndex).trim();
      // Skip if it looks like a spread operator or computed property
      if (!fieldName.startsWith('...') && !fieldName.startsWith('[')) {
        fields.push(fieldName);
      }
    } else {
      // Just a field name (shorthand property)
      if (!trimmed.startsWith('...') && !trimmed.startsWith('[')) {
        fields.push(trimmed);
      }
    }
  }

  return fields;
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Infer implementation path from spec file path.
 * Convention: create.spec.yaml → create.ts
 */
export function inferImplementationPath(specFilePath: string): string {
  return specFilePath
    .replace(/\.spec\.yaml$/, '.ts')
    .replace(/\.spec\.yml$/, '.ts');
}

/**
 * Format verification result for display.
 */
export function formatVerifyResult(result: VerifyResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push(`✓ ${result.specId} matches ${result.implementationPath}`);
  } else {
    lines.push(`✗ ${result.specId} has drift from ${result.implementationPath}`);
  }

  // Coverage
  lines.push('');
  lines.push('Coverage:');
  lines.push(`  Inputs: ${result.coverage.inputsCovered}/${result.coverage.inputsTotal}`);
  lines.push(`  Outputs: ${result.coverage.outputsCovered}/${result.coverage.outputsTotal}`);
  lines.push(`  Errors: ${result.coverage.errorsCovered}/${result.coverage.errorsTotal}`);

  // Drift items
  if (result.drift.length > 0) {
    lines.push('');
    lines.push('Drift:');
    for (const item of result.drift) {
      const icon = item.severity === 'error' ? '✗' : '⚠';
      lines.push(`  ${icon} [${item.type}] ${item.message}`);
    }
  }

  return lines.join('\n');
}
