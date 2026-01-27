/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the ScaffoldEngine class.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScaffoldEngine } from '../../../../src/core/scaffold/engine.js';
import type { Registry } from '../../../../src/core/registry/schema.js';

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  fileExists: vi.fn(),
  ensureDir: vi.fn(),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(),
}));

import { readFile, writeFile, fileExists, ensureDir } from '../../../../src/utils/file-system.js';
import { resolveArchitecture } from '../../../../src/core/registry/resolver.js';

describe('ScaffoldEngine', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fileExists).mockResolvedValue(false);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
  });

  describe('constructor', () => {
    it('should create with project root', () => {
      const engine = new ScaffoldEngine(projectRoot);
      expect(engine).toBeInstanceOf(ScaffoldEngine);
    });

    it('should create with custom template directory', () => {
      const engine = new ScaffoldEngine(projectRoot, 'custom/templates');
      expect(engine).toBeInstanceOf(ScaffoldEngine);
    });

    it('should create with registry', () => {
      const registry: Registry = {
        nodes: { base: { description: 'Base' } },
        mixins: {},
      };
      const engine = new ScaffoldEngine(projectRoot, '.arch/templates', registry);
      expect(engine).toBeInstanceOf(ScaffoldEngine);
    });
  });

  describe('scaffold', () => {
    it('should scaffold a file with default template', async () => {
      const engine = new ScaffoldEngine(projectRoot);
      const result = await engine.scaffold({
        archId: 'test.arch',
        name: 'MyClass',
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('@arch test.arch');
      expect(result.content).toContain('MyClass');
      expect(writeFile).toHaveBeenCalled();
    });

    it('should scaffold to specified output path', async () => {
      const engine = new ScaffoldEngine(projectRoot);
      const result = await engine.scaffold({
        archId: 'test.arch',
        name: 'MyClass',
        outputPath: 'src/custom',
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('src/custom');
    });

    it('should fail if file exists and overwrite is false', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const engine = new ScaffoldEngine(projectRoot);
      const result = await engine.scaffold({
        archId: 'test.arch',
        name: 'ExistingClass',
        overwrite: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should overwrite file when overwrite is true', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const engine = new ScaffoldEngine(projectRoot);
      const result = await engine.scaffold({
        archId: 'test.arch',
        name: 'ExistingClass',
        overwrite: true,
      });

      expect(result.success).toBe(true);
      expect(writeFile).toHaveBeenCalled();
    });

    it('should use custom template when specified', async () => {
      vi.mocked(fileExists).mockImplementation(async (path) => {
        return path.includes('custom-template');
      });
      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch {{ARCH_ID}}
 * Custom template for {{CLASS_NAME}}
 */
export interface {{CLASS_NAME}}Interface {}
`);

      const engine = new ScaffoldEngine(projectRoot);
      const result = await engine.scaffold({
        archId: 'test.arch',
        name: 'MyInterface',
        template: 'custom-template.hbs',
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('Custom template');
      expect(result.content).toContain('MyInterface');
    });

    it('should substitute template variables', async () => {
      const engine = new ScaffoldEngine(projectRoot);
      const result = await engine.scaffold({
        archId: 'test.arch',
        name: 'MyService',
        variables: {
          CUSTOM_VAR: 'custom-value',
        },
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('test.arch');
      expect(result.content).toContain('MyService');
    });

    it('should use architecture default_path when available', async () => {
      const registry: Registry = {
        nodes: {
          base: { description: 'Base' },
          'test.service': { description: 'Service', inherits: 'base' },
        },
        mixins: {},
      };

      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.service',
          description: 'Service',
          inheritanceChain: ['base', 'test.service'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
          default_path: 'src/services',
          file_pattern: '${name}Service.ts',
        },
        conflicts: [],
      });

      const engine = new ScaffoldEngine(projectRoot, '.arch/templates', registry);
      const result = await engine.scaffold({
        archId: 'test.service',
        name: 'User',
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('src/services');
      expect(result.filePath).toContain('UserService.ts');
    });

    it('should use index entry suggested_path when available', async () => {
      const engine = new ScaffoldEngine(projectRoot);
      const index = {
        entries: [
          {
            arch_id: 'test.arch',
            keywords: ['test'],
            description: 'Test',
            suggested_path: 'src/features',
          },
        ],
      };

      const result = await engine.scaffold(
        {
          archId: 'test.arch',
          name: 'Feature',
        },
        index
      );

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('src/features');
    });

    it('should fail when template not found', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const engine = new ScaffoldEngine(projectRoot);
      const result = await engine.scaffold({
        archId: 'test.arch',
        name: 'MyClass',
        template: 'nonexistent-template',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Template not found');
    });

    it('should include date in generated file', async () => {
      const engine = new ScaffoldEngine(projectRoot);
      const result = await engine.scaffold({
        archId: 'test.arch',
        name: 'MyClass',
      });

      expect(result.success).toBe(true);
      // Date format: YYYY-MM-DD
      expect(result.content).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should ensure output directory exists', async () => {
      const engine = new ScaffoldEngine(projectRoot);
      await engine.scaffold({
        archId: 'test.arch',
        name: 'MyClass',
        outputPath: 'src/deep/nested/path',
      });

      expect(ensureDir).toHaveBeenCalled();
    });

    it('should extract layer from archId', async () => {
      const engine = new ScaffoldEngine(projectRoot);
      const result = await engine.scaffold({
        archId: 'archcodex.core.domain',
        name: 'Parser',
      });

      expect(result.success).toBe(true);
      // The layer should be extracted from archId
    });

    it('should handle scaffold with reference implementations', async () => {
      const registry: Registry = {
        nodes: {
          base: { description: 'Base' },
          'test.arch': { description: 'Test', inherits: 'base' },
        },
        mixins: {},
      };

      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test',
          inheritanceChain: ['base', 'test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
          reference_implementations: ['src/examples/reference.ts'],
        },
        conflicts: [],
      });

      // Mock the reference file read - return a minimal TypeScript file
      vi.mocked(fileExists).mockImplementation(async (path) => {
        return path.includes('reference.ts');
      });
      vi.mocked(readFile).mockResolvedValue(`
import { something } from './deps';

export class ReferenceClass {
  public doSomething(): void {
    // implementation
  }
}
`);

      const engine = new ScaffoldEngine(projectRoot, '.arch/templates', registry);
      const result = await engine.scaffold({
        archId: 'test.arch',
        name: 'MyClass',
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('Reference');
    });
  });
});
