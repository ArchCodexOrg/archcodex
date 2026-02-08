/**
 * @arch archcodex.test.unit
 *
 * Tests for synthesizer-helpers — helper functions extracted from synthesizer.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock heavy dependencies
vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(() => null),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(async () => ({
    version: '1.0',
    nodes: {},
    mixins: {},
    architectures: [],
    config: {},
  })),
}));

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn(async () => ({
    layers: [],
    shared: {},
  })),
}));

vi.mock('../../../../src/core/session/context.js', () => ({
  buildArchitectureSummary: vi.fn(() => ({
    forbid: [],
    patterns: [],
    hints: [],
  })),
}));

vi.mock('../../../../src/core/context/batch.js', () => ({
  getEntitySchemasBatch: vi.fn(async () => []),
}));

import {
  computeFileRole,
  convertToUnifiedFiles,
  getTopSubmodules,
  fetchEntitySchemas,
  getLayerBoundaries,
  getArchConstraints,
  buildProjectRules,
  convertEntityFilesToUnified,
} from '../../../../src/core/unified-context/synthesizer-helpers.js';
import { resolveArchitecture } from '../../../../src/core/registry/resolver.js';
import { buildArchitectureSummary } from '../../../../src/core/session/context.js';
import { getEntitySchemasBatch } from '../../../../src/core/context/batch.js';
import type { ModuleContext } from '../../../../src/core/db/formatters.js';

// ---------------------------------------------------------------------------
// computeFileRole
// ---------------------------------------------------------------------------

describe('computeFileRole', () => {
  it('assigns defines role to type files', () => {
    expect(computeFileRole('src/types.ts', 0, 0).role).toBe('defines');
    expect(computeFileRole('src/user.types.ts', 0, 0).role).toBe('defines');
  });

  it('assigns defines role to schema files', () => {
    expect(computeFileRole('src/schema.ts', 0, 0).role).toBe('defines');
  });

  it('assigns defines role to index.ts (barrel)', () => {
    expect(computeFileRole('src/index.ts', 0, 0).role).toBe('defines');
  });

  it('assigns defines role to interface files', () => {
    expect(computeFileRole('src/interface.ts', 0, 0).role).toBe('defines');
  });

  it('assigns defines role to foundational files (imported by many, imports none)', () => {
    const result = computeFileRole('src/constants.ts', 0, 3);
    expect(result.role).toBe('defines');
    expect(result.reason).toBe('foundational');
  });

  it('does not assign foundational role when importedBy count is 1', () => {
    const result = computeFileRole('src/constants.ts', 0, 1);
    expect(result.role).not.toBe('defines');
  });

  it('assigns orchestrates role to files with 3+ internal imports', () => {
    const result = computeFileRole('src/controller.ts', 3, 0);
    expect(result.role).toBe('orchestrates');
    expect(result.reason).toBe('coordinates components');
  });

  it('assigns implements role to repository files', () => {
    expect(computeFileRole('src/repositories/user.ts', 0, 0).role).toBe('implements');
    expect(computeFileRole('src/userRepository.ts', 0, 0).role).toBe('implements');
  });

  it('assigns implements role to service files', () => {
    expect(computeFileRole('src/userService.ts', 0, 0).role).toBe('implements');
    expect(computeFileRole('src/userService.ts', 0, 0).reason).toBe('business logic');
  });

  it('assigns implements role to manager files', () => {
    expect(computeFileRole('src/cacheManager.ts', 0, 0).role).toBe('implements');
    expect(computeFileRole('src/cacheManager.ts', 0, 0).reason).toBe('resource management');
  });

  it('assigns orchestrates role to scanner/processor files', () => {
    expect(computeFileRole('src/fileScanner.ts', 0, 0).role).toBe('orchestrates');
    expect(computeFileRole('src/dataProcessor.ts', 0, 0).role).toBe('orchestrates');
    expect(computeFileRole('src/fileScanner.ts', 0, 0).reason).toBe('data processing');
  });

  it('assigns implements role to formatter files', () => {
    expect(computeFileRole('src/outputFormatter.ts', 0, 0).role).toBe('implements');
    expect(computeFileRole('src/outputFormatter.ts', 0, 0).reason).toBe('output formatting');
  });

  it('assigns implements role to presenter files', () => {
    expect(computeFileRole('src/dashboardPresenter.ts', 0, 0).role).toBe('implements');
    expect(computeFileRole('src/dashboardPresenter.ts', 0, 0).reason).toBe('output formatting');
  });

  it('assigns orchestrates role to files with 2 internal imports (less than 3)', () => {
    const result = computeFileRole('src/helper.ts', 2, 0);
    expect(result.role).toBe('orchestrates');
    expect(result.reason).toBe('uses multiple components');
  });

  it('defaults to implements for generic files', () => {
    const result = computeFileRole('src/utils.ts', 0, 0);
    expect(result.role).toBe('implements');
    expect(result.reason).toBe('core logic');
  });

  it('handles empty file path gracefully', () => {
    const result = computeFileRole('', 0, 0);
    expect(result.role).toBe('implements');
    expect(result.reason).toBe('core logic');
  });

  it('prioritizes name-based detection over import counts', () => {
    // types.ts should be defines even with many imports
    const result = computeFileRole('src/types.ts', 5, 0);
    expect(result.role).toBe('defines');
  });
});

// ---------------------------------------------------------------------------
// convertToUnifiedFiles
// ---------------------------------------------------------------------------

describe('convertToUnifiedFiles', () => {
  it('groups files by role', () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/core/',
      files: [
        { path: 'src/core/types.ts', archId: 'a.b', lineCount: 50, role: 'defines', roleReason: 'types', impact: { directDependents: 2, impactChain: [] } },
        { path: 'src/core/service.ts', archId: 'a.c', lineCount: 100, role: 'implements', roleReason: 'logic', impact: { directDependents: 1, impactChain: [] } },
        { path: 'src/core/handler.ts', archId: null, lineCount: 80, role: 'orchestrates', roleReason: 'handler', impact: { directDependents: 0, impactChain: [] } },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
      hasRoles: true,
    };

    const result = convertToUnifiedFiles(moduleContext);
    expect(result.defines).toHaveLength(1);
    expect(result.defines[0].path).toBe('types.ts');
    expect(result.implements).toHaveLength(1);
    expect(result.implements[0].archId).toBe('a.c');
    expect(result.orchestrates).toHaveLength(1);
    expect(result.orchestrates[0].breaks).toBe(0);
  });

  it('strips module path from file paths', () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/core/',
      files: [
        { path: 'src/core/deep/nested.ts', archId: null, lineCount: 10, role: 'implements', roleReason: '', impact: { directDependents: 0, impactChain: [] } },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
      hasRoles: true,
    };

    const result = convertToUnifiedFiles(moduleContext);
    expect(result.implements[0].path).toBe('deep/nested.ts');
  });

  it('defaults to implements role when role is missing', () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [
        { path: 'src/foo.ts', archId: null, lineCount: 10, impact: { directDependents: 0, impactChain: [] } },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    const result = convertToUnifiedFiles(moduleContext);
    expect(result.implements).toHaveLength(1);
  });

  it('handles empty file list', () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    const result = convertToUnifiedFiles(moduleContext);
    expect(result.defines).toHaveLength(0);
    expect(result.implements).toHaveLength(0);
    expect(result.orchestrates).toHaveLength(0);
  });

  it('preserves archId and computes breaks from impact', () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [
        { path: 'src/core.ts', archId: 'archcodex.core.engine', lineCount: 200, role: 'defines', roleReason: 'schema', impact: { directDependents: 5, impactChain: ['a.ts', 'b.ts'] } },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    const result = convertToUnifiedFiles(moduleContext);
    expect(result.defines[0].archId).toBe('archcodex.core.engine');
    expect(result.defines[0].breaks).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getTopSubmodules
// ---------------------------------------------------------------------------

describe('getTopSubmodules', () => {
  it('returns submodules sorted by file count', () => {
    const mockFileRepo = {
      query: vi.fn(() => [
        { path: 'src/core/analysis/engine.ts', archId: 'core.engine' },
        { path: 'src/core/analysis/types.ts', archId: 'core.types' },
        { path: 'src/core/analysis/graph.ts', archId: 'core.engine' },
        { path: 'src/core/db/repository.ts', archId: 'core.db' },
      ]),
    };

    const result = getTopSubmodules('src/core/', mockFileRepo as never);

    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('src/core/analysis/');
    expect(result[0].fileCount).toBe(3);
    expect(result[1].path).toBe('src/core/db/');
    expect(result[1].fileCount).toBe(1);
  });

  it('returns dominant architecture for each submodule', () => {
    const mockFileRepo = {
      query: vi.fn(() => [
        { path: 'src/core/analysis/engine.ts', archId: 'core.engine' },
        { path: 'src/core/analysis/types.ts', archId: 'core.types' },
        { path: 'src/core/analysis/graph.ts', archId: 'core.engine' },
      ]),
    };

    const result = getTopSubmodules('src/core/', mockFileRepo as never);

    expect(result[0].dominantArch).toBe('core.engine');
  });

  it('normalizes module path by adding trailing slash', () => {
    const mockFileRepo = {
      query: vi.fn(() => [
        { path: 'src/core/sub/file.ts', archId: null },
      ]),
    };

    getTopSubmodules('src/core', mockFileRepo as never);

    expect(mockFileRepo.query).toHaveBeenCalledWith({ pathPattern: 'src/core/%' });
  });

  it('does not re-add trailing slash if already present', () => {
    const mockFileRepo = {
      query: vi.fn(() => []),
    };

    getTopSubmodules('src/core/', mockFileRepo as never);

    expect(mockFileRepo.query).toHaveBeenCalledWith({ pathPattern: 'src/core/%' });
  });

  it('returns at most 5 submodules', () => {
    const files = [];
    for (let i = 0; i < 10; i++) {
      files.push({ path: `src/core/sub${i}/file.ts`, archId: null });
    }
    const mockFileRepo = { query: vi.fn(() => files) };

    const result = getTopSubmodules('src/core/', mockFileRepo as never);

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('ignores files directly in the module (no subdirectory)', () => {
    const mockFileRepo = {
      query: vi.fn(() => [
        { path: 'src/core/index.ts', archId: null },
        { path: 'src/core/sub/file.ts', archId: null },
      ]),
    };

    const result = getTopSubmodules('src/core/', mockFileRepo as never);

    // Only the subdirectory should appear, not root-level files
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/core/sub/');
  });

  it('handles files with no archId', () => {
    const mockFileRepo = {
      query: vi.fn(() => [
        { path: 'src/core/sub/file1.ts', archId: null },
        { path: 'src/core/sub/file2.ts', archId: null },
      ]),
    };

    const result = getTopSubmodules('src/core/', mockFileRepo as never);

    expect(result[0].dominantArch).toBeUndefined();
  });

  it('returns empty array when no files', () => {
    const mockFileRepo = { query: vi.fn(() => []) };

    const result = getTopSubmodules('src/core/', mockFileRepo as never);

    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// fetchEntitySchemas
// ---------------------------------------------------------------------------

describe('fetchEntitySchemas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty entity names', async () => {
    const result = await fetchEntitySchemas('/fake', []);

    expect(result).toEqual([]);
    expect(getEntitySchemasBatch).not.toHaveBeenCalled();
  });

  it('fetches entity schemas from batch API', async () => {
    vi.mocked(getEntitySchemasBatch).mockResolvedValue([
      {
        name: 'User',
        fields: [{ name: 'id', optional: false }, { name: 'email', optional: false }, { name: 'nickname', optional: true }],
        relationships: [{ type: 'has_many', target: 'Post', field: 'authorId' }],
        behaviors: [{ type: 'soft_delete' }],
        operations: ['getUser', 'listUsers'],
      },
    ]);

    const result = await fetchEntitySchemas('/fake', ['User']);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('User');
    expect(result[0].fields).toContain('id');
    expect(result[0].fields).toContain('email');
    expect(result[0].fields).toContain('nickname?');
    expect(result[0].behaviors).toContain('soft_delete');
    expect(result[0].operations).toEqual(['getUser', 'listUsers']);
  });

  it('filters out fields starting with underscore', async () => {
    vi.mocked(getEntitySchemasBatch).mockResolvedValue([
      {
        name: 'File',
        fields: [{ name: '_internal', optional: false }, { name: 'path', optional: false }],
        relationships: [],
        behaviors: [],
        operations: [],
      },
    ]);

    const result = await fetchEntitySchemas('/fake', ['File']);

    expect(result[0].fields).toEqual(['path']);
  });

  it('limits to 10 entities', async () => {
    vi.mocked(getEntitySchemasBatch).mockResolvedValue([]);
    const names = Array.from({ length: 15 }, (_, i) => `Entity${i}`);

    await fetchEntitySchemas('/fake', names);

    expect(getEntitySchemasBatch).toHaveBeenCalledWith('/fake', names.slice(0, 10));
  });

  it('returns empty array on error', async () => {
    vi.mocked(getEntitySchemasBatch).mockRejectedValue(new Error('DB error'));

    const result = await fetchEntitySchemas('/fake', ['Broken']);

    expect(result).toEqual([]);
  });

  it('omits empty relationships and behaviors arrays', async () => {
    vi.mocked(getEntitySchemasBatch).mockResolvedValue([
      {
        name: 'Simple',
        fields: [{ name: 'id', optional: false }],
        relationships: [],
        behaviors: [],
        operations: ['get'],
      },
    ]);

    const result = await fetchEntitySchemas('/fake', ['Simple']);

    expect(result[0].relationships).toBeUndefined();
    expect(result[0].behaviors).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getLayerBoundaries
// ---------------------------------------------------------------------------

describe('getLayerBoundaries', () => {
  it('returns undefined when no files have archIds', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/core/',
      files: [
        { path: 'src/core/file.ts', archId: null, lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    const config = { layers: [{ name: 'core', can_import: ['utils'] }] };
    const result = await getLayerBoundaries('/fake', moduleContext, config as never);

    expect(result).toBeUndefined();
  });

  it('returns boundary for the dominant layer', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/core/',
      files: [
        { path: 'src/core/a.ts', archId: 'archcodex.core.engine', lineCount: 10 },
        { path: 'src/core/b.ts', archId: 'archcodex.core.types', lineCount: 10 },
        { path: 'src/core/c.ts', archId: 'archcodex.core.domain', lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    const config = {
      layers: [
        { name: 'core', can_import: ['utils', 'validators'] },
        { name: 'utils' },
        { name: 'validators' },
        { name: 'cli', can_import: ['core', 'utils'] },
      ],
    };

    const result = await getLayerBoundaries('/fake', moduleContext, config as never);

    expect(result).toBeDefined();
    expect(result!.layer).toBe('core');
    expect(result!.canImport).toEqual(['utils', 'validators']);
    expect(result!.cannotImport).toContain('cli');
    expect(result!.cannotImport).not.toContain('core');
    expect(result!.cannotImport).not.toContain('utils');
  });

  it('returns undefined when archId has fewer than 2 parts', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [
        { path: 'src/file.ts', archId: 'singleton', lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    const config = { layers: [{ name: 'core', can_import: [] }] };
    const result = await getLayerBoundaries('/fake', moduleContext, config as never);

    expect(result).toBeUndefined();
  });

  it('returns undefined when dominant layer is not in config', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [
        { path: 'src/file.ts', archId: 'archcodex.unknown.something', lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    const config = { layers: [{ name: 'core', can_import: ['utils'] }] };
    const result = await getLayerBoundaries('/fake', moduleContext, config as never);

    expect(result).toBeUndefined();
  });

  it('computes common imports when fileRepo is provided', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/core/',
      files: [
        { path: 'src/core/a.ts', archId: 'archcodex.core.engine', lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [
        { path: 'src/utils/logger.ts', archId: null },
        { path: 'src/utils/logger.ts', archId: null },
        { path: 'src/utils/logger.ts', archId: null },
      ],
      externalConsumers: [],
      entities: [],
    };

    const config = {
      layers: [
        { name: 'core', can_import: ['utils'] },
        { name: 'utils' },
      ],
    };

    const mockFileRepo = { query: vi.fn(() => []) };
    const result = await getLayerBoundaries('/fake', moduleContext, config as never, mockFileRepo as never);

    expect(result).toBeDefined();
    expect(result!.commonImports).toBeDefined();
    expect(result!.commonImports!.length).toBeGreaterThan(0);
    expect(result!.commonImports![0].layer).toBe('utils');
  });
});

// ---------------------------------------------------------------------------
// getArchConstraints
// ---------------------------------------------------------------------------

describe('getArchConstraints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns untagged architecture when no files have archIds', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [
        { path: 'src/file.ts', archId: null, lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    const mockRegistry = { nodes: {}, version: '1.0', mixins: {}, architectures: [], config: {} };
    const result = await getArchConstraints('/fake', moduleContext, mockRegistry as never);

    expect(result.architecture).toBe('(untagged)');
  });

  it('returns resolved constraints when architecture is found', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/core/',
      files: [
        { path: 'src/core/a.ts', archId: 'core.engine', lineCount: 10 },
        { path: 'src/core/b.ts', archId: 'core.engine', lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'core.engine',
        constraints: [
          { rule: 'forbid_import', value: ['chalk', 'ora'], severity: 'error', source: 'core.engine' },
          { rule: 'forbid_pattern', value: 'explicit any', severity: 'error', source: 'core.engine' },
          { rule: 'require_import', value: ['dispose'], severity: 'warning', source: 'core.engine' },
        ],
        hints: [
          { text: 'Use DI' },
          'Keep it simple',
        ],
        inheritanceChain: [],
        appliedMixins: [],
        pointers: [],
      },
      conflicts: [],
    } as never);

    const mockRegistry = { nodes: {}, version: '1.0' };
    const result = await getArchConstraints('/fake', moduleContext, mockRegistry as never);

    expect(result.architecture).toBe('core.engine');
    expect(result.forbid).toContain('chalk');
    expect(result.forbid).toContain('ora');
    expect(result.patterns).toContain('explicit any');
    expect(result.require).toContain('dispose');
    expect(result.hints).toContain('Use DI');
    expect(result.hints).toContain('Keep it simple');
  });

  it('deduplicates forbidden imports', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [
        { path: 'src/a.ts', archId: 'core.x', lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'core.x',
        constraints: [
          { rule: 'forbid_import', value: ['chalk'], severity: 'error', source: 'core.x' },
          { rule: 'forbid_call', value: ['chalk'], severity: 'error', source: 'core.x' },
        ],
        hints: [],
        inheritanceChain: [],
        appliedMixins: [],
        pointers: [],
      },
      conflicts: [],
    } as never);

    const mockRegistry = { nodes: {} };
    const result = await getArchConstraints('/fake', moduleContext, mockRegistry as never);

    // chalk should appear only once despite being in both forbid_import and forbid_call
    const chalkCount = result.forbid?.filter(f => f === 'chalk').length ?? 0;
    expect(chalkCount).toBe(1);
  });

  it('returns minimal result when resolveArchitecture throws', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [
        { path: 'src/a.ts', archId: 'broken.arch', lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    vi.mocked(resolveArchitecture).mockImplementation(() => { throw new Error('Registry broken'); });

    const mockRegistry = { nodes: {} };
    const result = await getArchConstraints('/fake', moduleContext, mockRegistry as never);

    expect(result.architecture).toBe('broken.arch');
    expect(result.forbid).toBeUndefined();
    expect(result.hints).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildProjectRules
// ---------------------------------------------------------------------------

describe('buildProjectRules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when no layers are configured', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    const config = { layers: [] };
    const mockRegistry = { nodes: {} };
    const result = await buildProjectRules('/fake', moduleContext, config as never, mockRegistry as never);

    expect(result).toBeUndefined();
  });

  it('returns layer hierarchy from config', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [
        { path: 'src/a.ts', archId: 'archcodex.core.engine', lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    const config = {
      layers: [
        { name: 'core', can_import: ['utils'] },
        { name: 'utils' },
      ],
    };
    const mockRegistry = { nodes: {} };
    const result = await buildProjectRules('/fake', moduleContext, config as never, mockRegistry as never);

    expect(result).toBeDefined();
    expect(result!.layers).toHaveLength(2);
    expect(result!.layers[0].name).toBe('core');
    expect(result!.layers[0].canImport).toEqual(['utils']);
    expect(result!.layers[1].name).toBe('utils');
    expect(result!.layers[1].canImport).toEqual([]);
  });

  it('computes shared constraints when architectures have common forbids', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [
        { path: 'src/a.ts', archId: 'archcodex.core.engine', lineCount: 10 },
        { path: 'src/b.ts', archId: 'archcodex.core.domain', lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    // Both architectures share a common forbid
    vi.mocked(buildArchitectureSummary).mockReturnValue({
      forbid: ['chalk', 'ora'],
      patterns: ['explicit any'],
      hints: ['Use DI'],
    } as never);

    const config = { layers: [{ name: 'core', can_import: [] }] };
    const mockRegistry = { nodes: {} };
    const result = await buildProjectRules('/fake', moduleContext, config as never, mockRegistry as never);

    expect(result).toBeDefined();
    expect(result!.shared).toBeDefined();
    expect(result!.shared!.forbid).toContain('chalk');
    expect(result!.shared!.patterns).toContain('explicit any');
    expect(result!.shared!.hints).toContain('Use DI');
  });

  it('omits shared when no constraints are shared', async () => {
    const moduleContext: ModuleContext = {
      modulePath: 'src/',
      files: [
        { path: 'src/a.ts', archId: 'archcodex.core.engine', lineCount: 10 },
      ],
      internalImports: [],
      externalDeps: [],
      externalConsumers: [],
      entities: [],
    };

    vi.mocked(buildArchitectureSummary).mockReturnValue({
      forbid: [],
      patterns: [],
      hints: [],
    } as never);

    const config = { layers: [{ name: 'core', can_import: [] }] };
    const mockRegistry = { nodes: {} };
    const result = await buildProjectRules('/fake', moduleContext, config as never, mockRegistry as never);

    expect(result).toBeDefined();
    expect(result!.shared).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// convertEntityFilesToUnified
// ---------------------------------------------------------------------------

describe('convertEntityFilesToUnified', () => {
  it('groups entity files by computed role', () => {
    const entityFiles = [
      { path: 'src/core/types.ts', archId: 'core.types', refType: 'definition', lineNumber: 5 },
      { path: 'src/core/service.ts', archId: 'core.domain', refType: 'usage', lineNumber: 20 },
    ];

    const mockFileRepo = {};
    const mockImportRepo = {
      getImportGraph: vi.fn((path: string) => {
        if (path === 'src/core/types.ts') {
          return { imports: [], importedBy: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }, { path: 'src/c.ts' }] };
        }
        return { imports: [{ path: 'src/x.ts' }], importedBy: [] };
      }),
    };

    const result = convertEntityFilesToUnified(entityFiles, mockFileRepo as never, mockImportRepo as never);

    // types.ts should be defines (name-based), service.ts should be implements
    expect(result.defines.length).toBeGreaterThan(0);
    expect(result.implements.length).toBeGreaterThan(0);
  });

  it('handles empty entity files array', () => {
    const mockFileRepo = {};
    const mockImportRepo = { getImportGraph: vi.fn() };

    const result = convertEntityFilesToUnified([], mockFileRepo as never, mockImportRepo as never);

    expect(result.defines).toHaveLength(0);
    expect(result.implements).toHaveLength(0);
    expect(result.orchestrates).toHaveLength(0);
  });

  it('uses importedBy count for breaks field', () => {
    const entityFiles = [
      { path: 'src/core/base.ts', archId: null, refType: null, lineNumber: null },
    ];

    const mockFileRepo = {};
    const mockImportRepo = {
      getImportGraph: vi.fn(() => ({
        imports: [],
        importedBy: [{ path: 'a.ts' }, { path: 'b.ts' }],
      })),
    };

    const result = convertEntityFilesToUnified(entityFiles, mockFileRepo as never, mockImportRepo as never);

    const allFiles = [...result.defines, ...result.implements, ...result.orchestrates];
    expect(allFiles[0].breaks).toBe(2);
  });
});
