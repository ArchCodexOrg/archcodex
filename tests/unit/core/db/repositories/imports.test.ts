/**
 * @arch archcodex.test.unit
 *
 * Tests for ImportRepository.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { FileRepository } from '../../../../../src/core/db/repositories/files.js';
import { ImportRepository } from '../../../../../src/core/db/repositories/imports.js';
import { initializeSchema } from '../../../../../src/core/db/schema.js';

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
    fileRepo.upsert({ path: 'src/a.ts', archId: 'archcodex.core.domain', checksum: 'a', mtime: 0, lineCount: 10, description: null });
    fileRepo.upsert({ path: 'src/b.ts', archId: 'archcodex.core.domain', checksum: 'b', mtime: 0, lineCount: 20, description: null });
    fileRepo.upsert({ path: 'src/c.ts', archId: 'archcodex.cli.command', checksum: 'c', mtime: 0, lineCount: 30, description: null });
  });

  afterEach(() => {
    db.close();
  });

  it('should add and retrieve imports via getImportGraph', () => {
    importRepo.addMany([
      { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { fromFile: 'src/a.ts', toFile: 'src/c.ts' },
    ]);

    const graph = importRepo.getImportGraph('src/a.ts');
    expect(graph.imports).toHaveLength(2);
    expect(graph.imports.map(i => i.path)).toContain('src/b.ts');
    expect(graph.imports.map(i => i.path)).toContain('src/c.ts');
  });

  it('should track importedBy relationships', () => {
    importRepo.replaceForFile('src/a.ts', ['src/b.ts']);
    importRepo.replaceForFile('src/c.ts', ['src/b.ts']);

    const graph = importRepo.getImportGraph('src/b.ts');
    expect(graph.importedBy).toHaveLength(2);
  });

  it('should get transitive imports', () => {
    importRepo.replaceForFile('src/a.ts', ['src/b.ts']);
    importRepo.replaceForFile('src/b.ts', ['src/c.ts']);

    const transitive = importRepo.getTransitiveImports('src/a.ts', 2);
    expect(transitive).toContain('src/b.ts');
    expect(transitive).toContain('src/c.ts');
  });

  it('should respect depth limit', () => {
    importRepo.replaceForFile('src/a.ts', ['src/b.ts']);
    importRepo.replaceForFile('src/b.ts', ['src/c.ts']);

    const transitive = importRepo.getTransitiveImports('src/a.ts', 1);
    expect(transitive).toContain('src/b.ts');
    expect(transitive).not.toContain('src/c.ts');
  });

  it('should delete all imports with deleteMany()', () => {
    importRepo.addMany([
      { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
    ]);

    expect(importRepo.count()).toBe(1);
    importRepo.deleteMany();
    expect(importRepo.count()).toBe(0);
  });

  it('should delete imports for specific file with deleteMany(fromFile)', () => {
    importRepo.addMany([
      { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { fromFile: 'src/b.ts', toFile: 'src/c.ts' },
    ]);

    expect(importRepo.count()).toBe(2);
    const deleted = importRepo.deleteMany('src/a.ts');
    expect(deleted).toBe(1);
    expect(importRepo.count()).toBe(1);
  });

  it('should get transitive importers', () => {
    importRepo.replaceForFile('src/a.ts', ['src/b.ts']);
    importRepo.replaceForFile('src/b.ts', ['src/c.ts']);

    const importers = importRepo.getTransitiveImporters('src/c.ts', 2);
    expect(importers).toContain('src/b.ts');
    expect(importers).toContain('src/a.ts');
  });

  it('should respect depth limit for transitive importers', () => {
    importRepo.replaceForFile('src/a.ts', ['src/b.ts']);
    importRepo.replaceForFile('src/b.ts', ['src/c.ts']);

    const importers = importRepo.getTransitiveImporters('src/c.ts', 1);
    expect(importers).toContain('src/b.ts');
    expect(importers).not.toContain('src/a.ts');
  });

  it('should return empty array for file with no imports', () => {
    const graph = importRepo.getImportGraph('src/a.ts');
    expect(graph.imports).toHaveLength(0);
    expect(graph.importedBy).toHaveLength(0);
  });

  it('should return empty array for transitive imports of isolated file', () => {
    const transitive = importRepo.getTransitiveImports('src/isolated.ts', 2);
    expect(transitive).toHaveLength(0);
  });
});
