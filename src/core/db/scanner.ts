/**
 * @arch archcodex.core.engine
 *
 * Database scanner - populates and syncs the database with file system.
 * Supports full scan and incremental git-based updates.
 *
 * Note: This file uses regex.exec() for pattern matching, not child_process.exec()
 */

import type Database from 'better-sqlite3';
import { stat } from 'fs/promises';
import { resolve, relative } from 'path';
import { globFiles, readFile } from '../../utils/file-system.js';
import { computeChecksum } from '../../utils/checksum.js';
import { extractArchId } from '../arch-tag/parser.js';
import { FileRepository } from './repositories/files.js';
import { ImportRepository } from './repositories/imports.js';
import { EntityRepository } from './repositories/entities.js';
import { getMeta, setMeta, transaction } from './manager.js';
import { getGitCommitHash, getChangedFilesSinceCommit } from '../../utils/git.js';

/** Default glob patterns for source files */
const DEFAULT_PATTERNS = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.js',
  'src/**/*.jsx',
  'convex/**/*.ts',
  'lib/**/*.ts',
];

/** Patterns to ignore */
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.spec.ts',
];

/**
 * Validate that an import path looks legitimate.
 * Filters out malformed paths that might be matched from strings/comments.
 */
function isValidImportPath(importPath: string): boolean {
  // Must start with . or /
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return false;
  }
  // No whitespace
  if (/\s/.test(importPath)) {
    return false;
  }
  // No obviously invalid characters
  if (/[<>:"|?*]/.test(importPath)) {
    return false;
  }
  // Reasonable length (paths over 500 chars are likely malformed)
  if (importPath.length > 500) {
    return false;
  }
  return true;
}

/**
 * Extract imports from file content using regex.
 * Fast but not 100% accurate - good enough for mapping.
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];

  // Match: import ... from '...'
  const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (isValidImportPath(importPath)) {
      imports.push(importPath);
    }
  }

  // Match: export ... from '...'
  const exportRegex = /export\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  while ((match = exportRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (isValidImportPath(importPath)) {
      imports.push(importPath);
    }
  }

  return [...new Set(imports)]; // Deduplicate
}

/** Valid ref types for entity references */
type RefType = 'type' | 'function' | 'variable' | 'import' | 'schema' | null;

/** Entity reference extracted from file content */
interface ExtractedEntityRef {
  entityName: string;
  refType: RefType;
  lineNumber: number;
}

/**
 * Extract entity references from file content.
 * Uses heuristics to find entity names.
 */
function extractEntityRefs(content: string): ExtractedEntityRef[] {
  const refs: ExtractedEntityRef[] = [];
  const lines = content.split('\n');

  // Common entity name patterns
  const patterns = [
    // Schema definitions: defineTable('todos', ...)
    { regex: /defineTable\s*\(\s*['"](\w+)['"]/g, type: 'schema' },
    // Type imports: import { Todo, User } from ...
    { regex: /import\s+\{([^}]+)\}/g, type: 'import' },
    // Function names: createTodo, getTodos, deleteTodo
    { regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, type: 'function' },
    // Const functions: const createTodo = ...
    { regex: /(?:export\s+)?const\s+(\w+)\s*=/g, type: 'function' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    for (const { regex, type } of patterns) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        if (type === 'import') {
          // Parse multiple imports from { A, B, C }
          const importNames = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
          for (const imp of importNames) {
            if (imp && /^[A-Z]/.test(imp)) { // Only PascalCase (likely types/entities)
              refs.push({ entityName: imp, refType: 'type', lineNumber });
            }
          }
        } else if (type === 'schema') {
          refs.push({ entityName: match[1], refType: 'schema', lineNumber });
        } else {
          // For functions, extract entity name from function name
          const funcName = match[1];
          const entityMatch = funcName.match(/^(?:create|get|delete|update|list|find|fetch|add|remove)(\w+)/i);
          if (entityMatch) {
            refs.push({ entityName: entityMatch[1], refType: 'function', lineNumber });
          }
        }
      }
    }
  }

  return refs;
}

/**
 * Resolve an import path to a file path.
 */
function resolveImportPath(fromFile: string, importPath: string, projectRoot: string): string | null {
  // Remove file extension from current file
  const fromDir = fromFile.replace(/\/[^/]+$/, '');

  // Strip .js extension from import (ESM convention: import from './foo.js' but file is foo.ts)
  const normalizedImport = importPath.replace(/\.js$/, '');

  // Resolve the import
  let resolved: string;
  if (normalizedImport.startsWith('.')) {
    resolved = resolve(projectRoot, fromDir, normalizedImport);
  } else {
    resolved = resolve(projectRoot, normalizedImport);
  }

  // Try common extensions (prioritize .ts over .js since source files are .ts)
  const extensions = ['.ts', '.tsx', '', '.js', '.jsx', '/index.ts', '/index.js'];
  for (const ext of extensions) {
    const withExt = resolved + ext;
    const relativePath = relative(projectRoot, withExt);
    // We'll check if this file exists in our database later
    if (!relativePath.startsWith('..') && !relativePath.includes('node_modules')) {
      return relativePath;
    }
  }

  return null;
}

/**
 * Scan result for a single file.
 */
interface FileScanResult {
  path: string;
  archId: string | null;
  checksum: string;
  mtime: number;
  lineCount: number;
  description: string | null;
  imports: string[];
  entityRefs: ExtractedEntityRef[];
}

/**
 * Scan a single file.
 */
async function scanFile(filePath: string, projectRoot: string): Promise<FileScanResult | null> {
  try {
    const absolutePath = resolve(projectRoot, filePath);
    const content = await readFile(absolutePath);
    const stats = await stat(absolutePath);

    const archId = extractArchId(content);
    const checksum = computeChecksum(content);
    const lineCount = content.split('\n').length;
    const rawImports = extractImports(content);
    const entityRefs = extractEntityRefs(content);

    // Resolve imports to file paths
    const imports: string[] = [];
    for (const imp of rawImports) {
      const resolved = resolveImportPath(filePath, imp, projectRoot);
      if (resolved) {
        imports.push(resolved);
      }
    }

    return {
      path: filePath,
      archId,
      checksum,
      mtime: Math.floor(stats.mtimeMs),
      lineCount,
      description: null,
      imports,
      entityRefs,
    };
  } catch {
    // File might not exist or be readable
    return null;
  }
}

/**
 * Scanner options.
 */
export interface ScanOptions {
  /** Glob patterns for files to include */
  patterns?: string[];
  /** Patterns to ignore */
  ignore?: string[];
  /** Maximum concurrent file reads */
  concurrency?: number;
}

/**
 * Scan result statistics.
 */
export interface ScanStats {
  /** Total files scanned */
  filesScanned: number;
  /** Files with @arch tags */
  filesWithArch: number;
  /** Total import relationships */
  importCount: number;
  /** Total entity references */
  entityRefCount: number;
  /** Time taken in milliseconds */
  durationMs: number;
}

/**
 * Database scanner for populating and syncing file data.
 */
export class DatabaseScanner {
  private readonly fileRepo: FileRepository;
  private readonly importRepo: ImportRepository;
  private readonly entityRepo: EntityRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly projectRoot: string
  ) {
    this.fileRepo = new FileRepository(db);
    this.importRepo = new ImportRepository(db);
    this.entityRepo = new EntityRepository(db);
  }

  /**
   * Perform a full scan of the project.
   * Clears existing data and repopulates from scratch.
   */
  async fullScan(options: ScanOptions = {}): Promise<ScanStats> {
    const startTime = Date.now();
    const patterns = options.patterns ?? DEFAULT_PATTERNS;
    const ignore = options.ignore ?? IGNORE_PATTERNS;

    // Find all files
    const files = await globFiles(patterns, {
      cwd: this.projectRoot,
      ignore,
      absolute: false,
    });

    // Scan all files
    const scanResults: FileScanResult[] = [];
    const concurrency = options.concurrency ?? 50;

    // Process in batches for better performance
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(file => scanFile(file, this.projectRoot))
      );
      for (const result of results) {
        if (result) {
          scanResults.push(result);
        }
      }
    }

    // Update database in a transaction
    transaction(this.db, () => {
      // Clear existing data
      this.entityRepo.deleteMany();
      this.importRepo.deleteMany();
      this.fileRepo.deleteMany();

      // Insert files
      this.fileRepo.upsertMany(
        scanResults.map(r => ({
          path: r.path,
          archId: r.archId,
          checksum: r.checksum,
          mtime: r.mtime,
          lineCount: r.lineCount,
          description: r.description,
        }))
      );

      // Build set of known files for import resolution
      const knownFiles = new Set(scanResults.map(r => r.path));

      // Insert imports (only for known files)
      const imports: Array<{ fromFile: string; toFile: string }> = [];
      for (const result of scanResults) {
        for (const imp of result.imports) {
          // Check if imported file exists (with various extensions)
          const possiblePaths = [imp, `${imp}.ts`, `${imp}.tsx`, `${imp}/index.ts`];
          const resolvedImp = possiblePaths.find(p => knownFiles.has(p));
          if (resolvedImp) {
            imports.push({ fromFile: result.path, toFile: resolvedImp });
          }
        }
      }
      this.importRepo.addMany(imports);

      // Insert entity references
      for (const result of scanResults) {
        if (result.entityRefs.length > 0) {
          this.entityRepo.replaceForFile(result.path, result.entityRefs);
        }
      }

      // Update metadata
      setMeta(this.db, 'last_full_scan', new Date().toISOString());

      // Try to get git commit for incremental sync
      try {
        const gitCommit = getGitCommitHash(this.projectRoot);
        if (gitCommit) {
          setMeta(this.db, 'last_git_commit', gitCommit);
        }
      } catch {
        // Not a git repo or git not available
      }
    });

    const durationMs = Date.now() - startTime;

    return {
      filesScanned: scanResults.length,
      filesWithArch: scanResults.filter(r => r.archId !== null).length,
      importCount: this.importRepo.count(),
      entityRefCount: this.entityRepo.count(),
      durationMs,
    };
  }

  /**
   * Perform an incremental sync using git diff.
   * Only re-scans files that changed since last sync.
   */
  async incrementalSync(options: ScanOptions = {}): Promise<ScanStats & { incrementalUpdates: number }> {
    const startTime = Date.now();
    const lastCommit = getMeta(this.db, 'last_git_commit');
    const currentCommit = getGitCommitHash(this.projectRoot);

    // If no previous commit or not a git repo, do full scan
    if (!lastCommit || !currentCommit) {
      const stats = await this.fullScan(options);
      return { ...stats, incrementalUpdates: stats.filesScanned };
    }

    // If same commit, nothing to do
    if (lastCommit === currentCommit) {
      return {
        filesScanned: 0,
        filesWithArch: 0,
        importCount: this.importRepo.count(),
        entityRefCount: this.entityRepo.count(),
        durationMs: Date.now() - startTime,
        incrementalUpdates: 0,
      };
    }

    // Get changed files
    const changedFiles = getChangedFilesSinceCommit(this.projectRoot, lastCommit);
    const patterns = options.patterns ?? DEFAULT_PATTERNS;
    const ignore = options.ignore ?? IGNORE_PATTERNS;

    // Filter to only files matching our patterns
    const allFiles = await globFiles(patterns, {
      cwd: this.projectRoot,
      ignore,
      absolute: false,
    });
    const allFilesSet = new Set(allFiles);

    const filesToUpdate = changedFiles.modified.filter((f: string) => allFilesSet.has(f));
    const filesToAdd = changedFiles.added.filter((f: string) => allFilesSet.has(f));
    const filesToDelete = changedFiles.deleted.filter((f: string) => this.fileRepo.exists(f));

    // Scan changed and new files
    const scanResults: FileScanResult[] = [];
    const filesToScan = [...filesToUpdate, ...filesToAdd];

    for (const file of filesToScan) {
      const result = await scanFile(file, this.projectRoot);
      if (result) {
        scanResults.push(result);
      }
    }

    // Update database in a transaction
    transaction(this.db, () => {
      // Delete removed files
      if (filesToDelete.length > 0) {
        this.fileRepo.deleteMany(filesToDelete);
      }

      // Update/insert scanned files
      for (const result of scanResults) {
        this.fileRepo.upsert({
          path: result.path,
          archId: result.archId,
          checksum: result.checksum,
          mtime: result.mtime,
          lineCount: result.lineCount,
          description: result.description,
        });

        // Update imports
        const knownFiles = new Set(this.fileRepo.getAllPaths());
        const validImports = result.imports.filter(imp => {
          const possiblePaths = [imp, `${imp}.ts`, `${imp}.tsx`, `${imp}/index.ts`];
          return possiblePaths.some(p => knownFiles.has(p));
        });
        this.importRepo.replaceForFile(result.path, validImports);

        // Update entity refs
        this.entityRepo.replaceForFile(result.path, result.entityRefs);
      }

      // Update git commit
      setMeta(this.db, 'last_git_commit', currentCommit);
    });

    const durationMs = Date.now() - startTime;

    return {
      filesScanned: scanResults.length,
      filesWithArch: scanResults.filter(r => r.archId !== null).length,
      importCount: this.importRepo.count(),
      entityRefCount: this.entityRepo.count(),
      durationMs,
      incrementalUpdates: filesToUpdate.length + filesToAdd.length + filesToDelete.length,
    };
  }

  /**
   * Sync a single file.
   */
  async syncFile(filePath: string): Promise<boolean> {
    const result = await scanFile(filePath, this.projectRoot);

    if (!result) {
      // File doesn't exist or can't be read - delete from database
      return this.fileRepo.delete(filePath);
    }

    transaction(this.db, () => {
      this.fileRepo.upsert({
        path: result.path,
        archId: result.archId,
        checksum: result.checksum,
        mtime: result.mtime,
        lineCount: result.lineCount,
        description: result.description,
      });

      const knownFiles = new Set(this.fileRepo.getAllPaths());
      const validImports = result.imports.filter(imp => {
        const possiblePaths = [imp, `${imp}.ts`, `${imp}.tsx`, `${imp}/index.ts`];
        return possiblePaths.some(p => knownFiles.has(p));
      });
      this.importRepo.replaceForFile(result.path, validImports);
      this.entityRepo.replaceForFile(result.path, result.entityRefs);
    });

    return true;
  }

  /**
   * Check if database needs a full scan.
   */
  needsFullScan(): boolean {
    const lastScan = getMeta(this.db, 'last_full_scan');
    return lastScan === null;
  }

  /**
   * Get scan statistics.
   */
  getStats(): { fileCount: number; importCount: number; entityRefCount: number; lastScan: string | null } {
    return {
      fileCount: this.fileRepo.count(),
      importCount: this.importRepo.count(),
      entityRefCount: this.entityRepo.count(),
      lastScan: getMeta(this.db, 'last_full_scan'),
    };
  }

  /**
   * Dispose resources.
   * Note: Database connection is managed by manager.ts, not this class.
   */
  dispose(): void {
    // Repositories are stateless wrappers; db lifecycle is managed by manager.ts
  }
}
