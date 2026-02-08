/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Spec-generated tests for findUndocumentedImplementations
 * Source: spec.speccodex.drift.undocumented
 *
 * Generated via: archcodex spec generate spec.speccodex.drift.undocumented --type unit
 * Then fixed for mocking, import paths, and error handling patterns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findUndocumentedImplementations,
} from '../../src/core/spec/drift/undocumented.js';
import type { SpecRegistry } from '../../src/core/spec/schema.js';

// Mock file-system utilities (required - function does I/O)
vi.mock('../../src/utils/file-system.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/file-system.js')>();
  return {
    ...actual,
    globFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
  };
});

import { globFiles, readFile } from '../../src/utils/file-system.js';

const mockGlobFiles = vi.mocked(globFiles);
const mockReadFile = vi.mocked(readFile);

// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
describe('findUndocumentedImplementations (spec-generated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGlobFiles.mockResolvedValue([]);
    mockReadFile.mockResolvedValue('');
  });

  describe('success cases', () => {
    it('all implementations documented', async () => {
      // Arrange
      const projectRoot = '/test/project';
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { implementation: 'src/a.ts#a' },
          'spec.b': { implementation: 'src/b.ts#b' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([
        '/test/project/src/a.ts',
        '/test/project/src/b.ts',
      ]);

      // Act
      const result = await findUndocumentedImplementations(projectRoot, registry);

      // Assert
      expect(result.undocumented).toMatchObject([]);
    });

    it('some undocumented', async () => {
      // Arrange
      const projectRoot = '/test/project';
      const registry: SpecRegistry = {
        nodes: {
          'spec.a': { implementation: 'src/a.ts#a' },
          'spec.b': { implementation: 'src/b.ts#b' },
        },
        mixins: {},
      };

      mockGlobFiles.mockResolvedValue([
        '/test/project/src/a.ts',
        '/test/project/src/b.ts',
        '/test/project/src/c.ts',
      ]);
      mockReadFile.mockResolvedValue('export function orphan() {}');

      // Act
      const result = await findUndocumentedImplementations(projectRoot, registry);

      // Assert
      expect(result.undocumented).toBeDefined();
      expect(result.undocumented.length).toBeGreaterThan(0);
    });

    it('suggests spec ID from path', async () => {
      // Arrange
      const projectRoot = '/test/project';
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      mockGlobFiles.mockResolvedValue(['/test/project/src/utils/format.ts']);
      mockReadFile.mockResolvedValue('export function format() {}');

      // Act
      const result = await findUndocumentedImplementations(projectRoot, registry);

      // Assert
      expect(result.undocumented).toBeDefined();
      expect(result.undocumented[0].suggestedSpecId).toBe('spec.utils.format');
    });

    it('detects architecture from file pattern', async () => {
      // Arrange
      const projectRoot = '/test/project';
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      mockGlobFiles.mockResolvedValue(['/test/project/src/engine.ts']);
      mockReadFile.mockResolvedValue(
        '/** @arch archcodex.core.engine */\nexport function run() {}'
      );

      // Act
      const result = await findUndocumentedImplementations(projectRoot, registry);

      // Assert
      expect(result.undocumented).toBeDefined();
      expect(result.undocumented[0].archType).toBe('archcodex.core.engine');
    });
  });

  describe('error cases', () => {
    it('missing project root', async () => {
      // Arrange
      const projectRoot = '';
      const registry: SpecRegistry = { nodes: {}, mixins: {} };

      // Act & Assert
      await expect(findUndocumentedImplementations(projectRoot, registry))
        .rejects.toThrow('MISSING_PROJECTROOT');
    });
  });
});
// @speccodex:end
