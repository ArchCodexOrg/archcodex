/**
 * @arch archcodex.test.unit
 *
 * Tests for Python AST extraction using tree-sitter.
 * Tests createPythonParser and extractPythonSemanticModel helper functions.
 */
import { describe, it, expect } from 'vitest';
import {
  createPythonParser,
  extractPythonSemanticModel,
} from '../../../../src/validators/tree-sitter/python-ast.js';

const parser = createPythonParser();

function extract(source: string) {
  return extractPythonSemanticModel(parser, source, '/test/example.py', 'example.py', '.py');
}

describe('createPythonParser', () => {
  it('should create a parser instance', () => {
    const p = createPythonParser();
    expect(p).toBeDefined();
  });

  it('should be able to parse Python source code', () => {
    const p = createPythonParser();
    const tree = p.parse('x = 1\n');
    expect(tree).toBeDefined();
    expect(tree.rootNode.type).toBe('module');
  });
});

describe('extractPythonSemanticModel', () => {
  describe('file metadata', () => {
    it('should return correct file metadata', () => {
      const model = extract('x = 1\n');
      expect(model.filePath).toBe('/test/example.py');
      expect(model.fileName).toBe('example.py');
      expect(model.extension).toBe('.py');
      expect(model.language).toBe('python');
    });

    it('should calculate line count correctly', () => {
      const model = extract('a = 1\nb = 2\nc = 3\n');
      expect(model.lineCount).toBe(3);
    });

    it('should handle trailing newline in line count', () => {
      const model = extract('x = 1\ny = 2\n');
      expect(model.lineCount).toBe(2);
    });

    it('should handle no trailing newline', () => {
      const model = extract('x = 1');
      expect(model.lineCount).toBe(1);
    });

    it('should calculate LOC excluding comments and blanks', () => {
      const source = [
        '# comment',
        '',
        'x = 1',
        '"""docstring"""',
        'y = 2',
        '',
      ].join('\n');
      const model = extract(source);
      expect(model.locCount).toBe(2);
    });

    it('should handle multiline docstrings in LOC', () => {
      const source = [
        '"""',
        'Multi-line',
        'docstring',
        '"""',
        'x = 1',
      ].join('\n');
      const model = extract(source);
      expect(model.locCount).toBe(1);
    });

    it('should handle single-quote multiline docstrings', () => {
      const source = [
        "'''",
        'Single-quote',
        'docstring',
        "'''",
        'x = 1',
      ].join('\n');
      const model = extract(source);
      expect(model.locCount).toBe(1);
    });

    it('should handle empty source', () => {
      const model = extract('');
      expect(model.lineCount).toBe(0);
      expect(model.locCount).toBe(0);
    });
  });

  describe('imports', () => {
    it('should extract simple import', () => {
      const model = extract('import os\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('os');
      expect(model.imports[0].defaultImport).toBe('os');
    });

    it('should extract import with alias', () => {
      const model = extract('import numpy as np\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('numpy');
      expect(model.imports[0].defaultImport).toBe('np');
    });

    it('should extract from import with named imports', () => {
      const model = extract('from os.path import join, exists\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('os.path');
      expect(model.imports[0].namedImports).toContain('join');
      expect(model.imports[0].namedImports).toContain('exists');
    });

    it('should extract wildcard import', () => {
      const model = extract('from os import *\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('os');
    });

    it('should extract relative imports', () => {
      const model = extract('from . import utils\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('.');
      expect(model.imports[0].namedImports).toContain('utils');
    });

    it('should extract dotted module imports', () => {
      const model = extract('import os.path\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('os.path');
    });
  });

  describe('classes', () => {
    it('should extract class declarations', () => {
      const source = `class User:
    def __init__(self, name):
        self.name = name
`;
      const model = extract(source);
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('User');
      expect(model.classes[0].isExported).toBe(true);
    });

    it('should mark private classes as unexported', () => {
      const source = `class _InternalHelper:
    pass
`;
      const model = extract(source);
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('_InternalHelper');
      expect(model.classes[0].isExported).toBe(false);
    });

    it('should extract class inheritance', () => {
      const source = `class Animal:
    pass

class Dog(Animal):
    pass
`;
      const model = extract(source);
      const dog = model.classes.find(c => c.name === 'Dog');
      expect(dog).toBeDefined();
      expect(dog!.extends).toBe('Animal');
      expect(dog!.inheritanceChain).toContain('Animal');
    });

    it('should extract multiple base classes', () => {
      const source = `class Serializable:
    pass

class Printable:
    pass

class Document(Serializable, Printable):
    pass
`;
      const model = extract(source);
      const doc = model.classes.find(c => c.name === 'Document');
      expect(doc).toBeDefined();
      // First base is extends, rest are implements
      expect(doc!.extends).toBe('Serializable');
      expect(doc!.implements).toContain('Printable');
    });

    it('should not include "object" as a base class', () => {
      const source = `class Base(object):
    pass
`;
      const model = extract(source);
      expect(model.classes[0].extends).toBeUndefined();
    });
  });

  describe('interfaces (ABC/Protocol)', () => {
    it('should classify ABC subclass as interface', () => {
      const source = `from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def area(self):
        pass
`;
      const model = extract(source);
      expect(model.interfaces).toHaveLength(1);
      expect(model.interfaces[0].name).toBe('Shape');
      expect(model.interfaces[0].isExported).toBe(true);
    });

    it('should classify Protocol subclass as interface', () => {
      const source = `from typing import Protocol

class Drawable(Protocol):
    def draw(self):
        ...
`;
      const model = extract(source);
      expect(model.interfaces).toHaveLength(1);
      expect(model.interfaces[0].name).toBe('Drawable');
    });
  });

  describe('methods', () => {
    it('should extract methods from classes', () => {
      const source = `class Service:
    def process(self, data):
        pass

    def validate(self, input):
        pass
`;
      const model = extract(source);
      expect(model.classes[0].methods).toHaveLength(2);
      const process = model.classes[0].methods.find(m => m.name === 'process');
      expect(process).toBeDefined();
    });

    it('should exclude self/cls from parameter count', () => {
      const source = `class Calculator:
    def add(self, a, b):
        return a + b

    @classmethod
    def create(cls, value):
        return cls(value)
`;
      const model = extract(source);
      const add = model.classes[0].methods.find(m => m.name === 'add');
      expect(add!.parameterCount).toBe(2);
      const create = model.classes[0].methods.find(m => m.name === 'create');
      expect(create!.parameterCount).toBe(1);
    });

    it('should set visibility based on name convention', () => {
      const source = `class Example:
    def public_method(self):
        pass

    def _protected_method(self):
        pass

    def __private_method(self):
        pass

    def __dunder__(self):
        pass
`;
      const model = extract(source);
      const methods = model.classes[0].methods;
      expect(methods.find(m => m.name === 'public_method')!.visibility).toBe('public');
      expect(methods.find(m => m.name === '_protected_method')!.visibility).toBe('protected');
      expect(methods.find(m => m.name === '__private_method')!.visibility).toBe('private');
      expect(methods.find(m => m.name === '__dunder__')!.visibility).toBe('public');
    });

    it('should detect static methods', () => {
      const source = `class Utils:
    @staticmethod
    def helper():
        pass
`;
      const model = extract(source);
      expect(model.classes[0].methods[0].isStatic).toBe(true);
    });

    it('should detect abstract methods', () => {
      const source = `from abc import ABC, abstractmethod

class Base(ABC):
    @abstractmethod
    def process(self):
        pass
`;
      const model = extract(source);
      const iface = model.interfaces.find(i => i.name === 'Base');
      expect(iface).toBeDefined();
      const processMethod = iface!.methods.find(m => m.name === 'process');
      expect(processMethod).toBeDefined();
      expect(processMethod!.isAbstract).toBe(true);
    });

    it('should include start and end lines', () => {
      const source = `class Svc:
    def method(self):
        x = 1
        y = 2
        return x + y
`;
      const model = extract(source);
      const method = model.classes[0].methods[0];
      expect(method.startLine).toBeDefined();
      expect(method.endLine).toBeDefined();
      expect(method.endLine!).toBeGreaterThan(method.startLine!);
    });
  });

  describe('decorators', () => {
    it('should extract class decorators', () => {
      const source = `from dataclasses import dataclass

@dataclass
class User:
    name: str
    age: int
`;
      const model = extract(source);
      const user = model.classes.find(c => c.name === 'User');
      expect(user).toBeDefined();
      expect(user!.decorators.length).toBeGreaterThanOrEqual(1);
      expect(user!.decorators.some(d => d.name === 'dataclass')).toBe(true);
    });

    it('should extract decorator arguments', () => {
      const source = `@app.route("/api")
def handler():
    pass
`;
      const model = extract(source);
      const handler = model.functions.find(f => f.name === 'handler');
      expect(handler).toBeDefined();
      expect(handler!.decorators.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('functions', () => {
    it('should extract top-level function declarations', () => {
      const source = `def hello():
    print("hello")
`;
      const model = extract(source);
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].name).toBe('hello');
      expect(model.functions[0].isExported).toBe(true);
    });

    it('should detect async functions', () => {
      const source = `async def fetch_data():
    pass
`;
      const model = extract(source);
      expect(model.functions[0].isAsync).toBe(true);
    });

    it('should mark private functions as unexported', () => {
      const source = `def _helper():
    pass
`;
      const model = extract(source);
      expect(model.functions[0].isExported).toBe(false);
      expect(model.functions[0].visibility).toBe('protected');
    });

    it('should count function parameters', () => {
      const source = `def add(a, b, c):
    return a + b + c
`;
      const model = extract(source);
      expect(model.functions[0].parameterCount).toBe(3);
    });

    it('should handle typed parameters', () => {
      const source = `def greet(name: str, times: int = 1) -> str:
    return name * times
`;
      const model = extract(source);
      expect(model.functions[0].parameterCount).toBe(2);
      expect(model.functions[0].returnType).toBe('str');
    });

    it('should not include class methods as top-level functions', () => {
      const source = `class Svc:
    def method(self):
        pass

def standalone():
    pass
`;
      const model = extract(source);
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].name).toBe('standalone');
    });

    it('should include start and end lines', () => {
      const source = `def multi_line():
    x = 1
    y = 2
    return x + y
`;
      const model = extract(source);
      expect(model.functions[0].startLine).toBeDefined();
      expect(model.functions[0].endLine).toBeDefined();
    });
  });

  describe('function calls', () => {
    it('should extract simple function calls', () => {
      const source = `def main():
    print("hello")
`;
      const model = extract(source);
      const printCall = model.functionCalls.find(c => c.callee === 'print');
      expect(printCall).toBeDefined();
      expect(printCall!.methodName).toBe('print');
    });

    it('should extract method calls with receiver', () => {
      const source = `def main():
    result = []
    result.append(1)
`;
      const model = extract(source);
      const appendCall = model.functionCalls.find(c => c.methodName === 'append');
      expect(appendCall).toBeDefined();
      expect(appendCall!.receiver).toBe('result');
      expect(appendCall!.callee).toBe('result.append');
    });

    it('should skip Python keywords that look like calls', () => {
      // These are keywords that tree-sitter might see as calls
      const source = `x = 1
if x:
    pass
`;
      const model = extract(source);
      const ifCall = model.functionCalls.find(c => c.callee === 'if');
      expect(ifCall).toBeUndefined();
    });

    it('should detect constructor calls (capitalized, no receiver)', () => {
      const source = `def main():
    obj = MyClass()
`;
      const model = extract(source);
      const ctorCall = model.functionCalls.find(c => c.callee === 'MyClass');
      expect(ctorCall).toBeDefined();
      expect(ctorCall!.isConstructorCall).toBe(true);
    });

    it('should not mark lowercase function calls as constructors', () => {
      const source = `def main():
    result = calculate()
`;
      const model = extract(source);
      const calcCall = model.functionCalls.find(c => c.callee === 'calculate');
      expect(calcCall).toBeDefined();
      expect(calcCall!.isConstructorCall).toBe(false);
    });

    it('should count arguments', () => {
      const source = `def main():
    print("a", "b", "c")
`;
      const model = extract(source);
      const call = model.functionCalls.find(c => c.callee === 'print');
      expect(call).toBeDefined();
      expect(call!.argumentCount).toBe(3);
    });

    it('should track parent function', () => {
      const source = `def outer():
    helper()

def helper():
    pass
`;
      const model = extract(source);
      const helperCall = model.functionCalls.find(c => c.callee === 'helper');
      expect(helperCall).toBeDefined();
      expect(helperCall!.parentFunction).toBe('outer');
    });
  });

  describe('control flow context', () => {
    it('should detect calls inside try block', () => {
      const source = `def main():
    try:
        risky()
    except Exception:
        pass
`;
      const model = extract(source);
      const riskyCall = model.functionCalls.find(c => c.callee === 'risky');
      expect(riskyCall).toBeDefined();
      expect(riskyCall!.controlFlow.inTryBlock).toBe(true);
    });

    it('should detect calls inside except block', () => {
      const source = `def main():
    try:
        pass
    except Exception:
        handle_error()
`;
      const model = extract(source);
      const handleCall = model.functionCalls.find(c => c.callee === 'handle_error');
      expect(handleCall).toBeDefined();
      expect(handleCall!.controlFlow.inCatchBlock).toBe(true);
    });

    it('should detect calls inside finally block', () => {
      const source = `def main():
    try:
        pass
    finally:
        cleanup()
`;
      const model = extract(source);
      const cleanupCall = model.functionCalls.find(c => c.callee === 'cleanup');
      expect(cleanupCall).toBeDefined();
      expect(cleanupCall!.controlFlow.inFinallyBlock).toBe(true);
    });

    it('should report default control flow for normal calls', () => {
      const source = `def main():
    normal_call()
`;
      const model = extract(source);
      const call = model.functionCalls.find(c => c.callee === 'normal_call');
      expect(call).toBeDefined();
      expect(call!.controlFlow.inTryBlock).toBe(false);
      expect(call!.controlFlow.inCatchBlock).toBe(false);
      expect(call!.controlFlow.inFinallyBlock).toBe(false);
    });
  });

  describe('mutations', () => {
    it('should extract property assignments', () => {
      const source = `class Config:
    pass

def main():
    c = Config()
    c.timeout = 30
`;
      const model = extract(source);
      const mutation = model.mutations.find(m => m.target === 'c.timeout');
      expect(mutation).toBeDefined();
      expect(mutation!.rootObject).toBe('c');
      expect(mutation!.propertyPath).toEqual(['timeout']);
      expect(mutation!.isDelete).toBe(false);
    });

    it('should extract augmented assignments', () => {
      const source = `def main():
    obj = type('Obj', (), {'count': 0})()
    obj.count += 1
`;
      const model = extract(source);
      const mutation = model.mutations.find(m => m.target === 'obj.count');
      expect(mutation).toBeDefined();
      expect(mutation!.operator).toBe('+=');
    });

    it('should extract delete operations', () => {
      const source = `def main():
    obj = type('Obj', (), {'temp': 1})()
    del obj.temp
`;
      const model = extract(source);
      const mutation = model.mutations.find(m => m.target === 'obj.temp');
      expect(mutation).toBeDefined();
      expect(mutation!.isDelete).toBe(true);
      expect(mutation!.operator).toBe('delete');
    });

    it('should not track simple variable assignments as mutations', () => {
      const source = `def main():
    x = 1
    x = 2
`;
      const model = extract(source);
      // Simple variable assignments should not be tracked
      expect(model.mutations).toHaveLength(0);
    });
  });

  describe('exports', () => {
    it('should export public classes and functions by default', () => {
      const source = `class User:
    pass

def helper():
    pass
`;
      const model = extract(source);
      const userExport = model.exports.find(e => e.name === 'User');
      expect(userExport).toBeDefined();
      expect(userExport!.kind).toBe('class');
      const helperExport = model.exports.find(e => e.name === 'helper');
      expect(helperExport).toBeDefined();
      expect(helperExport!.kind).toBe('function');
    });

    it('should not export private names', () => {
      const source = `class _Internal:
    pass

def _helper():
    pass
`;
      const model = extract(source);
      expect(model.exports).toHaveLength(0);
    });

    it('should use __all__ when defined', () => {
      const source = `__all__ = ['User', 'create_user']

class User:
    pass

class _Internal:
    pass

def create_user():
    pass

def _helper():
    pass
`;
      const model = extract(source);
      expect(model.exports).toHaveLength(2);
      const names = model.exports.map(e => e.name);
      expect(names).toContain('User');
      expect(names).toContain('create_user');
      expect(names).not.toContain('_Internal');
      expect(names).not.toContain('_helper');
    });

    it('should classify export kinds correctly with __all__', () => {
      const source = `__all__ = ['MyClass', 'my_func']

class MyClass:
    pass

def my_func():
    pass
`;
      const model = extract(source);
      const classExport = model.exports.find(e => e.name === 'MyClass');
      expect(classExport!.kind).toBe('class');
      const funcExport = model.exports.find(e => e.name === 'my_func');
      expect(funcExport!.kind).toBe('function');
    });

    it('none should be marked as default exports', () => {
      const source = `class Svc:
    pass

def run():
    pass
`;
      const model = extract(source);
      for (const exp of model.exports) {
        expect(exp.isDefault).toBe(false);
      }
    });
  });

  describe('graceful degradation', () => {
    it('should return base model with empty arrays for empty source', () => {
      const model = extract('');
      expect(model.imports).toEqual([]);
      expect(model.classes).toEqual([]);
      expect(model.interfaces).toEqual([]);
      expect(model.functions).toEqual([]);
      expect(model.functionCalls).toEqual([]);
      expect(model.mutations).toEqual([]);
      expect(model.exports).toEqual([]);
    });
  });
});
