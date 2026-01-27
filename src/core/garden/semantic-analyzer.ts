/**
 * @arch archcodex.core.engine
 * @intent:stateless
 * @intent:ast-analysis
 *
 * AST-based semantic analyzer for detecting code patterns.
 * Uses ts-morph to understand what code actually does, not just naming conventions.
 */
import { Project, SourceFile, SyntaxKind, Node, VariableDeclaration } from 'ts-morph';
import * as path from 'path';
import type { SemanticCategory } from './types.js';

/**
 * Result of semantic analysis for a file.
 */
export interface SemanticAnalysis {
  category: SemanticCategory;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

/**
 * AST-based semantic analyzer.
 * Detects code patterns by analyzing actual code structure, not just names.
 */
export class SemanticAnalyzer {
  private project: Project;

  constructor() {
    this.project = new Project({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        strict: false,
        skipLibCheck: true,
        noEmit: true,
      },
      useInMemoryFileSystem: true,
    });
  }

  /**
   * Analyze a file's content to determine its semantic category.
   */
  analyze(filePath: string, content: string): SemanticAnalysis {
    const ext = path.extname(filePath);
    const sourceFile = this.project.createSourceFile(
      `__temp_${Date.now()}_${path.basename(filePath)}`,
      content,
      { overwrite: true }
    );

    try {
      const signals: string[] = [];

      // Check for test file first (highest priority)
      if (this.isTestFile(sourceFile, filePath)) {
        signals.push('imports test library');
        return { category: 'test', confidence: 'high', signals };
      }

      // Check for types-only file
      if (this.isTypesOnlyFile(sourceFile)) {
        signals.push('only type/interface declarations');
        return { category: 'types', confidence: 'high', signals };
      }

      // Check for React patterns
      const reactAnalysis = this.analyzeReactPatterns(sourceFile, ext);
      if (reactAnalysis) {
        return reactAnalysis;
      }

      // Check for service/repository patterns
      const serviceAnalysis = this.analyzeServicePatterns(sourceFile);
      if (serviceAnalysis) {
        return serviceAnalysis;
      }

      // Check for validator patterns
      const validatorAnalysis = this.analyzeValidatorPatterns(sourceFile);
      if (validatorAnalysis) {
        return validatorAnalysis;
      }

      // Check for config patterns
      if (this.isConfigFile(sourceFile, filePath)) {
        signals.push('config-like exports');
        return { category: 'config', confidence: 'medium', signals };
      }

      // Default to utility for files with exported functions
      if (this.hasExportedFunctions(sourceFile)) {
        signals.push('exports functions');
        return { category: 'utility', confidence: 'low', signals };
      }

      return { category: 'unknown', confidence: 'low', signals: [] };
    } finally {
      this.project.removeSourceFile(sourceFile);
    }
  }

  /**
   * Check if file imports testing libraries.
   */
  private isTestFile(sourceFile: SourceFile, filePath: string): boolean {
    // Check filename patterns
    const baseName = path.basename(filePath);
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(baseName)) {
      return true;
    }

    // Check imports
    const testLibraries = [
      'vitest', 'jest', '@jest', 'mocha', 'chai',
      '@testing-library', 'enzyme', 'cypress'
    ];

    for (const imp of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      if (testLibraries.some(lib => moduleSpecifier.includes(lib))) {
        return true;
      }
    }

    // Check for describe/it/test calls
    const hasTestCalls = this.hasCallsTo(sourceFile, ['describe', 'it', 'test', 'expect']);
    return hasTestCalls;
  }

  /**
   * Check if file only contains type/interface declarations.
   */
  private isTypesOnlyFile(sourceFile: SourceFile): boolean {
    const statements = sourceFile.getStatements();
    if (statements.length === 0) return false;

    for (const stmt of statements) {
      const kind = stmt.getKind();
      // Allow: imports, type aliases, interfaces, enums
      const allowedKinds = [
        SyntaxKind.ImportDeclaration,
        SyntaxKind.TypeAliasDeclaration,
        SyntaxKind.InterfaceDeclaration,
        SyntaxKind.EnumDeclaration,
        SyntaxKind.ExportDeclaration,
      ];

      if (!allowedKinds.includes(kind)) {
        // Check if it's an export of a type
        if (kind === SyntaxKind.ExportAssignment) continue;
        return false;
      }
    }

    return true;
  }

  /**
   * Analyze React-specific patterns.
   */
  private analyzeReactPatterns(sourceFile: SourceFile, ext: string): SemanticAnalysis | null {
    const hasReactImport = this.hasImportFrom(sourceFile, ['react', 'preact']);
    const hasJsxElements = this.hasJsxElements(sourceFile);
    const hasHookCalls = this.hasHookCalls(sourceFile);
    const hasHookDefinition = this.definesHook(sourceFile);

    // React hook detection (functions that call other hooks)
    if (hasHookDefinition) {
      const signals = ['defines function starting with "use"'];
      if (hasHookCalls) signals.push('calls React hooks');
      return {
        category: 'react-hook',
        confidence: hasHookCalls ? 'high' : 'medium',
        signals
      };
    }

    // React component detection
    if (hasJsxElements) {
      const signals = ['contains JSX elements'];
      if (hasReactImport) signals.push('imports React');

      // Higher confidence for .tsx files with React import
      const confidence = (ext === '.tsx' && hasReactImport) ? 'high' : 'medium';

      return { category: 'react-component', confidence, signals };
    }

    // If it imports React but no JSX, might be a hook or utility
    if (hasReactImport && hasHookCalls) {
      return {
        category: 'react-hook',
        confidence: 'medium',
        signals: ['imports React', 'calls hooks but no JSX']
      };
    }

    return null;
  }

  /**
   * Analyze service/repository patterns.
   */
  private analyzeServicePatterns(sourceFile: SourceFile): SemanticAnalysis | null {
    const classes = sourceFile.getClasses();
    if (classes.length === 0) return null;

    for (const cls of classes) {
      const className = cls.getName() || '';
      const methods = cls.getMethods();

      // Check for service naming
      const isServiceNamed = /Service$|Repository$|Client$|Api$/i.test(className);

      // Check for common service method patterns
      const hasServiceMethods = methods.some(m => {
        const name = m.getName();
        return /^(get|find|fetch|create|update|delete|save|load|query)/i.test(name);
      });

      // Check for async methods (common in services)
      const hasAsyncMethods = methods.some(m => m.isAsync());

      // Check for dependency injection patterns (constructor with parameters)
      const constructors = cls.getConstructors();
      const hasDI = constructors.some(c => c.getParameters().length > 0);

      const signals: string[] = [];
      if (isServiceNamed) signals.push(`class named "${className}"`);
      if (hasServiceMethods) signals.push('has CRUD-like methods');
      if (hasAsyncMethods) signals.push('has async methods');
      if (hasDI) signals.push('uses dependency injection');

      if (signals.length >= 2) {
        const category = /Repository$/i.test(className) ? 'repository' : 'service';
        return {
          category,
          confidence: signals.length >= 3 ? 'high' : 'medium',
          signals
        };
      }
    }

    return null;
  }

  /**
   * Analyze validator patterns.
   */
  private analyzeValidatorPatterns(sourceFile: SourceFile): SemanticAnalysis | null {
    // Check for Zod schema usage
    if (this.hasImportFrom(sourceFile, ['zod'])) {
      const hasSchemaExports = sourceFile.getVariableDeclarations().some(v => {
        const name = v.getName();
        return /Schema$|Validator$/i.test(name);
      });

      if (hasSchemaExports) {
        return {
          category: 'validator',
          confidence: 'high',
          signals: ['imports zod', 'exports schema definitions']
        };
      }
    }

    // Check for classes with validate methods
    for (const cls of sourceFile.getClasses()) {
      const className = cls.getName() || '';
      const hasValidateMethod = cls.getMethods().some(m =>
        m.getName() === 'validate' || m.getName() === 'check'
      );

      if (hasValidateMethod || /Validator$/i.test(className)) {
        return {
          category: 'validator',
          confidence: 'medium',
          signals: ['has validate method or validator naming']
        };
      }
    }

    return null;
  }

  /**
   * Check if file looks like a config file.
   */
  private isConfigFile(sourceFile: SourceFile, filePath: string): boolean {
    const baseName = path.basename(filePath).toLowerCase();

    // Config filename patterns
    if (/config|settings|constants|defaults/i.test(baseName)) {
      return true;
    }

    // Check for object literal exports (common in config)
    const exports = sourceFile.getExportedDeclarations();
    let objectExports = 0;
    let totalExports = 0;

    for (const [, decls] of exports) {
      for (const decl of decls) {
        totalExports++;
        if (decl.getKind() === SyntaxKind.VariableDeclaration) {
          const init = (decl as VariableDeclaration).getInitializer?.();
          if (init?.getKind() === SyntaxKind.ObjectLiteralExpression) {
            objectExports++;
          }
        }
      }
    }

    // Mostly object exports = likely config
    return totalExports > 0 && objectExports / totalExports > 0.5;
  }

  /**
   * Check if file has exported functions.
   */
  private hasExportedFunctions(sourceFile: SourceFile): boolean {
    // Check function declarations
    for (const func of sourceFile.getFunctions()) {
      if (func.isExported()) return true;
    }

    // Check arrow functions in variable declarations
    for (const varDecl of sourceFile.getVariableDeclarations()) {
      const init = varDecl.getInitializer();
      if (init?.getKind() === SyntaxKind.ArrowFunction) {
        const varStmt = varDecl.getVariableStatement();
        if (varStmt?.isExported()) return true;
      }
    }

    return false;
  }

  /**
   * Check if file imports from specific modules.
   */
  private hasImportFrom(sourceFile: SourceFile, modules: string[]): boolean {
    for (const imp of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      if (modules.some(m => moduleSpecifier === m || moduleSpecifier.startsWith(`${m}/`))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if file contains JSX elements.
   */
  private hasJsxElements(sourceFile: SourceFile): boolean {
    const jsxKinds = [
      SyntaxKind.JsxElement,
      SyntaxKind.JsxSelfClosingElement,
      SyntaxKind.JsxFragment,
    ];

    return this.hasDescendantOfKind(sourceFile, jsxKinds);
  }

  /**
   * Check if file calls React hooks (useState, useEffect, etc.).
   */
  private hasHookCalls(sourceFile: SourceFile): boolean {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      const text = expr.getText();

      // Direct hook call: useState(), useEffect()
      if (/^use[A-Z]/.test(text)) {
        return true;
      }

      // React.useState(), React.useEffect()
      if (/^React\.use[A-Z]/.test(text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if file defines a custom hook (function starting with "use").
   */
  private definesHook(sourceFile: SourceFile): boolean {
    // Check function declarations
    for (const func of sourceFile.getFunctions()) {
      const name = func.getName();
      if (name && /^use[A-Z]/.test(name) && func.isExported()) {
        return true;
      }
    }

    // Check arrow functions
    for (const varDecl of sourceFile.getVariableDeclarations()) {
      const name = varDecl.getName();
      if (/^use[A-Z]/.test(name)) {
        const init = varDecl.getInitializer();
        if (init?.getKind() === SyntaxKind.ArrowFunction) {
          const varStmt = varDecl.getVariableStatement();
          if (varStmt?.isExported()) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if file has calls to specific functions.
   */
  private hasCallsTo(sourceFile: SourceFile, functionNames: string[]): boolean {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      const text = expr.getText();
      if (functionNames.includes(text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if node has descendants of specific kinds.
   */
  private hasDescendantOfKind(node: Node, kinds: SyntaxKind[]): boolean {
    for (const descendant of node.getDescendants()) {
      if (kinds.includes(descendant.getKind())) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    for (const sourceFile of this.project.getSourceFiles()) {
      this.project.removeSourceFile(sourceFile);
    }
  }
}
