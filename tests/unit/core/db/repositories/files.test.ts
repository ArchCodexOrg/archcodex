/**
 * @arch archcodex.test.unit
 *
 * Tests for FileRepository.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { FileRepository } from '../../../../../src/core/db/repositories/files.js';
import { initializeSchema } from '../../../../../src/core/db/schema.js';

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

  it('should upsert and retrieve a file', () => {
    repo.upsert({
      path: 'src/test.ts',
      archId: 'archcodex.core.domain',
      checksum: 'abc123',
      mtime: Date.now(),
      lineCount: 50,
      description: null,
    });

    const file = repo.get('src/test.ts');
    expect(file).not.toBeNull();
    expect(file?.archId).toBe('archcodex.core.domain');
    expect(file?.lineCount).toBe(50);
  });

  it('should query by architecture', () => {
    repo.upsert({ path: 'src/a.ts', archId: 'archcodex.core.domain', checksum: 'a', mtime: 0, lineCount: 10, description: null });
    repo.upsert({ path: 'src/b.ts', archId: 'archcodex.cli.command', checksum: 'b', mtime: 0, lineCount: 20, description: null });

    const results = repo.query({ archId: 'archcodex.core.domain' });
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('src/a.ts');
  });

  it('should get architecture summary', () => {
    repo.upsert({ path: 'src/a.ts', archId: 'archcodex.core.domain', checksum: 'a', mtime: 0, lineCount: 100, description: null });
    repo.upsert({ path: 'src/b.ts', archId: 'archcodex.core.domain', checksum: 'b', mtime: 0, lineCount: 200, description: null });

    const summary = repo.getArchitectureSummary();
    const coreDomain = summary.find(s => s.archId === 'archcodex.core.domain');

    expect(coreDomain).toBeDefined();
    expect(coreDomain?.fileCount).toBe(2);
  });

  it('should delete all files with deleteMany()', () => {
    repo.upsert({ path: 'src/a.ts', archId: 'test', checksum: 'a', mtime: 0, lineCount: 10, description: null });
    repo.upsert({ path: 'src/b.ts', archId: 'test', checksum: 'b', mtime: 0, lineCount: 20, description: null });

    expect(repo.count()).toBe(2);
    repo.deleteMany();
    expect(repo.count()).toBe(0);
  });

  it('should delete specific files with deleteMany(paths)', () => {
    repo.upsert({ path: 'src/a.ts', archId: 'test', checksum: 'a', mtime: 0, lineCount: 10, description: null });
    repo.upsert({ path: 'src/b.ts', archId: 'test', checksum: 'b', mtime: 0, lineCount: 20, description: null });

    repo.deleteMany(['src/a.ts']);
    expect(repo.count()).toBe(1);
    expect(repo.exists('src/b.ts')).toBe(true);
  });

  it('should query by path pattern', () => {
    repo.upsert({ path: 'src/core/db/manager.ts', archId: 'archcodex.core.engine', checksum: 'a', mtime: 0, lineCount: 100, description: null });
    repo.upsert({ path: 'src/core/db/schema.ts', archId: 'archcodex.core.engine', checksum: 'b', mtime: 0, lineCount: 50, description: null });
    repo.upsert({ path: 'src/cli/commands/map.ts', archId: 'archcodex.cli.command', checksum: 'c', mtime: 0, lineCount: 200, description: null });

    const results = repo.query({ pathPattern: 'src/core/db/%' });
    expect(results).toHaveLength(2);
    expect(results.map(r => r.path)).toContain('src/core/db/manager.ts');
    expect(results.map(r => r.path)).toContain('src/core/db/schema.ts');
  });

  it('should query by architecture pattern', () => {
    repo.upsert({ path: 'src/a.ts', archId: 'archcodex.core.domain', checksum: 'a', mtime: 0, lineCount: 10, description: null });
    repo.upsert({ path: 'src/b.ts', archId: 'archcodex.core.engine', checksum: 'b', mtime: 0, lineCount: 20, description: null });
    repo.upsert({ path: 'src/c.ts', archId: 'archcodex.cli.command', checksum: 'c', mtime: 0, lineCount: 30, description: null });

    const results = repo.query({ archPattern: 'archcodex.core.%' });
    expect(results).toHaveLength(2);
  });

  it('should upsert many files in a transaction', () => {
    repo.upsertMany([
      { path: 'src/a.ts', archId: 'test.a', checksum: 'a', mtime: 0, lineCount: 10, description: null },
      { path: 'src/b.ts', archId: 'test.b', checksum: 'b', mtime: 0, lineCount: 20, description: null },
      { path: 'src/c.ts', archId: 'test.c', checksum: 'c', mtime: 0, lineCount: 30, description: null },
    ]);

    expect(repo.count()).toBe(3);
    expect(repo.get('src/a.ts')?.archId).toBe('test.a');
    expect(repo.get('src/b.ts')?.archId).toBe('test.b');
    expect(repo.get('src/c.ts')?.archId).toBe('test.c');
  });

  it('should delete a single file', () => {
    repo.upsert({ path: 'src/a.ts', archId: 'test', checksum: 'a', mtime: 0, lineCount: 10, description: null });
    repo.upsert({ path: 'src/b.ts', archId: 'test', checksum: 'b', mtime: 0, lineCount: 20, description: null });

    expect(repo.count()).toBe(2);
    const deleted = repo.delete('src/a.ts');
    expect(deleted).toBe(true);
    expect(repo.count()).toBe(1);
    expect(repo.exists('src/a.ts')).toBe(false);
  });

  it('should return false when deleting non-existent file', () => {
    const deleted = repo.delete('nonexistent.ts');
    expect(deleted).toBe(false);
  });

  it('should get all file paths', () => {
    repo.upsert({ path: 'src/a.ts', archId: 'test', checksum: 'a', mtime: 0, lineCount: 10, description: null });
    repo.upsert({ path: 'src/b.ts', archId: 'test', checksum: 'b', mtime: 0, lineCount: 20, description: null });

    const paths = repo.getAllPaths();
    expect(paths).toHaveLength(2);
    expect(paths).toContain('src/a.ts');
    expect(paths).toContain('src/b.ts');
  });

  it('should return empty array for deleteMany with empty paths', () => {
    repo.upsert({ path: 'src/a.ts', archId: 'test', checksum: 'a', mtime: 0, lineCount: 10, description: null });

    const deleted = repo.deleteMany([]);
    expect(deleted).toBe(0);
    expect(repo.count()).toBe(1);
  });

  it('should query with limit option', () => {
    repo.upsert({ path: 'src/a.ts', archId: 'test', checksum: 'a', mtime: 0, lineCount: 10, description: null });
    repo.upsert({ path: 'src/b.ts', archId: 'test', checksum: 'b', mtime: 0, lineCount: 20, description: null });
    repo.upsert({ path: 'src/c.ts', archId: 'test', checksum: 'c', mtime: 0, lineCount: 30, description: null });

    const results = repo.query({ limit: 2 });
    expect(results).toHaveLength(2);
  });
});
