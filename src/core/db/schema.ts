/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Database schema definitions for the ArchCodex SQLite database.
 * Handles schema creation and migrations.
 */

import type Database from 'better-sqlite3';

/** Current schema version */
export const SCHEMA_VERSION = 1;

/**
 * SQL statements to create the database schema.
 */
export const SCHEMA_SQL = `
-- Core file tracking
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  arch_id TEXT,
  description TEXT,
  checksum TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  line_count INTEGER,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_arch ON files(arch_id);

-- Import relationships (graph edges)
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY,
  from_file TEXT NOT NULL,
  to_file TEXT NOT NULL,
  FOREIGN KEY (from_file) REFERENCES files(path) ON DELETE CASCADE,
  UNIQUE(from_file, to_file)
);

CREATE INDEX IF NOT EXISTS idx_imports_from ON imports(from_file);
CREATE INDEX IF NOT EXISTS idx_imports_to ON imports(to_file);

-- Entity references (for entity_context queries)
CREATE TABLE IF NOT EXISTS entity_refs (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  ref_type TEXT,
  line_number INTEGER,
  FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entity_refs_entity ON entity_refs(entity_name);
CREATE INDEX IF NOT EXISTS idx_entity_refs_file ON entity_refs(file_path);

-- Validation results cache
CREATE TABLE IF NOT EXISTS validations (
  file_path TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  violations TEXT,
  warnings TEXT,
  checksum TEXT NOT NULL,
  registry_checksum TEXT,
  validated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
);

-- Metadata for sync tracking
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

/**
 * Initial metadata values to insert.
 */
const INITIAL_META = [
  ['schema_version', String(SCHEMA_VERSION)],
  ['last_full_scan', null],
  ['last_git_commit', null],
  ['registry_checksum', null],
];

/**
 * Initialize the database schema.
 * Creates tables if they don't exist and sets up initial metadata.
 * Note: db.exec() is SQLite's exec method for running SQL, not child_process.exec()
 */
export function initializeSchema(db: Database.Database): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables using SQLite's exec method
  db.exec(SCHEMA_SQL);

  // Insert initial metadata (ignore if already exists)
  const insertMeta = db.prepare(
    'INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)'
  );

  for (const [key, value] of INITIAL_META) {
    insertMeta.run(key, value);
  }
}

/**
 * Get the current schema version from the database.
 */
export function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

/**
 * Check if schema migration is needed.
 */
export function needsMigration(db: Database.Database): boolean {
  const currentVersion = getSchemaVersion(db);
  return currentVersion < SCHEMA_VERSION;
}

/**
 * Run schema migrations to bring database up to current version.
 * Currently only supports initial schema creation.
 *
 * FUTURE: Implement version-based migrations when SCHEMA_VERSION > 1.
 * Schema is currently at v1 — no migrations needed yet.
 * When needed, each migration should transform the schema from version N to N+1.
 */
export function migrateSchema(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db);

  if (currentVersion < SCHEMA_VERSION) {
    // For now, just ensure schema is initialized (uses IF NOT EXISTS)
    initializeSchema(db);

    // Update schema version
    db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(
      String(SCHEMA_VERSION),
      'schema_version'
    );
  }
}
