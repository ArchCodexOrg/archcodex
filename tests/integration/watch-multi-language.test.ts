/**
 * @arch archcodex.test.integration
 *
 * Watch command tests for Python and Go language support.
 * Tests that the watch command correctly identifies and validates Python/Go files.
 *
 * Note: Actual file system watching with chokidar is difficult to test reliably,
 * so we focus on testing the validation behavior that watch depends on.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ValidationEngine } from '../../src/core/validation/engine.js';
import { getDefaultConfig } from '../../src/core/config/loader.js';
import type { Registry, ArchitectureNode } from '../../src/core/registry/schema.js';
import type { Config } from '../../src/core/config/schema.js';

describe('Watch Command - Multi-language Support', () => {
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
        'test.restricted': {
          inherits: 'base',
          description: 'Restricted architecture',
          hints: [],
          constraints: [
            { rule: 'forbid_import', value: ['os', 'subprocess'], severity: 'error' as const },
          ],
        },
      },
      mixins: {},
    };
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-watch-'));
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    testRegistry = createTestRegistry();
    testConfig = getDefaultConfig();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Python file watching', () => {
    it('should validate Python file changes', async () => {
      const content = `# @arch test.arch
def hello():
    return "Hello, World!"
`;
      await fs.writeFile(path.join(tempDir, 'src', 'module.py'), content);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles(['src/module.py']);
      engine.dispose();

      expect(results.results).toHaveLength(1);
      expect(results.results[0].status).toBe('pass');
      expect(results.results[0].archId).toBe('test.arch');
    });

    it('should detect violations in modified Python file', async () => {
      const content = `# @arch test.restricted
import os

def get_path():
    return os.getcwd()
`;
      await fs.writeFile(path.join(tempDir, 'src', 'bad_module.py'), content);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles(['src/bad_module.py']);
      engine.dispose();

      expect(results.results).toHaveLength(1);
      expect(results.results[0].status).toBe('fail');
      expect(results.results[0].violations.length).toBeGreaterThan(0);
      expect(results.results[0].violations[0].rule).toBe('forbid_import');
    });

    it('should handle Python file with syntax error gracefully', async () => {
      const content = `# @arch test.arch
def broken(
    # Missing closing paren
`;
      await fs.writeFile(path.join(tempDir, 'src', 'broken.py'), content);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);

      // Should not throw
      const results = await engine.validateFiles(['src/broken.py']);
      engine.dispose();

      expect(results.results).toHaveLength(1);
    });

    it('should validate multiple Python files in batch', async () => {
      const file1 = `# @arch test.arch
def func1():
    pass
`;
      const file2 = `# @arch test.arch
def func2():
    pass
`;
      const file3 = `# @arch test.restricted
import os
`;

      await fs.writeFile(path.join(tempDir, 'src', 'file1.py'), file1);
      await fs.writeFile(path.join(tempDir, 'src', 'file2.py'), file2);
      await fs.writeFile(path.join(tempDir, 'src', 'file3.py'), file3);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles([
        'src/file1.py',
        'src/file2.py',
        'src/file3.py',
      ]);
      engine.dispose();

      expect(results.results).toHaveLength(3);

      const passCount = results.results.filter(r => r.status === 'pass').length;
      const failCount = results.results.filter(r => r.status === 'fail').length;

      expect(passCount).toBe(2);
      expect(failCount).toBe(1);
    });
  });

  describe('Go file watching', () => {
    it('should validate Go file changes', async () => {
      const content = `// @arch test.arch
package main

func Hello() string {
	return "Hello, World!"
}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'module.go'), content);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles(['src/module.go']);
      engine.dispose();

      expect(results.results).toHaveLength(1);
      expect(results.results[0].status).toBe('pass');
      expect(results.results[0].archId).toBe('test.arch');
    });

    it('should detect violations in modified Go file', async () => {
      const content = `// @arch test.restricted
package main

import "os"

func GetPath() string {
	dir, _ := os.Getwd()
	return dir
}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'bad_module.go'), content);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles(['src/bad_module.go']);
      engine.dispose();

      expect(results.results).toHaveLength(1);
      expect(results.results[0].status).toBe('fail');
      expect(results.results[0].violations.length).toBeGreaterThan(0);
      expect(results.results[0].violations[0].rule).toBe('forbid_import');
    });

    it('should handle Go file with syntax error gracefully', async () => {
      const content = `// @arch test.arch
package main

func broken( {
	// Missing closing paren
}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'broken.go'), content);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);

      // Should not throw
      const results = await engine.validateFiles(['src/broken.go']);
      engine.dispose();

      expect(results.results).toHaveLength(1);
    });

    it('should validate multiple Go files in batch', async () => {
      const file1 = `// @arch test.arch
package main

func Func1() {}
`;
      const file2 = `// @arch test.arch
package utils

func Func2() {}
`;
      const file3 = `// @arch test.restricted
package main

import "os"

func Bad() { _ = os.Args }
`;

      await fs.writeFile(path.join(tempDir, 'src', 'file1.go'), file1);
      await fs.writeFile(path.join(tempDir, 'src', 'file2.go'), file2);
      await fs.writeFile(path.join(tempDir, 'src', 'file3.go'), file3);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles([
        'src/file1.go',
        'src/file2.go',
        'src/file3.go',
      ]);
      engine.dispose();

      expect(results.results).toHaveLength(3);

      const passCount = results.results.filter(r => r.status === 'pass').length;
      const failCount = results.results.filter(r => r.status === 'fail').length;

      expect(passCount).toBe(2);
      expect(failCount).toBe(1);
    });
  });

  describe('Mixed language watching', () => {
    it('should validate mixed TypeScript, Python, and Go files', async () => {
      const tsContent = `/**
 * @arch test.arch
 */
export function hello(): string {
  return "Hello from TS";
}
`;
      const pyContent = `# @arch test.arch
def hello():
    return "Hello from Python"
`;
      const goContent = `// @arch test.arch
package main

func Hello() string {
	return "Hello from Go"
}
`;

      await fs.writeFile(path.join(tempDir, 'src', 'module.ts'), tsContent);
      await fs.writeFile(path.join(tempDir, 'src', 'module.py'), pyContent);
      await fs.writeFile(path.join(tempDir, 'src', 'module.go'), goContent);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles([
        'src/module.ts',
        'src/module.py',
        'src/module.go',
      ]);
      engine.dispose();

      expect(results.results).toHaveLength(3);
      expect(results.results.every(r => r.status === 'pass')).toBe(true);
    });

    it('should detect violations across multiple languages', async () => {
      const tsContent = `/**
 * @arch test.restricted
 */
import * as os from 'os';

export const hostname = os.hostname();
`;
      const pyContent = `# @arch test.restricted
import subprocess

def run_cmd():
    return subprocess.run(["ls"])
`;
      const goContent = `// @arch test.restricted
package main

import "os"

func GetEnv() string {
	return os.Getenv("HOME")
}
`;

      await fs.writeFile(path.join(tempDir, 'src', 'bad.ts'), tsContent);
      await fs.writeFile(path.join(tempDir, 'src', 'bad.py'), pyContent);
      await fs.writeFile(path.join(tempDir, 'src', 'bad.go'), goContent);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles([
        'src/bad.ts',
        'src/bad.py',
        'src/bad.go',
      ]);
      engine.dispose();

      expect(results.results).toHaveLength(3);
      expect(results.results.every(r => r.status === 'fail')).toBe(true);

      // All should have forbid_import violations
      for (const result of results.results) {
        expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
      }
    });

    it('should handle incremental validation as files change', async () => {
      // Initial valid file
      const initialContent = `# @arch test.arch
def valid():
    return "valid"
`;
      await fs.writeFile(path.join(tempDir, 'src', 'changing.py'), initialContent);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);

      // First validation - should pass
      const result1 = await engine.validateFiles(['src/changing.py']);
      expect(result1.results[0].status).toBe('pass');

      // Simulate file modification with violation
      const modifiedContent = `# @arch test.restricted
import os

def now_invalid():
    return os.getcwd()
`;
      await fs.writeFile(path.join(tempDir, 'src', 'changing.py'), modifiedContent);

      // Second validation - should fail
      const result2 = await engine.validateFiles(['src/changing.py']);
      expect(result2.results[0].status).toBe('fail');

      // Fix the file
      const fixedContent = `# @arch test.restricted
def now_valid_again():
    return "fixed"
`;
      await fs.writeFile(path.join(tempDir, 'src', 'changing.py'), fixedContent);

      // Third validation - should pass
      const result3 = await engine.validateFiles(['src/changing.py']);
      expect(result3.results[0].status).toBe('pass');

      engine.dispose();
    });
  });

  describe('Edge cases for watch mode', () => {
    it('should handle empty Python file', async () => {
      await fs.writeFile(path.join(tempDir, 'src', 'empty.py'), '');

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles(['src/empty.py']);
      engine.dispose();

      expect(results.results).toHaveLength(1);
      // Empty file should be untagged
      expect(['untagged', 'warn']).toContain(results.results[0].status);
    });

    it('should handle empty Go file', async () => {
      await fs.writeFile(path.join(tempDir, 'src', 'empty.go'), '');

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles(['src/empty.go']);
      engine.dispose();

      expect(results.results).toHaveLength(1);
      expect(['untagged', 'warn']).toContain(results.results[0].status);
    });

    it('should handle rapid successive validations', async () => {
      const content = `# @arch test.arch
def func():
    pass
`;
      await fs.writeFile(path.join(tempDir, 'src', 'rapid.py'), content);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);

      // Simulate rapid fire validations (like debounced watch events)
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(engine.validateFiles(['src/rapid.py']));
      }

      const allResults = await Promise.all(promises);
      engine.dispose();

      // All should succeed
      expect(allResults.every(r => r.results.length === 1)).toBe(true);
      expect(allResults.every(r => r.results[0].status === 'pass')).toBe(true);
    });

    it('should handle file deletion gracefully', async () => {
      const content = `# @arch test.arch
def func():
    pass
`;
      await fs.writeFile(path.join(tempDir, 'src', 'to_delete.py'), content);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);

      // Validate existing file
      const result1 = await engine.validateFiles(['src/to_delete.py']);
      expect(result1.results).toHaveLength(1);

      // Delete the file
      await fs.unlink(path.join(tempDir, 'src', 'to_delete.py'));

      // Attempt to validate deleted file - should handle gracefully
      try {
        await engine.validateFiles(['src/to_delete.py']);
        // If it doesn't throw, that's acceptable
      } catch (error) {
        // Throwing is also acceptable
        expect(error).toBeDefined();
      }

      engine.dispose();
    });

    it('should handle files with unicode paths', async () => {
      const content = `# @arch test.arch
def greet():
    return "Hello"
`;
      const unicodeDir = path.join(tempDir, 'src', '日本語');
      await fs.mkdir(unicodeDir, { recursive: true });
      await fs.writeFile(path.join(unicodeDir, 'module.py'), content);

      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles(['src/日本語/module.py']);
      engine.dispose();

      expect(results.results).toHaveLength(1);
      expect(results.results[0].status).toBe('pass');
    });
  });
});
