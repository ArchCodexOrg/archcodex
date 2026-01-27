/**
 * @arch archcodex.infra.validator
 *
 * Python validator using regex-based parsing for AST analysis.
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
import { PYTHON_CAPABILITIES } from './capabilities.js';
import { readFile } from '../utils/file-system.js';

/**
 * Python validator using regex-based line-by-line parsing.
 * Produces SemanticModel for language-agnostic constraint validation.
 */
export class PythonValidator implements ILanguageValidator {
  readonly supportedLanguages: SupportedLanguage[] = ['python'];
  readonly supportedExtensions = ['.py'];
  readonly capabilities: LanguageCapabilities = PYTHON_CAPABILITIES;

  async parseFile(filePath: string, content?: string): Promise<SemanticModel> {
    const fileContent = content ?? await readFile(filePath);
    const extension = path.extname(filePath);
    const lines = fileContent.split('\n');

    const imports = this.extractImports(lines);
    const { classes, interfaces } = this.extractClassesAndInterfaces(lines);
    const functions = this.extractFunctions(lines);
    const functionCalls = this.extractFunctionCalls(lines);
    const mutations = this.extractMutations(lines);
    const exports = this.extractExports(lines, classes, functions);

    return {
      filePath,
      fileName: path.basename(filePath),
      extension,
      content: fileContent,
      lineCount: this.calculateLineCount(lines),
      locCount: this.calculateLoc(lines),
      language: 'python',
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
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      return lines.length - 1;
    }
    return lines.length;
  }

  private calculateLoc(lines: string[]): number {
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

      // Check for standalone triple-quote docstrings/comments
      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        multilineQuote = trimmed.slice(0, 3);
        // Check if it closes on the same line (after the opening)
        const rest = trimmed.slice(3);
        if (!rest.includes(multilineQuote)) {
          inMultilineString = true;
        }
        continue;
      }

      // Skip single-line comments
      if (trimmed.startsWith('#')) continue;

      loc++;
    }

    return loc;
  }

  private extractImports(lines: string[]): ImportInfo[] {
    const imports: ImportInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      // import module
      // import module as alias
      const importMatch = trimmed.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?$/);
      if (importMatch) {
        imports.push({
          moduleSpecifier: importMatch[1],
          defaultImport: importMatch[2] || importMatch[1],
          location: { line: lineNum, column: line.indexOf('import') + 1 },
          rawText: trimmed,
        });
        continue;
      }

      // from module import name1, name2
      // from module import (name1, name2)
      // from .relative import name
      const fromMatch = trimmed.match(/^from\s+(\.{0,3}[\w.]*)\s+import\s+(.+)$/);
      if (fromMatch) {
        let namesStr = fromMatch[2].trim();

        // Handle multi-line imports: from x import (
        if (namesStr.startsWith('(') && !namesStr.includes(')')) {
          let j = i + 1;
          while (j < lines.length && !lines[j].includes(')')) {
            namesStr += ' ' + lines[j].trim();
            j++;
          }
          if (j < lines.length) {
            namesStr += ' ' + lines[j].trim();
          }
        }

        // Clean up parentheses
        namesStr = namesStr.replace(/[()]/g, '').trim();

        if (namesStr === '*') {
          imports.push({
            moduleSpecifier: fromMatch[1],
            isDynamic: false,
            location: { line: lineNum, column: line.indexOf('from') + 1 },
            rawText: trimmed,
          });
        } else {
          const names = namesStr.split(',').map(n => {
            const parts = n.trim().split(/\s+as\s+/);
            return parts[0].trim();
          }).filter(n => n.length > 0);

          imports.push({
            moduleSpecifier: fromMatch[1],
            namedImports: names,
            location: { line: lineNum, column: line.indexOf('from') + 1 },
            rawText: trimmed,
          });
        }
        continue;
      }
    }

    return imports;
  }

  private extractClassesAndInterfaces(lines: string[]): {
    classes: ClassInfo[];
    interfaces: InterfaceInfo[];
  } {
    const classes: ClassInfo[] = [];
    const interfaces: InterfaceInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      // class ClassName(Base1, Base2):
      const classMatch = trimmed.match(/^class\s+(\w+)(?:\((.*?)\))?\s*:/);
      if (!classMatch) continue;

      // Collect decorators above the class
      const decorators: DecoratorInfo[] = [];
      let decoratorIdx = i - 1;
      while (decoratorIdx >= 0 && lines[decoratorIdx].trim().startsWith('@')) {
        const decLine = lines[decoratorIdx].trim();
        const decMatch = decLine.match(/^@([\w.]+)(?:\((.*)?\))?$/);
        if (decMatch) {
          decorators.unshift({
            name: decMatch[1],
            arguments: decMatch[2] ? [decMatch[2]] : undefined,
            location: { line: decoratorIdx + 1, column: lines[decoratorIdx].indexOf('@') + 1 },
            rawText: decLine,
          });
        }
        decoratorIdx--;
      }

      const className = classMatch[1];
      const basesStr = classMatch[2] || '';
      const bases = basesStr
        .split(',')
        .map(b => b.trim())
        .filter(b => b.length > 0 && b !== 'object');

      const abcBases = ['ABC', 'ABCMeta'];
      const protocolBases = ['Protocol'];
      const isInterface = bases.some(b =>
        abcBases.includes(b) || protocolBases.includes(b)
      );
      const isAbstract = isInterface || bases.some(b => abcBases.includes(b));

      const classIndent = line.search(/\S/);
      const methods = this.extractMethods(lines, i + 1, classIndent);

      const isExported = !className.startsWith('_');

      const extendsBase = bases.find(b =>
        !abcBases.includes(b) && !protocolBases.includes(b) && b !== 'metaclass=ABCMeta'
      );

      const implementsList = bases.filter(b =>
        !abcBases.includes(b) && !protocolBases.includes(b) &&
        b !== 'metaclass=ABCMeta' && b !== extendsBase
      );

      const location: SourceLocation = {
        line: lineNum,
        column: line.indexOf('class') + 1,
      };

      if (isInterface) {
        interfaces.push({
          name: className,
          isExported,
          extends: bases.filter(b => protocolBases.includes(b) || abcBases.includes(b)),
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

  private extractMethods(lines: string[], startLine: number, classIndent: number): MethodInfo[] {
    const methods: MethodInfo[] = [];

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Stop if we've left the class body (non-empty line at or below class indent)
      if (trimmed.length > 0 && !trimmed.startsWith('#')) {
        const currentIndent = line.search(/\S/);
        if (currentIndent >= 0 && currentIndent <= classIndent) break;
      }

      // def method_name(self, ...):
      const defMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\((.*?)\)\s*(?:->.*?)?\s*:/);
      if (!defMatch) continue;

      const methodName = defMatch[1];
      const paramsStr = defMatch[2];

      // Parse parameters (exclude self/cls)
      const params = paramsStr
        .split(',')
        .map(p => p.trim().split(':')[0].split('=')[0].trim())
        .filter(p => p.length > 0 && p !== 'self' && p !== 'cls');

      let visibility: Visibility = 'public';
      if (methodName.startsWith('__') && !methodName.endsWith('__')) {
        visibility = 'private';
      } else if (methodName.startsWith('_') && !methodName.startsWith('__')) {
        visibility = 'protected';
      }

      // Collect decorators above
      let isStatic = false;
      let isAbstract = false;
      const methodDecorators: DecoratorInfo[] = [];
      let j = i - 1;
      while (j >= startLine && lines[j].trim().startsWith('@')) {
        const decLine = lines[j].trim();
        const decMatch = decLine.match(/^@([\w.]+)(?:\((.*)?\))?$/);
        if (decMatch) {
          const decName = decMatch[1];
          if (decName === 'staticmethod') isStatic = true;
          if (decName === 'abstractmethod') isAbstract = true;
          methodDecorators.unshift({
            name: decName,
            arguments: decMatch[2] ? [decMatch[2]] : undefined,
            location: { line: j + 1, column: lines[j].indexOf('@') + 1 },
            rawText: decLine,
          });
        }
        j--;
      }

      // Find end of method
      const methodIndent = line.search(/\S/);
      let endLine = i + 1;
      for (let k = i + 1; k < lines.length; k++) {
        const kTrimmed = lines[k].trim();
        if (kTrimmed.length === 0) continue;
        const kIndent = lines[k].search(/\S/);
        if (kIndent <= methodIndent) break;
        endLine = k + 1;
      }

      const returnTypeMatch = trimmed.match(/->\s*(.+?)\s*:/);

      methods.push({
        name: methodName,
        visibility,
        isStatic,
        isAbstract,
        decorators: methodDecorators,
        parameterCount: params.length,
        returnType: returnTypeMatch ? returnTypeMatch[1] : undefined,
        location: { line: i + 1, column: line.indexOf('def') + 1 },
        startLine: i + 1,
        endLine,
      });
    }

    return methods;
  }

  private extractFunctions(lines: string[]): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Only top-level functions (no leading whitespace)
      if (line.length > 0 && line[0] === ' ') continue;
      if (line.length > 0 && line[0] === '\t') continue;

      const isAsync = trimmed.startsWith('async ');
      const defMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\((.*?)\)\s*(?:->.*?)?\s*:/);
      if (!defMatch) continue;

      const funcName = defMatch[1];
      const paramsStr = defMatch[2];
      const params = paramsStr
        .split(',')
        .map(p => p.trim().split(':')[0].split('=')[0].trim())
        .filter(p => p.length > 0);

      let visibility: Visibility = 'public';
      if (funcName.startsWith('__') && !funcName.endsWith('__')) {
        visibility = 'private';
      } else if (funcName.startsWith('_') && !funcName.startsWith('__')) {
        visibility = 'protected';
      }

      const decorators: DecoratorInfo[] = [];
      let j = i - 1;
      while (j >= 0 && lines[j].trim().startsWith('@')) {
        const decLine = lines[j].trim();
        const decMatch = decLine.match(/^@([\w.]+)(?:\((.*)?\))?$/);
        if (decMatch) {
          decorators.unshift({
            name: decMatch[1],
            arguments: decMatch[2] ? [decMatch[2]] : undefined,
            location: { line: j + 1, column: lines[j].indexOf('@') + 1 },
            rawText: decLine,
          });
        }
        j--;
      }

      let endLine = i + 1;
      for (let k = i + 1; k < lines.length; k++) {
        const kTrimmed = lines[k].trim();
        if (kTrimmed.length === 0) continue;
        const kIndent = lines[k].search(/\S/);
        if (kIndent === 0) break;
        endLine = k + 1;
      }

      const returnTypeMatch = trimmed.match(/->\s*(.+?)\s*:/);

      functions.push({
        name: funcName,
        isExported: !funcName.startsWith('_'),
        isAsync,
        visibility,
        decorators,
        parameterCount: params.length,
        returnType: returnTypeMatch ? returnTypeMatch[1] : undefined,
        location: { line: i + 1, column: 1 },
        startLine: i + 1,
        endLine,
      });
    }

    return functions;
  }

  private extractFunctionCalls(lines: string[]): FunctionCallInfo[] {
    const calls: FunctionCallInfo[] = [];
    const callPattern = /(?:(\w[\w.]*?)\.)?(\w+)\s*\(/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments, imports, and definitions
      if (trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) continue;
      if (trimmed.startsWith('def ') || trimmed.startsWith('async def ')) continue;
      if (trimmed.startsWith('class ')) continue;

      let match;
      callPattern.lastIndex = 0;
      while ((match = callPattern.exec(line)) !== null) {
        const receiver = match[1] || undefined;
        const methodName = match[2];
        const callee = receiver ? `${receiver}.${methodName}` : methodName;

        // Skip Python keywords that look like calls
        if (['if', 'elif', 'while', 'for', 'with', 'assert', 'except', 'return', 'yield', 'del'].includes(methodName) && !receiver) {
          continue;
        }

        const controlFlow = this.getControlFlowContext(lines, i);

        calls.push({
          callee,
          receiver,
          methodName,
          arguments: [],
          argumentCount: 0,
          location: { line: i + 1, column: match.index + 1 },
          rawText: callee + '(...)',
          controlFlow,
          isConstructorCall: /^[A-Z]/.test(methodName) && !receiver,
          isOptionalChain: false,
        });
      }
    }

    return calls;
  }

  private getControlFlowContext(lines: string[], lineIndex: number): ControlFlowContext {
    const context: ControlFlowContext = {
      inTryBlock: false,
      inCatchBlock: false,
      inFinallyBlock: false,
      tryDepth: 0,
    };

    const currentIndent = lines[lineIndex].search(/\S/);
    if (currentIndent < 0) return context;

    for (let i = lineIndex - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      const indent = lines[i].search(/\S/);
      if (indent < 0) continue;
      if (indent >= currentIndent) continue;

      if (trimmed.startsWith('try:')) {
        context.inTryBlock = true;
        context.tryDepth++;
        break;
      }
      if (trimmed.startsWith('except') && trimmed.endsWith(':')) {
        context.inCatchBlock = true;
        break;
      }
      if (trimmed.startsWith('finally:')) {
        context.inFinallyBlock = true;
        break;
      }
    }

    return context;
  }

  private extractMutations(lines: string[]): MutationInfo[] {
    const mutations: MutationInfo[] = [];
    const assignmentPattern = /^(\w[\w.[\]'"]*)\s*(=|\+=|-=|\*=|\/=|%=|\*\*=|&=|\|=|\^=|<<=|>>=)\s+/;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) continue;
      if (trimmed.startsWith('def ') || trimmed.startsWith('class ')) continue;

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

    // del statements
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const delMatch = trimmed.match(/^del\s+([\w.[\]'"]+)/);
      if (delMatch && delMatch[1].includes('.')) {
        const target = delMatch[1];
        const parts = target.split('.');
        mutations.push({
          target,
          rootObject: parts[0],
          propertyPath: parts.slice(1),
          operator: 'delete',
          location: { line: i + 1, column: lines[i].indexOf('del') + 1 },
          rawText: trimmed,
          isDelete: true,
        });
      }
    }

    return mutations;
  }

  private extractExports(
    lines: string[],
    classes: ClassInfo[],
    functions: FunctionInfo[]
  ): ExportInfo[] {
    const exports: ExportInfo[] = [];

    // Check for __all__ definition
    let allList: string[] | null = null;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const allMatch = trimmed.match(/^__all__\s*=\s*\[(.+?)\]/);
      if (allMatch) {
        allList = allMatch[1]
          .split(',')
          .map(s => s.trim().replace(/['"]/g, ''))
          .filter(s => s.length > 0);
        break;
      }

      // Multi-line __all__
      if (trimmed.startsWith('__all__') && trimmed.includes('[') && !trimmed.includes(']')) {
        let content = trimmed.replace(/^__all__\s*=\s*\[/, '');
        let j = i + 1;
        while (j < lines.length && !lines[j].includes(']')) {
          content += ' ' + lines[j].trim();
          j++;
        }
        if (j < lines.length) {
          content += ' ' + lines[j].trim().replace(']', '');
        }
        allList = content
          .split(',')
          .map(s => s.trim().replace(/['"]/g, ''))
          .filter(s => s.length > 0);
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
}
