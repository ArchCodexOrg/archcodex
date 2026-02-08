/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Helper functions for unified context synthesizer.
 * Split from synthesizer.ts for file size compliance.
 */

import type {
  UnifiedFileInfo,
  InlineEntitySchema,
  LayerBoundary,
  ArchConstraints,
  FileRole,
  ProjectRules,
  LayerHierarchyEntry,
  SharedConstraints,
  SubmoduleInfo,
} from './types.js';
import type { ModuleContext } from '../db/formatters.js';
import type { FileRepository } from '../db/repositories/files.js';
import type { ImportRepository } from '../db/repositories/imports.js';
import { resolveArchitecture } from '../registry/resolver.js';
import { loadConfig } from '../config/loader.js';
import { loadRegistry } from '../registry/loader.js';
import { buildArchitectureSummary } from '../session/context.js';
import { shortRelType } from './formatter-entity.js';

/**
 * Get top submodules by file count for interactive menus.
 */
export function getTopSubmodules(modulePath: string, fileRepo: FileRepository): SubmoduleInfo[] {
  const normalizedPath = modulePath.endsWith('/') ? modulePath : modulePath + '/';
  const pathPattern = normalizedPath + '%';

  const files = fileRepo.query({ pathPattern });

  const submoduleCounts = new Map<string, { count: number; archs: Map<string, number> }>();

  for (const file of files) {
    const relativePath = file.path.slice(normalizedPath.length);
    const firstSlash = relativePath.indexOf('/');
    if (firstSlash > 0) {
      const submodule = normalizedPath + relativePath.slice(0, firstSlash + 1);
      const existing = submoduleCounts.get(submodule) ?? { count: 0, archs: new Map() };
      existing.count++;
      if (file.archId) {
        existing.archs.set(file.archId, (existing.archs.get(file.archId) ?? 0) + 1);
      }
      submoduleCounts.set(submodule, existing);
    }
  }

  return Array.from(submoduleCounts.entries())
    .map(([path, data]) => {
      let dominantArch: string | undefined;
      let maxCount = 0;
      for (const [arch, count] of data.archs) {
        if (count > maxCount) {
          dominantArch = arch;
          maxCount = count;
        }
      }
      return { path, fileCount: data.count, dominantArch };
    })
    .sort((a, b) => b.fileCount - a.fileCount)
    .slice(0, 5);
}

/**
 * Compute file role based on name patterns and import structure.
 */
export function computeFileRole(
  filePath: string,
  internalImportsCount: number,
  internalImportedByCount: number
): { role: FileRole; reason: string } {
  const fileName = filePath.split('/').pop() ?? '';
  const fileNameLower = fileName.toLowerCase();

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

  if (internalImportedByCount >= 2 && internalImportsCount === 0) {
    return { role: 'defines', reason: 'foundational' };
  }
  if (internalImportsCount >= 3) {
    return { role: 'orchestrates', reason: 'coordinates components' };
  }

  if (fileNameLower.includes('repository') || filePath.includes('/repositories/')) {
    return { role: 'implements', reason: 'data access' };
  }
  if (fileNameLower.includes('service')) {
    return { role: 'implements', reason: 'business logic' };
  }
  if (fileNameLower.includes('manager')) {
    return { role: 'implements', reason: 'resource management' };
  }
  if (fileNameLower.includes('scanner') || fileNameLower.includes('processor')) {
    return { role: 'orchestrates', reason: 'data processing' };
  }
  if (fileNameLower.includes('formatter') || fileNameLower.includes('presenter')) {
    return { role: 'implements', reason: 'output formatting' };
  }

  if (internalImportsCount >= 2) {
    return { role: 'orchestrates', reason: 'uses multiple components' };
  }

  return { role: 'implements', reason: 'core logic' };
}

/**
 * Convert ModuleContext files to unified format grouped by role.
 */
export function convertToUnifiedFiles(moduleContext: ModuleContext): {
  defines: UnifiedFileInfo[];
  implements: UnifiedFileInfo[];
  orchestrates: UnifiedFileInfo[];
} {
  const result: {
    defines: UnifiedFileInfo[];
    implements: UnifiedFileInfo[];
    orchestrates: UnifiedFileInfo[];
  } = {
    defines: [],
    implements: [],
    orchestrates: [],
  };

  for (const file of moduleContext.files) {
    const role = file.role ?? 'implements';
    const shortPath = file.path.replace(moduleContext.modulePath, '');

    const unifiedFile: UnifiedFileInfo = {
      path: shortPath,
      archId: file.archId,
      role: role as FileRole,
      roleReason: file.roleReason ?? 'unknown',
      breaks: file.impact?.directDependents ?? 0,
    };

    result[role as FileRole].push(unifiedFile);
  }

  return result;
}

/**
 * Fetch entity schemas for a list of entity names.
 */
export async function fetchEntitySchemas(
  projectRoot: string,
  entityNames: string[]
): Promise<InlineEntitySchema[]> {
  const MAX_ENTITIES = 10;
  const limitedNames = entityNames.slice(0, MAX_ENTITIES);

  if (limitedNames.length === 0) {
    return [];
  }

  const { getEntitySchemasBatch } = await import('../context/batch.js');

  try {
    const batchResult = await getEntitySchemasBatch(projectRoot, limitedNames);

    return batchResult.map(entity => ({
      name: entity.name,
      fields: entity.fields
        .filter(f => !f.name.startsWith('_'))
        .map(f => f.optional ? `${f.name}?` : f.name),
      relationships: entity.relationships.length > 0
        ? entity.relationships.map(r => `${shortRelType(r.type)} ${r.target}${r.field ? ` via ${r.field}` : ''}`)
        : undefined,
      behaviors: entity.behaviors.length > 0
        ? entity.behaviors.map(b => b.type)
        : undefined,
      operations: entity.operations,
    } as InlineEntitySchema));
  } catch { /* schema extraction or entity parsing failed */
    return [];
  }
}

/**
 * Get layer boundaries for a module using real config.
 */
export async function getLayerBoundaries(
  _projectRoot: string,
  moduleContext: ModuleContext,
  config: Awaited<ReturnType<typeof loadConfig>>,
  fileRepo?: FileRepository
): Promise<LayerBoundary | undefined> {
  const archIds = moduleContext.files
    .map(f => f.archId)
    .filter((id): id is string => id !== null);

  if (archIds.length === 0) {
    return undefined;
  }

  const layerCounts = new Map<string, number>();
  for (const archId of archIds) {
    const parts = archId.split('.');
    if (parts.length >= 2) {
      const layer = parts[1];
      layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
    }
  }

  if (layerCounts.size === 0) {
    return undefined;
  }

  let dominantLayer = '';
  let maxCount = 0;
  for (const [layer, count] of layerCounts) {
    if (count > maxCount) {
      dominantLayer = layer;
      maxCount = count;
    }
  }

  const layers = config.layers ?? [];
  const layerConfig = layers.find(l => l.name === dominantLayer);

  if (!layerConfig) {
    return undefined;
  }

  const allLayerNames = layers.map(l => l.name);
  const canImport = layerConfig.can_import ?? [];
  const cannotImport = allLayerNames.filter(
    name => name !== dominantLayer && !canImport.includes(name)
  );

  const commonImports = fileRepo
    ? findCommonImports(moduleContext, canImport, fileRepo)
    : undefined;

  return {
    layer: dominantLayer,
    canImport,
    cannotImport,
    commonImports,
  };
}

/**
 * Find common imports from external dependencies grouped by layer.
 */
function findCommonImports(
  moduleContext: ModuleContext,
  allowedLayers: string[],
  _fileRepo: FileRepository
): Array<{ layer: string; path: string; exports: string[] }> {
  const importCounts = new Map<string, number>();
  for (const dep of moduleContext.externalDeps) {
    if (dep.path.startsWith('src/')) {
      importCounts.set(dep.path, (importCounts.get(dep.path) ?? 0) + 1);
    }
  }

  const layerImports = new Map<string, Array<{ path: string; count: number }>>();

  for (const [path, count] of importCounts) {
    const pathParts = path.split('/');
    if (pathParts.length >= 2) {
      const layer = pathParts[1];
      if (allowedLayers.includes(layer)) {
        const existing = layerImports.get(layer) ?? [];
        existing.push({ path, count });
        layerImports.set(layer, existing);
      }
    }
  }

  const result: Array<{ layer: string; path: string; exports: string[] }> = [];
  for (const [layer, imports] of layerImports) {
    imports.sort((a, b) => b.count - a.count);
    const top = imports[0];
    if (top && top.count >= 2) {
      const fileName = top.path.split('/').pop()?.replace(/\.(ts|js)$/, '') ?? '';
      const exportName = fileName === 'index' ? '*' : fileName;
      result.push({
        layer,
        path: top.path,
        exports: [exportName],
      });
    }
  }

  return result.length > 0 ? result : [];
}

/**
 * Get ArchCodex constraints for a module (with patterns and all hints).
 */
export async function getArchConstraints(
  _projectRoot: string,
  moduleContext: ModuleContext,
  registry: Awaited<ReturnType<typeof loadRegistry>>
): Promise<ArchConstraints> {
  const archCounts = new Map<string, number>();
  for (const file of moduleContext.files) {
    if (file.archId) {
      archCounts.set(file.archId, (archCounts.get(file.archId) ?? 0) + 1);
    }
  }

  let dominantArch = '(untagged)';
  let maxCount = 0;
  for (const [arch, count] of archCounts) {
    if (count > maxCount) {
      dominantArch = arch;
      maxCount = count;
    }
  }

  try {
    const result = resolveArchitecture(registry, dominantArch);

    if (result) {
      const arch = result.architecture;

      const forbidImports = arch.constraints
        .filter(c => c.rule === 'forbid_import' || c.rule === 'forbid_call')
        .flatMap(c => Array.isArray(c.value) ? c.value : [c.value])
        .map(v => String(v));

      const forbidPatterns = arch.constraints
        .filter(c => c.rule === 'forbid_pattern')
        .flatMap(c => Array.isArray(c.value) ? c.value : [c.value])
        .map(v => String(v));

      const requireImports = arch.constraints
        .filter(c => c.rule === 'require_import' || c.rule === 'require_decorator')
        .flatMap(c => Array.isArray(c.value) ? c.value : [c.value])
        .map(v => String(v));

      const hints = arch.hints.map(h => typeof h === 'string' ? h : h.text);

      return {
        architecture: dominantArch,
        forbid: forbidImports.length > 0 ? [...new Set(forbidImports)] : undefined,
        patterns: forbidPatterns.length > 0 ? [...new Set(forbidPatterns)] : undefined,
        require: requireImports.length > 0 ? [...new Set(requireImports)] : undefined,
        hints: hints.length > 0 ? hints : undefined,
      };
    }
  } catch { /* registry not available or architecture not found */
    // Registry not available
  }

  return {
    architecture: dominantArch,
  };
}

/**
 * Build project rules (layer hierarchy + shared constraints).
 */
export async function buildProjectRules(
  _projectRoot: string,
  moduleContext: ModuleContext,
  config: Awaited<ReturnType<typeof loadConfig>>,
  registry: Awaited<ReturnType<typeof loadRegistry>>
): Promise<ProjectRules | undefined> {
  const layers: LayerHierarchyEntry[] = (config.layers ?? []).map(l => ({
    name: l.name,
    canImport: l.can_import ?? [],
  }));

  if (layers.length === 0) {
    return undefined;
  }

  const archIds = new Set(
    moduleContext.files
      .map(f => f.archId)
      .filter((id): id is string => id !== null)
  );

  const summaries = [...archIds].map(archId =>
    buildArchitectureSummary(archId, [], registry)
  );

  const shared = findSharedConstraints(summaries);

  return {
    layers,
    shared: hasSharedConstraints(shared) ? shared : undefined,
  };
}

/**
 * Convert entity file references to unified format with computed roles.
 */
export function convertEntityFilesToUnified(
  entityFiles: Array<{ path: string; archId: string | null; refType: string | null; lineNumber: number | null }>,
  _fileRepo: FileRepository,
  importRepo: ImportRepository
): {
  defines: UnifiedFileInfo[];
  implements: UnifiedFileInfo[];
  orchestrates: UnifiedFileInfo[];
} {
  const result: {
    defines: UnifiedFileInfo[];
    implements: UnifiedFileInfo[];
    orchestrates: UnifiedFileInfo[];
  } = {
    defines: [],
    implements: [],
    orchestrates: [],
  };

  for (const file of entityFiles) {
    const graph = importRepo.getImportGraph(file.path);
    const { role, reason } = computeFileRole(
      file.path,
      graph.imports.length,
      graph.importedBy.length
    );

    const unifiedFile: UnifiedFileInfo = {
      path: file.path,
      archId: file.archId,
      role,
      roleReason: reason,
      breaks: graph.importedBy.length,
    };

    result[role].push(unifiedFile);
  }

  return result;
}

/**
 * Find constraints shared by ALL architectures.
 */
function findSharedConstraints(
  summaries: ReturnType<typeof buildArchitectureSummary>[]
): SharedConstraints {
  if (summaries.length === 0) {
    return {};
  }

  const sharedForbid = findValuesInAll(summaries.map(s => s.forbid));
  const sharedPatterns = findValuesInAll(summaries.map(s => s.patterns));
  const sharedHints = findValuesInAll(summaries.map(s => s.hints));

  return {
    forbid: sharedForbid.length > 0 ? sharedForbid : undefined,
    patterns: sharedPatterns.length > 0 ? sharedPatterns : undefined,
    hints: sharedHints.length > 0 ? sharedHints : undefined,
  };
}

/**
 * Find values present in ALL arrays.
 */
function findValuesInAll(arrays: string[][]): string[] {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return [...arrays[0]];

  const first = new Set(arrays[0]);
  return [...first].filter(v => arrays.every(arr => arr.includes(v)));
}

/**
 * Check if shared constraints has any values.
 */
function hasSharedConstraints(shared: SharedConstraints): boolean {
  return Boolean(shared.forbid?.length || shared.patterns?.length || shared.hints?.length);
}
