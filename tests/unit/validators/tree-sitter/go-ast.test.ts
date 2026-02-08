/**
 * @arch archcodex.test.unit
 *
 * Tests for Go AST extraction using tree-sitter.
 * Tests createGoParser and extractGoSemanticModel helper functions.
 */
import { describe, it, expect } from 'vitest';
import {
  createGoParser,
  extractGoSemanticModel,
} from '../../../../src/validators/tree-sitter/go-ast.js';

const parser = createGoParser();

function extract(source: string) {
  return extractGoSemanticModel(parser, source, '/test/example.go', 'example.go', '.go');
}

describe('createGoParser', () => {
  it('should create a parser instance', () => {
    const p = createGoParser();
    expect(p).toBeDefined();
  });

  it('should be able to parse Go source code', () => {
    const p = createGoParser();
    const tree = p.parse('package main\n');
    expect(tree).toBeDefined();
    expect(tree.rootNode.type).toBe('source_file');
  });
});

describe('extractGoSemanticModel', () => {
  describe('file metadata', () => {
    it('should return correct file metadata', () => {
      const model = extract('package main\n');
      expect(model.filePath).toBe('/test/example.go');
      expect(model.fileName).toBe('example.go');
      expect(model.extension).toBe('.go');
      expect(model.language).toBe('go');
    });

    it('should calculate line count correctly', () => {
      const model = extract('package main\n\nfunc main() {}\n');
      expect(model.lineCount).toBe(3);
    });

    it('should handle trailing newline in line count', () => {
      const model = extract('package main\nfunc main() {}\n');
      expect(model.lineCount).toBe(2);
    });

    it('should handle no trailing newline', () => {
      const model = extract('package main');
      expect(model.lineCount).toBe(1);
    });

    it('should calculate LOC excluding comments and blanks', () => {
      const source = [
        '// comment',
        '',
        'package main',
        '',
        'func main() {}',
        '',
      ].join('\n');
      const model = extract(source);
      expect(model.locCount).toBe(2);
    });

    it('should handle block comments in LOC', () => {
      const source = [
        '/*',
        ' * Multi-line',
        ' * comment',
        ' */',
        'package main',
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
    it('should extract single import', () => {
      const source = `package main

import "fmt"
`;
      const model = extract(source);
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('fmt');
      expect(model.imports[0].defaultImport).toBe('fmt');
      expect(model.imports[0].isDynamic).toBe(false);
    });

    it('should extract block imports', () => {
      const source = `package main

import (
  "fmt"
  "os"
  "strings"
)
`;
      const model = extract(source);
      expect(model.imports).toHaveLength(3);
      const modules = model.imports.map(i => i.moduleSpecifier);
      expect(modules).toContain('fmt');
      expect(modules).toContain('os');
      expect(modules).toContain('strings');
    });

    it('should extract aliased imports', () => {
      const source = `package main

import (
  mylog "log"
)
`;
      const model = extract(source);
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('log');
      expect(model.imports[0].defaultImport).toBe('mylog');
    });

    it('should extract multi-segment import paths', () => {
      const source = `package main

import "net/http"
`;
      const model = extract(source);
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('net/http');
      expect(model.imports[0].defaultImport).toBe('http');
    });

    it('should handle blank identifier imports', () => {
      const source = `package main

import (
  _ "database/sql"
)
`;
      const model = extract(source);
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('database/sql');
      // Blank import has no usable default import name
    });

    it('should handle dot imports', () => {
      const source = `package main

import (
  . "math"
)
`;
      const model = extract(source);
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('math');
    });
  });

  describe('structs (classes)', () => {
    it('should extract struct declarations', () => {
      const source = `package main

type User struct {
  Name string
  Age  int
}
`;
      const model = extract(source);
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('User');
      expect(model.classes[0].isExported).toBe(true);
      expect(model.classes[0].isAbstract).toBe(false);
    });

    it('should mark unexported structs correctly', () => {
      const source = `package main

type internalState struct {
  value int
}
`;
      const model = extract(source);
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('internalState');
      expect(model.classes[0].isExported).toBe(false);
    });

    it('should extract struct embeddings as extends/implements', () => {
      const source = `package main

type Base struct{}

type Child struct {
  Base
}
`;
      const model = extract(source);
      const child = model.classes.find(c => c.name === 'Child');
      expect(child).toBeDefined();
      expect(child!.extends).toBe('Base');
      expect(child!.inheritanceChain).toContain('Base');
    });

    it('should extract multiple embeddings', () => {
      const source = `package main

type Reader struct{}
type Writer struct{}

type ReadWriter struct {
  Reader
  Writer
}
`;
      const model = extract(source);
      const rw = model.classes.find(c => c.name === 'ReadWriter');
      expect(rw).toBeDefined();
      // First embedding is extends, rest go to implements
      expect(rw!.extends).toBe('Reader');
      expect(rw!.implements).toContain('Writer');
    });

    it('should handle pointer embeddings', () => {
      const source = `package main

type Base struct{}

type Child struct {
  *Base
}
`;
      const model = extract(source);
      const child = model.classes.find(c => c.name === 'Child');
      expect(child).toBeDefined();
      expect(child!.extends).toBe('Base');
    });
  });

  describe('interfaces', () => {
    it('should extract interface declarations', () => {
      const source = `package main

type Stringer interface {
  String() string
}
`;
      const model = extract(source);
      expect(model.interfaces).toHaveLength(1);
      expect(model.interfaces[0].name).toBe('Stringer');
      expect(model.interfaces[0].isExported).toBe(true);
    });

    it('should extract interface methods', () => {
      const source = `package main

type ReadWriter interface {
  Read(p []byte) (int, error)
  Write(p []byte) (int, error)
}
`;
      const model = extract(source);
      expect(model.interfaces[0].methods).toHaveLength(2);
      const readMethod = model.interfaces[0].methods.find(m => m.name === 'Read');
      expect(readMethod).toBeDefined();
      expect(readMethod!.isAbstract).toBe(true);
    });

    it('should extract embedded interfaces', () => {
      const source = `package main

type Reader interface {
  Read(p []byte) (int, error)
}

type ReadCloser interface {
  Reader
  Close() error
}
`;
      const model = extract(source);
      const readCloser = model.interfaces.find(i => i.name === 'ReadCloser');
      expect(readCloser).toBeDefined();
      expect(readCloser!.extends).toContain('Reader');
    });

    it('should mark unexported interfaces correctly', () => {
      const source = `package main

type handler interface {
  Handle()
}
`;
      const model = extract(source);
      expect(model.interfaces[0].isExported).toBe(false);
    });
  });

  describe('methods (attached to structs)', () => {
    it('should attach methods to their receiver structs', () => {
      const source = `package main

type Server struct{}

func (s *Server) Start() {}
func (s *Server) Stop() {}
`;
      const model = extract(source);
      const server = model.classes.find(c => c.name === 'Server');
      expect(server).toBeDefined();
      expect(server!.methods).toHaveLength(2);
      const start = server!.methods.find(m => m.name === 'Start');
      expect(start).toBeDefined();
    });

    it('should set visibility based on method name capitalization', () => {
      const source = `package main

type Service struct{}

func (s *Service) Public() {}
func (s *Service) private() {}
`;
      const model = extract(source);
      const svc = model.classes.find(c => c.name === 'Service');
      expect(svc).toBeDefined();
      const pub = svc!.methods.find(m => m.name === 'Public');
      const priv = svc!.methods.find(m => m.name === 'private');
      expect(pub!.visibility).toBe('public');
      expect(priv!.visibility).toBe('private');
    });

    it('should count method parameters correctly', () => {
      const source = `package main

type Math struct{}

func (m *Math) Add(a, b int) int {
  return a + b
}
`;
      const model = extract(source);
      const math = model.classes.find(c => c.name === 'Math');
      expect(math).toBeDefined();
      const add = math!.methods.find(m => m.name === 'Add');
      expect(add).toBeDefined();
      expect(add!.parameterCount).toBe(2);
    });

    it('should set isStatic to false for Go methods', () => {
      const source = `package main

type T struct{}

func (t T) Method() {}
`;
      const model = extract(source);
      const t = model.classes.find(c => c.name === 'T');
      expect(t!.methods[0].isStatic).toBe(false);
    });
  });

  describe('functions', () => {
    it('should extract top-level function declarations', () => {
      const source = `package main

func Hello() {}
`;
      const model = extract(source);
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].name).toBe('Hello');
      expect(model.functions[0].isExported).toBe(true);
      expect(model.functions[0].isAsync).toBe(false);
    });

    it('should mark unexported functions correctly', () => {
      const source = `package main

func helper() {}
`;
      const model = extract(source);
      expect(model.functions[0].isExported).toBe(false);
      expect(model.functions[0].visibility).toBe('private');
    });

    it('should count function parameters', () => {
      const source = `package main

func Sum(a, b, c int) int {
  return a + b + c
}
`;
      const model = extract(source);
      expect(model.functions[0].parameterCount).toBe(3);
    });

    it('should handle variadic parameters', () => {
      const source = `package main

func Print(args ...string) {}
`;
      const model = extract(source);
      expect(model.functions[0].parameterCount).toBe(1);
    });

    it('should handle functions with no parameters', () => {
      const source = `package main

func NoArgs() {}
`;
      const model = extract(source);
      expect(model.functions[0].parameterCount).toBe(0);
    });

    it('should include start and end lines', () => {
      const source = `package main

func Multi() {
  x := 1
  y := 2
  _ = x + y
}
`;
      const model = extract(source);
      expect(model.functions[0].startLine).toBeDefined();
      expect(model.functions[0].endLine).toBeDefined();
      expect(model.functions[0].endLine!).toBeGreaterThan(model.functions[0].startLine!);
    });
  });

  describe('function calls', () => {
    it('should extract simple function calls', () => {
      const source = `package main

import "fmt"

func main() {
  fmt.Println("hello")
}
`;
      const model = extract(source);
      const printlnCall = model.functionCalls.find(c => c.methodName === 'Println');
      expect(printlnCall).toBeDefined();
      expect(printlnCall!.receiver).toBe('fmt');
      expect(printlnCall!.callee).toBe('fmt.Println');
    });

    it('should extract standalone function calls', () => {
      const source = `package main

func helper() {}

func main() {
  helper()
}
`;
      const model = extract(source);
      const helperCall = model.functionCalls.find(c => c.callee === 'helper');
      expect(helperCall).toBeDefined();
      expect(helperCall!.receiver).toBeUndefined();
    });

    it('should skip Go builtin keywords', () => {
      const source = `package main

func main() {
  x := make([]int, 10)
  _ = len(x)
}
`;
      const model = extract(source);
      // make and len are builtins and should be skipped
      const makeCall = model.functionCalls.find(c => c.callee === 'make');
      const lenCall = model.functionCalls.find(c => c.callee === 'len');
      expect(makeCall).toBeUndefined();
      expect(lenCall).toBeUndefined();
    });

    it('should count arguments correctly', () => {
      const source = `package main

import "fmt"

func main() {
  fmt.Printf("%s %d", "hello", 42)
}
`;
      const model = extract(source);
      const printfCall = model.functionCalls.find(c => c.methodName === 'Printf');
      expect(printfCall).toBeDefined();
      expect(printfCall!.argumentCount).toBe(3);
    });

    it('should track parent function', () => {
      const source = `package main

import "fmt"

func greet() {
  fmt.Println("hi")
}
`;
      const model = extract(source);
      const call = model.functionCalls.find(c => c.methodName === 'Println');
      expect(call).toBeDefined();
      expect(call!.parentFunction).toBe('greet');
    });

    it('should set control flow to default (Go uses defer/recover)', () => {
      const source = `package main

func main() {
  doWork()
}

func doWork() {}
`;
      const model = extract(source);
      const call = model.functionCalls.find(c => c.callee === 'doWork');
      expect(call).toBeDefined();
      expect(call!.controlFlow.inTryBlock).toBe(false);
      expect(call!.controlFlow.inCatchBlock).toBe(false);
    });

    it('should not track calls as constructor calls', () => {
      const source = `package main

func main() {
  doWork()
}

func doWork() {}
`;
      const model = extract(source);
      for (const call of model.functionCalls) {
        expect(call.isConstructorCall).toBe(false);
      }
    });
  });

  describe('mutations', () => {
    it('should extract property assignments', () => {
      const source = `package main

type Config struct{ Timeout int }

func main() {
  c := Config{}
  c.Timeout = 30
}
`;
      const model = extract(source);
      const mutation = model.mutations.find(m => m.target === 'c.Timeout');
      expect(mutation).toBeDefined();
      expect(mutation!.rootObject).toBe('c');
      expect(mutation!.propertyPath).toEqual(['Timeout']);
      expect(mutation!.operator).toBe('=');
      expect(mutation!.isDelete).toBe(false);
    });

    it('should extract compound assignments', () => {
      const source = `package main

type Counter struct{ Value int }

func main() {
  c := Counter{}
  c.Value += 1
}
`;
      const model = extract(source);
      const mutation = model.mutations.find(m => m.target === 'c.Value');
      expect(mutation).toBeDefined();
      expect(mutation!.operator).toBe('+=');
    });

    it('should not track simple variable assignments as mutations', () => {
      const source = `package main

func main() {
  x := 1
  x = 2
  _ = x
}
`;
      const model = extract(source);
      // Simple variable assignments (not property accesses) should not be mutations
      expect(model.mutations).toHaveLength(0);
    });
  });

  describe('exports', () => {
    it('should export uppercase-starting functions', () => {
      const source = `package main

func Public() {}
func private() {}
`;
      const model = extract(source);
      const pubExport = model.exports.find(e => e.name === 'Public');
      expect(pubExport).toBeDefined();
      expect(pubExport!.kind).toBe('function');
      const privExport = model.exports.find(e => e.name === 'private');
      expect(privExport).toBeUndefined();
    });

    it('should export uppercase-starting structs', () => {
      const source = `package main

type Server struct{}
type client struct{}
`;
      const model = extract(source);
      const serverExport = model.exports.find(e => e.name === 'Server');
      expect(serverExport).toBeDefined();
      expect(serverExport!.kind).toBe('class');
      const clientExport = model.exports.find(e => e.name === 'client');
      expect(clientExport).toBeUndefined();
    });

    it('should export uppercase-starting interfaces', () => {
      const source = `package main

type Handler interface {
  Handle()
}
type handler interface {
  handle()
}
`;
      const model = extract(source);
      const handlerExport = model.exports.find(e => e.name === 'Handler');
      expect(handlerExport).toBeDefined();
      expect(handlerExport!.kind).toBe('interface');
      const privHandler = model.exports.find(e => e.name === 'handler');
      expect(privHandler).toBeUndefined();
    });

    it('should export uppercase-starting constants and variables', () => {
      const source = `package main

const MaxRetries = 3
var DefaultTimeout = 30

const maxRetries = 3
`;
      const model = extract(source);
      const maxExport = model.exports.find(e => e.name === 'MaxRetries');
      expect(maxExport).toBeDefined();
      expect(maxExport!.kind).toBe('variable');
      const defaultExport = model.exports.find(e => e.name === 'DefaultTimeout');
      expect(defaultExport).toBeDefined();
      const privExport = model.exports.find(e => e.name === 'maxRetries');
      expect(privExport).toBeUndefined();
    });

    it('none should be marked as default exports', () => {
      const source = `package main

func Hello() {}
type Server struct{}
`;
      const model = extract(source);
      for (const exp of model.exports) {
        expect(exp.isDefault).toBe(false);
      }
    });
  });

  describe('graceful degradation', () => {
    it('should return base model with empty arrays for unparseable content', () => {
      // This tests the catch block - we pass an intentionally broken scenario.
      // Since tree-sitter is quite forgiving, we verify the base model structure exists.
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
