/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP validation handlers (check, read).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCheck, handleRead } from '../../../../src/mcp/handlers/validation.js';

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
  loadPartialRegistry: vi.fn(),
  loadRegistryFromFiles: vi.fn(),
}));

vi.mock('../../../../src/core/validation/engine.js', () => ({
  ValidationEngine: vi.fn(function() {
    return {
    validateFiles: vi.fn(),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/validation/project-validator.js', () => ({
  ProjectValidator: vi.fn(function() {
    return {
    validateProject: vi.fn(),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/hydration/engine.js', () => ({
  HydrationEngine: vi.fn(function() {
    return {
    hydrateFile: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/patterns/loader.js', () => ({
  loadPatternRegistry: vi.fn(),
  findMatchingPatterns: vi.fn(),
  filterByRelevance: vi.fn(),
}));

vi.mock('../../../../src/core/patterns/extractor.js', () => ({
  extractImportsAndExports: vi.fn(),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn(),
}));

import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry, loadPartialRegistry } from '../../../../src/core/registry/loader.js';
import { ValidationEngine } from '../../../../src/core/validation/engine.js';
import { ProjectValidator } from '../../../../src/core/validation/project-validator.js';
import { HydrationEngine } from '../../../../src/core/hydration/engine.js';
import { loadPatternRegistry, findMatchingPatterns, filterByRelevance } from '../../../../src/core/patterns/loader.js';
import { extractImportsAndExports } from '../../../../src/core/patterns/extractor.js';
import { globFiles, readFile } from '../../../../src/utils/file-system.js';
import { loadArchIgnore } from '../../../../src/utils/archignore.js';

describe('MCP Validation Handlers', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadConfig).mockResolvedValue({});
    vi.mocked(loadRegistry).mockResolvedValue({
      nodes: { base: { description: 'Base' } },
      mixins: {},
    });
    vi.mocked(loadPatternRegistry).mockResolvedValue({ patterns: {} });
    vi.mocked(loadArchIgnore).mockResolvedValue({
      ignores: () => false,
      filter: (files: string[]) => files,
      patterns: () => [],
    });
    vi.mocked(globFiles).mockResolvedValue([]);
    vi.mocked(readFile).mockResolvedValue('');
  });

  describe('handleCheck', () => {
    it('should return error when files parameter is empty', async () => {
      const result = await handleCheck(projectRoot, [], {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No files specified');
    });

    it('should return error when files parameter is undefined', async () => {
      const result = await handleCheck(projectRoot, undefined, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No files specified');
    });

    it('should validate files and return results', async () => {
      const mockValidateFiles = vi.fn().mockResolvedValue({
        summary: { total: 1, passed: 1, failed: 0, warned: 0, skipped: 0, missingArch: 0 },
        results: [{
          file: 'src/test.ts',
          archId: 'test.arch',
          status: 'passed',
          violations: [],
          warnings: [],
        }],
      });

      vi.mocked(ValidationEngine).mockImplementation(function() {
      return {
        validateFiles: mockValidateFiles,
        dispose: vi.fn(),
      } as unknown as ValidationEngine;
    });

      const result = await handleCheck(projectRoot, ['src/test.ts'], {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary.total).toBe(1);
      expect(parsed.summary.passed).toBe(1);
    });

    it('should expand glob patterns', async () => {
      vi.mocked(globFiles).mockResolvedValue(['src/a.ts', 'src/b.ts']);

      const mockValidateFiles = vi.fn().mockResolvedValue({
        summary: { total: 2, passed: 2, failed: 0, warned: 0, skipped: 0, missingArch: 0 },
        results: [
          { file: 'src/a.ts', archId: 'test.arch', status: 'passed', violations: [], warnings: [] },
          { file: 'src/b.ts', archId: 'test.arch', status: 'passed', violations: [], warnings: [] },
        ],
      });

      vi.mocked(ValidationEngine).mockImplementation(function() {
      return {
        validateFiles: mockValidateFiles,
        dispose: vi.fn(),
      } as unknown as ValidationEngine;
    });

      await handleCheck(projectRoot, ['src/*.ts'], {});

      expect(globFiles).toHaveBeenCalledWith('src/*.ts', expect.any(Object));
    });

    it('should use ProjectValidator when project option is true', async () => {
      const mockValidateProject = vi.fn().mockResolvedValue({
        summary: { total: 1, passed: 1, failed: 0, warned: 0, skipped: 0, missingArch: 0 },
        projectStats: {},
        packageViolations: [],
        layerViolations: [],
        coverageGaps: [],
        coverageStats: {},
        similarityViolations: [],
        results: [{
          file: 'src/test.ts',
          archId: 'test.arch',
          status: 'passed',
          violations: [],
          warnings: [],
        }],
      });

      vi.mocked(ProjectValidator).mockImplementation(function() {
      return {
        validateProject: mockValidateProject,
        dispose: vi.fn(),
      } as unknown as ProjectValidator;
    });

      const result = await handleCheck(projectRoot, ['src/test.ts'], { project: true });

      expect(ProjectValidator).toHaveBeenCalled();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.projectStats).toBeDefined();
    });

    it('should apply archIgnore filter', async () => {
      const mockFilter = vi.fn().mockReturnValue(['src/valid.ts']);
      vi.mocked(loadArchIgnore).mockResolvedValue({
        ignores: () => false,
        filter: mockFilter,
        patterns: () => [],
      });

      const mockValidateFiles = vi.fn().mockResolvedValue({
        summary: { total: 1, passed: 1, failed: 0, warned: 0, skipped: 0, missingArch: 0 },
        results: [{ file: 'src/valid.ts', archId: 'test.arch', status: 'passed', violations: [], warnings: [] }],
      });

      vi.mocked(ValidationEngine).mockImplementation(function() {
      return {
        validateFiles: mockValidateFiles,
        dispose: vi.fn(),
      } as unknown as ValidationEngine;
    });

      await handleCheck(projectRoot, ['src/valid.ts', 'src/ignored.ts'], {});

      expect(mockFilter).toHaveBeenCalled();
    });

    it('should use partial registry when registryPattern is provided', async () => {
      const mockValidateFiles = vi.fn().mockResolvedValue({
        summary: { total: 1, passed: 1, failed: 0, warned: 0, skipped: 0, missingArch: 0 },
        results: [{ file: 'src/test.ts', archId: 'test.arch', status: 'passed', violations: [], warnings: [] }],
      });

      vi.mocked(ValidationEngine).mockImplementation(function() {
      return {
        validateFiles: mockValidateFiles,
        dispose: vi.fn(),
      } as unknown as ValidationEngine;
    });

      await handleCheck(projectRoot, ['src/test.ts'], { registryPattern: ['core/**'] });

      expect(loadPartialRegistry).toHaveBeenCalledWith(projectRoot, ['core/**']);
    });
  });

  describe('handleRead', () => {
    it('should hydrate file and return context', async () => {
      const mockHydrateFile = vi.fn().mockResolvedValue({
        header: 'ARCH: test.arch',
        content: 'const x = 1;',
        output: 'ARCH: test.arch\n\nconst x = 1;',
        tokenCount: 50,
        truncated: false,
      });

      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as unknown as HydrationEngine;
    });

      vi.mocked(findMatchingPatterns).mockReturnValue([]);
      vi.mocked(filterByRelevance).mockReturnValue([]);
      vi.mocked(extractImportsAndExports).mockReturnValue({ imports: [], exports: [] });

      const result = await handleRead(projectRoot, 'src/test.ts');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.file).toBe('src/test.ts');
      expect(parsed.archContext).toContain('ARCH: test.arch');
      expect(parsed.tokenCount).toBe(50);
    });

    it('should default to AI format', async () => {
      const mockHydrateFile = vi.fn().mockResolvedValue({
        header: 'ARCH: test.arch',
        tokenCount: 50,
        truncated: false,
      });

      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as unknown as HydrationEngine;
    });

      vi.mocked(findMatchingPatterns).mockReturnValue([]);
      vi.mocked(filterByRelevance).mockReturnValue([]);
      vi.mocked(extractImportsAndExports).mockReturnValue({ imports: [], exports: [] });

      await handleRead(projectRoot, 'src/test.ts');

      expect(mockHydrateFile).toHaveBeenCalledWith('src/test.ts', {
        format: 'ai',
        includeContent: false,
      });
    });

    it('should include file content for non-AI formats', async () => {
      const mockHydrateFile = vi.fn().mockResolvedValue({
        header: 'ARCH: test.arch',
        content: 'const x = 1;',
        output: 'ARCH: test.arch\n\nconst x = 1;',
        tokenCount: 100,
        truncated: false,
      });

      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as unknown as HydrationEngine;
    });

      vi.mocked(findMatchingPatterns).mockReturnValue([]);
      vi.mocked(filterByRelevance).mockReturnValue([]);
      vi.mocked(extractImportsAndExports).mockReturnValue({ imports: [], exports: [] });

      const result = await handleRead(projectRoot, 'src/test.ts', 'verbose');

      expect(mockHydrateFile).toHaveBeenCalledWith('src/test.ts', {
        format: 'verbose',
        includeContent: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.fileContent).toBe('const x = 1;');
    });

    it('should include relevant patterns when found', async () => {
      const mockHydrateFile = vi.fn().mockResolvedValue({
        header: 'ARCH: test.arch',
        tokenCount: 50,
        truncated: false,
      });

      vi.mocked(HydrationEngine).mockImplementation(function() {
      return {
        hydrateFile: mockHydrateFile,
      } as unknown as HydrationEngine;
    });

      vi.mocked(findMatchingPatterns).mockReturnValue([
        { name: 'logger', pattern: { canonical: 'src/utils/logger.ts', exports: ['logger'], usage: 'Use for logging' }, score: 0.9, matchedKeywords: ['log'] },
      ]);
      vi.mocked(filterByRelevance).mockReturnValue([
        { name: 'logger', pattern: { canonical: 'src/utils/logger.ts', exports: ['logger'], usage: 'Use for logging' }, score: 0.9, matchedKeywords: ['log'] },
      ]);
      vi.mocked(extractImportsAndExports).mockReturnValue({ imports: ['./logger'], exports: [] });

      const result = await handleRead(projectRoot, 'src/test.ts');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.relevantPatterns).toBeDefined();
      expect(parsed.relevantPatterns.length).toBeGreaterThan(0);
      expect(parsed.relevantPatterns[0].name).toBe('logger');
    });
  });
});
