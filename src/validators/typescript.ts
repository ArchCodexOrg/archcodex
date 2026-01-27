/**
 * @arch archcodex.infra.validator
 *
 * TypeScript/JavaScript validator using ts-morph for AST analysis.
 * Produces SemanticModel for language-agnostic constraint validation.
 */
import {
  Project,
  SourceFile,
  ClassDeclaration,
  SyntaxKind,
} from 'ts-morph';
import * as path from 'node:path';
import type { ILanguageValidator } from './interface.types.js';
import type {
  SemanticModel,
  SupportedLanguage,
  LanguageCapabilities,
  ClassInfo,
  ImportInfo,
  DecoratorInfo,
  MethodInfo,
  InterfaceInfo,
  Visibility,
  SourceLocation,
  FunctionCallInfo,
  FunctionInfo,
  MutationInfo,
  ControlFlowContext,
  ExportInfo,
} from './semantic.types.js';
import { TYPESCRIPT_CAPABILITIES } from './capabilities.js';
import { readFile } from '../utils/file-system.js';
import { extractIntents } from '../core/arch-tag/parser.js';

/**
 * TypeScript/JavaScript validator using ts-morph for AST analysis.
 * Produces SemanticModel for language-agnostic constraint validation.
 */
export class TypeScriptValidator implements ILanguageValidator {
  readonly supportedLanguages: SupportedLanguage[] = ['typescript', 'javascript'];
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx'];
  readonly capabilities: LanguageCapabilities = TYPESCRIPT_CAPABILITIES;

  private project: Project;
  private inheritanceCache = new Map<string, string[]>();

  constructor(_projectRoot?: string) {
    this.project = new Project({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        strict: false,
        skipLibCheck: true,
      },
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });
  }

  /**
   * Parse a file into a SemanticModel.
   * @param filePath Path to the file
   * @param content Optional pre-loaded content to avoid re-reading from disk
   */
  async parseFile(filePath: string, content?: string): Promise<SemanticModel> {
    const fileContent = content ?? await readFile(filePath);
    const extension = path.extname(filePath);
    const sourceFile = this.project.createSourceFile(
      `__temp_${Date.now()}_${path.basename(filePath)}`,
      fileContent,
      { overwrite: true }
    );

    const language = this.detectLanguage(extension);
    const lineCount = this.calculateLineCount(fileContent);
    const locCount = this.calculateLoc(sourceFile, fileContent);

    // Single-pass extraction of all data (much faster than multiple traversals)
    const { imports, functionCalls, mutations } = this.extractAllInSinglePass(sourceFile);

    // Extract top-level declarations (these use direct accessors, not full traversal)
    const result: SemanticModel = {
      filePath,
      fileName: path.basename(filePath),
      extension,
      content: fileContent,
      lineCount,
      locCount,
      language,
      imports,
      classes: this.extractClasses(sourceFile),
      interfaces: this.extractInterfaces(sourceFile),
      functions: this.extractFunctions(sourceFile),
      functionCalls,
      mutations,
      exports: this.extractExports(sourceFile),
    };

    // Clean up temp source file immediately to prevent memory growth
    this.project.removeSourceFile(sourceFile);

    return result;
  }

  /**
   * Single-pass extraction of imports, function calls, and mutations.
   * This is much faster than calling getDescendantsOfKind multiple times.
   */
  private extractAllInSinglePass(sourceFile: SourceFile): {
    imports: ImportInfo[];
    functionCalls: FunctionCallInfo[];
    mutations: MutationInfo[];
  } {
    const imports: ImportInfo[] = [];
    const functionCalls: FunctionCallInfo[] = [];
    const mutations: MutationInfo[] = [];

    // Extract static imports first (direct accessor, fast)
    for (const imp of sourceFile.getImportDeclarations()) {
      const moduleSpec = imp.getModuleSpecifierValue();
      const namedImports = imp.getNamedImports().map(n => n.getName());
      const defaultImport = imp.getDefaultImport()?.getText();
      const isTypeOnly = imp.isTypeOnly();

      imports.push({
        moduleSpecifier: moduleSpec,
        namedImports: namedImports.length > 0 ? namedImports : undefined,
        defaultImport,
        isTypeOnly,
        isDynamic: false,
        location: this.getLocation(imp),
        rawText: imp.getText(),
      });
    }

    // Single traversal for all descendant nodes
    sourceFile.forEachDescendant((node) => {
      const kind = node.getKind();

      switch (kind) {
        case SyntaxKind.CallExpression: {
          const call = node as import('ts-morph').CallExpression;
          const expr = call.getExpression();

          // Dynamic import()
          if (expr.getKind() === SyntaxKind.ImportKeyword) {
            const args = call.getArguments();
            if (args.length > 0) {
              const moduleSpec = this.extractStringLiteral(args[0].getText());
              if (moduleSpec) {
                imports.push({
                  moduleSpecifier: moduleSpec,
                  isDynamic: true,
                  location: this.getLocation(call),
                  rawText: call.getText(),
                });
              }
            }
          }
          // require()
          else if (expr.getText() === 'require') {
            const args = call.getArguments();
            if (args.length > 0) {
              const moduleSpec = this.extractStringLiteral(args[0].getText());
              if (moduleSpec) {
                imports.push({
                  moduleSpecifier: moduleSpec,
                  isDynamic: true,
                  location: this.getLocation(call),
                  rawText: call.getText(),
                });
              }
            }
          }
          // Regular function call
          else {
            const callInfo = this.parseCallExpression(call, false);
            if (callInfo) {
              // Track the containing function
              callInfo.parentFunction = this.findParentFunction(call);
              functionCalls.push(callInfo);
            }
          }
          break;
        }

        case SyntaxKind.NewExpression: {
          const newExpr = node as import('ts-morph').NewExpression;
          const callInfo = this.parseNewExpression(newExpr);
          if (callInfo) {
            // Track the containing function
            callInfo.parentFunction = this.findParentFunction(newExpr);
            functionCalls.push(callInfo);
          }
          break;
        }

        case SyntaxKind.BinaryExpression: {
          const expr = node as import('ts-morph').BinaryExpression;
          const mutation = this.parseBinaryAssignment(expr);
          if (mutation) mutations.push(mutation);
          break;
        }

        case SyntaxKind.DeleteExpression: {
          const expr = node as import('ts-morph').DeleteExpression;
          const mutation = this.parseDeleteExpression(expr);
          if (mutation) mutations.push(mutation);
          break;
        }

        case SyntaxKind.PrefixUnaryExpression:
        case SyntaxKind.PostfixUnaryExpression: {
          const expr = node as import('ts-morph').PrefixUnaryExpression | import('ts-morph').PostfixUnaryExpression;
          const mutation = this.parseUnaryMutation(expr);
          if (mutation) mutations.push(mutation);
          break;
        }
      }
    });

    return { imports, functionCalls, mutations };
  }

  /**
   * Detect language from file extension.
   */
  private detectLanguage(extension: string): SupportedLanguage {
    if (extension === '.js' || extension === '.jsx') {
      return 'javascript';
    }
    return 'typescript';
  }

  /**
   * Calculate accurate line count, handling empty files and trailing newlines.
   */
  private calculateLineCount(content: string): number {
    if (content === '') {
      return 0;
    }
    // Split by newlines, but don't count trailing empty line from final newline
    const lines = content.split('\n');
    // If file ends with newline, the last element will be empty string
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      return lines.length - 1;
    }
    return lines.length;
  }

  /**
   * Calculate lines of code (LOC) excluding comments and blank lines.
   * Uses simple line-by-line analysis for performance.
   */
  private calculateLoc(_sourceFile: SourceFile, content: string): number {
    if (content === '') return 0;

    const lines = content.split('\n');
    let loc = 0;
    let inBlockComment = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip blank lines
      if (trimmed === '') continue;

      // Handle block comments
      if (inBlockComment) {
        if (trimmed.includes('*/')) {
          inBlockComment = false;
          // Check if there's code after the block comment ends
          const afterComment = trimmed.slice(trimmed.indexOf('*/') + 2).trim();
          if (afterComment && !afterComment.startsWith('//')) {
            loc++;
          }
        }
        continue;
      }

      // Check for block comment start
      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) {
          inBlockComment = true;
        }
        // Single-line block comment like /* foo */ - still a comment line
        continue;
      }

      // Skip single-line comments
      if (trimmed.startsWith('//')) continue;

      // Skip JSDoc-style comment continuation lines (start with *)
      if (trimmed.startsWith('*') && !trimmed.startsWith('*/')) continue;

      // This is a code line (may have trailing comment, but has code)
      loc++;
    }

    return loc;
  }

  /**
   * Extract standalone functions from a source file.
   */
  private extractFunctions(sourceFile: SourceFile): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    // Extract function declarations
    for (const func of sourceFile.getFunctions()) {
      const modifiers = func.getModifiers();
      let visibility: Visibility = 'public';
      if (modifiers.some(m => m.getKind() === SyntaxKind.PrivateKeyword)) {
        visibility = 'private';
      }

      // Extract JSDoc and intents
      const jsDocs = func.getJsDocs();
      const jsDoc = jsDocs.map(d => d.getText()).join('\n') || undefined;
      const intents = jsDoc ? extractIntents(jsDoc) : undefined;

      functions.push({
        name: func.getName() || 'anonymous',
        isExported: func.isExported(),
        isAsync: func.isAsync(),
        isGenerator: func.isGenerator(),
        visibility,
        decorators: [],  // Functions don't have decorators in TS like classes do
        parameterCount: func.getParameters().length,
        returnType: func.getReturnType()?.getText(),
        location: this.getLocation(func),
        jsDoc,
        intents: intents?.length ? intents : undefined,
        startLine: func.getStartLineNumber(),
        endLine: func.getEndLineNumber(),
      });
    }

    // Extract arrow functions assigned to variables at module level
    for (const varDecl of sourceFile.getVariableDeclarations()) {
      const initializer = varDecl.getInitializer();
      if (initializer && initializer.getKind() === SyntaxKind.ArrowFunction) {
        const arrowFunc = initializer as import('ts-morph').ArrowFunction;
        const varStmt = varDecl.getVariableStatement();
        const isExported = varStmt?.isExported() ?? false;

        // Arrow functions get JSDoc from the variable statement
        const jsDocs = varStmt?.getJsDocs() ?? [];
        const jsDoc = jsDocs.map(d => d.getText()).join('\n') || undefined;
        const intents = jsDoc ? extractIntents(jsDoc) : undefined;

        functions.push({
          name: varDecl.getName(),
          isExported,
          isAsync: arrowFunc.isAsync(),
          isGenerator: false,
          visibility: 'public',
          decorators: [],
          parameterCount: arrowFunc.getParameters().length,
          returnType: arrowFunc.getReturnType()?.getText(),
          location: this.getLocation(varDecl),
          jsDoc,
          intents: intents?.length ? intents : undefined,
          startLine: arrowFunc.getStartLineNumber(),
          endLine: arrowFunc.getEndLineNumber(),
        });
      }
    }

    return functions;
  }


  /**
   * Extract all classes from a source file.
   */
  private extractClasses(sourceFile: SourceFile): ClassInfo[] {
    return sourceFile.getClasses().map(classDecl => {
      const extendsClause = classDecl.getExtends();
      const extendsName = extendsClause?.getText().split('<')[0];

      return {
        name: classDecl.getName() || 'Anonymous',
        isExported: classDecl.isExported(),
        extends: extendsName,
        inheritanceChain: this.getInheritanceChain(classDecl),
        implements: classDecl.getImplements().map(i => i.getText().split('<')[0]),
        decorators: this.extractDecorators(classDecl),
        methods: this.extractMethods(classDecl),
        isAbstract: classDecl.isAbstract(),
        location: this.getLocation(classDecl),
      };
    });
  }

  /**
   * Get the full inheritance chain for a class.
   */
  private getInheritanceChain(classDecl: ClassDeclaration): string[] {
    const cacheKey = `${classDecl.getSourceFile().getFilePath()}:${classDecl.getName()}`;

    if (this.inheritanceCache.has(cacheKey)) {
      return this.inheritanceCache.get(cacheKey)!;
    }

    const chain: string[] = [];
    let current: ClassDeclaration | undefined = classDecl;
    const visited = new Set<string>();

    while (current) {
      const name = current.getName();
      if (name) {
        if (visited.has(name)) break;
        visited.add(name);
        chain.push(name);

        // Also add extends expression for generic matches
        const extendsClause = current.getExtends();
        if (extendsClause) {
          const extendsName = extendsClause.getText().split('<')[0];
          if (!visited.has(extendsName)) {
            chain.push(extendsName);
          }
        }
      }

      current = current.getBaseClass();
    }

    this.inheritanceCache.set(cacheKey, chain);
    return chain;
  }

  /**
   * Extract decorators from a class.
   */
  private extractDecorators(node: ClassDeclaration): DecoratorInfo[] {
    return node.getDecorators().map(d => ({
      name: d.getName(),
      arguments: d.getArguments().map(a => a.getText()),
      location: this.getLocation(d),
      rawText: d.getText(),
    }));
  }

  /**
   * Extract methods from a class.
   */
  private extractMethods(classDecl: ClassDeclaration): MethodInfo[] {
    return classDecl.getMethods().map(method => {
      const modifiers = method.getModifiers();

      let visibility: Visibility = 'public';
      if (modifiers.some(m => m.getKind() === SyntaxKind.PrivateKeyword)) {
        visibility = 'private';
      } else if (modifiers.some(m => m.getKind() === SyntaxKind.ProtectedKeyword)) {
        visibility = 'protected';
      }

      // Extract JSDoc and intents
      const jsDocs = method.getJsDocs();
      const jsDoc = jsDocs.map(d => d.getText()).join('\n') || undefined;
      const intents = jsDoc ? extractIntents(jsDoc) : undefined;

      return {
        name: method.getName(),
        visibility,
        isStatic: method.isStatic(),
        isAbstract: method.isAbstract(),
        decorators: method.getDecorators().map(d => ({
          name: d.getName(),
          arguments: d.getArguments().map(a => a.getText()),
          location: this.getLocation(d),
          rawText: d.getText(),
        })),
        parameterCount: method.getParameters().length,
        returnType: method.getReturnType()?.getText(),
        location: this.getLocation(method),
        jsDoc,
        intents: intents?.length ? intents : undefined,
        startLine: method.getStartLineNumber(),
        endLine: method.getEndLineNumber(),
      };
    });
  }

  /**
   * Extract interfaces from a source file.
   */
  private extractInterfaces(sourceFile: SourceFile): InterfaceInfo[] {
    return sourceFile.getInterfaces().map(iface => ({
      name: iface.getName(),
      isExported: iface.isExported(),
      extends: iface.getExtends().map(e => e.getText().split('<')[0]),
      location: this.getLocation(iface),
    }));
  }


  /**
   * Parse a call expression into FunctionCallInfo.
   */
  private parseCallExpression(
    call: import('ts-morph').CallExpression,
    isConstructor: boolean
  ): FunctionCallInfo | null {
    const expr = call.getExpression();
    const { callee, receiver, methodName, isOptionalChain } = this.parseCalleeExpression(expr);

    return {
      callee,
      receiver,
      methodName,
      arguments: call.getArguments().map(a => a.getText()),
      argumentCount: call.getArguments().length,
      location: this.getLocation(call),
      rawText: call.getText(),
      controlFlow: this.getControlFlowContext(call),
      isConstructorCall: isConstructor,
      isOptionalChain,
    };
  }

  /**
   * Parse a new expression into FunctionCallInfo.
   */
  private parseNewExpression(
    newExpr: import('ts-morph').NewExpression
  ): FunctionCallInfo | null {
    const expr = newExpr.getExpression();
    if (!expr) return null;

    const callee = expr.getText();
    const methodName = callee.split('.').pop() || callee;

    return {
      callee,
      receiver: undefined,
      methodName,
      arguments: newExpr.getArguments().map(a => a.getText()),
      argumentCount: newExpr.getArguments().length,
      location: this.getLocation(newExpr),
      rawText: newExpr.getText(),
      controlFlow: this.getControlFlowContext(newExpr),
      isConstructorCall: true,
      isOptionalChain: false,
    };
  }

  /**
   * Parse the callee expression to extract receiver and method name.
   */
  private parseCalleeExpression(expr: import('ts-morph').Expression): {
    callee: string;
    receiver?: string;
    methodName: string;
    isOptionalChain: boolean;
  } {
    const text = expr.getText();
    const isOptionalChain = text.includes('?.');

    // Handle property access: foo.bar() or foo?.bar()
    if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expr as import('ts-morph').PropertyAccessExpression;
      const receiver = propAccess.getExpression().getText();
      const methodName = propAccess.getName();
      return { callee: text, receiver, methodName, isOptionalChain };
    }

    // Handle element access: foo['bar']()
    if (expr.getKind() === SyntaxKind.ElementAccessExpression) {
      const elemAccess = expr as import('ts-morph').ElementAccessExpression;
      const receiver = elemAccess.getExpression().getText();
      const arg = elemAccess.getArgumentExpression();
      const methodName = arg ? this.extractStringLiteral(arg.getText()) || arg.getText() : 'unknown';
      return { callee: text, receiver, methodName, isOptionalChain };
    }

    // Simple identifier: setTimeout(), fetch()
    return { callee: text, receiver: undefined, methodName: text, isOptionalChain };
  }

  /**
   * Get the control flow context for a node.
   * Walks up the AST to find enclosing try/catch/finally blocks.
   */
  private getControlFlowContext(node: import('ts-morph').Node): ControlFlowContext {
    const context: ControlFlowContext = {
      inTryBlock: false,
      inCatchBlock: false,
      inFinallyBlock: false,
      tryDepth: 0,
    };

    let current: import('ts-morph').Node | undefined = node.getParent();

    while (current) {
      if (current.getKind() === SyntaxKind.TryStatement) {
        const tryStmt = current as import('ts-morph').TryStatement;
        const tryBlock = tryStmt.getTryBlock();
        const catchClause = tryStmt.getCatchClause();
        const finallyBlock = tryStmt.getFinallyBlock();

        // Check if node is in try block
        if (tryBlock && this.isNodeInBlock(node, tryBlock)) {
          context.inTryBlock = true;
          context.tryDepth++;
        }
        // Check if node is in catch block
        if (catchClause && this.isNodeInBlock(node, catchClause.getBlock())) {
          context.inCatchBlock = true;
        }
        // Check if node is in finally block
        if (finallyBlock && this.isNodeInBlock(node, finallyBlock)) {
          context.inFinallyBlock = true;
        }
      }
      current = current.getParent();
    }

    return context;
  }

  /**
   * Check if a node is contained within a block.
   */
  private isNodeInBlock(node: import('ts-morph').Node, block: import('ts-morph').Block): boolean {
    const nodeStart = node.getStart();
    const nodeEnd = node.getEnd();
    const blockStart = block.getStart();
    const blockEnd = block.getEnd();
    return nodeStart >= blockStart && nodeEnd <= blockEnd;
  }

  /**
   * Find the containing function or method for a node.
   * Returns the function/method name, or undefined if at module scope.
   */
  private findParentFunction(node: import('ts-morph').Node): string | undefined {
    let current: import('ts-morph').Node | undefined = node.getParent();

    while (current) {
      const kind = current.getKind();

      // Function declaration
      if (kind === SyntaxKind.FunctionDeclaration) {
        const func = current as import('ts-morph').FunctionDeclaration;
        return func.getName() || 'anonymous';
      }

      // Arrow function (look for variable name)
      if (kind === SyntaxKind.ArrowFunction) {
        const parent = current.getParent();
        if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
          return (parent as import('ts-morph').VariableDeclaration).getName();
        }
        // Anonymous arrow function
        return 'anonymous';
      }

      // Function expression
      if (kind === SyntaxKind.FunctionExpression) {
        const func = current as import('ts-morph').FunctionExpression;
        const name = func.getName();
        if (name) return name;
        // Check if assigned to variable
        const parent = current.getParent();
        if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
          return (parent as import('ts-morph').VariableDeclaration).getName();
        }
        return 'anonymous';
      }

      // Class method
      if (kind === SyntaxKind.MethodDeclaration) {
        const method = current as import('ts-morph').MethodDeclaration;
        const className = method.getParent()?.asKind(SyntaxKind.ClassDeclaration)?.getName();
        return className ? `${className}.${method.getName()}` : method.getName();
      }

      // Constructor
      if (kind === SyntaxKind.Constructor) {
        const ctor = current as import('ts-morph').ConstructorDeclaration;
        const className = ctor.getParent()?.asKind(SyntaxKind.ClassDeclaration)?.getName();
        return className ? `${className}.constructor` : 'constructor';
      }

      // Getter/Setter
      if (kind === SyntaxKind.GetAccessor || kind === SyntaxKind.SetAccessor) {
        const accessor = current as import('ts-morph').GetAccessorDeclaration | import('ts-morph').SetAccessorDeclaration;
        const className = accessor.getParent()?.asKind(SyntaxKind.ClassDeclaration)?.getName();
        const prefix = kind === SyntaxKind.GetAccessor ? 'get ' : 'set ';
        return className ? `${className}.${prefix}${accessor.getName()}` : `${prefix}${accessor.getName()}`;
      }

      current = current.getParent();
    }

    return undefined; // Module scope
  }


  /**
   * Parse a binary assignment expression.
   */
  private parseBinaryAssignment(
    expr: import('ts-morph').BinaryExpression
  ): MutationInfo | null {
    const operator = expr.getOperatorToken().getText();
    const assignmentOps = ['=', '+=', '-=', '*=', '/=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '&&=', '||=', '??='];

    if (!assignmentOps.includes(operator)) return null;

    const left = expr.getLeft();

    // Only track property access mutations, not simple variable assignments
    if (left.getKind() !== SyntaxKind.PropertyAccessExpression &&
        left.getKind() !== SyntaxKind.ElementAccessExpression) {
      return null;
    }

    const { rootObject, propertyPath } = this.parsePropertyChain(left);

    return {
      target: left.getText(),
      rootObject,
      propertyPath,
      operator,
      location: this.getLocation(expr),
      rawText: expr.getText(),
      isDelete: false,
    };
  }

  /**
   * Parse a delete expression.
   */
  private parseDeleteExpression(
    expr: import('ts-morph').DeleteExpression
  ): MutationInfo | null {
    const operand = expr.getExpression();

    // Only track property deletions
    if (operand.getKind() !== SyntaxKind.PropertyAccessExpression &&
        operand.getKind() !== SyntaxKind.ElementAccessExpression) {
      return null;
    }

    const { rootObject, propertyPath } = this.parsePropertyChain(operand);

    return {
      target: operand.getText(),
      rootObject,
      propertyPath,
      operator: 'delete',
      location: this.getLocation(expr),
      rawText: expr.getText(),
      isDelete: true,
    };
  }

  /**
   * Parse a unary mutation (++/--).
   */
  private parseUnaryMutation(
    expr: import('ts-morph').PrefixUnaryExpression | import('ts-morph').PostfixUnaryExpression
  ): MutationInfo | null {
    const operatorToken = expr.getOperatorToken();
    const operator = SyntaxKind[operatorToken];

    // Only ++ and --
    if (operator !== 'PlusPlusToken' && operator !== 'MinusMinusToken') {
      return null;
    }

    const operand = expr.getOperand();

    // Only track property mutations
    if (operand.getKind() !== SyntaxKind.PropertyAccessExpression &&
        operand.getKind() !== SyntaxKind.ElementAccessExpression) {
      return null;
    }

    const { rootObject, propertyPath } = this.parsePropertyChain(operand);
    const opText = operator === 'PlusPlusToken' ? '++' : '--';

    return {
      target: operand.getText(),
      rootObject,
      propertyPath,
      operator: opText,
      location: this.getLocation(expr),
      rawText: expr.getText(),
      isDelete: false,
    };
  }

  /**
   * Parse a property access chain to get root object and path.
   */
  private parsePropertyChain(expr: import('ts-morph').Expression): {
    rootObject: string;
    propertyPath: string[];
  } {
    const path: string[] = [];
    let current: import('ts-morph').Expression = expr;

    while (
      current.getKind() === SyntaxKind.PropertyAccessExpression ||
      current.getKind() === SyntaxKind.ElementAccessExpression
    ) {
      if (current.getKind() === SyntaxKind.PropertyAccessExpression) {
        const propAccess = current as import('ts-morph').PropertyAccessExpression;
        path.unshift(propAccess.getName());
        current = propAccess.getExpression();
      } else {
        const elemAccess = current as import('ts-morph').ElementAccessExpression;
        const arg = elemAccess.getArgumentExpression();
        path.unshift(arg ? this.extractStringLiteral(arg.getText()) || arg.getText() : 'unknown');
        current = elemAccess.getExpression();
      }
    }

    return { rootObject: current.getText(), propertyPath: path };
  }

  /**
   * Get source location from a ts-morph node.
   */
  private getLocation(node: { getStartLineNumber(): number; getStart(): number; getStartLinePos(): number }): SourceLocation {
    return {
      line: node.getStartLineNumber(),
      column: node.getStart() - node.getStartLinePos() + 1,
    };
  }

  /**
   * Extract string literal value from quoted text.
   * Uses non-greedy matching to handle cases like "foo" + "bar"
   */
  private extractStringLiteral(text: string): string | null {
    const match = text.match(/^['"`](.+?)['"`]$/);
    return match ? match[1] : null;
  }

  /**
   * Extract all exports from a source file.
   */
  private extractExports(sourceFile: SourceFile): ExportInfo[] {
    const exports: ExportInfo[] = [];

    // Export declarations: export { foo, bar } or export { foo as default }
    for (const exportDecl of sourceFile.getExportDeclarations()) {
      // Re-exports: export * from './foo' or export { foo } from './bar'
      const moduleSpec = exportDecl.getModuleSpecifierValue();
      if (moduleSpec) {
        const namedExports = exportDecl.getNamedExports();
        if (namedExports.length === 0) {
          // export * from './foo'
          exports.push({
            name: '*',
            kind: 're-export',
            isDefault: false,
            location: this.getLocation(exportDecl),
          });
        } else {
          // export { foo, bar } from './baz'
          for (const named of namedExports) {
            exports.push({
              name: named.getName(),
              kind: 're-export',
              isDefault: named.getName() === 'default',
              location: this.getLocation(named),
            });
          }
        }
      } else {
        // export { foo, bar }
        for (const named of exportDecl.getNamedExports()) {
          exports.push({
            name: named.getName(),
            kind: 'variable', // Could be anything, but we mark as variable
            isDefault: named.getName() === 'default',
            location: this.getLocation(named),
          });
        }
      }
    }

    // Exported functions
    for (const func of sourceFile.getFunctions()) {
      if (func.isExported()) {
        exports.push({
          name: func.getName() || 'default',
          kind: 'function',
          isDefault: func.isDefaultExport(),
          location: this.getLocation(func),
        });
      }
    }

    // Exported classes
    for (const classDecl of sourceFile.getClasses()) {
      if (classDecl.isExported()) {
        exports.push({
          name: classDecl.getName() || 'default',
          kind: 'class',
          isDefault: classDecl.isDefaultExport(),
          location: this.getLocation(classDecl),
        });
      }
    }

    // Exported interfaces
    for (const iface of sourceFile.getInterfaces()) {
      if (iface.isExported()) {
        exports.push({
          name: iface.getName(),
          kind: 'interface',
          isDefault: false, // Interfaces can't be default exports
          location: this.getLocation(iface),
        });
      }
    }

    // Exported type aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      if (typeAlias.isExported()) {
        exports.push({
          name: typeAlias.getName(),
          kind: 'type',
          isDefault: false,
          location: this.getLocation(typeAlias),
        });
      }
    }

    // Exported variables (const, let, var)
    for (const varStmt of sourceFile.getVariableStatements()) {
      if (varStmt.isExported()) {
        for (const decl of varStmt.getDeclarations()) {
          exports.push({
            name: decl.getName(),
            kind: 'variable',
            isDefault: false,
            location: this.getLocation(decl),
          });
        }
      }
    }

    // Default export assignment: export default foo
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      const existing = exports.find(e => e.isDefault);
      if (!existing) {
        // Add default export if not already tracked
        const decl = defaultExport.getDeclarations()[0];
        if (decl) {
          exports.push({
            name: 'default',
            kind: 'variable',
            isDefault: true,
            location: this.getLocation(decl),
          });
        }
      }
    }

    return exports;
  }

  /**
   * Release resources.
   */
  dispose(): void {
    this.inheritanceCache.clear();

    for (const sourceFile of this.project.getSourceFiles()) {
      this.project.removeSourceFile(sourceFile);
    }
  }
}
