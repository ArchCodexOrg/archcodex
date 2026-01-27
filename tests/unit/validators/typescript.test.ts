/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for TypeScript/JavaScript validator.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TypeScriptValidator } from '../../../src/validators/typescript.js';

// Mock file system
vi.mock('../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
}));

import { readFile } from '../../../src/utils/file-system.js';

describe('TypeScriptValidator', () => {
  let validator: TypeScriptValidator;

  beforeEach(() => {
    validator = new TypeScriptValidator('/test/project');
    vi.clearAllMocks();
  });

  afterEach(() => {
    validator.dispose();
  });

  describe('supportedLanguages', () => {
    it('should support typescript and javascript', () => {
      expect(validator.supportedLanguages).toContain('typescript');
      expect(validator.supportedLanguages).toContain('javascript');
    });
  });

  describe('supportedExtensions', () => {
    it('should support .ts, .tsx, .js, .jsx', () => {
      expect(validator.supportedExtensions).toContain('.ts');
      expect(validator.supportedExtensions).toContain('.tsx');
      expect(validator.supportedExtensions).toContain('.js');
      expect(validator.supportedExtensions).toContain('.jsx');
    });
  });

  describe('parseFile', () => {
    it('should parse basic TypeScript file', async () => {
      const content = `
        const x = 1;
        function foo() { return x; }
      `;
      vi.mocked(readFile).mockResolvedValue(content);

      const result = await validator.parseFile('/test/file.ts');

      expect(result.filePath).toBe('/test/file.ts');
      expect(result.fileName).toBe('file.ts');
      expect(result.extension).toBe('.ts');
      expect(result.language).toBe('typescript');
      expect(result.functions.length).toBeGreaterThan(0);
    });

    it('should parse JavaScript file', async () => {
      const content = `function greet(name) { console.log('Hello', name); }`;
      vi.mocked(readFile).mockResolvedValue(content);

      const result = await validator.parseFile('/test/file.js');

      expect(result.language).toBe('javascript');
      expect(result.functions.length).toBe(1);
      expect(result.functions[0].name).toBe('greet');
    });

    it('should use provided content instead of reading file', async () => {
      const content = `export const value = 42;`;

      const result = await validator.parseFile('/test/file.ts', content);

      expect(vi.mocked(readFile)).not.toHaveBeenCalled();
      expect(result.content).toBe(content);
    });

    it('should calculate line count correctly', async () => {
      const content = `line1
line2
line3`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.lineCount).toBe(3);
    });

    it('should handle trailing newline correctly', async () => {
      const content = `line1
line2
`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.lineCount).toBe(2);
    });

    it('should handle empty file', async () => {
      const result = await validator.parseFile('/test/file.ts', '');

      expect(result.lineCount).toBe(0);
      expect(result.locCount).toBe(0);
    });
  });

  describe('imports extraction', () => {
    it('should extract default imports', async () => {
      const content = `import axios from 'axios';`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].moduleSpecifier).toBe('axios');
      expect(result.imports[0].defaultImport).toBe('axios');
    });

    it('should extract named imports', async () => {
      const content = `import { useState, useEffect } from 'react';`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].moduleSpecifier).toBe('react');
      expect(result.imports[0].namedImports).toContain('useState');
      expect(result.imports[0].namedImports).toContain('useEffect');
    });

    it('should extract type-only imports', async () => {
      const content = `import type { User } from './types';`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].isTypeOnly).toBe(true);
    });

    it('should extract dynamic imports', async () => {
      const content = `const module = await import('dynamic-module');`;
      const result = await validator.parseFile('/test/file.ts', content);

      const dynamicImport = result.imports.find(i => i.isDynamic);
      expect(dynamicImport).toBeDefined();
      expect(dynamicImport?.moduleSpecifier).toBe('dynamic-module');
    });

    it('should extract require statements', async () => {
      const content = `const fs = require('fs');`;
      const result = await validator.parseFile('/test/file.ts', content);

      const requireImport = result.imports.find(i => i.isDynamic);
      expect(requireImport).toBeDefined();
      expect(requireImport?.moduleSpecifier).toBe('fs');
    });
  });

  describe('function extraction', () => {
    it('should extract function declarations', async () => {
      const content = `
        export function myFunc() { return 1; }
        function privateFunc() { return 2; }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.functions).toHaveLength(2);
      const myFunc = result.functions.find(f => f.name === 'myFunc');
      expect(myFunc?.isExported).toBe(true);
    });

    it('should extract async functions', async () => {
      const content = `export async function fetchData() { return []; }`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.functions[0].isAsync).toBe(true);
    });

    it('should extract generator functions', async () => {
      const content = `function* generator() { yield 1; }`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.functions[0].isGenerator).toBe(true);
    });

    it('should extract arrow functions assigned to variables', async () => {
      const content = `export const arrowFunc = () => { return 42; };`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('arrowFunc');
    });

    it('should extract function parameter count', async () => {
      const content = `function sum(a, b, c) { return a + b + c; }`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.functions[0].parameterCount).toBe(3);
    });

    it('should extract function intents from JSDoc', async () => {
      const content = `
        /** @intent:cli-output */
        function print() { console.log('hi'); }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.functions[0].intents).toContain('cli-output');
    });
  });

  describe('class extraction', () => {
    it('should extract class declarations', async () => {
      const content = `
        export class MyService {
          private value: number;
          getValue() { return this.value; }
        }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('MyService');
      expect(result.classes[0].isExported).toBe(true);
    });

    it('should extract class inheritance', async () => {
      const content = `
        class BaseClass {}
        class ChildClass extends BaseClass {}
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      const childClass = result.classes.find(c => c.name === 'ChildClass');
      expect(childClass?.extends).toBe('BaseClass');
      expect(childClass?.inheritanceChain).toContain('BaseClass');
    });

    it('should extract implemented interfaces', async () => {
      const content = `
        interface IDisposable { dispose(): void; }
        class Resource implements IDisposable { dispose() {} }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      const resourceClass = result.classes.find(c => c.name === 'Resource');
      expect(resourceClass?.implements).toContain('IDisposable');
    });

    it('should extract abstract classes', async () => {
      const content = `abstract class AbstractBase { abstract method(): void; }`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.classes[0].isAbstract).toBe(true);
    });

    it('should extract class decorators', async () => {
      const content = `
        @Injectable()
        @Component({ selector: 'app' })
        class MyComponent {}
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.classes[0].decorators).toHaveLength(2);
      expect(result.classes[0].decorators.map(d => d.name)).toContain('Injectable');
      expect(result.classes[0].decorators.map(d => d.name)).toContain('Component');
    });
  });

  describe('method extraction', () => {
    it('should extract method visibility', async () => {
      const content = `
        class Service {
          public publicMethod() {}
          private privateMethod() {}
          protected protectedMethod() {}
        }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      const methods = result.classes[0].methods;
      expect(methods.find(m => m.name === 'publicMethod')?.visibility).toBe('public');
      expect(methods.find(m => m.name === 'privateMethod')?.visibility).toBe('private');
      expect(methods.find(m => m.name === 'protectedMethod')?.visibility).toBe('protected');
    });

    it('should extract static methods', async () => {
      const content = `
        class Utils {
          static format(val: string) { return val; }
        }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.classes[0].methods[0].isStatic).toBe(true);
    });

    it('should extract abstract methods', async () => {
      const content = `
        abstract class Base {
          abstract process(): void;
        }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.classes[0].methods[0].isAbstract).toBe(true);
    });

    it('should extract method intents from JSDoc', async () => {
      const content = `
        class Service {
          /** @intent:admin-only */
          deleteUser(id: string) {}
        }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.classes[0].methods[0].intents).toContain('admin-only');
    });
  });

  describe('interface extraction', () => {
    it('should extract interface declarations', async () => {
      const content = `export interface User { name: string; age: number; }`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.interfaces).toHaveLength(1);
      expect(result.interfaces[0].name).toBe('User');
      expect(result.interfaces[0].isExported).toBe(true);
    });

    it('should extract interface extends', async () => {
      const content = `
        interface Base { id: string; }
        interface Extended extends Base { name: string; }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      const extended = result.interfaces.find(i => i.name === 'Extended');
      expect(extended?.extends).toContain('Base');
    });
  });

  describe('function calls extraction', () => {
    it('should extract simple function calls', async () => {
      const content = `console.log('hello');`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.functionCalls.length).toBeGreaterThan(0);
      const logCall = result.functionCalls.find(c => c.methodName === 'log');
      expect(logCall?.receiver).toBe('console');
    });

    it('should extract method chains', async () => {
      const content = `axios.get('/api').then(res => res.data);`;
      const result = await validator.parseFile('/test/file.ts', content);

      const getCall = result.functionCalls.find(c => c.methodName === 'get');
      expect(getCall?.receiver).toBe('axios');
    });

    it('should extract constructor calls', async () => {
      const content = `const date = new Date();`;
      const result = await validator.parseFile('/test/file.ts', content);

      const newCall = result.functionCalls.find(c => c.isConstructorCall);
      expect(newCall?.callee).toBe('Date');
    });

    it('should extract optional chain calls', async () => {
      const content = `user?.getName?.();`;
      const result = await validator.parseFile('/test/file.ts', content);

      const optionalCall = result.functionCalls.find(c => c.isOptionalChain);
      expect(optionalCall).toBeDefined();
    });

    it('should track parent function of calls', async () => {
      const content = `
        function outer() {
          console.log('inside outer');
        }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      const logCall = result.functionCalls.find(c => c.methodName === 'log');
      expect(logCall?.parentFunction).toBe('outer');
    });

    it('should track control flow context', async () => {
      const content = `
        try {
          riskyOperation();
        } catch (e) {
          console.error(e);
        }
      `;
      const result = await validator.parseFile('/test/file.ts', content);

      const riskyCall = result.functionCalls.find(c => c.callee === 'riskyOperation');
      expect(riskyCall?.controlFlow.inTryBlock).toBe(true);

      const errorCall = result.functionCalls.find(c => c.methodName === 'error');
      expect(errorCall?.controlFlow.inCatchBlock).toBe(true);
    });
  });

  describe('mutations extraction', () => {
    it('should extract property assignments', async () => {
      const content = `obj.value = 42;`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.mutations).toHaveLength(1);
      expect(result.mutations[0].target).toBe('obj.value');
      expect(result.mutations[0].operator).toBe('=');
    });

    it('should extract compound assignments', async () => {
      const content = `obj.count += 1;`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.mutations[0].operator).toBe('+=');
    });

    it('should extract delete operations', async () => {
      const content = `delete obj.property;`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.mutations[0].isDelete).toBe(true);
      expect(result.mutations[0].operator).toBe('delete');
    });

    it('should extract increment/decrement operations', async () => {
      const content = `obj.count++;`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.mutations[0].operator).toBe('++');
    });

    it('should not track simple variable assignments', async () => {
      const content = `let x = 1; x = 2;`;
      const result = await validator.parseFile('/test/file.ts', content);

      // Simple variable assignments are not tracked as mutations
      expect(result.mutations).toHaveLength(0);
    });
  });

  describe('exports extraction', () => {
    it('should extract exported functions', async () => {
      const content = `export function helper() {}`;
      const result = await validator.parseFile('/test/file.ts', content);

      const funcExport = result.exports.find(e => e.name === 'helper');
      expect(funcExport?.kind).toBe('function');
    });

    it('should extract exported classes', async () => {
      const content = `export class Service {}`;
      const result = await validator.parseFile('/test/file.ts', content);

      const classExport = result.exports.find(e => e.name === 'Service');
      expect(classExport?.kind).toBe('class');
    });

    it('should extract exported interfaces', async () => {
      const content = `export interface Options {}`;
      const result = await validator.parseFile('/test/file.ts', content);

      const ifaceExport = result.exports.find(e => e.name === 'Options');
      expect(ifaceExport?.kind).toBe('interface');
    });

    it('should extract exported type aliases', async () => {
      const content = `export type ID = string;`;
      const result = await validator.parseFile('/test/file.ts', content);

      const typeExport = result.exports.find(e => e.name === 'ID');
      expect(typeExport?.kind).toBe('type');
    });

    it('should extract exported variables', async () => {
      const content = `export const VERSION = '1.0.0';`;
      const result = await validator.parseFile('/test/file.ts', content);

      const varExport = result.exports.find(e => e.name === 'VERSION');
      expect(varExport?.kind).toBe('variable');
    });

    it('should extract default exports', async () => {
      const content = `export default function main() {}`;
      const result = await validator.parseFile('/test/file.ts', content);

      const defaultExport = result.exports.find(e => e.isDefault);
      expect(defaultExport).toBeDefined();
    });

    it('should extract re-exports', async () => {
      const content = `export { foo, bar } from './module';`;
      const result = await validator.parseFile('/test/file.ts', content);

      const reExports = result.exports.filter(e => e.kind === 're-export');
      expect(reExports.length).toBeGreaterThan(0);
    });

    it('should extract wildcard re-exports', async () => {
      const content = `export * from './module';`;
      const result = await validator.parseFile('/test/file.ts', content);

      const wildcardExport = result.exports.find(e => e.name === '*');
      expect(wildcardExport?.kind).toBe('re-export');
    });
  });

  describe('LOC calculation', () => {
    it('should count lines of code excluding comments', async () => {
      const content = `
// Comment
const x = 1;
/* Block comment */
const y = 2;
`;
      const result = await validator.parseFile('/test/file.ts', content);

      // Should count 'const x = 1;' and 'const y = 2;'
      expect(result.locCount).toBe(2);
    });

    it('should handle multi-line block comments', async () => {
      const content = `
/*
 * Multi-line
 * block comment
 */
const x = 1;
`;
      const result = await validator.parseFile('/test/file.ts', content);

      expect(result.locCount).toBe(1);
    });

    it('should count code after block comment ends', async () => {
      const content = `/* comment */ const x = 1;`;
      const result = await validator.parseFile('/test/file.ts', content);

      // This is still a comment line followed by code
      expect(result.locCount).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should clear caches and source files', async () => {
      // Parse a file to populate caches
      await validator.parseFile('/test/file.ts', `class Foo {}`);

      // Dispose should not throw
      expect(() => validator.dispose()).not.toThrow();

      // Can create new validator after dispose
      const newValidator = new TypeScriptValidator();
      expect(newValidator).toBeDefined();
      newValidator.dispose();
    });
  });
});
