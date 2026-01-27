/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationEngine } from '../../../../src/core/validation/engine.js';
import type { Config } from '../../../../src/core/config/schema.js';
import type { Registry, IntentRegistry } from '../../../../src/core/registry/schema.js';

// Mock file system
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
  basename: vi.fn((p: string) => p.split('/').pop()),
}));

// Mock validator registry to prevent actual TypeScript parsing
// This creates a mock that returns imports/exports based on content
const mockParseFile = vi.fn().mockImplementation((_path: string, content?: string) => {
  const imports: Array<{
    moduleSpecifier: string;
    defaultImport?: string;
    namedImports?: string[];
    location: { line: number; column: number };
  }> = [];

  // Simple parsing of import statements from content
  if (content) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const importMatch = line.match(/import\s+(?:(\w+)|{([^}]+)})\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const defaultImport = importMatch[1];
        const namedImportsStr = importMatch[2];
        const moduleSpecifier = importMatch[3];
        imports.push({
          moduleSpecifier,
          defaultImport,
          namedImports: namedImportsStr ? namedImportsStr.split(',').map(s => s.trim()) : undefined,
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
  TypeScriptValidator: vi.fn().mockImplementation(() => ({
    supportedLanguages: ['typescript'],
    supportedExtensions: ['.ts', '.tsx'],
    capabilities: {
      hasClassInheritance: true,
      hasInterfaces: true,
      hasDecorators: true,
      hasVisibilityModifiers: true,
    },
    parseFile: mockParseFile,
    dispose: vi.fn(),
  })),
}));

import { readFile } from '../../../../src/utils/file-system.js';

describe('ValidationEngine', () => {
  const projectRoot = '/test/project';

  const createConfig = (overrides: Partial<Config> = {}): Config => ({
    version: '1.0',
    registry: '.arch/registry.yaml',
    files: {
      untagged: {
        policy: 'warn',
      },
      scan: {
        include: ['**/*.ts'],
        exclude: ['**/node_modules/**'],
      },
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

  describe('constructor', () => {
    it('should create engine with valid config and registry', () => {
      const config = createConfig();
      const registry = createRegistry();

      const engine = new ValidationEngine(projectRoot, config, registry);
      expect(engine).toBeDefined();
    });

    it('should accept pattern registry', () => {
      const config = createConfig();
      const registry = createRegistry();
      const patternRegistry = { patterns: {} };

      const engine = new ValidationEngine(projectRoot, config, registry, patternRegistry);
      expect(engine).toBeDefined();
    });

    it('should accept intent registry', () => {
      const config = createConfig();
      const registry = createRegistry();
      const intentRegistry = { intents: {} };

      const engine = new ValidationEngine(projectRoot, config, registry, undefined, intentRegistry);
      expect(engine).toBeDefined();
    });
  });

  describe('setIntentRegistry', () => {
    it('should set intent registry', () => {
      const config = createConfig();
      const registry = createRegistry();
      const engine = new ValidationEngine(projectRoot, config, registry);

      engine.setIntentRegistry({ intents: {} });
      expect(engine).toBeDefined();
    });
  });

  describe('setContentCache', () => {
    it('should set content cache', () => {
      const config = createConfig();
      const registry = createRegistry();
      const engine = new ValidationEngine(projectRoot, config, registry);

      const cache = new Map<string, string>();
      engine.setContentCache(cache);
      expect(engine).toBeDefined();
    });
  });

  describe('validateFile', () => {
    it('should validate file with @arch tag', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test architecture',
          constraints: [],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 */
export class MyClass {}`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.file).toBe('src/test.ts');
      expect(result.archId).toBe('test.arch');
    });

    it('should return untagged result for file without @arch', async () => {
      const config = createConfig();
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue('export const x = 1;');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.archId).toBeNull();
    });

    it('should return error for unknown architecture', async () => {
      const config = createConfig();
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch nonexistent.arch
 */
export class MyClass {}`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.status).toBe('fail');
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should use content cache when available', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [],
          hints: [],
        },
      });

      const cache = new Map<string, string>();
      const absolutePath = '/test/project/src/cached.ts';
      cache.set(absolutePath, `/**\n * @arch test.arch\n */\nexport class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      engine.setContentCache(cache);

      const result = await engine.validateFile('src/cached.ts');

      expect(result.archId).toBe('test.arch');
      expect(vi.mocked(readFile)).not.toHaveBeenCalled();
    });

    it('should detect constraint violations', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 */
import axios from 'axios';
export const api = axios.get;`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.status).toBe('fail');
      expect(result.violations.some(v => v.rule === 'forbid_import')).toBe(true);
    });

    it('should handle warnings', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_pattern', value: ['console.log'], severity: 'warning' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 */
console.log('debug');`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.status).toBe('warn');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateFiles', () => {
    it('should validate multiple files', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**\n * @arch test.arch\n */\nexport class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles(['src/a.ts', 'src/b.ts']);

      expect(result.results).toHaveLength(2);
      expect(result.summary.total).toBe(2);
    });

    it('should calculate summary statistics', async () => {
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
        .mockResolvedValueOnce(`/**\n * @arch test.arch\n */\nexport class A {}`)
        .mockResolvedValueOnce('export const untagged = 1;');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles(['src/a.ts', 'src/b.ts']);

      expect(result.summary.total).toBe(2);
      expect(result.summary.passed).toBeDefined();
      expect(result.summary.failed).toBeDefined();
    });

    it('should detect singleton violations', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'singleton.arch': {
          inherits: 'base',
          description: 'Singleton architecture',
          singleton: true,
          constraints: [],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**\n * @arch singleton.arch\n */\nexport class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles(['src/a.ts', 'src/b.ts']);

      // Both files use singleton arch - should fail
      expect(result.results[0].status).toBe('fail');
      expect(result.results[0].violations.some(v => v.rule === 'singleton_violation')).toBe(true);
    });

    it('should handle validation errors gracefully', async () => {
      const config = createConfig();
      const registry = createRegistry();

      vi.mocked(readFile)
        .mockResolvedValueOnce(`/**\n * @arch test.arch\n */\nexport class A {}`)
        .mockRejectedValueOnce(new Error('File read error'));

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles(['src/a.ts', 'src/b.ts']);

      expect(result.summary.total).toBe(2);
      // One should fail due to read error
      expect(result.results.some(r => r.violations.some(v => v.rule === 'internal_error'))).toBe(true);
    });

    it('should count total errors and warnings', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'warn.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_pattern', value: ['console.log'], severity: 'warning' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**\n * @arch warn.arch\n */\nconsole.log('test');`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFiles(['src/a.ts']);

      expect(result.summary.warned).toBeGreaterThanOrEqual(0);
      expect(result.summary.totalWarnings).toBeDefined();
    });
  });

  describe('untagged file policies', () => {
    it('should fail on untagged file when policy is deny', async () => {
      const config = createConfig({
        files: {
          untagged: { policy: 'deny' },
          scan: { include: ['**/*.ts'], exclude: [] },
        },
      });
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue('export const x = 1;');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.status).toBe('fail');
      expect(result.violations.some(v => v.message.includes('Missing @arch tag'))).toBe(true);
    });

    it('should warn on untagged file when policy is warn', async () => {
      const config = createConfig({
        files: {
          untagged: { policy: 'warn' },
          scan: { include: ['**/*.ts'], exclude: [] },
        },
      });
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue('export const x = 1;');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.status).toBe('warn');
      expect(result.warnings.some(v => v.message.includes('Missing @arch tag'))).toBe(true);
    });

    it('should pass on untagged file when policy is allow', async () => {
      const config = createConfig({
        files: {
          untagged: { policy: 'allow' },
          scan: { include: ['**/*.ts'], exclude: [] },
        },
      });
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue('export const x = 1;');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.status).toBe('pass');
      expect(result.violations).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should provide hint for public directory files', async () => {
      const config = createConfig({
        files: {
          untagged: { policy: 'warn' },
          scan: { include: ['**/*.ts'], exclude: [] },
        },
      });
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue('export const x = 1;');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('public/assets/script.ts');

      expect(result.warnings.some(v => v.message.includes('archignore'))).toBe(true);
    });

    it('should provide hint for worker files', async () => {
      const config = createConfig({
        files: {
          untagged: { policy: 'warn' },
          scan: { include: ['**/*.ts'], exclude: [] },
        },
      });
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue('export const x = 1;');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/my.worker.ts');

      expect(result.warnings.some(v => v.message.toLowerCase().includes('worker'))).toBe(true);
    });

    it('should provide hint for generated files', async () => {
      const config = createConfig({
        files: {
          untagged: { policy: 'warn' },
          scan: { include: ['**/*.ts'], exclude: [] },
        },
      });
      const registry = createRegistry();

      vi.mocked(readFile).mockResolvedValue('export const x = 1;');

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/generated/types.ts');

      expect(result.warnings.some(v => v.message.includes('Generated'))).toBe(true);
    });
  });

  describe('override handling', () => {
    it('should apply valid overrides', async () => {
      // Use max_expiry_days: 365 to allow test expiry dates
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
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error' },
          ],
          hints: [],
        },
      });

      // Use an expiry date within the max_expiry_days
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const expiryStr = futureDate.toISOString().split('T')[0];

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 * @override forbid_import:axios
 * @reason Need for legacy API
 * @expires ${expiryStr}
 */
import axios from 'axios';
export const api = axios.get;`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.overridesActive).toHaveLength(1);
      expect(result.overridesActive[0].rule).toBe('forbid_import');
    });

    it('should detect expired overrides', async () => {
      const config = createConfig({
        validation: {
          strict: false,
          fail_on_warnings: false,
          parallel: false,
          fail_on_expired_override: true,
        },
      });
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 * @override forbid_import:axios
 * @reason Need for legacy API
 * @expires 2020-01-01
 */
import axios from 'axios';
export const api = axios.get;`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      // Should have override error for expired
      expect(result.violations.some(v => v.source === 'override')).toBe(true);
    });

    it('should enforce override limit', async () => {
      const config = createConfig({
        validation: {
          strict: false,
          fail_on_warnings: false,
          parallel: false,
          max_overrides_per_file: 1,
        },
      });
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_import', value: ['axios', 'lodash'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 * @override forbid_import:axios
 * @reason Need axios
 * @expires 2099-12-31
 * @override forbid_import:lodash
 * @reason Need lodash
 * @expires 2099-12-31
 */
import axios from 'axios';
import lodash from 'lodash';`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.violations.some(v => v.rule === 'override_limit')).toBe(true);
    });

    it('should match wildcard overrides', async () => {
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
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_import', value: ['axios', 'lodash'], severity: 'error' },
          ],
          hints: [],
        },
      });

      // Use an expiry date within the max_expiry_days
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const expiryStr = futureDate.toISOString().split('T')[0];

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 * @override forbid_import:*
 * @reason Testing wildcard
 * @expires ${expiryStr}
 */
import axios from 'axios';`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.status).not.toBe('fail');
    });
  });

  describe('intent validation', () => {
    it('should warn on undefined intents', async () => {
      const config = createConfig({
        intents: { undefined_intent: 'warning' },
      });
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [],
          hints: [],
        },
      });
      const intentRegistry: IntentRegistry = { intents: {} };

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 * @intent:unknown-intent
 */
export class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry, undefined, intentRegistry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.warnings.some(v => v.message.includes('Unknown intent'))).toBe(true);
    });

    it('should error on undefined intents when configured', async () => {
      const config = createConfig({
        intents: { undefined_intent: 'error' },
      });
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [],
          hints: [],
        },
      });
      const intentRegistry: IntentRegistry = { intents: {} };

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 * @intent:unknown-intent
 */
export class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry, undefined, intentRegistry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.violations.some(v => v.message.includes('Unknown intent'))).toBe(true);
    });

    it('should ignore undefined intents when configured', async () => {
      const config = createConfig({
        intents: { undefined_intent: 'ignore' },
      });
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [],
          hints: [],
        },
      });
      const intentRegistry: IntentRegistry = { intents: {} };

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 * @intent:unknown-intent
 */
export class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry, undefined, intentRegistry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.violations.filter(v => v.message.includes('Unknown intent'))).toHaveLength(0);
      expect(result.warnings.filter(v => v.message.includes('Unknown intent'))).toHaveLength(0);
    });

    it('should not warn for defined intents', async () => {
      const config = createConfig({
        intents: { undefined_intent: 'warning' },
      });
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [],
          hints: [],
        },
      });
      const intentRegistry: IntentRegistry = {
        intents: { 'cli-output': { description: 'CLI output intent' } },
      };

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 * @intent:cli-output
 */
export class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry, undefined, intentRegistry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.warnings.filter(v => v.message.includes('Unknown intent'))).toHaveLength(0);
    });

    it('should suggest similar intents', async () => {
      const config = createConfig({
        intents: { undefined_intent: 'warning' },
      });
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [],
          hints: [],
        },
      });
      const intentRegistry: IntentRegistry = {
        intents: {
          'cli-output': { description: 'CLI output' },
          'admin-only': { description: 'Admin only' },
        },
      };

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 * @intent:cli-ouput
 */
export class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry, undefined, intentRegistry);
      const result = await engine.validateFile('src/test.ts');

      // Should suggest cli-output since cli-ouput is similar
      expect(result.warnings.some(v => v.message.includes('cli-output'))).toBe(true);
    });
  });

  describe('constraint options', () => {
    it('should skip rules when skipRules is specified', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 */
import axios from 'axios';`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts', { skipRules: ['forbid_import'] });

      expect(result.violations.filter(v => v.rule === 'forbid_import')).toHaveLength(0);
    });

    it('should filter by severity when severities is specified', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error' },
            { rule: 'forbid_pattern', value: ['console.log'], severity: 'warning' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 */
import axios from 'axios';
console.log('test');`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts', { severities: ['warning'] });

      // Should only have warning severity violations
      expect(result.violations.filter(v => v.severity === 'error')).toHaveLength(0);
    });

    it('should treat warnings as errors in strict mode', async () => {
      const config = createConfig();
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_pattern', value: ['console.log'], severity: 'warning' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 */
console.log('test');`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts', { strict: true });

      expect(result.status).toBe('fail');
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('missing_why validation', () => {
    it('should warn when forbid_* constraint is missing why field', async () => {
      const config = createConfig({
        validation: {
          strict: false,
          fail_on_warnings: false,
          parallel: false,
          missing_why: 'warning',
        },
      });
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 */
export class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.warnings.some(v => v.rule === 'missing_why')).toBe(true);
    });

    it('should error when forbid_* constraint is missing why field and configured', async () => {
      const config = createConfig({
        validation: {
          strict: false,
          fail_on_warnings: false,
          parallel: false,
          missing_why: 'error',
        },
      });
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 */
export class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.violations.some(v => v.rule === 'missing_why')).toBe(true);
    });

    it('should not warn when forbid_* constraint has why field', async () => {
      const config = createConfig({
        validation: {
          strict: false,
          fail_on_warnings: false,
          parallel: false,
          missing_why: 'warning',
        },
      });
      const registry = createRegistry({
        'test.arch': {
          inherits: 'base',
          description: 'Test',
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', why: 'Use ApiClient instead' },
          ],
          hints: [],
        },
      });

      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch test.arch
 */
export class A {}`);

      const engine = new ValidationEngine(projectRoot, config, registry);
      const result = await engine.validateFile('src/test.ts');

      expect(result.warnings.filter(v => v.rule === 'missing_why')).toHaveLength(0);
    });
  });

  describe('methods', () => {
    it('should have validateFile method', () => {
      const config = createConfig();
      const registry = createRegistry();
      const engine = new ValidationEngine(projectRoot, config, registry);

      expect(typeof engine.validateFile).toBe('function');
    });

    it('should have validateFiles method', () => {
      const config = createConfig();
      const registry = createRegistry();
      const engine = new ValidationEngine(projectRoot, config, registry);

      expect(typeof engine.validateFiles).toBe('function');
    });

    it('should have dispose method', () => {
      const config = createConfig();
      const registry = createRegistry();
      const engine = new ValidationEngine(projectRoot, config, registry);

      expect(typeof engine.dispose).toBe('function');
    });
  });
});
