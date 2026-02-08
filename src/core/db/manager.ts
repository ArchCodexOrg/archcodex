/**
 * @arch archcodex.core.engine
 *
 * Database manager for the ArchCodex SQLite database.
 * Provides singleton connection management and transaction support.
 */

import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { mkdirSync } from 'fs';
import { mkdir } from 'fs/promises';
import { initializeSchema, migrateSchema, needsMigration } from './schema.js';

/** Database file name */
const DB_FILENAME = 'archcodex.db';

/** SQLite cache size in KB (negative means KB, positive means pages) */
const CACHE_SIZE_KB = -64000; // 64MB

/** Database connections by project root */
const connections = new Map<string, Database.Database>();

/**
 * Get the database file path for a project.
 */
export function getDbPath(projectRoot: string): string {
  return resolve(projectRoot, '.arch', DB_FILENAME);
}

/**
 * Get or create a database connection for a project.
 * Uses singleton pattern - one connection per project root.
 */
export async function getDb(projectRoot: string): Promise<Database.Database> {
  const existing = connections.get(projectRoot);
  if (existing) {
    return existing;
  }

  const dbPath = getDbPath(projectRoot);

  // Ensure .arch directory exists
  await mkdir(dirname(dbPath), { recursive: true });

  // Create connection with optimized settings
  const db = new Database(dbPath);

  // Performance optimizations
  db.pragma('journal_mode = WAL'); // Write-ahead logging for better concurrency
  db.pragma('synchronous = NORMAL'); // Good balance of safety and performance
  db.pragma(`cache_size = ${CACHE_SIZE_KB}`);
  db.pragma('temp_store = MEMORY'); // Store temp tables in memory

  // Initialize or migrate schema
  if (needsMigration(db)) {
    migrateSchema(db);
  } else {
    initializeSchema(db);
  }

  connections.set(projectRoot, db);
  return db;
}

/**
 * Get database connection synchronously.
 * Creates the .arch directory if it doesn't exist.
 */
export function getDbSync(projectRoot: string): Database.Database {
  const existing = connections.get(projectRoot);
  if (existing) {
    return existing;
  }

  const dbPath = getDbPath(projectRoot);

  // Ensure .arch directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  // Performance optimizations
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma(`cache_size = ${CACHE_SIZE_KB}`);
  db.pragma('temp_store = MEMORY');

  initializeSchema(db);
  connections.set(projectRoot, db);
  return db;
}

/**
 * Close the database connection for a project.
 */
export function closeDb(projectRoot: string): void {
  const db = connections.get(projectRoot);
  if (db) {
    db.close();
    connections.delete(projectRoot);
  }
}

/**
 * Close all database connections.
 */
export function closeAllDbs(): void {
  for (const [projectRoot, db] of connections) {
    db.close();
    connections.delete(projectRoot);
  }
}

/**
 * Dispose all resources (alias for closeAllDbs).
 * Required by archcodex.core.engine for stateful modules.
 */
export function dispose(): void {
  closeAllDbs();
}

/**
 * Run a function within a database transaction.
 * Automatically commits on success, rolls back on error.
 */
export function transaction<T>(
  db: Database.Database,
  fn: () => T
): T {
  return db.transaction(fn)();
}

/**
 * Get metadata value from the database.
 */
export function getMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string | null } | undefined;
  return row?.value ?? null;
}

/**
 * Set metadata value in the database.
 * If value is null, the key is deleted.
 */
export function setMeta(db: Database.Database, key: string, value: string | null): void {
  if (value === null) {
    db.prepare('DELETE FROM meta WHERE key = ?').run(key);
  } else {
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
  }
}

/**
 * Check if the database exists for a project.
 */
export function dbExists(projectRoot: string): boolean {
  try {
    const dbPath = getDbPath(projectRoot);
    // Try to open in readonly mode to check existence
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.close();
    return true;
  } catch { /* database does not exist */
    return false;
  }
}
