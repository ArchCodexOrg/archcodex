/**
 * @arch archcodex.test.unit
 *
 * Integration tests for Python file validation through the ValidationEngine.
 * Tests constraint application, multi-language batch validation, and
 * Python-specific semantic model handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationEngine } from '../../../../src/core/validation/engine.js';
import type { Config } from '../../../../src/core/config/schema.js';
import type { Registry } from '../../../../src/core/registry/schema.js';

// Mock file system
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
  basename: vi.fn((p: string) => p.split('/').pop()),
}));

// Mock Python validator with realistic semantic model parsing
const mockPythonParseFile = vi.fn().mockImplementation((_path: string, content?: string) => {
  const imports: Array<{
    moduleSpecifier: string;
    defaultImport?: string;
    namedImports?: string[];
    location: { line: number; column: number };
  }> = [];
  const classes: Array<{
    name: string;
    isExported: boolean;
    extends?: string;
    implements?: string[];
    methods: Array<{
      name: string;
      visibility: string;
      isStatic: boolean;
      isAbstract: boolean;
      decorators: Array<{ name: string }>;
      parameterCount: number;
      location: { line: number; column: number };
    }>;
    decorators: Array<{ name: string }>;
    isAbstract: boolean;
    location: { line: number; column: number };
  }> = [];
  const functions: Array<{
    name: string;
    isExported: boolean;
    isAsync: boolean;
    visibility: string;
    decorators: Array<{ name: string }>;
    parameterCount: number;
    location: { line: number; column: number };
  }> = [];

  if (content) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Parse Python imports
      const importMatch = line.match(/^import\s+([\w.]+)/);
      if (importMatch) {
        imports.push({
          moduleSpecifier: importMatch[1],
          defaultImport: importMatch[1],
          location: { line: i + 1, column: 1 },
        });
      }
      const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
      if (fromMatch) {
        const names = fromMatch[2].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
        imports.push({
          moduleSpecifier: fromMatch[1],
          namedImports: names,
          location: { line: i + 1, column: 1 },
        });
      }

      // Parse Python classes
      const classMatch = line.match(/^class\s+(\w+)(?:\((.*?)\))?\s*:/);
      if (classMatch) {
        const className = classMatch[1];
        const bases = classMatch[2]?.split(',').map(b => b.trim()).filter(b => b && b !== 'object') || [];
        const methods: typeof classes[0]['methods'] = [];

        // Scan for methods in class body
        for (let j = i + 1; j < lines.length; j++) {
          const mLine = lines[j];
          if (mLine.trim().length > 0 && !mLine.startsWith(' ') && !mLine.startsWith('\t')) break;
          const defMatch = mLine.trim().match(/^(?:async\s+)?def\s+(\w+)\s*\((.*?)\)/);
          if (defMatch) {
            const methodName = defMatch[1];
            const params = defMatch[2].split(',').map(p => p.trim()).filter(p => p && p !== 'self' && p !== 'cls');
            let visibility: 'public' | 'protected' | 'private' = 'public';
            if (methodName.startsWith('__') && !methodName.endsWith('__')) visibility = 'private';
            else if (methodName.startsWith('_')) visibility = 'protected';
            methods.push({
              name: methodName,
              visibility,
              isStatic: false,
              isAbstract: false,
              decorators: [],
              parameterCount: params.length,
              location: { line: j + 1, column: 1 },
            });
          }
        }

        classes.push({
          name: className,
          isExported: !className.startsWith('_'),
          extends: bases[0],
          implements: bases.slice(1),
          methods,
          decorators: [],
          isAbstract: false,
          location: { line: i + 1, column: 1 },
        });
      }

      // Parse top-level functions (no leading whitespace)
      if (!lines[i].startsWith(' ') && !lines[i].startsWith('\t')) {
        const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\((.*?)\)/);
        if (funcMatch) {
          const funcName = funcMatch[1];
          const params = funcMatch[2].split(',').map(p => p.trim()).filter(p => p.length > 0);
          functions.push({
            name: funcName,
            isExported: !funcName.startsWith('_'),
            isAsync: line.startsWith('async'),
            visibility: funcName.startsWith('_') ? 'protected' : 'public',
            decorators: [],
            parameterCount: params.length,
            location: { line: i + 1, column: 1 },
          });
        }
      }
    }
  }

  return Promise.resolve({
    language: 'python',
    filePath: _path,
    fileName: _path.split('/').pop(),
    extension: '.py',
    content: content || '',
    lineCount: content ? content.split('\n').length : 0,
    locCount: content ? content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length : 0,
    imports,
    classes,
    interfaces: [],
    functions,
    functionCalls: [],
    mutations: [],
    exports: [],
  });
});

vi.mock('../../../../src/validators/python.js', () => ({
  PythonValidator: vi.fn(function() {
    return {
    supportedLanguages: ['python'],
    supportedExtensions: ['.py'],
    capabilities: {
      hasClassInheritance: true,
      hasInterfaces: true,
      hasDecorators: true,
      hasVisibilityModifiers: false,
    },
    parseFile: mockPythonParseFile,
    dispose: vi.fn(),
  };
  }),
}));

// Mock TypeScript validator (needed because engine imports register.ts which registers both)
const mockTsParseFile = vi.fn().mockImplementation((_path: string, content?: string) => {
  const imports: Array<{
    moduleSpecifier: string;
    defaultImport?: string;
    namedImports?: string[];
    location: { line: number; column: number };
  }> = [];

  if (content) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const importMatch = lines[i].match(/import\s+(?:(\w+)|{([^}]+)})\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        imports.push({
          moduleSpecifier: importMatch[3],
          defaultImport: importMatch[1],
          namedImports: importMatch[2] ? importMatch[2].split(',').map(s => s.trim()) : undefined,
          location: { line: i + 1, column: 1 },
        });
      }
    }
  }

  return Promise.resolve({
    language: 'typescript',
    imports,
    exports: [],
    classes: [],
    functions: [],
    decorators: [],
    loc: content ? content.split('\n').length : 10,
  });
});

vi.mock('../../../../src/validators/typescript.js', () => ({
  TypeScriptValidator: vi.fn(function() {
    return {
    supportedLanguages: ['typescript'],
    supportedExtensions: ['.ts', '.tsx'],
    capabilities: {
      hasClassInheritance: true,
      hasInterfaces: true,
      hasDecorators: true,
      hasVisibilityModifiers: true,
    },
    parseFile: mockTsParseFile,
    dispose: vi.fn(),
  };
  }),
}));

import { readFile } from '../../../../src/utils/file-system.js';

describe('ValidationEngine - Python support', () => {
  const projectRoot = '/test/project';

  const createConfig = (overrides: Partial<Config> = {}): Config => ({
    version: '1.0',
    registry: '.arch/registry.yaml',
    files: {
      untagged: { policy: 'warn' },
      scan: { include: ['**/*.ts', '**/*.py'], exclude: ['**/node_modules/**'] },
    },
    validation: {
      strict: false,
      fail_on_warnings: false,
      parallel: false,
    },
    hydration: {
      token_limit: 4000,
      format: 'verbose',
    },
    pointers: {
      base_path: '.arch/docs',
      allowed_schemes: ['arch', 'code', 'template'],
    },
    overrides: {
      required_fields: ['reason'],
      warn_no_expiry: true,
      max_expiry_days: 90,
      fail_on_expired: true,
      max_per_file: 3,
    },
    ...overrides,
  });

  const createRegistry = (nodes: Record<string, unknown> = {}, mixins: Record<string, unknown> = {}): Registry => ({
    nodes: {
      base: { description: 'Base' },
      ...nodes,
    },
    mixins,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Python file validation', () => {
    it('should validate a Python file with @arch tag', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Application service',
          constraints: [],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '# @arch app.service\n' +
        'class UserService:\n' +
        '    def get_user(self, user_id):\n' +
        '        pass\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/user.py');

      expect(result.file).toBe('src/services/user.py');
      expect(result.archId).toBe('app.service');
      expect(result.status).not.toBe('fail');
    });

    it('should detect forbid_import violation in Python file', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Service layer',
          constraints: [
            { rule: 'forbid_import', value: ['flask'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '# @arch app.service\n' +
        'from flask import Flask\n' +
        'class MyService:\n' +
        '    pass\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/web.py');

      expect(result.status).toBe('fail');
      expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
    });

    it('should pass when Python file has no forbidden imports', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Service layer',
          constraints: [
            { rule: 'forbid_import', value: ['flask'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '# @arch app.service\n' +
        'import os\n' +
        'from typing import Optional\n' +
        'class CleanService:\n' +
        '    pass\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/clean.py');

      expect(result.violations.filter(v => v.rule === 'forbid_import')).toHaveLength(0);
    });

    it('should detect max_public_methods violation in Python class', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Service layer',
          constraints: [
            { rule: 'max_public_methods', value: 2, severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '# @arch app.service\n' +
        'class BigService:\n' +
        '    def method_a(self):\n' +
        '        pass\n' +
        '    def method_b(self):\n' +
        '        pass\n' +
        '    def method_c(self):\n' +
        '        pass\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/big.py');

      expect(result.violations.some(v => v.rule === 'max_public_methods')).toBe(true);
    });

    it('should warn on untagged Python file', async () => {
      const config = createConfig({
        files: {
          untagged: { policy: 'warn' },
          scan: { include: ['**/*.py'], exclude: [] },
        },
      });
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue(
        'def helper():\n    return 42\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/utils/helper.py');

      expect(result.status).toBe('warn');
      expect(result.archId).toBeNull();
      expect(result.warnings.some(v => v.message.includes('Missing @arch tag'))).toBe(true);
    });

    it('should skip file when no validator registered for extension', async () => {
      const config = createConfig();
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue('# @arch test.arch\nprint("hello")');

      const engine = new ValidationEngine(projectRoot, config, registry);
      // .rb has no registered validator
      const result = await engine.validateFile('src/script.rb');

      expect(result.status).toBe('pass');
      expect(result.skipped).toBe(true);
    });
  });

  describe('multi-language batch validation', () => {
    it('should validate a batch of mixed TypeScript and Python files', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Service layer',
          constraints: [],
          hints: [],
        },
      });

      vi.mocked(readFile)
        .mockResolvedValueOnce(
          '/**\n * @arch app.service\n */\nexport class TsService {}'
        )
        .mockResolvedValueOnce(
          '# @arch app.service\nclass PyService:\n    pass\n'
        );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles([
        'src/services/ts-service.ts',
        'src/services/py-service.py',
      ]);

      expect(result.results).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.results[0].archId).toBe('app.service');
      expect(result.results[1].archId).toBe('app.service');
    });

    it('should apply different constraints per architecture across languages', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'ts.layer': {
          inherits: 'base',
          description: 'TypeScript layer',
          constraints: [
            { rule: 'forbid_import', value: ['lodash'], severity: 'error' },
          ],
          hints: [],
        },
        'py.layer': {
          inherits: 'base',
          description: 'Python layer',
          constraints: [
            { rule: 'forbid_import', value: ['requests'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile)
        .mockResolvedValueOnce(
          '/**\n * @arch ts.layer\n */\nimport _ from \'lodash\';'
        )
        .mockResolvedValueOnce(
          '# @arch py.layer\nimport requests\n'
        );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles([
        'src/ts-module.ts',
        'src/py-module.py',
      ]);

      expect(result.summary.failed).toBe(2);
      expect(result.results[0].violations.some(v => v.rule === 'forbid_import')).toBe(true);
      expect(result.results[1].violations.some(v => v.rule === 'forbid_import')).toBe(true);
    });

    it('should count summary statistics across languages', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [],
          hints: [],
        },
      });

      vi.mocked(readFile)
        .mockResolvedValueOnce('/**\n * @arch test.arch\n */\nexport class A {}')
        .mockResolvedValueOnce('# @arch test.arch\nclass B:\n    pass\n')
        .mockResolvedValueOnce('export const untagged = 1;');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles([
        'src/a.ts',
        'src/b.py',
        'src/c.ts',
      ]);

      expect(result.summary.total).toBe(3);
      expect(result.results.filter(r => r.archId === 'test.arch')).toHaveLength(2);
    });

    it('should detect singleton violation across languages', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'singleton.arch': {
          inherits: 'base',
          description: 'Singleton',
          singleton: true,
          constraints: [],
          hints: [],
        },
      });

      vi.mocked(readFile)
        .mockResolvedValueOnce('/**\n * @arch singleton.arch\n */\nexport class A {}')
        .mockResolvedValueOnce('# @arch singleton.arch\nclass B:\n    pass\n');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles([
        'src/service.ts',
        'src/service.py',
      ]);

      expect(result.results[0].violations.some(v => v.rule === 'singleton_violation')).toBe(true);
      expect(result.results[1].violations.some(v => v.rule === 'singleton_violation')).toBe(true);
    });

    it('should handle one language failing while other passes', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'clean.arch': {
          inherits: 'base',
          description: 'Clean',
          constraints: [
            { rule: 'forbid_import', value: ['banned'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile)
        .mockResolvedValueOnce('/**\n * @arch clean.arch\n */\nexport class Clean {}')
        .mockResolvedValueOnce('# @arch clean.arch\nimport banned\n');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles([
        'src/clean.ts',
        'src/dirty.py',
      ]);

      expect(result.summary.passed).toBe(1);
      expect(result.summary.failed).toBe(1);
      expect(result.results[0].status).not.toBe('fail');
      expect(result.results[1].status).toBe('fail');
    });
  });

  describe('Python constraint specifics', () => {
    it('should detect forbid_pattern violation in Python code', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Service',
          constraints: [
            { rule: 'forbid_pattern', value: ['__import__('], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '# @arch app.service\n' +
        'mod = __import__("os")\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/danger.py');

      expect(result.violations.some(v => v.rule === 'forbid_pattern')).toBe(true);
    });

    it('should apply require_import constraint to Python files', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.typed': {
          inherits: 'base',
          description: 'Typed module',
          constraints: [
            { rule: 'require_import', value: ['typing'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '# @arch app.typed\n' +
        'class Untyped:\n' +
        '    def method(self):\n' +
        '        pass\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/untyped.py');

      expect(result.violations.some(v => v.rule === 'require_import')).toBe(true);
    });

    it('should detect forbid_call violation in Python file', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Service',
          constraints: [
            { rule: 'forbid_call', value: ['exit'], severity: 'error' },
          ],
          hints: [],
        },
      });

      // Need functionCalls in mock
      mockPythonParseFile.mockImplementationOnce((_path: string, content?: string) => {
        return Promise.resolve({
          language: 'python',
          filePath: _path,
          fileName: _path.split('/').pop(),
          extension: '.py',
          content: content || '',
          lineCount: 3,
          locCount: 2,
          imports: [],
          classes: [],
          interfaces: [],
          functions: [],
          functionCalls: [
            {
              callee: 'exit',
              methodName: 'exit',
              arguments: [],
              argumentCount: 0,
              location: { line: 2, column: 1 },
              rawText: 'exit(...)',
              controlFlow: { inTryBlock: false, inCatchBlock: false, inFinallyBlock: false, tryDepth: 0 },
              isConstructorCall: false,
              isOptionalChain: false,
            },
          ],
          mutations: [],
          exports: [],
        });
      });

      vi.mocked(readFile).mockResolvedValue(
        '# @arch app.service\n' +
        'exit(1)\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/bad.py');

      expect(result.violations.some(v => v.rule === 'forbid_call')).toBe(true);
    });

    it('should detect require_test_file violation for Python file', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.tested': {
          inherits: 'base',
          description: 'Tested module',
          constraints: [
            { rule: 'require_test_file', value: ['*.test.ts', '*.spec.ts', '*.test.py', 'test_*.py'], severity: 'warning' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '# @arch app.tested\n' +
        'class MyService:\n' +
        '    pass\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/my_service.py');

      // require_test_file checks for companion files — should warn since none exist
      expect(result.warnings.some(v => v.rule === 'require_test_file')).toBe(true);
    });

    it('should handle Python override annotations', async () => {
      const config = createConfig({
        overrides: {
          required_fields: ['reason'],
          warn_no_expiry: true,
          max_expiry_days: 365,
          fail_on_expired: true,
          max_per_file: 3,
        },
      });
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Service',
          constraints: [
            { rule: 'forbid_import', value: ['flask'], severity: 'error' },
          ],
          hints: [],
        },
      });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const expiryStr = futureDate.toISOString().split('T')[0];

      vi.mocked(readFile).mockResolvedValue(
        '# @arch app.service\n' +
        '# @override forbid_import:flask\n' +
        '# @reason Legacy web framework dependency\n' +
        `# @expires ${expiryStr}\n` +
        'from flask import Flask\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/web.py');

      expect(result.overridesActive).toHaveLength(1);
      expect(result.overridesActive[0].rule).toBe('forbid_import');
    });
  });
});
