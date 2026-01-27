/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP scaffold handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleScaffold } from '../../../../src/mcp/handlers/scaffold.js';

// Mock dependencies
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
  loadIntentRegistry: vi.fn(),
  suggestIntents: vi.fn(),
}));

vi.mock('../../../../src/core/scaffold/index.js', () => ({
  ScaffoldEngine: vi.fn().mockImplementation(() => ({
    scaffold: vi.fn(),
  })),
}));

vi.mock('../../../../src/core/discovery/index.js', () => ({
  loadIndex: vi.fn(),
}));

import { loadRegistry, loadIntentRegistry, suggestIntents } from '../../../../src/core/registry/loader.js';
import { ScaffoldEngine } from '../../../../src/core/scaffold/index.js';
import { loadIndex } from '../../../../src/core/discovery/index.js';

describe('MCP Scaffold Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadRegistry).mockResolvedValue({
      nodes: { base: { description: 'Base' } },
      mixins: {},
    });
    vi.mocked(loadIntentRegistry).mockResolvedValue({
      intents: {},
    });
    vi.mocked(loadIndex).mockResolvedValue({
      entries: [],
    });
    vi.mocked(suggestIntents).mockReturnValue([]);
  });

  describe('handleScaffold', () => {
    it('should scaffold a file successfully', async () => {
      const mockScaffold = vi.fn().mockResolvedValue({
        success: true,
        filePath: '/test/project/src/MyClass.ts',
        content: '/**\n * @arch test.arch\n */\nexport class MyClass {}',
      });

      vi.mocked(ScaffoldEngine).mockImplementation(() => ({
        scaffold: mockScaffold,
      } as unknown as ScaffoldEngine));

      const result = await handleScaffold(projectRoot, {
        archId: 'test.arch',
        name: 'MyClass',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.archId).toBe('test.arch');
      expect(parsed.name).toBe('MyClass');
      expect(parsed.filePath).toContain('MyClass.ts');
    });

    it('should return error when archId is missing', async () => {
      const result = await handleScaffold(projectRoot, {
        archId: '',
        name: 'MyClass',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('archId and name are required');
    });

    it('should return error when name is missing', async () => {
      const result = await handleScaffold(projectRoot, {
        archId: 'test.arch',
        name: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('archId and name are required');
    });

    it('should pass output path to scaffold engine', async () => {
      const mockScaffold = vi.fn().mockResolvedValue({
        success: true,
        filePath: '/test/project/src/custom/MyClass.ts',
        content: '',
      });

      vi.mocked(ScaffoldEngine).mockImplementation(() => ({
        scaffold: mockScaffold,
      } as unknown as ScaffoldEngine));

      await handleScaffold(projectRoot, {
        archId: 'test.arch',
        name: 'MyClass',
        output: 'src/custom',
      });

      expect(mockScaffold).toHaveBeenCalledWith(
        expect.objectContaining({ outputPath: 'src/custom' }),
        expect.anything()
      );
    });

    it('should pass template to scaffold engine', async () => {
      const mockScaffold = vi.fn().mockResolvedValue({
        success: true,
        filePath: '/test/project/src/MyClass.ts',
        content: '',
      });

      vi.mocked(ScaffoldEngine).mockImplementation(() => ({
        scaffold: mockScaffold,
      } as unknown as ScaffoldEngine));

      await handleScaffold(projectRoot, {
        archId: 'test.arch',
        name: 'MyClass',
        template: 'custom-template.hbs',
      });

      expect(mockScaffold).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'custom-template.hbs' }),
        expect.anything()
      );
    });

    it('should handle dry-run mode', async () => {
      const mockScaffold = vi.fn().mockResolvedValue({
        success: true,
        filePath: '/test/project/src/MyClass.ts',
        content: 'Generated content',
      });

      vi.mocked(ScaffoldEngine).mockImplementation(() => ({
        scaffold: mockScaffold,
      } as unknown as ScaffoldEngine));

      const result = await handleScaffold(projectRoot, {
        archId: 'test.arch',
        name: 'MyClass',
        dryRun: true,
      });

      expect(mockScaffold).toHaveBeenCalledWith(
        expect.objectContaining({ overwrite: false }),
        expect.anything()
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.content).toBe('Generated content');
    });

    it('should include suggested intents when available', async () => {
      const mockScaffold = vi.fn().mockResolvedValue({
        success: true,
        filePath: '/test/project/src/MyClass.ts',
        content: '',
      });

      vi.mocked(ScaffoldEngine).mockImplementation(() => ({
        scaffold: mockScaffold,
      } as unknown as ScaffoldEngine));

      vi.mocked(suggestIntents).mockReturnValue([
        { name: 'cli-output', reason: 'CLI command file' },
        { name: 'tested', reason: 'Domain logic requires tests' },
      ]);

      const result = await handleScaffold(projectRoot, {
        archId: 'test.arch',
        name: 'MyClass',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.suggestedIntents).toHaveLength(2);
      expect(parsed.suggestedIntents[0].name).toBe('cli-output');
    });

    it('should handle scaffold failure', async () => {
      const mockScaffold = vi.fn().mockResolvedValue({
        success: false,
        error: 'Template not found',
      });

      vi.mocked(ScaffoldEngine).mockImplementation(() => ({
        scaffold: mockScaffold,
      } as unknown as ScaffoldEngine));

      const result = await handleScaffold(projectRoot, {
        archId: 'test.arch',
        name: 'MyClass',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Template not found');
    });

    it('should work when registry loading fails', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry not found'));

      const mockScaffold = vi.fn().mockResolvedValue({
        success: true,
        filePath: '/test/project/src/MyClass.ts',
        content: '',
      });

      vi.mocked(ScaffoldEngine).mockImplementation(() => ({
        scaffold: mockScaffold,
      } as unknown as ScaffoldEngine));

      const result = await handleScaffold(projectRoot, {
        archId: 'test.arch',
        name: 'MyClass',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should work when intent registry loading fails', async () => {
      vi.mocked(loadIntentRegistry).mockRejectedValue(new Error('Intent registry not found'));

      const mockScaffold = vi.fn().mockResolvedValue({
        success: true,
        filePath: '/test/project/src/MyClass.ts',
        content: '',
      });

      vi.mocked(ScaffoldEngine).mockImplementation(() => ({
        scaffold: mockScaffold,
      } as unknown as ScaffoldEngine));

      const result = await handleScaffold(projectRoot, {
        archId: 'test.arch',
        name: 'MyClass',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.suggestedIntents).toBeUndefined();
    });
  });
});
