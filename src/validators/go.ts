/**
 * @arch archcodex.infra.validator
 *
 * Go validator using regex-based parsing for AST analysis.
 * Produces SemanticModel for language-agnostic constraint validation.
 */
import * as path from 'node:path';
import type { ILanguageValidator } from './interface.types.js';
import type {
  SemanticModel,
  SupportedLanguage,
  LanguageCapabilities,
  ClassInfo,
  ImportInfo,
  MethodInfo,
  InterfaceInfo,
  Visibility,
  SourceLocation,
  FunctionCallInfo,
  FunctionInfo,
  MutationInfo,
  ExportInfo,
} from './semantic.types.js';
import { GO_CAPABILITIES } from './capabilities.js';
import { readFile } from '../utils/file-system.js';

/**
 * Go validator using regex-based line-by-line parsing.
 * Produces SemanticModel for language-agnostic constraint validation.
 *
 * Known limitations of regex-based parsing:
 * - Multi-line function/method signatures are not supported; each signature must
 *   fit on a single line.
 * - Generic type parameters (e.g. type Container[T any] struct) are not parsed.
 * - Grouped type declarations (type ( ... )) are not parsed; each type must use
 *   its own `type` keyword.
 */
export class GoValidator implements ILanguageValidator {
  readonly supportedLanguages: SupportedLanguage[] = ['go'];
  readonly supportedExtensions = ['.go'];
  readonly capabilities: LanguageCapabilities = GO_CAPABILITIES;

  // Go has no try/catch; uses defer/recover pattern.
  private static readonly GO_CONTROL_FLOW = Object.freeze({
    inTryBlock: false,
    inCatchBlock: false,
    inFinallyBlock: false,
    tryDepth: 0,
  });

  async parseFile(filePath: string, content?: string): Promise<SemanticModel> {
    const fileContent = content ?? await readFile(filePath);
    const extension = path.extname(filePath);
    const lines = fileContent.split('\n');

    const imports = this.extractImports(lines);
    const { classes, interfaces } = this.extractStructsAndInterfaces(lines);
    this.attachMethodsToStructs(lines, classes);
    const functions = this.extractFunctions(lines);
    const functionCalls = this.extractFunctionCalls(lines);
    const mutations = this.extractMutations(lines);
    const exports = this.extractExports(classes, interfaces, functions, lines);

    return {
      filePath,
      fileName: path.basename(filePath),
      extension,
      content: fileContent,
      lineCount: this.calculateLineCount(lines),
      locCount: this.calculateLoc(lines),
      language: 'go',
      imports,
      classes,
      interfaces,
      functions,
      functionCalls,
      mutations,
      exports,
    };
  }

  dispose(): void {
    // No resources to clean up for regex-based parsing
  }

  private calculateLineCount(lines: string[]): number {
    if (lines.length === 0) return 0;
    if (lines[lines.length - 1] === '') {
      return lines.length - 1;
    }
    return lines.length;
  }

  private calculateLoc(lines: string[]): number {
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
          // Check if there's code after the closing */
          const afterComment = trimmed.slice(closeIdx + 2).trim();
          if (afterComment !== '' && !afterComment.startsWith('//')) {
            loc++;
          }
        }
        continue;
      }

      if (trimmed.startsWith('//')) continue;

      // Check for block comment anywhere in the line
      const openIdx = trimmed.indexOf('/*');
      if (openIdx >= 0) {
        const closeIdx = trimmed.indexOf('*/', openIdx + 2);
        if (closeIdx >= 0) {
          // Self-closing block comment — count if there's code outside it
          const before = trimmed.slice(0, openIdx).trim();
          const after = trimmed.slice(closeIdx + 2).trim();
          if (before !== '' || (after !== '' && !after.startsWith('//'))) {
            loc++;
          }
        } else {
          // Block comment opens but doesn't close on this line
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

  private extractImports(lines: string[]): ImportInfo[] {
    const imports: ImportInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const lineNum = i + 1;

      // Single import: import "fmt" or import f "fmt"
      const singleMatch = trimmed.match(/^import\s+(?:(\w+|\.)\s+)?"(.+)"$/);
      if (singleMatch) {
        const alias = singleMatch[1];
        const pkg = singleMatch[2];
        // Dot imports (.) and blank imports (_) have no usable default name
        const isSideEffectAlias = alias === '.' || alias === '_';
        imports.push({
          moduleSpecifier: pkg,
          defaultImport: isSideEffectAlias ? undefined : (alias || pkg.split('/').pop()!),
          isDynamic: false,
          location: { line: lineNum, column: lines[i].indexOf('import') + 1 },
          rawText: trimmed,
        });
        continue;
      }

      // Block import: import ( ... )
      if (trimmed.match(/^import\s*\(\s*$/)) {
        let j = i + 1;
        while (j < lines.length) {
          const innerTrimmed = lines[j].trim();
          if (innerTrimmed === ')') break;
          if (innerTrimmed === '' || innerTrimmed.startsWith('//')) {
            j++;
            continue;
          }

          // \w+ matches named aliases and _ (blank import); \. matches dot imports
          const pkgMatch = innerTrimmed.match(/^(?:(\w+|\.)\s+)?"(.+)"$/);
          if (pkgMatch) {
            const alias = pkgMatch[1];
            const pkg = pkgMatch[2];
            const isSideEffectAlias = alias === '.' || alias === '_';
            imports.push({
              moduleSpecifier: pkg,
              defaultImport: isSideEffectAlias ? undefined : (alias || pkg.split('/').pop()!),
              isDynamic: false,
              location: { line: j + 1, column: lines[j].indexOf('"') + 1 },
              rawText: innerTrimmed,
            });
          }
          j++;
        }
        i = j;
        continue;
      }
    }

    return imports;
  }

  private extractStructsAndInterfaces(lines: string[]): {
    classes: ClassInfo[];
    interfaces: InterfaceInfo[];
  } {
    const classes: ClassInfo[] = [];
    const interfaces: InterfaceInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const lineNum = i + 1;

      // Empty struct: type Name struct{}
      const inlineStructMatch = trimmed.match(/^type\s+(\w+)\s+struct\s*\{\s*\}$/);
      if (inlineStructMatch) {
        const name = inlineStructMatch[1];
        classes.push({
          name,
          isExported: /^[A-Z]/.test(name),
          extends: undefined,
          inheritanceChain: [name],
          implements: [],
          decorators: [],
          methods: [],
          isAbstract: false,
          location: { line: lineNum, column: lines[i].indexOf('type') + 1 },
        });
        continue;
      }

      // type Name struct {
      const structMatch = trimmed.match(/^type\s+(\w+)\s+struct\s*\{/);
      if (structMatch) {
        const name = structMatch[1];
        const isExported = /^[A-Z]/.test(name);
        const end = this.findClosingBrace(lines, i);
        const embeddings = this.extractEmbeddings(lines, i + 1, end);
        const location: SourceLocation = { line: lineNum, column: lines[i].indexOf('type') + 1 };

        // Go uses composition via embedding rather than true inheritance.
        // The first embedding is mapped to extends so ArchCodex constraints
        // like must_extend can operate on it; remaining embeddings go to implements.
        classes.push({
          name,
          isExported,
          extends: embeddings[0],
          inheritanceChain: embeddings.length > 0 ? [name, ...embeddings] : [name],
          implements: embeddings.slice(1),
          decorators: [],
          methods: [],
          isAbstract: false,
          location,
        });
        if (end > i) i = end;
        continue;
      }

      // Empty interface: type Name interface{}
      const emptyIfaceMatch = trimmed.match(/^type\s+(\w+)\s+interface\s*\{\s*\}$/);
      if (emptyIfaceMatch) {
        const name = emptyIfaceMatch[1];
        interfaces.push({
          name,
          isExported: /^[A-Z]/.test(name),
          extends: [],
          methods: [],
          location: { line: lineNum, column: lines[i].indexOf('type') + 1 },
        });
        continue;
      }

      // type Name interface {
      const ifaceMatch = trimmed.match(/^type\s+(\w+)\s+interface\s*\{/);
      if (ifaceMatch) {
        const name = ifaceMatch[1];
        const isExported = /^[A-Z]/.test(name);
        const end = this.findClosingBrace(lines, i);
        const { methods, embedded } = this.extractInterfaceMembers(lines, i + 1, end);

        interfaces.push({
          name,
          isExported,
          extends: embedded,
          methods,
          location: { line: lineNum, column: lines[i].indexOf('type') + 1 },
        });
        if (end > i) i = end;
        continue;
      }
    }

    return { classes, interfaces };
  }

  private extractEmbeddings(lines: string[], startLine: number, endLine: number): string[] {
    const embeddings: string[] = [];
    for (let i = startLine; i < endLine; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '' || trimmed.startsWith('//')) continue;

      // Embedded type: just a type name (possibly with pointer or package prefix)
      const embeddedMatch = trimmed.match(/^\*?([\w.]+)$/);
      if (embeddedMatch) {
        const typeName = embeddedMatch[1];
        const simpleName = typeName.includes('.') ? typeName.split('.').pop()! : typeName;
        embeddings.push(simpleName);
      }
    }
    return embeddings;
  }

  private extractInterfaceMembers(
    lines: string[],
    startLine: number,
    endLine: number
  ): { methods: Omit<MethodInfo, 'visibility'>[]; embedded: string[] } {
    const methods: Omit<MethodInfo, 'visibility'>[] = [];
    const embedded: string[] = [];

    for (let i = startLine; i < endLine; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '' || trimmed.startsWith('//')) continue;

      // Method signature: MethodName(params) returnType
      const methodMatch = trimmed.match(/^(\w+)\s*\(([^)]*)\)\s*(.*)?$/);
      if (methodMatch) {
        const name = methodMatch[1];
        const paramsStr = methodMatch[2].trim();
        const returnType = methodMatch[3]?.trim() || undefined;
        const paramCount = paramsStr === '' ? 0 : paramsStr.split(',').length;

        methods.push({
          name,
          isStatic: false,
          isAbstract: true,
          decorators: [],
          parameterCount: paramCount,
          returnType: returnType || undefined,
          location: { line: i + 1, column: lines[i].indexOf(name) + 1 },
        });
        continue;
      }

      // Embedded interface: just a type name
      const embeddedMatch = trimmed.match(/^([\w.]+)$/);
      if (embeddedMatch) {
        embedded.push(embeddedMatch[1]);
      }
    }

    return { methods, embedded };
  }

  private attachMethodsToStructs(lines: string[], classes: ClassInfo[]): void {
    const structMap = new Map<string, ClassInfo>();
    for (const cls of classes) {
      structMap.set(cls.name, cls);
    }

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // func (recv *Type) MethodName(params) returnType {
      const methodMatch = trimmed.match(
        /^func\s+\(\s*\w+\s+\*?(\w+)\s*\)\s+(\w+)\s*\(([^)]*)\)\s*(.*?)\s*\{?\s*$/
      );
      if (!methodMatch) continue;

      const receiverType = methodMatch[1];
      const methodName = methodMatch[2];
      const paramsStr = methodMatch[3].trim();
      const returnPart = methodMatch[4]?.replace(/\{$/, '').trim() || '';

      const visibility: Visibility = /^[A-Z]/.test(methodName) ? 'public' : 'private';
      const paramCount = paramsStr === '' ? 0 : paramsStr.split(',').length;

      const endLine = this.findClosingBrace(lines, i);

      const method: MethodInfo = {
        name: methodName,
        visibility,
        isStatic: false,
        isAbstract: false,
        decorators: [],
        parameterCount: paramCount,
        returnType: returnPart || undefined,
        location: { line: i + 1, column: lines[i].indexOf('func') + 1 },
        startLine: i + 1,
        endLine: endLine + 1,
      };

      const struct = structMap.get(receiverType);
      if (struct) {
        struct.methods.push(method);
      }
    }
  }

  private extractFunctions(lines: string[]): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip methods with receivers
      if (trimmed.match(/^func\s+\(/)) continue;

      // func FuncName(params) returnType {
      const funcMatch = trimmed.match(/^func\s+(\w+)\s*\(([^)]*)\)\s*(.*?)\s*\{?\s*$/);
      if (!funcMatch) continue;

      const funcName = funcMatch[1];
      const paramsStr = funcMatch[2].trim();
      const returnPart = funcMatch[3]?.replace(/\{$/, '').trim() || '';

      const isExported = /^[A-Z]/.test(funcName);
      const visibility: Visibility = isExported ? 'public' : 'private';
      const paramCount = paramsStr === '' ? 0 : paramsStr.split(',').length;

      const endLine = this.findClosingBrace(lines, i);

      functions.push({
        name: funcName,
        isExported,
        isAsync: false,
        visibility,
        decorators: [],
        parameterCount: paramCount,
        returnType: returnPart || undefined,
        location: { line: i + 1, column: lines[i].indexOf('func') + 1 },
        startLine: i + 1,
        endLine: endLine + 1,
      });
    }

    return functions;
  }

  private extractFunctionCalls(lines: string[]): FunctionCallInfo[] {
    const calls: FunctionCallInfo[] = [];
    const callPattern = /(?:(\w[\w.]*?)\.)?(\w+)\s*\(/g;
    const skipKeywords = new Set([
      'if', 'for', 'switch', 'select', 'case', 'range', 'return',
      'func', 'type', 'var', 'const', 'import', 'package', 'map',
      'chan', 'struct', 'interface',
    ]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//')) continue;
      if (trimmed.startsWith('import ') || trimmed.startsWith('package ')) continue;
      if (trimmed.match(/^type\s+\w+\s+(?:struct|interface)/)) continue;

      // Strip go/defer prefix for detection but still capture calls
      const stripped = trimmed.replace(/^(go|defer)\s+/, '');

      let match;
      callPattern.lastIndex = 0;
      while ((match = callPattern.exec(stripped)) !== null) {
        const receiver = match[1] || undefined;
        const methodName = match[2];
        const callee = receiver ? `${receiver}.${methodName}` : methodName;

        if (skipKeywords.has(methodName) && !receiver) continue;

        // Count arguments by extracting the text between the matched '(' and its closing ')'
        const argStart = match.index + match[0].length; // position after '('
        const argCount = this.countArguments(stripped, argStart);

        calls.push({
          callee,
          receiver,
          methodName,
          arguments: [],
          argumentCount: argCount,
          location: { line: i + 1, column: match.index + 1 },
          rawText: callee + '(...)',
          controlFlow: GoValidator.GO_CONTROL_FLOW,
          isConstructorCall: false,
          isOptionalChain: false,
        });
      }
    }

    return calls;
  }

  private extractMutations(lines: string[]): MutationInfo[] {
    const mutations: MutationInfo[] = [];
    const assignmentPattern = /^(\w[\w.[\]]*)\s*(=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)\s+/;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (trimmed.startsWith('//')) continue;
      if (trimmed.startsWith('import ') || trimmed.startsWith('package ')) continue;
      if (trimmed.match(/^(var|const|type|func)\s/)) continue;

      const match = trimmed.match(assignmentPattern);
      if (!match) continue;

      const target = match[1];
      const operator = match[2];

      if (!target.includes('.')) continue;

      const parts = target.split('.');
      mutations.push({
        target,
        rootObject: parts[0],
        propertyPath: parts.slice(1),
        operator,
        location: { line: i + 1, column: lines[i].indexOf(target) + 1 },
        rawText: trimmed,
        isDelete: false,
      });
    }

    return mutations;
  }

  private extractExports(
    classes: ClassInfo[],
    interfaces: InterfaceInfo[],
    functions: FunctionInfo[],
    lines: string[]
  ): ExportInfo[] {
    const exports: ExportInfo[] = [];

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

    for (const iface of interfaces) {
      if (iface.isExported) {
        exports.push({
          name: iface.name,
          kind: 'interface',
          isDefault: false,
          location: iface.location,
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

    // Top-level var/const exports
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // var Name = ... or const Name = ...
      const varMatch = trimmed.match(/^(?:var|const)\s+([A-Z]\w*)\s/);
      if (varMatch) {
        const name = varMatch[1];
        if (!exports.some(e => e.name === name)) {
          exports.push({
            name,
            kind: 'variable',
            isDefault: false,
            location: { line: i + 1, column: lines[i].indexOf(name) + 1 },
          });
        }
      }

      // Block var/const: var ( ... ) or const ( ... )
      if (trimmed.match(/^(?:var|const)\s*\(\s*$/)) {
        let j = i + 1;
        while (j < lines.length) {
          const inner = lines[j].trim();
          if (inner === ')') break;
          if (inner === '' || inner.startsWith('//')) { j++; continue; }

          const blockVarMatch = inner.match(/^([A-Z]\w*)\s/);
          if (blockVarMatch) {
            const name = blockVarMatch[1];
            if (!exports.some(e => e.name === name)) {
              exports.push({
                name,
                kind: 'variable',
                isDefault: false,
                location: { line: j + 1, column: lines[j].indexOf(name) + 1 },
              });
            }
          }
          j++;
        }
      }
    }

    return exports;
  }

  /**
   * Count comma-separated arguments starting after the opening '(' at position `start`.
   * Tracks parenthesis depth so nested calls like `f(g(x), y)` count as 2.
   * Returns 0 for empty argument lists `()`.
   */
  private countArguments(text: string, start: number): number {
    let depth = 1;
    let count = 0;
    let hasContent = false;

    for (let i = start; i < text.length && depth > 0; i++) {
      const ch = text[i];
      if (ch === '(') { depth++; }
      else if (ch === ')') { depth--; }
      else if (ch === ',' && depth === 1) { count++; }

      if (depth > 0 && ch !== ' ' && ch !== '\t') hasContent = true;
    }

    return hasContent ? count + 1 : 0;
  }

  private findClosingBrace(lines: string[], startLine: number): number {
    let depth = 0;
    let found = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];

        // Skip // line comments
        if (ch === '/' && line[c + 1] === '/') break;

        // Skip /* ... */ block comments
        if (ch === '/' && line[c + 1] === '*') {
          c += 2;
          while (c < line.length) {
            if (line[c] === '*' && line[c + 1] === '/') { c++; break; }
            c++;
          }
          if (c >= line.length) {
            // Block comment spans multiple lines — find the closing */
            i++;
            while (i < lines.length) {
              const closeIdx = lines[i].indexOf('*/');
              if (closeIdx >= 0) {
                // Scan remainder of closing line for braces
                const remainder = lines[i].slice(closeIdx + 2);
                for (let r = 0; r < remainder.length; r++) {
                  if (remainder[r] === '{') { depth++; found = true; }
                  else if (remainder[r] === '}') {
                    depth--;
                    if (found && depth === 0) return i;
                  }
                }
                break;
              }
              i++;
            }
          }
          continue;
        }

        // Skip "..." string literals
        if (ch === '"') {
          c++;
          while (c < line.length && line[c] !== '"') {
            if (line[c] === '\\') c++; // skip escaped char
            c++;
          }
          continue;
        }

        // Skip `...` raw string literals
        if (ch === '`') {
          c++;
          while (c < line.length && line[c] !== '`') c++;
          if (c >= line.length) {
            // Raw string spans multiple lines
            i++;
            while (i < lines.length) {
              const idx = lines[i].indexOf('`');
              if (idx >= 0) { c = idx; break; }
              i++;
            }
          }
          continue;
        }

        if (ch === '{') {
          depth++;
          found = true;
        } else if (ch === '}') {
          depth--;
          if (found && depth === 0) return i;
        }
      }
    }

    return startLine;
  }
}
