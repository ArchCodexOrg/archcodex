/**
 * @arch archcodex.test.unit
 *
 * Tests for shared tree-sitter utility functions.
 * Tests pure utility functions without requiring actual tree-sitter parsers
 * for visibility helpers, and uses the Go parser for AST traversal utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTROL_FLOW,
  getNodeText,
  getLocation,
  findNodesOfType,
  walkTree,
  getParentOfType,
  getChildrenOfType,
  isTopLevel,
  getNodeLines,
  getPythonVisibility,
  getGoVisibility,
  createContext,
} from '../../../../src/validators/tree-sitter/TreeSitterUtils.js';
import { createGoParser } from '../../../../src/validators/tree-sitter/go-ast.js';

/**
 * Helper: parse Go source and return tree root node + context.
 */
function parseGo(source: string) {
  const parser = createGoParser();
  const ctx = createContext(parser, source);
  return { root: ctx.tree.rootNode, ctx };
}

describe('DEFAULT_CONTROL_FLOW', () => {
  it('should have all fields set to false/zero', () => {
    expect(DEFAULT_CONTROL_FLOW.inTryBlock).toBe(false);
    expect(DEFAULT_CONTROL_FLOW.inCatchBlock).toBe(false);
    expect(DEFAULT_CONTROL_FLOW.inFinallyBlock).toBe(false);
    expect(DEFAULT_CONTROL_FLOW.tryDepth).toBe(0);
  });

  it('should be frozen (immutable)', () => {
    expect(Object.isFrozen(DEFAULT_CONTROL_FLOW)).toBe(true);
  });
});

describe('createContext', () => {
  it('should create a valid context with parser, tree, source, and lines', () => {
    const parser = createGoParser();
    const source = 'package main\n\nfunc main() {}\n';
    const ctx = createContext(parser, source);

    expect(ctx.parser).toBe(parser);
    expect(ctx.tree).toBeDefined();
    expect(ctx.tree.rootNode).toBeDefined();
    expect(ctx.sourceCode).toBe(source);
    expect(ctx.lines).toEqual(source.split('\n'));
  });

  it('should split lines correctly', () => {
    const parser = createGoParser();
    const source = 'line1\nline2\nline3';
    const ctx = createContext(parser, source);
    expect(ctx.lines).toHaveLength(3);
    expect(ctx.lines[0]).toBe('line1');
    expect(ctx.lines[2]).toBe('line3');
  });
});

describe('getNodeText', () => {
  it('should extract correct text from a node', () => {
    const source = 'package main\n\nfunc Hello() {}\n';
    const { root } = parseGo(source);

    // The root node text should be the entire source
    const text = getNodeText(root, source);
    expect(text).toBe(source);
  });

  it('should extract substring for child nodes', () => {
    const source = 'package main\n\nfunc Hello() {}\n';
    const { root } = parseGo(source);

    // Find the function declaration node
    const funcDecl = root.children.find(c => c.type === 'function_declaration');
    expect(funcDecl).toBeDefined();
    const text = getNodeText(funcDecl!, source);
    expect(text).toContain('func');
    expect(text).toContain('Hello');
  });
});

describe('getLocation', () => {
  it('should return 1-based line and column', () => {
    const source = 'package main\n\nfunc Hello() {}\n';
    const { root } = parseGo(source);

    // Root node starts at line 1, column 1
    const loc = getLocation(root);
    expect(loc.line).toBe(1);
    expect(loc.column).toBe(1);
  });

  it('should correctly locate nodes not on the first line', () => {
    const source = 'package main\n\nfunc Hello() {}\n';
    const { root } = parseGo(source);

    const funcDecl = root.children.find(c => c.type === 'function_declaration');
    expect(funcDecl).toBeDefined();
    const loc = getLocation(funcDecl!);
    // func Hello() is on line 3 (0-indexed row 2 -> 1-based line 3)
    expect(loc.line).toBe(3);
    expect(loc.column).toBe(1);
  });
});

describe('findNodesOfType', () => {
  it('should find all nodes of specified types', () => {
    const source = `package main

func Foo() {}
func Bar() {}
`;
    const { root } = parseGo(source);
    const funcDecls = findNodesOfType(root, ['function_declaration']);
    expect(funcDecls).toHaveLength(2);
  });

  it('should return empty array when no matching types exist', () => {
    const source = 'package main\n';
    const { root } = parseGo(source);
    const results = findNodesOfType(root, ['class_declaration']);
    expect(results).toHaveLength(0);
  });

  it('should find nodes of multiple types', () => {
    const source = `package main

import "fmt"

func Hello() {}
`;
    const { root } = parseGo(source);
    const results = findNodesOfType(root, ['function_declaration', 'import_declaration']);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});

describe('walkTree', () => {
  it('should visit all nodes in the tree', () => {
    const source = 'package main\n';
    const { root } = parseGo(source);
    const visited: string[] = [];
    walkTree(root, (node) => {
      visited.push(node.type);
    });
    expect(visited.length).toBeGreaterThan(0);
    expect(visited[0]).toBe('source_file');
  });

  it('should walk depth-first', () => {
    const source = `package main

func A() {}
func B() {}
`;
    const { root } = parseGo(source);
    const types: string[] = [];
    walkTree(root, (node) => {
      types.push(node.type);
    });
    // source_file is first, then its children
    expect(types[0]).toBe('source_file');
    // Should encounter both function declarations somewhere in the traversal
    const funcIndices = types
      .map((t, i) => (t === 'function_declaration' ? i : -1))
      .filter(i => i >= 0);
    expect(funcIndices).toHaveLength(2);
  });
});

describe('getParentOfType', () => {
  it('should find the closest ancestor matching given types', () => {
    const source = `package main

func Outer() {
  x := 1
}
`;
    const { root } = parseGo(source);
    // Find an identifier inside the function body
    const identifiers = findNodesOfType(root, ['identifier']);
    // Find the 'x' identifier (not 'main' or 'Outer')
    const xIdent = identifiers.find(n => getNodeText(n, source) === 'x');
    expect(xIdent).toBeDefined();

    const parentFunc = getParentOfType(xIdent!, ['function_declaration']);
    expect(parentFunc).toBeDefined();
    expect(parentFunc!.type).toBe('function_declaration');
  });

  it('should return null when no ancestor matches', () => {
    const source = 'package main\n';
    const { root } = parseGo(source);
    // The root's package_clause child has no function_declaration ancestor
    const packageClause = root.children[0];
    const result = getParentOfType(packageClause, ['function_declaration']);
    expect(result).toBeNull();
  });
});

describe('getChildrenOfType', () => {
  it('should return direct children matching the type', () => {
    const source = `package main

func A() {}
func B() {}
`;
    const { root } = parseGo(source);
    const funcDecls = getChildrenOfType(root, 'function_declaration');
    expect(funcDecls).toHaveLength(2);
  });

  it('should return empty array when no children match', () => {
    const source = 'package main\n';
    const { root } = parseGo(source);
    const funcDecls = getChildrenOfType(root, 'function_declaration');
    expect(funcDecls).toHaveLength(0);
  });

  it('should only return direct children, not deeper descendants', () => {
    const source = `package main

func Outer() {
  fmt.Println("hello")
}
`;
    const { root } = parseGo(source);
    // call_expression is nested inside function, not a direct child of root
    const calls = getChildrenOfType(root, 'call_expression');
    expect(calls).toHaveLength(0);
  });
});

describe('isTopLevel', () => {
  it('should return true for top-level nodes', () => {
    const source = `package main

func TopLevel() {}
`;
    const { root } = parseGo(source);
    const funcDecl = root.children.find(c => c.type === 'function_declaration');
    expect(funcDecl).toBeDefined();
    // A top-level function has no function_declaration or method_declaration parent
    expect(isTopLevel(funcDecl!, ['function_declaration', 'method_declaration'])).toBe(true);
  });
});

describe('getNodeLines', () => {
  it('should return 1-based start and end lines', () => {
    const source = `package main

func Hello() {
  x := 1
}
`;
    const { root } = parseGo(source);
    const funcDecl = root.children.find(c => c.type === 'function_declaration');
    expect(funcDecl).toBeDefined();
    const lines = getNodeLines(funcDecl!);
    expect(lines.startLine).toBe(3);
    expect(lines.endLine).toBe(5);
  });

  it('should return same start and end for single-line nodes', () => {
    const source = 'package main\n';
    const { root } = parseGo(source);
    const packageClause = root.children[0];
    const lines = getNodeLines(packageClause);
    expect(lines.startLine).toBe(lines.endLine);
  });
});

describe('getPythonVisibility', () => {
  it('should return "public" for regular names', () => {
    expect(getPythonVisibility('method')).toBe('public');
    expect(getPythonVisibility('calculate')).toBe('public');
    expect(getPythonVisibility('getValue')).toBe('public');
  });

  it('should return "protected" for single underscore prefix', () => {
    expect(getPythonVisibility('_internal')).toBe('protected');
    expect(getPythonVisibility('_helper')).toBe('protected');
  });

  it('should return "private" for double underscore prefix (not dunder)', () => {
    expect(getPythonVisibility('__secret')).toBe('private');
    expect(getPythonVisibility('__internal_value')).toBe('private');
  });

  it('should return "public" for dunder methods', () => {
    expect(getPythonVisibility('__init__')).toBe('public');
    expect(getPythonVisibility('__str__')).toBe('public');
    expect(getPythonVisibility('__repr__')).toBe('public');
    expect(getPythonVisibility('__eq__')).toBe('public');
    expect(getPythonVisibility('__len__')).toBe('public');
  });

  it('should handle edge cases', () => {
    // Single underscore is protected
    expect(getPythonVisibility('_')).toBe('protected');
    // Double underscore '__' starts AND ends with '__', so it matches dunder pattern -> public
    expect(getPythonVisibility('__')).toBe('public');
  });
});

describe('getGoVisibility', () => {
  it('should return "public" for uppercase-starting names', () => {
    expect(getGoVisibility('Hello')).toBe('public');
    expect(getGoVisibility('ProcessData')).toBe('public');
    expect(getGoVisibility('X')).toBe('public');
  });

  it('should return "private" for lowercase-starting names', () => {
    expect(getGoVisibility('hello')).toBe('private');
    expect(getGoVisibility('processData')).toBe('private');
    expect(getGoVisibility('x')).toBe('private');
  });

  it('should return "private" for empty string', () => {
    expect(getGoVisibility('')).toBe('private');
  });

  it('should handle special characters correctly', () => {
    // Underscore starts lowercase -> private
    expect(getGoVisibility('_internal')).toBe('private');
    // Numbers are not uppercase letters -> private
    expect(getGoVisibility('123')).toBe('private');
  });
});
