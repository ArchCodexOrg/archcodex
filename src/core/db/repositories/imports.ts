/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Import repository - operations for the imports table (graph edges).
 */

import type Database from 'better-sqlite3';
import type { ImportGraphResult } from '../types.js';

/**
 * Import repository for managing import relationships.
 * Provides focused API for import graph operations.
 */
export class ImportRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Get import graph for a file (imports and importers with arch info).
   */
  getImportGraph(filePath: string): ImportGraphResult {
    // Get files this file imports
    const imports = this.db.prepare(`
      SELECT f.path, f.arch_id
      FROM imports i
      JOIN files f ON i.to_file = f.path
      WHERE i.from_file = ?
    `).all(filePath) as Array<{ path: string; arch_id: string | null }>;

    // Get files that import this file
    const importedBy = this.db.prepare(`
      SELECT f.path, f.arch_id
      FROM imports i
      JOIN files f ON i.from_file = f.path
      WHERE i.to_file = ?
    `).all(filePath) as Array<{ path: string; arch_id: string | null }>;

    return {
      imports: imports.map(r => ({ path: r.path, archId: r.arch_id })),
      importedBy: importedBy.map(r => ({ path: r.path, archId: r.arch_id })),
    };
  }

  /**
   * Get transitive imports (all files reachable from a starting file).
   * Uses recursive CTE for graph traversal.
   */
  getTransitiveImports(filePath: string, maxDepth: number = 10): string[] {
    const rows = this.db.prepare(`
      WITH RECURSIVE import_chain(file_path, depth) AS (
        SELECT to_file, 1 FROM imports WHERE from_file = ?
        UNION
        SELECT i.to_file, ic.depth + 1
        FROM imports i
        JOIN import_chain ic ON i.from_file = ic.file_path
        WHERE ic.depth < ?
      )
      SELECT DISTINCT file_path FROM import_chain
    `).all(filePath, maxDepth) as Array<{ file_path: string }>;

    return rows.map(r => r.file_path);
  }

  /**
   * Get transitive importers (all files that eventually import a file).
   * Uses recursive CTE for graph traversal.
   */
  getTransitiveImporters(filePath: string, maxDepth: number = 10): string[] {
    const rows = this.db.prepare(`
      WITH RECURSIVE importer_chain(file_path, depth) AS (
        SELECT from_file, 1 FROM imports WHERE to_file = ?
        UNION
        SELECT i.from_file, ic.depth + 1
        FROM imports i
        JOIN importer_chain ic ON i.to_file = ic.file_path
        WHERE ic.depth < ?
      )
      SELECT DISTINCT file_path FROM importer_chain
    `).all(filePath, maxDepth) as Array<{ file_path: string }>;

    return rows.map(r => r.file_path);
  }

  /**
   * Add multiple import relationships in a transaction.
   */
  addMany(imports: Array<{ fromFile: string; toFile: string }>): void {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO imports (from_file, to_file) VALUES (?, ?)'
    );

    const addAll = this.db.transaction((imports: Array<{ fromFile: string; toFile: string }>) => {
      for (const imp of imports) {
        stmt.run(imp.fromFile, imp.toFile);
      }
    });

    addAll(imports);
  }

  /**
   * Replace all imports for a file.
   */
  replaceForFile(fromFile: string, toFiles: string[]): void {
    const deleteStmt = this.db.prepare('DELETE FROM imports WHERE from_file = ?');
    const insertStmt = this.db.prepare(
      'INSERT OR IGNORE INTO imports (from_file, to_file) VALUES (?, ?)'
    );

    const replace = this.db.transaction(() => {
      deleteStmt.run(fromFile);
      for (const toFile of toFiles) {
        insertStmt.run(fromFile, toFile);
      }
    });

    replace();
  }

  /**
   * Delete imports, or all imports if no file specified.
   */
  deleteMany(fromFile?: string): number {
    if (fromFile) {
      const result = this.db.prepare(
        'DELETE FROM imports WHERE from_file = ?'
      ).run(fromFile);
      return result.changes;
    }
    const result = this.db.prepare('DELETE FROM imports').run();
    return result.changes;
  }

  /**
   * Count total import relationships.
   */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM imports').get() as { count: number };
    return row.count;
  }
}
