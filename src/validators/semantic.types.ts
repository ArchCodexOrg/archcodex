/**
 * @arch archcodex.core.types
 *
 * Language-agnostic semantic types for multi-language AST abstraction.
 * These types represent source code semantics without coupling to any
 * specific language's AST library (e.g., ts-morph, tree-sitter).
 */

/**
 * Supported programming languages.
 */
export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'java';

/**
 * Source location in a file.
 */
export interface SourceLocation {
  /** 1-based line number */
  line: number;
  /** 1-based column number */
  column: number;
}

/**
 * Language-agnostic import/dependency information.
 * Maps to: ES imports, Python imports, Go imports, Java imports
 */
export interface ImportInfo {
  /** The module/package being imported (e.g., 'lodash', 'fs', '../utils') */
  moduleSpecifier: string;
  /** Named imports (e.g., ['map', 'filter'] from 'import { map, filter } from "lodash"') */
  namedImports?: string[];
  /** Default import name (e.g., 'React' from 'import React from "react"') */
  defaultImport?: string;
  /** Whether this is a type-only import (TypeScript) */
  isTypeOnly?: boolean;
  /** Whether this is a dynamic import (import() or require()) */
  isDynamic?: boolean;
  /** Source location of the import statement */
  location: SourceLocation;
  /** Raw import statement text */
  rawText?: string;
  /** Resolved absolute file path (for project-level validation) */
  resolvedPath?: string;
  /** Architecture ID of the resolved file (for project-level validation) */
  resolvedArchId?: string;
}

/**
 * Language-agnostic decorator/annotation information.
 * Maps to: TS/Python decorators, Java annotations
 * Note: Go does not have decorators
 */
export interface DecoratorInfo {
  /** Decorator name without @ symbol (e.g., 'Injectable', 'override') */
  name: string;
  /** Arguments passed to the decorator */
  arguments?: string[];
  /** Source location */
  location: SourceLocation;
  /** Raw decorator text */
  rawText?: string;
}

/**
 * Visibility/access modifiers across languages.
 * - public: TS public, Python (no underscore), Go (Exported), Java public
 * - protected: TS protected, Python (_underscore), Java protected
 * - private: TS private, Python (__dunder), Go (unexported), Java private
 * - internal: Go (package), Java (package-private)
 */
export type Visibility = 'public' | 'protected' | 'private' | 'internal';

/**
 * Language-agnostic method information.
 */
export interface MethodInfo {
  /** Method name */
  name: string;
  /** Visibility modifier */
  visibility: Visibility;
  /** Whether the method is static */
  isStatic: boolean;
  /** Whether the method is abstract */
  isAbstract: boolean;
  /** Decorators/annotations on the method */
  decorators: DecoratorInfo[];
  /** Number of parameters */
  parameterCount: number;
  /** Return type if available */
  returnType?: string;
  /** Source location */
  location: SourceLocation;
  /** Raw JSDoc comment content */
  jsDoc?: string;
  /** Parsed @intent:name annotations from JSDoc */
  intents?: string[];
  /** Start line of method body (for containment check) */
  startLine?: number;
  /** End line of method body (for containment check) */
  endLine?: number;
}

/**
 * Language-agnostic class/type information.
 * Maps to: TS/Python/Java class, Go struct
 */
export interface ClassInfo {
  /** Class/struct name */
  name: string;
  /** Whether the class is exported/public */
  isExported: boolean;
  /** Base class name if extends another class (Go: embedded struct) */
  extends?: string;
  /** Full inheritance chain (for deep inheritance checking) */
  inheritanceChain?: string[];
  /** Implemented interfaces (Go: implicit, checked separately) */
  implements: string[];
  /** Class-level decorators/annotations */
  decorators: DecoratorInfo[];
  /** Methods defined in the class */
  methods: MethodInfo[];
  /** Whether the class is abstract */
  isAbstract: boolean;
  /** Source location of class declaration */
  location: SourceLocation;
}

/**
 * Language-agnostic interface information.
 * Maps to: TS interface, Python Protocol/ABC, Go interface, Java interface
 */
export interface InterfaceInfo {
  /** Interface name */
  name: string;
  /** Whether the interface is exported/public */
  isExported: boolean;
  /** Extended interfaces */
  extends: string[];
  /** Method signatures (optional - not all parsers extract these) */
  methods?: Omit<MethodInfo, 'visibility'>[];
  /** Source location */
  location: SourceLocation;
}

/**
 * Language-agnostic standalone function information.
 * Maps to: TS/Python/Go functions, Java static methods
 */
export interface FunctionInfo {
  /** Function name */
  name: string;
  /** Whether the function is exported/public */
  isExported: boolean;
  /** Whether the function is async */
  isAsync?: boolean;
  /** Whether the function is a generator */
  isGenerator?: boolean;
  /** Visibility modifier */
  visibility?: Visibility;
  /** Decorators/annotations */
  decorators: DecoratorInfo[];
  /** Number of parameters */
  parameterCount?: number;
  /** Return type if available */
  returnType?: string;
  /** Source location */
  location: SourceLocation;
  /** Raw JSDoc comment content */
  jsDoc?: string;
  /** Parsed @intent:name annotations from JSDoc */
  intents?: string[];
  /** Start line of function body (for containment check) */
  startLine?: number;
  /** End line of function body (for containment check) */
  endLine?: number;
}

/**
 * Control flow context for a node in the AST.
 * Used to determine if code is inside try/catch blocks.
 */
export interface ControlFlowContext {
  /** Whether this node is inside a try block */
  inTryBlock: boolean;
  /** Whether this node is inside a catch block */
  inCatchBlock: boolean;
  /** Whether this node is inside a finally block */
  inFinallyBlock: boolean;
  /** Depth of nested try blocks (for complex control flow) */
  tryDepth: number;
}

/**
 * Language-agnostic function call information.
 * Used for runtime constraint validation (forbid_call, require_try_catch).
 */
export interface FunctionCallInfo {
  /** The full call expression text (e.g., "api.fetch", "setTimeout") */
  callee: string;
  /** The receiver/object if method call (e.g., "api" from "api.fetch()") */
  receiver?: string;
  /** The method/function name (e.g., "fetch" from "api.fetch()" or "setTimeout") */
  methodName: string;
  /** Arguments passed to the call (as raw text) */
  arguments: string[];
  /** Number of arguments */
  argumentCount: number;
  /** Source location */
  location: SourceLocation;
  /** Raw call expression text */
  rawText: string;
  /** Control flow context (for try/catch detection) */
  controlFlow: ControlFlowContext;
  /** Whether this is a constructor call (new Foo()) */
  isConstructorCall: boolean;
  /** Whether this is an optional chain call (foo?.bar()) */
  isOptionalChain: boolean;
  /** Name of the containing function (for function-level intent checking) */
  parentFunction?: string;
}

/**
 * Language-agnostic property mutation information.
 * Used for forbid_mutation constraint validation.
 */
export interface MutationInfo {
  /** The full target expression (e.g., "process.env.NODE_ENV") */
  target: string;
  /** The root object being mutated (e.g., "process") */
  rootObject: string;
  /** The property path (e.g., ["env", "NODE_ENV"]) */
  propertyPath: string[];
  /** The assignment operator used (=, +=, -=, etc.) */
  operator: string;
  /** Source location */
  location: SourceLocation;
  /** Raw assignment text */
  rawText: string;
  /** Whether this is a delete operation */
  isDelete: boolean;
}

/**
 * Export information for require_export constraint.
 */
export interface ExportInfo {
  /** Name of the exported symbol */
  name: string;
  /** Type of export: function, class, interface, variable, type, re-export */
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type' | 're-export';
  /** Whether this is a default export */
  isDefault: boolean;
  /** Source location */
  location: SourceLocation;
}

/**
 * Complete semantic model for a source file.
 * This is the language-agnostic representation that constraints operate on.
 */
export interface SemanticModel {
  /** Absolute file path */
  filePath: string;
  /** File name without path */
  fileName: string;
  /** File extension (e.g., '.ts', '.py') */
  extension: string;
  /** Raw file content */
  content: string;
  /** Number of lines in the file (including comments and blank lines) */
  lineCount: number;
  /** Lines of code (excluding comments and blank lines) */
  locCount: number;
  /** Detected programming language */
  language: SupportedLanguage;
  /** All import statements in the file */
  imports: ImportInfo[];
  /** All class/struct definitions */
  classes: ClassInfo[];
  /** All interface definitions */
  interfaces: InterfaceInfo[];
  /** All standalone function definitions */
  functions: FunctionInfo[];
  /** All function/method calls in the file (for runtime constraints) */
  functionCalls: FunctionCallInfo[];
  /** All property mutations in the file (for forbid_mutation constraint) */
  mutations: MutationInfo[];
  /** All exports in the file (for require_export constraint) */
  exports: ExportInfo[];
}

/**
 * Language capabilities - what features a language supports.
 * Used to determine which constraints apply.
 */
export interface LanguageCapabilities {
  /** Language supports class inheritance (extends) */
  hasClassInheritance: boolean;
  /** Language has explicit interfaces */
  hasInterfaces: boolean;
  /** Language supports decorators/annotations */
  hasDecorators: boolean;
  /** Language has explicit visibility modifiers */
  hasVisibilityModifiers: boolean;
}
