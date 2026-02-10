/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Tests for the function signature extractor.
 * Based on spec.speccodex.generate.signature
 */
import { describe, it, expect } from 'vitest';
import {
  extractFunctionSignature,
  parseImplementationPath,
  generateImportStatement,
  generateFunctionCall,
} from '../../../src/core/spec/generators/signature-extractor.js';

describe('parseImplementationPath', () => {
  it('parses valid TypeScript path with export', () => {
    const result = parseImplementationPath('src/utils/format.ts#formatDate');
    expect(result).toEqual({
      filePath: 'src/utils/format.ts',
      exportName: 'formatDate',
    });
  });

  it('parses TSX files', () => {
    const result = parseImplementationPath('src/components/Button.tsx#Button');
    expect(result).toEqual({
      filePath: 'src/components/Button.tsx',
      exportName: 'Button',
    });
  });

  it('parses JavaScript files', () => {
    const result = parseImplementationPath('lib/helper.js#helper');
    expect(result).toEqual({
      filePath: 'lib/helper.js',
      exportName: 'helper',
    });
  });

  it('returns null for invalid path without hash', () => {
    const result = parseImplementationPath('src/utils/format.ts');
    expect(result).toBeNull();
  });

  it('returns null for invalid path without extension', () => {
    const result = parseImplementationPath('src/utils/format#formatDate');
    expect(result).toBeNull();
  });
});

describe('extractFunctionSignature', () => {
  // Vitest runs from the project root (where vitest.config.ts lives)
  const projectRoot = process.cwd();

  it('extracts function declaration signature and detects factory pattern', () => {
    const result = extractFunctionSignature(
      'src/cli/commands/spec/index.ts#createSpecCommand',
      { projectRoot }
    );

    expect(result.valid).toBe(true);
    expect(result.functionName).toBe('createSpecCommand');
    expect(result.isFactory).toBe(true);
    expect(result.callPattern).toBe('factory');
  });

  it('returns error for non-existent file', () => {
    const result = extractFunctionSignature(
      'src/nonexistent.ts#fn',
      { projectRoot }
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('IMPLEMENTATION_NOT_FOUND');
  });

  it('returns error for non-existent export', () => {
    const result = extractFunctionSignature(
      'src/cli/commands/spec/index.ts#nonExistentFunction',
      { projectRoot }
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('EXPORT_NOT_FOUND');
    expect(result.errors[0].message).toContain('nonExistentFunction');
  });

  it('returns error for invalid path format', () => {
    const result = extractFunctionSignature('invalidPath', { projectRoot });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('INVALID_PATH');
  });
});

describe('generateImportStatement', () => {
  it('generates import for valid signature', () => {
    const signature = {
      valid: true,
      functionName: 'formatDate',
      parameters: [],
      returnType: 'string',
      isAsync: false,
      isFactory: false,
      callPattern: 'direct' as const,
      errors: [],
    };

    const result = generateImportStatement(
      signature,
      'src/utils/format.ts#formatDate'
    );

    expect(result).toContain("import { formatDate } from");
    expect(result).toContain('.js');
  });

  it('returns TODO comment for invalid path', () => {
    const signature = {
      valid: true,
      functionName: 'fn',
      parameters: [],
      returnType: 'void',
      isAsync: false,
      isFactory: false,
      callPattern: 'direct' as const,
      errors: [],
    };

    const result = generateImportStatement(signature, 'invalid');
    expect(result).toContain('TODO');
  });
});

describe('generateFunctionCall', () => {
  it('generates direct call for direct pattern', () => {
    const signature = {
      valid: true,
      functionName: 'add',
      parameters: [
        { name: 'a', type: 'number', optional: false, destructured: false },
        { name: 'b', type: 'number', optional: false, destructured: false },
      ],
      returnType: 'number',
      isAsync: false,
      isFactory: false,
      callPattern: 'direct' as const,
      errors: [],
    };

    const result = generateFunctionCall(signature, { a: 1, b: 2 });
    expect(result).toBe('add(a, b)');
  });

  it('generates async call for async functions', () => {
    const signature = {
      valid: true,
      functionName: 'fetchData',
      parameters: [],
      returnType: 'Promise<void>',
      isAsync: true,
      isFactory: false,
      callPattern: 'direct' as const,
      errors: [],
    };

    const result = generateFunctionCall(signature, {});
    expect(result).toContain('await');
  });

  it('generates destructured call for destructured pattern', () => {
    const signature = {
      valid: true,
      functionName: 'create',
      parameters: [
        { name: 'args', type: '{ url: string }', optional: false, destructured: true },
      ],
      returnType: 'void',
      isAsync: true,
      isFactory: false,
      callPattern: 'destructured' as const,
      errors: [],
    };

    const result = generateFunctionCall(signature, { url: 'https://example.com' });
    expect(result).toContain('create({ url })');
    expect(result).toContain('await');
  });

  it('generates factory call for factory pattern', () => {
    const signature = {
      valid: true,
      functionName: 'createRouter',
      parameters: [],
      returnType: 'Router',
      isAsync: false,
      isFactory: true,
      callPattern: 'factory' as const,
      errors: [],
    };

    const result = generateFunctionCall(signature, {});
    expect(result).toContain('createRouter()');
    expect(result).toContain('instance');
  });
});
