/**
 * @arch archcodex.test.unit
 *
 * Tests for EntityRepository.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { FileRepository } from '../../../../../src/core/db/repositories/files.js';
import { EntityRepository } from '../../../../../src/core/db/repositories/entities.js';
import { initializeSchema } from '../../../../../src/core/db/schema.js';

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
    fileRepo.upsert({ path: 'src/user.ts', archId: 'archcodex.core.domain', checksum: 'a', mtime: 0, lineCount: 100, description: null });
    fileRepo.upsert({ path: 'src/api.ts', archId: 'archcodex.cli.command', checksum: 'b', mtime: 0, lineCount: 50, description: null });
  });

  afterEach(() => {
    db.close();
  });

  it('should replace and retrieve entity references', () => {
    entityRepo.replaceForFile('src/user.ts', [
      { entityName: 'UserService', refType: 'type', lineNumber: 10 },
      { entityName: 'createUser', refType: 'function', lineNumber: 25 },
    ]);

    const files = entityRepo.getFilesForEntity('UserService');
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/user.ts');
    expect(files[0].refType).toBe('type');
  });

  it('should get files for entity across multiple files', () => {
    entityRepo.replaceForFile('src/user.ts', [
      { entityName: 'UserService', refType: 'type', lineNumber: 10 },
    ]);
    entityRepo.replaceForFile('src/api.ts', [
      { entityName: 'UserService', refType: 'import', lineNumber: 1 },
    ]);

    const files = entityRepo.getFilesForEntity('UserService');
    expect(files).toHaveLength(2);
  });

  it('should delete all entities with deleteMany()', () => {
    entityRepo.replaceForFile('src/user.ts', [
      { entityName: 'UserService', refType: 'type', lineNumber: 10 },
    ]);

    expect(entityRepo.count()).toBe(1);
    entityRepo.deleteMany();
    expect(entityRepo.count()).toBe(0);
  });

  it('should delete entities for specific file with deleteMany(path)', () => {
    entityRepo.replaceForFile('src/user.ts', [
      { entityName: 'UserService', refType: 'type', lineNumber: 10 },
    ]);
    entityRepo.replaceForFile('src/api.ts', [
      { entityName: 'ApiClient', refType: 'type', lineNumber: 5 },
    ]);

    expect(entityRepo.count()).toBe(2);
    entityRepo.deleteMany('src/user.ts');
    expect(entityRepo.count()).toBe(1);
  });

  it('should get entities for a specific file', () => {
    entityRepo.replaceForFile('src/user.ts', [
      { entityName: 'UserService', refType: 'type', lineNumber: 10 },
      { entityName: 'createUser', refType: 'function', lineNumber: 25 },
    ]);

    const entities = entityRepo.getEntitiesForFile('src/user.ts');
    expect(entities).toHaveLength(2);
    expect(entities.map(e => e.entityName)).toContain('UserService');
    expect(entities.map(e => e.entityName)).toContain('createUser');
  });

  it('should return empty array for file with no entities', () => {
    const entities = entityRepo.getEntitiesForFile('src/nonexistent.ts');
    expect(entities).toHaveLength(0);
  });

  it('should return empty array for non-existent entity', () => {
    const files = entityRepo.getFilesForEntity('NonExistentEntity');
    expect(files).toHaveLength(0);
  });

  it('should handle multiple references of same entity in different files', () => {
    entityRepo.replaceForFile('src/user.ts', [
      { entityName: 'SharedEntity', refType: 'type', lineNumber: 10 },
    ]);
    entityRepo.replaceForFile('src/api.ts', [
      { entityName: 'SharedEntity', refType: 'import', lineNumber: 1 },
      { entityName: 'SharedEntity', refType: 'function', lineNumber: 20 },
    ]);

    const files = entityRepo.getFilesForEntity('SharedEntity');
    expect(files).toHaveLength(3);
  });
});
