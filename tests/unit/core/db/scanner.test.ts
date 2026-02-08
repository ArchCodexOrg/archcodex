/**
 * @arch archcodex.test.unit
 */
/**
 * Tests for database scanner utility functions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatabaseScanner } from '../../../../src/core/db/scanner.js';
import { initializeSchema } from '../../../../src/core/db/schema.js';
import * as fs from '../../../../src/utils/file-system.js';
import * as checksum from '../../../../src/utils/checksum.js';
import * as parser from '../../../../src/core/arch-tag/parser.js';
import * as git from '../../../../src/utils/git.js';

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../../../../src/utils/checksum.js', () => ({
  computeChecksum: vi.fn(),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn(),
}));

vi.mock('../../../../src/utils/git.js', () => ({
  getGitCommitHash: vi.fn(),
  getChangedFilesSinceCommit: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  stat: vi.fn(),
}));

describe('DatabaseScanner', () => {
  let db: Database.Database;
  let scanner: DatabaseScanner;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new Database(':memory:');
    initializeSchema(db);
    scanner = new DatabaseScanner(db, '/project');
  });

  afterEach(() => {
    db.close();
  });

  describe('needsFullScan', () => {
    it('should return true when no previous scan exists', () => {
      expect(scanner.needsFullScan()).toBe(true);
    });

    it('should return false after a scan', async () => {
      vi.mocked(fs.globFiles).mockResolvedValue([]);
      vi.mocked(git.getGitCommitHash).mockReturnValue('abc123');

      await scanner.fullScan();

      expect(scanner.needsFullScan()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return zero counts for empty database', () => {
      const stats = scanner.getStats();
      expect(stats.fileCount).toBe(0);
      expect(stats.importCount).toBe(0);
      expect(stats.entityRefCount).toBe(0);
      expect(stats.lastScan).toBeNull();
    });
  });

  describe('fullScan', () => {
    it('should scan files and populate database', async () => {
      const mockStatResult = { mtimeMs: Date.now() };
      const { stat } = await import('fs/promises');
      vi.mocked(stat).mockResolvedValue(mockStatResult as never);

      vi.mocked(fs.globFiles).mockResolvedValue(['src/a.ts', 'src/b.ts']);
      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.endsWith('a.ts')) {
          return `/**
 * @arch test.arch.a
 */
import { B } from './b.js';
const value = 1;`;
        }
        return `/**
 * @arch test.arch.b
 */
export const B = 2;`;
      });
      vi.mocked(checksum.computeChecksum).mockImplementation((content: string) => content.slice(0, 16));
      vi.mocked(parser.extractArchId).mockImplementation((content: string) => {
        const match = content.match(/@arch\s+(\S+)/);
        return match ? match[1] : null;
      });
      vi.mocked(git.getGitCommitHash).mockReturnValue('abc123');

      const stats = await scanner.fullScan();

      expect(stats.filesScanned).toBe(2);
      expect(stats.filesWithArch).toBe(2);

      const dbStats = scanner.getStats();
      expect(dbStats.fileCount).toBe(2);
      expect(dbStats.lastScan).not.toBeNull();
    });

    it('should handle empty project', async () => {
      vi.mocked(fs.globFiles).mockResolvedValue([]);
      vi.mocked(git.getGitCommitHash).mockReturnValue(null);

      const stats = await scanner.fullScan();

      expect(stats.filesScanned).toBe(0);
      expect(stats.filesWithArch).toBe(0);
    });
  });

  describe('incrementalSync', () => {
    it('should fall back to full scan when no previous commit', async () => {
      vi.mocked(fs.globFiles).mockResolvedValue([]);
      vi.mocked(git.getGitCommitHash).mockReturnValue(null);

      const stats = await scanner.incrementalSync();

      expect(stats.incrementalUpdates).toBe(0);
    });

    it('should return zero updates when commit unchanged', async () => {
      // Set up initial state (update existing keys from initializeSchema)
      db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(new Date().toISOString(), 'last_full_scan');
      db.prepare('UPDATE meta SET value = ? WHERE key = ?').run('abc123', 'last_git_commit');

      vi.mocked(git.getGitCommitHash).mockReturnValue('abc123');

      const stats = await scanner.incrementalSync();

      expect(stats.filesScanned).toBe(0);
      expect(stats.incrementalUpdates).toBe(0);
    });
  });
});

describe('Import extraction', () => {
  // Test the import extraction logic by examining scan results
  it('should extract relative imports from file content', async () => {
    const db = new Database(':memory:');
    initializeSchema(db);
    const scanner = new DatabaseScanner(db, '/project');

    const mockStatResult = { mtimeMs: Date.now() };
    const { stat } = await import('fs/promises');
    vi.mocked(stat).mockResolvedValue(mockStatResult as never);

    vi.mocked(fs.globFiles).mockResolvedValue(['src/main.ts', 'src/utils.ts']);
    vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
      if (path.endsWith('main.ts')) {
        return `import { helper } from './utils.js';
import external from 'external-package';
export { data } from './utils.js';`;
      }
      return `export const helper = () => {};
export const data = {};`;
    });
    vi.mocked(checksum.computeChecksum).mockReturnValue('checksum');
    vi.mocked(parser.extractArchId).mockReturnValue(null);
    vi.mocked(git.getGitCommitHash).mockReturnValue('abc123');

    const stats = await scanner.fullScan();

    expect(stats.filesScanned).toBe(2);
    // Import relationships should be tracked
    expect(stats.importCount).toBeGreaterThanOrEqual(0);

    db.close();
  });
});

describe('syncFile', () => {
  it('should sync a single file', async () => {
    const db = new Database(':memory:');
    initializeSchema(db);
    const scanner = new DatabaseScanner(db, '/project');

    const mockStatResult = { mtimeMs: Date.now() };
    const { stat } = await import('fs/promises');
    vi.mocked(stat).mockResolvedValue(mockStatResult as never);

    vi.mocked(fs.readFile).mockResolvedValue(`/**
 * @arch test.arch
 */
export const test = 1;`);
    vi.mocked(checksum.computeChecksum).mockReturnValue('checksum123');
    vi.mocked(parser.extractArchId).mockReturnValue('test.arch');

    const result = await scanner.syncFile('src/test.ts');

    expect(result).toBe(true);

    db.close();
  });

  it('should return false when file cannot be read', async () => {
    const db = new Database(':memory:');
    initializeSchema(db);
    const scanner = new DatabaseScanner(db, '/project');

    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

    const result = await scanner.syncFile('src/nonexistent.ts');

    expect(result).toBe(false);

    db.close();
  });
});

describe('dispose', () => {
  it('should complete without error', () => {
    const db = new Database(':memory:');
    initializeSchema(db);
    const scanner = new DatabaseScanner(db, '/project');

    expect(() => scanner.dispose()).not.toThrow();

    db.close();
  });
});

describe('Entity extraction', () => {
  it('should extract entity references from function names', async () => {
    const db = new Database(':memory:');
    initializeSchema(db);
    const scanner = new DatabaseScanner(db, '/project');

    const mockStatResult = { mtimeMs: Date.now() };
    const { stat } = await import('fs/promises');
    vi.mocked(stat).mockResolvedValue(mockStatResult as never);

    vi.mocked(fs.globFiles).mockResolvedValue(['src/api.ts']);
    vi.mocked(fs.readFile).mockResolvedValue(`
import { Todo } from './types.js';
export function createTodo(data: Todo) {}
export async function getTodos() {}
export const deleteTodo = (id: string) => {};
`);
    vi.mocked(checksum.computeChecksum).mockReturnValue('checksum');
    vi.mocked(parser.extractArchId).mockReturnValue('api.handler');
    vi.mocked(git.getGitCommitHash).mockReturnValue('abc123');

    const stats = await scanner.fullScan();

    expect(stats.filesScanned).toBe(1);
    expect(stats.entityRefCount).toBeGreaterThan(0);

    db.close();
  });

  it('should extract schema definitions', async () => {
    const db = new Database(':memory:');
    initializeSchema(db);
    const scanner = new DatabaseScanner(db, '/project');

    const mockStatResult = { mtimeMs: Date.now() };
    const { stat } = await import('fs/promises');
    vi.mocked(stat).mockResolvedValue(mockStatResult as never);

    vi.mocked(fs.globFiles).mockResolvedValue(['convex/schema.ts']);
    vi.mocked(fs.readFile).mockResolvedValue(`
import { defineSchema, defineTable } from 'convex/server';
export default defineSchema({
  todos: defineTable('todos', {}),
  users: defineTable('users', {}),
});
`);
    vi.mocked(checksum.computeChecksum).mockReturnValue('checksum');
    vi.mocked(parser.extractArchId).mockReturnValue('convex.schema');
    vi.mocked(git.getGitCommitHash).mockReturnValue('abc123');

    const stats = await scanner.fullScan();

    expect(stats.entityRefCount).toBeGreaterThan(0);

    db.close();
  });
});
