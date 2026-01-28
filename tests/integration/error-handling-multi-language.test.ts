/**
 * @arch archcodex.test.integration
 *
 * Error handling tests for Python and Go language support.
 * Tests graceful degradation for syntax errors, malformed tags, edge cases.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ValidationEngine } from '../../src/core/validation/engine.js';
import { getDefaultConfig } from '../../src/core/config/loader.js';
import { PythonValidator } from '../../src/validators/python.js';
import { GoValidator } from '../../src/validators/go.js';
import type { Registry, ArchitectureNode } from '../../src/core/registry/schema.js';
import type { Config } from '../../src/core/config/schema.js';

describe('Error Handling - Multi-language', () => {
  let tempDir: string;
  let testRegistry: Registry;
  let testConfig: Config;

  const createTestRegistry = (): Registry => {
    const baseNode: ArchitectureNode = {
      description: 'Base architecture',
      hints: [],
    };

    return {
      nodes: {
        base: baseNode,
        'test.arch': {
          inherits: 'base',
          description: 'Test architecture',
          hints: [],
        },
      },
      mixins: {},
    };
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-error-'));
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    testRegistry = createTestRegistry();
    testConfig = getDefaultConfig();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Python error handling', () => {
    describe('Syntax errors', () => {
      it('should handle Python file with syntax error gracefully', async () => {
        const content = `# @arch test.arch
def broken(
    # Missing closing parenthesis
    pass
`;
        await fs.writeFile(path.join(tempDir, 'src', 'broken.py'), content);

        // The validator should not crash
        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'broken.py'), content);
        validator.dispose();

        // Should return a model (even if minimal)
        expect(result).toBeDefined();
        expect(result.language).toBe('python');
      });

      it('should handle Python file with indentation error', async () => {
        const content = `# @arch test.arch
def func():
pass  # Wrong indentation
`;
        await fs.writeFile(path.join(tempDir, 'src', 'indent.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'indent.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.language).toBe('python');
      });

      it('should handle Python file with incomplete class', async () => {
        const content = `# @arch test.arch
class Incomplete(
    # Missing closing paren and body
`;
        await fs.writeFile(path.join(tempDir, 'src', 'incomplete.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'incomplete.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });
    });

    describe('Empty and minimal files', () => {
      it('should handle empty Python file', async () => {
        await fs.writeFile(path.join(tempDir, 'src', 'empty.py'), '');

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'empty.py'), '');
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.language).toBe('python');
        expect(result.lineCount).toBe(0);
      });

      it('should handle Python file with only comments', async () => {
        const content = `# Just a comment
# Another comment
`;
        await fs.writeFile(path.join(tempDir, 'src', 'comments.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'comments.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.classes).toHaveLength(0);
        expect(result.functions).toHaveLength(0);
      });

      it('should handle Python file with only docstring', async () => {
        const content = `"""
This is just a module docstring.
Nothing else here.
"""
`;
        await fs.writeFile(path.join(tempDir, 'src', 'docstring.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'docstring.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });
    });

    describe('Malformed @arch tags', () => {
      it('should handle Python file with incomplete @arch tag', async () => {
        const content = `# @arch
def func():
    pass
`;
        await fs.writeFile(path.join(tempDir, 'src', 'incomplete_tag.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
        // Should not crash - may report as untagged or error
        const result = await engine.validateFile('src/incomplete_tag.py');
        engine.dispose();

        expect(result).toBeDefined();
      });

      it('should handle Python file with malformed @arch syntax', async () => {
        const content = `# @arch: test.arch  # Colon instead of space
def func():
    pass
`;
        await fs.writeFile(path.join(tempDir, 'src', 'malformed.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
        const result = await engine.validateFile('src/malformed.py');
        engine.dispose();

        expect(result).toBeDefined();
      });
    });

    describe('Edge cases', () => {
      it('should handle Python file with very long lines', async () => {
        const longString = 'x' .repeat(10000);
        const content = `# @arch test.arch
LONG_VAR = "${longString}"
`;
        await fs.writeFile(path.join(tempDir, 'src', 'long_line.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'long_line.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });

      it('should handle Python file with unicode content', async () => {
        const content = `# @arch test.arch
# -*- coding: utf-8 -*-
"""日本語のドキュメント"""

def greet():
    return "こんにちは世界"

class Émoji:
    def 🎉(self):
        pass
`;
        await fs.writeFile(path.join(tempDir, 'src', 'unicode.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'unicode.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.functions.length).toBeGreaterThanOrEqual(1);
      });

      it('should handle Python file with mixed line endings', async () => {
        const content = '# @arch test.arch\r\ndef func1():\r\n    pass\ndef func2():\n    pass\r';
        await fs.writeFile(path.join(tempDir, 'src', 'mixed_endings.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'mixed_endings.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });
    });
  });

  describe('Go error handling', () => {
    describe('Syntax errors', () => {
      it('should handle Go file with syntax error gracefully', async () => {
        const content = `// @arch test.arch
package main

func broken( {
	// Missing closing paren
}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'broken.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'broken.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.language).toBe('go');
      });

      it('should handle Go file with missing package declaration', async () => {
        const content = `// @arch test.arch
func main() {
	println("no package")
}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'no_pkg.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'no_pkg.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });

      it('should handle Go file with incomplete struct', async () => {
        const content = `// @arch test.arch
package main

type Incomplete struct {
	Name string
	// Missing closing brace
`;
        await fs.writeFile(path.join(tempDir, 'src', 'incomplete.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'incomplete.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });
    });

    describe('Empty and minimal files', () => {
      it('should handle empty Go file', async () => {
        await fs.writeFile(path.join(tempDir, 'src', 'empty.go'), '');

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'empty.go'), '');
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.language).toBe('go');
        expect(result.lineCount).toBe(0);
      });

      it('should handle Go file with only comments', async () => {
        const content = `// Just a comment
// Another comment
/* Block comment */
`;
        await fs.writeFile(path.join(tempDir, 'src', 'comments.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'comments.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.classes).toHaveLength(0);
        expect(result.functions).toHaveLength(0);
      });

      it('should handle Go file with only package declaration', async () => {
        const content = `package main
`;
        await fs.writeFile(path.join(tempDir, 'src', 'minimal.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'minimal.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });
    });

    describe('Malformed @arch tags', () => {
      it('should handle Go file with incomplete @arch tag', async () => {
        const content = `// @arch
package main

func main() {}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'incomplete_tag.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
        const result = await engine.validateFile('src/incomplete_tag.go');
        engine.dispose();

        expect(result).toBeDefined();
      });

      it('should handle Go file with @arch in wrong location', async () => {
        const content = `package main

// @arch test.arch
// Tag after package declaration

func main() {}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'wrong_location.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
        const result = await engine.validateFile('src/wrong_location.go');
        engine.dispose();

        expect(result).toBeDefined();
      });
    });

    describe('Edge cases', () => {
      it('should handle Go file with very long lines', async () => {
        const longString = 'x'.repeat(10000);
        const content = `// @arch test.arch
package main

var longVar = "${longString}"
`;
        await fs.writeFile(path.join(tempDir, 'src', 'long_line.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'long_line.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });

      it('should handle Go file with unicode content', async () => {
        const content = `// @arch test.arch
package main

// 日本語コメント
func Greet() string {
	return "こんにちは世界"
}

type 日本語 struct {
	名前 string
}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'unicode.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'unicode.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });

      it('should handle Go file with raw strings containing code-like patterns', async () => {
        const content = `// @arch test.arch
package main

var rawCode = \`
func fake() {
	import "os"
	class NotReal {}
}
\`
`;
        await fs.writeFile(path.join(tempDir, 'src', 'raw_string.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'raw_string.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
        // Should not extract fake imports/classes from raw string
        expect(result.imports.some(i => i.moduleSpecifier === 'os')).toBe(false);
      });

      it('should handle Go file with build constraints', async () => {
        const content = `//go:build linux && amd64
// +build linux,amd64

// @arch test.arch
package platform

func LinuxAMD64Only() {}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'build_constraints.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'build_constraints.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.functions.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Advanced error recovery', () => {
    describe('Partial parse recovery', () => {
      it('should extract valid elements from Python file with one broken function', async () => {
        const content = `# @arch test.arch

class ValidClass:
    """This class should be extracted."""
    def __init__(self):
        self.value = 0

def broken_function(
    # This function is broken

def valid_function():
    """This should still be extracted."""
    return 42

class AnotherValidClass:
    pass
`;
        await fs.writeFile(path.join(tempDir, 'src', 'partial.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'partial.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
        // Should recover and extract at least some valid elements
        // Tree-sitter is error-tolerant, so we expect partial results
        expect(result.classes.length).toBeGreaterThanOrEqual(1);
      });

      it('should extract valid elements from Go file with one broken struct', async () => {
        const content = `// @arch test.arch
package main

type ValidStruct struct {
	Name string
}

type BrokenStruct struct {
	// Missing closing brace

type AnotherValidStruct struct {
	ID int
}

func ValidFunction() {
	println("hello")
}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'partial.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'partial.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
        // Should recover and extract at least some valid elements
        expect(result.classes.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Binary and non-text content', () => {
      it('should handle binary content in Python file gracefully', async () => {
        // Create a file with binary content (null bytes, etc.)
        const binaryBuffer = Buffer.from([
          0x23, 0x20, 0x40, 0x61, 0x72, 0x63, 0x68, 0x20, // "# @arch "
          0x74, 0x65, 0x73, 0x74, 0x0a,                   // "test\n"
          0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd,             // Binary bytes
          0x64, 0x65, 0x66, 0x20, 0x66, 0x28, 0x29, 0x3a, // "def f():"
          0x0a, 0x20, 0x20, 0x70, 0x61, 0x73, 0x73,       // "\n  pass"
        ]);
        await fs.writeFile(path.join(tempDir, 'src', 'binary.py'), binaryBuffer);

        const validator = new PythonValidator();
        try {
          const result = await validator.parseFile(path.join(tempDir, 'src', 'binary.py'));
          validator.dispose();
          // Should return some result without crashing
          expect(result).toBeDefined();
        } catch {
          validator.dispose();
          // Throwing is also acceptable for binary content
          expect(true).toBe(true);
        }
      });

      it('should handle binary content in Go file gracefully', async () => {
        const binaryBuffer = Buffer.from([
          0x2f, 0x2f, 0x20, 0x40, 0x61, 0x72, 0x63, 0x68, // "// @arch"
          0x0a, 0x70, 0x61, 0x63, 0x6b, 0x61, 0x67, 0x65, // "\npackage"
          0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd,             // Binary bytes
        ]);
        await fs.writeFile(path.join(tempDir, 'src', 'binary.go'), binaryBuffer);

        const validator = new GoValidator();
        try {
          const result = await validator.parseFile(path.join(tempDir, 'src', 'binary.go'));
          validator.dispose();
          expect(result).toBeDefined();
        } catch {
          validator.dispose();
          expect(true).toBe(true);
        }
      });
    });

    describe('Extreme content', () => {
      it('should handle Python file with extremely long identifier', async () => {
        const longName = 'a'.repeat(5000);
        const content = `# @arch test.arch

def ${longName}():
    pass

class ${longName}Class:
    pass
`;
        await fs.writeFile(path.join(tempDir, 'src', 'long_names.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'long_names.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.functions.length).toBe(1);
        expect(result.classes.length).toBe(1);
      });

      it('should handle Go file with extremely long identifier', async () => {
        const longName = 'A' + 'a'.repeat(4999);
        const content = `// @arch test.arch
package main

type ${longName} struct {
	Value int
}

func ${longName}Func() {}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'long_names.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'long_names.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });

      it('should handle Python file with deeply nested string', async () => {
        const content = `# @arch test.arch

# Nested quotes
data = """
This has 'single' and "double" quotes.
And \"""triple quotes\""" inside.
"""

def func():
    return data
`;
        await fs.writeFile(path.join(tempDir, 'src', 'nested_strings.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'nested_strings.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.functions.length).toBe(1);
      });

      it('should handle Go file with deeply nested raw string', async () => {
        const content = '// @arch test.arch\npackage main\n\nvar data = `\nNested content with "quotes" and \'single\' quotes.\nAnd backticks cannot be nested but this is fine.\n`\n\nfunc main() {}\n';
        await fs.writeFile(path.join(tempDir, 'src', 'nested_strings.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'nested_strings.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.functions.length).toBe(1);
      });
    });

    describe('Mixed line endings', () => {
      it('should handle Go file with mixed line endings', async () => {
        const content = '// @arch test.arch\r\npackage main\r\n\nfunc func1() {}\r\nfunc func2() {}\n';
        await fs.writeFile(path.join(tempDir, 'src', 'mixed_endings.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'mixed_endings.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.functions.length).toBe(2);
      });

      it('should handle Python file with only carriage returns', async () => {
        const content = '# @arch test.arch\rdef func1():\r    pass\rdef func2():\r    pass\r';
        await fs.writeFile(path.join(tempDir, 'src', 'cr_only.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'cr_only.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });
    });

    describe('Whitespace edge cases', () => {
      it('should handle Python file with tabs and spaces mixed', async () => {
        const content = `# @arch test.arch

class Mixed:
\tdef tab_indented(self):
\t\treturn 1
        def space_indented(self):
                return 2
`;
        await fs.writeFile(path.join(tempDir, 'src', 'mixed_whitespace.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'mixed_whitespace.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
      });

      it('should handle Go file with unusual whitespace', async () => {
        const content = `// @arch test.arch
package main

type\tTabbed\tstruct\t{
\tName\tstring
}

func      SpacedFunc     ()     {
}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'unusual_whitespace.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'unusual_whitespace.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.classes.length).toBe(1);
        expect(result.functions.length).toBe(1);
      });

      it('should handle file with trailing whitespace on every line', async () => {
        const content = `# @arch test.arch   \n\ndef func():   \n    pass   \n\nclass Cls:   \n    pass   \n`;
        await fs.writeFile(path.join(tempDir, 'src', 'trailing_ws.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'trailing_ws.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.functions.length).toBe(1);
        expect(result.classes.length).toBe(1);
      });
    });

    describe('Special characters', () => {
      it('should handle Python file with escape sequences', async () => {
        const content = `# @arch test.arch

def escapes():
    return "\\n\\t\\r\\0\\x00\\u0000"

class EscapeClass:
    data = b'\\xff\\xfe'
`;
        await fs.writeFile(path.join(tempDir, 'src', 'escapes.py'), content);

        const validator = new PythonValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'escapes.py'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.functions.length).toBe(1);
        expect(result.classes.length).toBe(1);
      });

      it('should handle Go file with escape sequences', async () => {
        const content = `// @arch test.arch
package main

func escapes() string {
	return "\\n\\t\\r\\x00\\u0000"
}

var data = []byte{0x00, 0xff, 0xfe}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'escapes.go'), content);

        const validator = new GoValidator();
        const result = await validator.parseFile(path.join(tempDir, 'src', 'escapes.go'), content);
        validator.dispose();

        expect(result).toBeDefined();
        expect(result.functions.length).toBe(1);
      });
    });
  });

  describe('Validation engine error handling', () => {
    it('should handle non-existent file gracefully', async () => {
      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);

      // Attempt to validate non-existent file
      try {
        await engine.validateFile('src/does_not_exist.py');
        // If it doesn't throw, that's also acceptable
      } catch (error) {
        // Expected to throw - file doesn't exist
        expect(error).toBeDefined();
      }

      engine.dispose();
    });

    it('should handle directory instead of file', async () => {
      await fs.mkdir(path.join(tempDir, 'src', 'subdir'), { recursive: true });

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);

      try {
        await engine.validateFile('src/subdir');
        // Might succeed with empty result or throw
      } catch (error) {
        expect(error).toBeDefined();
      }

      engine.dispose();
    });

    it('should handle batch validation with mixed valid/invalid files', async () => {
      // Create one valid file
      await fs.writeFile(
        path.join(tempDir, 'src', 'valid.py'),
        `# @arch test.arch
def valid(): pass
`
      );

      // Create one file with syntax error
      await fs.writeFile(
        path.join(tempDir, 'src', 'invalid.py'),
        `# @arch test.arch
def broken(
`
      );

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles(['src/valid.py', 'src/invalid.py']);
      engine.dispose();

      // Should get results for both files without crashing
      expect(results.results).toHaveLength(2);
    });
  });
});
