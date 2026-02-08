/**
 * @arch archcodex.test.unit
 *
 * Tests for MCP entity context handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleEntityContext } from '../../../../src/mcp/handlers/entity-context.js';

// Mock the context module
vi.mock('../../../../src/core/context/index.js', () => ({
  synthesizeContext: vi.fn(),
  formatContext: vi.fn(),
  listEntities: vi.fn(),
}));

import { synthesizeContext, formatContext, listEntities } from '../../../../src/core/context/index.js';

const mockSynthesizeContext = vi.mocked(synthesizeContext);
const mockFormatContext = vi.mocked(formatContext);
const mockListEntities = vi.mocked(listEntities);

describe('handleEntityContext', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('no entity param - list all entities', () => {
    it('should list all entities when no entity provided', async () => {
      mockListEntities.mockResolvedValue({
        entities: ['users', 'todos', 'comments'],
        fromCache: true,
        source: 'convex',
      });

      const result = await handleEntityContext(projectRoot, {});

      expect(mockListEntities).toHaveBeenCalledWith(
        expect.objectContaining({ projectRoot })
      );
      const content = JSON.parse(result.content[0].text);
      expect(content.entities).toEqual(['users', 'todos', 'comments']);
      expect(content.count).toBe(3);
      expect(content.cacheStatus).toBe('cached');
    });

    it('should show fresh status when not from cache', async () => {
      mockListEntities.mockResolvedValue({
        entities: ['users'],
        fromCache: false,
        source: 'convex',
      });

      const result = await handleEntityContext(projectRoot, {});

      const content = JSON.parse(result.content[0].text);
      expect(content.cacheStatus).toBe('fresh');
    });

    it('should return error when no schema source found', async () => {
      mockListEntities.mockResolvedValue({
        entities: [],
        fromCache: false,
        source: null,
      });

      const result = await handleEntityContext(projectRoot, {});

      expect(result.content[0].text).toContain('No schema source');
    });

    it('should pass refresh option', async () => {
      mockListEntities.mockResolvedValue({
        entities: ['users'],
        fromCache: false,
        source: 'convex',
      });

      await handleEntityContext(projectRoot, { refresh: true });

      expect(mockListEntities).toHaveBeenCalledWith(
        expect.objectContaining({ refresh: true })
      );
    });
  });

  describe('with entity param - exact match', () => {
    it('should return full context for exact match', async () => {
      const mockContext = {
        entity: 'users',
        fields: [{ name: 'name', type: 'string', optional: false }],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };
      mockSynthesizeContext.mockResolvedValue(mockContext);
      mockFormatContext.mockReturnValue('entity: users\nfields: [name]');

      const result = await handleEntityContext(projectRoot, { entity: 'users' });

      expect(mockSynthesizeContext).toHaveBeenCalledWith(
        expect.objectContaining({ focus: 'users' })
      );
      expect(mockFormatContext).toHaveBeenCalledWith(mockContext, { format: 'yaml' });
      expect(result.content[0].text).toBe('entity: users\nfields: [name]');
    });

    it('should use specified format', async () => {
      const mockContext = {
        entity: 'users',
        fields: [],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };
      mockSynthesizeContext.mockResolvedValue(mockContext);
      mockFormatContext.mockReturnValue('{}');

      await handleEntityContext(projectRoot, { entity: 'users', format: 'json' });

      expect(mockFormatContext).toHaveBeenCalledWith(mockContext, { format: 'json' });
    });

    it('should pass operation hint', async () => {
      const mockContext = {
        entity: 'todos',
        fields: [],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };
      mockSynthesizeContext.mockResolvedValue(mockContext);
      mockFormatContext.mockReturnValue('');

      await handleEntityContext(projectRoot, { entity: 'todos', operation: 'duplicate' });

      expect(mockSynthesizeContext).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'duplicate' })
      );
    });
  });

  describe('with entity param - no exact match (search)', () => {
    it('should return search results when no exact match', async () => {
      mockSynthesizeContext.mockResolvedValue(null); // No exact match
      mockListEntities.mockResolvedValue({
        entities: ['embeddings', 'productEmbeddings', 'articleEmbeddings'],
        fromCache: true,
        source: 'convex',
      });

      const result = await handleEntityContext(projectRoot, { entity: 'embed' });

      expect(mockSynthesizeContext).toHaveBeenCalledWith(
        expect.objectContaining({ focus: 'embed' })
      );
      expect(mockListEntities).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'embed' })
      );

      const content = JSON.parse(result.content[0].text);
      expect(content.message).toContain('No exact match');
      expect(content.similarEntities).toEqual(['embeddings', 'productEmbeddings', 'articleEmbeddings']);
    });

    it('should return error when no matches found', async () => {
      mockSynthesizeContext.mockResolvedValue(null);
      mockListEntities.mockResolvedValue({
        entities: [],
        fromCache: true,
        source: 'convex',
      });

      const result = await handleEntityContext(projectRoot, { entity: 'xyz' });

      expect(result.content[0].text).toContain('No entities matching');
    });

    it('should return error when no schema source', async () => {
      mockSynthesizeContext.mockResolvedValue(null);
      mockListEntities.mockResolvedValue({
        entities: [],
        fromCache: false,
        source: null,
      });

      const result = await handleEntityContext(projectRoot, { entity: 'anything' });

      expect(result.content[0].text).toContain('No schema source');
    });
  });

  describe('multiple entities', () => {
    it('should return context for multiple entities (array)', async () => {
      const mockUsersContext = {
        entity: 'users',
        fields: [{ name: 'name', type: 'string', optional: false }],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };
      const mockTodosContext = {
        entity: 'todos',
        fields: [{ name: 'title', type: 'string', optional: false }],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };
      mockSynthesizeContext
        .mockResolvedValueOnce(mockUsersContext)
        .mockResolvedValueOnce(mockTodosContext);
      mockFormatContext
        .mockReturnValueOnce('entity: users')
        .mockReturnValueOnce('entity: todos');

      const result = await handleEntityContext(projectRoot, { entity: ['users', 'todos'] });

      expect(mockSynthesizeContext).toHaveBeenCalledTimes(2);
      expect(result.content[0].text).toContain('entity: users');
      expect(result.content[0].text).toContain('entity: todos');
    });

    it('should return context for comma-separated entities', async () => {
      const mockUsersContext = {
        entity: 'users',
        fields: [],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };
      const mockTodosContext = {
        entity: 'todos',
        fields: [],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };
      mockSynthesizeContext
        .mockResolvedValueOnce(mockUsersContext)
        .mockResolvedValueOnce(mockTodosContext);
      mockFormatContext
        .mockReturnValueOnce('entity: users')
        .mockReturnValueOnce('entity: todos');

      const result = await handleEntityContext(projectRoot, { entity: 'users,todos' });

      expect(mockSynthesizeContext).toHaveBeenCalledTimes(2);
    });

    it('should report entities not found', async () => {
      const mockUsersContext = {
        entity: 'users',
        fields: [],
        relationships: [],
        behaviors: [],
        existingOperations: [],
        similarOperations: [],
      };
      mockSynthesizeContext
        .mockResolvedValueOnce(mockUsersContext)
        .mockResolvedValueOnce(null);
      mockFormatContext.mockReturnValue('entity: users');

      const result = await handleEntityContext(projectRoot, { entity: ['users', 'xyz'] });

      // Check the summary includes notFound
      const summaryContent = result.content[1].text;
      expect(summaryContent).toContain('notFound');
      expect(summaryContent).toContain('xyz');
    });

    it('should return error when no entities found', async () => {
      mockSynthesizeContext.mockResolvedValue(null);

      const result = await handleEntityContext(projectRoot, { entity: ['xyz', 'abc'] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No matching entities');
    });
  });
});
