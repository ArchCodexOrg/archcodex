/**
 * @arch archcodex.test.unit
 */
/**
 * Tests for Python validator.
 */
import { describe, it, expect } from 'vitest';
import { PythonValidator } from '../../../src/validators/python.js';

const validator = new PythonValidator();

async function parse(content: string) {
  return validator.parseFile('/test/example.py', content);
}

describe('PythonValidator', () => {
  describe('metadata', () => {
    it('has correct supported languages and extensions', () => {
      expect(validator.supportedLanguages).toEqual(['python']);
      expect(validator.supportedExtensions).toEqual(['.py']);
    });
  });

  describe('parseFile basics', () => {
    it('returns correct file metadata', async () => {
      const model = await parse('x = 1\n');
      expect(model.filePath).toBe('/test/example.py');
      expect(model.fileName).toBe('example.py');
      expect(model.extension).toBe('.py');
      expect(model.language).toBe('python');
    });

    it('calculates line count correctly', async () => {
      const model = await parse('a = 1\nb = 2\nc = 3\n');
      expect(model.lineCount).toBe(3);
    });

    it('calculates LOC excluding comments and blanks', async () => {
      const content = [
        '# comment',
        '',
        'x = 1',
        '"""docstring"""',
        'y = 2',
        '',
      ].join('\n');
      const model = await parse(content);
      expect(model.locCount).toBe(2);
    });

    it('handles multiline docstrings in LOC', async () => {
      const content = [
        '"""',
        'Multi-line',
        'docstring',
        '"""',
        'x = 1',
      ].join('\n');
      const model = await parse(content);
      expect(model.locCount).toBe(1);
    });
  });

  describe('imports', () => {
    it('extracts simple import', async () => {
      const model = await parse('import os\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('os');
      expect(model.imports[0].defaultImport).toBe('os');
    });

    it('extracts import with alias', async () => {
      const model = await parse('import numpy as np\n');
      expect(model.imports[0].moduleSpecifier).toBe('numpy');
      expect(model.imports[0].defaultImport).toBe('np');
    });

    it('extracts from import with named imports', async () => {
      const model = await parse('from os.path import join, exists\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('os.path');
      expect(model.imports[0].namedImports).toEqual(['join', 'exists']);
    });

    it('extracts from import with aliases', async () => {
      const model = await parse('from collections import OrderedDict as OD\n');
      expect(model.imports[0].namedImports).toEqual(['OrderedDict']);
    });

    it('extracts wildcard import', async () => {
      const model = await parse('from os import *\n');
      expect(model.imports[0].moduleSpecifier).toBe('os');
    });

    it('extracts relative imports', async () => {
      const model = await parse('from .module import helper\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('.module');
      expect(model.imports[0].namedImports).toEqual(['helper']);
    });

    it('extracts double-dot relative imports', async () => {
      const model = await parse('from ..package import Widget\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('..package');
      expect(model.imports[0].namedImports).toEqual(['Widget']);
    });

    it('extracts bare dot relative import', async () => {
      const model = await parse('from . import utils\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('.');
      expect(model.imports[0].namedImports).toEqual(['utils']);
    });

    it('extracts multi-line imports', async () => {
      const content = [
        'from os.path import (',
        '    join,',
        '    exists,',
        '    dirname',
        ')',
      ].join('\n');
      const model = await parse(content);
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('os.path');
      expect(model.imports[0].namedImports).toEqual(['join', 'exists', 'dirname']);
    });
  });

  describe('classes', () => {
    it('extracts simple class', async () => {
      const content = 'class MyClass:\n    pass\n';
      const model = await parse(content);
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('MyClass');
      expect(model.classes[0].isExported).toBe(true);
    });

    it('extracts class with base', async () => {
      const content = 'class Child(Parent):\n    pass\n';
      const model = await parse(content);
      expect(model.classes[0].extends).toBe('Parent');
      expect(model.classes[0].inheritanceChain).toEqual(['Child', 'Parent']);
    });

    it('marks _prefixed class as non-exported', async () => {
      const content = 'class _Internal:\n    pass\n';
      const model = await parse(content);
      expect(model.classes[0].isExported).toBe(false);
    });

    it('extracts class decorators', async () => {
      const content = '@dataclass\nclass Data:\n    x: int = 0\n';
      const model = await parse(content);
      expect(model.classes[0].decorators).toHaveLength(1);
      expect(model.classes[0].decorators[0].name).toBe('dataclass');
    });

    it('extracts class methods with visibility', async () => {
      const content = [
        'class Foo:',
        '    def public_method(self):',
        '        pass',
        '    def _protected_method(self):',
        '        pass',
        '    def __private_method(self):',
        '        pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods).toHaveLength(3);
      expect(model.classes[0].methods[0].visibility).toBe('public');
      expect(model.classes[0].methods[1].visibility).toBe('protected');
      expect(model.classes[0].methods[2].visibility).toBe('private');
    });

    it('detects static and abstract methods', async () => {
      const content = [
        'class Foo:',
        '    @staticmethod',
        '    def static_one():',
        '        pass',
        '    @abstractmethod',
        '    def abstract_one(self):',
        '        pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods[0].isStatic).toBe(true);
      expect(model.classes[0].methods[1].isAbstract).toBe(true);
    });

    it('counts method parameters excluding self/cls', async () => {
      const content = [
        'class Foo:',
        '    def method(self, a, b, c):',
        '        pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods[0].parameterCount).toBe(3);
    });
  });

  describe('interfaces (ABC/Protocol)', () => {
    it('detects ABC-based interface', async () => {
      const content = [
        'class MyInterface(ABC):',
        '    @abstractmethod',
        '    def do_something(self):',
        '        pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.interfaces).toHaveLength(1);
      expect(model.interfaces[0].name).toBe('MyInterface');
      expect(model.classes).toHaveLength(0);
    });

    it('detects Protocol-based interface', async () => {
      const content = 'class Readable(Protocol):\n    def read(self) -> bytes: ...\n';
      const model = await parse(content);
      expect(model.interfaces).toHaveLength(1);
      expect(model.interfaces[0].name).toBe('Readable');
    });
  });

  describe('functions', () => {
    it('extracts top-level function', async () => {
      const content = 'def greet(name: str) -> str:\n    return f"Hello {name}"\n';
      const model = await parse(content);
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].name).toBe('greet');
      expect(model.functions[0].parameterCount).toBe(1);
      expect(model.functions[0].returnType).toBe('str');
    });

    it('detects async functions', async () => {
      const content = 'async def fetch_data(url):\n    pass\n';
      const model = await parse(content);
      expect(model.functions[0].isAsync).toBe(true);
    });

    it('marks _prefixed functions as non-exported', async () => {
      const content = 'def _helper():\n    pass\n';
      const model = await parse(content);
      expect(model.functions[0].isExported).toBe(false);
      expect(model.functions[0].visibility).toBe('protected');
    });

    it('extracts function decorators', async () => {
      const content = '@app.route("/api")\ndef handler():\n    pass\n';
      const model = await parse(content);
      expect(model.functions[0].decorators).toHaveLength(1);
      expect(model.functions[0].decorators[0].name).toBe('app.route');
    });

    it('ignores indented (non-top-level) functions', async () => {
      const content = [
        'def outer():',
        '    def inner():',
        '        pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].name).toBe('outer');
    });
  });

  describe('function calls', () => {
    it('extracts function calls', async () => {
      const content = 'result = process(data)\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'process');
      expect(call).toBeDefined();
      expect(call!.callee).toBe('process');
    });

    it('extracts method calls with receiver', async () => {
      const content = 'obj.method(arg)\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'method');
      expect(call).toBeDefined();
      expect(call!.receiver).toBe('obj');
    });

    it('detects constructor calls (capitalized)', async () => {
      const content = 'x = MyClass()\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'MyClass');
      expect(call).toBeDefined();
      expect(call!.isConstructorCall).toBe(true);
    });

    it('detects try/except context', async () => {
      const content = [
        'try:',
        '    risky_call()',
        'except Exception:',
        '    handle_error()',
      ].join('\n');
      const model = await parse(content);
      const riskyCall = model.functionCalls.find(c => c.methodName === 'risky_call');
      expect(riskyCall!.controlFlow.inTryBlock).toBe(true);
      const handleCall = model.functionCalls.find(c => c.methodName === 'handle_error');
      expect(handleCall!.controlFlow.inCatchBlock).toBe(true);
    });
  });

  describe('mutations', () => {
    it('extracts property mutations', async () => {
      const content = 'self.value = 42\n';
      const model = await parse(content);
      expect(model.mutations).toHaveLength(1);
      expect(model.mutations[0].target).toBe('self.value');
      expect(model.mutations[0].rootObject).toBe('self');
      expect(model.mutations[0].operator).toBe('=');
    });

    it('extracts augmented assignment', async () => {
      const content = 'obj.count += 1\n';
      const model = await parse(content);
      expect(model.mutations[0].operator).toBe('+=');
    });

    it('extracts del statements', async () => {
      const content = 'del obj.attr\n';
      const model = await parse(content);
      expect(model.mutations).toHaveLength(1);
      expect(model.mutations[0].isDelete).toBe(true);
    });

    it('ignores simple variable assignments', async () => {
      const content = 'x = 1\n';
      const model = await parse(content);
      expect(model.mutations).toHaveLength(0);
    });
  });

  describe('exports', () => {
    it('uses __all__ when present', async () => {
      const content = [
        '__all__ = ["Foo", "bar"]',
        'class Foo:',
        '    pass',
        'def bar():',
        '    pass',
        'def _internal():',
        '    pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports).toHaveLength(2);
      expect(model.exports.map(e => e.name)).toEqual(['Foo', 'bar']);
    });

    it('exports all public names when no __all__', async () => {
      const content = [
        'class Public:',
        '    pass',
        'class _Private:',
        '    pass',
        'def public_func():',
        '    pass',
        'def _private_func():',
        '    pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports.map(e => e.name)).toEqual(['Public', 'public_func']);
    });

    it('handles multi-line __all__', async () => {
      const content = [
        '__all__ = [',
        '    "Alpha",',
        '    "Beta",',
        ']',
        'class Alpha:',
        '    pass',
        'class Beta:',
        '    pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports).toHaveLength(2);
      expect(model.exports.map(e => e.name)).toEqual(['Alpha', 'Beta']);
    });
  });

  describe('edge cases', () => {
    it('handles empty file', async () => {
      const model = await parse('');
      expect(model.lineCount).toBe(0);
      expect(model.locCount).toBe(0);
      expect(model.imports).toHaveLength(0);
      expect(model.classes).toHaveLength(0);
      expect(model.functions).toHaveLength(0);
    });

    it('does not bleed methods between consecutive classes', async () => {
      const content = [
        'class First:',
        '    def method_a(self):',
        '        pass',
        '@dataclass',
        'class Second:',
        '    def method_b(self):',
        '        pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes).toHaveLength(2);
      expect(model.classes[0].name).toBe('First');
      expect(model.classes[0].methods).toHaveLength(1);
      expect(model.classes[0].methods[0].name).toBe('method_a');
      expect(model.classes[1].name).toBe('Second');
      expect(model.classes[1].methods).toHaveLength(1);
      expect(model.classes[1].methods[0].name).toBe('method_b');
    });

    it('tracks print as a function call', async () => {
      const content = 'print("hello")\n';
      const model = await parse(content);
      const printCall = model.functionCalls.find(c => c.methodName === 'print');
      expect(printCall).toBeDefined();
    });

    it('handles nested classes (known limitation: inner methods included in outer)', async () => {
      const content = [
        'class Outer:',
        '    def outer_method(self):',
        '        pass',
        '    class Inner:',
        '        def inner_method(self):',
        '            pass',
      ].join('\n');
      const model = await parse(content);
      // Regex parser limitation: nested class methods are included in Outer's methods
      // because extractMethods scans all indented lines until dedent to class level.
      // Inner class is detected separately as its own class.
      const outer = model.classes.find(c => c.name === 'Outer');
      expect(outer).toBeDefined();
      expect(outer!.methods.some(m => m.name === 'outer_method')).toBe(true);
      // Known limitation: inner_method bleeds into Outer
      expect(outer!.methods.some(m => m.name === 'inner_method')).toBe(true);
      // Inner is also detected as a standalone class (indented, but matches pattern)
      // This is acceptable for constraint validation purposes
    });

    it('handles decorators with arguments on functions', async () => {
      const content = '@app.route("/api/users")\ndef list_users():\n    pass\n';
      const model = await parse(content);
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].decorators).toHaveLength(1);
      expect(model.functions[0].decorators[0].name).toBe('app.route');
      expect(model.functions[0].decorators[0].arguments).toEqual(['"/api/users"']);
    });

    it('does not false-positive on import/class/def keywords in strings', async () => {
      const content = [
        'x = "import os"',
        'y = "class Foo:"',
        'z = "def bar():"',
      ].join('\n');
      const model = await parse(content);
      // String content should not be parsed as real imports/classes/functions
      expect(model.imports).toHaveLength(0);
      expect(model.classes).toHaveLength(0);
      expect(model.functions).toHaveLength(0);
    });

    it('handles triple-dot relative imports', async () => {
      const model = await parse('from ...base import Config\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('...base');
      expect(model.imports[0].namedImports).toEqual(['Config']);
    });

    it('handles multi-line from imports with trailing comma', async () => {
      const content = [
        'from typing import (',
        '    List,',
        '    Dict,',
        '    Optional,',
        ')',
      ].join('\n');
      const model = await parse(content);
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('typing');
      expect(model.imports[0].namedImports).toEqual(['List', 'Dict', 'Optional']);
    });

    it('handles classes without parentheses', async () => {
      const content = 'class Simple:\n    x = 1\n';
      const model = await parse(content);
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('Simple');
      expect(model.classes[0].extends).toBeUndefined();
    });

    it('handles multiple base classes', async () => {
      const content = 'class Multi(Base, MixinA, MixinB):\n    pass\n';
      const model = await parse(content);
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].extends).toBe('Base');
      expect(model.classes[0].implements).toEqual(['MixinA', 'MixinB']);
    });

    it('handles function with type hints and defaults', async () => {
      const content = 'def create(name: str, age: int = 0, active: bool = True) -> dict:\n    pass\n';
      const model = await parse(content);
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].parameterCount).toBe(3);
      expect(model.functions[0].returnType).toBe('dict');
    });

    it('handles dunder methods as public', async () => {
      const content = [
        'class Foo:',
        '    def __init__(self):',
        '        pass',
        '    def __str__(self):',
        '        pass',
      ].join('\n');
      const model = await parse(content);
      // Dunder methods (__x__) are public, not private
      expect(model.classes[0].methods).toHaveLength(2);
      expect(model.classes[0].methods[0].visibility).toBe('public');
      expect(model.classes[0].methods[1].visibility).toBe('public');
    });

    it('handles finally block control flow', async () => {
      const content = [
        'try:',
        '    pass',
        'except Exception:',
        '    pass',
        'finally:',
        '    cleanup()',
      ].join('\n');
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'cleanup');
      expect(call).toBeDefined();
      expect(call!.controlFlow.inFinallyBlock).toBe(true);
    });

    it('handles file with only comments', async () => {
      const content = '# This is a comment\n# Another comment\n';
      const model = await parse(content);
      expect(model.lineCount).toBe(2);
      expect(model.locCount).toBe(0);
      expect(model.imports).toHaveLength(0);
      expect(model.classes).toHaveLength(0);
    });

    it('handles augmented assignments on nested properties', async () => {
      const content = 'self.stats.count += 1\n';
      const model = await parse(content);
      expect(model.mutations).toHaveLength(1);
      expect(model.mutations[0].target).toBe('self.stats.count');
      expect(model.mutations[0].rootObject).toBe('self');
      expect(model.mutations[0].propertyPath).toEqual(['stats', 'count']);
    });

    it('handles classmethod decorator', async () => {
      const content = [
        'class Foo:',
        '    @classmethod',
        '    def from_dict(cls, data):',
        '        pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods).toHaveLength(1);
      expect(model.classes[0].methods[0].name).toBe('from_dict');
      expect(model.classes[0].methods[0].parameterCount).toBe(1); // cls excluded
    });

    it('handles chained method calls', async () => {
      const content = 'result = builder.add(x).build()\n';
      const model = await parse(content);
      const addCall = model.functionCalls.find(c => c.methodName === 'add');
      const buildCall = model.functionCalls.find(c => c.methodName === 'build');
      expect(addCall).toBeDefined();
      expect(addCall!.receiver).toBe('builder');
      expect(buildCall).toBeDefined();
    });

    it('exports interfaces from __all__', async () => {
      const content = [
        '__all__ = ["IService"]',
        'class IService(ABC):',
        '    @abstractmethod',
        '    def execute(self):',
        '        pass',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports).toHaveLength(1);
      expect(model.exports[0].name).toBe('IService');
    });
  });
});
