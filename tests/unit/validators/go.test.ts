/**
 * @arch archcodex.test.unit
 */
/**
 * Tests for Go validator.
 */
import { describe, it, expect } from 'vitest';
import { GoValidator } from '../../../src/validators/go.js';

const validator = new GoValidator();

async function parse(content: string) {
  return validator.parseFile('/test/example.go', content);
}

describe('GoValidator', () => {
  describe('metadata', () => {
    it('has correct supported languages and extensions', () => {
      expect(validator.supportedLanguages).toEqual(['go']);
      expect(validator.supportedExtensions).toEqual(['.go']);
    });
  });

  describe('parseFile basics', () => {
    it('returns correct file metadata', async () => {
      const model = await parse('package main\n');
      expect(model.filePath).toBe('/test/example.go');
      expect(model.fileName).toBe('example.go');
      expect(model.extension).toBe('.go');
      expect(model.language).toBe('go');
    });

    it('calculates line count correctly', async () => {
      const model = await parse('package main\n\nfunc main() {}\n');
      expect(model.lineCount).toBe(3);
    });

    it('calculates LOC excluding comments and blanks', async () => {
      const content = [
        '// comment',
        '',
        'package main',
        '',
        'func main() {}',
        '',
      ].join('\n');
      const model = await parse(content);
      expect(model.locCount).toBe(2);
    });

    it('handles block comments in LOC', async () => {
      const content = [
        '/*',
        ' * Multi-line',
        ' * comment',
        ' */',
        'package main',
      ].join('\n');
      const model = await parse(content);
      expect(model.locCount).toBe(1);
    });

    it('counts code after closing block comment as LOC', async () => {
      const content = [
        '/* comment */ package main',
      ].join('\n');
      const model = await parse(content);
      expect(model.locCount).toBe(1);
    });

    it('counts code before mid-line block comment as LOC', async () => {
      const content = [
        'package main',
        'var x = 1 /* start',
        ' continued */',
        'var y = 2',
      ].join('\n');
      const model = await parse(content);
      // package main, var x = 1 (has code before /*), var y = 2
      expect(model.locCount).toBe(3);
    });

    it('handles self-closing block comment with no surrounding code', async () => {
      const content = [
        '/* just a comment */',
        'package main',
      ].join('\n');
      const model = await parse(content);
      expect(model.locCount).toBe(1);
    });
  });

  describe('imports', () => {
    it('extracts single import', async () => {
      const model = await parse('package main\n\nimport "fmt"\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('fmt');
      expect(model.imports[0].defaultImport).toBe('fmt');
    });

    it('extracts aliased import', async () => {
      const model = await parse('package main\n\nimport f "fmt"\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('fmt');
      expect(model.imports[0].defaultImport).toBe('f');
    });

    it('extracts dot import', async () => {
      const model = await parse('package main\n\nimport . "fmt"\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('fmt');
      expect(model.imports[0].defaultImport).toBeUndefined();
    });

    it('extracts blank import with undefined defaultImport', async () => {
      const model = await parse('package main\n\nimport _ "net/http/pprof"\n');
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('net/http/pprof');
      expect(model.imports[0].defaultImport).toBeUndefined();
    });

    it('extracts block imports', async () => {
      const content = [
        'package main',
        '',
        'import (',
        '\t"fmt"',
        '\t"os"',
        ')',
      ].join('\n');
      const model = await parse(content);
      expect(model.imports).toHaveLength(2);
      expect(model.imports[0].moduleSpecifier).toBe('fmt');
      expect(model.imports[1].moduleSpecifier).toBe('os');
    });

    it('extracts block imports with aliases', async () => {
      const content = [
        'package main',
        '',
        'import (',
        '\tf "fmt"',
        '\t. "os"',
        '\t_ "net/http/pprof"',
        ')',
      ].join('\n');
      const model = await parse(content);
      expect(model.imports).toHaveLength(3);
      expect(model.imports[0].defaultImport).toBe('f');
      expect(model.imports[1].defaultImport).toBeUndefined();
      expect(model.imports[2].defaultImport).toBeUndefined();
    });

    it('extracts package path as module specifier', async () => {
      const model = await parse('package main\n\nimport "github.com/user/repo/pkg"\n');
      expect(model.imports[0].moduleSpecifier).toBe('github.com/user/repo/pkg');
      expect(model.imports[0].defaultImport).toBe('pkg');
    });
  });

  describe('structs (classes)', () => {
    it('extracts simple struct', async () => {
      const content = [
        'package main',
        '',
        'type MyStruct struct {',
        '\tName string',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('MyStruct');
      expect(model.classes[0].isExported).toBe(true);
    });

    it('marks unexported struct', async () => {
      const content = [
        'package main',
        '',
        'type myStruct struct {',
        '\tname string',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].isExported).toBe(false);
    });

    it('extracts empty struct', async () => {
      const content = 'package main\n\ntype Empty struct{}\n';
      const model = await parse(content);
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('Empty');
    });

    it('maps first embedding to extends for constraint support', async () => {
      const content = [
        'package main',
        '',
        'type Child struct {',
        '\tBase',
        '\tName string',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].extends).toBe('Base');
      expect(model.classes[0].inheritanceChain).toEqual(['Child', 'Base']);
    });

    it('maps remaining embeddings to implements', async () => {
      const content = [
        'package main',
        '',
        'type Multi struct {',
        '\tBase',
        '\tMixinA',
        '\tMixinB',
        '\tName string',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].extends).toBe('Base');
      expect(model.classes[0].implements).toEqual(['MixinA', 'MixinB']);
    });

    it('extracts dotted package embedding (e.g. sync.Mutex)', async () => {
      const content = [
        'package main',
        '',
        'type SafeMap struct {',
        '\tsync.Mutex',
        '\tdata map[string]string',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].extends).toBe('Mutex');
      expect(model.classes[0].inheritanceChain).toEqual(['SafeMap', 'Mutex']);
    });

    it('extracts pointer embedding to extends', async () => {
      const content = [
        'package main',
        '',
        'type Child struct {',
        '\t*Base',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].extends).toBe('Base');
    });
  });

  describe('interfaces', () => {
    it('extracts simple interface', async () => {
      const content = [
        'package main',
        '',
        'type Reader interface {',
        '\tRead(p []byte) (int, error)',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.interfaces).toHaveLength(1);
      expect(model.interfaces[0].name).toBe('Reader');
      expect(model.interfaces[0].isExported).toBe(true);
      expect(model.interfaces[0].methods).toHaveLength(1);
      expect(model.interfaces[0].methods![0].name).toBe('Read');
    });

    it('marks unexported interface', async () => {
      const content = [
        'package main',
        '',
        'type reader interface {',
        '\tread() error',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.interfaces[0].isExported).toBe(false);
    });

    it('extracts empty interface', async () => {
      const content = 'package main\n\ntype Any interface{}\n';
      const model = await parse(content);
      expect(model.interfaces).toHaveLength(1);
      expect(model.interfaces[0].name).toBe('Any');
      expect(model.interfaces[0].methods).toHaveLength(0);
    });

    it('extracts interface with embedded interface', async () => {
      const content = [
        'package main',
        '',
        'type ReadWriter interface {',
        '\tio.Reader',
        '\tWrite(p []byte) (int, error)',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.interfaces[0].extends).toEqual(['io.Reader']);
      expect(model.interfaces[0].methods).toHaveLength(1);
      expect(model.interfaces[0].methods![0].name).toBe('Write');
    });
  });

  describe('methods', () => {
    it('attaches methods to struct via receiver', async () => {
      const content = [
        'package main',
        '',
        'type MyStruct struct {',
        '\tName string',
        '}',
        '',
        'func (s *MyStruct) GetName() string {',
        '\treturn s.Name',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods).toHaveLength(1);
      expect(model.classes[0].methods[0].name).toBe('GetName');
    });

    it('attaches value receiver methods', async () => {
      const content = [
        'package main',
        '',
        'type MyStruct struct{}',
        '',
        'func (s MyStruct) String() string {',
        '\treturn ""',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods).toHaveLength(1);
    });

    it('detects exported method visibility', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) Public() {}',
        'func (s *Svc) private() {}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods).toHaveLength(2);
      expect(model.classes[0].methods[0].visibility).toBe('public');
      expect(model.classes[0].methods[1].visibility).toBe('private');
    });

    it('counts method parameters excluding receiver', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) Process(a int, b string, c bool) error {',
        '\treturn nil',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods[0].parameterCount).toBe(3);
    });

    it('captures method return type', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) GetName() string {',
        '\treturn ""',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods[0].returnType).toBe('string');
    });

    it('captures method with multiple return values', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) Fetch() ([]byte, error) {',
        '\treturn nil, nil',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods[0].returnType).toBe('([]byte, error)');
    });

    it('does not bleed methods between structs', async () => {
      const content = [
        'package main',
        '',
        'type First struct{}',
        'type Second struct{}',
        '',
        'func (f *First) MethodA() {}',
        'func (s *Second) MethodB() {}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes).toHaveLength(2);
      const first = model.classes.find(c => c.name === 'First');
      const second = model.classes.find(c => c.name === 'Second');
      expect(first!.methods).toHaveLength(1);
      expect(first!.methods[0].name).toBe('MethodA');
      expect(second!.methods).toHaveLength(1);
      expect(second!.methods[0].name).toBe('MethodB');
    });
  });

  describe('functions', () => {
    it('extracts package-level function', async () => {
      const content = [
        'package main',
        '',
        'func main() {',
        '\tfmt.Println("hello")',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].name).toBe('main');
    });

    it('detects exported vs unexported functions', async () => {
      const content = [
        'package main',
        '',
        'func Exported() {}',
        'func unexported() {}',
      ].join('\n');
      const model = await parse(content);
      expect(model.functions).toHaveLength(2);
      expect(model.functions[0].isExported).toBe(true);
      expect(model.functions[0].visibility).toBe('public');
      expect(model.functions[1].isExported).toBe(false);
      expect(model.functions[1].visibility).toBe('private');
    });

    it('counts function parameters', async () => {
      const content = 'package main\n\nfunc Add(a int, b int) int {\n\treturn a + b\n}\n';
      const model = await parse(content);
      expect(model.functions[0].parameterCount).toBe(2);
      expect(model.functions[0].returnType).toBe('int');
    });

    it('handles multiple return values', async () => {
      const content = 'package main\n\nfunc Divide(a, b int) (int, error) {\n\treturn 0, nil\n}\n';
      const model = await parse(content);
      expect(model.functions[0].returnType).toBe('(int, error)');
    });

    it('handles variadic parameters', async () => {
      const content = 'package main\n\nfunc Sum(nums ...int) int {\n\treturn 0\n}\n';
      const model = await parse(content);
      expect(model.functions[0].parameterCount).toBe(1);
    });

    it('does not include methods as standalone functions', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) Method() {}',
        'func Standalone() {}',
      ].join('\n');
      const model = await parse(content);
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].name).toBe('Standalone');
    });
  });

  describe('function calls', () => {
    it('extracts simple function call', async () => {
      const content = 'package main\n\nfunc main() {\n\tfmt.Println("hello")\n}\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'Println');
      expect(call).toBeDefined();
      expect(call!.receiver).toBe('fmt');
      expect(call!.callee).toBe('fmt.Println');
    });

    it('extracts standalone function call', async () => {
      const content = 'package main\n\nfunc main() {\n\tprocess()\n}\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'process');
      expect(call).toBeDefined();
      expect(call!.receiver).toBeUndefined();
    });

    it('detects go routine call', async () => {
      const content = 'package main\n\nfunc main() {\n\tgo handle()\n}\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'handle');
      expect(call).toBeDefined();
    });

    it('detects defer call', async () => {
      const content = 'package main\n\nfunc main() {\n\tdefer cleanup()\n}\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'cleanup');
      expect(call).toBeDefined();
    });

    it('skips keywords', async () => {
      const content = [
        'package main',
        '',
        'func main() {',
        '\tif true {',
        '\t\tfor i := range items {',
        '\t\t\tprocess(i)',
        '\t\t}',
        '\t}',
        '}',
      ].join('\n');
      const model = await parse(content);
      const processCall = model.functionCalls.find(c => c.methodName === 'process');
      expect(processCall).toBeDefined();
      // 'if', 'for', 'range' should not appear as calls
      expect(model.functionCalls.find(c => c.methodName === 'if')).toBeUndefined();
      expect(model.functionCalls.find(c => c.methodName === 'for')).toBeUndefined();
      expect(model.functionCalls.find(c => c.methodName === 'range')).toBeUndefined();
    });
  });

  describe('mutations', () => {
    it('extracts property mutations', async () => {
      const content = 'package main\n\nfunc main() {\n\ts.Name = "test"\n}\n';
      const model = await parse(content);
      expect(model.mutations).toHaveLength(1);
      expect(model.mutations[0].target).toBe('s.Name');
      expect(model.mutations[0].rootObject).toBe('s');
      expect(model.mutations[0].operator).toBe('=');
    });

    it('extracts augmented assignment', async () => {
      const content = 'package main\n\nfunc main() {\n\ts.Count += 1\n}\n';
      const model = await parse(content);
      expect(model.mutations[0].operator).toBe('+=');
    });

    it('ignores simple variable assignments', async () => {
      const content = 'package main\n\nfunc main() {\n\tx = 1\n}\n';
      const model = await parse(content);
      expect(model.mutations).toHaveLength(0);
    });
  });

  describe('exports', () => {
    it('exports uppercase-named structs', async () => {
      const content = [
        'package main',
        '',
        'type Public struct{}',
        'type private struct{}',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports.map(e => e.name)).toContain('Public');
      expect(model.exports.map(e => e.name)).not.toContain('private');
    });

    it('exports uppercase-named interfaces', async () => {
      const content = [
        'package main',
        '',
        'type Reader interface {',
        '\tRead() error',
        '}',
        'type reader interface {',
        '\tread() error',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports.find(e => e.name === 'Reader')).toBeDefined();
      expect(model.exports.find(e => e.name === 'reader')).toBeUndefined();
    });

    it('exports uppercase-named functions', async () => {
      const content = [
        'package main',
        '',
        'func Exported() {}',
        'func unexported() {}',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports.find(e => e.name === 'Exported')).toBeDefined();
      expect(model.exports.find(e => e.name === 'unexported')).toBeUndefined();
    });

    it('exports uppercase-named vars and consts', async () => {
      const content = [
        'package main',
        '',
        'var MaxRetries = 3',
        'const DefaultTimeout = 30',
        'var internal = "hidden"',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports.find(e => e.name === 'MaxRetries')).toBeDefined();
      expect(model.exports.find(e => e.name === 'DefaultTimeout')).toBeDefined();
      expect(model.exports.find(e => e.name === 'internal')).toBeUndefined();
    });

    it('exports from const block', async () => {
      const content = [
        'package main',
        '',
        'const (',
        '\tMaxSize = 100',
        '\tminSize = 1',
        ')',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports.find(e => e.name === 'MaxSize')).toBeDefined();
      expect(model.exports.find(e => e.name === 'minSize')).toBeUndefined();
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

    it('handles file with only package declaration', async () => {
      const model = await parse('package main\n');
      expect(model.lineCount).toBe(1);
      expect(model.locCount).toBe(1);
      expect(model.imports).toHaveLength(0);
    });

    it('handles inline comments in LOC', async () => {
      const content = [
        'package main',
        '// standalone comment',
        'var x = 1 // inline comment',
      ].join('\n');
      const model = await parse(content);
      // 'package main' + 'var x = 1 // inline comment' = 2 LOC
      expect(model.locCount).toBe(2);
    });

    it('tracks fmt.Println as a function call', async () => {
      const content = [
        'package main',
        '',
        'func main() {',
        '\tfmt.Println("hello")',
        '}',
      ].join('\n');
      const model = await parse(content);
      const printCall = model.functionCalls.find(c => c.methodName === 'Println');
      expect(printCall).toBeDefined();
    });

    it('handles nested property mutations', async () => {
      const content = 'package main\n\nfunc f() {\n\ts.config.timeout = 30\n}\n';
      const model = await parse(content);
      expect(model.mutations).toHaveLength(1);
      expect(model.mutations[0].target).toBe('s.config.timeout');
      expect(model.mutations[0].rootObject).toBe('s');
      expect(model.mutations[0].propertyPath).toEqual(['config', 'timeout']);
    });

    it('isAsync is always false for Go functions', async () => {
      const content = 'package main\n\nfunc Process() {}\n';
      const model = await parse(content);
      expect(model.functions[0].isAsync).toBe(false);
    });

    it('findClosingBrace skips braces in string literals', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) Render() string {',
        '\treturn "{hello}"',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods).toHaveLength(1);
      expect(model.classes[0].methods[0].name).toBe('Render');
    });

    it('findClosingBrace skips braces in block comments', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) Do() {',
        '\t/*',
        '\t{ not a real brace',
        '\t*/',
        '\tx := 1',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods).toHaveLength(1);
      expect(model.classes[0].methods[0].name).toBe('Do');
    });

    it('findClosingBrace skips braces in single-line block comments', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) Do() {',
        '\t/* { } */ x := 1',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods).toHaveLength(1);
      expect(model.classes[0].methods[0].name).toBe('Do');
    });

    it('findClosingBrace skips braces in raw string literals', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) Template() string {',
        '\treturn `{',
        '\t\t"key": "value"',
        '\t}`',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods).toHaveLength(1);
      expect(model.classes[0].methods[0].name).toBe('Template');
    });

    it('findClosingBrace skips braces in line comments', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) Do() { // { not a real brace',
        '\tx := 1',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods).toHaveLength(1);
      expect(model.classes[0].methods[0].name).toBe('Do');
    });

    it('counts function call arguments', async () => {
      const content = 'package main\n\nfunc main() {\n\tfmt.Sprintf("%s %d", name, age)\n}\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'Sprintf');
      expect(call).toBeDefined();
      expect(call!.argumentCount).toBe(3);
    });

    it('counts zero arguments for empty call', async () => {
      const content = 'package main\n\nfunc main() {\n\tprocess()\n}\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'process');
      expect(call).toBeDefined();
      expect(call!.argumentCount).toBe(0);
    });

    it('counts arguments with nested calls correctly', async () => {
      const content = 'package main\n\nfunc main() {\n\touter(inner(a, b), c)\n}\n';
      const model = await parse(content);
      const outerCall = model.functionCalls.find(c => c.methodName === 'outer');
      expect(outerCall).toBeDefined();
      expect(outerCall!.argumentCount).toBe(2);
    });

    it('isConstructorCall is always false for Go', async () => {
      const content = 'package main\n\nfunc main() {\n\tNew()\n}\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'New');
      expect(call).toBeDefined();
      expect(call!.isConstructorCall).toBe(false);
    });
  });

  describe('comprehensive edge cases', () => {
    it('handles file with only comments', async () => {
      const content = [
        '// This is a comment',
        '// Another comment',
      ].join('\n');
      const model = await parse(content);
      expect(model.lineCount).toBe(2);
      expect(model.locCount).toBe(0);
      expect(model.imports).toHaveLength(0);
      expect(model.classes).toHaveLength(0);
    });

    it('handles file with only a block comment', async () => {
      const content = [
        '/*',
        ' * License header',
        ' * Copyright 2025',
        ' */',
      ].join('\n');
      const model = await parse(content);
      expect(model.locCount).toBe(0);
    });

    it('handles struct with no fields and no methods', async () => {
      const content = [
        'package main',
        '',
        'type Empty struct{}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].extends).toBeUndefined();
      expect(model.classes[0].implements).toEqual([]);
      expect(model.classes[0].methods).toHaveLength(0);
      expect(model.classes[0].decorators).toEqual([]);
      expect(model.classes[0].isAbstract).toBe(false);
    });

    it('handles struct with only embeddings and no named fields', async () => {
      const content = [
        'package main',
        '',
        'type Combo struct {',
        '\tBase',
        '\tMixin',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].extends).toBe('Base');
      expect(model.classes[0].implements).toEqual(['Mixin']);
      expect(model.classes[0].inheritanceChain).toEqual(['Combo', 'Base', 'Mixin']);
    });

    it('handles struct with no embeddings', async () => {
      const content = [
        'package main',
        '',
        'type Data struct {',
        '\tName string',
        '\tAge  int',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].extends).toBeUndefined();
      expect(model.classes[0].implements).toEqual([]);
      expect(model.classes[0].inheritanceChain).toEqual(['Data']);
    });

    it('handles multiple structs in one file', async () => {
      const content = [
        'package main',
        '',
        'type Alpha struct {',
        '\tName string',
        '}',
        '',
        'type Beta struct {',
        '\tAlpha',
        '\tValue int',
        '}',
        '',
        'type gamma struct{}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes).toHaveLength(3);
      expect(model.classes[0].name).toBe('Alpha');
      expect(model.classes[0].isExported).toBe(true);
      expect(model.classes[1].name).toBe('Beta');
      expect(model.classes[1].extends).toBe('Alpha');
      expect(model.classes[2].name).toBe('gamma');
      expect(model.classes[2].isExported).toBe(false);
    });

    it('handles multiple interfaces in one file', async () => {
      const content = [
        'package main',
        '',
        'type Reader interface {',
        '\tRead(p []byte) (int, error)',
        '}',
        '',
        'type Writer interface {',
        '\tWrite(p []byte) (int, error)',
        '}',
        '',
        'type ReadWriter interface {',
        '\tReader',
        '\tWriter',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.interfaces).toHaveLength(3);
      expect(model.interfaces[2].name).toBe('ReadWriter');
      expect(model.interfaces[2].extends).toEqual(['Reader', 'Writer']);
    });

    it('handles interface method with no params', async () => {
      const content = [
        'package main',
        '',
        'type Closer interface {',
        '\tClose() error',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.interfaces[0].methods).toHaveLength(1);
      expect(model.interfaces[0].methods![0].parameterCount).toBe(0);
      expect(model.interfaces[0].methods![0].returnType).toBe('error');
      expect(model.interfaces[0].methods![0].isAbstract).toBe(true);
    });

    it('handles interface method with multiple params', async () => {
      const content = [
        'package main',
        '',
        'type Handler interface {',
        '\tServeHTTP(w ResponseWriter, r *Request)',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.interfaces[0].methods![0].parameterCount).toBe(2);
      expect(model.interfaces[0].methods![0].returnType).toBeUndefined();
    });

    it('handles method with no params and no return', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        '',
        'func (s *Svc) Reset() {',
        '\t// no-op',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].methods[0].parameterCount).toBe(0);
      expect(model.classes[0].methods[0].returnType).toBeUndefined();
    });

    it('handles function with no params and no return', async () => {
      const content = 'package main\n\nfunc init() {\n}\n';
      const model = await parse(content);
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].parameterCount).toBe(0);
      expect(model.functions[0].returnType).toBeUndefined();
      expect(model.functions[0].isExported).toBe(false);
    });

    it('handles named return values in functions', async () => {
      const content = 'package main\n\nfunc Split(s string) (head, tail string) {\n\treturn\n}\n';
      const model = await parse(content);
      expect(model.functions[0].returnType).toBe('(head, tail string)');
    });

    it('handles chained method calls', async () => {
      const content = 'package main\n\nfunc main() {\n\tbuilder.Add(x).Build()\n}\n';
      const model = await parse(content);
      const addCall = model.functionCalls.find(c => c.methodName === 'Add');
      const buildCall = model.functionCalls.find(c => c.methodName === 'Build');
      expect(addCall).toBeDefined();
      expect(addCall!.receiver).toBe('builder');
      expect(buildCall).toBeDefined();
    });

    it('handles go routine with method call', async () => {
      const content = 'package main\n\nfunc main() {\n\tgo s.Process()\n}\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'Process');
      expect(call).toBeDefined();
      expect(call!.receiver).toBe('s');
    });

    it('handles defer with method call', async () => {
      const content = 'package main\n\nfunc main() {\n\tdefer conn.Close()\n}\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'Close');
      expect(call).toBeDefined();
      expect(call!.receiver).toBe('conn');
    });

    it('skips all Go keywords in function calls', async () => {
      const content = [
        'package main',
        '',
        'func main() {',
        '\tswitch x {',
        '\tcase 1:',
        '\t\tselect {',
        '\t\t}',
        '\t}',
        '\tvar m = map[string]int{}',
        '\treturn',
        '}',
      ].join('\n');
      const model = await parse(content);
      for (const kw of ['switch', 'select', 'case', 'map', 'return', 'var', 'const', 'func', 'type', 'import', 'package', 'chan', 'struct', 'interface']) {
        expect(model.functionCalls.find(c => c.methodName === kw && !c.receiver)).toBeUndefined();
      }
    });

    it('controlFlow is always no-try for Go', async () => {
      const content = [
        'package main',
        '',
        'func main() {',
        '\tprocess()',
        '}',
      ].join('\n');
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'process');
      expect(call!.controlFlow.inTryBlock).toBe(false);
      expect(call!.controlFlow.inCatchBlock).toBe(false);
      expect(call!.controlFlow.inFinallyBlock).toBe(false);
      expect(call!.controlFlow.tryDepth).toBe(0);
    });

    it('isOptionalChain is always false for Go', async () => {
      const content = 'package main\n\nfunc main() {\n\ts.Do()\n}\n';
      const model = await parse(content);
      const call = model.functionCalls.find(c => c.methodName === 'Do');
      expect(call!.isOptionalChain).toBe(false);
    });

    it('handles all augmented assignment operators in mutations', async () => {
      const content = [
        'package main',
        '',
        'func main() {',
        '\ts.a -= 1',
        '\ts.b *= 2',
        '\ts.c /= 3',
        '\ts.d %= 4',
        '\ts.e &= 5',
        '\ts.f |= 6',
        '\ts.g ^= 7',
        '\ts.h <<= 1',
        '\ts.i >>= 2',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.mutations).toHaveLength(9);
      expect(model.mutations.map(m => m.operator)).toEqual([
        '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=',
      ]);
    });

    it('ignores mutations in var/const/type/func declarations', async () => {
      const content = [
        'package main',
        '',
        'var s.x = 1',
        'const s.y = 2',
        'type s.z = int',
        'func s.w() {}',
      ].join('\n');
      const model = await parse(content);
      expect(model.mutations).toHaveLength(0);
    });

    it('ignores mutations on comment lines', async () => {
      const content = [
        'package main',
        '',
        'func main() {',
        '\t// s.Name = "test"',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.mutations).toHaveLength(0);
    });

    it('exports from var block', async () => {
      const content = [
        'package main',
        '',
        'var (',
        '\tMaxRetries = 3',
        '\tminRetries = 1',
        ')',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports.find(e => e.name === 'MaxRetries')).toBeDefined();
      expect(model.exports.find(e => e.name === 'minRetries')).toBeUndefined();
    });

    it('export kinds are correct for each type', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        'type Reader interface {',
        '\tRead() error',
        '}',
        'func Helper() {}',
        'var MaxSize = 100',
      ].join('\n');
      const model = await parse(content);
      expect(model.exports.find(e => e.name === 'Svc')!.kind).toBe('class');
      expect(model.exports.find(e => e.name === 'Reader')!.kind).toBe('interface');
      expect(model.exports.find(e => e.name === 'Helper')!.kind).toBe('function');
      expect(model.exports.find(e => e.name === 'MaxSize')!.kind).toBe('variable');
    });

    it('does not duplicate exports for struct/interface/function vars', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        'var Svc = "collision"',
      ].join('\n');
      const model = await parse(content);
      // The struct export is already there; var should not duplicate it
      const svcExports = model.exports.filter(e => e.name === 'Svc');
      expect(svcExports).toHaveLength(1);
    });

    it('all exports have isDefault false (Go has no default exports)', async () => {
      const content = [
        'package main',
        '',
        'type Svc struct{}',
        'func Run() {}',
        'var Count = 0',
      ].join('\n');
      const model = await parse(content);
      for (const exp of model.exports) {
        expect(exp.isDefault).toBe(false);
      }
    });

    it('handles block imports with comments and blank lines', async () => {
      const content = [
        'package main',
        '',
        'import (',
        '\t// standard library',
        '\t"fmt"',
        '\t"os"',
        '',
        '\t// third party',
        '\t"github.com/pkg/errors"',
        ')',
      ].join('\n');
      const model = await parse(content);
      expect(model.imports).toHaveLength(3);
      expect(model.imports[0].moduleSpecifier).toBe('fmt');
      expect(model.imports[1].moduleSpecifier).toBe('os');
      expect(model.imports[2].moduleSpecifier).toBe('github.com/pkg/errors');
      expect(model.imports[2].defaultImport).toBe('errors');
    });

    it('handles blank import in block', async () => {
      const content = [
        'package main',
        '',
        'import (',
        '\t"fmt"',
        '\t_ "net/http/pprof"',
        ')',
      ].join('\n');
      const model = await parse(content);
      expect(model.imports).toHaveLength(2);
      expect(model.imports[1].moduleSpecifier).toBe('net/http/pprof');
      expect(model.imports[1].defaultImport).toBeUndefined();
    });

    it('handles multiple functions with mixed visibility', async () => {
      const content = [
        'package main',
        '',
        'func PublicA() {}',
        'func publicB() {}',
        'func PublicC() int {',
        '\treturn 0',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.functions).toHaveLength(3);
      expect(model.functions[0].isExported).toBe(true);
      expect(model.functions[1].isExported).toBe(false);
      expect(model.functions[2].isExported).toBe(true);
      expect(model.functions[2].returnType).toBe('int');
    });

    it('handles methods that are not attached to any known struct', async () => {
      const content = [
        'package main',
        '',
        'func (u *Unknown) Do() {}',
      ].join('\n');
      const model = await parse(content);
      // No struct named Unknown exists, so the method is orphaned
      expect(model.classes).toHaveLength(0);
      // It should not appear as a standalone function either
      expect(model.functions).toHaveLength(0);
    });

    it('handles struct with pointer embedding from external package', async () => {
      const content = [
        'package main',
        '',
        'type Client struct {',
        '\t*http.Client',
        '\tTimeout int',
        '}',
      ].join('\n');
      const model = await parse(content);
      expect(model.classes[0].extends).toBe('Client');
      expect(model.classes[0].inheritanceChain).toEqual(['Client', 'Client']);
    });

    it('content field contains full file content', async () => {
      const content = 'package main\n\nfunc main() {}\n';
      const model = await parse(content);
      expect(model.content).toBe(content);
    });

    it('dispose is a no-op and does not throw', () => {
      expect(() => validator.dispose()).not.toThrow();
    });

    it('capabilities matches GO_CAPABILITIES', async () => {
      const { GO_CAPABILITIES } = await import('../../../src/validators/capabilities.js');
      expect(validator.capabilities).toEqual(GO_CAPABILITIES);
    });

    it('handles realistic Go file with all constructs', async () => {
      const content = [
        '// Package service provides business logic.',
        'package service',
        '',
        'import (',
        '\t"context"',
        '\t"fmt"',
        '',
        '\t"github.com/company/app/internal/model"',
        ')',
        '',
        'type Service struct {',
        '\tmodel.Base',
        '\tdb *sql.DB',
        '}',
        '',
        'func NewService(db *sql.DB) *Service {',
        '\treturn &Service{db: db}',
        '}',
        '',
        'func (s *Service) Create(ctx context.Context, name string) error {',
        '\ts.db.ExecContext(ctx, "INSERT INTO t (name) VALUES (?)", name)',
        '\tfmt.Println("created")',
        '\treturn nil',
        '}',
        '',
        'func (s *Service) delete(ctx context.Context, id int) error {',
        '\treturn nil',
        '}',
        '',
        'var DefaultTimeout = 30',
      ].join('\n');
      const model = await parse(content);

      // Imports
      expect(model.imports).toHaveLength(3);
      expect(model.imports.map(i => i.moduleSpecifier)).toEqual([
        'context', 'fmt', 'github.com/company/app/internal/model',
      ]);

      // Struct
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('Service');
      expect(model.classes[0].extends).toBe('Base');
      expect(model.classes[0].isExported).toBe(true);

      // Methods
      expect(model.classes[0].methods).toHaveLength(2);
      expect(model.classes[0].methods[0].name).toBe('Create');
      expect(model.classes[0].methods[0].visibility).toBe('public');
      expect(model.classes[0].methods[0].parameterCount).toBe(2);
      expect(model.classes[0].methods[1].name).toBe('delete');
      expect(model.classes[0].methods[1].visibility).toBe('private');

      // Functions
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].name).toBe('NewService');
      expect(model.functions[0].isExported).toBe(true);

      // Exports
      expect(model.exports.map(e => e.name).sort()).toEqual(
        ['DefaultTimeout', 'NewService', 'Service'].sort()
      );

      // Function calls
      expect(model.functionCalls.find(c => c.methodName === 'Println')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'ExecContext')).toBeDefined();
    });
  });

  describe('real-world Go patterns', () => {
    it('parses an HTTP handler file', async () => {
      const content = [
        '// Package api provides HTTP handlers.',
        'package api',
        '',
        'import (',
        '\t"encoding/json"',
        '\t"net/http"',
        '',
        '\t"github.com/company/app/internal/service"',
        ')',
        '',
        '// Handler holds route dependencies.',
        'type Handler struct {',
        '\tsvc *service.UserService',
        '}',
        '',
        '// NewHandler creates a new Handler.',
        'func NewHandler(svc *service.UserService) *Handler {',
        '\treturn &Handler{svc: svc}',
        '}',
        '',
        '// ListUsers returns all users.',
        'func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {',
        '\tusers, err := h.svc.List(r.Context())',
        '\tif err != nil {',
        '\t\thttp.Error(w, err.Error(), http.StatusInternalServerError)',
        '\t\treturn',
        '\t}',
        '\tjson.NewEncoder(w).Encode(users)',
        '}',
        '',
        '// GetUser returns a single user by ID.',
        'func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {',
        '\tid := r.URL.Query().Get("id")',
        '\tuser, err := h.svc.Get(r.Context(), id)',
        '\tif err != nil {',
        '\t\thttp.Error(w, "not found", http.StatusNotFound)',
        '\t\treturn',
        '\t}',
        '\tjson.NewEncoder(w).Encode(user)',
        '}',
        '',
        '// healthCheck is unexported.',
        'func (h *Handler) healthCheck(w http.ResponseWriter, r *http.Request) {',
        '\tw.WriteHeader(http.StatusOK)',
        '}',
      ].join('\n');
      const model = await parse(content);

      // Imports
      expect(model.imports).toHaveLength(3);
      expect(model.imports.map(i => i.defaultImport)).toEqual(['json', 'http', 'service']);

      // Struct
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('Handler');
      expect(model.classes[0].isExported).toBe(true);
      expect(model.classes[0].extends).toBeUndefined();

      // Methods
      expect(model.classes[0].methods).toHaveLength(3);
      expect(model.classes[0].methods[0].name).toBe('ListUsers');
      expect(model.classes[0].methods[0].visibility).toBe('public');
      expect(model.classes[0].methods[0].parameterCount).toBe(2);
      expect(model.classes[0].methods[1].name).toBe('GetUser');
      expect(model.classes[0].methods[1].visibility).toBe('public');
      expect(model.classes[0].methods[2].name).toBe('healthCheck');
      expect(model.classes[0].methods[2].visibility).toBe('private');

      // Functions
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].name).toBe('NewHandler');

      // Function calls
      expect(model.functionCalls.find(c => c.callee === 'json.NewEncoder')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'http.Error')).toBeDefined();

      // Exports
      expect(model.exports.find(e => e.name === 'Handler')).toBeDefined();
      expect(model.exports.find(e => e.name === 'NewHandler')).toBeDefined();
      expect(model.exports.find(e => e.name === 'healthCheck')).toBeUndefined();
    });

    it('parses a repository pattern with interface and implementation', async () => {
      const content = [
        'package repository',
        '',
        'import (',
        '\t"context"',
        '\t"database/sql"',
        '',
        '\t"github.com/company/app/internal/model"',
        ')',
        '',
        '// Repository defines data access methods.',
        'type Repository interface {',
        '\tFindByID(ctx context.Context, id string) (*model.User, error)',
        '\tFindAll(ctx context.Context) ([]*model.User, error)',
        '\tSave(ctx context.Context, user *model.User) error',
        '\tDelete(ctx context.Context, id string) error',
        '}',
        '',
        '// SQLRepository implements Repository using SQL.',
        'type SQLRepository struct {',
        '\tdb *sql.DB',
        '}',
        '',
        '// NewSQLRepository creates a new SQLRepository.',
        'func NewSQLRepository(db *sql.DB) *SQLRepository {',
        '\treturn &SQLRepository{db: db}',
        '}',
        '',
        'func (r *SQLRepository) FindByID(ctx context.Context, id string) (*model.User, error) {',
        '\trow := r.db.QueryRowContext(ctx, "SELECT * FROM users WHERE id = ?", id)',
        '\treturn scanUser(row)',
        '}',
        '',
        'func (r *SQLRepository) FindAll(ctx context.Context) ([]*model.User, error) {',
        '\trows, err := r.db.QueryContext(ctx, "SELECT * FROM users")',
        '\tif err != nil {',
        '\t\treturn nil, err',
        '\t}',
        '\tdefer rows.Close()',
        '\treturn scanUsers(rows)',
        '}',
        '',
        'func (r *SQLRepository) Save(ctx context.Context, user *model.User) error {',
        '\t_, err := r.db.ExecContext(ctx, "INSERT INTO users VALUES (?, ?)", user.ID, user.Name)',
        '\treturn err',
        '}',
        '',
        'func (r *SQLRepository) Delete(ctx context.Context, id string) error {',
        '\t_, err := r.db.ExecContext(ctx, "DELETE FROM users WHERE id = ?", id)',
        '\treturn err',
        '}',
        '',
        '// scanUser is unexported helper.',
        'func scanUser(row *sql.Row) (*model.User, error) {',
        '\treturn nil, nil',
        '}',
        '',
        '// scanUsers is unexported helper.',
        'func scanUsers(rows *sql.Rows) ([]*model.User, error) {',
        '\treturn nil, nil',
        '}',
      ].join('\n');
      const model = await parse(content);

      // Interface
      expect(model.interfaces).toHaveLength(1);
      expect(model.interfaces[0].name).toBe('Repository');
      expect(model.interfaces[0].isExported).toBe(true);
      expect(model.interfaces[0].methods).toHaveLength(4);
      expect(model.interfaces[0].methods!.map(m => m.name)).toEqual([
        'FindByID', 'FindAll', 'Save', 'Delete',
      ]);
      expect(model.interfaces[0].methods![0].parameterCount).toBe(2);

      // Struct
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('SQLRepository');
      expect(model.classes[0].methods).toHaveLength(4);
      expect(model.classes[0].methods.every(m => m.visibility === 'public')).toBe(true);

      // Functions (constructors + helpers)
      expect(model.functions).toHaveLength(3);
      expect(model.functions[0].name).toBe('NewSQLRepository');
      expect(model.functions[0].isExported).toBe(true);
      expect(model.functions[1].name).toBe('scanUser');
      expect(model.functions[1].isExported).toBe(false);
      expect(model.functions[2].name).toBe('scanUsers');
      expect(model.functions[2].isExported).toBe(false);

      // Exports: Repository (interface), SQLRepository (class), NewSQLRepository (function)
      const exportNames = model.exports.map(e => e.name).sort();
      expect(exportNames).toEqual(['NewSQLRepository', 'Repository', 'SQLRepository']);
    });

    it('parses a middleware with embedding and constants', async () => {
      const content = [
        'package middleware',
        '',
        'import (',
        '\t"log"',
        '\t"net/http"',
        '\t"time"',
        ')',
        '',
        'const (',
        '\tDefaultTimeout = 30',
        '\tmaxRetries     = 3',
        ')',
        '',
        'var (',
        '\tErrTimeout = "request timed out"',
        '\terrInternal = "internal error"',
        ')',
        '',
        '// Base provides common middleware functionality.',
        'type Base struct {',
        '\tLogger *log.Logger',
        '}',
        '',
        '// LoggingMiddleware adds request logging.',
        'type LoggingMiddleware struct {',
        '\tBase',
        '\tverbose bool',
        '}',
        '',
        '// NewLoggingMiddleware creates a new LoggingMiddleware.',
        'func NewLoggingMiddleware(logger *log.Logger, verbose bool) *LoggingMiddleware {',
        '\treturn &LoggingMiddleware{',
        '\t\tBase:    Base{Logger: logger},',
        '\t\tverbose: verbose,',
        '\t}',
        '}',
        '',
        '// Wrap wraps an http.Handler with logging.',
        'func (m *LoggingMiddleware) Wrap(next http.Handler) http.Handler {',
        '\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {',
        '\t\tstart := time.Now()',
        '\t\tnext.ServeHTTP(w, r)',
        '\t\tm.Logger.Printf("method=%s path=%s duration=%v", r.Method, r.URL.Path, time.Since(start))',
        '\t})',
        '}',
        '',
        '// SetVerbose configures verbosity.',
        'func (m *LoggingMiddleware) SetVerbose(v bool) {',
        '\tm.verbose = v',
        '}',
      ].join('\n');
      const model = await parse(content);

      // Imports
      expect(model.imports).toHaveLength(3);

      // Const block: only DefaultTimeout is exported
      expect(model.exports.find(e => e.name === 'DefaultTimeout')).toBeDefined();
      expect(model.exports.find(e => e.name === 'maxRetries')).toBeUndefined();

      // Var block: only ErrTimeout is exported
      expect(model.exports.find(e => e.name === 'ErrTimeout')).toBeDefined();
      expect(model.exports.find(e => e.name === 'errInternal')).toBeUndefined();

      // Structs
      expect(model.classes).toHaveLength(2);
      const base = model.classes.find(c => c.name === 'Base')!;
      const logging = model.classes.find(c => c.name === 'LoggingMiddleware')!;
      expect(base.extends).toBeUndefined();
      expect(logging.extends).toBe('Base');
      expect(logging.inheritanceChain).toEqual(['LoggingMiddleware', 'Base']);

      // Methods on LoggingMiddleware
      expect(logging.methods).toHaveLength(2);
      expect(logging.methods[0].name).toBe('Wrap');
      expect(logging.methods[0].visibility).toBe('public');
      expect(logging.methods[1].name).toBe('SetVerbose');

      // Mutations
      expect(model.mutations.find(m => m.target === 'm.verbose')).toBeDefined();
    });

    it('parses a concurrent worker pool pattern', async () => {
      const content = [
        'package worker',
        '',
        'import (',
        '\t"context"',
        '\t"sync"',
        ')',
        '',
        '// Task represents a unit of work.',
        'type Task interface {',
        '\tExecute(ctx context.Context) error',
        '}',
        '',
        '// Pool manages a pool of workers.',
        'type Pool struct {',
        '\tsync.Mutex',
        '\tworkers int',
        '\ttasks   chan Task',
        '}',
        '',
        '// NewPool creates a worker pool.',
        'func NewPool(workers int) *Pool {',
        '\treturn &Pool{',
        '\t\tworkers: workers,',
        '\t\ttasks:   make(chan Task, workers*2),',
        '\t}',
        '}',
        '',
        '// Submit adds a task to the pool.',
        'func (p *Pool) Submit(task Task) {',
        '\tp.tasks <- task',
        '}',
        '',
        '// Start begins processing tasks.',
        'func (p *Pool) Start(ctx context.Context) {',
        '\tvar wg sync.WaitGroup',
        '\tfor i := 0; i < p.workers; i++ {',
        '\t\twg.Add(1)',
        '\t\tgo func() {',
        '\t\t\tdefer wg.Done()',
        '\t\t\tfor task := range p.tasks {',
        '\t\t\t\ttask.Execute(ctx)',
        '\t\t\t}',
        '\t\t}()',
        '\t}',
        '\twg.Wait()',
        '}',
        '',
        '// Stop signals the pool to stop.',
        'func (p *Pool) Stop() {',
        '\tp.Lock()',
        '\tdefer p.Unlock()',
        '\tclose(p.tasks)',
        '}',
      ].join('\n');
      const model = await parse(content);

      // Interface
      expect(model.interfaces).toHaveLength(1);
      expect(model.interfaces[0].name).toBe('Task');
      expect(model.interfaces[0].methods).toHaveLength(1);
      expect(model.interfaces[0].methods![0].name).toBe('Execute');

      // Struct with sync.Mutex embedding
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('Pool');
      expect(model.classes[0].extends).toBe('Mutex');

      // Methods
      expect(model.classes[0].methods).toHaveLength(3);
      expect(model.classes[0].methods.map(m => m.name)).toEqual(['Submit', 'Start', 'Stop']);
      expect(model.classes[0].methods.every(m => m.visibility === 'public')).toBe(true);

      // Function calls include goroutine and defer patterns
      expect(model.functionCalls.find(c => c.methodName === 'Add')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'Done')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'Wait')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'Lock')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'Unlock')).toBeDefined();
    });

    it('parses an error handling pattern with sentinel errors', async () => {
      const content = [
        'package apperrors',
        '',
        'import (',
        '\t"errors"',
        '\t"fmt"',
        ')',
        '',
        'var (',
        '\tErrNotFound     = errors.New("not found")',
        '\tErrUnauthorized = errors.New("unauthorized")',
        '\tErrInternal     = errors.New("internal error")',
        '\terrPrivate      = errors.New("private")',
        ')',
        '',
        '// AppError wraps an error with context.',
        'type AppError struct {',
        '\tCode    int',
        '\tMessage string',
        '\tErr     error',
        '}',
        '',
        '// Error implements the error interface.',
        'func (e *AppError) Error() string {',
        '\treturn fmt.Sprintf("[%d] %s: %v", e.Code, e.Message, e.Err)',
        '}',
        '',
        '// Unwrap returns the underlying error.',
        'func (e *AppError) Unwrap() error {',
        '\treturn e.Err',
        '}',
        '',
        '// NewNotFound creates a not-found error.',
        'func NewNotFound(msg string) *AppError {',
        '\treturn &AppError{Code: 404, Message: msg, Err: ErrNotFound}',
        '}',
        '',
        '// IsNotFound checks if an error is not-found.',
        'func IsNotFound(err error) bool {',
        '\treturn errors.Is(err, ErrNotFound)',
        '}',
      ].join('\n');
      const model = await parse(content);

      // Imports
      expect(model.imports).toHaveLength(2);

      // Var exports (sentinel errors)
      expect(model.exports.find(e => e.name === 'ErrNotFound')).toBeDefined();
      expect(model.exports.find(e => e.name === 'ErrUnauthorized')).toBeDefined();
      expect(model.exports.find(e => e.name === 'ErrInternal')).toBeDefined();
      expect(model.exports.find(e => e.name === 'errPrivate')).toBeUndefined();

      // Struct
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('AppError');
      expect(model.classes[0].methods).toHaveLength(2);
      expect(model.classes[0].methods[0].name).toBe('Error');
      expect(model.classes[0].methods[1].name).toBe('Unwrap');

      // Functions
      expect(model.functions).toHaveLength(2);
      expect(model.functions[0].name).toBe('NewNotFound');
      expect(model.functions[1].name).toBe('IsNotFound');

      // Function calls
      expect(model.functionCalls.find(c => c.callee === 'errors.New')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'errors.Is')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'fmt.Sprintf')).toBeDefined();
    });

    it('parses a config struct with functional options pattern', async () => {
      const content = [
        'package config',
        '',
        'import "time"',
        '',
        '// Config holds application configuration.',
        'type Config struct {',
        '\tHost    string',
        '\tPort    int',
        '\tTimeout time.Duration',
        '\tdebug   bool',
        '}',
        '',
        '// Option configures a Config.',
        'type Option func(*Config)',
        '',
        '// WithHost sets the host.',
        'func WithHost(host string) Option {',
        '\treturn func(c *Config) {',
        '\t\tc.Host = host',
        '\t}',
        '}',
        '',
        '// WithPort sets the port.',
        'func WithPort(port int) Option {',
        '\treturn func(c *Config) {',
        '\t\tc.Port = port',
        '\t}',
        '}',
        '',
        '// WithTimeout sets the timeout.',
        'func WithTimeout(d time.Duration) Option {',
        '\treturn func(c *Config) {',
        '\t\tc.Timeout = d',
        '\t}',
        '}',
        '',
        '// New creates a Config with defaults and options.',
        'func New(opts ...Option) *Config {',
        '\tcfg := &Config{',
        '\t\tHost:    "localhost",',
        '\t\tPort:    8080,',
        '\t\tTimeout: 30 * time.Second,',
        '\t}',
        '\tfor _, opt := range opts {',
        '\t\topt(cfg)',
        '\t}',
        '\treturn cfg',
        '}',
      ].join('\n');
      const model = await parse(content);

      // Import
      expect(model.imports).toHaveLength(1);
      expect(model.imports[0].moduleSpecifier).toBe('time');

      // Struct
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('Config');
      expect(model.classes[0].isExported).toBe(true);
      expect(model.classes[0].methods).toHaveLength(0);

      // Functions: WithHost, WithPort, WithTimeout, New
      expect(model.functions).toHaveLength(4);
      expect(model.functions.map(f => f.name)).toEqual([
        'WithHost', 'WithPort', 'WithTimeout', 'New',
      ]);
      expect(model.functions.every(f => f.isExported)).toBe(true);
      expect(model.functions[3].parameterCount).toBe(1); // variadic counts as 1

      // Mutations inside closures
      expect(model.mutations.find(m => m.target === 'c.Host')).toBeDefined();
      expect(model.mutations.find(m => m.target === 'c.Port')).toBeDefined();
      expect(model.mutations.find(m => m.target === 'c.Timeout')).toBeDefined();

      // Exports
      const exportNames = model.exports.map(e => e.name).sort();
      expect(exportNames).toEqual(['Config', 'New', 'WithHost', 'WithPort', 'WithTimeout']);
    });

    it('parses a test helper file (idiomatic _test.go patterns)', async () => {
      const content = [
        'package service_test',
        '',
        'import (',
        '\t"context"',
        '\t"testing"',
        '',
        '\t"github.com/stretchr/testify/assert"',
        '\t"github.com/stretchr/testify/require"',
        ')',
        '',
        '// testHelper sets up common test state.',
        'func testHelper(t *testing.T) (*Service, func()) {',
        '\tt.Helper()',
        '\tsvc := NewService(nil)',
        '\tcleanup := func() {',
        '\t\tsvc.Close()',
        '\t}',
        '\treturn svc, cleanup',
        '}',
        '',
        'func TestCreate(t *testing.T) {',
        '\tsvc, cleanup := testHelper(t)',
        '\tdefer cleanup()',
        '',
        '\terr := svc.Create(context.Background(), "test")',
        '\trequire.NoError(t, err)',
        '\tassert.NotNil(t, svc)',
        '}',
        '',
        'func TestDelete(t *testing.T) {',
        '\tsvc, cleanup := testHelper(t)',
        '\tdefer cleanup()',
        '',
        '\terr := svc.Delete(context.Background(), "123")',
        '\tassert.NoError(t, err)',
        '}',
      ].join('\n');
      const model = await parse(content);

      // Imports
      expect(model.imports).toHaveLength(4);
      expect(model.imports.map(i => i.defaultImport)).toEqual([
        'context', 'testing', 'assert', 'require',
      ]);

      // Functions: testHelper (unexported), TestCreate, TestDelete (exported)
      expect(model.functions).toHaveLength(3);
      expect(model.functions[0].name).toBe('testHelper');
      expect(model.functions[0].isExported).toBe(false);
      expect(model.functions[1].name).toBe('TestCreate');
      expect(model.functions[1].isExported).toBe(true);
      expect(model.functions[2].name).toBe('TestDelete');
      expect(model.functions[2].isExported).toBe(true);

      // Function calls include test assertions
      expect(model.functionCalls.find(c => c.callee === 'require.NoError')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'assert.NotNil')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'assert.NoError')).toBeDefined();

      // No structs or interfaces
      expect(model.classes).toHaveLength(0);
      expect(model.interfaces).toHaveLength(0);
    });
  });

  describe('known limitations', () => {
    it('parses generic type parameters with tree-sitter', async () => {
      const content = [
        'package main',
        '',
        'type Container[T any] struct {',
        '\tItems []T',
        '}',
      ].join('\n');
      const model = await parse(content);
      // Tree-sitter AST parsing supports generics
      expect(model.classes).toHaveLength(1);
      expect(model.classes[0].name).toBe('Container');
    });

    it('parses grouped type declarations with tree-sitter', async () => {
      const content = [
        'package main',
        '',
        'type (',
        '\tFoo struct {',
        '\t\tName string',
        '\t}',
        '\tBar struct{}',
        ')',
      ].join('\n');
      const model = await parse(content);
      // Tree-sitter AST parsing supports grouped type blocks
      expect(model.classes).toHaveLength(2);
      expect(model.classes[0].name).toBe('Foo');
      expect(model.classes[1].name).toBe('Bar');
    });

    it('parses multi-line function signatures with tree-sitter', async () => {
      const content = [
        'package main',
        '',
        'func MultiLine(',
        '\ta int,',
        '\tb int,',
        ') int {',
        '\treturn a + b',
        '}',
      ].join('\n');
      const model = await parse(content);
      // Tree-sitter AST parsing supports multi-line signatures
      expect(model.functions).toHaveLength(1);
      expect(model.functions[0].name).toBe('MultiLine');
      expect(model.functions[0].parameterCount).toBe(2);
    });
  });

  describe('advanced patterns fixture', () => {
    // Tests that parse the comprehensive tests/fixtures/go/advanced_patterns.go file
    // to verify tree-sitter handles real-world advanced Go patterns

    it('parses the advanced_patterns.go fixture file', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'tests/fixtures/go/advanced_patterns.go');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const model = await validator.parseFile(fixturePath, content);

      // Basic validation that the file was parsed
      expect(model.lineCount).toBeGreaterThan(700);
      expect(model.language).toBe('go');
    });

    it('extracts generic types from advanced patterns', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'tests/fixtures/go/advanced_patterns.go');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const model = await validator.parseFile(fixturePath, content);

      // Verify generic types are parsed: Result[T], Cache[K, V], Container[T]
      const result = model.classes.find(c => c.name === 'Result');
      const cache = model.classes.find(c => c.name === 'Cache');
      const container = model.classes.find(c => c.name === 'Container');

      expect(result).toBeDefined();
      expect(cache).toBeDefined();
      expect(container).toBeDefined();
    });

    it('extracts interfaces with composition from advanced patterns', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'tests/fixtures/go/advanced_patterns.go');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const model = await validator.parseFile(fixturePath, content);

      // Verify interface composition: ReadWriter embeds Reader and Writer
      const readWriter = model.interfaces.find(i => i.name === 'ReadWriter');
      expect(readWriter).toBeDefined();
      expect(readWriter!.extends).toContain('Reader');
      expect(readWriter!.extends).toContain('Writer');

      // ReadWriteCloser embeds Reader, Writer, Closer
      const readWriteCloser = model.interfaces.find(i => i.name === 'ReadWriteCloser');
      expect(readWriteCloser).toBeDefined();
      expect(readWriteCloser!.extends).toHaveLength(3);
    });

    it('extracts struct embedding patterns from advanced patterns', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'tests/fixtures/go/advanced_patterns.go');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const model = await validator.parseFile(fixturePath, content);

      // User struct embeds BaseEntity, Auditable, SoftDeletable
      const user = model.classes.find(c => c.name === 'User');
      expect(user).toBeDefined();
      expect(user!.extends).toBe('BaseEntity');
      expect(user!.implements).toContain('Auditable');
      expect(user!.implements).toContain('SoftDeletable');
    });

    it('extracts functional options pattern functions', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'tests/fixtures/go/advanced_patterns.go');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const model = await validator.parseFile(fixturePath, content);

      // Verify functional options: WithHost, WithPort, WithTimeout, etc.
      const withHost = model.functions.find(f => f.name === 'WithHost');
      const withPort = model.functions.find(f => f.name === 'WithPort');
      const withTimeout = model.functions.find(f => f.name === 'WithTimeout');
      const newServer = model.functions.find(f => f.name === 'NewServer');

      expect(withHost).toBeDefined();
      expect(withHost!.isExported).toBe(true);
      expect(withPort).toBeDefined();
      expect(withTimeout).toBeDefined();
      expect(newServer).toBeDefined();
    });

    it('extracts builder pattern methods from advanced patterns', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'tests/fixtures/go/advanced_patterns.go');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const model = await validator.parseFile(fixturePath, content);

      // QueryBuilder has method chaining: Select, Where, OrderBy, Limit, Offset, Build
      const queryBuilder = model.classes.find(c => c.name === 'QueryBuilder');
      expect(queryBuilder).toBeDefined();

      const methodNames = queryBuilder!.methods.map(m => m.name);
      expect(methodNames).toContain('Select');
      expect(methodNames).toContain('Where');
      expect(methodNames).toContain('OrderBy');
      expect(methodNames).toContain('Limit');
      expect(methodNames).toContain('Build');
    });

    it('extracts multi-line function signatures from advanced patterns', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'tests/fixtures/go/advanced_patterns.go');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const model = await validator.parseFile(fixturePath, content);

      // ProcessBatch and CreateUserWithOptions have multi-line signatures
      const processBatch = model.functions.find(f => f.name === 'ProcessBatch');
      const createUserWithOptions = model.functions.find(f => f.name === 'CreateUserWithOptions');

      expect(processBatch).toBeDefined();
      expect(processBatch!.parameterCount).toBeGreaterThanOrEqual(5);

      expect(createUserWithOptions).toBeDefined();
      expect(createUserWithOptions!.parameterCount).toBeGreaterThanOrEqual(4);
    });

    it('extracts worker pool generic struct from advanced patterns', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'tests/fixtures/go/advanced_patterns.go');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const model = await validator.parseFile(fixturePath, content);

      // WorkerPool[T, R] is a generic struct
      const workerPool = model.classes.find(c => c.name === 'WorkerPool');
      expect(workerPool).toBeDefined();
      expect(workerPool!.isExported).toBe(true);

      // Note: Methods on generic receivers (like *WorkerPool[T, R]) may not be
      // attached due to the generic type parameters in the receiver
      // This is a known limitation that could be addressed in future
    });

    it('extracts sentinel errors as exported variables', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'tests/fixtures/go/advanced_patterns.go');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const model = await validator.parseFile(fixturePath, content);

      // ErrNotFound, ErrInvalidInput, ErrTimeout are exported
      const errNotFound = model.exports.find(e => e.name === 'ErrNotFound');
      const errInvalidInput = model.exports.find(e => e.name === 'ErrInvalidInput');
      const errTimeout = model.exports.find(e => e.name === 'ErrTimeout');

      expect(errNotFound).toBeDefined();
      expect(errInvalidInput).toBeDefined();
      expect(errTimeout).toBeDefined();

      // errInternal is unexported, should not be in exports
      const errInternal = model.exports.find(e => e.name === 'errInternal');
      expect(errInternal).toBeUndefined();
    });

    it('extracts middleware pattern functions', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'tests/fixtures/go/advanced_patterns.go');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const model = await validator.parseFile(fixturePath, content);

      // Chain, LoggingMiddleware, TimeoutMiddleware are middleware functions
      const chain = model.functions.find(f => f.name === 'Chain');
      const loggingMiddleware = model.functions.find(f => f.name === 'LoggingMiddleware');
      const timeoutMiddleware = model.functions.find(f => f.name === 'TimeoutMiddleware');

      expect(chain).toBeDefined();
      expect(loggingMiddleware).toBeDefined();
      expect(timeoutMiddleware).toBeDefined();
    });
  });
});
