/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Spec inferrer — generates SpecCodex spec YAML from existing TypeScript implementations.
 * Enables reverse workflow: code-first, then spec, then tests.
 *
 * Reuses parseImplementationPath and extractFunctionSignature from signature-extractor,
 * and error-detection patterns from verifier.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import {
  parseImplementationPath,
  extractFunctionSignature,
  resolveTypeAcrossFiles,
} from './generators/signature-extractor.js';
import type { ExtractedParameter } from './generators/signature-extractor.js';
import type { InferOptions, InferResult, DetectedPattern, TypeMapping } from './inferrer.types.js';

// Re-export types for consumers
export type {
  InferOptions,
  InferResult,
  InferUpdateOptions,
  InferUpdateResult,
  DetectedPattern,
  TypeMapping,
  MergeReport,
  CodeContext,
  EnrichmentRequest,
  EnrichedSections,
} from './inferrer.types.js';

// Re-export inferSpecUpdate from merge module
export { inferSpecUpdate } from './inferrer-merge.js';

/**
 * Input shape for inferSpec (matches spec examples).
 */
interface InferSpecInput {
  implementationPath: string;
  options?: InferOptions;
}

/**
 * Infer a spec from implementation code.
 */
export function inferSpec(input: InferSpecInput): InferResult {
  const { implementationPath, options } = input;

  // Validate path format
  const parsed = parseImplementationPath(implementationPath);
  if (!parsed) {
    return makeErrorResult('INVALID_PATH', `Invalid implementation path format: ${implementationPath}. Expected: path/to/file.ts#exportName`);
  }

  const { filePath, exportName } = parsed;
  const projectRoot = options?.projectRoot ?? process.cwd();
  const fullPath = resolve(projectRoot, filePath);

  // Check file exists
  if (!existsSync(fullPath)) {
    return makeErrorResult('IMPLEMENTATION_NOT_FOUND', `Implementation file not found: ${fullPath}`);
  }

  // Read file content for pattern detection
  const content = readFileSync(fullPath, 'utf-8');

  // Extract function signature via AST
  const signature = extractFunctionSignature(implementationPath, { projectRoot });

  // Check export exists
  if (!signature.valid) {
    const exportErr = signature.errors.find(e => e.code === 'EXPORT_NOT_FOUND');
    if (exportErr) {
      return makeErrorResult('EXPORT_NOT_FOUND', exportErr.message);
    }
    return makeErrorResult('EXTRACTION_FAILED', signature.errors.map(e => e.message).join('; '));
  }

  // Detect patterns from code content
  const detectedPatterns = detectPatterns(content, exportName, options?.inherits);

  // Generate spec ID from file path
  const specId = generateSpecId(filePath, exportName);

  // Extract as-written type annotations from source (before ts-morph expansion)
  const sourceTypeMap = extractSourceTypeAnnotations(content, exportName);

  // Map parameters to spec inputs, preferring source type names for complex types
  const inputs = mapParametersToInputs(signature.parameters, sourceTypeMap, filePath, projectRoot);

  // Map return type to spec outputs (prefer source return type name)
  const sourceReturnType = sourceTypeMap.get('__return__');
  const outputs = mapReturnTypeToOutputs(
    sourceReturnType ?? signature.returnType,
    content,
    filePath,
    projectRoot,
  );

  // Assemble YAML
  const yaml = assembleSpecYaml({
    specId,
    baseSpec: detectedPatterns.baseSpec,
    implementationPath,
    inputs,
    outputs,
    patterns: detectedPatterns,
    isAsync: signature.isAsync,
  });

  return {
    valid: true,
    specId,
    yaml,
    detectedPatterns,
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// Internal: Pattern detection
// ---------------------------------------------------------------------------

/**
 * Detect wrapper pattern, security, side effects, error codes, and @arch tag.
 */
function detectPatterns(content: string, exportName: string, inheritsOverride?: string): DetectedPattern {
  const baseSpec = inheritsOverride ?? detectBaseSpec(content, exportName);
  const security = detectSecurity(content, baseSpec);
  const effects = detectEffects(content);
  const errorCodes = detectErrorCodes(content);
  const archTag = detectArchTag(content);

  return { baseSpec, security, effects, errorCodes, archTag };
}

/**
 * Detect base spec from wrapper pattern or function name.
 */
function detectBaseSpec(content: string, exportName: string): string {
  // Check wrapper patterns around the export
  const wrapperPatterns: Array<[RegExp, string]> = [
    [new RegExp(`(?:export\\s+)?const\\s+${exportName}\\s*=\\s*makeAuthMutation\\b`), 'spec.mutation'],
    [new RegExp(`(?:export\\s+)?const\\s+${exportName}\\s*=\\s*makeMutation\\b`), 'spec.mutation'],
    [new RegExp(`(?:export\\s+)?const\\s+${exportName}\\s*=\\s*makeAuthQuery\\b`), 'spec.query'],
    [new RegExp(`(?:export\\s+)?const\\s+${exportName}\\s*=\\s*makeQuery\\b`), 'spec.query'],
    [new RegExp(`(?:export\\s+)?const\\s+${exportName}\\s*=\\s*makeAuthAction\\b`), 'spec.action'],
    [new RegExp(`(?:export\\s+)?const\\s+${exportName}\\s*=\\s*makeAction\\b`), 'spec.action'],
  ];

  for (const [pattern, spec] of wrapperPatterns) {
    if (pattern.test(content)) {
      return spec;
    }
  }

  // Check generic wrapper patterns only near the export name (within 200 chars)
  // This avoids false positives from unrelated wrappers elsewhere in the file
  const exportIdx = content.indexOf(exportName);
  if (exportIdx !== -1) {
    const nearby = content.slice(Math.max(0, exportIdx - 50), exportIdx + 200);
    if (/makeAuthMutation\s*\(/.test(nearby)) return 'spec.mutation';
    if (/makeAuthQuery\s*\(/.test(nearby)) return 'spec.query';
    if (/makeAuthAction\s*\(/.test(nearby)) return 'spec.action';
  }

  // Hook pattern
  if (/^use[A-Z]/.test(exportName)) return 'spec.hook';

  return 'spec.function';
}

/**
 * Detect security requirements based on wrapper and content.
 */
function detectSecurity(content: string, baseSpec: string): { authentication: 'required' | 'optional' | 'none' } {
  // Auth wrappers imply required authentication
  if (/makeAuth(Mutation|Query|Action)\s*\(/.test(content)) {
    return { authentication: 'required' };
  }

  // If base spec is mutation/query/action but no auth wrapper, it's optional
  if (['spec.mutation', 'spec.query', 'spec.action'].includes(baseSpec)) {
    return { authentication: 'optional' };
  }

  return { authentication: 'none' };
}

/**
 * Detect side effects from code patterns.
 */
function detectEffects(content: string): Array<{ type: string; detail?: string }> {
  const effects: Array<{ type: string; detail?: string }> = [];
  const seen = new Set<string>();

  const effectPatterns: Array<[RegExp, string, string?]> = [
    [/ctx\.db\.insert\s*\(/g, 'database_insert'],
    [/ctx\.db\.patch\s*\(/g, 'database_update'],
    [/ctx\.db\.replace\s*\(/g, 'database_update'],
    [/ctx\.db\.delete\s*\(/g, 'database_delete'],
    [/logAudit\s*\(/g, 'audit_log'],
    [/ctx\.scheduler\.runAfter\s*\(/g, 'scheduled_action'],
    [/ctx\.scheduler\.runAt\s*\(/g, 'scheduled_action'],
    [/fetch\s*\(/g, 'external_request'],
    [/ctx\.storage\./g, 'file_storage'],
  ];

  for (const [pattern, effectType] of effectPatterns) {
    if (pattern.test(content) && !seen.has(effectType)) {
      seen.add(effectType);
      effects.push({ type: effectType });
    }
  }

  return effects;
}

/**
 * Extract error codes from ConvexError throws and similar patterns.
 */
function detectErrorCodes(content: string): string[] {
  const codes = new Set<string>();

  const errorPatterns = [
    /ConvexError\s*\(\s*\{\s*code:\s*['"]([^'"]+)['"]/g,
    /ConvexError\s*\(\s*['"]([^'"]+)['"]/g,
    /throw\s+new\s+\w*Error\s*\(\s*\{\s*code:\s*['"]([^'"]+)['"]/g,
    /code:\s*['"]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)['"]/g,
  ];

  for (const pattern of errorPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const code = match[1];
      if (code && /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(code)) {
        codes.add(code);
      }
    }
  }

  return [...codes];
}

/**
 * Extract @arch tag from file content.
 */
function detectArchTag(content: string): string | undefined {
  const match = content.match(/@arch\s+([a-zA-Z0-9_.-]+)/);
  return match ? match[1] : undefined;
}

// ---------------------------------------------------------------------------
// Internal: Source type extraction
// ---------------------------------------------------------------------------

/**
 * Extract as-written type annotations from source code before ts-morph expands them.
 * For `function foo(registry: SpecRegistry, name: string): InferResult`,
 * returns Map { 'registry' => 'SpecRegistry', 'name' => 'string', '__return__' => 'InferResult' }
 */
function extractSourceTypeAnnotations(content: string, exportName: string): Map<string, string> {
  const typeMap = new Map<string, string>();

  // Match function declaration: function exportName(params): ReturnType
  // or arrow: const exportName = (params): ReturnType =>
  // or async variants
  const patterns = [
    // Standard function: export function name(...)
    new RegExp(
      `(?:export\\s+)?(?:async\\s+)?function\\s+${exportName}\\s*\\(([^)]*?)\\)\\s*(?::\\s*([^{=]+?))?\\s*[{]`,
      's',
    ),
    // Arrow/const: export const name = (...) =>  or  = function(...)
    new RegExp(
      `(?:export\\s+)?const\\s+${exportName}\\s*=\\s*(?:async\\s+)?(?:function\\s*)?\\(([^)]*?)\\)\\s*(?::\\s*([^=>{]+?))?\\s*(?:=>|\\{)`,
      's',
    ),
    // Wrapper pattern: export const name = makeAuthMutation(async (ctx, args: { ... }) => {
    // For these, parameters are inside the inner function — skip, ts-morph handles them
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match) continue;

    const paramsBlock = match[1] ?? '';
    const returnAnnotation = match[2]?.trim();

    // Extract parameter type annotations
    parseParameterAnnotations(paramsBlock, typeMap);

    // Extract return type annotation
    if (returnAnnotation) {
      // Clean: remove trailing whitespace, Promise wrapper is kept as-is
      const cleanReturn = returnAnnotation.replace(/\s+$/, '');
      if (cleanReturn && cleanReturn !== '{') {
        typeMap.set('__return__', cleanReturn);
      }
    }

    break; // Use first match
  }

  return typeMap;
}

/**
 * Parse parameter declarations like "registry: SpecRegistry, name: string, opts?: InferOptions"
 * into the type map.
 */
function parseParameterAnnotations(paramsBlock: string, typeMap: Map<string, string>): void {
  // Split on commas that aren't inside angle brackets or braces
  let depth = 0;
  let current = '';
  const parts: string[] = [];

  for (const char of paramsBlock) {
    if (char === '<' || char === '{' || char === '(') { depth++; current += char; continue; }
    if (char === '>' || char === '}' || char === ')') { depth--; current += char; continue; }
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());

  for (const part of parts) {
    // Match: paramName?: TypeAnnotation  or  paramName: TypeAnnotation
    const paramMatch = part.match(/^(\w+)\??\s*:\s*(.+)$/s);
    if (paramMatch) {
      const paramName = paramMatch[1];
      const typeName = paramMatch[2].trim();
      typeMap.set(paramName, typeName);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: Type mapping
// ---------------------------------------------------------------------------

/**
 * Map a TypeScript type string to a spec type.
 */
function mapTsTypeToSpec(tsType: string): TypeMapping {
  const trimmed = tsType.trim();

  // Unwrap Promise<T>
  const promiseMatch = trimmed.match(/^Promise<(.+)>$/);
  if (promiseMatch) {
    return mapTsTypeToSpec(promiseMatch[1]);
  }

  // Primitives
  if (trimmed === 'string') return { specType: 'string' };
  if (trimmed === 'number') return { specType: 'number' };
  if (trimmed === 'boolean') return { specType: 'boolean' };
  if (trimmed === 'void' || trimmed === 'undefined') return { specType: 'void' };

  // Id<"tableName">
  const idMatch = trimmed.match(/^Id<["']([^"']+)["']>$/);
  if (idMatch) {
    return { specType: 'id', table: idMatch[1] };
  }

  // Union types: split on top-level | only (not inside angle brackets)
  const unionParts = splitTopLevelUnion(trimmed);
  if (unionParts.length > 1) {
    // String literal unions: "a" | "b" | "c"
    if (unionParts.every(p => /^['"][^'"]+['"]$/.test(p))) {
      return {
        specType: 'enum',
        values: unionParts.map(p => p.replace(/['"]/g, '')),
      };
    }
    // Mixed unions like string | number — use first non-null/undefined type
    const meaningful = unionParts.filter(p => p !== 'null' && p !== 'undefined');
    if (meaningful.length === 1) {
      return mapTsTypeToSpec(meaningful[0]);
    }
    // True mixed union — fall through to object with TODO
    return { specType: 'object', description: `TODO: Review union type '${trimmed}'` };
  }

  // Array types: T[] or Array<T>
  const arrayBracketMatch = trimmed.match(/^(.+)\[\]$/);
  if (arrayBracketMatch) {
    return { specType: 'array', items: mapTsTypeToSpec(arrayBracketMatch[1]) };
  }
  const arrayGenericMatch = trimmed.match(/^Array<(.+)>$/);
  if (arrayGenericMatch) {
    return { specType: 'array', items: mapTsTypeToSpec(arrayGenericMatch[1]) };
  }

  // Named type alias (e.g. SpecRegistry, VerifyOptions) — use the name, not expansion
  const namedTypeMatch = trimmed.match(/^([A-Z]\w+)$/);
  if (namedTypeMatch) {
    return { specType: 'object', description: `TODO: Review type '${namedTypeMatch[1]}'` };
  }

  // Inline expanded objects (Zod-inferred etc.) — too complex for spec, summarize
  if (trimmed.startsWith('{') && trimmed.length > 80) {
    return { specType: 'object', description: 'TODO: Complex object type — define properties manually' };
  }

  // Object types (fallback) — truncate long type strings
  if (trimmed === 'object') return { specType: 'object' };
  const desc = trimmed.length > 100 ? trimmed.slice(0, 97) + '...' : trimmed;
  return { specType: 'object', description: `TODO: Review type '${desc}'` };
}

/**
 * Split a type string on top-level `|` characters, ignoring those inside `<>`, `{}`, `()`.
 */
function splitTopLevelUnion(type: string): string[] {
  let depth = 0;
  let current = '';
  const parts: string[] = [];
  for (const char of type) {
    if (char === '<' || char === '{' || char === '(') { depth++; current += char; continue; }
    if (char === '>' || char === '}' || char === ')') { depth--; current += char; continue; }
    if (char === '|' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Map extracted parameters to spec input definitions.
 * When sourceTypeMap is provided, prefers as-written type names over ts-morph expanded types.
 * Attempts cross-file resolution for named types that would otherwise be TODO.
 */
function mapParametersToInputs(
  parameters: ExtractedParameter[],
  sourceTypeMap?: Map<string, string>,
  sourceFilePath?: string,
  projectRoot?: string,
): Array<{ name: string; type: TypeMapping; required: boolean }> {
  return parameters.map(p => {
    const sourceType = sourceTypeMap?.get(p.name);
    // Use source type name when ts-morph expanded it into something complex
    const typeToMap = shouldPreferSourceType(p.type, sourceType) ? sourceType! : p.type;
    let mappedType = mapTsTypeToSpec(typeToMap);

    // Resolve named types that produced a TODO (same-file then cross-file)
    if (
      mappedType.specType === 'object' &&
      mappedType.description?.includes('TODO: Review type')
    ) {
      const namedMatch = typeToMap.match(/^([A-Z]\w+)$/);
      if (namedMatch) {
        // Try same-file extraction first (needs content passed through)
        // Then cross-file resolution
        if (sourceFilePath && projectRoot) {
          const fields = resolveTypeAcrossFiles(namedMatch[1], sourceFilePath, { projectRoot });
          if (fields.length > 0) {
            mappedType = {
              specType: 'object',
              properties: Object.fromEntries(
                fields.map(f => [f.name, mapTsTypeToSpec(f.type)]),
              ),
            };
          }
        }
      }
    }

    return {
      name: p.name,
      type: mappedType,
      required: !p.optional,
    };
  });
}

/**
 * Decide whether to prefer the source-level type annotation over ts-morph's expanded type.
 * Prefers source when: ts-morph gave an inline expansion (starts with '{' and long)
 * but source has a clean named type like 'SpecRegistry'.
 */
function shouldPreferSourceType(tsMorphType: string, sourceType: string | undefined): boolean {
  if (!sourceType) return false;
  const trimmedExpanded = tsMorphType.trim();
  const trimmedSource = sourceType.trim();

  // If ts-morph type is already simple, no need to swap
  if (trimmedExpanded.length <= 80 && !trimmedExpanded.startsWith('{')) return false;

  // If source type is a clean named type (e.g. SpecRegistry, InferOptions), prefer it
  if (/^[A-Z]\w+$/.test(trimmedSource)) return true;

  // If source type is a generic like Promise<Foo> or Array<Bar>, prefer it if shorter
  if (trimmedSource.length < trimmedExpanded.length / 2) return true;

  return false;
}

/**
 * Map return type to spec output definitions.
 * Attempts same-file extraction first, then cross-file resolution.
 */
function mapReturnTypeToOutputs(
  returnType: string,
  content: string,
  sourceFilePath?: string,
  projectRoot?: string,
): Array<{ name: string; type: TypeMapping }> {
  // Unwrap Promise
  const unwrapped = returnType.replace(/^Promise<(.+)>$/, '$1').trim();
  const mapped = mapTsTypeToSpec(returnType);

  // If the return type is void, no outputs
  if (mapped.specType === 'void') return [];

  // If return type is a named type (e.g. InferResult, VerifyResult), look for its interface
  const namedMatch = unwrapped.match(/^([A-Z]\w+)$/);
  if (namedMatch) {
    // Try same-file extraction first
    const fields = extractFieldsFromNamedType(content, namedMatch[1]);
    if (fields.length > 0) {
      return fields.map(f => ({ name: f.name, type: mapTsTypeToSpec(f.type) }));
    }

    // Try cross-file resolution
    if (sourceFilePath && projectRoot) {
      const crossFileFields = resolveTypeAcrossFiles(namedMatch[1], sourceFilePath, { projectRoot });
      if (crossFileFields.length > 0) {
        return crossFileFields.map(f => ({ name: f.name, type: mapTsTypeToSpec(f.type) }));
      }
    }
  }

  // If return type is an inline object `{ ... }`, extract top-level fields
  if (unwrapped.startsWith('{')) {
    const body = extractBalancedBraceContent(unwrapped, 1);
    if (body) {
      const fields: Array<{ name: string; type: string }> = [];
      parseTopLevelFields(body, fields, new Set());
      if (fields.length > 0) {
        return fields.map(f => ({ name: f.name, type: mapTsTypeToSpec(f.type) }));
      }
    }
  }

  // Single return value
  return [{ name: 'result', type: mapped }];
}

/**
 * Extract fields from a named type/interface definition in the file content.
 */
function extractFieldsFromNamedType(content: string, typeName: string): Array<{ name: string; type: string }> {
  const fields: Array<{ name: string; type: string }> = [];
  const seen = new Set<string>();

  // Match: interface TypeName { ... } or type TypeName = { ... }
  const pattern = new RegExp(`(?:interface|type)\\s+${typeName}\\s*(?:=\\s*)?\\{`);
  const match = content.match(pattern);
  if (match) {
    const startIdx = (match.index ?? 0) + match[0].length;
    const body = extractBalancedBraceContent(content, startIdx);
    if (body) {
      parseTopLevelFields(body, fields, seen);
    }
  }

  return fields;
}

/**
 * Extract content inside balanced braces starting after an opening brace.
 */
function extractBalancedBraceContent(content: string, startIdx: number): string | null {
  let depth = 1;
  let i = startIdx;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return content.slice(startIdx, i - 1);
}

/**
 * Parse only top-level field declarations (depth 0) from an interface body.
 * Skips nested objects like `security: { authentication: ... }`.
 */
function parseTopLevelFields(
  body: string,
  fields: Array<{ name: string; type: string }>,
  seen: Set<string>,
): void {
  let depth = 0;
  let current = '';

  for (const char of body) {
    if (char === '{') { depth++; current += char; continue; }
    if (char === '}') { depth--; current += char; continue; }
    if (depth > 0) { current += char; continue; }

    if (char === ';' || char === '\n') {
      const fieldMatch = current.trim().match(/^(\w+)\??\s*:\s*(.+)$/);
      if (fieldMatch && !seen.has(fieldMatch[1])) {
        seen.add(fieldMatch[1]);
        // Clean the type: remove trailing semicolons/commas, trim nested object bodies
        let fieldType = fieldMatch[2].trim().replace(/[;,]$/, '').trim();
        if (fieldType.includes('{')) {
          fieldType = 'object';
        }
        fields.push({ name: fieldMatch[1], type: fieldType });
      }
      current = '';
    } else {
      current += char;
    }
  }

  // Handle last field (no trailing newline/semicolon)
  const fieldMatch = current.trim().match(/^(\w+)\??\s*:\s*(.+)$/);
  if (fieldMatch && !seen.has(fieldMatch[1])) {
    seen.add(fieldMatch[1]);
    let fieldType = fieldMatch[2].trim().replace(/[;,]$/, '').trim();
    if (fieldType.includes('{')) fieldType = 'object';
    fields.push({ name: fieldMatch[1], type: fieldType });
  }
}

// ---------------------------------------------------------------------------
// Internal: Spec ID generation
// ---------------------------------------------------------------------------

/**
 * Generate spec ID from file path and export name.
 * e.g. "src/utils/format.ts#formatDate" → "spec.utils.format.formatDate"
 */
function generateSpecId(filePath: string, exportName: string): string {
  // Remove extension and leading directories
  const cleaned = filePath
    .replace(/^(src|convex)\//, '')
    .replace(/\.(ts|tsx|js|jsx)$/, '')
    .replace(/\/index$/, '');

  // Convert path segments to dot notation
  const segments = cleaned.split('/').filter(Boolean);

  return `spec.${[...segments, exportName].join('.')}`;
}

// ---------------------------------------------------------------------------
// Internal: YAML assembly
// ---------------------------------------------------------------------------

interface AssemblyInput {
  specId: string;
  baseSpec: string;
  implementationPath: string;
  inputs: Array<{ name: string; type: TypeMapping; required: boolean }>;
  outputs: Array<{ name: string; type: TypeMapping }>;
  patterns: DetectedPattern;
  isAsync: boolean;
}

/**
 * Assemble spec YAML with TODO placeholders for manual fields.
 */
function assembleSpecYaml(input: AssemblyInput): string {
  const { specId, baseSpec, implementationPath, inputs, outputs, patterns } = input;
  const lines: string[] = [];

  lines.push('# Auto-generated by `archcodex spec infer` — review and customize');
  lines.push('version: "1.0"');
  lines.push('');
  lines.push(`${specId}:`);
  lines.push(`  inherits: ${baseSpec}`);
  lines.push(`  implementation: ${implementationPath}`);
  lines.push('');
  lines.push('  # === STRATEGIC ===');
  lines.push('  goal: "TODO: Describe the high-level goal"');
  lines.push('  outcomes:');
  lines.push('    - "TODO: List expected outcomes"');
  lines.push('');
  lines.push('  # === OPERATIONAL ===');
  lines.push('  intent: "TODO: Describe what this function does"');

  // Inputs
  if (inputs.length > 0) {
    lines.push('');
    lines.push('  inputs:');
    for (const inp of inputs) {
      lines.push(`    ${inp.name}:`);
      lines.push(`      type: ${formatSpecType(inp.type)}`);
      if (inp.required) lines.push('      required: true');
      if (inp.type.table) lines.push(`      table: ${inp.type.table}`);
      if (inp.type.values) lines.push(`      values: [${inp.type.values.map(v => `"${escapeYamlValue(v)}"`).join(', ')}]`);
      if (inp.type.description) lines.push(`      description: "${escapeYamlValue(inp.type.description)}"`);
    }
  }

  // Outputs
  if (outputs.length > 0) {
    lines.push('');
    lines.push('  outputs:');
    for (const out of outputs) {
      lines.push(`    ${out.name}:`);
      lines.push(`      type: ${formatSpecType(out.type)}`);
      if (out.type.table) lines.push(`      table: ${out.type.table}`);
      if (out.type.description) lines.push(`      description: "${escapeYamlValue(out.type.description)}"`);
    }
  }

  // Security
  if (patterns.security.authentication !== 'none') {
    lines.push('');
    lines.push('  security:');
    lines.push(`    authentication: ${patterns.security.authentication}`);
  }

  // Effects
  if (patterns.effects.length > 0) {
    lines.push('');
    lines.push('  effects:');
    for (const effect of patterns.effects) {
      lines.push(`    - { action: ${effect.type}${effect.detail ? `, detail: "${escapeYamlValue(effect.detail)}"` : ''} }`);
    }
  }

  // Architecture
  if (patterns.archTag) {
    lines.push('');
    lines.push(`  architectures: [${patterns.archTag}]`);
  }

  // Invariants placeholder
  lines.push('');
  lines.push('  # === INVARIANTS ===');
  lines.push('  invariants:');
  lines.push('    - "TODO: Define invariants"');

  // Examples placeholder
  lines.push('');
  lines.push('  # === EXAMPLES ===');
  lines.push('  examples:');
  lines.push('    success:');
  lines.push('      - name: "TODO: basic success case"');
  if (inputs.length > 0) {
    lines.push('        given:');
    for (const inp of inputs) {
      lines.push(`          ${inp.name}: "TODO"`);
    }
  } else {
    lines.push('        given: {}');
  }
  lines.push('        then:');
  lines.push('          result: "@defined"');

  // Error examples from detected error codes
  if (patterns.errorCodes.length > 0) {
    lines.push('    errors:');
    for (const code of patterns.errorCodes) {
      lines.push(`      - name: "TODO: ${code} case"`);
      lines.push('        given: {}');
      lines.push(`        then:`);
      lines.push(`          error.code: "${code}"`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format a TypeMapping to its spec type string.
 */
function formatSpecType(mapping: TypeMapping): string {
  if (mapping.specType === 'array' && mapping.items) {
    return `array`;
  }
  return mapping.specType;
}

// ---------------------------------------------------------------------------
// Internal: Error helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for use inside a YAML double-quoted scalar.
 * Handles backslashes, double quotes, newlines, and tabs.
 */
function escapeYamlValue(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function makeErrorResult(code: string, message: string): InferResult {
  return {
    valid: false,
    specId: '',
    yaml: '',
    detectedPatterns: {
      baseSpec: '',
      security: { authentication: 'none' },
      effects: [],
      errorCodes: [],
    },
    errors: [{ code, message }],
  };
}

