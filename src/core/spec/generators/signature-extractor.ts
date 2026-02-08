/**
 * @arch archcodex.infra
 * @intent:ast-analysis
 *
 * Function signature extractor for implementation-aware test generation.
 * Uses ts-morph to parse TypeScript files and extract function signatures.
 *
 * Based on spec.speccodex.generate.signature:
 * - Extract function/method name from implementation path
 * - Extract parameter names and types from AST
 * - Extract return type from AST
 * - Handle exported functions, arrow functions, and methods
 * - Detect factory patterns (functions that return objects requiring further invocation)
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import {
  Project,
  FunctionDeclaration,
  VariableDeclaration,
  ArrowFunction,
  FunctionExpression,
  SyntaxKind,
  Node,
  ParameterDeclaration,
  type SourceFile,
  type InterfaceDeclaration,
  type ImportDeclaration,
  type TypeNode,
} from 'ts-morph';

/**
 * Extracted parameter information.
 */
export interface ExtractedParameter {
  name: string;
  type: string;
  optional: boolean;
  destructured: boolean;
}

/**
 * Extracted dependency from import declarations.
 * Used for generating vi.mock() scaffolding in tests.
 */
export interface ExtractedDependency {
  /** Import path as written in source (e.g., '../../utils/database.js') */
  importPath: string;
  /** Named imports (e.g., ['query', 'insert']) */
  importedNames: string[];
  /** Whether this is a Node.js builtin module */
  isNodeBuiltin: boolean;
  /** Suggested mock strategy */
  suggestedMockType: 'full' | 'partial' | 'spy';
}

/**
 * Extracted function signature.
 */
export interface ExtractedSignature {
  valid: boolean;
  functionName: string;
  parameters: ExtractedParameter[];
  destructuredFields?: string[];
  returnType: string;
  isAsync: boolean;
  /** Whether function returns an object that requires further invocation (factory pattern) */
  isFactory: boolean;
  callPattern: 'direct' | 'destructured' | 'factory';
  errors: Array<{ code: string; message: string }>;
  /** Dependencies extracted from import declarations */
  dependencies?: ExtractedDependency[];
}

/**
 * Options for signature extraction.
 */
export interface SignatureExtractorOptions {
  projectRoot?: string;
}

/**
 * Parse an implementation path into file path and export name.
 * Format: "path/to/file.ts#exportName"
 */
export function parseImplementationPath(implementationPath: string): {
  filePath: string;
  exportName: string;
} | null {
  const match = implementationPath.match(/^(.+\.(ts|tsx|js|jsx))#(.+)$/);
  if (!match) {
    return null;
  }
  return {
    filePath: match[1],
    exportName: match[3],
  };
}

/**
 * Extract function signature from an implementation file.
 */
export function extractFunctionSignature(
  implementationPath: string,
  options: SignatureExtractorOptions = {}
): ExtractedSignature {
  // Parse implementation path
  const parsed = parseImplementationPath(implementationPath);
  if (!parsed) {
    return {
      valid: false,
      functionName: '',
      parameters: [],
      returnType: 'unknown',
      isAsync: false,
      isFactory: false,
      callPattern: 'destructured',
      errors: [
        {
          code: 'INVALID_PATH',
          message: `Invalid implementation path format: ${implementationPath}. Expected: path/to/file.ts#exportName`,
        },
      ],
    };
  }

  const { filePath, exportName } = parsed;

  // Resolve full path
  const fullPath = options.projectRoot
    ? resolve(options.projectRoot, filePath)
    : resolve(filePath);

  // Check file exists
  if (!existsSync(fullPath)) {
    return {
      valid: false,
      functionName: exportName,
      parameters: [],
      returnType: 'unknown',
      isAsync: false,
      isFactory: false,
      callPattern: 'destructured',
      errors: [
        {
          code: 'IMPLEMENTATION_NOT_FOUND',
          message: `Implementation file not found: ${fullPath}`,
        },
      ],
    };
  }

  // Read and parse file
  const content = readFileSync(fullPath, 'utf-8');
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  try {
    const sourceFile = project.createSourceFile(fullPath, content, {
      overwrite: true,
    });

    // Find the export
    const exportDecl = findExport(sourceFile, exportName);
    if (!exportDecl) {
      return {
        valid: false,
        functionName: exportName,
        parameters: [],
        returnType: 'unknown',
        isAsync: false,
        isFactory: false,
        callPattern: 'destructured',
        errors: [
          {
            code: 'EXPORT_NOT_FOUND',
            message: `Export '${exportName}' not found in ${filePath}`,
          },
        ],
      };
    }

    // Extract signature based on declaration type
    const signature = extractSignatureFromDeclaration(exportDecl, exportName);
    if (signature.errors.length > 0) {
      return signature;
    }

    return signature;
  } finally {
    // Clean up ts-morph resources
    for (const sf of project.getSourceFiles()) {
      project.removeSourceFile(sf);
    }
  }
}

/**
 * Find an export in a source file by name.
 */
function findExport(
  sourceFile: ReturnType<Project['createSourceFile']>,
  exportName: string
): Node | null {
  // Check exported function declarations
  for (const fn of sourceFile.getFunctions()) {
    if (fn.isExported() && fn.getName() === exportName) {
      return fn;
    }
  }

  // Check exported variable declarations (arrow functions, etc.)
  for (const varStmt of sourceFile.getVariableStatements()) {
    if (varStmt.isExported()) {
      for (const decl of varStmt.getDeclarations()) {
        if (decl.getName() === exportName) {
          return decl;
        }
      }
    }
  }

  // Check export declarations
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    for (const namedExport of exportDecl.getNamedExports()) {
      if (namedExport.getName() === exportName) {
        // Follow the export to its declaration
        const symbol = namedExport.getSymbol();
        if (symbol) {
          const declarations = symbol.getDeclarations();
          if (declarations.length > 0) {
            return declarations[0];
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract signature from a declaration node.
 */
function extractSignatureFromDeclaration(
  node: Node,
  exportName: string
): ExtractedSignature {
  // Handle function declaration
  if (Node.isFunctionDeclaration(node)) {
    return extractFromFunctionDeclaration(node as FunctionDeclaration);
  }

  // Handle variable declaration (arrow function, function expression, or const)
  if (Node.isVariableDeclaration(node)) {
    const varDecl = node as VariableDeclaration;
    const initializer = varDecl.getInitializer();

    if (!initializer) {
      return {
        valid: false,
        functionName: exportName,
        parameters: [],
        returnType: 'unknown',
        isAsync: false,
        isFactory: false,
        callPattern: 'destructured',
        errors: [
          {
            code: 'NOT_A_FUNCTION',
            message: `Export '${exportName}' is not a function (no initializer)`,
          },
        ],
      };
    }

    // Arrow function
    if (Node.isArrowFunction(initializer)) {
      return extractFromArrowFunction(
        initializer as ArrowFunction,
        exportName
      );
    }

    // Function expression
    if (Node.isFunctionExpression(initializer)) {
      return extractFromFunctionExpression(
        initializer as FunctionExpression,
        exportName
      );
    }

    // Call expression (e.g., makeAuthMutation(...))
    if (Node.isCallExpression(initializer)) {
      return extractFromCallExpression(initializer, exportName);
    }

    return {
      valid: false,
      functionName: exportName,
      parameters: [],
      returnType: 'unknown',
      isAsync: false,
      isFactory: false,
      callPattern: 'destructured',
      errors: [
        {
          code: 'NOT_A_FUNCTION',
          message: `Export '${exportName}' is not a function`,
        },
      ],
    };
  }

  return {
    valid: false,
    functionName: exportName,
    parameters: [],
    returnType: 'unknown',
    isAsync: false,
    isFactory: false,
    callPattern: 'destructured',
    errors: [
      {
        code: 'UNSUPPORTED_DECLARATION',
        message: `Unsupported declaration type for '${exportName}'`,
      },
    ],
  };
}

/**
 * Extract signature from a function declaration.
 */
function extractFromFunctionDeclaration(
  fn: FunctionDeclaration
): ExtractedSignature {
  const name = fn.getName() || 'anonymous';
  const returnType = fn.getReturnType().getText(fn);
  const isAsync = fn.isAsync();
  const isFactory = isFactoryReturnType(returnType);

  const { parameters, destructuredFields, callPattern } = extractParameters(
    fn.getParameters()
  );

  return {
    valid: true,
    functionName: name,
    parameters,
    destructuredFields,
    returnType,
    isAsync,
    isFactory,
    callPattern: isFactory ? 'factory' : callPattern,
    errors: [],
  };
}

/**
 * Extract signature from an arrow function.
 */
function extractFromArrowFunction(
  fn: ArrowFunction,
  name: string
): ExtractedSignature {
  const returnType = fn.getReturnType().getText(fn);
  const isAsync = fn.isAsync();
  const isFactory = isFactoryReturnType(returnType);

  const { parameters, destructuredFields, callPattern } = extractParameters(
    fn.getParameters()
  );

  return {
    valid: true,
    functionName: name,
    parameters,
    destructuredFields,
    returnType,
    isAsync,
    isFactory,
    callPattern: isFactory ? 'factory' : callPattern,
    errors: [],
  };
}

/**
 * Extract signature from a function expression.
 */
function extractFromFunctionExpression(
  fn: FunctionExpression,
  name: string
): ExtractedSignature {
  const returnType = fn.getReturnType().getText(fn);
  const isAsync = fn.isAsync();
  const isFactory = isFactoryReturnType(returnType);

  const { parameters, destructuredFields, callPattern } = extractParameters(
    fn.getParameters()
  );

  return {
    valid: true,
    functionName: name,
    parameters,
    destructuredFields,
    returnType,
    isAsync,
    isFactory,
    callPattern: isFactory ? 'factory' : callPattern,
    errors: [],
  };
}

/**
 * Extract signature from a call expression (e.g., makeAuthMutation(async (ctx, args) => {...})).
 */
function extractFromCallExpression(
  callExpr: Node,
  name: string
): ExtractedSignature {
  // Look for arrow function or function expression in arguments
  const args = callExpr.getChildrenOfKind(SyntaxKind.SyntaxList);
  for (const arg of args) {
    for (const child of arg.getChildren()) {
      if (Node.isArrowFunction(child)) {
        const result = extractFromArrowFunction(child as ArrowFunction, name);
        // For wrapped functions, assume destructured pattern
        if (result.callPattern === 'direct') {
          result.callPattern = 'destructured';
        }
        return result;
      }
      if (Node.isFunctionExpression(child)) {
        const result = extractFromFunctionExpression(
          child as FunctionExpression,
          name
        );
        if (result.callPattern === 'direct') {
          result.callPattern = 'destructured';
        }
        return result;
      }
    }
  }

  // Fallback: try to infer from type
  const returnType = callExpr.getType().getText();
  const isFactory = isFactoryReturnType(returnType);

  return {
    valid: true,
    functionName: name,
    parameters: [],
    returnType,
    isAsync: false,
    isFactory,
    callPattern: isFactory ? 'factory' : 'destructured',
    errors: [],
  };
}

/**
 * Extract parameters from parameter declarations.
 */
function extractParameters(params: ParameterDeclaration[]): {
  parameters: ExtractedParameter[];
  destructuredFields?: string[];
  callPattern: 'direct' | 'destructured';
} {
  const parameters: ExtractedParameter[] = [];
  let hasDestructured = false;
  let destructuredFields: string[] | undefined;

  for (const param of params) {
    const nameNode = param.getNameNode();
    const isDestructured = Node.isObjectBindingPattern(nameNode);

    if (isDestructured) {
      hasDestructured = true;
      // Extract field names from destructured pattern
      const fields: string[] = [];
      for (const element of nameNode.getElements()) {
        fields.push(element.getName());
      }
      destructuredFields = fields;

      parameters.push({
        name: 'args',
        type: param.getType().getText(param),
        optional: param.hasQuestionToken(),
        destructured: true,
      });
    } else {
      parameters.push({
        name: param.getName(),
        type: param.getType().getText(param),
        optional: param.hasQuestionToken(),
        destructured: false,
      });
    }
  }

  return {
    parameters,
    destructuredFields,
    callPattern: hasDestructured ? 'destructured' : 'direct',
  };
}

/**
 * Check if return type indicates a factory pattern.
 * Factory functions return objects that require further invocation.
 * Common patterns: Command (CLI), Router (Express), App (frameworks), Builder patterns.
 */
function isFactoryReturnType(returnType: string): boolean {
  // Common factory return types
  const factoryPatterns = [
    'Command',     // Commander.js CLI
    'Router',      // Express router
    'App',         // Framework apps
    'Builder',     // Builder pattern
    'Factory',     // Explicit factory
    'Program',     // CLI programs
  ];

  return factoryPatterns.some(pattern =>
    returnType === pattern || returnType.includes(pattern)
  );
}

/**
 * Generate import statement for a function.
 */
export function generateImportStatement(
  signature: ExtractedSignature,
  implementationPath: string,
  outputPath?: string
): string {
  const parsed = parseImplementationPath(implementationPath);
  if (!parsed) {
    return `// TODO: Import ${signature.functionName}`;
  }

  // Calculate relative import path
  let importPath = parsed.filePath;
  if (outputPath) {
    const outputDir = dirname(outputPath);
    importPath = relative(outputDir, parsed.filePath);
    if (!importPath.startsWith('.')) {
      importPath = './' + importPath;
    }
  }

  // Remove .ts extension for import
  importPath = importPath.replace(/\.tsx?$/, '.js');

  return `import { ${signature.functionName} } from '${importPath}';`;
}

/**
 * Generate function call code based on signature.
 */
export function generateFunctionCall(
  signature: ExtractedSignature,
  args: Record<string, unknown>
): string {
  const { functionName, callPattern, isAsync } = signature;
  const awaitPrefix = isAsync ? 'await ' : '';

  switch (callPattern) {
    case 'factory':
      // Factory pattern: create instance, then invoke
      // Note: actual invocation method depends on the factory type
      // This is a placeholder - test templates should customize based on return type
      return `const instance = ${functionName}();\n// TODO: invoke instance with appropriate method`;

    case 'destructured': {
      // Pass as object literal
      const objArgs = Object.keys(args).join(', ');
      return `${awaitPrefix}${functionName}({ ${objArgs} })`;
    }

    case 'direct':
    default: {
      // Pass positionally
      const positionalArgs = signature.parameters
        .map((p) => p.name)
        .join(', ');
      return `${awaitPrefix}${functionName}(${positionalArgs})`;
    }
  }
}

// =============================================================================
// Dependency Extraction
// =============================================================================

/**
 * Node.js builtin module names (without node: prefix).
 */
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2',
  'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
  'punycode', 'querystring', 'readline', 'repl', 'stream', 'string_decoder',
  'sys', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads',
  'zlib', 'fs/promises',
]);

/**
 * Extract dependencies from a TypeScript implementation file.
 * Parses import declarations and classifies them for mock generation.
 *
 * @param implementationPath - Path in "file.ts#export" format
 * @param options - Extraction options
 * @returns Array of extracted dependencies
 */
export function extractDependencies(
  implementationPath: string,
  options: SignatureExtractorOptions = {}
): ExtractedDependency[] {
  const parsed = parseImplementationPath(implementationPath);
  if (!parsed) return [];

  const fullPath = options.projectRoot
    ? resolve(options.projectRoot, parsed.filePath)
    : resolve(parsed.filePath);

  if (!existsSync(fullPath)) return [];

  const content = readFileSync(fullPath, 'utf-8');
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  try {
    const sourceFile = project.createSourceFile(fullPath, content, {
      overwrite: true,
    });

    const dependencies: ExtractedDependency[] = [];

    for (const importDecl of sourceFile.getImportDeclarations()) {
      // Skip type-only imports
      if (importDecl.isTypeOnly()) continue;

      const moduleSpecifier = importDecl.getModuleSpecifierValue();

      // Collect named imports (skip type-only named imports)
      const importedNames: string[] = [];
      for (const namedImport of importDecl.getNamedImports()) {
        if (!namedImport.isTypeOnly()) {
          importedNames.push(namedImport.getName());
        }
      }

      // Include default import if present
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        importedNames.push(defaultImport.getText());
      }

      // Skip if all imports were type-only (nothing left)
      if (importedNames.length === 0) continue;

      // Classify the dependency
      const rawModule = moduleSpecifier.replace(/^node:/, '');
      const isNodeBuiltin = NODE_BUILTINS.has(rawModule);

      dependencies.push({
        importPath: moduleSpecifier,
        importedNames,
        isNodeBuiltin,
        suggestedMockType: isNodeBuiltin ? 'full' : 'full',
      });
    }

    return dependencies;
  } finally {
    for (const sf of project.getSourceFiles()) {
      project.removeSourceFile(sf);
    }
  }
}

// =============================================================================
// Cross-File Type Resolution
// =============================================================================

/**
 * Resolved field from a cross-file type.
 */
export interface ResolvedTypeField {
  name: string;
  type: string;
  optional: boolean;
}

/**
 * Resolve a named type across files by following imports.
 * Finds where a type is imported from, reads that file, and extracts its fields.
 *
 * Returns empty array when:
 * - Source file doesn't exist
 * - Type is not imported (or imported from node_modules)
 * - Imported file doesn't exist
 * - Type is not found in the imported file
 */
export function resolveTypeAcrossFiles(
  typeName: string,
  sourceFilePath: string,
  options: SignatureExtractorOptions = {},
): ResolvedTypeField[] {
  const projectRoot = options.projectRoot ?? process.cwd();
  const fullPath = resolve(projectRoot, sourceFilePath);

  if (!existsSync(fullPath)) return [];

  const content = readFileSync(fullPath, 'utf-8');
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  try {
    const sourceFile = project.createSourceFile(fullPath, content, {
      overwrite: true,
    });

    // Find which import brings in this type
    const importDecl = findImportForType(sourceFile, typeName);
    if (!importDecl) return [];

    const moduleSpecifier = importDecl.getModuleSpecifierValue();

    // Only follow relative imports (skip node_modules)
    if (!moduleSpecifier.startsWith('.')) return [];

    // Resolve the import path to an actual file
    const resolvedPath = resolveImportPath(fullPath, moduleSpecifier);
    if (!resolvedPath) return [];

    // Read and parse the target file
    const targetContent = readFileSync(resolvedPath, 'utf-8');
    const targetFile = project.createSourceFile(resolvedPath, targetContent, {
      overwrite: true,
    });

    // Try interface declaration
    const interfaceDecl = targetFile.getInterface(typeName);
    if (interfaceDecl) {
      return extractFieldsFromInterfaceDecl(interfaceDecl);
    }

    // Try type alias with object literal
    const typeAlias = targetFile.getTypeAlias(typeName);
    if (typeAlias) {
      return extractFieldsFromTypeAlias(typeAlias.getTypeNode());
    }

    // Type might be re-exported from a barrel — follow one level
    const reExportDecl = findReExportForType(targetFile, typeName);
    if (reExportDecl) {
      const reExportModule = reExportDecl.getModuleSpecifierValue();
      if (reExportModule.startsWith('.')) {
        const reResolvedPath = resolveImportPath(resolvedPath, reExportModule);
        if (reResolvedPath) {
          const reContent = readFileSync(reResolvedPath, 'utf-8');
          const reFile = project.createSourceFile(reResolvedPath, reContent, {
            overwrite: true,
          });
          const reInterface = reFile.getInterface(typeName);
          if (reInterface) return extractFieldsFromInterfaceDecl(reInterface);
          const reType = reFile.getTypeAlias(typeName);
          if (reType) return extractFieldsFromTypeAlias(reType.getTypeNode());
        }
      }
    }

    return [];
  } finally {
    for (const sf of project.getSourceFiles()) {
      project.removeSourceFile(sf);
    }
  }
}

/**
 * Find the import declaration that imports a given type name.
 */
function findImportForType(
  sourceFile: SourceFile,
  typeName: string,
): ImportDeclaration | undefined {
  for (const importDecl of sourceFile.getImportDeclarations()) {
    for (const namedImport of importDecl.getNamedImports()) {
      if (namedImport.getName() === typeName) {
        return importDecl;
      }
    }
  }
  return undefined;
}

/**
 * Find an export declaration that re-exports a given type name.
 */
function findReExportForType(
  sourceFile: SourceFile,
  typeName: string,
): { getModuleSpecifierValue(): string } | undefined {
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    const moduleSpec = exportDecl.getModuleSpecifierValue();
    if (!moduleSpec) continue;
    for (const namedExport of exportDecl.getNamedExports()) {
      if (namedExport.getName() === typeName) {
        return { getModuleSpecifierValue: () => moduleSpec };
      }
    }
  }
  return undefined;
}

/**
 * Resolve a module specifier to an absolute file path.
 * Probes for .ts, .tsx, .js, .d.ts extensions and index files.
 */
function resolveImportPath(
  sourceFilePath: string,
  moduleSpecifier: string,
): string | null {
  const sourceDir = dirname(sourceFilePath);

  // Strip .js/.jsx extension if present (TypeScript imports often use .js)
  const stripped = moduleSpecifier.replace(/\.(js|jsx)$/, '');
  const basePath = resolve(sourceDir, stripped);

  // Try direct file with various extensions
  for (const ext of ['.ts', '.tsx', '.js', '.d.ts']) {
    const withExt = basePath + ext;
    if (existsSync(withExt)) return withExt;
  }

  // Try index file in directory
  for (const ext of ['.ts', '.tsx', '.js']) {
    const indexPath = resolve(basePath, `index${ext}`);
    if (existsSync(indexPath)) return indexPath;
  }

  return null;
}

/**
 * Extract fields from a ts-morph InterfaceDeclaration.
 */
function extractFieldsFromInterfaceDecl(
  interfaceDecl: InterfaceDeclaration,
): ResolvedTypeField[] {
  const fields: ResolvedTypeField[] = [];

  for (const property of interfaceDecl.getProperties()) {
    fields.push({
      name: property.getName(),
      type: property.getType().getText(property),
      optional: property.hasQuestionToken(),
    });
  }

  return fields;
}

/**
 * Extract fields from a type alias's type node (for `type X = { ... }`).
 */
function extractFieldsFromTypeAlias(
  typeNode: TypeNode | undefined,
): ResolvedTypeField[] {
  if (!typeNode) return [];

  // Handle type literal: type X = { field: string; ... }
  if (Node.isTypeLiteral(typeNode)) {
    const fields: ResolvedTypeField[] = [];
    for (const member of typeNode.getMembers()) {
      if (Node.isPropertySignature(member)) {
        fields.push({
          name: member.getName(),
          type: member.getType().getText(member),
          optional: member.hasQuestionToken(),
        });
      }
    }
    return fields;
  }

  return [];
}
