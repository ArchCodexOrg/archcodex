/**
 * @arch archcodex.infra.validator-support
 *
 * Python AST extraction using tree-sitter.
 * Extracts SemanticModel from Python source files.
 */

import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import type {
  SemanticModel,
  ClassInfo,
  InterfaceInfo,
  FunctionInfo,
  ImportInfo,
  DecoratorInfo,
  MethodInfo,
  FunctionCallInfo,
  MutationInfo,
  ExportInfo,
  ControlFlowContext,
} from '../semantic.types.js';
import {
  createContext,
  getNodeText,
  getLocation,
  findNodesOfType,
  getParentOfType,
  getChildrenOfType,
  getNodeLines,
  getPythonVisibility,
  DEFAULT_CONTROL_FLOW,
  type TreeSitterContext,
} from './TreeSitterUtils.js';

// =============================================================================
// Tree-sitter Node Type Constants
// =============================================================================
// These constants prevent typos and enable IDE autocompletion.
// Organized by semantic category for maintainability.

/** Python tree-sitter node types for imports */
const PyImportNodes = {
  IMPORT_STATEMENT: 'import_statement',
  IMPORT_FROM_STATEMENT: 'import_from_statement',
  ALIASED_IMPORT: 'aliased_import',
  DOTTED_NAME: 'dotted_name',
  RELATIVE_IMPORT: 'relative_import',
  WILDCARD_IMPORT: 'wildcard_import',
  FROM: 'from',
  IMPORT: 'import',
} as const;

/** Python tree-sitter node types for definitions */
const PyDefinitionNodes = {
  CLASS_DEFINITION: 'class_definition',
  FUNCTION_DEFINITION: 'function_definition',
  DECORATED_DEFINITION: 'decorated_definition',
  DECORATOR: 'decorator',
} as const;

/** Python tree-sitter node types for identifiers and names */
const PyIdentifierNodes = {
  IDENTIFIER: 'identifier',
  ATTRIBUTE: 'attribute',
} as const;

/** Python tree-sitter node types for parameters */
const PyParameterNodes = {
  TYPED_PARAMETER: 'typed_parameter',
  DEFAULT_PARAMETER: 'default_parameter',
  TYPED_DEFAULT_PARAMETER: 'typed_default_parameter',
} as const;

/** Python tree-sitter node types for expressions */
const PyExpressionNodes = {
  CALL: 'call',
  SUBSCRIPT: 'subscript',
  LIST: 'list',
  STRING: 'string',
} as const;

/** Python tree-sitter node types for statements */
const PyStatementNodes = {
  ASSIGNMENT: 'assignment',
  AUGMENTED_ASSIGNMENT: 'augmented_assignment',
  DELETE_STATEMENT: 'delete_statement',
} as const;

/** Python tree-sitter node types for control flow */
const PyControlFlowNodes = {
  TRY_STATEMENT: 'try_statement',
  EXCEPT_CLAUSE: 'except_clause',
  FINALLY_CLAUSE: 'finally_clause',
} as const;

/** Python container types that indicate non-top-level scope */
const PYTHON_CONTAINER_TYPES = [
  PyDefinitionNodes.CLASS_DEFINITION,
  PyDefinitionNodes.FUNCTION_DEFINITION,
];

/** ABC/Protocol base classes that indicate an interface */
const INTERFACE_BASES = new Set(['ABC', 'ABCMeta', 'Protocol']);

/** Python assignment operators */
const PyAssignmentOperators = new Set([
  '=', '+=', '-=', '*=', '/=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=',
]);

/**
 * Python keywords that should not be tracked as function calls.
 * These are control flow statements that syntactically resemble function calls.
 */
const PY_SKIP_KEYWORDS = new Set([
  'if', 'elif', 'while', 'for', 'with', 'assert',
  'except', 'return', 'yield', 'del',
]);

/**
 * Creates a Python parser instance.
 *
 * Note: The type assertion `as unknown as Parser.Language` is required because
 * tree-sitter-python's TypeScript definitions don't properly extend tree-sitter's
 * Language type, despite being compatible at runtime. This is a known issue
 * with tree-sitter's TypeScript ecosystem.
 */
export function createPythonParser(): Parser {
  const parser = new Parser();
  parser.setLanguage(Python as unknown as Parser.Language);
  return parser;
}

/**
 * Extracts a complete SemanticModel from Python source code.
 * Returns an empty model if parsing fails (graceful degradation).
 */
export function extractPythonSemanticModel(
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
    language: 'python',
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
    const { classes, interfaces } = extractClassesAndInterfaces(root, ctx);
    const functions = extractFunctions(root, ctx);
    const functionCalls = extractFunctionCalls(root, ctx);
    const mutations = extractMutations(root, ctx);
    const exports = extractExports(root, ctx, classes, functions);

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
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    return lines.length - 1;
  }
  return lines.length;
}

function calculateLoc(lines: string[]): number {
  if (lines.length === 0) return 0;
  let loc = 0;
  let inMultilineString = false;
  let multilineQuote = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    if (inMultilineString) {
      if (trimmed.includes(multilineQuote)) {
        inMultilineString = false;
      }
      continue;
    }

    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      multilineQuote = trimmed.slice(0, 3);
      const rest = trimmed.slice(3);
      if (!rest.includes(multilineQuote)) {
        inMultilineString = true;
      }
      continue;
    }

    if (trimmed.startsWith('#')) continue;

    loc++;
  }

  return loc;
}

function extractImports(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext
): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // import_statement: import dotted_name [as alias]
  // Structure: import_statement -> aliased_import -> dotted_name, identifier (alias)
  // Or: import_statement -> dotted_name (no alias)
  const importStatements = findNodesOfType(root, [PyImportNodes.IMPORT_STATEMENT]);
  for (const node of importStatements) {
    // Check for aliased import first
    const aliasedImport = node.children.find(c => c.type === PyImportNodes.ALIASED_IMPORT);
    if (aliasedImport) {
      const dottedName = aliasedImport.children.find(
        c => c.type === PyImportNodes.DOTTED_NAME
      );
      const aliasIdent = aliasedImport.children.filter(
        c => c.type === PyIdentifierNodes.IDENTIFIER
      );
      // The alias is the identifier after 'as'
      const alias = aliasIdent.length > 0 ? aliasIdent[aliasIdent.length - 1] : null;
      if (dottedName) {
        imports.push({
          moduleSpecifier: getNodeText(dottedName, ctx.sourceCode),
          defaultImport: alias
            ? getNodeText(alias, ctx.sourceCode)
            : getNodeText(dottedName, ctx.sourceCode),
          location: getLocation(node),
          rawText: getNodeText(node, ctx.sourceCode),
        });
      }
    } else {
      // No alias - direct import
      const dottedName = node.children.find(c => c.type === PyImportNodes.DOTTED_NAME);
      if (dottedName) {
        const moduleSpecifier = getNodeText(dottedName, ctx.sourceCode);
        imports.push({
          moduleSpecifier,
          defaultImport: moduleSpecifier,
          location: getLocation(node),
          rawText: getNodeText(node, ctx.sourceCode),
        });
      }
    }
  }

  // import_from_statement: from dotted_name import (names | *)
  // Structure: from -> dotted_name (module) -> import -> dotted_name/identifier (names)
  const importFromStatements = findNodesOfType(root, [PyImportNodes.IMPORT_FROM_STATEMENT]);
  for (const node of importFromStatements) {
    // Find module name (first dotted_name after 'from')
    let moduleSpecifier = '';
    let foundImportKeyword = false;
    const namedImports: string[] = [];

    for (const child of node.children) {
      if (child.type === PyImportNodes.FROM) continue;
      if (child.type === PyImportNodes.IMPORT) {
        foundImportKeyword = true;
        continue;
      }

      if (!foundImportKeyword) {
        // This is the module name
        if (
          child.type === PyImportNodes.DOTTED_NAME ||
          child.type === PyImportNodes.RELATIVE_IMPORT
        ) {
          moduleSpecifier = getNodeText(child, ctx.sourceCode);
        }
      } else {
        // After 'import' - these are the imported names
        if (child.type === PyImportNodes.WILDCARD_IMPORT) {
          imports.push({
            moduleSpecifier,
            isDynamic: false,
            location: getLocation(node),
            rawText: getNodeText(node, ctx.sourceCode),
          });
          break;
        }
        if (
          child.type === PyImportNodes.DOTTED_NAME ||
          child.type === PyIdentifierNodes.IDENTIFIER
        ) {
          namedImports.push(getNodeText(child, ctx.sourceCode));
        }
        if (child.type === PyImportNodes.ALIASED_IMPORT) {
          const dottedName = child.children.find(
            c =>
              c.type === PyImportNodes.DOTTED_NAME ||
              c.type === PyIdentifierNodes.IDENTIFIER
          );
          if (dottedName) {
            namedImports.push(getNodeText(dottedName, ctx.sourceCode));
          }
        }
      }
    }

    if (namedImports.length > 0) {
      imports.push({
        moduleSpecifier,
        namedImports,
        location: getLocation(node),
        rawText: getNodeText(node, ctx.sourceCode),
      });
    }
  }

  return imports;
}

function extractClassesAndInterfaces(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext
): { classes: ClassInfo[]; interfaces: InterfaceInfo[] } {
  const classes: ClassInfo[] = [];
  const interfaces: InterfaceInfo[] = [];

  const classNodes = findNodesOfType(root, [PyDefinitionNodes.CLASS_DEFINITION]);
  for (const node of classNodes) {
    // Skip nested classes for now (only top-level)
    if (getParentOfType(node, [PyDefinitionNodes.CLASS_DEFINITION])) continue;

    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    const className = getNodeText(nameNode, ctx.sourceCode);
    const isExported = !className.startsWith('_');

    // Extract base classes
    const bases: string[] = [];
    const argumentList = node.childForFieldName('superclasses');
    if (argumentList) {
      for (const child of argumentList.children) {
        if (
          child.type === PyIdentifierNodes.IDENTIFIER ||
          child.type === PyIdentifierNodes.ATTRIBUTE
        ) {
          const baseName = getNodeText(child, ctx.sourceCode);
          if (baseName !== 'object') {
            bases.push(baseName);
          }
        }
      }
    }

    // Check if this is an interface (ABC, Protocol)
    const isInterface = bases.some(b => INTERFACE_BASES.has(b));
    const isAbstract = isInterface;

    // Extract decorators
    const decorators = extractDecorators(node, ctx);

    // Extract methods
    const methods = extractMethods(node, ctx);

    const location = getLocation(node);

    if (isInterface) {
      interfaces.push({
        name: className,
        isExported,
        extends: bases.filter(b => INTERFACE_BASES.has(b)),
        methods: methods.map(m => ({
          name: m.name,
          isStatic: m.isStatic,
          isAbstract: m.isAbstract,
          decorators: m.decorators,
          parameterCount: m.parameterCount,
          returnType: m.returnType,
          location: m.location,
        })),
        location,
      });
    } else {
      const extendsBase = bases.find(b => !INTERFACE_BASES.has(b));
      const implementsList = bases.filter(
        b => !INTERFACE_BASES.has(b) && b !== extendsBase
      );

      classes.push({
        name: className,
        isExported,
        extends: extendsBase,
        inheritanceChain: extendsBase ? [className, extendsBase] : [className],
        implements: implementsList,
        decorators,
        methods,
        isAbstract,
        location,
      });
    }
  }

  return { classes, interfaces };
}

function extractDecorators(
  node: Parser.SyntaxNode,
  ctx: TreeSitterContext
): DecoratorInfo[] {
  const decorators: DecoratorInfo[] = [];

  // Look for decorator nodes that are siblings before this node
  let sibling = node.previousNamedSibling;
  while (sibling && sibling.type === PyDefinitionNodes.DECORATOR) {
    const decText = getNodeText(sibling, ctx.sourceCode);
    const nameMatch = decText.match(/^@([\w.]+)/);
    if (nameMatch) {
      const argsMatch = decText.match(/\((.+)\)$/);
      decorators.unshift({
        name: nameMatch[1],
        arguments: argsMatch ? [argsMatch[1]] : undefined,
        location: getLocation(sibling),
        rawText: decText,
      });
    }
    sibling = sibling.previousNamedSibling;
  }

  // Also check for decorated_definition wrapper
  if (node.parent?.type === PyDefinitionNodes.DECORATED_DEFINITION) {
    const decoratorNodes = getChildrenOfType(node.parent, PyDefinitionNodes.DECORATOR);
    for (const dec of decoratorNodes) {
      const decText = getNodeText(dec, ctx.sourceCode);
      const nameMatch = decText.match(/^@([\w.]+)/);
      if (nameMatch) {
        const argsMatch = decText.match(/\((.+)\)$/);
        // Only add if not already present
        if (!decorators.some(d => d.rawText === decText)) {
          decorators.push({
            name: nameMatch[1],
            arguments: argsMatch ? [argsMatch[1]] : undefined,
            location: getLocation(dec),
            rawText: decText,
          });
        }
      }
    }
  }

  return decorators;
}

function extractMethods(
  classNode: Parser.SyntaxNode,
  ctx: TreeSitterContext
): MethodInfo[] {
  const methods: MethodInfo[] = [];

  const bodyNode = classNode.childForFieldName('body');
  if (!bodyNode) return methods;

  // Find all function definitions in the class body
  for (const child of bodyNode.children) {
    let funcNode = child;

    // Handle decorated functions
    if (child.type === PyDefinitionNodes.DECORATED_DEFINITION) {
      const innerFunc = child.children.find(
        c => c.type === PyDefinitionNodes.FUNCTION_DEFINITION
      );
      if (innerFunc) {
        funcNode = innerFunc;
      } else {
        continue;
      }
    }

    if (funcNode.type !== PyDefinitionNodes.FUNCTION_DEFINITION) continue;

    const nameNode = funcNode.childForFieldName('name');
    if (!nameNode) continue;

    const methodName = getNodeText(nameNode, ctx.sourceCode);
    const visibility = getPythonVisibility(methodName);

    // Extract decorators
    const decorators = extractDecorators(funcNode, ctx);
    const isStatic = decorators.some(d => d.name === 'staticmethod');
    const isAbstract = decorators.some(d => d.name === 'abstractmethod');

    // Count parameters (excluding self/cls)
    const paramsNode = funcNode.childForFieldName('parameters');
    let parameterCount = 0;
    if (paramsNode) {
      for (const param of paramsNode.children) {
        if (
          param.type === PyIdentifierNodes.IDENTIFIER ||
          param.type === PyParameterNodes.TYPED_PARAMETER ||
          param.type === PyParameterNodes.DEFAULT_PARAMETER ||
          param.type === PyParameterNodes.TYPED_DEFAULT_PARAMETER
        ) {
          const paramName =
            param.type === PyIdentifierNodes.IDENTIFIER
              ? getNodeText(param, ctx.sourceCode)
              : getNodeText(
                  param.childForFieldName('name') ?? param,
                  ctx.sourceCode
                );
          if (paramName !== 'self' && paramName !== 'cls') {
            parameterCount++;
          }
        }
      }
    }

    // Extract return type
    const returnTypeNode = funcNode.childForFieldName('return_type');
    const returnType = returnTypeNode
      ? getNodeText(returnTypeNode, ctx.sourceCode)
      : undefined;

    const { startLine, endLine } = getNodeLines(funcNode);

    methods.push({
      name: methodName,
      visibility,
      isStatic,
      isAbstract,
      decorators,
      parameterCount,
      returnType,
      location: getLocation(funcNode),
      startLine,
      endLine,
    });
  }

  return methods;
}

function extractFunctions(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext
): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  const funcNodes = findNodesOfType(root, [PyDefinitionNodes.FUNCTION_DEFINITION]);
  for (const node of funcNodes) {
    // Only top-level functions
    if (getParentOfType(node, PYTHON_CONTAINER_TYPES)) continue;

    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    const funcName = getNodeText(nameNode, ctx.sourceCode);
    const visibility = getPythonVisibility(funcName);
    const isExported = visibility === 'public';

    // Check if async
    const isAsync =
      node.parent?.type === PyDefinitionNodes.DECORATED_DEFINITION
        ? getNodeText(node.parent, ctx.sourceCode).includes('async def')
        : getNodeText(node, ctx.sourceCode).startsWith('async');

    // Extract decorators
    const decorators = extractDecorators(node, ctx);

    // Count parameters
    const paramsNode = node.childForFieldName('parameters');
    let parameterCount = 0;
    if (paramsNode) {
      for (const param of paramsNode.children) {
        if (
          param.type === PyIdentifierNodes.IDENTIFIER ||
          param.type === PyParameterNodes.TYPED_PARAMETER ||
          param.type === PyParameterNodes.DEFAULT_PARAMETER ||
          param.type === PyParameterNodes.TYPED_DEFAULT_PARAMETER
        ) {
          parameterCount++;
        }
      }
    }

    // Extract return type
    const returnTypeNode = node.childForFieldName('return_type');
    const returnType = returnTypeNode
      ? getNodeText(returnTypeNode, ctx.sourceCode)
      : undefined;

    const { startLine, endLine } = getNodeLines(node);

    functions.push({
      name: funcName,
      isExported,
      isAsync,
      visibility,
      decorators,
      parameterCount,
      returnType,
      location: getLocation(node),
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

  const callNodes = findNodesOfType(root, [PyExpressionNodes.CALL]);
  for (const node of callNodes) {
    const funcNode = node.childForFieldName('function');
    if (!funcNode) continue;

    let callee: string;
    let receiver: string | undefined;
    let methodName: string;

    if (funcNode.type === PyIdentifierNodes.ATTRIBUTE) {
      // obj.method() call
      const objNode = funcNode.childForFieldName('object');
      const attrNode = funcNode.childForFieldName('attribute');
      if (objNode && attrNode) {
        receiver = getNodeText(objNode, ctx.sourceCode);
        methodName = getNodeText(attrNode, ctx.sourceCode);
        callee = `${receiver}.${methodName}`;
      } else {
        continue;
      }
    } else if (funcNode.type === PyIdentifierNodes.IDENTIFIER) {
      // direct function() call
      methodName = getNodeText(funcNode, ctx.sourceCode);
      callee = methodName;
    } else {
      // Other call patterns (subscript, etc.)
      callee = getNodeText(funcNode, ctx.sourceCode);
      methodName = callee;
    }

    // Skip Python keywords that look like function calls
    if (PY_SKIP_KEYWORDS.has(methodName) && !receiver) continue;

    // Extract arguments
    const argsNode = node.childForFieldName('arguments');
    const args: string[] = [];
    let argumentCount = 0;
    if (argsNode) {
      for (const arg of argsNode.children) {
        if (arg.type !== '(' && arg.type !== ')' && arg.type !== ',') {
          args.push(getNodeText(arg, ctx.sourceCode));
          argumentCount++;
        }
      }
    }

    // Get control flow context
    const controlFlow = getControlFlowContext(node);

    // Find parent function
    const parentFunc = getParentOfType(node, [PyDefinitionNodes.FUNCTION_DEFINITION]);
    const parentFuncName = parentFunc
      ? getNodeText(
          parentFunc.childForFieldName('name') ?? parentFunc,
          ctx.sourceCode
        )
      : undefined;

    // Determine if constructor call (capitalized, no receiver)
    const isConstructorCall = /^[A-Z]/.test(methodName) && !receiver;

    calls.push({
      callee,
      receiver,
      methodName,
      arguments: args,
      argumentCount,
      location: getLocation(node),
      rawText: getNodeText(node, ctx.sourceCode),
      controlFlow,
      isConstructorCall,
      isOptionalChain: false,
      parentFunction: parentFuncName,
    });
  }

  return calls;
}

function getControlFlowContext(node: Parser.SyntaxNode): ControlFlowContext {
  const context: ControlFlowContext = { ...DEFAULT_CONTROL_FLOW };

  let current = node.parent;
  while (current) {
    if (current.type === PyControlFlowNodes.TRY_STATEMENT) {
      // Check which clause we're in
      const tryBody = current.childForFieldName('body');
      if (tryBody && isDescendantOf(node, tryBody)) {
        context.inTryBlock = true;
        context.tryDepth++;
      }
    }

    if (current.type === PyControlFlowNodes.EXCEPT_CLAUSE) {
      context.inCatchBlock = true;
    }

    if (current.type === PyControlFlowNodes.FINALLY_CLAUSE) {
      context.inFinallyBlock = true;
    }

    current = current.parent;
  }

  return context;
}

function isDescendantOf(
  node: Parser.SyntaxNode,
  ancestor: Parser.SyntaxNode
): boolean {
  let current = node.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function extractMutations(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext
): MutationInfo[] {
  const mutations: MutationInfo[] = [];

  // Assignment statements
  const assignments = findNodesOfType(root, [
    PyStatementNodes.ASSIGNMENT,
    PyStatementNodes.AUGMENTED_ASSIGNMENT,
  ]);
  for (const node of assignments) {
    const leftNode = node.childForFieldName('left');
    if (!leftNode) continue;

    // Only property mutations (x.y = z)
    if (
      leftNode.type !== PyIdentifierNodes.ATTRIBUTE &&
      leftNode.type !== PyExpressionNodes.SUBSCRIPT
    ) {
      continue;
    }

    const target = getNodeText(leftNode, ctx.sourceCode);
    const parts = target.split('.');
    if (parts.length < 2) continue;

    const operatorNode = node.children.find(c => PyAssignmentOperators.has(c.type));
    const operator = operatorNode ? operatorNode.type : '=';

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

  // Delete statements
  const delStatements = findNodesOfType(root, [PyStatementNodes.DELETE_STATEMENT]);
  for (const node of delStatements) {
    for (const child of node.children) {
      if (child.type === PyIdentifierNodes.ATTRIBUTE) {
        const target = getNodeText(child, ctx.sourceCode);
        const parts = target.split('.');
        if (parts.length >= 2) {
          mutations.push({
            target,
            rootObject: parts[0],
            propertyPath: parts.slice(1),
            operator: 'delete',
            location: getLocation(node),
            rawText: getNodeText(node, ctx.sourceCode),
            isDelete: true,
          });
        }
      }
    }
  }

  return mutations;
}

function extractExports(
  root: Parser.SyntaxNode,
  ctx: TreeSitterContext,
  classes: ClassInfo[],
  functions: FunctionInfo[]
): ExportInfo[] {
  const exports: ExportInfo[] = [];

  // Look for __all__ definition
  const assignments = findNodesOfType(root, [PyStatementNodes.ASSIGNMENT]);
  let allList: string[] | null = null;

  for (const node of assignments) {
    const leftNode = node.childForFieldName('left');
    if (!leftNode) continue;

    if (getNodeText(leftNode, ctx.sourceCode) === '__all__') {
      const rightNode = node.childForFieldName('right');
      if (rightNode && rightNode.type === PyExpressionNodes.LIST) {
        allList = [];
        for (const item of rightNode.children) {
          if (item.type === PyExpressionNodes.STRING) {
            const str = getNodeText(item, ctx.sourceCode);
            // Remove quotes
            const name = str.replace(/^['"]|['"]$/g, '');
            if (name) allList.push(name);
          }
        }
      }
      break;
    }
  }

  if (allList) {
    for (const name of allList) {
      const cls = classes.find(c => c.name === name);
      const func = functions.find(f => f.name === name);
      exports.push({
        name,
        kind: cls ? 'class' : func ? 'function' : 'variable',
        isDefault: false,
        location: cls?.location ?? func?.location ?? { line: 1, column: 1 },
      });
    }
  } else {
    // Export all public classes and functions
    for (const cls of classes) {
      if (cls.isExported) {
        exports.push({
          name: cls.name,
          kind: 'class',
          isDefault: false,
          location: cls.location,
        });
      }
    }
    for (const func of functions) {
      if (func.isExported) {
        exports.push({
          name: func.name,
          kind: 'function',
          isDefault: false,
          location: func.location,
        });
      }
    }
  }

  return exports;
}
