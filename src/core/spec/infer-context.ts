/**
 * @arch archcodex.infra
 * @intent:ast-analysis
 *
 * Gathers code context from an implementation for LLM-powered spec enrichment.
 * Extracts imported type definitions, function calls, and relevant file context.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { Project, type SourceFile, type FunctionDeclaration, type VariableDeclaration } from 'ts-morph';
import type { CodeContext } from './inferrer.types.js';

// Re-export for consumers
export type { CodeContext } from './inferrer.types.js';

interface GatherOptions {
  projectRoot?: string;
  maxFiles?: number;
  maxContextSize?: number;
}

const EMPTY_CONTEXT: CodeContext = {
  importedTypes: [],
  calledFunctions: [],
  contextFiles: [],
};

/**
 * Gather code context from an implementation for LLM-powered spec enrichment.
 */
export function gatherCodeContext(
  filePath: string,
  exportName: string,
  options: GatherOptions = {},
): CodeContext {
  const projectRoot = options.projectRoot ?? '.';
  const maxFiles = options.maxFiles ?? 10;
  const maxContextSize = options.maxContextSize ?? 50000;
  const fullPath = resolve(projectRoot, filePath);

  if (!existsSync(fullPath)) {
    return EMPTY_CONTEXT;
  }

  // Create ts-morph project with just this file
  const project = new Project({
    skipFileDependencyResolution: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true },
  });

  const sourceFile = project.addSourceFileAtPath(fullPath);

  // Find the exported function/const
  const exportNode = findExport(sourceFile, exportName);
  if (!exportNode) {
    return EMPTY_CONTEXT;
  }

  const functionText = exportNode.getText();

  // Collect imported types referenced in the function body
  const importedTypes: CodeContext['importedTypes'] = [];
  let totalSize = 0;
  let fileCount = 0;

  for (const importDecl of sourceFile.getImportDeclarations()) {
    if (fileCount >= maxFiles || totalSize >= maxContextSize) break;

    const moduleSpec = importDecl.getModuleSpecifierValue();

    // Skip non-relative imports (node_modules)
    if (!moduleSpec.startsWith('.') && !moduleSpec.startsWith('/')) continue;

    for (const namedImport of importDecl.getNamedImports()) {
      if (totalSize >= maxContextSize) break;

      const importName = namedImport.getName();

      // Only include types referenced in the function body
      if (!functionText.includes(importName)) continue;

      const resolvedPath = resolveImportPath(fullPath, moduleSpec);
      if (!resolvedPath || !existsSync(resolvedPath)) continue;

      // Avoid duplicates
      if (importedTypes.some(t => t.name === importName)) continue;

      const targetContent = readFileSync(resolvedPath, 'utf-8');
      const definition = extractTypeDefinition(targetContent, importName);

      if (definition && totalSize + definition.length <= maxContextSize) {
        importedTypes.push({ name: importName, definition, filePath: resolvedPath });
        totalSize += definition.length;
        fileCount++;
      }
    }
  }

  // Extract function calls
  const calledFunctions = extractCalledFunctions(functionText);

  // Build context files list
  const contextFiles: CodeContext['contextFiles'] = [];
  const seenPaths = new Set<string>();
  for (const imp of importedTypes) {
    if (!seenPaths.has(imp.filePath)) {
      seenPaths.add(imp.filePath);
      contextFiles.push({ path: imp.filePath, relevance: `Defines type: ${imp.name}` });
    }
  }

  return { importedTypes, calledFunctions, contextFiles };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find an exported function or variable declaration by name.
 */
function findExport(
  sourceFile: SourceFile,
  exportName: string,
): FunctionDeclaration | VariableDeclaration | undefined {
  const funcDecl = sourceFile.getFunction(exportName);
  if (funcDecl && funcDecl.isExported()) {
    return funcDecl;
  }

  for (const varStmt of sourceFile.getVariableStatements()) {
    if (!varStmt.isExported()) continue;
    for (const decl of varStmt.getDeclarations()) {
      if (decl.getName() === exportName) {
        return decl;
      }
    }
  }

  return undefined;
}

/**
 * Resolve an import path to an actual file, probing extensions.
 */
function resolveImportPath(fromFile: string, moduleSpecifier: string): string | null {
  const dir = dirname(fromFile);
  const baseSpec = moduleSpecifier.replace(/\.js$/, '');
  const basePath = resolve(dir, baseSpec);

  const extensions = ['.ts', '.tsx', '.js', '.d.ts'];
  for (const ext of extensions) {
    const candidate = basePath + ext;
    if (existsSync(candidate)) return candidate;
  }

  const indexExtensions = ['/index.ts', '/index.tsx', '/index.js'];
  for (const ext of indexExtensions) {
    const candidate = basePath + ext;
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Extract a type/interface definition text from file content.
 */
function extractTypeDefinition(content: string, typeName: string): string | null {
  const patterns = [
    new RegExp(`(export\\s+)?interface\\s+${typeName}\\s*(?:extends\\s+[^{]+)?\\{`, 'm'),
    new RegExp(`(export\\s+)?type\\s+${typeName}\\s*=`, 'm'),
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match || match.index === undefined) continue;

    const startIdx = match.index;

    if (match[0].includes('interface')) {
      const braceStart = content.indexOf('{', startIdx);
      if (braceStart === -1) continue;

      let depth = 1;
      let i = braceStart + 1;
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') depth--;
        i++;
      }
      if (depth === 0) {
        return content.slice(startIdx, i).trim();
      }
    }

    if (match[0].includes('type')) {
      const eqIdx = content.indexOf('=', startIdx + match[0].length - 1);
      if (eqIdx === -1) continue;

      const afterEq = content.slice(eqIdx + 1).trimStart();

      if (afterEq.startsWith('{')) {
        const braceStart = eqIdx + 1 + content.slice(eqIdx + 1).indexOf('{');
        let depth = 1;
        let i = braceStart + 1;
        while (i < content.length && depth > 0) {
          if (content[i] === '{') depth++;
          else if (content[i] === '}') depth--;
          i++;
        }
        if (depth === 0) {
          while (i < content.length && /[\s;]/.test(content[i])) i++;
          return content.slice(startIdx, i).trim().replace(/;$/, '');
        }
      } else {
        const endIdx = content.indexOf(';', eqIdx);
        if (endIdx !== -1) {
          return content.slice(startIdx, endIdx + 1).trim();
        }
      }
    }
  }

  return null;
}

/**
 * Extract function call names from function body text.
 */
function extractCalledFunctions(functionText: string): string[] {
  const calls = new Set<string>();
  const skipNames = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case',
    'return', 'throw', 'new', 'typeof', 'instanceof',
    'import', 'export', 'const', 'let', 'var',
    'true', 'false', 'null', 'undefined', 'async', 'await',
    'function', 'class', 'extends', 'implements',
  ]);

  const callPattern = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = callPattern.exec(functionText)) !== null) {
    const name = match[1];
    if (!skipNames.has(name)) {
      calls.add(name);
    }
  }

  return [...calls].sort();
}
