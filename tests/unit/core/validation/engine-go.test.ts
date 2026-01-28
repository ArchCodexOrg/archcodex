/**
 * @arch archcodex.test.unit
 *
 * Integration tests for Go file validation through the ValidationEngine.
 * Tests constraint application, multi-language batch validation, and
 * Go-specific semantic model handling.
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

// Use the real GoValidator — it's pure regex with no I/O (readFile is already mocked above)

// Mock TypeScript validator
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

// Mock Python validator
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
    parseFile: vi.fn().mockResolvedValue({
      language: 'python',
      imports: [],
      exports: [],
      classes: [],
      functions: [],
      functionCalls: [],
      mutations: [],
      interfaces: [],
    }),
    dispose: vi.fn(),
  };
  }),
}));

import { readFile } from '../../../../src/utils/file-system.js';

describe('ValidationEngine - Go support', () => {
  const projectRoot = '/test/project';

  const createConfig = (overrides: Partial<Config> = {}): Config => ({
    version: '1.0',
    registry: '.arch/registry.yaml',
    files: {
      untagged: { policy: 'warn' },
      scan: { include: ['**/*.ts', '**/*.go'], exclude: ['**/node_modules/**'] },
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

  describe('Go file validation', () => {
    it('should validate a Go file with @arch tag', async () => {
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
        '// @arch app.service\n' +
        'package service\n\n' +
        'type UserService struct {\n' +
        '\tdb *sql.DB\n' +
        '}\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/user.go');

      expect(result.file).toBe('src/services/user.go');
      expect(result.archId).toBe('app.service');
      expect(result.status).not.toBe('fail');
    });

    it('should detect forbid_import violation in Go file', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Service layer',
          constraints: [
            { rule: 'forbid_import', value: ['os/exec'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '// @arch app.service\n' +
        'package service\n\n' +
        'import "os/exec"\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/runner.go');

      expect(result.status).toBe('fail');
      expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
    });

    it('should pass when Go file has no forbidden imports', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Service layer',
          constraints: [
            { rule: 'forbid_import', value: ['os/exec'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '// @arch app.service\n' +
        'package service\n\n' +
        'import "fmt"\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/clean.go');

      expect(result.violations.filter(v => v.rule === 'forbid_import')).toHaveLength(0);
    });

    it('should detect max_public_methods violation in Go struct', async () => {
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
        '// @arch app.service\n' +
        'package service\n\n' +
        'type BigService struct{}\n\n' +
        'func (s *BigService) MethodA() {}\n' +
        'func (s *BigService) MethodB() {}\n' +
        'func (s *BigService) MethodC() {}\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/big.go');

      expect(result.violations.some(v => v.rule === 'max_public_methods')).toBe(true);
    });

    it('should warn on untagged Go file', async () => {
      const config = createConfig({
        files: {
          untagged: { policy: 'warn' },
          scan: { include: ['**/*.go'], exclude: [] },
        },
      });
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue(
        'package helper\n\nfunc Helper() int {\n\treturn 42\n}\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/utils/helper.go');

      expect(result.status).toBe('warn');
      expect(result.archId).toBeNull();
      expect(result.warnings.some(v => v.message.includes('Missing @arch tag'))).toBe(true);
    });
  });

  describe('multi-language batch validation', () => {
    it('should validate a batch of mixed TypeScript and Go files', async () => {
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
          '// @arch app.service\npackage service\n\ntype GoService struct{}\n'
        );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles([
        'src/services/ts-service.ts',
        'src/services/go-service.go',
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
        'go.layer': {
          inherits: 'base',
          description: 'Go layer',
          constraints: [
            { rule: 'forbid_import', value: ['unsafe'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile)
        .mockResolvedValueOnce(
          '/**\n * @arch ts.layer\n */\nimport _ from \'lodash\';'
        )
        .mockResolvedValueOnce(
          '// @arch go.layer\npackage main\n\nimport "unsafe"\n'
        );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles([
        'src/ts-module.ts',
        'src/go-module.go',
      ]);

      expect(result.summary.failed).toBe(2);
      expect(result.results[0].violations.some(v => v.rule === 'forbid_import')).toBe(true);
      expect(result.results[1].violations.some(v => v.rule === 'forbid_import')).toBe(true);
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
        .mockResolvedValueOnce('// @arch clean.arch\npackage main\n\nimport "banned"\n');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles([
        'src/clean.ts',
        'src/dirty.go',
      ]);

      expect(result.summary.passed).toBe(1);
      expect(result.summary.failed).toBe(1);
      expect(result.results[0].status).not.toBe('fail');
      expect(result.results[1].status).toBe('fail');
    });
  });

  describe('Go constraint specifics', () => {
    it('should detect forbid_pattern violation in Go code', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.service': {
          inherits: 'base',
          description: 'Service',
          constraints: [
            { rule: 'forbid_pattern', value: ['os.Exit('], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '// @arch app.service\n' +
        'package service\n\n' +
        'func Shutdown() {\n' +
        '\tos.Exit(1)\n' +
        '}\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/shutdown.go');

      expect(result.violations.some(v => v.rule === 'forbid_pattern')).toBe(true);
    });

    it('should apply require_import constraint to Go files', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'app.logged': {
          inherits: 'base',
          description: 'Logged module',
          constraints: [
            { rule: 'require_import', value: ['log'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(
        '// @arch app.logged\n' +
        'package service\n\n' +
        'type Service struct{}\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/nolog.go');

      expect(result.violations.some(v => v.rule === 'require_import')).toBe(true);
    });

    it('should handle Go override annotations', async () => {
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
            { rule: 'forbid_import', value: ['unsafe'], severity: 'error' },
          ],
          hints: [],
        },
      });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const expiryStr = futureDate.toISOString().split('T')[0];

      vi.mocked(readFile).mockResolvedValue(
        '// @arch app.service\n' +
        '// @override forbid_import:unsafe\n' +
        '// @reason Need unsafe for cgo interop\n' +
        `// @expires ${expiryStr}\n` +
        'package service\n\n' +
        'import "unsafe"\n'
      );

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/services/cgo.go');

      expect(result.overridesActive).toHaveLength(1);
      expect(result.overridesActive[0].rule).toBe('forbid_import');
    });
  });
});
