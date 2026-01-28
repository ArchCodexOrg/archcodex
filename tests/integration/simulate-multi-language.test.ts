/**
 * @arch archcodex.test.integration
 *
 * Simulate command tests for Python and Go language support.
 * Tests that the simulate command correctly analyzes impact of registry changes
 * on Python and Go files.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SimulationAnalyzer } from '../../src/core/simulate/index.js';
import { getDefaultConfig } from '../../src/core/config/loader.js';
import type { Registry, ArchitectureNode } from '../../src/core/registry/schema.js';
import type { Config } from '../../src/core/config/schema.js';

describe('Simulate Command - Multi-language Support', () => {
  let tempDir: string;
  let testConfig: Config;

  const createBaseRegistry = (): Registry => {
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

  const createRegistryWithConstraint = (
    archId: string,
    constraints: Array<{ rule: string; value: unknown; severity?: 'error' | 'warning' }>
  ): Registry => {
    const baseNode: ArchitectureNode = {
      description: 'Base architecture',
      hints: [],
    };

    return {
      nodes: {
        base: baseNode,
        [archId]: {
          inherits: 'base',
          description: `Test architecture ${archId}`,
          constraints: constraints.map(c => ({
            ...c,
            severity: c.severity || 'error',
          })),
          hints: [],
        },
      },
      mixins: {},
    };
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-simulate-'));
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    testConfig = getDefaultConfig();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Python file simulation', () => {
    it('should detect breaking changes for Python files', async () => {
      // Create a Python file that passes with current registry
      const content = `# @arch test.arch
import os

def get_cwd():
    return os.getcwd()
`;
      await fs.writeFile(path.join(tempDir, 'src', 'module.py'), content);

      // Current registry allows everything
      const currentRegistry = createBaseRegistry();

      // Proposed registry forbids 'os' import
      const proposedRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'forbid_import', value: ['os'] },
      ]);

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py'],
      });

      expect(result.wouldBreak.length).toBeGreaterThan(0);
      expect(result.wouldBreak.some(f => f.file.endsWith('.py'))).toBe(true);
      expect(result.summary.wouldBreak).toBeGreaterThan(0);
    });

    it('should detect fixes for Python files', async () => {
      // Create a Python file that fails with current registry
      const content = `# @arch test.arch
import os

def get_cwd():
    return os.getcwd()
`;
      await fs.writeFile(path.join(tempDir, 'src', 'module.py'), content);

      // Current registry forbids 'os' import
      const currentRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'forbid_import', value: ['os'] },
      ]);

      // Proposed registry allows everything
      const proposedRegistry = createBaseRegistry();

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py'],
      });

      expect(result.wouldFix.length).toBeGreaterThan(0);
      expect(result.wouldFix.some(f => f.file.endsWith('.py'))).toBe(true);
      expect(result.summary.wouldFix).toBeGreaterThan(0);
    });

    it('should report unchanged Python files', async () => {
      const content = `# @arch test.arch
def simple():
    return "no imports"
`;
      await fs.writeFile(path.join(tempDir, 'src', 'simple.py'), content);

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createBaseRegistry();

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py'],
      });

      expect(result.summary.unchanged).toBeGreaterThanOrEqual(1);
    });

    it('should handle multiple Python files with mixed impacts', async () => {
      // File 1: Will break
      const file1 = `# @arch test.arch
import os
def func1():
    return os.getcwd()
`;
      // File 2: Will remain passing
      const file2 = `# @arch test.arch
def func2():
    return "safe"
`;
      await fs.writeFile(path.join(tempDir, 'src', 'file1.py'), file1);
      await fs.writeFile(path.join(tempDir, 'src', 'file2.py'), file2);

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'forbid_import', value: ['os'] },
      ]);

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py'],
      });

      expect(result.wouldBreak.length).toBe(1);
      expect(result.summary.unchanged).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Go file simulation', () => {
    it('should detect breaking changes for Go files', async () => {
      const content = `// @arch test.arch
package main

import "os"

func GetCwd() string {
	dir, _ := os.Getwd()
	return dir
}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'module.go'), content);

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'forbid_import', value: ['os'] },
      ]);

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.go'],
      });

      expect(result.wouldBreak.length).toBeGreaterThan(0);
      expect(result.wouldBreak.some(f => f.file.endsWith('.go'))).toBe(true);
    });

    it('should detect fixes for Go files', async () => {
      const content = `// @arch test.arch
package main

import "os"

func GetCwd() string {
	dir, _ := os.Getwd()
	return dir
}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'module.go'), content);

      const currentRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'forbid_import', value: ['os'] },
      ]);
      const proposedRegistry = createBaseRegistry();

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.go'],
      });

      expect(result.wouldFix.length).toBeGreaterThan(0);
      expect(result.wouldFix.some(f => f.file.endsWith('.go'))).toBe(true);
    });

    it('should report unchanged Go files', async () => {
      const content = `// @arch test.arch
package main

func Simple() string {
	return "no imports"
}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'simple.go'), content);

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createBaseRegistry();

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.go'],
      });

      expect(result.summary.unchanged).toBeGreaterThanOrEqual(1);
    });

    it('should handle multiple Go files with mixed impacts', async () => {
      const file1 = `// @arch test.arch
package main

import "os"

func Func1() string {
	return os.Getenv("HOME")
}
`;
      const file2 = `// @arch test.arch
package utils

func Func2() string {
	return "safe"
}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'file1.go'), file1);
      await fs.writeFile(path.join(tempDir, 'src', 'file2.go'), file2);

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'forbid_import', value: ['os'] },
      ]);

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.go'],
      });

      expect(result.wouldBreak.length).toBe(1);
      expect(result.summary.unchanged).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Mixed language simulation', () => {
    it('should simulate impact across TypeScript, Python, and Go files', async () => {
      const tsContent = `/**
 * @arch test.arch
 */
import * as os from 'os';

export const hostname = os.hostname();
`;
      const pyContent = `# @arch test.arch
import os

def get_cwd():
    return os.getcwd()
`;
      const goContent = `// @arch test.arch
package main

import "os"

func GetCwd() string {
	dir, _ := os.Getwd()
	return dir
}
`;

      await fs.writeFile(path.join(tempDir, 'src', 'module.ts'), tsContent);
      await fs.writeFile(path.join(tempDir, 'src', 'module.py'), pyContent);
      await fs.writeFile(path.join(tempDir, 'src', 'module.go'), goContent);

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'forbid_import', value: ['os'] },
      ]);

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.ts', 'src/**/*.py', 'src/**/*.go'],
      });

      // All three files should break
      expect(result.wouldBreak.length).toBe(3);
      expect(result.wouldBreak.some(f => f.file.endsWith('.ts'))).toBe(true);
      expect(result.wouldBreak.some(f => f.file.endsWith('.py'))).toBe(true);
      expect(result.wouldBreak.some(f => f.file.endsWith('.go'))).toBe(true);
    });

    it('should correctly calculate risk level with multi-language files', async () => {
      // Create multiple files across languages
      for (let i = 0; i < 3; i++) {
        await fs.writeFile(
          path.join(tempDir, 'src', `file${i}.py`),
          `# @arch test.arch
import os
def func${i}():
    return os.getcwd()
`
        );
      }

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'forbid_import', value: ['os'] },
      ]);

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py'],
      });

      // All files break, so risk should be critical
      expect(result.summary.riskLevel).toBe('critical');
    });

    it('should handle syntax errors gracefully during simulation', async () => {
      const validContent = `# @arch test.arch
def valid():
    return "ok"
`;
      const invalidContent = `# @arch test.arch
def broken(
    # Missing closing paren
`;

      await fs.writeFile(path.join(tempDir, 'src', 'valid.py'), validContent);
      await fs.writeFile(path.join(tempDir, 'src', 'invalid.py'), invalidContent);

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createBaseRegistry();

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);

      // Should not throw
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py'],
      });

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  describe('Constraint change simulation', () => {
    it('should detect when new constraint breaks Python file', async () => {
      const content = `# @arch test.arch
class MyService:
    def method1(self): pass
    def method2(self): pass
    def method3(self): pass
    def method4(self): pass
    def method5(self): pass
    def method6(self): pass
`;
      await fs.writeFile(path.join(tempDir, 'src', 'service.py'), content);

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'max_public_methods', value: 3 },
      ]);

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py'],
      });

      expect(result.wouldBreak.length).toBeGreaterThan(0);
    });

    it('should detect when constraint removal fixes Go file', async () => {
      const content = `// @arch test.arch
package main

import "fmt"

func main() {
	fmt.Println("hello")
}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'main.go'), content);

      const currentRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'forbid_import', value: ['fmt'] },
      ]);
      const proposedRegistry = createBaseRegistry();

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.go'],
      });

      expect(result.wouldFix.length).toBeGreaterThan(0);
    });

    it('should detect architecture removal impact', async () => {
      const content = `# @arch deprecated.arch
def old_func():
    pass
`;
      await fs.writeFile(path.join(tempDir, 'src', 'old.py'), content);

      // Current registry has the architecture
      const currentRegistry: Registry = {
        nodes: {
          base: { description: 'Base', hints: [] },
          'deprecated.arch': {
            inherits: 'base',
            description: 'To be removed',
            hints: [],
          },
        },
        mixins: {},
      };

      // Proposed registry removes it
      const proposedRegistry: Registry = {
        nodes: {
          base: { description: 'Base', hints: [] },
        },
        mixins: {},
      };

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py'],
      });

      // File uses removed arch, should be impacted
      expect(result.diff.architectureChanges.some(c => c.type === 'removed')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty directories', async () => {
      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createBaseRegistry();

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py', 'src/**/*.go'],
      });

      expect(result.summary.filesScanned).toBe(0);
      expect(result.wouldBreak).toHaveLength(0);
      expect(result.wouldFix).toHaveLength(0);
    });

    it('should handle files without @arch tags', async () => {
      const content = `# No arch tag
def func():
    pass
`;
      await fs.writeFile(path.join(tempDir, 'src', 'untagged.py'), content);

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createRegistryWithConstraint('test.arch', [
        { rule: 'forbid_import', value: ['os'] },
      ]);

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py'],
      });

      // Untagged files should not appear in wouldBreak
      expect(result.wouldBreak.some(f => f.file.includes('untagged'))).toBe(false);
    });

    it('should respect maxFiles option', async () => {
      // Create many files
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(
          path.join(tempDir, 'src', `file${i}.py`),
          `# @arch test.arch
def func${i}():
    pass
`
        );
      }

      const currentRegistry = createBaseRegistry();
      const proposedRegistry = createBaseRegistry();

      const analyzer = new SimulationAnalyzer(tempDir, testConfig);
      const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
        filePatterns: ['src/**/*.py'],
        maxFiles: 3,
      });

      // Should only analyze 3 files
      expect(result.summary.filesScanned).toBeLessThanOrEqual(3);
    });
  });
});
