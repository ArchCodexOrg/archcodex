/**
 * @arch archcodex.test.integration
 *
 * Constraint validation tests for Python and Go language support.
 * Tests that each constraint type works correctly with Python/Go semantic models.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ValidationEngine } from '../../src/core/validation/engine.js';
import { getDefaultConfig } from '../../src/core/config/loader.js';
import type { Registry, ArchitectureNode } from '../../src/core/registry/schema.js';
import type { Config } from '../../src/core/config/schema.js';

describe('Constraint Validation - Multi-language', () => {
  let tempDir: string;
  let testConfig: Config;

  // Helper to create registry with specific constraints
  const createRegistryWithConstraints = (
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
          description: `Test architecture for ${archId}`,
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
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-constraints-'));
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    testConfig = getDefaultConfig();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('forbid_import constraint', () => {
    describe('Python', () => {
      it('should detect forbidden standard library import', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'forbid_import', value: ['os', 'sys'] },
        ]);

        const content = `# @arch test.arch
import os

def get_cwd():
    return os.getcwd()
`;
        await fs.writeFile(path.join(tempDir, 'src', 'file.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/file.py');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
      });

      it('should detect forbidden from import', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'forbid_import', value: ['subprocess'] },
        ]);

        const content = `# @arch test.arch
from subprocess import run, call

def execute():
    run(["ls"])
`;
        await fs.writeFile(path.join(tempDir, 'src', 'exec.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/exec.py');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
      });

      it('should pass when import is not forbidden', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'forbid_import', value: ['os'] },
        ]);

        const content = `# @arch test.arch
import json
from collections import OrderedDict

def process(data):
    return json.dumps(data)
`;
        await fs.writeFile(path.join(tempDir, 'src', 'safe.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/safe.py');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'forbid_import')).toHaveLength(0);
      });

      it('should detect aliased forbidden import', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'forbid_import', value: ['os'] },
        ]);

        const content = `# @arch test.arch
import os as operating_system

def get_path():
    return operating_system.path.join("a", "b")
`;
        await fs.writeFile(path.join(tempDir, 'src', 'alias.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/alias.py');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
      });
    });

    describe('Go', () => {
      it('should detect forbidden package import', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'forbid_import', value: ['os/exec', 'net/http'] },
        ]);

        const content = `// @arch test.arch
package main

import "os/exec"

func run() {
	exec.Command("ls").Run()
}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'file.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/file.go');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
      });

      it('should detect forbidden import in block', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'forbid_import', value: ['net/http'] },
        ]);

        const content = `// @arch test.arch
package handlers

import (
	"context"
	"net/http"
)

func Handler(w http.ResponseWriter, r *http.Request) {}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'handler.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/handler.go');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
      });

      it('should pass when import is not forbidden', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'forbid_import', value: ['os/exec'] },
        ]);

        const content = `// @arch test.arch
package utils

import (
	"context"
	"fmt"
	"strings"
)

func Process(s string) string {
	return strings.ToUpper(s)
}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'utils.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/utils.go');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'forbid_import')).toHaveLength(0);
      });

      it('should detect aliased forbidden import', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'forbid_import', value: ['net/http'] },
        ]);

        const content = `// @arch test.arch
package main

import h "net/http"

func serve() {
	h.ListenAndServe(":8080", nil)
}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'server.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/server.go');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
      });
    });
  });

  describe('max_public_methods constraint', () => {
    describe('Python', () => {
      it('should detect when class exceeds max public methods', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'max_public_methods', value: 3 },
        ]);

        const content = `# @arch test.arch
class BigClass:
    def method1(self): pass
    def method2(self): pass
    def method3(self): pass
    def method4(self): pass  # 4th public method - exceeds 3
`;
        await fs.writeFile(path.join(tempDir, 'src', 'big.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/big.py');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'max_public_methods')).toBe(true);
      });

      it('should not count private methods', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'max_public_methods', value: 3 },
        ]);

        const content = `# @arch test.arch
class MyClass:
    def public1(self): pass
    def public2(self): pass
    def public3(self): pass
    def _private1(self): pass  # Private - not counted
    def _private2(self): pass  # Private - not counted
    def __private(self): pass  # Very private - not counted
`;
        await fs.writeFile(path.join(tempDir, 'src', 'private.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/private.py');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'max_public_methods')).toHaveLength(0);
      });

      it('should pass when under the limit', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'max_public_methods', value: 5 },
        ]);

        const content = `# @arch test.arch
class SmallClass:
    def method1(self): pass
    def method2(self): pass
    def method3(self): pass
`;
        await fs.writeFile(path.join(tempDir, 'src', 'small.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/small.py');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'max_public_methods')).toHaveLength(0);
      });
    });

    describe('Go', () => {
      it('should detect when struct exceeds max exported methods', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'max_public_methods', value: 3 },
        ]);

        const content = `// @arch test.arch
package service

type BigService struct{}

func (s *BigService) Method1() {}
func (s *BigService) Method2() {}
func (s *BigService) Method3() {}
func (s *BigService) Method4() {}  // 4th exported method - exceeds 3
`;
        await fs.writeFile(path.join(tempDir, 'src', 'big.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/big.go');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'max_public_methods')).toBe(true);
      });

      it('should not count unexported methods', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'max_public_methods', value: 3 },
        ]);

        const content = `// @arch test.arch
package service

type MyService struct{}

func (s *MyService) Public1() {}
func (s *MyService) Public2() {}
func (s *MyService) Public3() {}
func (s *MyService) private1() {}  // unexported - not counted
func (s *MyService) private2() {}  // unexported - not counted
`;
        await fs.writeFile(path.join(tempDir, 'src', 'private.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/private.go');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'max_public_methods')).toHaveLength(0);
      });

      it('should pass when under the limit', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'max_public_methods', value: 5 },
        ]);

        const content = `// @arch test.arch
package service

type SmallService struct{}

func (s *SmallService) Method1() {}
func (s *SmallService) Method2() {}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'small.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/small.go');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'max_public_methods')).toHaveLength(0);
      });
    });
  });

  describe('max_file_lines constraint', () => {
    describe('Python', () => {
      it('should detect when file exceeds max lines', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'max_file_lines', value: 10 },
        ]);

        // Create a file with more than 10 lines
        const lines = ['# @arch test.arch', '"""Module."""', ''];
        for (let i = 0; i < 15; i++) {
          lines.push(`def func${i}(): pass`);
        }
        const content = lines.join('\n');
        await fs.writeFile(path.join(tempDir, 'src', 'long.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/long.py');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'max_file_lines')).toBe(true);
      });

      it('should pass when file is under the limit', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'max_file_lines', value: 50 },
        ]);

        const content = `# @arch test.arch
"""Short module."""

def helper():
    pass
`;
        await fs.writeFile(path.join(tempDir, 'src', 'short.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/short.py');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'max_file_lines')).toHaveLength(0);
      });
    });

    describe('Go', () => {
      it('should detect when file exceeds max lines', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'max_file_lines', value: 10 },
        ]);

        // Create a file with more than 10 lines
        const lines = ['// @arch test.arch', 'package main', ''];
        for (let i = 0; i < 15; i++) {
          lines.push(`func Func${i}() {}`);
        }
        const content = lines.join('\n');
        await fs.writeFile(path.join(tempDir, 'src', 'long.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/long.go');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'max_file_lines')).toBe(true);
      });

      it('should pass when file is under the limit', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'max_file_lines', value: 50 },
        ]);

        const content = `// @arch test.arch
package main

func main() {
	println("hello")
}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'short.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/short.go');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'max_file_lines')).toHaveLength(0);
      });
    });
  });

  describe('require_import constraint', () => {
    describe('Python', () => {
      it('should detect missing required import', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'require_import', value: ['typing'] },
        ]);

        const content = `# @arch test.arch
def func(x):
    return x * 2
`;
        await fs.writeFile(path.join(tempDir, 'src', 'missing.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/missing.py');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'require_import')).toBe(true);
      });

      it('should pass when required import is present', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'require_import', value: ['typing'] },
        ]);

        const content = `# @arch test.arch
from typing import List, Optional

def func(x: List[int]) -> Optional[int]:
    return x[0] if x else None
`;
        await fs.writeFile(path.join(tempDir, 'src', 'typed.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/typed.py');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'require_import')).toHaveLength(0);
      });
    });

    describe('Go', () => {
      it('should detect missing required import', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'require_import', value: ['context'] },
        ]);

        const content = `// @arch test.arch
package service

type Service struct{}

func (s *Service) Process() {}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'missing.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/missing.go');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'require_import')).toBe(true);
      });

      it('should pass when required import is present', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'require_import', value: ['context'] },
        ]);

        const content = `// @arch test.arch
package service

import "context"

type Service struct{}

func (s *Service) Process(ctx context.Context) {}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'with_ctx.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/with_ctx.go');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'require_import')).toHaveLength(0);
      });
    });
  });

  describe('naming_pattern constraint', () => {
    describe('Python', () => {
      it('should detect file name not matching pattern', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'naming_pattern', value: '^test_.*\\.py$' },
        ]);

        const content = `# @arch test.arch
def my_test():
    assert True
`;
        await fs.writeFile(path.join(tempDir, 'src', 'mytest.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/mytest.py');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'naming_pattern')).toBe(true);
      });

      it('should pass when file name matches pattern', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'naming_pattern', value: '^test_.*\\.py$' },
        ]);

        const content = `# @arch test.arch
def test_something():
    assert True
`;
        await fs.writeFile(path.join(tempDir, 'src', 'test_user.py'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/test_user.py');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'naming_pattern')).toHaveLength(0);
      });
    });

    describe('Go', () => {
      it('should detect file name not matching pattern', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'naming_pattern', value: '.*_test\\.go$' },
        ]);

        const content = `// @arch test.arch
package main

import "testing"

func TestSomething(t *testing.T) {}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'tests.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/tests.go');
        engine.dispose();

        expect(result.violations.some(v => v.rule === 'naming_pattern')).toBe(true);
      });

      it('should pass when file name matches pattern', async () => {
        const registry = createRegistryWithConstraints('test.arch', [
          { rule: 'naming_pattern', value: '.*_test\\.go$' },
        ]);

        const content = `// @arch test.arch
package main

import "testing"

func TestSomething(t *testing.T) {}
`;
        await fs.writeFile(path.join(tempDir, 'src', 'user_test.go'), content);

        const engine = new ValidationEngine(tempDir, testConfig, registry);
        const result = await engine.validateFile('src/user_test.go');
        engine.dispose();

        expect(result.violations.filter(v => v.rule === 'naming_pattern')).toHaveLength(0);
      });
    });
  });

  describe('Multiple constraints', () => {
    it('should validate multiple constraints on Python file', async () => {
      const registry = createRegistryWithConstraints('test.arch', [
        { rule: 'forbid_import', value: ['os'] },
        { rule: 'max_public_methods', value: 2 },
        { rule: 'max_file_lines', value: 50 },
      ]);

      const content = `# @arch test.arch
import os  # Violation 1

class BigClass:
    def method1(self): pass
    def method2(self): pass
    def method3(self): pass  # Violation 2 - exceeds max
`;
      await fs.writeFile(path.join(tempDir, 'src', 'multi.py'), content);

      const engine = new ValidationEngine(tempDir, testConfig, registry);
      const result = await engine.validateFile('src/multi.py');
      engine.dispose();

      expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
      expect(result.violations.some(v => v.rule === 'max_public_methods')).toBe(true);
      expect(result.violations.filter(v => v.rule === 'max_file_lines')).toHaveLength(0);
    });

    it('should validate multiple constraints on Go file', async () => {
      const registry = createRegistryWithConstraints('test.arch', [
        { rule: 'forbid_import', value: ['os/exec'] },
        { rule: 'max_public_methods', value: 2 },
        { rule: 'max_file_lines', value: 50 },
      ]);

      const content = `// @arch test.arch
package service

import "os/exec"  // Violation 1

type BigService struct{}

func (s *BigService) Method1() {}
func (s *BigService) Method2() {}
func (s *BigService) Method3() {}  // Violation 2 - exceeds max
`;
      await fs.writeFile(path.join(tempDir, 'src', 'multi.go'), content);

      const engine = new ValidationEngine(tempDir, testConfig, registry);
      const result = await engine.validateFile('src/multi.go');
      engine.dispose();

      expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
      expect(result.violations.some(v => v.rule === 'max_public_methods')).toBe(true);
      expect(result.violations.filter(v => v.rule === 'max_file_lines')).toHaveLength(0);
    });
  });
});
