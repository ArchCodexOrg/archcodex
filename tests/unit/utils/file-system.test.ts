/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for file system utilities.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readFile,
  readFileSync,
  writeFile,
  fileExists,
  fileExistsSync,
  isDirectory,
  directoryExists,
  ensureDir,
  globFiles,
  realPath,
  realPathSync,
  resolvePath,
  relativePath,
  dirname,
  basename,
  extname,
  joinPath,
  normalizePath,
  isAbsolute,
  getStats,
  countLines,
} from '../../../src/utils/file-system.js';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync as fsReadFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('file-system utilities', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `archcodex-fs-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readFile / readFileSync', () => {
    it('should read file asynchronously', async () => {
      const filePath = join(tempDir, 'test.txt');
      writeFileSync(filePath, 'Hello, World!');

      const content = await readFile(filePath);

      expect(content).toBe('Hello, World!');
    });

    it('should read file synchronously', () => {
      const filePath = join(tempDir, 'test.txt');
      writeFileSync(filePath, 'Hello, Sync!');

      const content = readFileSync(filePath);

      expect(content).toBe('Hello, Sync!');
    });

    it('should throw for non-existent file', async () => {
      await expect(readFile(join(tempDir, 'nonexistent.txt'))).rejects.toThrow();
    });
  });

  describe('writeFile', () => {
    it('should write file', async () => {
      const filePath = join(tempDir, 'output.txt');

      await writeFile(filePath, 'Written content');

      expect(fsReadFileSync(filePath, 'utf-8')).toBe('Written content');
    });

    it('should create parent directories if needed', async () => {
      const filePath = join(tempDir, 'nested', 'dir', 'file.txt');

      await writeFile(filePath, 'Nested content');

      expect(fsReadFileSync(filePath, 'utf-8')).toBe('Nested content');
    });
  });

  describe('fileExists / fileExistsSync', () => {
    it('should return true for existing file', async () => {
      const filePath = join(tempDir, 'exists.txt');
      writeFileSync(filePath, 'content');

      expect(await fileExists(filePath)).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      expect(await fileExists(join(tempDir, 'nonexistent.txt'))).toBe(false);
    });

    it('should check file existence synchronously', () => {
      const filePath = join(tempDir, 'sync-exists.txt');
      writeFileSync(filePath, 'content');

      expect(fileExistsSync(filePath)).toBe(true);
      expect(fileExistsSync(join(tempDir, 'nope.txt'))).toBe(false);
    });
  });

  describe('isDirectory / directoryExists', () => {
    it('should return true for directory', async () => {
      const dirPath = join(tempDir, 'subdir');
      mkdirSync(dirPath);

      expect(await isDirectory(dirPath)).toBe(true);
    });

    it('should return false for file', async () => {
      const filePath = join(tempDir, 'file.txt');
      writeFileSync(filePath, 'content');

      expect(await isDirectory(filePath)).toBe(false);
    });

    it('should return false for non-existent path', async () => {
      expect(await isDirectory(join(tempDir, 'nonexistent'))).toBe(false);
    });

    it('directoryExists should be alias for isDirectory', async () => {
      const dirPath = join(tempDir, 'dir');
      mkdirSync(dirPath);

      expect(await directoryExists(dirPath)).toBe(true);
      expect(await directoryExists(join(tempDir, 'nope'))).toBe(false);
    });
  });

  describe('ensureDir', () => {
    it('should create directory if not exists', async () => {
      const dirPath = join(tempDir, 'new-dir');

      await ensureDir(dirPath);

      expect(existsSync(dirPath)).toBe(true);
    });

    it('should create nested directories', async () => {
      const dirPath = join(tempDir, 'a', 'b', 'c');

      await ensureDir(dirPath);

      expect(existsSync(dirPath)).toBe(true);
    });

    it('should not throw for existing directory', async () => {
      const dirPath = join(tempDir, 'existing');
      mkdirSync(dirPath);

      await expect(ensureDir(dirPath)).resolves.toBeUndefined();
    });
  });

  describe('globFiles', () => {
    it('should find files matching pattern', async () => {
      const srcDir = join(tempDir, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'a.ts'), '');
      writeFileSync(join(srcDir, 'b.ts'), '');
      writeFileSync(join(srcDir, 'c.js'), '');

      const tsFiles = await globFiles(['**/*.ts'], { cwd: tempDir });

      expect(tsFiles).toHaveLength(2);
      expect(tsFiles.some(f => f.endsWith('a.ts'))).toBe(true);
      expect(tsFiles.some(f => f.endsWith('b.ts'))).toBe(true);
    });

    it('should respect ignore patterns', async () => {
      const nodeModules = join(tempDir, 'node_modules', 'pkg');
      const srcDir = join(tempDir, 'src');
      mkdirSync(nodeModules, { recursive: true });
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(nodeModules, 'index.ts'), '');
      writeFileSync(join(srcDir, 'app.ts'), '');

      const files = await globFiles(['**/*.ts'], { cwd: tempDir });

      // Should not include node_modules by default
      expect(files.some(f => f.includes('node_modules'))).toBe(false);
      expect(files.some(f => f.endsWith('app.ts'))).toBe(true);
    });

    it('should return absolute paths by default', async () => {
      writeFileSync(join(tempDir, 'test.ts'), '');

      const files = await globFiles(['*.ts'], { cwd: tempDir });

      expect(files.every(f => f.startsWith('/'))).toBe(true);
    });
  });

  describe('realPath / realPathSync', () => {
    it('should return real path asynchronously', async () => {
      const filePath = join(tempDir, 'real.txt');
      writeFileSync(filePath, '');

      const real = await realPath(filePath);

      expect(real).toContain('real.txt');
    });

    it('should return real path synchronously', () => {
      const filePath = join(tempDir, 'real-sync.txt');
      writeFileSync(filePath, '');

      const real = realPathSync(filePath);

      expect(real).toContain('real-sync.txt');
    });
  });

  describe('path utilities', () => {
    it('resolvePath should resolve paths', () => {
      const result = resolvePath('/base', 'sub', 'file.txt');

      expect(result).toBe('/base/sub/file.txt');
    });

    it('relativePath should get relative path', () => {
      const result = relativePath('/a/b', '/a/b/c/d');

      expect(result).toBe('c/d');
    });

    it('dirname should get directory name', () => {
      expect(dirname('/path/to/file.txt')).toBe('/path/to');
    });

    it('basename should get base name', () => {
      expect(basename('/path/to/file.txt')).toBe('file.txt');
      expect(basename('/path/to/file.txt', '.txt')).toBe('file');
    });

    it('extname should get extension', () => {
      expect(extname('/path/to/file.txt')).toBe('.txt');
      expect(extname('/path/to/file')).toBe('');
    });

    it('joinPath should join paths', () => {
      expect(joinPath('a', 'b', 'c')).toBe('a/b/c');
    });

    it('normalizePath should normalize paths', () => {
      expect(normalizePath('/a/b/../c')).toBe('/a/c');
    });

    it('isAbsolute should check if path is absolute', () => {
      expect(isAbsolute('/absolute/path')).toBe(true);
      expect(isAbsolute('relative/path')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should get file stats', async () => {
      const filePath = join(tempDir, 'stats.txt');
      writeFileSync(filePath, 'content');

      const stats = await getStats(filePath);

      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
    });

    it('should get directory stats', async () => {
      const stats = await getStats(tempDir);

      expect(stats.isDirectory()).toBe(true);
      expect(stats.isFile()).toBe(false);
    });
  });

  describe('countLines', () => {
    it('should count lines in a file', async () => {
      const filePath = join(tempDir, 'lines.txt');
      writeFileSync(filePath, 'line1\nline2\nline3');

      const lines = await countLines(filePath);

      expect(lines).toBe(3);
    });

    it('should return 1 for empty file', async () => {
      const filePath = join(tempDir, 'empty.txt');
      writeFileSync(filePath, '');

      const lines = await countLines(filePath);

      expect(lines).toBe(1); // Empty string split by \n returns ['']
    });
  });
});
