/**
 * @arch archcodex.test.integration
 *
 * End-to-end workflow tests for Python and Go language support.
 * Tests complete workflows: scaffold → check, scaffold → modify → check violation, etc.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ValidationEngine } from '../../src/core/validation/engine.js';
import { getDefaultConfig } from '../../src/core/config/loader.js';
import { ScaffoldEngine } from '../../src/core/scaffold/engine.js';
import {
  insertArchTag,
  hasArchTag,
  extractArchId,
} from '../../src/utils/arch-tag.js';
import { inferArchitecture, DEFAULT_RULES } from '../../src/core/infer/rules.js';
import type { Registry, ArchitectureNode } from '../../src/core/registry/schema.js';
import type { Config } from '../../src/core/config/schema.js';

describe('E2E Multi-language Workflows', () => {
  let tempDir: string;
  let testRegistry: Registry;
  let testConfig: Config;

  // Helper to create registry object directly
  const createTestRegistry = (): Registry => {
    const baseNode: ArchitectureNode = {
      description: 'Base architecture',
      hints: ['Base architecture for all files'],
    };

    return {
      nodes: {
        base: baseNode,
        'base.test': {
          inherits: 'base',
          description: 'Test files',
          hints: ['Test architecture'],
        },
        'api.handler': {
          inherits: 'base',
          description: 'API handlers',
          constraints: [
            { rule: 'forbid_import', value: ['os', 'subprocess', 'os/exec'], severity: 'error' },
            { rule: 'max_public_methods', value: 5, severity: 'error' },
          ],
          hints: ['API handler architecture'],
        },
        'core.service': {
          inherits: 'base',
          description: 'Service layer',
          constraints: [
            { rule: 'max_public_methods', value: 7, severity: 'error' },
          ],
          hints: ['Service layer'],
        },
        'core.pure': {
          inherits: 'base',
          description: 'Pure domain logic',
          constraints: [
            { rule: 'forbid_import', value: ['os', 'sys', 'net/http', 'http'], severity: 'error' },
          ],
          hints: ['Pure domain logic - no I/O'],
        },
      },
      mixins: {},
    };
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-e2e-'));

    // Create directory structure
    await fs.mkdir(path.join(tempDir, '.arch', 'registry'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'pkg'), { recursive: true });

    testRegistry = createTestRegistry();
    testConfig = getDefaultConfig();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Python E2E Workflows', () => {
    it('scaffold → check: should create valid Python file that passes validation', async () => {
      // 1. Scaffold a Python file
      const scaffoldEngine = new ScaffoldEngine(tempDir);
      const scaffoldResult = await scaffoldEngine.scaffold({
        archId: 'api.handler',
        name: 'UserHandler',
        outputPath: 'src',
        language: 'python',
      });

      expect(scaffoldResult.success).toBe(true);
      expect(scaffoldResult.filePath).toBeDefined();

      // 2. Verify scaffolded file has correct tag
      const content = await fs.readFile(scaffoldResult.filePath!, 'utf-8');
      expect(hasArchTag(content)).toBe(true);
      expect(extractArchId(content)).toBe('api.handler');

      // 3. Validate the file - should pass
      const validationEngine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const result = await validationEngine.validateFile(
        path.relative(tempDir, scaffoldResult.filePath!)
      );
      validationEngine.dispose();

      expect(result.status).toBe('pass');
      expect(result.violations).toHaveLength(0);
    });

    it('scaffold → modify → check: should detect violation after adding forbidden import', async () => {
      // 1. Scaffold a Python file
      const scaffoldEngine = new ScaffoldEngine(tempDir);
      const scaffoldResult = await scaffoldEngine.scaffold({
        archId: 'api.handler',
        name: 'FileHandler',
        outputPath: 'src',
        language: 'python',
      });

      expect(scaffoldResult.success).toBe(true);

      // 2. Read and verify it passes initially
      const validationEngine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const initialResult = await validationEngine.validateFile(
        path.relative(tempDir, scaffoldResult.filePath!)
      );
      expect(initialResult.status).toBe('pass');

      // 3. Modify the file to add forbidden import
      const originalContent = await fs.readFile(scaffoldResult.filePath!, 'utf-8');
      const modifiedContent = originalContent.replace(
        '"""FileHandler implementation."""',
        '"""FileHandler implementation."""\nimport os  # Forbidden import!'
      );
      await fs.writeFile(scaffoldResult.filePath!, modifiedContent);

      // 4. Validate again - should fail
      const afterResult = await validationEngine.validateFile(
        path.relative(tempDir, scaffoldResult.filePath!)
      );
      validationEngine.dispose();

      expect(afterResult.status).toBe('fail');
      expect(afterResult.violations.some(v => v.rule === 'forbid_import')).toBe(true);
    });

    it('infer → tag → check: should auto-tag and validate Python test file', async () => {
      // 1. Create untagged Python test file
      const testContent = `"""Unit tests for user module."""
import pytest

def test_user_creation():
    """Test user creation."""
    user = {"name": "test"}
    assert user["name"] == "test"

def test_user_validation():
    """Test user validation."""
    assert True
`;
      const filePath = path.join(tempDir, 'src', 'test_user.py');
      await fs.writeFile(filePath, testContent);

      // 2. Infer architecture
      const inference = inferArchitecture('test_user.py', testContent, DEFAULT_RULES);
      expect(inference).toBeDefined();
      expect(inference!.archId).toBe('base.test');
      expect(inference!.confidence).toBe('high');

      // 3. Apply tag
      const taggedContent = insertArchTag(testContent, inference!.archId, 'test_user.py');
      await fs.writeFile(filePath, taggedContent);

      // 4. Verify tag was applied
      const finalContent = await fs.readFile(filePath, 'utf-8');
      expect(hasArchTag(finalContent)).toBe(true);
      expect(extractArchId(finalContent)).toBe('base.test');

      // 5. Validate - should pass
      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const result = await engine.validateFile('src/test_user.py');
      engine.dispose();

      expect(result.archId).toBe('base.test');
      expect(result.status).toBe('pass');
    });

    it('should validate multiple Python files in batch', async () => {
      // Create multiple Python files
      const files = [
        {
          name: 'handler1.py',
          content: `# @arch api.handler
class Handler1:
    def handle(self): pass
`,
        },
        {
          name: 'handler2.py',
          content: `# @arch api.handler
class Handler2:
    def process(self): pass
`,
        },
        {
          name: 'service.py',
          content: `# @arch core.service
class UserService:
    def get_user(self): pass
    def create_user(self): pass
`,
        },
      ];

      for (const file of files) {
        await fs.writeFile(path.join(tempDir, 'src', file.name), file.content);
      }

      // Validate all
      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles(files.map(f => `src/${f.name}`));
      engine.dispose();

      expect(results.results).toHaveLength(3);
      expect(results.summary.passed).toBe(3);
      expect(results.summary.failed).toBe(0);
    });
  });

  describe('Go E2E Workflows', () => {
    it('scaffold → check: should create valid Go file that passes validation', async () => {
      // 1. Scaffold a Go file
      const scaffoldEngine = new ScaffoldEngine(tempDir);
      const scaffoldResult = await scaffoldEngine.scaffold({
        archId: 'api.handler',
        name: 'OrderHandler',
        outputPath: 'pkg/handlers',
        language: 'go',
      });

      expect(scaffoldResult.success).toBe(true);
      expect(scaffoldResult.filePath).toBeDefined();

      // 2. Verify scaffolded file has correct tag and package
      const content = await fs.readFile(scaffoldResult.filePath!, 'utf-8');
      expect(hasArchTag(content)).toBe(true);
      expect(extractArchId(content)).toBe('api.handler');
      expect(content).toContain('package handlers');

      // 3. Validate the file - should pass
      const validationEngine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const result = await validationEngine.validateFile(
        path.relative(tempDir, scaffoldResult.filePath!)
      );
      validationEngine.dispose();

      expect(result.status).toBe('pass');
      expect(result.violations).toHaveLength(0);
    });

    it('scaffold → modify → check: should detect violation after adding forbidden import', async () => {
      // 1. Scaffold a Go file
      const scaffoldEngine = new ScaffoldEngine(tempDir);
      const scaffoldResult = await scaffoldEngine.scaffold({
        archId: 'api.handler',
        name: 'ExecHandler',
        outputPath: 'pkg/handlers',
        language: 'go',
      });

      expect(scaffoldResult.success).toBe(true);

      // 2. Read and verify it passes initially
      const validationEngine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const initialResult = await validationEngine.validateFile(
        path.relative(tempDir, scaffoldResult.filePath!)
      );
      expect(initialResult.status).toBe('pass');

      // 3. Modify the file to add forbidden import
      const originalContent = await fs.readFile(scaffoldResult.filePath!, 'utf-8');
      const modifiedContent = originalContent.replace(
        'package handlers',
        'package handlers\n\nimport "os/exec"  // Forbidden import!'
      );
      await fs.writeFile(scaffoldResult.filePath!, modifiedContent);

      // 4. Validate again - should fail
      const afterResult = await validationEngine.validateFile(
        path.relative(tempDir, scaffoldResult.filePath!)
      );
      validationEngine.dispose();

      expect(afterResult.status).toBe('fail');
      expect(afterResult.violations.some(v => v.rule === 'forbid_import')).toBe(true);
    });

    it('infer → tag → check: should auto-tag and validate Go test file', async () => {
      // 1. Create untagged Go test file
      const testContent = `package user

import "testing"

func TestUserCreation(t *testing.T) {
	user := map[string]string{"name": "test"}
	if user["name"] != "test" {
		t.Error("Expected name to be test")
	}
}

func TestUserValidation(t *testing.T) {
	t.Log("validation test")
}
`;
      const filePath = path.join(tempDir, 'pkg', 'user_test.go');
      await fs.writeFile(filePath, testContent);

      // 2. Infer architecture
      const inference = inferArchitecture('user_test.go', testContent, DEFAULT_RULES);
      expect(inference).toBeDefined();
      expect(inference!.archId).toBe('base.test');
      expect(inference!.confidence).toBe('high');

      // 3. Apply tag
      const taggedContent = insertArchTag(testContent, inference!.archId, 'user_test.go');
      await fs.writeFile(filePath, taggedContent);

      // 4. Verify tag was applied
      const finalContent = await fs.readFile(filePath, 'utf-8');
      expect(hasArchTag(finalContent)).toBe(true);
      expect(extractArchId(finalContent)).toBe('base.test');

      // 5. Validate - should pass
      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const result = await engine.validateFile('pkg/user_test.go');
      engine.dispose();

      expect(result.archId).toBe('base.test');
      expect(result.status).toBe('pass');
    });

    it('should validate multiple Go files in batch', async () => {
      // Create multiple Go files
      const files = [
        {
          name: 'handler1.go',
          content: `// @arch api.handler
package handlers

type Handler1 struct{}

func (h *Handler1) Handle() {}
`,
        },
        {
          name: 'handler2.go',
          content: `// @arch api.handler
package handlers

type Handler2 struct{}

func (h *Handler2) Process() {}
`,
        },
        {
          name: 'service.go',
          content: `// @arch core.service
package service

type UserService struct{}

func (s *UserService) GetUser() {}
func (s *UserService) CreateUser() {}
`,
        },
      ];

      for (const file of files) {
        await fs.writeFile(path.join(tempDir, 'pkg', file.name), file.content);
      }

      // Validate all
      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles(files.map(f => `pkg/${f.name}`));
      engine.dispose();

      expect(results.results).toHaveLength(3);
      expect(results.summary.passed).toBe(3);
      expect(results.summary.failed).toBe(0);
    });
  });

  describe('Mixed Language Workflows', () => {
    it('should validate mixed Python and Go files in same project', async () => {
      // Create Python files
      await fs.writeFile(
        path.join(tempDir, 'src', 'handler.py'),
        `# @arch api.handler
class PyHandler:
    def handle(self): pass
`
      );

      // Create Go files
      await fs.writeFile(
        path.join(tempDir, 'pkg', 'handler.go'),
        `// @arch api.handler
package handlers

type GoHandler struct{}

func (h *GoHandler) Handle() {}
`
      );

      // Validate both
      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles([
        'src/handler.py',
        'pkg/handler.go',
      ]);
      engine.dispose();

      expect(results.results).toHaveLength(2);
      expect(results.summary.passed).toBe(2);

      // Verify each file was validated correctly
      const pyResult = results.results.find(r => r.file.endsWith('.py'));
      const goResult = results.results.find(r => r.file.endsWith('.go'));

      expect(pyResult).toBeDefined();
      expect(pyResult!.archId).toBe('api.handler');

      expect(goResult).toBeDefined();
      expect(goResult!.archId).toBe('api.handler');
    });

    it('should detect violations in both Python and Go files simultaneously', async () => {
      // Create Python file with violation
      await fs.writeFile(
        path.join(tempDir, 'src', 'bad_handler.py'),
        `# @arch core.pure
import os  # Forbidden!

class BadHandler:
    def handle(self):
        return os.getcwd()
`
      );

      // Create Go file with violation
      await fs.writeFile(
        path.join(tempDir, 'pkg', 'bad_handler.go'),
        `// @arch core.pure
package handlers

import "net/http"  // Forbidden!

type BadHandler struct{}

func (h *BadHandler) Handle() {
	http.Get("http://example.com")
}
`
      );

      // Validate both
      const engine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await engine.validateFiles([
        'src/bad_handler.py',
        'pkg/bad_handler.go',
      ]);
      engine.dispose();

      expect(results.results).toHaveLength(2);
      expect(results.summary.failed).toBe(2);

      // Both should have forbid_import violations
      for (const result of results.results) {
        expect(result.status).toBe('fail');
        expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
      }
    });

    it('should support scaffold → validate workflow for multiple languages', async () => {
      const scaffoldEngine = new ScaffoldEngine(tempDir);

      // Scaffold Python
      const pyResult = await scaffoldEngine.scaffold({
        archId: 'core.service',
        name: 'AuthService',
        outputPath: 'src',
        language: 'python',
      });
      expect(pyResult.success).toBe(true);

      // Scaffold Go
      const goResult = await scaffoldEngine.scaffold({
        archId: 'core.service',
        name: 'AuthService',
        outputPath: 'pkg',
        language: 'go',
      });
      expect(goResult.success).toBe(true);

      // Validate both
      const validationEngine = new ValidationEngine(tempDir, testConfig, testRegistry);
      const results = await validationEngine.validateFiles([
        path.relative(tempDir, pyResult.filePath!),
        path.relative(tempDir, goResult.filePath!),
      ]);
      validationEngine.dispose();

      expect(results.summary.passed).toBe(2);
      expect(results.summary.failed).toBe(0);
    });
  });

  describe('Bootstrap Workflow Simulation', () => {
    it('should infer and tag multiple Python files', async () => {
      // Create untagged Python files
      const files = [
        { name: 'test_auth.py', content: 'def test_login(): assert True' },
        { name: '__init__.py', content: 'from .auth import *' },
        { name: 'conftest.py', content: 'import pytest\n@pytest.fixture\ndef client(): pass' },
      ];

      for (const file of files) {
        await fs.writeFile(path.join(tempDir, 'src', file.name), file.content);
      }

      // Simulate bootstrap: infer and tag each file
      const results: Array<{ file: string; archId: string; confidence: string }> = [];

      for (const file of files) {
        const content = await fs.readFile(path.join(tempDir, 'src', file.name), 'utf-8');
        const inference = inferArchitecture(file.name, content, DEFAULT_RULES);

        if (inference) {
          const taggedContent = insertArchTag(content, inference.archId, file.name);
          await fs.writeFile(path.join(tempDir, 'src', file.name), taggedContent);
          results.push({
            file: file.name,
            archId: inference.archId,
            confidence: inference.confidence,
          });
        }
      }

      // Verify results
      expect(results).toHaveLength(3);

      const testFile = results.find(r => r.file === 'test_auth.py');
      expect(testFile?.archId).toBe('base.test');

      const initFile = results.find(r => r.file === '__init__.py');
      expect(initFile?.archId).toBe('base.barrel');

      const conftest = results.find(r => r.file === 'conftest.py');
      expect(conftest?.archId).toBe('base.test.fixtures');
    });

    it('should infer and tag multiple Go files', async () => {
      // Create untagged Go files
      const files = [
        {
          name: 'user_test.go',
          content: `package user
import "testing"
func TestUser(t *testing.T) {}`,
        },
        {
          name: 'handler.go',
          content: `package handlers
import "net/http"
func UserHandler(w http.ResponseWriter, r *http.Request) {}`,
        },
        {
          name: 'mock_service.go',
          content: `package mock
type MockService struct{}`,
        },
      ];

      for (const file of files) {
        await fs.writeFile(path.join(tempDir, 'pkg', file.name), file.content);
      }

      // Simulate bootstrap: infer and tag each file
      const results: Array<{ file: string; archId: string; confidence: string }> = [];

      for (const file of files) {
        const content = await fs.readFile(path.join(tempDir, 'pkg', file.name), 'utf-8');
        const inference = inferArchitecture(file.name, content, DEFAULT_RULES);

        if (inference) {
          const taggedContent = insertArchTag(content, inference.archId, file.name);
          await fs.writeFile(path.join(tempDir, 'pkg', file.name), taggedContent);
          results.push({
            file: file.name,
            archId: inference.archId,
            confidence: inference.confidence,
          });
        }
      }

      // Verify results
      expect(results).toHaveLength(3);

      const testFile = results.find(r => r.file === 'user_test.go');
      expect(testFile?.archId).toBe('base.test');

      const handlerFile = results.find(r => r.file === 'handler.go');
      expect(handlerFile?.archId).toBe('api.handler');

      const mockFile = results.find(r => r.file === 'mock_service.go');
      expect(mockFile?.archId).toBe('base.test.mock');
    });
  });
});
