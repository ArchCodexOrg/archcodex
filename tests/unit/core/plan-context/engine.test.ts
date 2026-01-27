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
