/**
 * @arch archcodex.test.unit
 */
/**
 * Comprehensive tests for database repositories.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { FileRepository } from '../../../../src/core/db/repositories/files.js';
import { ImportRepository } from '../../../../src/core/db/repositories/imports.js';
import { EntityRepository } from '../../../../src/core/db/repositories/entities.js';
import { initializeSchema } from '../../../../src/core/db/schema.js';

describe('FileRepository', () => {
  let db: Database.Database;
  let repo: FileRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    repo = new FileRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should upsert and get a file', () => {
    repo.upsert({
      path: 'src/test.ts',
      archId: 'test.arch',
      checksum: 'abc123',
      mtime: 1234567890,
      lineCount: 100,
      description: null,
    });

    const file = repo.get('src/test.ts');
    expect(file).not.toBeNull();
    expect(file?.archId).toBe('test.arch');
    expect(file?.checksum).toBe('abc123');
    expect(file?.lineCount).toBe(100);
  });

  it('should return null for non-existent file', () => {
    expect(repo.get('nonexistent.ts')).toBeNull();
  });

  it('should update existing file on upsert', () => {
    repo.upsert({
      path: 'src/test.ts',
      archId: 'old.arch',
      checksum: 'old',
      mtime: 1000,
      lineCount: 50,
      description: null,
    });

    repo.upsert({
      path: 'src/test.ts',
      archId: 'new.arch',
      checksum: 'new',
      mtime: 2000,
      lineCount: 100,
      description: null,
    });

    const file = repo.get('src/test.ts');
    expect(file?.archId).toBe('new.arch');
    expect(file?.checksum).toBe('new');
  });

  it('should query files by architecture', () => {
    repo.upsertMany([
      { path: 'src/a.ts', archId: 'arch.one', checksum: 'a', mtime: 1, lineCount: 10, description: null },
      { path: 'src/b.ts', archId: 'arch.one', checksum: 'b', mtime: 2, lineCount: 20, description: null },
      { path: 'src/c.ts', archId: 'arch.two', checksum: 'c', mtime: 3, lineCount: 30, description: null },
    ]);

    const files = repo.query({ archId: 'arch.one' });
    expect(files.length).toBe(2);
    expect(files.map(f => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('should query files by architecture pattern', () => {
    repo.upsertMany([
      { path: 'src/a.ts', archId: 'convex.query', checksum: 'a', mtime: 1, lineCount: 10, description: null },
      { path: 'src/b.ts', archId: 'convex.mutation', checksum: 'b', mtime: 2, lineCount: 20, description: null },
      { path: 'src/c.ts', archId: 'frontend.component', checksum: 'c', mtime: 3, lineCount: 30, description: null },
    ]);

    const files = repo.query({ archPattern: 'convex.%' });
    expect(files.length).toBe(2);
  });

  it('should get architecture summary', () => {
    repo.upsertMany([
      { path: 'src/a.ts', archId: 'arch.one', checksum: 'a', mtime: 1, lineCount: 10, description: null },
      { path: 'src/b.ts', archId: 'arch.one', checksum: 'b', mtime: 2, lineCount: 20, description: null },
      { path: 'src/c.ts', archId: 'arch.two', checksum: 'c', mtime: 3, lineCount: 30, description: null },
      { path: 'src/d.ts', archId: null, checksum: 'd', mtime: 4, lineCount: 40, description: null },
    ]);

    const summary = repo.getArchitectureSummary();
    expect(summary.length).toBe(2);
    expect(summary.find(s => s.archId === 'arch.one')?.fileCount).toBe(2);
    expect(summary.find(s => s.archId === 'arch.two')?.fileCount).toBe(1);
  });

  it('should delete files', () => {
    repo.upsert({ path: 'src/delete.ts', archId: null, checksum: 'x', mtime: 1, lineCount: 1, description: null });
    expect(repo.exists('src/delete.ts')).toBe(true);

    repo.delete('src/delete.ts');
    expect(repo.exists('src/delete.ts')).toBe(false);
  });

  it('should count files', () => {
    repo.upsertMany([
      { path: 'src/a.ts', archId: null, checksum: 'a', mtime: 1, lineCount: 10, description: null },
      { path: 'src/b.ts', archId: null, checksum: 'b', mtime: 2, lineCount: 20, description: null },
    ]);

    expect(repo.count()).toBe(2);
  });

  it('should get all file paths', () => {
    repo.upsertMany([
      { path: 'src/a.ts', archId: null, checksum: 'a', mtime: 1, lineCount: 10, description: null },
      { path: 'src/b.ts', archId: null, checksum: 'b', mtime: 2, lineCount: 20, description: null },
    ]);

    const paths = repo.getAllPaths();
    expect(paths).toContain('src/a.ts');
    expect(paths).toContain('src/b.ts');
  });

  it('should delete many files by paths', () => {
    repo.upsertMany([
      { path: 'src/a.ts', archId: null, checksum: 'a', mtime: 1, lineCount: 10, description: null },
      { path: 'src/b.ts', archId: null, checksum: 'b', mtime: 2, lineCount: 20, description: null },
      { path: 'src/c.ts', archId: null, checksum: 'c', mtime: 3, lineCount: 30, description: null },
    ]);

    repo.deleteMany(['src/a.ts', 'src/b.ts']);
    expect(repo.count()).toBe(1);
    expect(repo.exists('src/c.ts')).toBe(true);
  });

  it('should delete all files when deleteMany called without args', () => {
    repo.upsertMany([
      { path: 'src/a.ts', archId: null, checksum: 'a', mtime: 1, lineCount: 10, description: null },
      { path: 'src/b.ts', archId: null, checksum: 'b', mtime: 2, lineCount: 20, description: null },
    ]);

    repo.deleteMany();
    expect(repo.count()).toBe(0);
  });
});

describe('ImportRepository', () => {
  let db: Database.Database;
  let fileRepo: FileRepository;
  let importRepo: ImportRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    fileRepo = new FileRepository(db);
    importRepo = new ImportRepository(db);

    // Set up test files
    fileRepo.upsertMany([
      { path: 'src/a.ts', archId: 'arch.a', checksum: 'a', mtime: 1, lineCount: 10, description: null },
      { path: 'src/b.ts', archId: 'arch.b', checksum: 'b', mtime: 2, lineCount: 20, description: null },
      { path: 'src/c.ts', archId: 'arch.c', checksum: 'c', mtime: 3, lineCount: 30, description: null },
      { path: 'src/d.ts', archId: 'arch.d', checksum: 'd', mtime: 4, lineCount: 40, description: null },
    ]);
  });

  afterEach(() => {
    db.close();
  });

  it('should add and get imports via import graph', () => {
    importRepo.addMany([
      { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { fromFile: 'src/a.ts', toFile: 'src/c.ts' },
    ]);

    const graph = importRepo.getImportGraph('src/a.ts');
    expect(graph.imports.length).toBe(2);
    expect(graph.imports.map(i => i.path)).toContain('src/b.ts');
    expect(graph.imports.map(i => i.path)).toContain('src/c.ts');
  });

  it('should get import graph with arch info', () => {
    importRepo.addMany([
      { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { fromFile: 'src/c.ts', toFile: 'src/a.ts' },
    ]);

    const graph = importRepo.getImportGraph('src/a.ts');
    expect(graph.imports.length).toBe(1);
    expect(graph.imports[0].path).toBe('src/b.ts');
    expect(graph.imports[0].archId).toBe('arch.b');

    expect(graph.importedBy.length).toBe(1);
    expect(graph.importedBy[0].path).toBe('src/c.ts');
    expect(graph.importedBy[0].archId).toBe('arch.c');
  });

  it('should get transitive imports', () => {
    // a -> b -> c -> d
    importRepo.addMany([
      { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { fromFile: 'src/b.ts', toFile: 'src/c.ts' },
      { fromFile: 'src/c.ts', toFile: 'src/d.ts' },
    ]);

    const transitive = importRepo.getTransitiveImports('src/a.ts', 10);
    expect(transitive).toContain('src/b.ts');
    expect(transitive).toContain('src/c.ts');
    expect(transitive).toContain('src/d.ts');
  });

  it('should get transitive importers', () => {
    // a -> b -> c -> d
    importRepo.addMany([
      { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { fromFile: 'src/b.ts', toFile: 'src/c.ts' },
      { fromFile: 'src/c.ts', toFile: 'src/d.ts' },
    ]);

    const transitive = importRepo.getTransitiveImporters('src/d.ts', 10);
    expect(transitive).toContain('src/c.ts');
    expect(transitive).toContain('src/b.ts');
    expect(transitive).toContain('src/a.ts');
  });

  it('should replace imports for a file', () => {
    importRepo.addMany([
      { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { fromFile: 'src/a.ts', toFile: 'src/c.ts' },
    ]);

    importRepo.replaceForFile('src/a.ts', ['src/d.ts']);

    const graph = importRepo.getImportGraph('src/a.ts');
    expect(graph.imports.length).toBe(1);
    expect(graph.imports[0].path).toBe('src/d.ts');
  });

  it('should count imports', () => {
    importRepo.addMany([
      { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { fromFile: 'src/a.ts', toFile: 'src/c.ts' },
      { fromFile: 'src/b.ts', toFile: 'src/c.ts' },
    ]);

    expect(importRepo.count()).toBe(3);
  });

  it('should delete all imports', () => {
    importRepo.addMany([
      { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
    ]);

    expect(importRepo.count()).toBe(1);
    importRepo.deleteMany();
    expect(importRepo.count()).toBe(0);
  });
});

describe('EntityRepository', () => {
  let db: Database.Database;
  let fileRepo: FileRepository;
  let entityRepo: EntityRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    fileRepo = new FileRepository(db);
    entityRepo = new EntityRepository(db);

    // Set up test files
    fileRepo.upsertMany([
      { path: 'src/models/todo.ts', archId: 'domain.model', checksum: 'a', mtime: 1, lineCount: 10, description: null },
      { path: 'src/api/todos.ts', archId: 'api.handler', checksum: 'b', mtime: 2, lineCount: 20, description: null },
      { path: 'src/components/TodoList.tsx', archId: 'frontend.component', checksum: 'c', mtime: 3, lineCount: 30, description: null },
    ]);
  });

  afterEach(() => {
    db.close();
  });

  it('should replace and get entity files', () => {
    entityRepo.replaceForFile('src/models/todo.ts', [
      { entityName: 'Todo', refType: 'type', lineNumber: 5 },
    ]);

    const files = entityRepo.getFilesForEntity('Todo');
    expect(files.length).toBe(1);
    expect(files[0].path).toBe('src/models/todo.ts');
    expect(files[0].refType).toBe('type');
    expect(files[0].lineNumber).toBe(5);
  });

  it('should get files for entity with arch info', () => {
    entityRepo.replaceForFile('src/models/todo.ts', [
      { entityName: 'Todo', refType: 'type', lineNumber: 5 },
    ]);
    entityRepo.replaceForFile('src/api/todos.ts', [
      { entityName: 'Todo', refType: 'import', lineNumber: 1 },
    ]);
    entityRepo.replaceForFile('src/components/TodoList.tsx', [
      { entityName: 'Todo', refType: 'import', lineNumber: 2 },
    ]);

    const files = entityRepo.getFilesForEntity('Todo');
    expect(files.length).toBe(3);
    expect(files.find(f => f.path === 'src/models/todo.ts')?.archId).toBe('domain.model');
    expect(files.find(f => f.path === 'src/api/todos.ts')?.archId).toBe('api.handler');
  });

  it('should replace references for a file', () => {
    entityRepo.replaceForFile('src/api/todos.ts', [
      { entityName: 'OldEntity', refType: 'type', lineNumber: 1 },
    ]);

    entityRepo.replaceForFile('src/api/todos.ts', [
      { entityName: 'NewEntity', refType: 'type', lineNumber: 5 },
    ]);

    const files = entityRepo.getFilesForEntity('OldEntity');
    expect(files.length).toBe(0);

    const newFiles = entityRepo.getFilesForEntity('NewEntity');
    expect(newFiles.length).toBe(1);
  });

  it('should count entity references', () => {
    entityRepo.replaceForFile('src/models/todo.ts', [
      { entityName: 'Todo', refType: 'type', lineNumber: 1 },
    ]);
    entityRepo.replaceForFile('src/api/todos.ts', [
      { entityName: 'User', refType: 'type', lineNumber: 1 },
    ]);

    expect(entityRepo.count()).toBe(2);
  });

  it('should delete all entity references', () => {
    entityRepo.replaceForFile('src/models/todo.ts', [
      { entityName: 'Todo', refType: 'type', lineNumber: 1 },
    ]);

    expect(entityRepo.count()).toBe(1);
    entityRepo.deleteMany();
    expect(entityRepo.count()).toBe(0);
  });

  it('should delete entity references for a file', () => {
    entityRepo.replaceForFile('src/models/todo.ts', [
      { entityName: 'Todo', refType: 'type', lineNumber: 1 },
    ]);
    entityRepo.replaceForFile('src/api/todos.ts', [
      { entityName: 'User', refType: 'type', lineNumber: 1 },
    ]);

    expect(entityRepo.count()).toBe(2);
    entityRepo.deleteMany('src/models/todo.ts');
    expect(entityRepo.count()).toBe(1);
  });
});
