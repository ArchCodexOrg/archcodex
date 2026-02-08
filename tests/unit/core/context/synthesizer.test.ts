/**
 * @arch archcodex.test.unit
 *
 * Tests for context synthesizer.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as fileSystem from '../../../../src/utils/file-system.js';

// Mock the convex extractor module BEFORE importing synthesizer
vi.mock('../../../../src/core/context/extraction/convex.js', () => {
  const mockExtractor = {
    source: 'convex' as const,
    canExtract: vi.fn(),
    extract: vi.fn(),
  };
  return {
    createConvexExtractor: vi.fn(() => mockExtractor),
    ConvexSchemaExtractor: vi.fn(() => mockExtractor),
    __mockExtractor: mockExtractor,
  };
});

// Mock the cache module
vi.mock('../../../../src/core/context/cache.js', () => {
  const mockCacheManager = {
    isValid: vi.fn().mockResolvedValue(false),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    searchEntities: vi.fn((entities, pattern) =>
      entities.filter((e: { name: string }) => e.name.toLowerCase().includes(pattern.toLowerCase()))
    ),
    getEntityNames: vi.fn().mockResolvedValue(null),
    dispose: vi.fn(),
  };
  return {
    createSchemaCacheManager: vi.fn(() => mockCacheManager),
    SchemaCacheManager: vi.fn(() => mockCacheManager),
    __mockCacheManager: mockCacheManager,
  };
});

// Now import the synthesizer (which will use the mocked extractor)
import {
  synthesizeContext,
  getAllEntities,
  scoreFileRelevance,
  filterFileReferences,
} from '../../../../src/core/context/synthesizer.js';

// Get access to the mock extractor
import { __mockExtractor } from '../../../../src/core/context/extraction/convex.js';

// Spy on the file-system module
vi.spyOn(fileSystem, 'fileExists');
vi.spyOn(fileSystem, 'globFiles');

const mockFileExists = vi.mocked(fileSystem.fileExists);
const mockGlobFiles = vi.mocked(fileSystem.globFiles);
const mockExtractor = __mockExtractor as {
  source: 'convex';
  canExtract: Mock;
  extract: Mock;
};

describe('Context Synthesizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no files exist
    mockFileExists.mockResolvedValue(false);
    mockGlobFiles.mockResolvedValue([]);
    // Default: extractor can't extract
    mockExtractor.canExtract.mockResolvedValue(false);
  });

  // Sample extracted entities (what the script-based extractor would return)
  const sampleTodosEntity = {
    name: 'todos',
    fields: [
      { name: '_id', type: 'Id<todos>', optional: false, isReference: false },
      { name: '_creationTime', type: 'number', optional: false, isReference: false },
      { name: 'title', type: 'string', optional: false, isReference: false },
      { name: 'content', type: 'string', optional: true, isReference: false },
      { name: 'position', type: 'number', optional: false, isReference: false },
      { name: 'userId', type: 'Id<users>', optional: false, isReference: true, referenceTarget: 'users' },
    ],
    relationships: [
      { name: 'userId', type: 'belongs_to' as const, target: 'users', field: 'userId' },
    ],
  };

  const sampleUsersEntity = {
    name: 'users',
    fields: [
      { name: '_id', type: 'Id<users>', optional: false, isReference: false },
      { name: '_creationTime', type: 'number', optional: false, isReference: false },
      { name: 'name', type: 'string', optional: false, isReference: false },
      { name: 'email', type: 'string', optional: false, isReference: false },
    ],
    relationships: [],
  };

  describe('synthesizeContext', () => {
    it('should synthesize context from Convex schema', async () => {
      // Setup: Convex schema exists
      mockFileExists.mockImplementation(async (path: string) => {
        return path.includes('convex/schema.ts');
      });
      mockGlobFiles.mockResolvedValue([]); // No operation files
      mockExtractor.canExtract.mockResolvedValue(true);
      mockExtractor.extract.mockResolvedValue({
        source: 'convex',
        schemaPath: '/project/convex/schema.ts',
        entities: [sampleTodosEntity, sampleUsersEntity],
      });

      const result = await synthesizeContext({
        focus: 'todos',
        projectRoot: '/project',
      });

      expect(result).not.toBeNull();
      expect(result!.entity).toBe('todos');
      expect(result!.fields.length).toBeGreaterThan(0);
      expect(result!.fields.some(f => f.name === 'title')).toBe(true);
    });

    it('should detect relationships from schema', async () => {
      mockFileExists.mockImplementation(async (path: string) => {
        return path.includes('convex/schema.ts');
      });
      mockGlobFiles.mockResolvedValue([]);
      mockExtractor.canExtract.mockResolvedValue(true);
      mockExtractor.extract.mockResolvedValue({
        source: 'convex',
        schemaPath: '/project/convex/schema.ts',
        entities: [sampleTodosEntity, sampleUsersEntity],
      });

      const result = await synthesizeContext({
        focus: 'todos',
        projectRoot: '/project',
      });

      expect(result).not.toBeNull();
      expect(result!.relationships.some(r => r.target === 'users')).toBe(true);
    });

    it('should detect behaviors from fields', async () => {
      mockFileExists.mockImplementation(async (path: string) => {
        return path.includes('convex/schema.ts');
      });
      mockGlobFiles.mockResolvedValue([]);
      mockExtractor.canExtract.mockResolvedValue(true);
      mockExtractor.extract.mockResolvedValue({
        source: 'convex',
        schemaPath: '/project/convex/schema.ts',
        entities: [sampleTodosEntity, sampleUsersEntity],
      });

      const result = await synthesizeContext({
        focus: 'todos',
        projectRoot: '/project',
      });

      expect(result).not.toBeNull();
      // position field should trigger ordering behavior
      expect(result!.behaviors.some(b => b.type === 'ordering')).toBe(true);
    });

    it('should return null when no schema source is detected', async () => {
      mockFileExists.mockResolvedValue(false);
      mockExtractor.canExtract.mockResolvedValue(false);

      const result = await synthesizeContext({
        focus: 'todos',
        projectRoot: '/project',
      });

      expect(result).toBeNull();
    });

    it('should return null when entity is not found', async () => {
      mockFileExists.mockImplementation(async (path: string) => {
        return path.includes('convex/schema.ts');
      });
      mockGlobFiles.mockResolvedValue([]);
      mockExtractor.canExtract.mockResolvedValue(true);
      // The extractor filters entities based on focusEntity, returning empty if no match
      mockExtractor.extract.mockResolvedValue({
        source: 'convex',
        schemaPath: '/project/convex/schema.ts',
        entities: [], // No entities match 'nonexistent'
      });

      const result = await synthesizeContext({
        focus: 'nonexistent',
        projectRoot: '/project',
      });

      expect(result).toBeNull();
    });

    it('should match entity by plural form', async () => {
      mockFileExists.mockImplementation(async (path: string) => {
        return path.includes('convex/schema.ts');
      });
      mockGlobFiles.mockResolvedValue([]);
      mockExtractor.canExtract.mockResolvedValue(true);
      mockExtractor.extract.mockResolvedValue({
        source: 'convex',
        schemaPath: '/project/convex/schema.ts',
        entities: [sampleTodosEntity, sampleUsersEntity],
      });

      // Search for "todo" (singular) should match "todos" (plural)
      const result = await synthesizeContext({
        focus: 'todo',
        projectRoot: '/project',
      });

      expect(result).not.toBeNull();
      expect(result!.entity).toBe('todos');
    });
  });

  describe('scoreFileRelevance', () => {
    it('returns direct when operation name is in filename', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/mutations/createEntry.ts', refType: 'function', lineNumber: 10 },
        'createEntry'
      );
      expect(result).toBe('direct');
    });

    it('returns direct for kebab-case filename match', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/mutations/create-entry.ts', refType: 'function', lineNumber: 10 },
        'createEntry'
      );
      expect(result).toBe('direct');
    });

    it('returns related for same-entity CRUD file', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/mutations/updateEntry.ts', refType: 'function', lineNumber: 10 },
        'createEntry'
      );
      expect(result).toBe('related');
    });

    it('returns related for delete operation file when searching for create', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/mutations/deleteEntry.ts', refType: 'function', lineNumber: 10 },
        'createEntry'
      );
      expect(result).toBe('related');
    });

    it('returns peripheral for type definition files', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/types.ts', refType: 'type', lineNumber: 10 },
        'createEntry'
      );
      expect(result).toBe('peripheral');
    });

    it('returns peripheral for test files by refType', () => {
      const result = scoreFileRelevance(
        { path: 'tests/unit/entries/createEntry.test.ts', refType: 'test', lineNumber: 1 },
        'createEntry'
      );
      expect(result).toBe('peripheral');
    });

    it('returns peripheral for barrel exports', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/index.ts', refType: 'barrel', lineNumber: 1 },
        'createEntry'
      );
      expect(result).toBe('peripheral');
    });

    it('returns peripheral for index files by filename', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/index.ts', refType: null, lineNumber: null }
      );
      expect(result).toBe('peripheral');
    });

    it('returns peripheral for test files by filename pattern', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/entry.test.ts', refType: null, lineNumber: null }
      );
      expect(result).toBe('peripheral');
    });

    it('returns peripheral for types.ts by filename', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/types.ts', refType: null, lineNumber: null }
      );
      expect(result).toBe('peripheral');
    });

    it('returns peripheral when no operation provided', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/helpers.ts', refType: 'function', lineNumber: 10 }
      );
      expect(result).toBe('peripheral');
    });

    it('case-insensitive operation matching', () => {
      const result = scoreFileRelevance(
        { path: 'src/entries/createentry.ts', refType: 'function', lineNumber: 10 },
        'createEntry'
      );
      expect(result).toBe('direct');
    });
  });

  describe('filterFileReferences', () => {
    const makeFile = (path: string, refType: string | null = 'function') => ({
      path, refType, lineNumber: 1 as number | null,
    });

    it('keeps all files when under limit', () => {
      const groups = [{
        archId: 'core',
        files: [makeFile('a.ts'), makeFile('b.ts')],
      }];
      const result = filterFileReferences(groups, 10);
      expect(result.truncated).toBe(0);
      expect(result.filtered.flatMap(g => g.files)).toHaveLength(2);
    });

    it('truncates peripheral files when over limit', () => {
      const groups = [{
        archId: 'core',
        files: [
          makeFile('createEntry.ts'),
          makeFile('types.ts', 'type'),
          makeFile('index.ts', 'barrel'),
          makeFile('schema.ts', 'schema'),
        ],
      }];
      const result = filterFileReferences(groups, 2, 'createEntry');
      // createEntry.ts is direct, others are peripheral
      // Should keep direct + fill up to 2
      expect(result.truncated).toBeGreaterThan(0);
      const allKept = result.filtered.flatMap(g => g.files);
      expect(allKept.some(f => f.path === 'createEntry.ts')).toBe(true);
    });

    it('never truncates direct matches', () => {
      const groups = [{
        archId: 'core',
        files: [
          makeFile('createEntry.ts'),
          makeFile('types.ts', 'type'),
          makeFile('index.ts', 'barrel'),
        ],
      }];
      const result = filterFileReferences(groups, 1, 'createEntry');
      const allKept = result.filtered.flatMap(g => g.files);
      // Direct match must always be kept
      expect(allKept.some(f => f.path === 'createEntry.ts')).toBe(true);
    });

    it('never truncates related matches', () => {
      const groups = [{
        archId: 'core',
        files: [
          makeFile('createEntry.ts'),
          makeFile('updateEntry.ts'),
          makeFile('deleteEntry.ts'),
          makeFile('types.ts', 'type'),
          makeFile('index.ts', 'barrel'),
        ],
      }];
      const result = filterFileReferences(groups, 2, 'createEntry');
      const allKept = result.filtered.flatMap(g => g.files);
      // All 3 CRUD files should be kept (1 direct + 2 related)
      expect(allKept.some(f => f.path === 'createEntry.ts')).toBe(true);
      expect(allKept.some(f => f.path === 'updateEntry.ts')).toBe(true);
      expect(allKept.some(f => f.path === 'deleteEntry.ts')).toBe(true);
    });

    it('truncated count equals omitted files', () => {
      const groups = [{
        archId: 'core',
        files: [
          makeFile('a.ts', 'type'),
          makeFile('b.ts', 'type'),
          makeFile('c.ts', 'type'),
          makeFile('d.ts', 'type'),
          makeFile('e.ts', 'type'),
        ],
      }];
      const result = filterFileReferences(groups, 3);
      const keptCount = result.filtered.flatMap(g => g.files).length;
      expect(keptCount + result.truncated).toBe(5);
    });

    it('preserves architecture grouping', () => {
      const groups = [
        { archId: 'core', files: [makeFile('createEntry.ts')] },
        { archId: 'cli', files: [makeFile('types.ts', 'type')] },
      ];
      const result = filterFileReferences(groups, 10, 'createEntry');
      expect(result.filtered.length).toBe(2);
      expect(result.filtered[0].archId).toBeDefined();
    });

    it('annotates files with relevance', () => {
      const groups = [{
        archId: 'core',
        files: [makeFile('createEntry.ts'), makeFile('types.ts', 'type')],
      }];
      const result = filterFileReferences(groups, 10, 'createEntry');
      const allFiles = result.filtered.flatMap(g => g.files);
      const directFile = allFiles.find(f => f.path === 'createEntry.ts');
      const peripheralFile = allFiles.find(f => f.path === 'types.ts');
      expect(directFile?.relevance).toBe('direct');
      expect(peripheralFile?.relevance).toBe('peripheral');
    });

    it('handles empty file groups', () => {
      const result = filterFileReferences([], 10);
      expect(result.truncated).toBe(0);
      expect(result.filtered).toHaveLength(0);
    });

    it('handles multiple architecture groups with mixed relevance', () => {
      const groups = [
        { archId: 'core', files: [
          makeFile('createProduct.ts'),
          makeFile('updateProduct.ts'),
        ]},
        { archId: 'cli', files: [
          makeFile('types.ts', 'type'),
          makeFile('index.ts', 'barrel'),
          makeFile('helpers.ts'),
        ]},
      ];
      const result = filterFileReferences(groups, 3, 'createProduct');
      const allKept = result.filtered.flatMap(g => g.files);
      // direct (createProduct) + related (updateProduct) = 2 guaranteed
      expect(allKept.some(f => f.path === 'createProduct.ts')).toBe(true);
      expect(allKept.some(f => f.path === 'updateProduct.ts')).toBe(true);
      expect(result.truncated).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAllEntities', () => {
    it('should return all entity names from schema', async () => {
      mockFileExists.mockImplementation(async (path: string) => {
        return path.includes('convex/schema.ts');
      });
      mockExtractor.canExtract.mockResolvedValue(true);
      mockExtractor.extract.mockResolvedValue({
        source: 'convex',
        schemaPath: '/project/convex/schema.ts',
        entities: [sampleTodosEntity, sampleUsersEntity],
      });

      const entities = await getAllEntities('/project');

      expect(entities).toContain('todos');
      expect(entities).toContain('users');
    });

    it('should return empty array when no schema source is detected', async () => {
      mockFileExists.mockResolvedValue(false);
      mockExtractor.canExtract.mockResolvedValue(false);

      const entities = await getAllEntities('/project');

      expect(entities).toEqual([]);
    });
  });
});
