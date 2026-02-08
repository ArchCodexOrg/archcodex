/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Operation finder - finds existing CRUD operations and similar operations in the codebase.
 */

import * as path from 'node:path';
import { globFiles, readFile } from '../../../utils/file-system.js';
import type { OperationInfo, SimilarOperation } from '../types.js';
import type { OperationFindResult } from './types.js';

/**
 * Common CRUD operation prefixes.
 */
const CRUD_PREFIXES = ['create', 'get', 'find', 'list', 'update', 'delete', 'remove', 'add', 'set'];

/**
 * Patterns for similar operations (duplicate, clone, copy).
 */
const SIMILAR_OP_PATTERNS = [/^duplicate/i, /^clone/i, /^copy/i, /^replicate/i];

/**
 * Regex to find function/method definitions.
 */
const FUNCTION_PATTERNS = [
  // export function name() or export async function name()
  /export\s+(?:async\s+)?function\s+(\w+)/g,
  // export const name = () or export const name = async ()
  /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/g,
  // public/private method name() in class
  /(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+[^{]*)?\s*\{/g,
  // Arrow functions: const name = async () =>
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
];

/**
 * Extract function names from file content.
 */
function extractFunctionNames(content: string): Array<{ name: string; line: number }> {
  const functions: Array<{ name: string; line: number }> = [];
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    for (const pattern of FUNCTION_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(line)) !== null) {
        const funcName = match[1];
        // Skip common non-function matches
        if (funcName && !['if', 'for', 'while', 'switch', 'catch'].includes(funcName)) {
          functions.push({
            name: funcName,
            line: lineIndex + 1, // 1-based line numbers
          });
        }
      }
    }
  }

  return functions;
}

/**
 * Check if a function name is related to an entity.
 */
function isEntityOperation(funcName: string, entityName: string): boolean {
  const normalizedFunc = funcName.toLowerCase();
  const normalizedEntity = entityName.toLowerCase();

  // Check for exact entity name in function
  if (normalizedFunc.includes(normalizedEntity)) {
    return true;
  }

  // Check for singular form (todos -> todo)
  if (normalizedEntity.endsWith('s')) {
    const singular = normalizedEntity.slice(0, -1);
    if (normalizedFunc.includes(singular)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a function name is a CRUD operation.
 */
function isCrudOperation(funcName: string): boolean {
  const lower = funcName.toLowerCase();
  return CRUD_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * Check if a function name is a "similar" operation (duplicate, clone, copy).
 */
function isSimilarOperation(funcName: string): boolean {
  return SIMILAR_OP_PATTERNS.some(pattern => pattern.test(funcName));
}

/**
 * Find operations for an entity in a project.
 */
export async function findOperations(
  projectRoot: string,
  entityName: string
): Promise<OperationFindResult> {
  const existingOperations: OperationInfo[] = [];
  const similarOperations: SimilarOperation[] = [];

  // Find TypeScript/JavaScript files
  const patterns = [
    '**/*.ts',
    '**/*.js',
    '**/*.tsx',
    '**/*.jsx',
  ];

  const ignorePatterns = [
    'node_modules/**',
    'dist/**',
    'build/**',
    '.git/**',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.d.ts',
  ];

  for (const pattern of patterns) {
    const files = await globFiles(pattern, { cwd: projectRoot, ignore: ignorePatterns });

    for (const file of files) {
      const fullPath = path.join(projectRoot, file);
      const relativePath = file;

      try {
        const content = await readFile(fullPath);
        const functions = extractFunctionNames(content);

        for (const func of functions) {
          // Check for entity-specific CRUD operations
          if (isEntityOperation(func.name, entityName) && isCrudOperation(func.name)) {
            existingOperations.push({
              name: func.name,
              file: relativePath,
              line: func.line,
            });
          }

          // Check for similar operations (duplicate, clone, copy) anywhere in codebase
          if (isSimilarOperation(func.name)) {
            similarOperations.push({
              name: func.name,
              file: relativePath,
              line: func.line,
            });
          }
        }
      } catch {
        // Skip files that can't be read
        continue;
      }
    }
  }

  // Sort by file path and line number
  existingOperations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  similarOperations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  // Deduplicate similar operations (keep first occurrence)
  const seenSimilar = new Set<string>();
  const uniqueSimilar = similarOperations.filter(op => {
    const key = `${op.name}:${op.file}`;
    if (seenSimilar.has(key)) return false;
    seenSimilar.add(key);
    return true;
  });

  return {
    entity: entityName,
    existingOperations,
    similarOperations: uniqueSimilar,
  };
}
