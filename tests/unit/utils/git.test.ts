/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getStagedFiles,
  getModifiedFiles,
  isGitRepository,
  getCurrentBranch,
  toAbsolutePaths,
  getGitCommitHash,
  getChangedFilesSinceCommit,
} from '../../../src/utils/git.js';

const execAsync = promisify(exec);

describe('git utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `archcodex-git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('isGitRepository', () => {
    it('should return false for non-git directory', async () => {
      const result = await isGitRepository(testDir);
      expect(result).toBe(false);
    });

    it('should return true for git repository', async () => {
      await execAsync('git init', { cwd: testDir });

      const result = await isGitRepository(testDir);
      expect(result).toBe(true);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return null for non-git directory', async () => {
      const result = await getCurrentBranch(testDir);
      expect(result).toBeNull();
    });

    it('should return branch name for git repo', async () => {
      // Initialize git repo
      await execAsync('git init', { cwd: testDir });
      await execAsync('git config user.email "test@test.com"', { cwd: testDir });
      await execAsync('git config user.name "Test"', { cwd: testDir });

      // Create initial commit
      await writeFile(join(testDir, 'README.md'), '# Test\n');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Initial commit"', { cwd: testDir });

      const result = await getCurrentBranch(testDir);
      // Could be 'main' or 'master' depending on git config
      expect(result).toMatch(/^(main|master)$/);
    });
  });

  describe('getStagedFiles', () => {
    it('should return empty array for non-git directory', async () => {
      const result = await getStagedFiles(testDir);
      expect(result).toEqual([]);
    });

    it('should return empty array when no files are staged', async () => {
      await execAsync('git init', { cwd: testDir });

      const result = await getStagedFiles(testDir);
      expect(result).toEqual([]);
    });

    it('should return staged files', async () => {
      // Initialize git repo
      await execAsync('git init', { cwd: testDir });
      await execAsync('git config user.email "test@test.com"', { cwd: testDir });
      await execAsync('git config user.name "Test"', { cwd: testDir });

      // Create and stage a file
      await writeFile(join(testDir, 'test.ts'), 'const x = 1;\n');
      await execAsync('git add test.ts', { cwd: testDir });

      const result = await getStagedFiles(testDir);
      expect(result).toContain('test.ts');
    });

    it('should return multiple staged files', async () => {
      // Initialize git repo
      await execAsync('git init', { cwd: testDir });
      await execAsync('git config user.email "test@test.com"', { cwd: testDir });
      await execAsync('git config user.name "Test"', { cwd: testDir });

      // Create and stage multiple files
      await writeFile(join(testDir, 'file1.ts'), 'const a = 1;\n');
      await writeFile(join(testDir, 'file2.ts'), 'const b = 2;\n');
      await execAsync('git add file1.ts file2.ts', { cwd: testDir });

      const result = await getStagedFiles(testDir);
      expect(result).toContain('file1.ts');
      expect(result).toContain('file2.ts');
      expect(result.length).toBe(2);
    });
  });

  describe('getModifiedFiles', () => {
    it('should return empty array for non-git directory', async () => {
      const result = await getModifiedFiles(testDir);
      expect(result).toEqual([]);
    });

    it('should return empty array when no files are modified', async () => {
      // Initialize git repo with a commit
      await execAsync('git init', { cwd: testDir });
      await execAsync('git config user.email "test@test.com"', { cwd: testDir });
      await execAsync('git config user.name "Test"', { cwd: testDir });
      await writeFile(join(testDir, 'README.md'), '# Test\n');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Initial"', { cwd: testDir });

      const result = await getModifiedFiles(testDir);
      expect(result).toEqual([]);
    });

    it('should return modified files', async () => {
      // Initialize git repo with a commit
      await execAsync('git init', { cwd: testDir });
      await execAsync('git config user.email "test@test.com"', { cwd: testDir });
      await execAsync('git config user.name "Test"', { cwd: testDir });
      await writeFile(join(testDir, 'file.ts'), 'original\n');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Initial"', { cwd: testDir });

      // Modify the file
      await writeFile(join(testDir, 'file.ts'), 'modified\n');

      const result = await getModifiedFiles(testDir);
      expect(result).toContain('file.ts');
    });
  });

  describe('getGitCommitHash', () => {
    it('should return null for non-git directory', () => {
      const result = getGitCommitHash(testDir);
      expect(result).toBeNull();
    });

    it('should return 40-char hex hash for git repo with commits', async () => {
      await execAsync('git init', { cwd: testDir });
      await execAsync('git config user.email "test@test.com"', { cwd: testDir });
      await execAsync('git config user.name "Test"', { cwd: testDir });
      await writeFile(join(testDir, 'README.md'), '# Test\n');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Initial commit"', { cwd: testDir });

      const result = getGitCommitHash(testDir);
      expect(result).toMatch(/^[a-f0-9]{40}$/);
    });
  });

  describe('getChangedFilesSinceCommit', () => {
    it('should return empty arrays for non-git directory', () => {
      const result = getChangedFilesSinceCommit(testDir, 'abc123');
      expect(result).toEqual({ added: [], modified: [], deleted: [] });
    });

    it('should return empty arrays for invalid commit hash', async () => {
      await execAsync('git init', { cwd: testDir });
      await execAsync('git config user.email "test@test.com"', { cwd: testDir });
      await execAsync('git config user.name "Test"', { cwd: testDir });
      await writeFile(join(testDir, 'README.md'), '# Test\n');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Initial"', { cwd: testDir });

      const result = getChangedFilesSinceCommit(testDir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
      expect(result).toEqual({ added: [], modified: [], deleted: [] });
    });

    it('should detect added files since a commit', async () => {
      await execAsync('git init', { cwd: testDir });
      await execAsync('git config user.email "test@test.com"', { cwd: testDir });
      await execAsync('git config user.name "Test"', { cwd: testDir });

      // Create initial commit
      await writeFile(join(testDir, 'existing.ts'), 'const x = 1;\n');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Initial"', { cwd: testDir });

      // Get the commit hash
      const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: testDir });
      const sinceCommit = hash.trim();

      // Add a new file
      await writeFile(join(testDir, 'new-file.ts'), 'const y = 2;\n');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Add new file"', { cwd: testDir });

      const result = getChangedFilesSinceCommit(testDir, sinceCommit);
      expect(result.added).toContain('new-file.ts');
    });

    it('should detect modified files since a commit', async () => {
      await execAsync('git init', { cwd: testDir });
      await execAsync('git config user.email "test@test.com"', { cwd: testDir });
      await execAsync('git config user.name "Test"', { cwd: testDir });

      // Create initial commit
      await writeFile(join(testDir, 'file.ts'), 'original\n');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Initial"', { cwd: testDir });

      const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: testDir });
      const sinceCommit = hash.trim();

      // Modify the file
      await writeFile(join(testDir, 'file.ts'), 'modified\n');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Modify file"', { cwd: testDir });

      const result = getChangedFilesSinceCommit(testDir, sinceCommit);
      expect(result.modified).toContain('file.ts');
    });

    it('should detect deleted files since a commit', async () => {
      await execAsync('git init', { cwd: testDir });
      await execAsync('git config user.email "test@test.com"', { cwd: testDir });
      await execAsync('git config user.name "Test"', { cwd: testDir });

      // Create initial commit with a file
      await writeFile(join(testDir, 'to-delete.ts'), 'will be deleted\n');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "Initial"', { cwd: testDir });

      const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: testDir });
      const sinceCommit = hash.trim();

      // Delete the file
      await execAsync('git rm to-delete.ts', { cwd: testDir });
      await execAsync('git commit -m "Delete file"', { cwd: testDir });

      const result = getChangedFilesSinceCommit(testDir, sinceCommit);
      expect(result.deleted).toContain('to-delete.ts');
    });
  });

  describe('toAbsolutePaths', () => {
    it('should convert relative paths to absolute', () => {
      const relativePaths = ['src/file1.ts', 'src/file2.ts'];
      const result = toAbsolutePaths('/project', relativePaths);

      expect(result).toEqual([
        '/project/src/file1.ts',
        '/project/src/file2.ts',
      ]);
    });

    it('should handle empty array', () => {
      const result = toAbsolutePaths('/project', []);
      expect(result).toEqual([]);
    });

    it('should handle paths with subdirectories', () => {
      const relativePaths = ['src/components/Button.tsx'];
      const result = toAbsolutePaths('/home/user/project', relativePaths);

      expect(result).toEqual(['/home/user/project/src/components/Button.tsx']);
    });
  });
});
