/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for plan-context engine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatPlanContextCompact } from '../../../../src/core/plan-context/engine.js';
import type { PlanContextResult } from '../../../../src/core/plan-context/types.js';

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    layers: [
      { name: 'utils', paths: ['src/utils/**'], can_import: [] },
      { name: 'core', paths: ['src/core/**'], can_import: ['utils'] },
      { name: 'cli', paths: ['src/cli/**'], can_import: ['core', 'utils'] },
    ],
    files: { scan: { include: ['src/**/*.ts'], exclude: ['**/node_modules/**'] } },
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {
      'archcodex.core.engine': {
        description: 'Engine',
        constraints: [
          { rule: 'forbid_pattern', value: ['console.log'], why: 'Use logger' },
          { rule: 'max_file_lines', value: 600 },
        ],
        hints: ['Engines orchestrate domain objects'],
        appliedMixins: ['tested'],
      },
    },
  }),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn().mockResolvedValue({ ignores: () => false }),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../../src/core/patterns/loader.js', () => ({
  loadPatternRegistry: vi.fn().mockResolvedValue({ patterns: {} }),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn().mockReturnValue({ architecture: null }),
}));

function makePlanContextResult(overrides: Partial<PlanContextResult> = {}): PlanContextResult {
  return {
    scope: { paths: ['src/core/health/'] },
    layers: {
      currentLayer: 'core',
      canImport: ['utils', 'validators'],
      importedBy: ['cli', 'llm'],
      layerMap: {
        utils: [],
        core: ['utils', 'validators'],
        cli: ['utils', 'core', 'validators', 'llm'],
      },
    },
    shared: {
      global: [
        { rule: 'forbid_pattern', values: ['console.log'], why: 'Use logger', alt: 'logger' },
      ],
    },
    architectures: [
      {
        id: 'archcodex.core.engine',
        description: 'Engine',
        fileCount: 2,
        filePaths: ['src/core/health/analyzer.ts', 'src/core/health/layer-health.ts'],
        uniqueConstraints: [
          { rule: 'max_file_lines', values: ['600'] },
        ],
        hints: ['Engines orchestrate domain objects'],
        mixins: ['tested'],
        reference: 'src/core/validation/engine.ts',
        filePattern: '${name}Analyzer.ts',
        defaultPath: 'src/core',
      },
      {
        id: 'archcodex.core.types',
        fileCount: 1,
        filePaths: ['src/core/health/types.ts'],
        uniqueConstraints: [],
        hints: ['Pure type definitions'],
        mixins: [],
      },
    ],
    patterns: [
      { name: 'logger', path: 'src/utils/logger.ts', exports: ['logger'], usage: 'Use structured logger' },
    ],
    untaggedFiles: [],
    stats: {
      filesInScope: 3,
      architecturesInScope: 2,
      totalConstraints: 10,
      deduplicatedConstraints: 6,
    },
    ...overrides,
  };
}

describe('formatPlanContextCompact', () => {
  it('should include header with scope and stats', () => {
    const result = makePlanContextResult();
    const output = formatPlanContextCompact(result);

    expect(output).toContain('# Plan Context: src/core/health/');
    expect(output).toContain('3 files');
    expect(output).toContain('2 archs');
  });

  it('should include layer boundaries', () => {
    const result = makePlanContextResult();
    const output = formatPlanContextCompact(result);

    expect(output).toContain('## Layer: core');
    expect(output).toContain('can_import: [utils, validators]');
    expect(output).toContain('imported_by: [cli, llm]');
  });

  it('should include shared constraints', () => {
    const result = makePlanContextResult();
    const output = formatPlanContextCompact(result);

    expect(output).toContain('## Shared Constraints');
    expect(output).toContain('console.log');
  });

  it('should include architectures with unique constraints', () => {
    const result = makePlanContextResult();
    const output = formatPlanContextCompact(result);

    expect(output).toContain('### archcodex.core.engine (2 files)');
    expect(output).toContain('files: analyzer.ts, layer-health.ts');
    expect(output).toContain('max_file_lines');
    expect(output).toContain('hints: Engines orchestrate domain objects');
    expect(output).toContain('ref: src/core/validation/engine.ts');
    expect(output).toContain('new_file: ${name}Analyzer.ts in src/core');
  });

  it('should include canonical patterns', () => {
    const result = makePlanContextResult();
    const output = formatPlanContextCompact(result);

    expect(output).toContain("## Patterns (use these, don't recreate)");
    expect(output).toContain('logger: src/utils/logger.ts [logger]');
  });

  it('should show untagged files when present', () => {
    const result = makePlanContextResult({
      untaggedFiles: ['src/core/health/orphan.ts'],
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('## Untagged: 1 files');
    expect(output).toContain('src/core/health/orphan.ts');
  });

  it('should truncate untagged files list at 5', () => {
    const result = makePlanContextResult({
      untaggedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts'],
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('... and 2 more');
  });

  it('should omit sections with no content', () => {
    const result = makePlanContextResult({
      shared: { global: [] },
      patterns: [],
      untaggedFiles: [],
    });
    const output = formatPlanContextCompact(result);

    expect(output).not.toContain('## Shared Constraints');
    expect(output).not.toContain('## Patterns');
    expect(output).not.toContain('## Untagged');
  });

  it('should handle multiple scope paths', () => {
    const result = makePlanContextResult({
      scope: { paths: ['src/core/', 'src/cli/'] },
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('# Plan Context: src/core/, src/cli/');
  });

  it('should show constraint alternatives', () => {
    const result = makePlanContextResult({
      shared: {
        global: [
          { rule: 'forbid_import', values: ['axios'], why: 'Use ApiClient', alt: 'src/core/api/client' },
        ],
      },
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('alt: src/core/api/client');
  });

  it('should handle architectures with no filePattern or defaultPath', () => {
    const result = makePlanContextResult({
      architectures: [{
        id: 'archcodex.util',
        fileCount: 5,
        filePaths: ['src/utils/a.ts'],
        uniqueConstraints: [],
        hints: [],
        mixins: [],
      }],
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('### archcodex.util (5 files)');
    expect(output).not.toContain('new_file:');
  });
});

describe('getPlanContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject scope paths outside project root', async () => {
    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');

    await expect(
      getPlanContext('/project', { paths: ['../../etc/passwd'] })
    ).rejects.toThrow('resolves outside project root');
  });

  it('should reject targetFiles outside project root', async () => {
    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');

    await expect(
      getPlanContext('/project', { paths: ['src/'], targetFiles: ['../../../etc/shadow'] })
    ).rejects.toThrow('resolves outside project root');
  });

  it('should handle empty scope gracefully', async () => {
    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');

    const result = await getPlanContext('/project', { paths: [] });
    expect(result.stats.filesInScope).toBe(0);
    expect(result.architectures).toEqual([]);
  });
});

describe('getPlanContext with architectures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve architectures from files with @arch tags', async () => {
    const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');
    const { extractArchId } = await import('../../../../src/core/arch-tag/parser.js');
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(globFiles).mockResolvedValue(['/project/src/core/engine.ts', '/project/src/core/types.ts']);
    vi.mocked(readFile).mockResolvedValue('/** @arch test.engine */');
    vi.mocked(extractArchId).mockReturnValue('test.engine');
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test.engine',
        description: 'Test engine',
        inheritanceChain: ['test.engine'],
        appliedMixins: ['tested'],
        constraints: [
          { rule: 'forbid_import', value: ['axios'], severity: 'error', source: 'test.engine', why: 'Use fetch' },
        ],
        hints: [{ text: 'Keep it simple' }],
        pointers: [],
      },
      conflicts: [],
    });

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/core/'] });

    expect(result.architectures.length).toBe(1);
    expect(result.architectures[0].id).toBe('test.engine');
    expect(result.architectures[0].fileCount).toBe(2);
    expect(result.architectures[0].hints).toContain('Keep it simple');
  });

  it('should handle unreadable files gracefully', async () => {
    const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');

    vi.mocked(globFiles).mockResolvedValue(['/project/src/broken.ts']);
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/'] });

    // Should skip unreadable files without crashing
    expect(result.stats.filesInScope).toBe(1);
  });

  it('should track untagged files separately', async () => {
    const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');
    const { extractArchId } = await import('../../../../src/core/arch-tag/parser.js');

    vi.mocked(globFiles).mockResolvedValue(['/project/src/plain.ts']);
    vi.mocked(readFile).mockResolvedValue('const x = 1;');
    vi.mocked(extractArchId).mockReturnValue(null);

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/'] });

    expect(result.untaggedFiles).toContain('src/plain.ts');
  });

  it('should deduplicate constraints shared by all architectures', async () => {
    const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');
    const { extractArchId } = await import('../../../../src/core/arch-tag/parser.js');
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    // Two files with different architectures
    vi.mocked(globFiles).mockResolvedValue(['/project/src/a.ts', '/project/src/b.ts']);

    let callCount = 0;
    vi.mocked(readFile).mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? '/** @arch arch.a */' : '/** @arch arch.b */';
    });

    let archCount = 0;
    vi.mocked(extractArchId).mockImplementation(() => {
      archCount++;
      return archCount === 1 ? 'arch.a' : 'arch.b';
    });

    const sharedConstraint = { rule: 'forbid_import', value: ['chalk'], severity: 'error' as const, source: 'base' };
    const uniqueConstraintA = { rule: 'max_file_lines', value: 300, severity: 'warning' as const, source: 'arch.a' };
    const uniqueConstraintB = { rule: 'max_file_lines', value: 500, severity: 'warning' as const, source: 'arch.b' };

    vi.mocked(resolveArchitecture).mockImplementation((_reg, archId) => ({
      architecture: {
        archId: archId as string,
        inheritanceChain: [archId as string],
        appliedMixins: [],
        constraints: archId === 'arch.a'
          ? [sharedConstraint, uniqueConstraintA]
          : [sharedConstraint, uniqueConstraintB],
        hints: [],
        pointers: [],
      },
      conflicts: [],
    }));

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/'] });

    // The shared constraint (forbid_import chalk) should be in global
    expect(result.shared.global.length).toBeGreaterThan(0);
    expect(result.shared.global.some(c => c.values.includes('chalk'))).toBe(true);

    // Unique constraints should be per-architecture
    expect(result.architectures.length).toBe(2);
    expect(result.stats.totalConstraints).toBe(4); // 2 constraints * 2 archs
    expect(result.stats.deduplicatedConstraints).toBeGreaterThan(0);
  });

  it('should skip architectures that resolve to null', async () => {
    const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');
    const { extractArchId } = await import('../../../../src/core/arch-tag/parser.js');
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(globFiles).mockResolvedValue(['/project/src/unknown.ts']);
    vi.mocked(readFile).mockResolvedValue('/** @arch unknown.arch */');
    vi.mocked(extractArchId).mockReturnValue('unknown.arch');
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: null as unknown as ReturnType<typeof resolveArchitecture>['architecture'],
      conflicts: [],
    });

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/'] });

    expect(result.architectures.length).toBe(0);
  });

  it('should extract layer context from config with matching layer', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    vi.mocked(globFiles).mockResolvedValue([]);

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/core/'] });

    // The mocked config has layers with core matching src/core/**
    expect(result.layers.currentLayer).toBe('core');
    expect(result.layers.canImport).toContain('utils');
    expect(result.layers.importedBy).toContain('cli');
  });

  it('should return unknown layer when scope does not match any layer', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    vi.mocked(globFiles).mockResolvedValue([]);

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['lib/unknown/'] });

    expect(result.layers.currentLayer).toBe('unknown');
  });

  it('should handle architecture with hints as string type', async () => {
    const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');
    const { extractArchId } = await import('../../../../src/core/arch-tag/parser.js');
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(globFiles).mockResolvedValue(['/project/src/x.ts']);
    vi.mocked(readFile).mockResolvedValue('/** @arch test */');
    vi.mocked(extractArchId).mockReturnValue('test');
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test',
        inheritanceChain: ['test'],
        appliedMixins: [],
        constraints: [],
        hints: [
          { text: 'Hint one' },
          { text: 'Hint two' },
          { text: 'Hint three' }, // Should be capped at 2
        ],
        pointers: [],
      },
      conflicts: [],
    });

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/'] });

    // Max 2 hints
    expect(result.architectures[0].hints.length).toBeLessThanOrEqual(2);
  });

  it('should deduplicate files from multiple glob patterns', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    const { extractArchId } = await import('../../../../src/core/arch-tag/parser.js');

    // Both patterns return the same file
    vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
    vi.mocked(extractArchId).mockReturnValue(null);

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/'] });

    // File should appear only once even though directory expansion generates 2 patterns
    expect(result.stats.filesInScope).toBeLessThanOrEqual(2);
  });

  it('should use targetFiles when provided', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    const globFilesMock = vi.mocked(globFiles);
    globFilesMock.mockResolvedValue([]);

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');

    await getPlanContext('/project', {
      paths: ['src/core/'],
      targetFiles: ['src/core/engine.ts', 'src/core/types.ts'],
    });

    // targetFiles should be added as explicit glob patterns
    expect(globFilesMock).toHaveBeenCalledWith('src/core/engine.ts', expect.objectContaining({ cwd: '/project' }));
    expect(globFilesMock).toHaveBeenCalledWith('src/core/types.ts', expect.objectContaining({ cwd: '/project' }));
  });

  it('should handle constraint with non-array value in toCompactConstraint', async () => {
    const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');
    const { extractArchId } = await import('../../../../src/core/arch-tag/parser.js');
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    // Need 2 files with different archs so the constraint is unique (not global)
    vi.mocked(globFiles).mockResolvedValue(['/project/src/x.ts', '/project/src/y.ts']);
    vi.mocked(readFile).mockImplementation(async (p: string) => {
      if (p === '/project/src/x.ts') return '/** @arch test */';
      return '/** @arch other */';
    });
    vi.mocked(extractArchId).mockImplementation((content: string) => {
      if (content.includes('test')) return 'test';
      return 'other';
    });
    vi.mocked(resolveArchitecture).mockImplementation((_, archId: string) => {
      if (archId === 'test') {
        return {
          architecture: {
            archId: 'test',
            inheritanceChain: ['test'],
            appliedMixins: [],
            constraints: [
              { rule: 'max_file_lines', value: 600, severity: 'error', source: 'test', alternative: 'split file' },
            ],
            hints: [],
            pointers: [],
          },
          conflicts: [],
        };
      }
      return {
        architecture: {
          archId: 'other',
          inheritanceChain: ['other'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      };
    });

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/'] });

    // Non-array value should be converted to string array
    const testArch = result.architectures.find(a => a.id === 'test')!;
    expect(testArch.uniqueConstraints.length).toBe(1);
    expect(testArch.uniqueConstraints[0].values).toEqual(['600']);
    expect(testArch.uniqueConstraints[0].alt).toBe('split file');
  });

  it('should handle EISDIR error by retrying with directory expansion', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    const globFilesMock = vi.mocked(globFiles);

    // First call: treat "src/dir.ts" as a file, but it's actually a directory
    let firstCall = true;
    globFilesMock.mockImplementation(async (pattern) => {
      if (pattern === 'src/dir.ts' && firstCall) {
        firstCall = false;
        const error = new Error('EISDIR') as NodeJS.ErrnoException;
        error.code = 'EISDIR';
        throw error;
      }
      return [];
    });

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/dir.ts'] });

    // Should have retried with directory expansion
    expect(globFilesMock).toHaveBeenCalledWith('src/dir.ts/**/*.ts', expect.objectContaining({ cwd: '/project' }));
    expect(result.stats.filesInScope).toBe(0);
  });

  it('should rethrow non-EISDIR errors', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    const globFilesMock = vi.mocked(globFiles);

    globFilesMock.mockRejectedValue(new Error('EACCES: permission denied'));

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');

    await expect(
      getPlanContext('/project', { paths: ['src/'] })
    ).rejects.toThrow('EACCES');
  });

  it('should handle constraint with forbid_call rule for scoped patterns', async () => {
    const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');
    const { extractArchId } = await import('../../../../src/core/arch-tag/parser.js');
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(globFiles).mockResolvedValue(['/project/src/x.ts']);
    vi.mocked(readFile).mockResolvedValue('/** @arch test */');
    vi.mocked(extractArchId).mockReturnValue('test');
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test',
        inheritanceChain: ['test'],
        appliedMixins: [],
        constraints: [
          { rule: 'forbid_call', value: 'dangerousOp', severity: 'error', source: 'test' },
          { rule: 'forbid_import', value: ['unsafe'], severity: 'error', source: 'test' },
        ],
        hints: [],
        pointers: [],
      },
      conflicts: [],
    });

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/'] });

    // forbid_call constraint values should be tracked for pattern matching
    expect(result.architectures.length).toBe(1);
  });

  it('should handle architecture with reference_implementations and file_pattern', async () => {
    const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');
    const { extractArchId } = await import('../../../../src/core/arch-tag/parser.js');
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(globFiles).mockResolvedValue(['/project/src/x.ts']);
    vi.mocked(readFile).mockResolvedValue('/** @arch test */');
    vi.mocked(extractArchId).mockReturnValue('test');
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test',
        inheritanceChain: ['test'],
        appliedMixins: [],
        constraints: [],
        hints: [],
        pointers: [],
        reference_implementations: ['src/example/service.ts'],
        file_pattern: '${name}Service.ts',
        default_path: 'src/services',
      },
      conflicts: [],
    });

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/'] });

    expect(result.architectures[0].reference).toBe('src/example/service.ts');
    expect(result.architectures[0].filePattern).toBe('${name}Service.ts');
    expect(result.architectures[0].defaultPath).toBe('src/services');
  });

  it('should handle duplicate hint text by deduplicating', async () => {
    const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');
    const { extractArchId } = await import('../../../../src/core/arch-tag/parser.js');
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(globFiles).mockResolvedValue(['/project/src/x.ts']);
    vi.mocked(readFile).mockResolvedValue('/** @arch test */');
    vi.mocked(extractArchId).mockReturnValue('test');
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test',
        inheritanceChain: ['test'],
        appliedMixins: [],
        constraints: [],
        hints: [
          { text: 'Same hint' },
          { text: 'Same hint' }, // Duplicate
          { text: 'Different hint' },
        ],
        pointers: [],
      },
      conflicts: [],
    });

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');
    const result = await getPlanContext('/project', { paths: ['src/'] });

    // Hints should be deduplicated, max 2
    expect(result.architectures[0].hints.length).toBe(2);
    expect(result.architectures[0].hints[0]).toBe('Same hint');
    expect(result.architectures[0].hints[1]).toBe('Different hint');
  });
});

describe('smart scope detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect file paths based on extension and not expand them', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    const globFilesMock = vi.mocked(globFiles);
    globFilesMock.mockResolvedValue([]);

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');

    await getPlanContext('/project', { paths: ['src/core/loader.ts'] });

    // Should call with the exact file path, not expanded to **/*.ts
    expect(globFilesMock).toHaveBeenCalledWith(
      'src/core/loader.ts',
      expect.objectContaining({ cwd: '/project' })
    );
    // Should NOT have been called with expansion
    expect(globFilesMock).not.toHaveBeenCalledWith(
      'src/core/loader.ts/**/*.ts',
      expect.any(Object)
    );
  });

  it('should detect various source file extensions', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    const globFilesMock = vi.mocked(globFiles);
    globFilesMock.mockResolvedValue([]);

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');

    await getPlanContext('/project', {
      paths: [
        'src/app.tsx',
        'lib/util.js',
        'lib/common.jsx',
        'lib/module.mts',
        'lib/legacy.cjs',
      ],
    });

    // Each should be called as-is, not expanded
    expect(globFilesMock).toHaveBeenCalledWith('src/app.tsx', expect.any(Object));
    expect(globFilesMock).toHaveBeenCalledWith('lib/util.js', expect.any(Object));
    expect(globFilesMock).toHaveBeenCalledWith('lib/common.jsx', expect.any(Object));
    expect(globFilesMock).toHaveBeenCalledWith('lib/module.mts', expect.any(Object));
    expect(globFilesMock).toHaveBeenCalledWith('lib/legacy.cjs', expect.any(Object));
  });

  it('should expand directory paths to glob patterns', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    const globFilesMock = vi.mocked(globFiles);
    globFilesMock.mockResolvedValue([]);

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');

    await getPlanContext('/project', { paths: ['src/core/'] });

    // Should be expanded to both .ts and .tsx patterns
    expect(globFilesMock).toHaveBeenCalledWith('src/core/**/*.ts', expect.any(Object));
    expect(globFilesMock).toHaveBeenCalledWith('src/core/**/*.tsx', expect.any(Object));
  });

  it('should handle mixed scope with files and directories', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    const globFilesMock = vi.mocked(globFiles);
    globFilesMock.mockResolvedValue([]);

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');

    await getPlanContext('/project', {
      paths: ['src/services/', 'src/utils/helper.ts', 'src/types/config.tsx'],
    });

    // Directory should be expanded
    expect(globFilesMock).toHaveBeenCalledWith('src/services/**/*.ts', expect.any(Object));
    expect(globFilesMock).toHaveBeenCalledWith('src/services/**/*.tsx', expect.any(Object));
    // Files should be used directly
    expect(globFilesMock).toHaveBeenCalledWith('src/utils/helper.ts', expect.any(Object));
    expect(globFilesMock).toHaveBeenCalledWith('src/types/config.tsx', expect.any(Object));
  });

  it('should pass through glob patterns unchanged', async () => {
    const { globFiles } = await import('../../../../src/utils/file-system.js');
    const globFilesMock = vi.mocked(globFiles);
    globFilesMock.mockResolvedValue([]);

    const { getPlanContext } = await import('../../../../src/core/plan-context/engine.js');

    await getPlanContext('/project', { paths: ['**/*.test.ts', 'src/**/*.tsx'] });

    // Globs should be passed through unchanged
    expect(globFilesMock).toHaveBeenCalledWith('**/*.test.ts', expect.any(Object));
    expect(globFilesMock).toHaveBeenCalledWith('src/**/*.tsx', expect.any(Object));
  });
});

describe('formatPlanContextCompact additional branches', () => {
  it('should omit imported_by when empty', () => {
    const result = makePlanContextResult({
      layers: {
        currentLayer: 'utils',
        canImport: [],
        importedBy: [],
        layerMap: { utils: [] },
      },
    });
    const output = formatPlanContextCompact(result);

    expect(output).not.toContain('imported_by:');
  });

  it('should omit can_import when empty', () => {
    const result = makePlanContextResult({
      layers: {
        currentLayer: 'utils',
        canImport: [],
        importedBy: ['core'],
        layerMap: { utils: [], core: ['utils'] },
      },
    });
    const output = formatPlanContextCompact(result);

    expect(output).not.toContain('can_import:');
    expect(output).toContain('imported_by: [core]');
  });

  it('should handle architecture with no filePaths', () => {
    const result = makePlanContextResult({
      architectures: [{
        id: 'archcodex.core.types',
        fileCount: 0,
        filePaths: [],
        uniqueConstraints: [],
        hints: [],
        mixins: [],
      }],
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('### archcodex.core.types (0 files)');
    // Should not contain 'files:' line since filePaths is empty
    expect(output).not.toContain('files:');
  });

  it('should handle architecture with filePattern but no defaultPath', () => {
    const result = makePlanContextResult({
      architectures: [{
        id: 'archcodex.core.engine',
        fileCount: 1,
        filePaths: ['src/core/engine.ts'],
        uniqueConstraints: [],
        hints: [],
        mixins: [],
        filePattern: '${name}Engine.ts',
        // No defaultPath
      }],
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('new_file: ${name}Engine.ts');
    // Should not have 'in' suffix since no defaultPath
    expect(output).not.toContain('in src/core');
  });

  it('should handle architecture with defaultPath but no filePattern', () => {
    const result = makePlanContextResult({
      architectures: [{
        id: 'archcodex.core.engine',
        fileCount: 1,
        filePaths: ['src/core/engine.ts'],
        uniqueConstraints: [],
        hints: [],
        mixins: [],
        defaultPath: 'src/core',
        // No filePattern
      }],
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('new_file: in src/core');
  });

  it('should handle architecture with no hints', () => {
    const result = makePlanContextResult({
      architectures: [{
        id: 'archcodex.test',
        fileCount: 1,
        filePaths: ['test.ts'],
        uniqueConstraints: [],
        hints: [],
        mixins: [],
      }],
    });
    const output = formatPlanContextCompact(result);

    expect(output).not.toContain('hints:');
  });

  it('should handle architecture with no reference', () => {
    const result = makePlanContextResult({
      architectures: [{
        id: 'archcodex.test',
        fileCount: 1,
        filePaths: ['test.ts'],
        uniqueConstraints: [],
        hints: ['A hint'],
        mixins: [],
        // No reference
      }],
    });
    const output = formatPlanContextCompact(result);

    expect(output).not.toContain('ref:');
    expect(output).toContain('hints: A hint');
  });

  it('should handle constraint with no alt', () => {
    const result = makePlanContextResult({
      shared: {
        global: [
          { rule: 'forbid_pattern', values: ['console.log'] },
        ],
      },
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('console.log');
    expect(output).not.toContain('alt:');
  });

  it('should handle empty architectures list', () => {
    const result = makePlanContextResult({
      architectures: [],
    });
    const output = formatPlanContextCompact(result);

    expect(output).not.toContain('## Architectures');
  });

  it('should format unique constraint inline with alt', () => {
    const result = makePlanContextResult({
      architectures: [{
        id: 'archcodex.test',
        fileCount: 1,
        filePaths: ['test.ts'],
        uniqueConstraints: [
          { rule: 'forbid_import', values: ['axios'], alt: 'fetch' },
        ],
        hints: [],
        mixins: [],
      }],
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('unique:');
    expect(output).toContain('alt: fetch');
  });

  it('should format unique constraint inline without alt', () => {
    const result = makePlanContextResult({
      shared: { global: [] }, // No shared constraints with alt
      architectures: [{
        id: 'archcodex.test',
        fileCount: 1,
        filePaths: ['test.ts'],
        uniqueConstraints: [
          { rule: 'require_import', values: ['zod'] },
        ],
        hints: [],
        mixins: [],
      }],
      patterns: [],
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('unique:');
    expect(output).toContain('zod');
    expect(output).not.toContain('alt:');
  });

  it('should show exactly 5 untagged files without truncation', () => {
    const result = makePlanContextResult({
      untaggedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
    });
    const output = formatPlanContextCompact(result);

    expect(output).toContain('## Untagged: 5 files');
    expect(output).not.toContain('... and');
  });
});
