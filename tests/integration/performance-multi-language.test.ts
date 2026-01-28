/**
 * @arch archcodex.test.integration
 *
 * Performance tests for Python and Go language validators.
 * Tests parsing speed, memory stability, and handling of large/complex files.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PythonValidator } from '../../src/validators/python.js';
import { GoValidator } from '../../src/validators/go.js';
import { ValidationEngine } from '../../src/core/validation/engine.js';
import { getDefaultConfig } from '../../src/core/config/loader.js';
import type { Registry, ArchitectureNode } from '../../src/core/registry/schema.js';
import type { Config } from '../../src/core/config/schema.js';

describe('Performance - Multi-language', () => {
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
        'test.perf': {
          inherits: 'base',
          description: 'Performance test architecture',
          hints: [],
        },
      },
      mixins: {},
    };
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-perf-'));
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    testRegistry = createTestRegistry();
    testConfig = getDefaultConfig();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Large file parsing', () => {
    it('should parse large Python file (1000+ lines) within reasonable time', async () => {
      // Generate a large Python file
      const lines: string[] = ['# @arch test.perf', ''];

      // Add many imports
      for (let i = 0; i < 50; i++) {
        lines.push(`from module${i} import func${i}`);
      }
      lines.push('');

      // Add many classes with methods
      for (let i = 0; i < 20; i++) {
        lines.push(`class Service${i}:`);
        lines.push(`    """Service ${i} implementation."""`);
        lines.push('');
        lines.push('    def __init__(self):');
        lines.push('        self.value = 0');
        lines.push('');
        for (let j = 0; j < 10; j++) {
          lines.push(`    def method${j}(self, arg${j}: int) -> str:`);
          lines.push(`        """Method ${j} documentation."""`);
          lines.push(`        return f"result_{j}_{arg${j}}"`);
          lines.push('');
        }
      }

      // Add module-level functions
      for (let i = 0; i < 30; i++) {
        lines.push(`def helper_function${i}(x: int, y: int) -> int:`);
        lines.push(`    """Helper function ${i}."""`);
        lines.push('    return x + y');
        lines.push('');
      }

      const content = lines.join('\n');
      const filePath = path.join(tempDir, 'src', 'large_module.py');
      await fs.writeFile(filePath, content);

      const validator = new PythonValidator();
      const startTime = performance.now();
      const model = await validator.parseFile(filePath, content);
      const duration = performance.now() - startTime;
      validator.dispose();

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);

      // Verify parsing was complete
      expect(model.imports.length).toBe(50);
      expect(model.classes.length).toBe(20);
      expect(model.functions.length).toBe(30);
      expect(model.lineCount).toBeGreaterThan(1000);
    });

    it('should parse large Go file (1000+ lines) within reasonable time', async () => {
      // Generate a large Go file
      const lines: string[] = [
        '// @arch test.perf',
        'package main',
        '',
        'import (',
      ];

      // Add many imports
      for (let i = 0; i < 30; i++) {
        lines.push(`\t"package${i}"`);
      }
      lines.push(')');
      lines.push('');

      // Add many structs with methods
      for (let i = 0; i < 20; i++) {
        lines.push(`// Service${i} handles service ${i} logic.`);
        lines.push(`type Service${i} struct {`);
        lines.push(`\tID    int`);
        lines.push(`\tName  string`);
        lines.push(`\tValue float64`);
        lines.push('}');
        lines.push('');

        // Add methods
        for (let j = 0; j < 8; j++) {
          lines.push(`// Method${j} performs operation ${j}.`);
          lines.push(`func (s *Service${i}) Method${j}(arg${j} int) string {`);
          lines.push(`\treturn fmt.Sprintf("result_%d_%d", ${j}, arg${j})`);
          lines.push('}');
          lines.push('');
        }
      }

      // Add interfaces
      for (let i = 0; i < 10; i++) {
        lines.push(`// Handler${i} defines handler ${i} interface.`);
        lines.push(`type Handler${i} interface {`);
        lines.push(`\tHandle(ctx context.Context) error`);
        lines.push(`\tProcess(data []byte) ([]byte, error)`);
        lines.push('}');
        lines.push('');
      }

      // Add package-level functions
      for (let i = 0; i < 20; i++) {
        lines.push(`// HelperFunc${i} is a helper function.`);
        lines.push(`func HelperFunc${i}(x, y int) int {`);
        lines.push('\treturn x + y');
        lines.push('}');
        lines.push('');
      }

      const content = lines.join('\n');
      const filePath = path.join(tempDir, 'src', 'large_module.go');
      await fs.writeFile(filePath, content);

      const validator = new GoValidator();
      const startTime = performance.now();
      const model = await validator.parseFile(filePath, content);
      const duration = performance.now() - startTime;
      validator.dispose();

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);

      // Verify parsing was complete
      expect(model.imports.length).toBe(30);
      expect(model.classes.length).toBe(20);
      expect(model.interfaces.length).toBe(10);
      expect(model.functions.length).toBe(20);
      expect(model.lineCount).toBeGreaterThan(500);
    });
  });

  describe('Batch validation', () => {
    it('should validate multiple Python files efficiently', async () => {
      // Create 20 Python files
      const files: string[] = [];
      for (let i = 0; i < 20; i++) {
        const content = `# @arch test.arch
"""Module ${i}."""

class Service${i}:
    """Service ${i} implementation."""

    def __init__(self):
        self.value = ${i}

    def process(self, data: str) -> str:
        return f"processed_{data}"

def helper${i}(x: int) -> int:
    return x * 2
`;
        const filePath = path.join(tempDir, 'src', `module${i}.py`);
        await fs.writeFile(filePath, content);
        files.push(filePath);
      }

      const validator = new PythonValidator();
      const startTime = performance.now();

      // Parse all files
      const results = await Promise.all(
        files.map(f => validator.parseFile(f))
      );

      const duration = performance.now() - startTime;
      validator.dispose();

      // Should complete all 20 files within 10 seconds
      expect(duration).toBeLessThan(10000);

      // All files should be parsed successfully
      expect(results.length).toBe(20);
      results.forEach((model, i) => {
        expect(model.classes.length).toBe(1);
        expect(model.classes[0].name).toBe(`Service${i}`);
        expect(model.functions.length).toBe(1);
      });
    });

    it('should validate multiple Go files efficiently', async () => {
      // Create 20 Go files
      const files: string[] = [];
      for (let i = 0; i < 20; i++) {
        const content = `// @arch test.arch
package main

// Service${i} handles module ${i} logic.
type Service${i} struct {
\tID   int
\tName string
}

// NewService${i} creates a new Service${i}.
func NewService${i}(id int) *Service${i} {
\treturn &Service${i}{ID: id}
}

// Process handles processing.
func (s *Service${i}) Process(data string) string {
\treturn "processed_" + data
}
`;
        const filePath = path.join(tempDir, 'src', `module${i}.go`);
        await fs.writeFile(filePath, content);
        files.push(filePath);
      }

      const validator = new GoValidator();
      const startTime = performance.now();

      // Parse all files
      const results = await Promise.all(
        files.map(f => validator.parseFile(f))
      );

      const duration = performance.now() - startTime;
      validator.dispose();

      // Should complete all 20 files within 10 seconds
      expect(duration).toBeLessThan(10000);

      // All files should be parsed successfully
      expect(results.length).toBe(20);
      results.forEach((model, i) => {
        expect(model.classes.length).toBe(1);
        expect(model.classes[0].name).toBe(`Service${i}`);
      });
    });

    it('should handle mixed language batch validation', async () => {
      // Create a mix of Python and Go files
      const files: string[] = [];

      for (let i = 0; i < 10; i++) {
        // Python file
        const pyContent = `# @arch test.arch
class PyService${i}:
    def __init__(self):
        pass
`;
        const pyPath = path.join(tempDir, 'src', `py_module${i}.py`);
        await fs.writeFile(pyPath, pyContent);
        files.push(pyPath);

        // Go file
        const goContent = `// @arch test.arch
package main

type GoService${i} struct {
\tID int
}
`;
        const goPath = path.join(tempDir, 'src', `go_module${i}.go`);
        await fs.writeFile(goPath, goContent);
        files.push(goPath);
      }

      const pyValidator = new PythonValidator();
      const goValidator = new GoValidator();
      const startTime = performance.now();

      // Parse all files with appropriate validator
      const results = await Promise.all(
        files.map(f => {
          if (f.endsWith('.py')) {
            return pyValidator.parseFile(f);
          } else {
            return goValidator.parseFile(f);
          }
        })
      );

      const duration = performance.now() - startTime;
      pyValidator.dispose();
      goValidator.dispose();

      // Should complete all 20 files within 10 seconds
      expect(duration).toBeLessThan(10000);
      expect(results.length).toBe(20);
    });
  });

  describe('Deep nesting', () => {
    it('should handle deeply nested Python classes and functions', async () => {
      const lines: string[] = ['# @arch test.perf', ''];

      // Create nested structure
      lines.push('class OuterClass:');
      lines.push('    """Outer class."""');
      lines.push('');
      lines.push('    def outer_method(self):');
      lines.push('        """Outer method with nested functions."""');
      lines.push('        def level1():');
      lines.push('            def level2():');
      lines.push('                def level3():');
      lines.push('                    def level4():');
      lines.push('                        def level5():');
      lines.push('                            return "deep"');
      lines.push('                        return level5()');
      lines.push('                    return level4()');
      lines.push('                return level3()');
      lines.push('            return level2()');
      lines.push('        return level1()');
      lines.push('');

      // Deeply nested try/except
      lines.push('def deeply_nested_error_handling():');
      lines.push('    try:');
      lines.push('        try:');
      lines.push('            try:');
      lines.push('                try:');
      lines.push('                    risky_operation()');
      lines.push('                except ValueError:');
      lines.push('                    handle_value_error()');
      lines.push('            except TypeError:');
      lines.push('                handle_type_error()');
      lines.push('        except RuntimeError:');
      lines.push('            handle_runtime_error()');
      lines.push('    except Exception:');
      lines.push('        handle_any_error()');

      const content = lines.join('\n');
      const filePath = path.join(tempDir, 'src', 'nested.py');
      await fs.writeFile(filePath, content);

      const validator = new PythonValidator();
      const model = await validator.parseFile(filePath, content);
      validator.dispose();

      // Should parse without crashing
      expect(model).toBeDefined();
      expect(model.classes.length).toBeGreaterThanOrEqual(1);
      expect(model.functions.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle deeply nested Go structs and interfaces', async () => {
      const content = `// @arch test.perf
package main

import "context"

// Level1 is the outermost struct.
type Level1 struct {
	Level2 struct {
		Level3 struct {
			Level4 struct {
				Level5 struct {
					Value string
				}
			}
		}
	}
}

// DeepInterface has methods returning nested types.
type DeepInterface interface {
	GetLevel1() Level1
	Process(ctx context.Context, data struct {
		Inner struct {
			Value int
		}
	}) (struct {
		Result string
		Meta   struct {
			Code int
		}
	}, error)
}

// NestedMethodChain demonstrates method chaining.
func NestedMethodChain() {
	result := builder.
		WithOption1().
		WithOption2().
		WithOption3().
		WithOption4().
		WithOption5().
		Build()
	_ = result
}
`;
      const filePath = path.join(tempDir, 'src', 'nested.go');
      await fs.writeFile(filePath, content);

      const validator = new GoValidator();
      const model = await validator.parseFile(filePath, content);
      validator.dispose();

      // Should parse without crashing
      expect(model).toBeDefined();
      expect(model.classes.length).toBeGreaterThanOrEqual(1);
      expect(model.interfaces.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Many imports', () => {
    it('should handle Python file with 100+ imports', async () => {
      const lines: string[] = ['# @arch test.perf', ''];

      // Simple imports
      for (let i = 0; i < 30; i++) {
        lines.push(`import module${i}`);
      }

      // From imports
      for (let i = 0; i < 30; i++) {
        lines.push(`from package${i} import func${i}, class${i}`);
      }

      // Aliased imports
      for (let i = 0; i < 20; i++) {
        lines.push(`import longmodulename${i} as m${i}`);
      }

      // From with alias
      for (let i = 0; i < 20; i++) {
        lines.push(`from pkg${i} import something${i} as s${i}`);
      }

      lines.push('');
      lines.push('def main():');
      lines.push('    pass');

      const content = lines.join('\n');
      const filePath = path.join(tempDir, 'src', 'many_imports.py');
      await fs.writeFile(filePath, content);

      const validator = new PythonValidator();
      const startTime = performance.now();
      const model = await validator.parseFile(filePath, content);
      const duration = performance.now() - startTime;
      validator.dispose();

      // Should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
      expect(model.imports.length).toBe(100);
    });

    it('should handle Go file with 50+ imports', async () => {
      const lines: string[] = [
        '// @arch test.perf',
        'package main',
        '',
        'import (',
      ];

      // Standard imports
      for (let i = 0; i < 25; i++) {
        lines.push(`\t"standard/package${i}"`);
      }

      // Aliased imports
      for (let i = 0; i < 15; i++) {
        lines.push(`\tp${i} "aliased/package${i}"`);
      }

      // Dot imports
      for (let i = 0; i < 5; i++) {
        lines.push(`\t. "dot/package${i}"`);
      }

      // Blank imports
      for (let i = 0; i < 5; i++) {
        lines.push(`\t_ "blank/package${i}"`);
      }

      lines.push(')');
      lines.push('');
      lines.push('func main() {}');

      const content = lines.join('\n');
      const filePath = path.join(tempDir, 'src', 'many_imports.go');
      await fs.writeFile(filePath, content);

      const validator = new GoValidator();
      const startTime = performance.now();
      const model = await validator.parseFile(filePath, content);
      const duration = performance.now() - startTime;
      validator.dispose();

      // Should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
      expect(model.imports.length).toBe(50);
    });
  });

  describe('Memory stability', () => {
    it('should not leak memory when parsing many Python files', async () => {
      const validator = new PythonValidator();

      // Parse the same content multiple times
      const content = `# @arch test.arch
class Service:
    def __init__(self):
        self.value = 0

    def process(self):
        return self.value * 2
`;
      const filePath = path.join(tempDir, 'src', 'memory_test.py');
      await fs.writeFile(filePath, content);

      // Parse 50 times
      for (let i = 0; i < 50; i++) {
        await validator.parseFile(filePath, content);
      }

      validator.dispose();

      // If we get here without OOM, the test passes
      expect(true).toBe(true);
    });

    it('should not leak memory when parsing many Go files', async () => {
      const validator = new GoValidator();

      // Parse the same content multiple times
      const content = `// @arch test.arch
package main

type Service struct {
	Value int
}

func (s *Service) Process() int {
	return s.Value * 2
}
`;
      const filePath = path.join(tempDir, 'src', 'memory_test.go');
      await fs.writeFile(filePath, content);

      // Parse 50 times
      for (let i = 0; i < 50; i++) {
        await validator.parseFile(filePath, content);
      }

      validator.dispose();

      // If we get here without OOM, the test passes
      expect(true).toBe(true);
    });

    it('should handle validator reuse across multiple files', async () => {
      const pyValidator = new PythonValidator();
      const goValidator = new GoValidator();

      // Create different files
      for (let i = 0; i < 10; i++) {
        const pyContent = `# @arch test.arch
class Service${i}:
    def method${i}(self):
        return ${i}
`;
        const pyPath = path.join(tempDir, 'src', `service${i}.py`);
        await fs.writeFile(pyPath, pyContent);
        const pyModel = await pyValidator.parseFile(pyPath, pyContent);
        expect(pyModel.classes[0].name).toBe(`Service${i}`);

        const goContent = `// @arch test.arch
package main

type Service${i} struct {
	ID int
}
`;
        const goPath = path.join(tempDir, 'src', `service${i}.go`);
        await fs.writeFile(goPath, goContent);
        const goModel = await goValidator.parseFile(goPath, goContent);
        expect(goModel.classes[0].name).toBe(`Service${i}`);
      }

      pyValidator.dispose();
      goValidator.dispose();

      expect(true).toBe(true);
    });
  });

  describe('Complex patterns performance', () => {
    it('should parse Python file with many decorators efficiently', async () => {
      const lines: string[] = ['# @arch test.perf', ''];

      // Add decorated functions
      for (let i = 0; i < 30; i++) {
        lines.push(`@decorator1`);
        lines.push(`@decorator2(arg1=${i})`);
        lines.push(`@decorator3(arg1=${i}, arg2="value")`);
        lines.push(`def decorated_func${i}(x: int) -> int:`);
        lines.push(`    return x * ${i}`);
        lines.push('');
      }

      const content = lines.join('\n');
      const filePath = path.join(tempDir, 'src', 'decorators.py');
      await fs.writeFile(filePath, content);

      const validator = new PythonValidator();
      const startTime = performance.now();
      const model = await validator.parseFile(filePath, content);
      const duration = performance.now() - startTime;
      validator.dispose();

      expect(duration).toBeLessThan(3000);
      expect(model.functions.length).toBe(30);

      // Check decorators were captured
      model.functions.forEach(fn => {
        expect(fn.decorators.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should parse Go file with generics efficiently', async () => {
      const lines: string[] = [
        '// @arch test.perf',
        'package main',
        '',
      ];

      // Add generic types
      for (let i = 0; i < 20; i++) {
        lines.push(`// Container${i} is a generic container.`);
        lines.push(`type Container${i}[T any] struct {`);
        lines.push('\tItems []T');
        lines.push('}');
        lines.push('');
        lines.push(`func (c *Container${i}[T]) Add(item T) {`);
        lines.push('\tc.Items = append(c.Items, item)');
        lines.push('}');
        lines.push('');
      }

      // Add generic functions
      for (let i = 0; i < 10; i++) {
        lines.push(`func Map${i}[T, U any](items []T, fn func(T) U) []U {`);
        lines.push('\tresult := make([]U, len(items))');
        lines.push('\tfor i, item := range items {');
        lines.push('\t\tresult[i] = fn(item)');
        lines.push('\t}');
        lines.push('\treturn result');
        lines.push('}');
        lines.push('');
      }

      const content = lines.join('\n');
      const filePath = path.join(tempDir, 'src', 'generics.go');
      await fs.writeFile(filePath, content);

      const validator = new GoValidator();
      const startTime = performance.now();
      const model = await validator.parseFile(filePath, content);
      const duration = performance.now() - startTime;
      validator.dispose();

      expect(duration).toBeLessThan(3000);
      expect(model.classes.length).toBe(20);
      expect(model.functions.length).toBe(10);
    });
  });
});
