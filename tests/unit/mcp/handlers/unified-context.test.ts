/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP unified context handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleUnifiedContext } from '../../../../src/mcp/handlers/unified-context.js';

// Mock dependencies
vi.mock('../../../../src/core/unified-context/index.js', () => ({
  synthesizeUnifiedContext: vi.fn(),
  formatUnifiedContext: vi.fn(),
}));

vi.mock('../../../../src/mcp/utils.js', () => ({
  isProjectInitialized: vi.fn(),
  findNearbyProject: vi.fn(),
}));

import { synthesizeUnifiedContext, formatUnifiedContext } from '../../../../src/core/unified-context/index.js';
import { isProjectInitialized, findNearbyProject } from '../../../../src/mcp/utils.js';

describe('MCP Unified Context Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isProjectInitialized).mockResolvedValue(true);
    vi.mocked(findNearbyProject).mockResolvedValue(null);
  });

  describe('handleUnifiedContext', () => {
    it('should return error when project is not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);

      const result = await handleUnifiedContext(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not initialized');
      expect(result.content[0].text).toContain(projectRoot);
    });

    it('should suggest nearby project when not initialized and nearby found', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue('/nearby/project');

      const result = await handleUnifiedContext(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('/nearby/project');
      expect(result.content[0].text).toContain('archcodex_context');
    });

    it('should suggest init when not initialized and no nearby project', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue(null);

      const result = await handleUnifiedContext(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('archcodex init');
    });

    it('should return error when neither module nor entity is provided', async () => {
      const result = await handleUnifiedContext(projectRoot, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Either 'module' or 'entity' parameter is required");
      expect(result.content[0].text).toContain('archcodex_context');
    });

    it('should include usage examples in the missing parameter error', async () => {
      const result = await handleUnifiedContext(projectRoot, {});

      expect(result.content[0].text).toContain('module');
      expect(result.content[0].text).toContain('entity');
      expect(result.content[0].text).toContain('Modification order');
      expect(result.content[0].text).toContain('Layer boundaries');
    });

    it('should synthesize and format context for a module', async () => {
      const mockContext = {
        type: 'module' as const,
        module: 'src/core/db/',
        files: [],
        boundaries: { canImport: [], cannotImport: [] },
        entities: [],
      };
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(mockContext);
      vi.mocked(formatUnifiedContext).mockReturnValue('# Module Context\nFormatted output');

      const result = await handleUnifiedContext(projectRoot, { module: 'src/core/db/' });

      expect(synthesizeUnifiedContext).toHaveBeenCalledWith(projectRoot, {
        module: 'src/core/db/',
        entity: undefined,
        sections: undefined,
        confirm: undefined,
        summary: undefined,
        brief: undefined,
      });
      expect(formatUnifiedContext).toHaveBeenCalledWith(mockContext, {
        format: 'compact',
        markdown: true,
        sections: undefined,
      });
      expect(result.content[0].text).toBe('# Module Context\nFormatted output');
      expect(result.isError).toBeUndefined();
    });

    it('should synthesize and format context for an entity', async () => {
      const mockContext = {
        type: 'entity' as const,
        entity: 'User',
        fields: [],
        relationships: [],
      };
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(mockContext);
      vi.mocked(formatUnifiedContext).mockReturnValue('# Entity: User');

      const result = await handleUnifiedContext(projectRoot, { entity: 'User' });

      expect(synthesizeUnifiedContext).toHaveBeenCalledWith(projectRoot, {
        module: undefined,
        entity: 'User',
        sections: undefined,
        confirm: undefined,
        summary: undefined,
        brief: undefined,
      });
      expect(result.content[0].text).toBe('# Entity: User');
    });

    it('should return error when module is not found', async () => {
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(null);

      const result = await handleUnifiedContext(projectRoot, { module: 'src/nonexistent/' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No module found matching "src/nonexistent/"');
      expect(result.content[0].text).toContain('@arch tags');
      expect(result.content[0].text).toContain('archcodex_map');
    });

    it('should return error when entity is not found', async () => {
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(null);

      const result = await handleUnifiedContext(projectRoot, { entity: 'NonExistent' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No entity found matching "NonExistent"');
      expect(result.content[0].text).toContain('entity name spelling');
      expect(result.content[0].text).toContain('archcodex_entity_context');
    });

    it('should pass format option to formatUnifiedContext', async () => {
      const mockContext = { type: 'module' as const, module: 'src/core/', files: [] };
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(mockContext);
      vi.mocked(formatUnifiedContext).mockReturnValue('{"full": "output"}');

      await handleUnifiedContext(projectRoot, { module: 'src/core/', format: 'full' });

      expect(formatUnifiedContext).toHaveBeenCalledWith(mockContext, {
        format: 'full',
        markdown: true,
        sections: undefined,
      });
    });

    it('should pass json format option', async () => {
      const mockContext = { type: 'module' as const, module: 'src/core/', files: [] };
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(mockContext);
      vi.mocked(formatUnifiedContext).mockReturnValue('{}');

      await handleUnifiedContext(projectRoot, { module: 'src/core/', format: 'json' });

      expect(formatUnifiedContext).toHaveBeenCalledWith(mockContext, {
        format: 'json',
        markdown: true,
        sections: undefined,
      });
    });

    it('should default to compact format when no format specified', async () => {
      const mockContext = { type: 'module' as const, module: 'src/core/', files: [] };
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(mockContext);
      vi.mocked(formatUnifiedContext).mockReturnValue('compact output');

      await handleUnifiedContext(projectRoot, { module: 'src/core/' });

      expect(formatUnifiedContext).toHaveBeenCalledWith(mockContext, {
        format: 'compact',
        markdown: true,
        sections: undefined,
      });
    });

    it('should pass sections filter', async () => {
      const mockContext = { type: 'module' as const, module: 'src/core/', files: [] };
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(mockContext);
      vi.mocked(formatUnifiedContext).mockReturnValue('filtered sections');

      const sections = ['boundaries', 'entities'] as import('../../../../src/core/unified-context/types.js').ContextSection[];
      await handleUnifiedContext(projectRoot, { module: 'src/core/', sections });

      expect(synthesizeUnifiedContext).toHaveBeenCalledWith(projectRoot, expect.objectContaining({
        sections,
      }));
      expect(formatUnifiedContext).toHaveBeenCalledWith(mockContext, expect.objectContaining({
        sections,
      }));
    });

    it('should pass confirm option for large modules', async () => {
      const mockContext = { type: 'module' as const, module: 'src/', files: [] };
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(mockContext);
      vi.mocked(formatUnifiedContext).mockReturnValue('large module output');

      await handleUnifiedContext(projectRoot, { module: 'src/', confirm: true });

      expect(synthesizeUnifiedContext).toHaveBeenCalledWith(projectRoot, expect.objectContaining({
        confirm: true,
      }));
    });

    it('should pass summary option', async () => {
      const mockContext = { type: 'module' as const, module: 'src/core/', files: [] };
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(mockContext);
      vi.mocked(formatUnifiedContext).mockReturnValue('summary output');

      await handleUnifiedContext(projectRoot, { module: 'src/core/', summary: true });

      expect(synthesizeUnifiedContext).toHaveBeenCalledWith(projectRoot, expect.objectContaining({
        summary: true,
      }));
    });

    it('should pass brief option', async () => {
      const mockContext = { type: 'module' as const, module: 'src/core/', files: [] };
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(mockContext);
      vi.mocked(formatUnifiedContext).mockReturnValue('brief output');

      await handleUnifiedContext(projectRoot, { module: 'src/core/', brief: true });

      expect(synthesizeUnifiedContext).toHaveBeenCalledWith(projectRoot, expect.objectContaining({
        brief: true,
      }));
    });

    it('should handle synthesizeUnifiedContext throwing an error', async () => {
      vi.mocked(synthesizeUnifiedContext).mockRejectedValue(new Error('Database connection failed'));

      const result = await handleUnifiedContext(projectRoot, { module: 'src/core/' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error getting unified context');
      expect(result.content[0].text).toContain('Database connection failed');
      expect(result.content[0].text).toContain(projectRoot);
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(synthesizeUnifiedContext).mockRejectedValue('unexpected string error');

      const result = await handleUnifiedContext(projectRoot, { module: 'src/core/' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('unexpected string error');
    });

    it('should include troubleshooting tips in error response', async () => {
      vi.mocked(synthesizeUnifiedContext).mockRejectedValue(new Error('Fail'));

      const result = await handleUnifiedContext(projectRoot, { module: 'src/core/' });

      expect(result.content[0].text).toContain('project root correct');
      expect(result.content[0].text).toContain('.arch/ directory');
      expect(result.content[0].text).toContain('module path or entity name');
    });

    it('should prefer module when both module and entity are provided', async () => {
      const mockContext = { type: 'module' as const, module: 'src/core/', files: [] };
      vi.mocked(synthesizeUnifiedContext).mockResolvedValue(mockContext);
      vi.mocked(formatUnifiedContext).mockReturnValue('module output');

      const result = await handleUnifiedContext(projectRoot, { module: 'src/core/', entity: 'User' });

      // Both are passed to synthesizeUnifiedContext - the core function decides priority
      expect(synthesizeUnifiedContext).toHaveBeenCalledWith(projectRoot, {
        module: 'src/core/',
        entity: 'User',
        sections: undefined,
        confirm: undefined,
        summary: undefined,
        brief: undefined,
      });
      expect(result.isError).toBeUndefined();
    });
  });
});
