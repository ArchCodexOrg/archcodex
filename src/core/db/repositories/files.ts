/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * File repository - CRUD operations for the files table.
 */

import type Database from 'better-sqlite3';
import type {
  FileRecord,
  FileRow,
  FileQueryOptions,
  ArchitectureSummary,
} from '../types.js';

/**
 * Convert a database row to a FileRecord.
 */
function rowToRecord(row: FileRow): FileRecord {
  return {
    path: row.path,
    archId: row.arch_id,
    description: row.description,
    checksum: row.checksum,
    mtime: row.mtime,
    lineCount: row.line_count,
    updatedAt: row.updated_at,
  };
}

/**
 * File repository for managing file records.
 * Provides focused CRUD API for the files table.
 */
export class FileRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Get a file by path.
   */
  get(path: string): FileRecord | null {
    const row = this.db.prepare(
      'SELECT * FROM files WHERE path = ?'
    ).get(path) as FileRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  /**
   * Get all files matching query options.
   */
  query(options: FileQueryOptions = {}): FileRecord[] {
    let sql = 'SELECT * FROM files WHERE 1=1';
    const params: (string | number)[] = [];

    if (options.archId) {
      sql += ' AND arch_id = ?';
      params.push(options.archId);
    }

    if (options.archPattern) {
      sql += ' AND arch_id LIKE ?';
      params.push(options.archPattern);
    }

    if (options.pathPattern) {
      sql += ' AND path LIKE ?';
      params.push(options.pathPattern);
    }

    sql += ' ORDER BY path';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as FileRow[];
    return rows.map(rowToRecord);
  }

  /**
   * Insert or update a file record.
   */
  upsert(file: Omit<FileRecord, 'updatedAt'>): void {
    this.db.prepare(`
      INSERT INTO files (path, arch_id, description, checksum, mtime, line_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(path) DO UPDATE SET
        arch_id = excluded.arch_id,
        description = excluded.description,
        checksum = excluded.checksum,
        mtime = excluded.mtime,
        line_count = excluded.line_count,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      file.path,
      file.archId,
      file.description,
      file.checksum,
      file.mtime,
      file.lineCount
    );
  }

  /**
   * Insert or update multiple file records in a transaction.
   */
  upsertMany(files: Omit<FileRecord, 'updatedAt'>[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO files (path, arch_id, description, checksum, mtime, line_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(path) DO UPDATE SET
        arch_id = excluded.arch_id,
        description = excluded.description,
        checksum = excluded.checksum,
        mtime = excluded.mtime,
        line_count = excluded.line_count,
        updated_at = CURRENT_TIMESTAMP
    `);

    const upsertAll = this.db.transaction((files: Omit<FileRecord, 'updatedAt'>[]) => {
      for (const file of files) {
        stmt.run(
          file.path,
          file.archId,
          file.description,
          file.checksum,
          file.mtime,
          file.lineCount
        );
      }
    });

    upsertAll(files);
  }

  /**
   * Delete a file by path.
   */
  delete(path: string): boolean {
    const result = this.db.prepare('DELETE FROM files WHERE path = ?').run(path);
    return result.changes > 0;
  }

  /**
   * Delete files by paths, or all files if no paths provided.
   */
  deleteMany(paths?: string[]): number {
    if (paths === undefined) {
      // Delete all
      const result = this.db.prepare('DELETE FROM files').run();
      return result.changes;
    }

    if (paths.length === 0) return 0;

    const placeholders = paths.map(() => '?').join(',');
    const result = this.db.prepare(
      `DELETE FROM files WHERE path IN (${placeholders})`
    ).run(...paths);
    return result.changes;
  }

  /**
   * Count total files.
   */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
    return row.count;
  }

  /**
   * Get summary of files grouped by architecture.
   */
  getArchitectureSummary(): ArchitectureSummary[] {
    const rows = this.db.prepare(`
      SELECT arch_id, COUNT(*) as file_count
      FROM files
      WHERE arch_id IS NOT NULL
      GROUP BY arch_id
      ORDER BY file_count DESC
    `).all() as Array<{ arch_id: string; file_count: number }>;

    return rows.map(row => ({
      archId: row.arch_id,
      fileCount: row.file_count,
    }));
  }

  /**
   * Get paths of all files in database.
   */
  getAllPaths(): string[] {
    const rows = this.db.prepare('SELECT path FROM files').all() as Array<{ path: string }>;
    return rows.map(row => row.path);
  }

  /**
   * Check if a file exists in the database.
   */
  exists(path: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM files WHERE path = ?'
    ).get(path);
    return row !== undefined;
  }
}
