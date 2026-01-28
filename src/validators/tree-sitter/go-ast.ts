/**
 * @arch archcodex.infra.validator-support
 *
 * Go AST extraction using tree-sitter.
 * Extracts SemanticModel from Go source files.
 */

import Parser from 'tree-sitter';
import Go from 'tree-sitter-go';
import type {
  SemanticModel,
  ClassInfo,
  InterfaceInfo,
  FunctionInfo,
  ImportInfo,
  MethodInfo,
  FunctionCallInfo,
  MutationInfo,
  ExportInfo,
  Visibility,
} from '../semantic.types.js';
import {
  createContext,
  getNodeText,
  getLocation,
  findNodesOfType,
  getParentOfType,
  getChildrenOfType,
  getNodeLines,
  getGoVisibility,
  DEFAULT_CONTROL_FLOW,
  type TreeSitterContext,
} from './TreeSitterUtils.js';

// =============================================================================
// Tree-sitter Node Type Constants
// =============================================================================
// These constants prevent typos and enable IDE autocompletion.
// Organized by semantic category for maintainability.

/** Go tree-sitter node types for imports */
const GoImportNodes = {
  IMPORT_DECLARATION: 'import_declaration',
  IMPORT_SPEC_LIST: 'import_spec_list',
  IMPORT_SPEC: 'import_spec',
  PACKAGE_IDENTIFIER: 'package_identifier',
  BLANK_IDENTIFIER: 'blank_identifier',
  DOT: 'dot',
  INTERPRETED_STRING_LITERAL: 'interpreted_string_literal',
} as const;

/** Go tree-sitter node types for type declarations */
const GoTypeNodes = {
  TYPE_DECLARATION: 'type_declaration',
  TYPE_SPEC: 'type_spec',
  TYPE_IDENTIFIER: 'type_identifier',
  STRUCT_TYPE: 'struct_type',
  INTERFACE_TYPE: 'interface_type',
  POINTER_TYPE: 'pointer_type',
  QUALIFIED_TYPE: 'qualified_type',
} as const;

/** Go tree-sitter node types for struct/interface members */
const GoMemberNodes = {
  FIELD_DECLARATION_LIST: 'field_declaration_list',
  FIELD_DECLARATION: 'field_declaration',
  FIELD_IDENTIFIER: 'field_identifier',
  METHOD_ELEM: 'method_elem',
  TYPE_ELEM: 'type_elem',
} as const;

/** Go tree-sitter node types for functions and methods */
const GoFunctionNodes = {
  FUNCTION_DECLARATION: 'function_declaration',
  METHOD_DECLARATION: 'method_declaration',
  PARAMETER_LIST: 'parameter_list',
  PARAMETER_DECLARATION: 'parameter_declaration',
  VARIADIC_PARAMETER_DECLARATION: 'variadic_parameter_declaration',
  IDENTIFIER: 'identifier',
  BLOCK: 'block',
} as const;

/** Go tree-sitter node types for expressions */
const GoExpressionNodes = {
  CALL_EXPRESSION: 'call_expression',
  SELECTOR_EXPRESSION: 'selector_expression',
  PARENTHESIZED_EXPRESSION: 'parenthesized_expression',
  ARGUMENT_LIST: 'argument_list',
  EXPRESSION_LIST: 'expression_list',
} as const;

/** Go tree-sitter node types for statements */
const GoStatementNodes = {
  ASSIGNMENT_STATEMENT: 'assignment_statement',
  VAR_DECLARATION: 'var_declaration',
  CONST_DECLARATION: 'const_declaration',
  VAR_SPEC: 'var_spec',
  CONST_SPEC: 'const_spec',
} as const;

/** Go assignment operators */
const GoAssignmentOperators = new Set([
  '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=',
]);

/**
 * Go language keywords that should not be tracked as function calls.
 * These are either control flow keywords or builtin functions that are
 * too low-level to be meaningful for architectural analysis.
 *
 * Note: make, new, append, len, cap are Go builtins. We skip them because:
 * 1. They're language primitives, not user-defined functions
 * 2. Tracking them would add noise without architectural insight
 * 3. Constraints like "forbid_call" target user code, not language features
 */
const GO_SKIP_KEYWORDS = new Set([
  // Control flow
  'if', 'for', 'switch', 'select', 'case', 'range', 'return',
  // Declaration keywords
  'func', 'type', 'var', 'const', 'import', 'package',
  // Type keywords
  'map', 'chan', 'struct', 'interface',
  // Builtin functions (language primitives)
  'make', 'new', 'append', 'len', 'cap',
]);

/**
 * Creates a Go parser instance.
 *
 * Note: The type assertion `as unknown as Parser.Language` is required because
 * tree-sitter-go's TypeScript definitions don't properly extend tree-sitter's
 * Language type, despite being compatible at runtime. This is a known issue
 * with tree-sitter's TypeScript ecosystem.
 */
export function createGoParser(): Parser {
  const parser = new Parser();
  parser.setLanguage(Go as unknown as Parser.Language);
  return parser;
}

/**
 * Extracts a complete SemanticModel from Go source code.
 * Returns an empty model if parsing fails (graceful degradation).
 */
export function extractGoSemanticModel(
  parser: Parser,
  sourceCode: string,
  filePath: string,
  fileName: string,
  extension: string
): SemanticModel {
  // Create base model with file metadata (always available)
  const lines = sourceCode.split('\n');
  const baseModel: SemanticModel = {
    filePath,
    fileName,
    extension,
    content: sourceCode,
    lineCount: calculateLineCount(lines),
    locCount: calculateLoc(lines),
    language: 'go',
    imports: [],
    classes: [],
    interfaces: [],
    functions: [],
    functionCalls: [],
    mutations: [],
    exports: [],
  };

  try {
    const ctx = createContext(parser, sourceCode);
    const root = ctx.tree.rootNode;

    const imports = extractImports(root, ctx);
    const { classes, interfaces } = extractStructsAndInterfaces(root, ctx);
    attachMethodsToStructs(root, ctx, classes);
    const functions = extractFunctions(root, ctx);
    const functionCalls = extractFunctionCalls(root, ctx);
    const mutations = extractMutations(root, ctx);
    const exports = extractExports(root, ctx, classes, interfaces, functions);

    return {
      ...baseModel,
      imports,
      classes,
      interfaces,
      functions,
      functionCalls,
      mutations,
      exports,
    };
  } catch {
    // Parser failure - return base model with file metadata only
    return baseModel;
  }
}

function calculateLineCount(lines: string[]): number {
  if (lines.length === 0) return 0;
  if (lines[lines.length - 1] === '') {
    return lines.length - 1;
  }
  return lines.length;
}

function calculateLoc(lines: string[]): number {
  if (lines.length === 0) return 0;
  let loc = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    if (inBlockComment) {
      const closeIdx = trimmed.indexOf('*/');
      if (closeIdx >= 0) {
        inBlockComment = false;
        const afterComment = trimmed.slice(closeIdx + 2).trim();
        if (afterComment !== '' && !afterComment.startsWith('//')) {
          loc++;
        }
      }
      continue;
    }

    if (trimmed.startsWith('//')) continue;

    const openIdx = trimmed.indexOf('/*');
    if (openIdx >= 0) {
      const closeIdx = trimmed.indexOf('*/', openIdx + 2);
      if (closeIdx >= 0) {
        const before = trimmed.slice(0, openIdx).trim();
        const after = trimmed.slice(closeIdx + 2).trim();
        if (before !== '' || (after !== '' && !after.startsWith('//'))) {
          loc++;
        }
      } else {
        inBlockComment = true;
        const before = trimmed.slice(0, openIdx).trim();
        if (before !== '') loc++;
      }
      continue;
    }

    loc++;
  }

  return loc;
}

function extractImports(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext
): ImportInfo[] {
  const imports: ImportInfo[] = [];

  const importDecls = findNodesOfType(root, [GoImportNodes.IMPORT_DECLARATION]);
  for (const decl of importDecls) {
    // Check for import spec list (block import)
    const specList = decl.children.find(c => c.type === GoImportNodes.IMPORT_SPEC_LIST);
    if (specList) {
      for (const spec of specList.children) {
        if (spec.type === GoImportNodes.IMPORT_SPEC) {
          const importInfo = parseImportSpec(spec, ctx);
          if (importInfo) imports.push(importInfo);
        }
      }
    } else {
      // Single import
      const spec = decl.children.find(c => c.type === GoImportNodes.IMPORT_SPEC);
      if (spec) {
        const importInfo = parseImportSpec(spec, ctx);
        if (importInfo) imports.push(importInfo);
      }
    }
  }

  return imports;
}

function parseImportSpec(
  spec: Parser.SyntaxNode,
  ctx: TreeSitterContext
): ImportInfo | null {
  // import_spec can have:
  // - package_identifier (alias like . or _)
  // - interpreted_string_literal (the path)
  let alias: string | undefined;
  let pathNode: Parser.SyntaxNode | undefined;

  for (const child of spec.children) {
    if (
      child.type === GoImportNodes.PACKAGE_IDENTIFIER ||
      child.type === GoImportNodes.BLANK_IDENTIFIER ||
      child.type === GoImportNodes.DOT
    ) {
      alias = getNodeText(child, ctx.sourceCode);
    }
    if (child.type === GoImportNodes.INTERPRETED_STRING_LITERAL) {
      pathNode = child;
    }
  }

  if (!pathNode) return null;

  // Extract the string content (remove quotes)
  const fullText = getNodeText(pathNode, ctx.sourceCode);
  const pkg = fullText.slice(1, -1); // Remove surrounding quotes

  // Determine default import name
  const isSideEffectAlias = alias === '.' || alias === '_';
  const defaultImport = isSideEffectAlias
    ? undefined
    : alias || pkg.split('/').pop()!;

  return {
    moduleSpecifier: pkg,
    defaultImport,
    isDynamic: false,
    location: getLocation(spec),
    rawText: getNodeText(spec, ctx.sourceCode),
  };
}

function extractStructsAndInterfaces(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext
): { classes: ClassInfo[]; interfaces: InterfaceInfo[] } {
  const classes: ClassInfo[] = [];
  const interfaces: InterfaceInfo[] = [];

  const typeDecls = findNodesOfType(root, [GoTypeNodes.TYPE_DECLARATION]);
  for (const decl of typeDecls) {
    // Find type_spec children
    const typeSpecs = getChildrenOfType(decl, GoTypeNodes.TYPE_SPEC);
    for (const spec of typeSpecs) {
      const nameNode = spec.children.find(c => c.type === GoTypeNodes.TYPE_IDENTIFIER);
      if (!nameNode) continue;

      const name = getNodeText(nameNode, ctx.sourceCode);
      const isExported = /^[A-Z]/.test(name);

      // Check if struct or interface
      const structType = spec.children.find(c => c.type === GoTypeNodes.STRUCT_TYPE);
      const interfaceType = spec.children.find(c => c.type === GoTypeNodes.INTERFACE_TYPE);

      if (structType) {
        const embeddings = extractEmbeddings(structType, ctx);
        // Go uses composition via embedding rather than true inheritance.
        // We map the first embedding to `extends` (primary composition) and
        // remaining embeddings to `implements` (additional mixins). This
        // provides a consistent semantic model across languages while
        // preserving Go's compositional nature for constraint analysis.
        classes.push({
          name,
          isExported,
          extends: embeddings[0],
          inheritanceChain: embeddings.length > 0 ? [name, ...embeddings] : [name],
          implements: embeddings.slice(1),
          decorators: [],
          methods: [],
          isAbstract: false,
          location: getLocation(spec),
        });
      } else if (interfaceType) {
        const { methods, embedded } = extractInterfaceMembers(interfaceType, ctx);
        interfaces.push({
          name,
          isExported,
          extends: embedded,
          methods,
          location: getLocation(spec),
        });
      }
    }
  }

  return { classes, interfaces };
}

function extractEmbeddings(
  structType: Parser.SyntaxNode,
  ctx: TreeSitterContext
): string[] {
  const embeddings: string[] = [];

  const fieldList = structType.children.find(
    c => c.type === GoMemberNodes.FIELD_DECLARATION_LIST
  );
  if (!fieldList) return embeddings;

  for (const field of fieldList.children) {
    if (field.type !== GoMemberNodes.FIELD_DECLARATION) continue;

    // An embedding has no field_identifier, just a type
    const hasFieldName = field.children.some(
      c => c.type === GoMemberNodes.FIELD_IDENTIFIER
    );
    if (hasFieldName) continue;

    // Find the type (could be type_identifier, pointer_type, qualified_type)
    for (const child of field.children) {
      if (child.type === GoTypeNodes.TYPE_IDENTIFIER) {
        embeddings.push(getNodeText(child, ctx.sourceCode));
      } else if (child.type === GoTypeNodes.POINTER_TYPE) {
        const typeId = child.children.find(c => c.type === GoTypeNodes.TYPE_IDENTIFIER);
        if (typeId) embeddings.push(getNodeText(typeId, ctx.sourceCode));
      } else if (child.type === GoTypeNodes.QUALIFIED_TYPE) {
        // pkg.Type - get just the type name
        const typeId = child.children.find(c => c.type === GoTypeNodes.TYPE_IDENTIFIER);
        if (typeId) embeddings.push(getNodeText(typeId, ctx.sourceCode));
      }
    }
  }

  return embeddings;
}

function extractInterfaceMembers(
  interfaceType: Parser.SyntaxNode,
  ctx: TreeSitterContext
): { methods: Omit<MethodInfo, 'visibility'>[]; embedded: string[] } {
  const methods: Omit<MethodInfo, 'visibility'>[] = [];
  const embedded: string[] = [];

  for (const child of interfaceType.children) {
    if (child.type === GoMemberNodes.METHOD_ELEM) {
      // Method signature
      const nameNode = child.children.find(
        c => c.type === GoMemberNodes.FIELD_IDENTIFIER
      );
      if (!nameNode) continue;

      const name = getNodeText(nameNode, ctx.sourceCode);

      // Count parameters
      const paramLists = getChildrenOfType(child, GoFunctionNodes.PARAMETER_LIST);
      let parameterCount = 0;
      let returnType: string | undefined;

      if (paramLists.length > 0) {
        // First param list is input params
        const inputParams = paramLists[0];
        parameterCount = countParameters(inputParams);

        // Second param list (if any) is return type
        if (paramLists.length > 1) {
          returnType = getNodeText(paramLists[1], ctx.sourceCode);
        }
      }

      // Check for simple return type (type_identifier after params)
      const typeIdAfterParams = child.children.find(
        (c, i) => c.type === GoTypeNodes.TYPE_IDENTIFIER && i > 0
      );
      if (typeIdAfterParams && !returnType) {
        returnType = getNodeText(typeIdAfterParams, ctx.sourceCode);
      }

      methods.push({
        name,
        isStatic: false,
        isAbstract: true,
        decorators: [],
        parameterCount,
        returnType,
        location: getLocation(child),
      });
    } else if (child.type === GoMemberNodes.TYPE_ELEM) {
      // Embedded interface wrapped in type_elem
      const qualifiedType = child.children.find(c => c.type === GoTypeNodes.QUALIFIED_TYPE);
      const typeId = child.children.find(c => c.type === GoTypeNodes.TYPE_IDENTIFIER);
      if (qualifiedType) {
        embedded.push(getNodeText(qualifiedType, ctx.sourceCode));
      } else if (typeId) {
        embedded.push(getNodeText(typeId, ctx.sourceCode));
      }
    } else if (
      child.type === GoTypeNodes.TYPE_IDENTIFIER ||
      child.type === GoTypeNodes.QUALIFIED_TYPE
    ) {
      // Direct embedded interface (older tree-sitter versions)
      embedded.push(getNodeText(child, ctx.sourceCode));
    }
  }

  return { methods, embedded };
}

function countParameters(paramList: Parser.SyntaxNode): number {
  let count = 0;
  for (const child of paramList.children) {
    if (child.type === GoFunctionNodes.PARAMETER_DECLARATION) {
      // Count identifiers in the parameter declaration
      // e.g., "a, b int" has 2 identifiers
      const identifiers = child.children.filter(
        c => c.type === GoFunctionNodes.IDENTIFIER
      );
      // Fallback to 1 handles edge cases where tree-sitter represents
      // a single unnamed parameter (e.g., `func(int)`) without identifiers
      count += identifiers.length || 1;
    } else if (child.type === GoFunctionNodes.VARIADIC_PARAMETER_DECLARATION) {
      // Variadic parameter counts as 1
      count += 1;
    }
  }
  return count;
}

function attachMethodsToStructs(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext,
  classes: ClassInfo[]
): void {
  const structMap = new Map<string, ClassInfo>();
  for (const cls of classes) {
    structMap.set(cls.name, cls);
  }

  const methodDecls = findNodesOfType(root, [GoFunctionNodes.METHOD_DECLARATION]);
  for (const decl of methodDecls) {
    // First parameter_list is the receiver
    const paramLists = getChildrenOfType(decl, GoFunctionNodes.PARAMETER_LIST);
    if (paramLists.length < 2) continue;

    const receiverList = paramLists[0];
    const paramsNode = paramLists[1];

    // Extract receiver type
    const receiverParam = receiverList.children.find(
      c => c.type === GoFunctionNodes.PARAMETER_DECLARATION
    );
    if (!receiverParam) continue;

    let receiverType: string | undefined;
    for (const child of receiverParam.children) {
      if (child.type === GoTypeNodes.TYPE_IDENTIFIER) {
        receiverType = getNodeText(child, ctx.sourceCode);
        break;
      }
      if (child.type === GoTypeNodes.POINTER_TYPE) {
        const typeId = child.children.find(c => c.type === GoTypeNodes.TYPE_IDENTIFIER);
        if (typeId) {
          receiverType = getNodeText(typeId, ctx.sourceCode);
          break;
        }
      }
    }

    if (!receiverType) continue;

    // Get method name
    const nameNode = decl.children.find(c => c.type === GoMemberNodes.FIELD_IDENTIFIER);
    if (!nameNode) continue;

    const methodName = getNodeText(nameNode, ctx.sourceCode);
    const visibility: Visibility = getGoVisibility(methodName);

    // Count parameters
    const parameterCount = countParameters(paramsNode);

    // Get return type
    let returnType: string | undefined;
    // Look for type after parameter lists
    const returnIdx = decl.children.findIndex(c => c === paramsNode) + 1;
    for (let i = returnIdx; i < decl.children.length; i++) {
      const child = decl.children[i];
      if (child.type === GoFunctionNodes.BLOCK) break;
      if (
        child.type === GoTypeNodes.TYPE_IDENTIFIER ||
        child.type === GoFunctionNodes.PARAMETER_LIST
      ) {
        returnType = getNodeText(child, ctx.sourceCode);
        break;
      }
    }

    const { startLine, endLine } = getNodeLines(decl);

    const method: MethodInfo = {
      name: methodName,
      visibility,
      isStatic: false,
      isAbstract: false,
      decorators: [],
      parameterCount,
      returnType,
      location: getLocation(decl),
      startLine,
      endLine,
    };

    const struct = structMap.get(receiverType);
    if (struct) {
      struct.methods.push(method);
    }
  }
}

function extractFunctions(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext
): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  const funcDecls = findNodesOfType(root, [GoFunctionNodes.FUNCTION_DECLARATION]);
  for (const decl of funcDecls) {
    // Get function name
    const nameNode = decl.children.find(c => c.type === GoFunctionNodes.IDENTIFIER);
    if (!nameNode) continue;

    const funcName = getNodeText(nameNode, ctx.sourceCode);
    const isExported = /^[A-Z]/.test(funcName);
    const visibility: Visibility = isExported ? 'public' : 'private';

    // Get parameters
    const paramList = decl.children.find(c => c.type === GoFunctionNodes.PARAMETER_LIST);
    const parameterCount = paramList ? countParameters(paramList) : 0;

    // Get return type (after parameter list, before block)
    let returnType: string | undefined;
    const paramIdx = decl.children.findIndex(c => c === paramList);
    if (paramIdx >= 0) {
      for (let i = paramIdx + 1; i < decl.children.length; i++) {
        const child = decl.children[i];
        if (child.type === GoFunctionNodes.BLOCK) break;
        if (
          child.type === GoTypeNodes.TYPE_IDENTIFIER ||
          child.type === GoFunctionNodes.PARAMETER_LIST
        ) {
          returnType = getNodeText(child, ctx.sourceCode);
          break;
        }
      }
    }

    const { startLine, endLine } = getNodeLines(decl);

    functions.push({
      name: funcName,
      isExported,
      isAsync: false,
      visibility,
      decorators: [],
      parameterCount,
      returnType,
      location: getLocation(decl),
      startLine,
      endLine,
    });
  }

  return functions;
}

function extractFunctionCalls(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext
): FunctionCallInfo[] {
  const calls: FunctionCallInfo[] = [];

  const callExprs = findNodesOfType(root, [GoExpressionNodes.CALL_EXPRESSION]);
  for (const call of callExprs) {
    const funcNode = call.children.find(c =>
      c.type === GoFunctionNodes.IDENTIFIER ||
      c.type === GoExpressionNodes.SELECTOR_EXPRESSION ||
      c.type === GoExpressionNodes.PARENTHESIZED_EXPRESSION
    );
    if (!funcNode) continue;

    let callee: string;
    let receiver: string | undefined;
    let methodName: string;

    if (funcNode.type === GoExpressionNodes.SELECTOR_EXPRESSION) {
      // obj.method() or chained call like builder.Add("a").Build()
      const fieldNode = funcNode.children.find(
        c => c.type === GoMemberNodes.FIELD_IDENTIFIER
      );
      if (!fieldNode) continue;

      methodName = getNodeText(fieldNode, ctx.sourceCode);

      // Find the receiver - could be identifier, selector_expression, or call_expression
      const objNode = funcNode.children.find(c =>
        c.type === GoFunctionNodes.IDENTIFIER ||
        c.type === GoExpressionNodes.SELECTOR_EXPRESSION ||
        c.type === GoExpressionNodes.CALL_EXPRESSION
      );
      if (objNode) {
        receiver = getNodeText(objNode, ctx.sourceCode);
        callee = `${receiver}.${methodName}`;
      } else {
        continue;
      }
    } else if (funcNode.type === GoFunctionNodes.IDENTIFIER) {
      methodName = getNodeText(funcNode, ctx.sourceCode);
      callee = methodName;
    } else {
      continue;
    }

    // Skip keywords and builtins
    if (GO_SKIP_KEYWORDS.has(methodName) && !receiver) continue;

    // Count arguments
    const argList = call.children.find(c => c.type === GoExpressionNodes.ARGUMENT_LIST);
    let argumentCount = 0;
    const args: string[] = [];
    if (argList) {
      for (const arg of argList.children) {
        if (arg.type !== '(' && arg.type !== ')' && arg.type !== ',') {
          args.push(getNodeText(arg, ctx.sourceCode));
          argumentCount++;
        }
      }
    }

    // Find parent function
    const parentFunc = getParentOfType(call, [
      GoFunctionNodes.FUNCTION_DECLARATION,
      GoFunctionNodes.METHOD_DECLARATION,
    ]);
    let parentFuncName: string | undefined;
    if (parentFunc) {
      const nameNode = parentFunc.children.find(c =>
        c.type === GoFunctionNodes.IDENTIFIER ||
        c.type === GoMemberNodes.FIELD_IDENTIFIER
      );
      if (nameNode) {
        parentFuncName = getNodeText(nameNode, ctx.sourceCode);
      }
    }

    calls.push({
      callee,
      receiver,
      methodName,
      arguments: args,
      argumentCount,
      location: getLocation(call),
      rawText: getNodeText(call, ctx.sourceCode),
      controlFlow: DEFAULT_CONTROL_FLOW, // Go uses defer/recover, not try/catch
      isConstructorCall: false,
      isOptionalChain: false,
      parentFunction: parentFuncName,
    });
  }

  return calls;
}

function extractMutations(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext
): MutationInfo[] {
  const mutations: MutationInfo[] = [];

  // Assignment statements
  const assignments = findNodesOfType(root, [GoStatementNodes.ASSIGNMENT_STATEMENT]);
  for (const node of assignments) {
    const leftNode = node.children.find(
      c => c.type === GoExpressionNodes.EXPRESSION_LIST
    );
    if (!leftNode) continue;

    // Only look at direct children selector expressions (not nested ones)
    // This prevents s.config.timeout from also matching s.config
    for (const child of leftNode.children) {
      if (child.type === GoExpressionNodes.SELECTOR_EXPRESSION) {
        const target = getNodeText(child, ctx.sourceCode);
        const parts = target.split('.');
        if (parts.length < 2) continue;

        // Find the operator
        const opNode = node.children.find(c => GoAssignmentOperators.has(c.type));
        const operator = opNode ? opNode.type : '=';

        mutations.push({
          target,
          rootObject: parts[0],
          propertyPath: parts.slice(1),
          operator,
          location: getLocation(node),
          rawText: getNodeText(node, ctx.sourceCode),
          isDelete: false,
        });
      }
    }
  }

  return mutations;
}

function extractExports(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext,
  classes: ClassInfo[],
  interfaces: InterfaceInfo[],
  functions: FunctionInfo[]
): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const exportedNames = new Set<string>();

  // Exported classes (structs)
  for (const cls of classes) {
    if (cls.isExported) {
      exports.push({
        name: cls.name,
        kind: 'class',
        isDefault: false,
        location: cls.location,
      });
      exportedNames.add(cls.name);
    }
  }

  // Exported interfaces
  for (const iface of interfaces) {
    if (iface.isExported) {
      exports.push({
        name: iface.name,
        kind: 'interface',
        isDefault: false,
        location: iface.location,
      });
      exportedNames.add(iface.name);
    }
  }

  // Exported functions
  for (const func of functions) {
    if (func.isExported) {
      exports.push({
        name: func.name,
        kind: 'function',
        isDefault: false,
        location: func.location,
      });
      exportedNames.add(func.name);
    }
  }

  // Exported var/const declarations
  const varDecls = findNodesOfType(root, [
    GoStatementNodes.VAR_DECLARATION,
    GoStatementNodes.CONST_DECLARATION,
  ]);
  for (const decl of varDecls) {
    // Check var_spec or const_spec children
    const specs = findNodesOfType(decl, [
      GoStatementNodes.VAR_SPEC,
      GoStatementNodes.CONST_SPEC,
    ]);
    for (const spec of specs) {
      const nameNode = spec.children.find(c => c.type === GoFunctionNodes.IDENTIFIER);
      if (nameNode) {
        const name = getNodeText(nameNode, ctx.sourceCode);
        if (/^[A-Z]/.test(name) && !exportedNames.has(name)) {
          exports.push({
            name,
            kind: 'variable',
            isDefault: false,
            location: getLocation(spec),
          });
          exportedNames.add(name);
        }
      }
    }
  }

  return exports;
}
