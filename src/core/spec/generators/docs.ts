/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Documentation generator for SpecCodex.
 * Transforms resolved specs into Markdown documentation.
 *
 * Based on spec.speccodex.docs.*:
 * - Generate API reference from inputs/outputs/security
 * - Generate usage examples from examples.success
 * - Generate error catalog from examples.errors
 * - Generate combined documentation with TOC
 */
import type { ResolvedSpec, InputField, OutputField, Example } from '../schema.js';
import { specIdToFunctionName } from './shared.js';

// ============================================================================
// Types
// ============================================================================

export interface DocGeneratorOptions {
  includeExamples?: boolean;
  linkToImplementation?: boolean;
  format?: 'markdown' | 'html';
  framework?: 'vanilla' | 'convex' | 'nextjs';
  includeSetup?: boolean;
  includeHttpCodes?: boolean;
  groupByCategory?: boolean;
  sections?: Array<'api' | 'examples' | 'errors'>;
  outputMode?: 'single' | 'multiple';
  includeToc?: boolean;
}

export interface DocGeneratorResult {
  valid: boolean;
  markdown: string;
  sections?: string[];
  exampleCount?: number;
  errorCount?: number;
  files?: Array<{ name: string; content: string }>;
  errors: Array<{ code: string; message: string }>;
}

// ============================================================================
// HTTP Status Code Mapping
// ============================================================================

const ERROR_TO_HTTP: Record<string, number> = {
  NOT_FOUND: 404,
  NOT_AUTHENTICATED: 401,
  UNAUTHORIZED: 401,
  PERMISSION_DENIED: 403,
  FORBIDDEN: 403,
  INVALID_URL: 400,
  INVALID_INPUT: 400,
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  ALREADY_EXISTS: 409,
  RATE_LIMITED: 429,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVER_ERROR: 500,
};

function getHttpCode(errorCode: string): number | undefined {
  // Direct match
  if (ERROR_TO_HTTP[errorCode]) {
    return ERROR_TO_HTTP[errorCode];
  }
  // Pattern matching
  if (errorCode.includes('NOT_FOUND')) return 404;
  if (errorCode.includes('UNAUTHORIZED') || errorCode.includes('UNAUTHENTICATED')) return 401;
  if (errorCode.includes('FORBIDDEN') || errorCode.includes('PERMISSION')) return 403;
  if (errorCode.includes('INVALID') || errorCode.includes('VALIDATION')) return 400;
  if (errorCode.includes('CONFLICT') || errorCode.includes('EXISTS')) return 409;
  if (errorCode.includes('RATE') || errorCode.includes('LIMIT')) return 429;
  return undefined;
}

// ============================================================================
// API Reference Generator
// ============================================================================

/**
 * Generate API reference documentation from a spec.
 */
export function generateApiDocs(
  spec: ResolvedSpec,
  options: DocGeneratorOptions = {}
): DocGeneratorResult {
  const errors: Array<{ code: string; message: string }> = [];

  // Validate required fields
  if (!spec.node.intent) {
    return {
      valid: false,
      markdown: '',
      errors: [{ code: 'MISSING_INTENT', message: 'Spec must have an intent field' }],
    };
  }

  const sections: string[] = [];
  const lines: string[] = [];

  // Title from spec ID
  const title = formatTitle(spec.specId);
  lines.push(`## ${title}`);
  lines.push('');
  lines.push(`> ${spec.node.intent}`);
  lines.push('');

  // Description if present
  if (spec.node.description) {
    lines.push(spec.node.description);
    lines.push('');
  }

  // Security section
  if (spec.node.security) {
    sections.push('security');
    lines.push('### Security');
    lines.push('');

    const security = spec.node.security;
    if (security.authentication) {
      const authText = security.authentication === 'required'
        ? '**Required** - User must be authenticated'
        : security.authentication === 'optional'
          ? 'Optional - Works with or without authentication'
          : 'None required';
      lines.push(`- **Authentication**: ${authText}`);
    }
    if (security.rate_limit) {
      lines.push(`- **Rate limit**: ${security.rate_limit.requests} requests per ${security.rate_limit.window}`);
    }
    if (security.permissions?.length) {
      lines.push(`- **Permissions**: ${security.permissions.join(', ')}`);
    }
    lines.push('');
  }

  // Parameters section (inputs)
  if (spec.node.inputs && Object.keys(spec.node.inputs).length > 0) {
    sections.push('parameters');
    lines.push('### Parameters');
    lines.push('');
    lines.push('| Name | Type | Required | Description |');
    lines.push('|------|------|----------|-------------|');

    for (const [name, field] of Object.entries(spec.node.inputs)) {
      const typeStr = formatFieldType(field);
      const required = field.required ? '✓' : '';
      const desc = formatFieldDescription(field);
      lines.push(`| \`${name}\` | ${typeStr} | ${required} | ${desc} |`);
    }
    lines.push('');
  }

  // Returns section (outputs)
  if (spec.node.outputs && Object.keys(spec.node.outputs).length > 0) {
    sections.push('returns');
    lines.push('### Returns');
    lines.push('');
    lines.push('| Field | Type | Description |');
    lines.push('|-------|------|-------------|');

    for (const [name, field] of Object.entries(spec.node.outputs)) {
      const typeStr = formatOutputType(field);
      const desc = field.description || '';
      const optional = field.optional ? ' *(optional)*' : '';
      lines.push(`| \`${name}\` | ${typeStr} | ${desc}${optional} |`);
    }
    lines.push('');
  }

  // Examples section
  if (options.includeExamples && spec.node.examples?.success?.length) {
    sections.push('examples');
    lines.push('### Example');
    lines.push('');

    const example = spec.node.examples.success[0];
    lines.push('```typescript');
    lines.push(formatExampleCode(spec, example, options.framework || 'vanilla'));
    lines.push('```');
    lines.push('');
  }

  // Implementation link
  if (options.linkToImplementation && spec.node.implementation) {
    lines.push('### Implementation');
    lines.push('');
    lines.push(`Source: [\`${spec.node.implementation}\`](${spec.node.implementation})`);
    lines.push('');
  }

  return {
    valid: true,
    markdown: lines.join('\n'),
    sections,
    errors,
  };
}

// ============================================================================
// Usage Examples Generator
// ============================================================================

/**
 * Generate usage examples documentation from a spec.
 */
export function generateExampleDocs(
  spec: ResolvedSpec,
  options: DocGeneratorOptions = {}
): DocGeneratorResult {
  const errors: Array<{ code: string; message: string }> = [];

  // Validate required fields
  if (!spec.node.examples?.success?.length) {
    return {
      valid: false,
      markdown: '',
      exampleCount: 0,
      errors: [{ code: 'NO_EXAMPLES', message: 'Spec must have success examples' }],
    };
  }

  const lines: string[] = [];
  const examples = spec.node.examples.success;
  const framework = options.framework || 'vanilla';

  lines.push('## Usage Examples');
  lines.push('');

  // Setup code if requested
  if (options.includeSetup) {
    lines.push('### Setup');
    lines.push('');
    lines.push('```typescript');
    lines.push(generateSetupCode(spec, framework));
    lines.push('```');
    lines.push('');
  }

  // Generate each example
  for (const example of examples) {
    const name = example.name || 'Example';
    lines.push(`### ${name}`);
    lines.push('');
    lines.push('```typescript');
    lines.push(formatExampleCode(spec, example, framework));
    lines.push('```');
    lines.push('');
  }

  return {
    valid: true,
    markdown: lines.join('\n'),
    exampleCount: examples.length,
    errors,
  };
}

// ============================================================================
// Error Catalog Generator
// ============================================================================

/**
 * Generate error catalog documentation from a spec.
 */
export function generateErrorDocs(
  spec: ResolvedSpec,
  options: DocGeneratorOptions = {}
): DocGeneratorResult {
  const errors: Array<{ code: string; message: string }> = [];

  // Validate required fields
  if (!spec.node.examples?.errors?.length) {
    return {
      valid: false,
      markdown: '',
      errorCount: 0,
      errors: [{ code: 'NO_ERROR_EXAMPLES', message: 'Spec must have error examples' }],
    };
  }

  const lines: string[] = [];
  const errorExamples = spec.node.examples.errors;
  const includeHttp = options.includeHttpCodes !== false;

  lines.push('## Error Reference');
  lines.push('');

  // Build table header
  const headers = includeHttp
    ? '| Code | HTTP | Cause | Resolution |'
    : '| Code | Cause | Resolution |';
  const divider = includeHttp
    ? '|------|------|-------|------------|'
    : '|------|-------|------------|';

  lines.push(headers);
  lines.push(divider);

  // Generate each error row
  for (const example of errorExamples) {
    const errorCode = extractErrorCode(example);
    const cause = deriveCause(example);
    const resolution = deriveResolution(errorCode);
    const httpCode = includeHttp ? getHttpCode(errorCode) : undefined;

    if (includeHttp) {
      const httpStr = httpCode ? String(httpCode) : '-';
      lines.push(`| \`${errorCode}\` | ${httpStr} | ${cause} | ${resolution} |`);
    } else {
      lines.push(`| \`${errorCode}\` | ${cause} | ${resolution} |`);
    }
  }

  lines.push('');

  return {
    valid: true,
    markdown: lines.join('\n'),
    errorCount: errorExamples.length,
    errors,
  };
}

// ============================================================================
// Combined Documentation Generator
// ============================================================================

/**
 * Generate complete documentation combining all types.
 */
export function generateAllDocs(
  spec: ResolvedSpec,
  options: DocGeneratorOptions = {}
): DocGeneratorResult {
  const errors: Array<{ code: string; message: string }> = [];
  const sectionsToInclude = options.sections || ['api', 'examples', 'errors'];
  const outputMode = options.outputMode || 'single';

  // Validate spec has intent
  if (!spec.node.intent) {
    return {
      valid: false,
      markdown: '',
      errors: [{ code: 'MISSING_INTENT', message: 'Spec must have an intent field' }],
    };
  }

  if (outputMode === 'multiple') {
    // Generate separate files
    const files: Array<{ name: string; content: string }> = [];

    if (sectionsToInclude.includes('api')) {
      const apiResult = generateApiDocs(spec, { ...options, includeExamples: false });
      if (apiResult.valid) {
        files.push({ name: 'api.md', content: apiResult.markdown });
      }
    }

    if (sectionsToInclude.includes('examples') && spec.node.examples?.success?.length) {
      const exampleResult = generateExampleDocs(spec, options);
      if (exampleResult.valid) {
        files.push({ name: 'examples.md', content: exampleResult.markdown });
      }
    }

    if (sectionsToInclude.includes('errors') && spec.node.examples?.errors?.length) {
      const errorResult = generateErrorDocs(spec, options);
      if (errorResult.valid) {
        files.push({ name: 'errors.md', content: errorResult.markdown });
      }
    }

    return {
      valid: true,
      markdown: '',
      files,
      errors,
    };
  }

  // Single file mode
  const lines: string[] = [];
  const title = formatTitle(spec.specId);

  lines.push(`# ${title}`);
  lines.push('');

  // Table of contents
  if (options.includeToc !== false) {
    lines.push('## Table of Contents');
    lines.push('');
    if (sectionsToInclude.includes('api')) {
      lines.push('- [API Reference](#api-reference)');
    }
    if (sectionsToInclude.includes('examples') && spec.node.examples?.success?.length) {
      lines.push('- [Usage Examples](#usage-examples)');
    }
    if (sectionsToInclude.includes('errors') && spec.node.examples?.errors?.length) {
      lines.push('- [Error Reference](#error-reference)');
    }
    lines.push('');
  }

  // API Reference section
  if (sectionsToInclude.includes('api')) {
    const apiResult = generateApiDocs(spec, { ...options, includeExamples: true });
    if (apiResult.valid) {
      // Replace heading level (## → ###) for combined doc
      const apiContent = apiResult.markdown.replace(/^## /gm, '### ');
      lines.push('## API Reference');
      lines.push('');
      lines.push(apiContent);
    }
  }

  // Usage Examples section
  if (sectionsToInclude.includes('examples') && spec.node.examples?.success?.length) {
    const exampleResult = generateExampleDocs(spec, options);
    if (exampleResult.valid) {
      lines.push(exampleResult.markdown);
    }
  }

  // Error Reference section
  if (sectionsToInclude.includes('errors') && spec.node.examples?.errors?.length) {
    const errorResult = generateErrorDocs(spec, options);
    if (errorResult.valid) {
      lines.push(errorResult.markdown);
    }
  }

  return {
    valid: true,
    markdown: lines.join('\n'),
    errors,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format spec ID as a human-readable title.
 * spec.product.create → Create Product
 */
function formatTitle(specId: string): string {
  const parts = specId.split('.');
  // Skip 'spec' prefix and reverse to get "Create Product" instead of "Product Create"
  const relevantParts = parts.slice(1);
  if (relevantParts.length >= 2) {
    const action = relevantParts[relevantParts.length - 1];
    const resource = relevantParts[relevantParts.length - 2];
    return `${capitalize(action)} ${capitalize(resource)}`;
  }
  return relevantParts.map(capitalize).join(' ');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format input field type for display.
 */
function formatFieldType(field: InputField): string {
  if (field.type === 'enum' && field.values) {
    return `enum: ${field.values.join(' \\| ')}`;
  }
  if (field.type === 'id' && field.table) {
    return `id<${field.table}>`;
  }
  if (field.type === 'array' && field.items) {
    const items = field.items as Record<string, unknown> | undefined;
    const itemType = typeof field.items === 'object' && items?.type ? String(items.type) : 'unknown';
    return `${itemType}[]`;
  }
  return field.type;
}

/**
 * Format output field type for display.
 */
function formatOutputType(field: OutputField): string {
  if (field.type === 'enum' && field.values) {
    return `enum: ${field.values.join(' \\| ')}`;
  }
  if (field.type === 'id' && field.table) {
    return `id<${field.table}>`;
  }
  if (field.type === 'array' && field.items) {
    const items = field.items as Record<string, unknown> | undefined;
    const itemType = typeof field.items === 'object' && items?.type ? String(items.type) : 'unknown';
    return `${itemType}[]`;
  }
  return field.type;
}

/**
 * Format input field description including constraints.
 */
function formatFieldDescription(field: InputField): string {
  const parts: string[] = [];

  if (field.description) {
    parts.push(field.description);
  }

  const constraints: string[] = [];
  if (field.max !== undefined) constraints.push(`max: ${field.max}`);
  if (field.min !== undefined) constraints.push(`min: ${field.min}`);
  if (field.validate) constraints.push(`validate: ${field.validate}`);
  if (field.pattern) constraints.push(`pattern: ${field.pattern}`);

  if (constraints.length > 0) {
    parts.push(`(${constraints.join(', ')})`);
  }

  return parts.join(' ') || '-';
}

/**
 * Generate setup code for examples.
 */
function generateSetupCode(spec: ResolvedSpec, framework: string): string {
  const funcName = specIdToFunctionName(spec.specId);

  if (framework === 'convex') {
    return `import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';

// Setup authenticated context
const ${funcName} = useMutation(api.${spec.specId.replace(/^spec\./, '').replace(/\./g, '.')});`;
  }

  if (framework === 'nextjs') {
    return `'use client';

import { ${funcName} } from '@/lib/api';

// Setup authenticated context
const ctx = createAuthenticatedContext();`;
  }

  // vanilla
  return `import { ${funcName} } from './${funcName}.js';

// Setup authenticated context
const ctx = createAuthenticatedContext();`;
}

/**
 * Format example as TypeScript code.
 */
function formatExampleCode(spec: ResolvedSpec, example: Example, framework: string): string {
  const funcName = specIdToFunctionName(spec.specId);
  const given = example.given || example.when || {};

  // Format input object
  const inputLines = Object.entries(given)
    .filter(([key]) => !key.startsWith('<<') && key !== 'user')
    .map(([key, value]) => {
      const valueStr = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
      return `  ${key}: ${valueStr},`;
    });

  const inputStr = inputLines.length > 0
    ? `{\n${inputLines.join('\n')}\n}`
    : '{}';

  if (framework === 'convex') {
    return `const result = await ${funcName}(${inputStr});`;
  }

  return `const result = await ${funcName}(ctx, ${inputStr});`;
}

/**
 * Extract error code from error example.
 * Checks multiple possible locations for error codes.
 */
function extractErrorCode(example: Example): string {
  const then = example.then || {};

  // Check direct error field
  if (then.error) {
    return String(then.error);
  }
  // Check error.code path
  if (then['error.code']) {
    return String(then['error.code']);
  }
  // Check result.error path (return-value error pattern)
  if (then['result.error']) {
    return String(then['result.error']);
  }
  // Derive from example name if descriptive
  if (example.name) {
    const name = example.name.toLowerCase();
    // Convert common patterns to error codes
    if (name.includes('empty')) return 'EMPTY_INPUT';
    if (name.includes('invalid')) return 'INVALID_INPUT';
    if (name.includes('missing')) return 'MISSING_FIELD';
    if (name.includes('not found')) return 'NOT_FOUND';
    if (name.includes('unauthorized') || name.includes('not authenticated')) return 'NOT_AUTHENTICATED';
    if (name.includes('forbidden') || name.includes('permission')) return 'PERMISSION_DENIED';
    if (name.includes('too long') || name.includes('too short')) return 'INVALID_LENGTH';
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Derive cause description from example given conditions.
 */
function deriveCause(example: Example): string {
  const given = example.given || example.when || {};
  const name = example.name || '';

  // Use example name if descriptive
  if (name && !name.toLowerCase().includes('error')) {
    return capitalize(name);
  }

  // Derive from given conditions
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(given)) {
    if (key === 'user' && value === null) {
      conditions.push('User not authenticated');
    } else if (key === 'user' && String(value).includes('@no_access')) {
      conditions.push('User lacks permission');
    } else if (typeof value === 'string' && value.startsWith('@string(')) {
      const match = value.match(/@string\((\d+)\)/);
      if (match) {
        conditions.push(`${capitalize(key)} exceeds ${match[1]} characters`);
      }
    } else if (value === null || value === undefined) {
      conditions.push(`${capitalize(key)} is missing`);
    }
  }

  return conditions.length > 0 ? conditions.join('; ') : name || 'Invalid input';
}

/**
 * Derive resolution suggestion from error code.
 */
function deriveResolution(errorCode: string): string {
  const resolutions: Record<string, string> = {
    NOT_FOUND: 'Verify the resource exists',
    NOT_AUTHENTICATED: 'Provide valid authentication',
    PERMISSION_DENIED: 'Request access from resource owner',
    INVALID_URL: 'Provide a valid URL format',
    INVALID_INPUT: 'Check input validation rules',
    RATE_LIMITED: 'Wait before retrying',
  };

  // Direct match
  if (resolutions[errorCode]) {
    return resolutions[errorCode];
  }

  // Pattern matching
  if (errorCode.includes('NOT_FOUND')) return 'Verify the resource exists';
  if (errorCode.includes('INVALID')) return 'Check input format and constraints';
  if (errorCode.includes('PERMISSION') || errorCode.includes('FORBIDDEN')) return 'Request appropriate access';
  if (errorCode.includes('TOO_LONG') || errorCode.includes('EXCEEDS')) return 'Reduce input length';

  return 'Check error details';
}
