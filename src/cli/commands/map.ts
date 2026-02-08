/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * CLI command for querying the architecture map database.
 * Shows file relationships, imports, and entity mappings.
 */
import { Command } from 'commander';
import { getDbSync, getMeta } from '../../core/db/manager.js';
import { initializeSchema } from '../../core/db/schema.js';
import { FileRepository } from '../../core/db/repositories/files.js';
import { ImportRepository } from '../../core/db/repositories/imports.js';
import { EntityRepository } from '../../core/db/repositories/entities.js';
import { DatabaseScanner } from '../../core/db/scanner.js';
import {
  formatEntityResults,
  formatArchitectureResults,
  formatImportGraph,
  formatOverview,
  formatModuleContext,
  type ModuleContext,
} from '../../core/db/formatters.js';
import { logger } from '../../utils/logger.js';
import { getGitCommitHash } from '../../utils/git.js';

/**
 * Create the map command.
 */
export function createMapCommand(): Command {
  const command = new Command('map')
    .description('Query architecture map - file relationships, imports, and entities')
    .option('-e, --entity <name>', 'Find files related to an entity')
    .option('-a, --architecture <id>', 'List files in an architecture (use % for wildcard)')
    .option('-f, --file <path>', 'Get import graph for a file')
    .option('-m, --module <path>', 'Get full context for a module/directory (e.g., src/core/db/)')
    .option('-d, --depth <n>', 'Import traversal depth (default: 2)', '2')
    .option('--refresh', 'Force re-scan before query')
    .option('--full', 'Show verbose output (default is compact for LLM consumption)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        await runMap(options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return command;
}

/**
 * Run the map command.
 */
async function runMap(options: {
  entity?: string;
  architecture?: string;
  file?: string;
  module?: string;
  depth: string;
  refresh?: boolean;
  full?: boolean;
  json?: boolean;
}): Promise<void> {
  const projectRoot = process.cwd();

  // Get database connection
  const db = getDbSync(projectRoot);
  initializeSchema(db);

  // Create repositories
  const fileRepo = new FileRepository(db);
  const importRepo = new ImportRepository(db);
  const entityRepo = new EntityRepository(db);
  const scanner = new DatabaseScanner(db, projectRoot);

  // Refresh if requested or if database needs initial scan
  if (options.refresh || scanner.needsFullScan()) {
    console.log('Scanning project...');
    const scanStats = await scanner.fullScan();
    console.log(`Scanned ${scanStats.filesScanned} files (${scanStats.filesWithArch} with @arch tags)`);
    console.log('');
  } else {
    // Auto-sync if git commit changed (fast incremental update)
    const lastCommit = getMeta(db, 'last_git_commit');
    const currentCommit = getGitCommitHash(projectRoot);
    if (currentCommit && lastCommit !== currentCommit) {
      const syncStats = await scanner.incrementalSync();
      if (syncStats.incrementalUpdates > 0) {
        console.log(`Synced ${syncStats.incrementalUpdates} changed files`);
        console.log('');
      }
    }
  }

  const stats = scanner.getStats();
  const depth = parseInt(options.depth, 10);

  const full = options.full ?? false;

  // Handle entity query
  if (options.entity) {
    const files = entityRepo.getFilesForEntity(options.entity);
    if (options.json) {
      console.log(JSON.stringify({ entity: options.entity, files }, null, 2));
    } else {
      console.log(formatEntityResults(options.entity, files, { full }));
    }
    return;
  }

  // Handle architecture query
  if (options.architecture) {
    const isPattern = options.architecture.includes('%');
    const files = fileRepo.query(
      isPattern
        ? { archPattern: options.architecture }
        : { archId: options.architecture }
    );
    if (options.json) {
      console.log(JSON.stringify({
        architecture: options.architecture,
        files: files.map(f => ({ path: f.path, lineCount: f.lineCount })),
      }, null, 2));
    } else {
      console.log(formatArchitectureResults(
        options.architecture,
        files.map(f => ({ path: f.path, lineCount: f.lineCount })),
        { full }
      ));
    }
    return;
  }

  // Handle file query
  if (options.file) {
    const fileInfo = fileRepo.get(options.file);
    const graph = importRepo.getImportGraph(options.file);
    const transitiveImports = importRepo.getTransitiveImports(options.file, depth);
    const transitiveImporters = importRepo.getTransitiveImporters(options.file, depth);

    if (options.json) {
      console.log(JSON.stringify({
        file: options.file,
        archId: fileInfo?.archId,
        graph,
        transitiveImports,
        transitiveImporters,
      }, null, 2));
    } else {
      console.log(formatImportGraph(options.file, fileInfo, graph, transitiveImports, transitiveImporters, { full }));
    }
    return;
  }

  // Handle module query
  if (options.module) {
    const moduleContext = queryModuleContext(
      options.module,
      fileRepo,
      importRepo,
      entityRepo
    );
    if (options.json) {
      console.log(JSON.stringify(moduleContext, null, 2));
    } else {
      // Get available modules for error hints if no files found
      let availableModules: string[] | undefined;
      if (moduleContext.files.length === 0) {
        availableModules = getAvailableModules(fileRepo);
      }
      console.log(formatModuleContext(moduleContext, { full, availableModules }));
    }
    return;
  }

  // Default: show overview
  const summary = fileRepo.getArchitectureSummary();
  if (options.json) {
    console.log(JSON.stringify({
      totalFiles: stats.fileCount,
      importCount: stats.importCount,
      entityRefCount: stats.entityRefCount,
      lastScan: stats.lastScan,
      architectures: summary,
    }, null, 2));
  } else {
    console.log(formatOverview(summary, stats, { full }));
  }
}

/**
 * Determine the role of a file within a module based on its name and import patterns.
 */
function computeFileRole(
  filePath: string,
  internalImportsCount: number,
  internalImportedByCount: number
): { role: 'defines' | 'implements' | 'orchestrates'; reason: string } {
  const fileName = filePath.split('/').pop() ?? '';
  const fileNameLower = fileName.toLowerCase();

  // Pattern-based role detection (highest priority)
  if (fileNameLower.includes('types') || fileNameLower.endsWith('.types.ts')) {
    return { role: 'defines', reason: 'type definitions' };
  }
  if (fileNameLower === 'schema.ts' || fileNameLower.includes('schema')) {
    return { role: 'defines', reason: 'schema definitions' };
  }
  if (fileNameLower === 'index.ts') {
    return { role: 'defines', reason: 'barrel export' };
  }
  if (fileNameLower.includes('interface')) {
    return { role: 'defines', reason: 'interface definitions' };
  }

  // Import-pattern based role detection
  // Files imported by many but importing few are foundational
  if (internalImportedByCount >= 2 && internalImportsCount === 0) {
    return { role: 'defines', reason: 'foundational - imported by many' };
  }

  // Files importing many internal files are orchestrators
  if (internalImportsCount >= 3) {
    return { role: 'orchestrates', reason: 'coordinates multiple components' };
  }

  // Repository/service pattern detection
  if (fileNameLower.includes('repository') || filePath.includes('/repositories/')) {
    return { role: 'implements', reason: 'repository - data access' };
  }
  if (fileNameLower.includes('service')) {
    return { role: 'implements', reason: 'service - business logic' };
  }
  if (fileNameLower.includes('manager')) {
    return { role: 'implements', reason: 'manager - resource management' };
  }
  if (fileNameLower.includes('scanner') || fileNameLower.includes('processor')) {
    return { role: 'orchestrates', reason: 'processes data flow' };
  }
  if (fileNameLower.includes('formatter') || fileNameLower.includes('presenter')) {
    return { role: 'implements', reason: 'formats output' };
  }

  // Default based on import patterns
  if (internalImportsCount >= 2) {
    return { role: 'orchestrates', reason: 'uses multiple components' };
  }

  return { role: 'implements', reason: 'core logic' };
}

/**
 * Query full context for a module/directory.
 */
function queryModuleContext(
  modulePath: string,
  fileRepo: FileRepository,
  importRepo: ImportRepository,
  entityRepo: EntityRepository
): ModuleContext {
  // Normalize module path - ensure it ends with / for directory matching
  const normalizedPath = modulePath.endsWith('/') ? modulePath : modulePath + '/';
  const pathPattern = normalizedPath + '%';

  // Get all files in the module
  const files = fileRepo.query({ pathPattern });

  // Get file paths as a set for quick lookup
  const moduleFilePaths = new Set(files.map(f => f.path));

  // Collect internal imports and external dependencies
  const internalImports: Array<{ from: string; to: string }> = [];
  const externalDepsMap = new Map<string, string | null>();
  const externalConsumersMap = new Map<string, string | null>();

  // Track import statistics per file for role computation
  const internalImportsCount = new Map<string, number>();
  const internalImportedByCount = new Map<string, number>();
  const externalImportsCount = new Map<string, number>();

  // Track who imports each file (for impact analysis)
  const fileImportedBy = new Map<string, string[]>();

  for (const file of files) {
    internalImportsCount.set(file.path, 0);
    internalImportedByCount.set(file.path, 0);
    externalImportsCount.set(file.path, 0);
    fileImportedBy.set(file.path, []);
  }

  for (const file of files) {
    const graph = importRepo.getImportGraph(file.path);

    // Check each import
    for (const imp of graph.imports) {
      if (moduleFilePaths.has(imp.path)) {
        // Internal import
        internalImports.push({ from: file.path, to: imp.path });
        internalImportsCount.set(file.path, (internalImportsCount.get(file.path) ?? 0) + 1);
        internalImportedByCount.set(imp.path, (internalImportedByCount.get(imp.path) ?? 0) + 1);

        // Track for impact chain
        const importers = fileImportedBy.get(imp.path) ?? [];
        importers.push(file.path);
        fileImportedBy.set(imp.path, importers);
      } else {
        // External dependency
        externalDepsMap.set(imp.path, imp.archId);
        externalImportsCount.set(file.path, (externalImportsCount.get(file.path) ?? 0) + 1);
      }
    }

    // Check who imports this file from outside the module
    for (const imp of graph.importedBy) {
      if (!moduleFilePaths.has(imp.path)) {
        externalConsumersMap.set(imp.path, imp.archId);

        // External consumers also count as dependents for impact
        const importers = fileImportedBy.get(file.path) ?? [];
        importers.push(imp.path);
        fileImportedBy.set(file.path, importers);
      }
    }
  }

  // Get entity references for files in the module
  const entityCounts = new Map<string, number>();
  for (const file of files) {
    const refs = entityRepo.getEntitiesForFile(file.path);
    for (const ref of refs) {
      entityCounts.set(ref.entityName, (entityCounts.get(ref.entityName) ?? 0) + 1);
    }
  }

  // Compute roles and additional metadata for each file
  const filesWithRoles = files.map(f => {
    const { role, reason } = computeFileRole(
      f.path,
      internalImportsCount.get(f.path) ?? 0,
      internalImportedByCount.get(f.path) ?? 0
    );

    // Compute dependency direction
    const dependencies = {
      external: externalImportsCount.get(f.path) ?? 0,
      internal: internalImportsCount.get(f.path) ?? 0,
    };

    // Compute change impact
    const importers = fileImportedBy.get(f.path) ?? [];
    const impact = {
      directDependents: importers.length,
      impactChain: importers,
    };

    return {
      path: f.path,
      archId: f.archId,
      lineCount: f.lineCount,
      role,
      roleReason: reason,
      dependencies,
      impact,
    };
  });

  // Sort files by role order: defines -> implements -> orchestrates
  const roleOrder = { defines: 0, implements: 1, orchestrates: 2 };
  filesWithRoles.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  return {
    modulePath: normalizedPath,
    files: filesWithRoles,
    internalImports,
    externalDeps: Array.from(externalDepsMap.entries()).map(([path, archId]) => ({
      path,
      archId,
    })),
    externalConsumers: Array.from(externalConsumersMap.entries()).map(([path, archId]) => ({
      path,
      archId,
    })),
    entities: Array.from(entityCounts.entries()).map(([name, count]) => ({
      name,
      count,
    })),
    hasRoles: true,
  };
}

/**
 * Get available module paths from the database for error hints.
 */
function getAvailableModules(fileRepo: FileRepository): string[] {
  const allPaths = fileRepo.getAllPaths();
  const modulePaths = new Set<string>();

  for (const path of allPaths) {
    // Extract directory paths (not including the filename)
    const parts = path.split('/');
    // Only add if there's a directory component (not just a filename)
    if (parts.length >= 2) {
      // Add parent directories at various depths
      for (let depth = 2; depth <= Math.min(parts.length - 1, 4); depth++) {
        modulePaths.add(parts.slice(0, depth).join('/') + '/');
      }
    }
  }

  return Array.from(modulePaths).sort();
}
