/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Entity repository - operations for the entity_refs table.
 * Tracks references to entities (types, functions, etc.) across files.
 */

import type Database from 'better-sqlite3';
import type { EntityRefRecord } from '../types.js';

/**
 * Entity repository for managing entity references.
 * Provides focused API for entity tracking operations.
 */
export class EntityRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Get files referencing an entity, grouped by architecture.
   */
  getFilesForEntity(entityName: string): Array<{ path: string; archId: string | null; refType: string | null; lineNumber: number | null }> {
    const rows = this.db.prepare(`
      SELECT DISTINCT er.file_path, f.arch_id, er.ref_type, er.line_number
      FROM entity_refs er
      JOIN files f ON er.file_path = f.path
      WHERE er.entity_name = ?
      ORDER BY f.arch_id, er.file_path
    `).all(entityName) as Array<{ file_path: string; arch_id: string | null; ref_type: string | null; line_number: number | null }>;

    return rows.map(r => ({
      path: r.file_path,
      archId: r.arch_id,
      refType: r.ref_type,
      lineNumber: r.line_number,
    }));
  }

  /**
   * Replace all entity references for a file.
   */
  replaceForFile(filePath: string, refs: Omit<EntityRefRecord, 'id' | 'filePath'>[]): void {
    const deleteStmt = this.db.prepare('DELETE FROM entity_refs WHERE file_path = ?');
    const insertStmt = this.db.prepare(
      'INSERT INTO entity_refs (file_path, entity_name, ref_type, line_number) VALUES (?, ?, ?, ?)'
    );

    const replace = this.db.transaction(() => {
      deleteStmt.run(filePath);
      for (const ref of refs) {
        insertStmt.run(filePath, ref.entityName, ref.refType, ref.lineNumber);
      }
    });

    replace();
  }

  /**
   * Delete entity references, or all if no file specified.
   */
  deleteMany(filePath?: string): number {
    if (filePath) {
      const result = this.db.prepare(
        'DELETE FROM entity_refs WHERE file_path = ?'
      ).run(filePath);
      return result.changes;
    }
    const result = this.db.prepare('DELETE FROM entity_refs').run();
    return result.changes;
  }

  /**
   * Count total entity references.
   */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM entity_refs').get() as { count: number };
    return row.count;
  }

  /**
   * Get all entity references in a file.
   */
  getEntitiesForFile(filePath: string): Array<{ entityName: string; refType: string | null; lineNumber: number | null }> {
    const rows = this.db.prepare(`
      SELECT entity_name, ref_type, line_number
      FROM entity_refs
      WHERE file_path = ?
      ORDER BY entity_name
    `).all(filePath) as Array<{ entity_name: string; ref_type: string | null; line_number: number | null }>;

    return rows.map(r => ({
      entityName: r.entity_name,
      refType: r.ref_type,
      lineNumber: r.line_number,
    }));
  }
}
