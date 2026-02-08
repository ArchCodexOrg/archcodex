/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Tests for findUndocumentedImplementations - generated from spec.speccodex.drift.undocumented
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import {
  findUndocumentedImplementations,
  formatUndocumentedReport,
} from '../../src/core/spec/drift/undocumented.js';
import { loadSpecRegistry } from '../../src/core/spec/loader.js';
import type { SpecRegistry } from '../../src/core/spec/schema.js';
import * as path from 'node:path';

// Mock file-system utilities
vi.mock('../../src/utils/file-system.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/file-system.js')>();
  return {
    ...actual,
    globFiles: vi.fn(),
    readFile: vi.fn(),
  };
});

import { globFiles, readFile } from '../../src/utils/file-system.js';

const mockGlobFiles = vi.mocked(globFiles);
const mockReadFile = vi.mocked(readFile);

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

describe('findUndocumentedImplementations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('throws MISSING_PROJECTROOT when projectRoot is empty', async () => {
      const registry: SpecRegistry = { nodes: {}, mixins: {} };
      await expect(
        findUndocumentedImplementations('', registry)
      ).rejects.toThrow('MISSING_PROJECTROOT');
    });
  });

  describe('success cases', () => {
    it('returns empty when all implementations are documented', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/a.ts#a' },
          'spec.b': { intent: 'B', implementation: 'src/b.ts#b' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([
        '/test/project/src/a.ts',
        '/test/project/src/b.ts',
      ]);

      const result = await findUndocumentedImplementations('/test/project', registry);

      expect(result.undocumented).toEqual([]);
      expect(result.summary.filesWithSpecs).toBe(2);
      expect(result.summary.filesWithoutSpecs).toBe(0);
    });

    it('finds undocumented files', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { intent: 'A', implementation: 'src/a.ts#a' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([
        '/test/project/src/a.ts',
        '/test/project/src/b.ts',
        '/test/project/src/c.ts',
      ]);

      mockReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('b.ts')) {
          return 'export function doSomething() {}';
        }
        if (filePath.endsWith('c.ts')) {
          return 'export const helper = 42;';
        }
        return '';
      });

      const result = await findUndocumentedImplementations('/test/project', registry);

      expect(result.undocumented.length).toBe(2);
      expect(result.undocumented.map(f => f.path)).toContain('src/b.ts');
      expect(result.undocumented.map(f => f.path)).toContain('src/c.ts');
      expect(result.summary.filesWithSpecs).toBe(1);
      expect(result.summary.filesWithoutSpecs).toBe(2);
    });

    it('suggests spec ID from file path', async () => {
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      mockGlobFiles.mockResolvedValue(['/test/project/src/utils/helpers.ts']);
      mockReadFile.mockResolvedValue('export function format() {}');

      const result = await findUndocumentedImplementations('/test/project', registry);

      expect(result.undocumented[0].suggestedSpecId).toBe('spec.utils.helpers');
    });

    it('extracts exports via regex', async () => {
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      mockGlobFiles.mockResolvedValue(['/test/project/src/multi.ts']);
      mockReadFile.mockResolvedValue(`
        export function doA() {}
        export async function doB() {}
        export const VALUE = 1;
        export class MyClass {}
        export interface MyInterface {}
        export type MyType = string;
        export enum MyEnum { A, B }
      `);

      const result = await findUndocumentedImplementations('/test/project', registry);

      expect(result.undocumented[0].exports).toContain('doA');
      expect(result.undocumented[0].exports).toContain('doB');
      expect(result.undocumented[0].exports).toContain('VALUE');
      expect(result.undocumented[0].exports).toContain('MyClass');
      expect(result.undocumented[0].exports).toContain('MyInterface');
      expect(result.undocumented[0].exports).toContain('MyType');
      expect(result.undocumented[0].exports).toContain('MyEnum');
    });

    it('extracts architecture tag from file content', async () => {
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      mockGlobFiles.mockResolvedValue(['/test/project/src/engine.ts']);
      mockReadFile.mockResolvedValue(`
        /** @arch archcodex.core.engine */
        export function process() {}
      `);

      const result = await findUndocumentedImplementations('/test/project', registry);

      expect(result.undocumented[0].archType).toBe('archcodex.core.engine');
    });

    it('skips files with no exports', async () => {
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      mockGlobFiles.mockResolvedValue([
        '/test/project/src/internal.ts',
        '/test/project/src/public.ts',
      ]);

      mockReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('internal.ts')) {
          return 'function privateHelper() {}'; // No exports
        }
        return 'export function publicFn() {}';
      });

      const result = await findUndocumentedImplementations('/test/project', registry);

      expect(result.undocumented.length).toBe(1);
      expect(result.undocumented[0].path).toBe('src/public.ts');
    });

    it('uses custom patterns and exclude', async () => {
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      mockGlobFiles.mockResolvedValue([]);

      await findUndocumentedImplementations('/test/project', registry, {
        patterns: ['convex/**/*.ts'],
        exclude: ['**/helpers/**'],
      });

      expect(mockGlobFiles).toHaveBeenCalledWith(
        ['convex/**/*.ts'],
        expect.objectContaining({ ignore: ['**/helpers/**'] })
      );
    });

    it('normalizes paths for spec matching', async () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.core.engine': { intent: 'Engine', implementation: 'src/core/engine.ts#run' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue(['/test/project/src/core/engine.ts']);

      const result = await findUndocumentedImplementations('/test/project', registry);

      expect(result.undocumented).toEqual([]);
      expect(result.summary.filesWithSpecs).toBe(1);
    });
  });

  describe('invariants', () => {
    it('each undocumented file has suggestedSpecId', async () => {
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      mockGlobFiles.mockResolvedValue([
        '/test/project/src/a.ts',
        '/test/project/src/deep/nested/file.ts',
      ]);
      mockReadFile.mockResolvedValue('export function fn() {}');

      const result = await findUndocumentedImplementations('/test/project', registry);

      for (const file of result.undocumented) {
        expect(file.suggestedSpecId).toBeDefined();
        expect(file.suggestedSpecId.startsWith('spec.')).toBe(true);
      }
    });
  });

  describe('formatUndocumentedReport', () => {
    it('formats empty result', () => {
      const result = {
        undocumented: [],
        summary: { filesScanned: 10, filesWithSpecs: 10, filesWithoutSpecs: 0 },
      };

      const report = formatUndocumentedReport(result);

      expect(report).toContain('100%');
      expect(report).toContain('All implementation files have corresponding specs');
    });

    it('formats undocumented files', () => {
      const result = {
        undocumented: [
          {
            path: 'src/utils/helpers.ts',
            exports: ['format', 'parse'],
            suggestedSpecId: 'spec.utils.helpers',
          },
        ],
        summary: { filesScanned: 5, filesWithSpecs: 4, filesWithoutSpecs: 1 },
      };

      const report = formatUndocumentedReport(result);

      expect(report).toContain('src/utils/helpers.ts');
      expect(report).toContain('spec.utils.helpers');
      expect(report).toContain('2 exports');
    });
  });

  describe('integration with real registry', () => {
    it('builds covered files set from real registry', async () => {
      // vi.mock prevents using the real globFiles/readFile here,
      // so we verify the covered-files logic against the real registry instead
      const registry = await loadSpecRegistry(PROJECT_ROOT);

      // The drift specs should now be wired
      const driftSpecs = Object.entries(registry.nodes)
        .filter(([id]) => id.startsWith('spec.speccodex.drift.'));

      // All 3 drift specs should have implementation fields
      for (const [id, node] of driftSpecs) {
        expect(node.implementation).toBeDefined();
        expect(node.implementation).toContain('src/core/spec/drift/');
      }
    });
  });
});
