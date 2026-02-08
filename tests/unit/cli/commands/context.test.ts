/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the context command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContextCommand } from '../../../../src/cli/commands/context.js';

// Mock the context module
vi.mock('../../../../src/core/context/index.js', () => ({
  synthesizeContext: vi.fn(),
  formatContext: vi.fn(),
  listEntities: vi.fn(),
}));

// Mock the logger
vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { synthesizeContext, formatContext, listEntities } from '../../../../src/core/context/index.js';
import { logger } from '../../../../src/utils/logger.js';

const mockSynthesizeContext = vi.mocked(synthesizeContext);
const mockFormatContext = vi.mocked(formatContext);
const mockListEntities = vi.mocked(listEntities);
const mockLogger = vi.mocked(logger);

describe('Context Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createContextCommand', () => {
    it('should create a command with correct name and description', () => {
      const command = createContextCommand();

      expect(command.name()).toBe('context');
      expect(command.description()).toContain('mental model');
    });

    it('should have entities variadic argument', () => {
      const command = createContextCommand();
      const args = command.registeredArguments;

      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('entities');
      expect(args[0].variadic).toBe(true);
    });

    it('should have format option with yaml default', () => {
      const command = createContextCommand();
      const formatOption = command.options.find(o => o.long === '--format');

      expect(formatOption).toBeDefined();
      expect(formatOption?.defaultValue).toBe('yaml');
    });

    it('should have refresh option', () => {
      const command = createContextCommand();
      const refreshOption = command.options.find(o => o.long === '--refresh');

      expect(refreshOption).toBeDefined();
    });

    it('should have operation option', () => {
      const command = createContextCommand();
      const operationOption = command.options.find(o => o.long === '--operation');

      expect(operationOption).toBeDefined();
    });

    it('should NOT have --list option (removed in favor of simpler UX)', () => {
      const command = createContextCommand();
      const listOption = command.options.find(o => o.long === '--list');

      expect(listOption).toBeUndefined();
    });

    it('should NOT have --search option (removed in favor of simpler UX)', () => {
      const command = createContextCommand();
      const searchOption = command.options.find(o => o.long === '--search');

      expect(searchOption).toBeUndefined();
    });
  });

  describe('no argument - list all entities', () => {
    it('should list all entities when no argument provided', async () => {
      mockListEntities.mockResolvedValue({
        entities: ['users', 'todos', 'comments'],
        fromCache: true,
        source: 'convex',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockListEntities).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Available entities'));
      consoleSpy.mockRestore();
    });

    it('should show cached status', async () => {
      mockListEntities.mockResolvedValue({
        entities: ['users'],
        fromCache: true,
        source: 'convex',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('(cached)'));
      consoleSpy.mockRestore();
    });

    it('should show fresh status', async () => {
      mockListEntities.mockResolvedValue({
        entities: ['users'],
        fromCache: false,
        source: 'convex',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('(fresh)'));
      consoleSpy.mockRestore();
    });

    it('should warn when no schema source found', async () => {
      mockListEntities.mockResolvedValue({
        entities: [],
        fromCache: false,
        source: null,
      });

      const command = createContextCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No schema source'));
    });

    it('should force refresh with --refresh', async () => {
      mockListEntities.mockResolvedValue({
        entities: ['users'],
        fromCache: false,
        source: 'convex',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test', '--refresh']);

      expect(mockListEntities).toHaveBeenCalledWith(
        expect.objectContaining({ refresh: true })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('with argument - exact match', () => {
    it('should show full context for exact match', async () => {
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
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test', 'users']);

      expect(mockSynthesizeContext).toHaveBeenCalledWith(
        expect.objectContaining({ focus: 'users' })
      );
      expect(mockFormatContext).toHaveBeenCalledWith(mockContext, { format: 'yaml' });
      expect(consoleSpy).toHaveBeenCalledWith('entity: users\nfields: [name]');
      consoleSpy.mockRestore();
    });

    it('should use json format when specified', async () => {
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
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test', 'users', '--format', 'json']);

      expect(mockFormatContext).toHaveBeenCalledWith(mockContext, { format: 'json' });
      consoleSpy.mockRestore();
    });

    it('should pass operation hint to synthesizer', async () => {
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
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test', 'todos', '--operation', 'duplicate']);

      expect(mockSynthesizeContext).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'duplicate' })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('with argument - no exact match (search)', () => {
    it('should search and show similar entities when no exact match', async () => {
      mockSynthesizeContext.mockResolvedValue(null); // No exact match
      mockListEntities.mockResolvedValue({
        entities: ['embeddings', 'productEmbeddings', 'articleEmbeddings'],
        fromCache: true,
        source: 'convex',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test', 'embed']);

      expect(mockSynthesizeContext).toHaveBeenCalledWith(
        expect.objectContaining({ focus: 'embed' })
      );
      expect(mockListEntities).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'embed' })
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No exact match'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Similar entities'));
      consoleSpy.mockRestore();
    });

    it('should warn when no matches found', async () => {
      mockSynthesizeContext.mockResolvedValue(null);
      mockListEntities.mockResolvedValue({
        entities: [],
        fromCache: true,
        source: 'convex',
      });

      const command = createContextCommand();
      await command.parseAsync(['node', 'test', 'xyz']);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No entities matching'));
    });

    it('should warn when no schema source for search', async () => {
      mockSynthesizeContext.mockResolvedValue(null);
      mockListEntities.mockResolvedValue({
        entities: [],
        fromCache: false,
        source: null,
      });

      const command = createContextCommand();
      await command.parseAsync(['node', 'test', 'anything']);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No schema source'));
    });
  });

  describe('multiple entities', () => {
    it('should get context for multiple space-separated entities', async () => {
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
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test', 'users', 'todos']);

      expect(mockSynthesizeContext).toHaveBeenCalledTimes(2);
      expect(mockFormatContext).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith('entity: users');
      expect(consoleSpy).toHaveBeenCalledWith('entity: todos');
      consoleSpy.mockRestore();
    });

    it('should get context for comma-separated entities', async () => {
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
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test', 'users,todos']);

      expect(mockSynthesizeContext).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    it('should warn about entities not found', async () => {
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
        .mockResolvedValueOnce(null); // xyz not found
      mockFormatContext.mockReturnValue('entity: users');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const command = createContextCommand();
      await command.parseAsync(['node', 'test', 'users', 'xyz']);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not found'));
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('xyz'));
      consoleSpy.mockRestore();
    });
  });
});
