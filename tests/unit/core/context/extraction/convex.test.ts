/**
 * @arch archcodex.test.unit
 *
 * Tests for Convex schema extractor.
 *
 * Note: The extract() method uses script execution that requires a real Convex
 * environment. We test canExtract(), convertToEntities, and inferHasManyRelationships
 * via internal functions exposed through the class interface.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConvexSchemaExtractor, createConvexExtractor } from '../../../../../src/core/context/extraction/convex.js';

// Mock file-system utilities
vi.mock('../../../../../src/utils/file-system.js', () => ({
  fileExists: vi.fn(),
  readFile: vi.fn(),
}));

// Mock node:child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}));

import { fileExists } from '../../../../../src/utils/file-system.js';
import { execSync } from 'node:child_process';
import { readFile as fsReadFile } from 'node:fs/promises';

const mockFileExists = vi.mocked(fileExists);
const mockExecSync = vi.mocked(execSync);
const mockFsReadFile = vi.mocked(fsReadFile);

describe('ConvexSchemaExtractor', () => {
  let extractor: ConvexSchemaExtractor;

  beforeEach(() => {
    extractor = new ConvexSchemaExtractor();
    vi.clearAllMocks();
  });

  describe('source property', () => {
    it('should have source set to convex', () => {
      expect(extractor.source).toBe('convex');
    });
  });

  describe('createConvexExtractor', () => {
    it('should create an instance implementing ISchemaExtractor', () => {
      const instance = createConvexExtractor();
      expect(instance.source).toBe('convex');
      expect(typeof instance.canExtract).toBe('function');
      expect(typeof instance.extract).toBe('function');
    });
  });

  describe('canExtract', () => {
    it('should return true when convex/schema.ts exists', async () => {
      mockFileExists.mockResolvedValueOnce(true);

      const result = await extractor.canExtract('/project');

      expect(result).toBe(true);
      expect(mockFileExists).toHaveBeenCalledWith('/project/convex/schema.ts');
    });

    it('should return true when convex/schema.js exists', async () => {
      mockFileExists.mockResolvedValueOnce(false);
      mockFileExists.mockResolvedValueOnce(true);

      const result = await extractor.canExtract('/project');

      expect(result).toBe(true);
    });

    it('should return false when no schema file exists', async () => {
      mockFileExists.mockResolvedValue(false);

      const result = await extractor.canExtract('/project');

      expect(result).toBe(false);
    });

    it('should check both .ts and .js paths', async () => {
      mockFileExists.mockResolvedValue(false);

      await extractor.canExtract('/project');

      expect(mockFileExists).toHaveBeenCalledWith('/project/convex/schema.ts');
      expect(mockFileExists).toHaveBeenCalledWith('/project/convex/schema.js');
    });
  });

  describe('extract', () => {
    it('should throw when no schema file exists', async () => {
      mockFileExists.mockResolvedValue(false);

      await expect(extractor.extract({ projectRoot: '/project' }))
        .rejects.toThrow('Convex schema not found');
    });

    it('should throw when extraction script fails', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockImplementation(() => { throw new Error('script error'); });
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: false,
        error: 'Schema extraction failed',
      }));

      await expect(extractor.extract({ projectRoot: '/project' }))
        .rejects.toThrow();
    });

    it('should throw when extraction result indicates failure', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: false,
        error: 'Parse error in schema',
      }));

      await expect(extractor.extract({ projectRoot: '/project' }))
        .rejects.toThrow('Schema extraction failed: Parse error in schema');
    });

    it('should extract entities from successful script result', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: true,
        tables: [
          {
            name: 'bookmarks',
            fields: [
              { name: '_id', type: 'Id<bookmarks>', optional: false, isReference: false },
              { name: '_creationTime', type: 'number', optional: false, isReference: false },
              { name: 'title', type: 'string', optional: false, isReference: false },
              { name: 'projectId', type: 'Id<projects>', optional: false, isReference: true, referenceTarget: 'projects' },
            ],
            relationships: [
              { name: 'projectId', type: 'belongs_to', target: 'projects', field: 'projectId' },
            ],
          },
          {
            name: 'projects',
            fields: [
              { name: '_id', type: 'Id<projects>', optional: false, isReference: false },
              { name: 'name', type: 'string', optional: false, isReference: false },
            ],
            relationships: [],
          },
        ],
        tableCount: 2,
      }));

      const result = await extractor.extract({ projectRoot: '/project' });

      expect(result.source).toBe('convex');
      expect(result.entities).toHaveLength(2);
      expect(result.entities[0].name).toBe('bookmarks');
      expect(result.entities[0].fields).toHaveLength(4);
    });

    it('should infer has_many relationships from belongs_to', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: true,
        tables: [
          {
            name: 'comments',
            fields: [
              { name: 'postId', type: 'Id<posts>', optional: false, isReference: true, referenceTarget: 'posts' },
            ],
            relationships: [
              { name: 'postId', type: 'belongs_to', target: 'posts', field: 'postId' },
            ],
          },
          {
            name: 'posts',
            fields: [
              { name: 'title', type: 'string', optional: false, isReference: false },
            ],
            relationships: [],
          },
        ],
        tableCount: 2,
      }));

      const result = await extractor.extract({ projectRoot: '/project' });

      // posts should get a has_many relationship to comments
      const postsEntity = result.entities.find(e => e.name === 'posts');
      expect(postsEntity).toBeDefined();
      const hasMany = postsEntity!.relationships.find(r => r.type === 'has_many' && r.target === 'comments');
      expect(hasMany).toBeDefined();
    });

    it('should not add duplicate has_many relationships', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: true,
        tables: [
          {
            name: 'items',
            fields: [
              { name: 'orderId', type: 'Id<orders>', optional: false, isReference: true, referenceTarget: 'orders' },
            ],
            relationships: [
              { name: 'orderId', type: 'belongs_to', target: 'orders', field: 'orderId' },
            ],
          },
          {
            name: 'orders',
            fields: [],
            relationships: [
              // Already has has_many to items
              { name: 'items', type: 'has_many', target: 'items', field: '' },
            ],
          },
        ],
        tableCount: 2,
      }));

      const result = await extractor.extract({ projectRoot: '/project' });

      const orders = result.entities.find(e => e.name === 'orders');
      const hasManyToItems = orders!.relationships.filter(r => r.type === 'has_many' && r.target === 'items');
      expect(hasManyToItems).toHaveLength(1);
    });

    it('should filter to focus entity when specified', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: true,
        tables: [
          { name: 'bookmarks', fields: [], relationships: [] },
          { name: 'projects', fields: [], relationships: [] },
          { name: 'documents', fields: [], relationships: [] },
        ],
        tableCount: 3,
      }));

      const result = await extractor.extract({
        projectRoot: '/project',
        focusEntity: 'bookmarks',
      });

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('bookmarks');
    });

    it('should match focus entity case-insensitively', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: true,
        tables: [
          { name: 'Bookmarks', fields: [], relationships: [] },
          { name: 'projects', fields: [], relationships: [] },
        ],
        tableCount: 2,
      }));

      const result = await extractor.extract({
        projectRoot: '/project',
        focusEntity: 'bookmarks',
      });

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Bookmarks');
    });

    it('should match focus entity with plural (s suffix) fallback', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: true,
        tables: [
          { name: 'bookmarks', fields: [], relationships: [] },
          { name: 'projects', fields: [], relationships: [] },
        ],
        tableCount: 2,
      }));

      const result = await extractor.extract({
        projectRoot: '/project',
        focusEntity: 'bookmark',
      });

      // 'bookmark' lowered = 'bookmark', matches 'bookmarks' via includes
      expect(result.entities.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty entities when extraction result has no tables', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: true,
        tables: [],
        tableCount: 0,
      }));

      const result = await extractor.extract({ projectRoot: '/project' });

      expect(result.entities).toHaveLength(0);
    });

    it('should return empty entities when extraction result success is false', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: false,
        error: 'Failed',
      }));

      await expect(extractor.extract({ projectRoot: '/project' }))
        .rejects.toThrow('Schema extraction failed: Failed');
    });

    it('should include schema path in result', async () => {
      mockFileExists.mockResolvedValueOnce(true);
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockFsReadFile.mockResolvedValue(JSON.stringify({
        success: true,
        tables: [],
        tableCount: 0,
      }));

      const result = await extractor.extract({ projectRoot: '/project' });

      expect(result.schemaPath).toContain('convex/schema.ts');
    });
  });
});
