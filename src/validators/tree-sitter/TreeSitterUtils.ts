/**
 * @arch archcodex.infra.validator-support
 *
 * Shared tree-sitter utilities for AST-based language validators.
 * Provides common traversal, extraction, and context management functions.
 */

import Parser from 'tree-sitter';
import type { SourceLocation, ControlFlowContext } from '../semantic.types.js';

/**
 * Context for tree-sitter parsing operations.
 */
export interface TreeSitterContext {
  /** The tree-sitter parser instance */
  parser: Parser;
  /** The parsed syntax tree */
  tree: Parser.Tree;
  /** The source code being parsed */
  sourceCode: string;
  /** Source code split by lines (for line extraction) */
  lines: string[];
}

/**
 * Default control flow context (not in any try/catch block).
 */
export const DEFAULT_CONTROL_FLOW: Readonly<ControlFlowContext> = Object.freeze({
  inTryBlock: false,
  inCatchBlock: false,
  inFinallyBlock: false,
  tryDepth: 0,
});

/**
 * Creates a tree-sitter parsing context.
 */
export function createContext(
  parser: Parser,
  sourceCode: string
): TreeSitterContext {
  const tree = parser.parse(sourceCode);
  return {
    parser,
    tree,
    sourceCode,
    lines: sourceCode.split('\n'),
  };
}

/**
 * Gets the source text of a syntax node.
 */
export function getNodeText(
  node: Parser.SyntaxNode,
  sourceCode: string
): string {
  return sourceCode.slice(node.startIndex, node.endIndex);
}

/**
 * Converts a tree-sitter node position to SourceLocation.
 * Tree-sitter uses 0-based positions, we use 1-based.
 */
export function getLocation(node: Parser.SyntaxNode): SourceLocation {
  return {
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
  };
}

/**
 * Finds all descendant nodes matching the given types.
 */
export function findNodesOfType(
  root: Parser.SyntaxNode,
  types: string[]
): Parser.SyntaxNode[] {
  const results: Parser.SyntaxNode[] = [];
  const typeSet = new Set(types);

  walkTree(root, (node) => {
    if (typeSet.has(node.type)) {
      results.push(node);
    }
  });

  return results;
}

/**
 * Walks the AST depth-first, calling the callback for each node.
 */
export function walkTree(
  node: Parser.SyntaxNode,
  callback: (node: Parser.SyntaxNode) => void
): void {
  callback(node);
  for (const child of node.children) {
    walkTree(child, callback);
  }
}

/**
 * Finds the closest ancestor node matching one of the given types.
 */
export function getParentOfType(
  node: Parser.SyntaxNode,
  types: string[]
): Parser.SyntaxNode | null {
  const typeSet = new Set(types);
  let current = node.parent;

  while (current) {
    if (typeSet.has(current.type)) {
      return current;
    }
    current = current.parent;
  }

  return null;
}

/**
 * Gets all named children of a specific type.
 */
export function getChildrenOfType(
  node: Parser.SyntaxNode,
  type: string
): Parser.SyntaxNode[] {
  return node.children.filter((child) => child.type === type);
}

/**
 * Checks if a node is at module/top level (not nested in class/function).
 */
export function isTopLevel(
  node: Parser.SyntaxNode,
  containerTypes: string[]
): boolean {
  return getParentOfType(node, containerTypes) === null;
}

/**
 * Gets the start and end line numbers of a node (1-based).
 */
export function getNodeLines(node: Parser.SyntaxNode): {
  startLine: number;
  endLine: number;
} {
  return {
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
  };
}

// Note: LOC calculation is intentionally NOT shared here.
// Each language has fundamentally different comment syntax:
// - Go: // line comments and /* */ block comments
// - Python: # line comments and """ ''' docstrings (same delimiter for start/end)
// A generic implementation cannot correctly handle all cases, so each language
// validator implements its own calculateLoc function.

/**
 * Gets Python visibility from a method/function name.
 * - Dunder methods (__name__) are public (special methods)
 * - Double underscore prefix (__name) is private (name mangling)
 * - Single underscore prefix (_name) is protected (convention)
 * - Everything else is public
 */
export function getPythonVisibility(name: string): 'public' | 'protected' | 'private' {
  // Dunder methods (__init__, __str__, etc.) are public
  if (name.startsWith('__') && name.endsWith('__')) {
    return 'public';
  }
  // Double underscore prefix (not dunder) is private
  if (name.startsWith('__')) {
    return 'private';
  }
  // Single underscore prefix is protected
  if (name.startsWith('_')) {
    return 'protected';
  }
  return 'public';
}

/**
 * Gets Go visibility from a name (exported = public, unexported = private).
 */
export function getGoVisibility(name: string): 'public' | 'private' {
  if (!name || name.length === 0) return 'private';
  const firstChar = name.charAt(0);
  return firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()
    ? 'public'
    : 'private';
}
