/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP context handlers (session-context, plan-context, validate-plan, impact, why, decide).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleSessionContext,
  handlePlanContext,
  handleValidatePlan,
  handleImpact,
  handleWhy,
} from '../../../../src/mcp/handlers/context.js';

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn(),
}));

vi.mock('../../../../src/core/session/index.js', () => ({
  getSessionContext: vi.fn(),
}));

vi.mock('../../../../src/core/plan-context/index.js', () => ({
  getPlanContext: vi.fn(),
  formatPlanContextCompact: vi.fn(),
}));

vi.mock('../../../../src/core/validate-plan/index.js', () => ({
  validatePlan: vi.fn(),
  formatValidationResult: vi.fn(),
}));

vi.mock('../../../../src/core/discovery/index.js', () => ({
  loadDecisionTree: vi.fn(),
  startNavigation: vi.fn(),
  getCurrentNode: vi.fn(),
  answerQuestion: vi.fn(),
  isDecisionResult: vi.fn(),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
}));

vi.mock('../../../../src/mcp/utils.js', () => ({
  isProjectInitialized: vi.fn(),
  findNearbyProject: vi.fn(),
  normalizeStringList: vi.fn((input) => Array.isArray(input) ? input : (input ? [input] : undefined)),
}));

vi.mock('../../../../src/core/imports/analyzer.js', () => ({
  ProjectAnalyzer: vi.fn(function() {
    return {
    buildImportGraph: vi.fn(),
    getImporters: vi.fn(),
    getDependents: vi.fn(),
    dispose: vi.fn(),
  };
  }),
}));

import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { resolveArchitecture } from '../../../../src/core/registry/resolver.js';
import { extractArchId } from '../../../../src/core/arch-tag/parser.js';
import { getSessionContext } from '../../../../src/core/session/index.js';
import { isProjectInitialized, findNearbyProject } from '../../../../src/mcp/utils.js';
import { readFile } from '../../../../src/utils/file-system.js';
import { ProjectAnalyzer } from '../../../../src/core/imports/analyzer.js';

describe('MCP Context Handlers', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(isProjectInitialized).mockResolvedValue(true);
    vi.mocked(findNearbyProject).mockResolvedValue(null);
    vi.mocked(loadConfig).mockResolvedValue({ registry: undefined });
    vi.mocked(loadRegistry).mockResolvedValue({
      nodes: { base: { description: 'Base' } },
      mixins: {},
    });
  });

  describe('handleSessionContext', () => {
    it('should return session context in compact format by default', async () => {
      vi.mocked(getSessionContext).mockResolvedValue({
        filesScanned: 100,
        architecturesInScope: [
          {
            archId: 'test.arch',
            fileCount: 10,
            description: 'Test',
            forbid: ['axios'],
            patterns: [],
            require: [],
            hints: ['Keep it simple'],
            mixins: [],
          },
        ],
        layers: [{ name: 'core', canImport: ['util'] }],
        sharedConstraints: [],
        untaggedFiles: [],
      });

      const result = await handleSessionContext(projectRoot);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('ArchCodex Session Context');
      expect(result.content[0].text).toContain('100 files scanned');
      expect(result.content[0].text).toContain('test.arch');
    });

    it('should return error when project is not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);

      const result = await handleSessionContext(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not initialized');
    });

    it('should suggest nearby project when found', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue('/nearby/project');

      const result = await handleSessionContext(projectRoot);

      expect(result.content[0].text).toContain('/nearby/project');
    });

    it('should return full JSON when full option is true', async () => {
      vi.mocked(getSessionContext).mockResolvedValue({
        filesScanned: 50,
        architecturesInScope: [],
        layers: [],
        sharedConstraints: [],
        untaggedFiles: [],
      });

      const result = await handleSessionContext(projectRoot, { full: true });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('50 files');
    });

    it('should include layers in compact output', async () => {
      vi.mocked(getSessionContext).mockResolvedValue({
        filesScanned: 10,
        architecturesInScope: [],
        layers: [
          { name: 'cli', canImport: ['core', 'util'] },
          { name: 'core', canImport: ['util'] },
        ],
        sharedConstraints: [],
        untaggedFiles: [],
      });

      const result = await handleSessionContext(projectRoot);

      expect(result.content[0].text).toContain('## Layers');
      expect(result.content[0].text).toContain('cli -> [core, util]');
    });

    it('should include shared constraints when present', async () => {
      vi.mocked(getSessionContext).mockResolvedValue({
        filesScanned: 10,
        architecturesInScope: [],
        layers: [],
        sharedConstraints: [
          { type: 'forbid_import', values: ['axios', 'http'] },
        ],
        untaggedFiles: [],
      });

      const result = await handleSessionContext(projectRoot);

      expect(result.content[0].text).toContain('## Shared');
      expect(result.content[0].text).toContain('forbid_import');
    });

    it('should show patterns, require, and hints in compact format', async () => {
      vi.mocked(getSessionContext).mockResolvedValue({
        filesScanned: 10,
        architecturesInScope: [
          {
            archId: 'test.arch',
            fileCount: 5,
            description: 'Test',
            forbid: [],
            patterns: ['console\\.log'],
            require: ['@arch tag'],
            hints: ['Keep it simple', 'Second hint'],
            mixins: [],
          },
        ],
        layers: [],
        sharedConstraints: [],
        untaggedFiles: [],
      });

      const result = await handleSessionContext(projectRoot);

      expect(result.content[0].text).toContain('patterns: console\\.log');
      expect(result.content[0].text).toContain('require: @arch tag');
      expect(result.content[0].text).toContain('hint: Keep it simple');
    });

    it('should show canonical patterns when included', async () => {
      vi.mocked(getSessionContext).mockResolvedValue({
        filesScanned: 10,
        architecturesInScope: [],
        layers: [],
        sharedConstraints: [],
        canonicalPatterns: [
          { name: 'logger', canonical: 'src/utils/logger.ts', exports: ['logger', 'createLogger'] },
          { name: 'config', canonical: 'src/config.ts', exports: [] },
        ],
        untaggedFiles: [],
      });

      const result = await handleSessionContext(projectRoot);

      expect(result.content[0].text).toContain('## Canonical Patterns');
      expect(result.content[0].text).toContain('logger: src/utils/logger.ts [logger, createLogger]');
      expect(result.content[0].text).toContain('config: src/config.ts');
    });

    it('should show untagged files count', async () => {
      vi.mocked(getSessionContext).mockResolvedValue({
        filesScanned: 10,
        architecturesInScope: [],
        layers: [],
        sharedConstraints: [],
        untaggedFiles: ['src/a.ts', 'src/b.ts'],
      });

      const result = await handleSessionContext(projectRoot);

      expect(result.content[0].text).toContain('## Untagged: 2 files');
    });

    it('should show leaf layers without imports', async () => {
      vi.mocked(getSessionContext).mockResolvedValue({
        filesScanned: 10,
        architecturesInScope: [],
        layers: [
          { name: 'utils', canImport: [] },
        ],
        sharedConstraints: [],
        untaggedFiles: [],
      });

      const result = await handleSessionContext(projectRoot);

      expect(result.content[0].text).toContain('utils -> [(leaf)]');
    });

    it('should handle error with registry-related message', async () => {
      vi.mocked(getSessionContext).mockRejectedValue(new Error('Registry file not found'));

      const result = await handleSessionContext(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('registry might be corrupted');
      expect(result.content[0].text).toContain('archcodex sync-index --force');
    });

    it('should handle error with non-registry message', async () => {
      vi.mocked(getSessionContext).mockRejectedValue(new Error('File system error'));

      const result = await handleSessionContext(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('File system error');
      expect(result.content[0].text).toContain('archcodex health');
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(getSessionContext).mockRejectedValue('string error');

      const result = await handleSessionContext(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('string error');
    });

    it('should suggest init when not initialized and no nearby project found', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue(null);

      const result = await handleSessionContext(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('archcodex init');
    });
  });

  describe('handlePlanContext', () => {
    it('should return plan context for scope', async () => {
      const { getPlanContext, formatPlanContextCompact } = await import('../../../../src/core/plan-context/index.js');

      vi.mocked(getPlanContext).mockResolvedValue({
        scope: { paths: ['src/core/'] },
        architectures: [],
      });
      vi.mocked(formatPlanContextCompact).mockReturnValue('Plan context output');

      const result = await handlePlanContext(projectRoot, { scope: 'src/core/' });

      expect(result.content[0].text).toBe('Plan context output');
    });

    it('should return error when project is not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);

      const result = await handlePlanContext(projectRoot, { scope: 'src/' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not initialized');
    });

    it('should handle files option', async () => {
      const { getPlanContext, formatPlanContextCompact } = await import('../../../../src/core/plan-context/index.js');

      vi.mocked(getPlanContext).mockResolvedValue({
        scope: { paths: ['src/'], targetFiles: ['src/a.ts', 'src/b.ts'] },
        architectures: [],
      });
      vi.mocked(formatPlanContextCompact).mockReturnValue('Plan with files');

      await handlePlanContext(projectRoot, { files: ['src/a.ts', 'src/b.ts'] });

      expect(getPlanContext).toHaveBeenCalled();
    });

    it('should suggest nearby project when not initialized and nearby found', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue('/nearby/project');

      const result = await handlePlanContext(projectRoot, { scope: 'src/' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('/nearby/project');
    });

    it('should suggest init when not initialized and no nearby project', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue(null);

      const result = await handlePlanContext(projectRoot, { scope: 'src/' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('archcodex init');
    });

    it('should handle registry-related errors', async () => {
      const { getPlanContext } = await import('../../../../src/core/plan-context/index.js');
      vi.mocked(getPlanContext).mockRejectedValue(new Error('Registry loading failed'));

      const result = await handlePlanContext(projectRoot, { scope: 'src/' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Registry loading failed');
      expect(result.content[0].text).toContain('registry might be corrupted');
    });

    it('should handle non-registry errors', async () => {
      const { getPlanContext } = await import('../../../../src/core/plan-context/index.js');
      vi.mocked(getPlanContext).mockRejectedValue(new Error('File system error'));

      const result = await handlePlanContext(projectRoot, { scope: 'src/' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('File system error');
      expect(result.content[0].text).toContain('archcodex plan-context');
    });
  });

  describe('handleValidatePlan', () => {
    it('should validate plan changes', async () => {
      const { validatePlan, formatValidationResult } = await import('../../../../src/core/validate-plan/index.js');

      vi.mocked(validatePlan).mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
      });
      vi.mocked(formatValidationResult).mockReturnValue('Plan is valid');

      const result = await handleValidatePlan(projectRoot, {
        changes: [
          { path: 'src/test.ts', action: 'create', archId: 'test.arch' },
        ],
      });

      expect(result.content[0].text).toBe('Plan is valid');
    });

    it('should return error when changes is missing', async () => {
      const result = await handleValidatePlan(projectRoot, { changes: undefined as any });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('changes array is required');
    });

    it('should return error when changes is not an array', async () => {
      const result = await handleValidatePlan(projectRoot, { changes: 'invalid' as any });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('changes array is required');
    });

    it('should handle string paths in changes array', async () => {
      const { validatePlan, formatValidationResult } = await import('../../../../src/core/validate-plan/index.js');

      vi.mocked(validatePlan).mockResolvedValue({ valid: true, errors: [], warnings: [] });
      vi.mocked(formatValidationResult).mockReturnValue('Valid');

      // This should fail because action is required
      const result = await handleValidatePlan(projectRoot, {
        changes: ['src/test.ts'] as unknown as ValidatePlanOptions['changes'],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("missing required 'action'");
    });

    it('should handle invalid change format (not string or object)', async () => {
      const result = await handleValidatePlan(projectRoot, {
        changes: [42 as unknown as ValidatePlanOptions['changes'][0]],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error validating plan');
    });

    it('should handle change with missing path property', async () => {
      const result = await handleValidatePlan(projectRoot, {
        changes: [{ action: 'create' } as unknown as ValidatePlanOptions['changes'][0]],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error validating plan');
    });

    it('should handle invalid action value', async () => {
      const result = await handleValidatePlan(projectRoot, {
        changes: [{ path: 'src/test.ts', action: 'invalid-action' } as unknown as ValidatePlanOptions['changes'][0]],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error validating plan');
    });

    it('should normalize newImports and codePatterns in changes', async () => {
      const { validatePlan, formatValidationResult } = await import('../../../../src/core/validate-plan/index.js');

      vi.mocked(validatePlan).mockResolvedValue({ valid: true, errors: [], warnings: [] });
      vi.mocked(formatValidationResult).mockReturnValue('Valid');

      const result = await handleValidatePlan(projectRoot, {
        changes: [{
          path: 'src/test.ts',
          action: 'modify',
          newImports: 'axios',
          codePatterns: 'console.log',
          newPath: 'src/renamed.ts',
        }],
      });

      expect(result.content[0].text).toBe('Valid');
      expect(validatePlan).toHaveBeenCalled();
    });

    it('should handle validatePlan throwing an error', async () => {
      const { validatePlan } = await import('../../../../src/core/validate-plan/index.js');
      vi.mocked(validatePlan).mockRejectedValue(new Error('Validation engine failed'));

      const result = await handleValidatePlan(projectRoot, {
        changes: [{ path: 'src/test.ts', action: 'create' }],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation engine failed');
    });
  });

  describe('handleImpact', () => {
    it('should analyze impact of file changes', async () => {
      const mockGetImporters = vi.fn().mockReturnValue([
        { filePath: '/test/project/src/consumer.ts', archId: 'test.arch' },
      ]);
      const mockGetDependents = vi.fn().mockReturnValue(new Set([
        '/test/project/src/consumer.ts',
        '/test/project/src/another.ts',
      ]));
      const mockBuildImportGraph = vi.fn().mockResolvedValue({
        graph: {
          nodes: new Map([
            ['/test/project/src/consumer.ts', { archId: 'test.arch' }],
            ['/test/project/src/another.ts', { archId: 'test.arch' }],
          ]),
        },
      });

      vi.mocked(ProjectAnalyzer).mockImplementation(function() {
      return {
        buildImportGraph: mockBuildImportGraph,
        getImporters: mockGetImporters,
        getDependents: mockGetDependents,
        dispose: vi.fn(),
      } as unknown as ProjectAnalyzer;
    });

      const result = await handleImpact(projectRoot, { file: 'src/target.ts' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.file).toBe('src/target.ts');
      expect(parsed.directImporters).toBe(1);
      expect(parsed.totalDependents).toBe(2);
    });

    it('should return error when file is missing', async () => {
      const result = await handleImpact(projectRoot, { file: '' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('file is required');
    });

    it('should include warning for high-impact changes', async () => {
      const mockDependents = new Set<string>();
      for (let i = 0; i < 15; i++) {
        mockDependents.add(`/test/project/src/file${i}.ts`);
      }

      vi.mocked(ProjectAnalyzer).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({ graph: { nodes: new Map() } }),
        getImporters: vi.fn().mockReturnValue([]),
        getDependents: vi.fn().mockReturnValue(mockDependents),
        dispose: vi.fn(),
      } as unknown as ProjectAnalyzer;
    });

      const result = await handleImpact(projectRoot, { file: 'src/target.ts' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.warning).toContain('High impact');
      expect(parsed.warning).toContain('15 files');
    });

    it('should dispose analyzer after use', async () => {
      const mockDispose = vi.fn();
      vi.mocked(ProjectAnalyzer).mockImplementation(function() {
      return {
        buildImportGraph: vi.fn().mockResolvedValue({ graph: { nodes: new Map() } }),
        getImporters: vi.fn().mockReturnValue([]),
        getDependents: vi.fn().mockReturnValue(new Set()),
        dispose: mockDispose,
      } as unknown as ProjectAnalyzer;
    });

      await handleImpact(projectRoot, { file: 'src/target.ts' });

      expect(mockDispose).toHaveBeenCalled();
    });
  });

  describe('handleWhy', () => {
    it('should explain why constraints apply to file', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(extractArchId).mockReturnValue('test.arch');
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          inheritanceChain: ['base', 'test.arch'],
          appliedMixins: ['tested'],
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', source: 'base', why: 'Use fetch' },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const result = await handleWhy(projectRoot, { file: 'src/test.ts' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.archId).toBe('test.arch');
      expect(parsed.inheritanceChain).toContain('base');
      expect(parsed.constraints).toHaveLength(1);
      expect(parsed.constraints[0].source).toBe('base');
    });

    it('should return error when file has no @arch tag', async () => {
      vi.mocked(readFile).mockResolvedValue('const x = 1;');
      vi.mocked(extractArchId).mockReturnValue(null);

      const result = await handleWhy(projectRoot, { file: 'src/test.ts' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('No @arch tag');
    });

    it('should return error when file is missing', async () => {
      const result = await handleWhy(projectRoot, { file: '' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('file is required');
    });

    it('should filter constraints by specific rule', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(extractArchId).mockReturnValue('test.arch');
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', source: 'test.arch' },
            { rule: 'max_file_lines', value: 300, severity: 'warning', source: 'test.arch' },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const result = await handleWhy(projectRoot, { file: 'src/test.ts', constraint: 'forbid_import' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.constraints).toHaveLength(1);
      expect(parsed.constraints[0].rule).toBe('forbid_import');
    });

    it('should filter constraints by rule and value', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(extractArchId).mockReturnValue('test.arch');
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', source: 'test.arch' },
            { rule: 'forbid_import', value: ['http'], severity: 'error', source: 'test.arch' },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const result = await handleWhy(projectRoot, { file: 'src/test.ts', constraint: 'forbid_import:axios' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.constraints).toHaveLength(1);
      expect(parsed.constraints[0].value).toContain('axios');
    });
  });
});
