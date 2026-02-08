/**
 * @arch archcodex.test.unit
 */
/**
 * Tests for database manager functions.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  transaction,
  getMeta,
  setMeta,
  getDbPath,
  dispose,
  closeAllDbs,
  closeDb,
  dbExists,
} from '../../../../src/core/db/manager.js';
import { initializeSchema } from '../../../../src/core/db/schema.js';

describe('Database Manager', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('transaction', () => {
    it('should execute function within a transaction', () => {
      db = new Database(':memory:');
      initializeSchema(db);

      const result = transaction(db, () => {
        db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('test_key', 'test_value');
        return 'success';
      });

      expect(result).toBe('success');
      const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('test_key') as { value: string };
      expect(row.value).toBe('test_value');
    });

    it('should rollback on error', () => {
      db = new Database(':memory:');
      initializeSchema(db);

      expect(() => {
        transaction(db, () => {
          db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('rollback_test', 'value');
          throw new Error('Test error');
        });
      }).toThrow('Test error');

      const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('rollback_test');
      expect(row).toBeUndefined();
    });
  });

  describe('getMeta / setMeta', () => {
    it('should get and set metadata values', () => {
      db = new Database(':memory:');
      initializeSchema(db);

      setMeta(db, 'test_key', 'test_value');
      expect(getMeta(db, 'test_key')).toBe('test_value');
    });

    it('should return null for non-existent key', () => {
      db = new Database(':memory:');
      initializeSchema(db);

      expect(getMeta(db, 'nonexistent')).toBeNull();
    });

    it('should update existing key', () => {
      db = new Database(':memory:');
      initializeSchema(db);

      setMeta(db, 'update_test', 'original');
      setMeta(db, 'update_test', 'updated');
      expect(getMeta(db, 'update_test')).toBe('updated');
    });

    it('should delete key when value is null', () => {
      db = new Database(':memory:');
      initializeSchema(db);

      setMeta(db, 'delete_test', 'value');
      setMeta(db, 'delete_test', null);
      expect(getMeta(db, 'delete_test')).toBeNull();
    });
  });

  describe('getDbPath', () => {
    it('should return correct path', () => {
      const path = getDbPath('/project');
      expect(path).toContain('.arch');
      expect(path).toContain('archcodex.db');
    });
  });

  describe('dispose', () => {
    it('should not throw when called', () => {
      expect(() => dispose()).not.toThrow();
    });
  });

  describe('closeDb', () => {
    it('should not throw for non-existent connection', () => {
      expect(() => closeDb('/nonexistent/path')).not.toThrow();
    });
  });

  describe('closeAllDbs', () => {
    it('should not throw when called', () => {
      expect(() => closeAllDbs()).not.toThrow();
    });
  });

  describe('dbExists', () => {
    it('should return false for non-existent path', () => {
      expect(dbExists('/nonexistent/path')).toBe(false);
    });
  });
});
