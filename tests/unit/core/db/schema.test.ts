/**
 * @arch archcodex.test.unit
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema, needsMigration, migrateSchema, getSchemaVersion, SCHEMA_VERSION } from '../../../../src/core/db/schema.js';

describe('schema', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('initializeSchema', () => {
    it('should create all required tables', () => {
      db = new Database(':memory:');
      initializeSchema(db);

      // Check tables exist
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as { name: string }[];

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('files');
      expect(tableNames).toContain('imports');
      expect(tableNames).toContain('entity_refs');
      expect(tableNames).toContain('meta');
    });

    it('should be idempotent', () => {
      db = new Database(':memory:');
      initializeSchema(db);
      initializeSchema(db); // Should not throw

      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all();
      expect(tables.length).toBeGreaterThan(0);
    });

    it('should set schema version in meta', () => {
      db = new Database(':memory:');
      initializeSchema(db);

      const version = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value: string };
      expect(version.value).toBe(String(SCHEMA_VERSION));
    });
  });

  describe('getSchemaVersion', () => {
    it('should return current schema version after init', () => {
      db = new Database(':memory:');
      initializeSchema(db);
      expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    });

    it('should return 0 when no version exists', () => {
      db = new Database(':memory:');
      // Create meta table without schema_version
      db.prepare('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)').run();
      expect(getSchemaVersion(db)).toBe(0);
    });
  });

  describe('needsMigration', () => {
    it('should return false after schema initialization', () => {
      db = new Database(':memory:');
      initializeSchema(db);
      expect(needsMigration(db)).toBe(false);
    });

    it('should throw on empty database (no meta table)', () => {
      db = new Database(':memory:');
      expect(() => needsMigration(db)).toThrow();
    });

    it('should return true when version is older', () => {
      db = new Database(':memory:');
      initializeSchema(db);
      // Manually set an older version
      db.prepare('UPDATE meta SET value = ? WHERE key = ?').run('0', 'schema_version');
      expect(needsMigration(db)).toBe(true);
    });
  });

  describe('migrateSchema', () => {
    it('should update schema version after init', () => {
      db = new Database(':memory:');
      initializeSchema(db);
      migrateSchema(db);

      const version = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value: string };
      expect(version.value).toBe(String(SCHEMA_VERSION));
    });
  });
});
