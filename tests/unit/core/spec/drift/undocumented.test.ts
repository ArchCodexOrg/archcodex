/**
 * @arch archcodex.test.unit
 *
 * Tests for undocumented implementation detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(async () => []),
  readFile: vi.fn(async () => ''),
}));

import {
  findUndocumentedImplementations,
  formatUndocumentedReport,
} from '../../../../../src/core/spec/drift/undocumented.js';
import type { SpecRegistry } from '../../../../../src/core/spec/schema.js';
import type { FindUndocumentedResult } from '../../../../../src/core/spec/drift/undocumented.js';
import { globFiles, readFile } from '../../../../../src/utils/file-system.js';

const mockGlobFiles = vi.mocked(globFiles);
const mockReadFile = vi.mocked(readFile);

describe('undocumented implementation detection', () => {
  const createRegistry = (): SpecRegistry => ({
    version: '1.0',
    nodes: {
      'spec.wired': {
        intent: 'Wired',
        implementation: 'src/core/wired.ts#fn',
      },
    },
    mixins: {},
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findUndocumentedImplementations', () => {
    it('throws when projectRoot is empty', async () => {
      await expect(
        findUndocumentedImplementations('', createRegistry()),
      ).rejects.toThrow('MISSING_PROJECTROOT');
    });

    it('returns empty when no files scanned', async () => {
      mockGlobFiles.mockResolvedValue([]);

      const result = await findUndocumentedImplementations('/project', createRegistry());

      expect(result.undocumented).toHaveLength(0);
      expect(result.summary.filesScanned).toBe(0);
    });

    it('identifies files not covered by specs', async () => {
      mockGlobFiles.mockResolvedValue(['/project/src/core/uncovered.ts']);
      mockReadFile.mockResolvedValue('export function doSomething() {}');

      const result = await findUndocumentedImplementations('/project', createRegistry());

      expect(result.undocumented).toHaveLength(1);
      expect(result.undocumented[0].path).toContain('uncovered.ts');
      expect(result.undocumented[0].exports).toContain('doSomething');
    });

    it('excludes files that are covered by specs', async () => {
      mockGlobFiles.mockResolvedValue(['/project/src/core/wired.ts']);
      mockReadFile.mockResolvedValue('export function fn() {}');

      const result = await findUndocumentedImplementations('/project', createRegistry());

      expect(result.summary.filesWithSpecs).toBe(1);
      expect(result.undocumented).toHaveLength(0);
    });

    it('skips files with no exports', async () => {
      mockGlobFiles.mockResolvedValue(['/project/src/core/internal.ts']);
      mockReadFile.mockResolvedValue('const x = 1;');

      const result = await findUndocumentedImplementations('/project', createRegistry());

      expect(result.undocumented).toHaveLength(0);
    });

    it('extracts @arch tag from source', async () => {
      mockGlobFiles.mockResolvedValue(['/project/src/core/tagged.ts']);
      mockReadFile.mockResolvedValue(
        '/** @arch archcodex.core.engine */\nexport function doThing() {}',
      );

      const result = await findUndocumentedImplementations('/project', createRegistry());

      expect(result.undocumented[0].archType).toBe('archcodex.core.engine');
    });

    it('suggests spec ID from file path', async () => {
      mockGlobFiles.mockResolvedValue(['/project/src/core/audit/checker.ts']);
      mockReadFile.mockResolvedValue('export function check() {}');

      const result = await findUndocumentedImplementations('/project', createRegistry());

      expect(result.undocumented[0].suggestedSpecId).toBe('spec.core.audit.checker');
    });

    it('extracts multiple export types', async () => {
      mockGlobFiles.mockResolvedValue(['/project/src/core/multi.ts']);
      mockReadFile.mockResolvedValue([
        'export function doA() {}',
        'export const B = 1;',
        'export class MyClass {}',
        'export interface MyInterface {}',
        'export type MyType = string;',
        'export enum MyEnum {}',
      ].join('\n'));

      const result = await findUndocumentedImplementations('/project', createRegistry());

      expect(result.undocumented[0].exports).toEqual(
        expect.arrayContaining(['doA', 'B', 'MyClass', 'MyInterface', 'MyType', 'MyEnum']),
      );
    });
  });

  describe('formatUndocumentedReport', () => {
    it('shows coverage stats', () => {
      const result: FindUndocumentedResult = {
        undocumented: [],
        summary: { filesScanned: 10, filesWithSpecs: 8, filesWithoutSpecs: 0 },
      };

      const output = formatUndocumentedReport(result);
      expect(output).toContain('Implementation Coverage: 80%');
      expect(output).toContain('Scanned: 10 files');
      expect(output).toContain('With specs: 8');
    });

    it('shows all-covered message when no undocumented', () => {
      const result: FindUndocumentedResult = {
        undocumented: [],
        summary: { filesScanned: 5, filesWithSpecs: 5, filesWithoutSpecs: 0 },
      };

      const output = formatUndocumentedReport(result);
      expect(output).toContain('All implementation files have corresponding specs');
    });

    it('lists undocumented files with suggested spec IDs', () => {
      const result: FindUndocumentedResult = {
        undocumented: [
          {
            path: 'src/core/utils.ts',
            exports: ['helperA', 'helperB'],
            suggestedSpecId: 'spec.core.utils',
            archType: 'archcodex.util',
          },
        ],
        summary: { filesScanned: 5, filesWithSpecs: 4, filesWithoutSpecs: 1 },
      };

      const output = formatUndocumentedReport(result);
      expect(output).toContain('src/core/utils.ts');
      expect(output).toContain('[archcodex.util]');
      expect(output).toContain('2 exports');
      expect(output).toContain('spec.core.utils');
    });

    it('handles 100% coverage when no files scanned', () => {
      const result: FindUndocumentedResult = {
        undocumented: [],
        summary: { filesScanned: 0, filesWithSpecs: 0, filesWithoutSpecs: 0 },
      };

      const output = formatUndocumentedReport(result);
      expect(output).toContain('100%');
    });
  });
});
