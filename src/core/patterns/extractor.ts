/**
 * @arch archcodex.util
 *
 * Extract imports and exports from TypeScript content.
 * Used for pattern relevance filtering to reduce noise.
 */

export interface ExtractionResult {
  imports: string[];        // Imported module paths
  exports: string[];        // Exported symbol names
}

/**
 * Extract imports and exports from TypeScript content using regex.
 * This is a fast, lightweight extraction suitable for filtering.
 * For full AST analysis, use ts-morph instead.
 */
export function extractImportsAndExports(content: string): ExtractionResult {
  const imports: string[] = [];
  const exports: string[] = [];

  // Extract import paths
  // import X from 'Y'
  // import { X } from 'Y'
  // import * as X from 'Y'
  const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRegex.exec(content)) !== null) {
    imports.push(m[1]);
  }

  // Dynamic imports: import('Y')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamicImportRegex.exec(content)) !== null) {
    imports.push(m[1]);
  }

  // Require statements: require('Y')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requireRegex.exec(content)) !== null) {
    imports.push(m[1]);
  }

  // Extract exported function names
  // export function X
  // export async function X
  const exportFunctionRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
  while ((m = exportFunctionRegex.exec(content)) !== null) {
    exports.push(m[1]);
  }

  // Extract exported const/let/var/class/interface/type/enum
  const exportDeclRegex = /export\s+(?:const|let|var|class|interface|type|enum)\s+(\w+)/g;
  while ((m = exportDeclRegex.exec(content)) !== null) {
    exports.push(m[1]);
  }

  // Named exports: export { X, Y, Z as W }
  const namedExportRegex = /export\s+{([^}]+)}/g;
  while ((m = namedExportRegex.exec(content)) !== null) {
    const names = m[1]
      .split(',')
      .map(n => n.trim())
      .map(n => {
        // Handle "X as Y" - take the original name X
        const parts = n.split(/\s+as\s+/);
        return parts[0].trim();
      })
      .filter(n => n && n !== 'type'); // Filter out empty and 'type' keyword
    exports.push(...names);
  }

  // Default export with name: export default function X or export default class X
  const defaultExportRegex = /export\s+default\s+(?:function|class)\s+(\w+)/g;
  while ((m = defaultExportRegex.exec(content)) !== null) {
    exports.push(m[1]);
  }

  // Dedupe
  return {
    imports: [...new Set(imports)],
    exports: [...new Set(exports)],
  };
}

/**
 * Extract just the module name from an import path.
 * e.g., '../utils/logger' -> 'logger'
 *       '@company/api' -> 'api'
 *       'lodash' -> 'lodash'
 */
export function getModuleName(importPath: string): string {
  // Remove file extension
  let name = importPath.replace(/\.(js|ts|tsx|jsx|mjs|cjs)$/, '');

  // Get the last part of the path
  const parts = name.split('/');
  name = parts[parts.length - 1];

  // Handle index files
  if (name === 'index') {
    name = parts.length > 1 ? parts[parts.length - 2] : name;
  }

  return name;
}
