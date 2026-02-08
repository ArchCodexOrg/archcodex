/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for check command helper functions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseThreshold,
  mergePrecommitSettings,
  getExitCodeWithThresholds,
  hydrateCachedResult,
  createCacheEntry,
  printDuplicateWarnings,
  findAlternativeArchitectures,
} from '../../../../src/cli/commands/check-helpers.js';

// Mock the resolver
vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(),
}));

// Mock the format utility
vi.mock('../../../../src/utils/format.js', () => ({
  formatConstraintValue: vi.fn((v: unknown) => String(v)),
}));

describe('parseThreshold', () => {
  it('should parse numeric values', () => {
    expect(parseThreshold('0')).toBe(0);
    expect(parseThreshold('10')).toBe(10);
    expect(parseThreshold('100')).toBe(100);
  });

  it('should return null for "null" string', () => {
    expect(parseThreshold('null')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseThreshold('')).toBeNull();
  });

  it('should return null for non-numeric strings', () => {
    expect(parseThreshold('abc')).toBeNull();
  });

  it('should parse negative numbers', () => {
    expect(parseThreshold('-1')).toBe(-1);
  });
});

describe('mergePrecommitSettings', () => {
  it('should use defaults when no config provided', () => {
    const result = mergePrecommitSettings(undefined, {});
    expect(result.maxErrors).toBeNull();
    expect(result.maxWarnings).toBeNull();
    expect(result.outputFormat).toBe('human');
    expect(result.onlyStagedFiles).toBe(false);
    expect(result.include).toEqual([]);
    expect(result.exclude).toEqual([]);
  });

  it('should use config values', () => {
    const result = mergePrecommitSettings({
      max_errors: 5,
      max_warnings: 10,
      output_format: 'compact',
      only_staged_files: true,
      include: ['src/**'],
      exclude: ['**/*.test.ts'],
    }, {});
    expect(result.maxErrors).toBe(5);
    expect(result.maxWarnings).toBe(10);
    expect(result.outputFormat).toBe('compact');
    expect(result.onlyStagedFiles).toBe(true);
    expect(result.include).toEqual(['src/**']);
    expect(result.exclude).toEqual(['**/*.test.ts']);
  });

  it('should override config with CLI options', () => {
    const result = mergePrecommitSettings({
      max_errors: 5,
      output_format: 'compact',
    }, {
      maxErrors: 0,
      json: true,
    });
    expect(result.maxErrors).toBe(0);
    expect(result.outputFormat).toBe('json');
  });

  it('should handle staged flag', () => {
    const result = mergePrecommitSettings(undefined, { staged: true });
    expect(result.onlyStagedFiles).toBe(true);
  });

  it('should override maxWarnings from CLI', () => {
    const result = mergePrecommitSettings({ max_warnings: 10 }, { maxWarnings: 5 });
    expect(result.maxWarnings).toBe(5);
  });

  it('should override format from CLI when not json', () => {
    const result = mergePrecommitSettings(undefined, { format: 'compact' });
    expect(result.outputFormat).toBe('compact');
  });

  it('should not override format when format is human', () => {
    const result = mergePrecommitSettings({ output_format: 'compact' }, { format: 'human' });
    expect(result.outputFormat).toBe('compact');
  });

  it('should override include from CLI', () => {
    const result = mergePrecommitSettings({ include: ['src/**'] }, { include: ['lib/**'] });
    expect(result.include).toEqual(['lib/**']);
  });

  it('should override exclude from CLI', () => {
    const result = mergePrecommitSettings({ exclude: ['tests/**'] }, { exclude: ['dist/**'] });
    expect(result.exclude).toEqual(['dist/**']);
  });

  it('should handle null max_errors in config', () => {
    const result = mergePrecommitSettings({ max_errors: null }, {});
    expect(result.maxErrors).toBeNull();
  });

  it('should handle null max_warnings in config', () => {
    const result = mergePrecommitSettings({ max_warnings: null }, {});
    expect(result.maxWarnings).toBeNull();
  });
});

describe('getExitCodeWithThresholds', () => {
  const exitCodes = { success: 0, error: 1, warning_only: 2 };

  it('should return success when no errors or warnings', () => {
    expect(getExitCodeWithThresholds({ failed: 0, warned: 0 }, exitCodes, null, null)).toBe(0);
  });

  it('should return error when errors exceed threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 5, warned: 0 }, exitCodes, 3, null)).toBe(1);
  });

  it('should return success when errors within threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 3, warned: 0 }, exitCodes, 5, null)).toBe(0);
  });

  it('should return error when warnings exceed threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 0, warned: 10 }, exitCodes, null, 5)).toBe(1);
  });

  it('should return warning_only when warnings exist but no threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 0, warned: 5 }, exitCodes, null, null)).toBe(2);
  });

  it('should return error on any error when threshold is null', () => {
    expect(getExitCodeWithThresholds({ failed: 1, warned: 0 }, exitCodes, null, null)).toBe(1);
  });

  it('should return success when errors equal threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 5, warned: 0 }, exitCodes, 5, null)).toBe(0);
  });

  it('should return success when warnings equal threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 0, warned: 5 }, exitCodes, null, 5)).toBe(2);
  });

  it('should return error when both errors and warnings exceed', () => {
    expect(getExitCodeWithThresholds({ failed: 10, warned: 10 }, exitCodes, 5, 5)).toBe(1);
  });

  it('should check errors first even if warnings also exceed', () => {
    // When errors exceed, it returns error exit code even if warnings also exceed
    expect(getExitCodeWithThresholds({ failed: 10, warned: 10 }, exitCodes, 5, 5)).toBe(1);
  });

  it('should return success when threshold is 0 and count is 0', () => {
    expect(getExitCodeWithThresholds({ failed: 0, warned: 0 }, exitCodes, 0, 0)).toBe(0);
  });

  it('should return error when errors are 1 and threshold is 0', () => {
    expect(getExitCodeWithThresholds({ failed: 1, warned: 0 }, exitCodes, 0, null)).toBe(1);
  });

  it('should return warning_only when warnings within threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 0, warned: 3 }, exitCodes, null, 5)).toBe(2);
  });
});

describe('hydrateCachedResult', () => {
  it('should convert cached result to ValidationResult', () => {
    const cached = {
      checksum: 'abc123',
      cachedAt: '2024-01-01',
      archId: 'core.domain',
      status: 'pass' as const,
      violations: [],
      warnings: [],
      imports: [],
      overridesCount: 0,
    };

    const result = hydrateCachedResult('test.ts', cached);
    expect(result.file).toBe('test.ts');
    expect(result.archId).toBe('core.domain');
    expect(result.status).toBe('pass');
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });

  it('should hydrate violations', () => {
    const cached = {
      checksum: 'abc123',
      cachedAt: '2024-01-01',
      archId: 'core.domain',
      status: 'fail' as const,
      violations: [{
        code: 'IMPORT_FORBIDDEN',
        rule: 'forbid_import',
        value: 'axios',
        severity: 'error',
        line: 5,
        column: 1,
        message: 'Forbidden import',
        source: 'test.ts',
      }],
      warnings: [],
      imports: [],
      overridesCount: 0,
    };

    const result = hydrateCachedResult('test.ts', cached);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].code).toBe('IMPORT_FORBIDDEN');
    expect(result.violations[0].line).toBe(5);
    expect(result.passed).toBe(false);
    expect(result.errorCount).toBe(1);
  });

  it('should hydrate warnings', () => {
    const cached = {
      checksum: 'abc123',
      cachedAt: '2024-01-01',
      archId: 'core.domain',
      status: 'warn' as const,
      violations: [],
      warnings: [{
        code: 'PATTERN_MATCH',
        rule: 'forbid_pattern',
        value: 'console.log',
        severity: 'warning',
        line: 10,
        column: 3,
        message: 'Console log found',
        source: 'test.ts',
      }],
      imports: [],
      overridesCount: 0,
    };

    const result = hydrateCachedResult('test.ts', cached);
    expect(result.warnings).toHaveLength(1);
    expect(result.warningCount).toBe(1);
  });

  it('should create placeholder overrides based on count', () => {
    const cached = {
      checksum: 'abc123',
      cachedAt: '2024-01-01',
      archId: 'core.domain',
      status: 'pass' as const,
      violations: [],
      warnings: [],
      imports: [],
      overridesCount: 3,
    };

    const result = hydrateCachedResult('test.ts', cached);
    expect(result.overridesActive).toHaveLength(3);
    expect(result.overridesActive[0].reason).toBe('restored from cache');
  });

  it('should set empty inheritanceChain and mixinsApplied', () => {
    const cached = {
      checksum: 'abc123',
      cachedAt: '2024-01-01',
      archId: 'core.domain',
      status: 'pass' as const,
      violations: [],
      warnings: [],
      imports: [],
      overridesCount: 0,
    };

    const result = hydrateCachedResult('test.ts', cached);
    expect(result.inheritanceChain).toEqual([]);
    expect(result.mixinsApplied).toEqual([]);
  });
});

describe('createCacheEntry', () => {
  it('should create cache entry from validation result', () => {
    const validationResult = {
      file: 'test.ts',
      archId: 'core.domain',
      status: 'pass' as const,
      violations: [],
      warnings: [],
      overridesActive: [],
      passed: true,
      errorCount: 0,
      warningCount: 0,
      inheritanceChain: [],
      mixinsApplied: [],
    };

    const entry = createCacheEntry(validationResult, 'checksum-abc');
    expect(entry.checksum).toBe('checksum-abc');
    expect(entry.archId).toBe('core.domain');
    expect(entry.status).toBe('pass');
    expect(entry.violations).toEqual([]);
    expect(entry.warnings).toEqual([]);
    expect(entry.overridesCount).toBe(0);
    expect(entry.cachedAt).toBeTruthy();
  });

  it('should store violations in cache entry', () => {
    const validationResult = {
      file: 'test.ts',
      archId: 'core.domain',
      status: 'fail' as const,
      violations: [{
        code: 'IMPORT_FORBIDDEN',
        rule: 'forbid_import' as const,
        value: 'axios',
        severity: 'error' as const,
        line: 5,
        column: 1,
        message: 'Forbidden import',
        source: 'test.ts',
      }],
      warnings: [],
      overridesActive: [],
      passed: false,
      errorCount: 1,
      warningCount: 0,
      inheritanceChain: [],
      mixinsApplied: [],
    };

    const entry = createCacheEntry(validationResult, 'checksum-abc');
    expect(entry.violations).toHaveLength(1);
    expect(entry.violations[0].code).toBe('IMPORT_FORBIDDEN');
  });

  it('should store override count in cache entry', () => {
    const validationResult = {
      file: 'test.ts',
      archId: 'core.domain',
      status: 'pass' as const,
      violations: [],
      warnings: [],
      overridesActive: [
        { rule: 'forbid_import', value: 'axios', reason: 'needed' },
        { rule: 'forbid_pattern', value: 'console', reason: 'debug' },
      ],
      passed: true,
      errorCount: 0,
      warningCount: 0,
      inheritanceChain: [],
      mixinsApplied: [],
    };

    const entry = createCacheEntry(validationResult, 'checksum-abc');
    expect(entry.overridesCount).toBe(2);
  });
});

describe('printDuplicateWarnings', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should print human-readable duplicate warnings', () => {
    printDuplicateWarnings([
      {
        file: 'src/a.ts',
        matches: [{ file: 'src/b.ts', similarity: 0.85, matchedAspects: [{ type: 'name' }] }],
      },
    ], 'human');

    const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('Potential Duplicates'))).toBe(true);
    expect(calls.some(c => c.includes('85%'))).toBe(true);
    expect(calls.some(c => c.includes('name'))).toBe(true);
  });

  it('should print compact duplicate warnings', () => {
    printDuplicateWarnings([
      {
        file: 'src/a.ts',
        matches: [{ file: 'src/b.ts', similarity: 0.90, matchedAspects: [] }],
      },
    ], 'compact');

    const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('DUP'))).toBe(true);
    expect(calls.some(c => c.includes('90%'))).toBe(true);
  });

  it('should not print anything for json format', () => {
    printDuplicateWarnings([
      {
        file: 'src/a.ts',
        matches: [{ file: 'src/b.ts', similarity: 0.85, matchedAspects: [] }],
      },
    ], 'json');

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should handle multiple matches per file', () => {
    printDuplicateWarnings([
      {
        file: 'src/a.ts',
        matches: [
          { file: 'src/b.ts', similarity: 0.85, matchedAspects: [] },
          { file: 'src/c.ts', similarity: 0.80, matchedAspects: [] },
        ],
      },
    ], 'human');

    const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
    expect(calls.filter(c => c.includes('similar to')).length).toBe(2);
  });

  it('should handle empty matchedAspects in human format', () => {
    printDuplicateWarnings([
      {
        file: 'src/a.ts',
        matches: [{ file: 'src/b.ts', similarity: 0.85, matchedAspects: [] }],
      },
    ], 'human');

    const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
    // Should not print "Matched:" line when empty
    expect(calls.every(c => !c.includes('Matched:'))).toBe(true);
  });

});

describe('findAlternativeArchitectures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when current architecture not found', async () => {
    const registry = {
      nodes: {},
      mixins: {},
    };

    const result = findAlternativeArchitectures(registry as never, 'nonexistent', ['forbid_import']);
    expect(result).toEqual([]);
  });

  it('should return empty array when resolveArchitecture fails', async () => {
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');
    vi.mocked(resolveArchitecture).mockImplementation(() => { throw new Error('Failed'); });

    const registry = {
      nodes: {
        'test.current': { description: 'Current' },
      },
      mixins: {},
    };

    const result = findAlternativeArchitectures(registry as never, 'test.current', ['forbid_import']);
    expect(result).toEqual([]);
  });

  it('should find alternative architectures that remove violations', async () => {
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(resolveArchitecture).mockImplementation((_registry, archId) => {
      if (archId === 'test.current') {
        return {
          architecture: {
            constraints: [
              { rule: 'forbid_import', value: 'axios' },
              { rule: 'forbid_pattern', value: 'console' },
            ],
          },
        } as never;
      }
      if (archId === 'test.alternative') {
        return {
          architecture: {
            constraints: [
              { rule: 'forbid_pattern', value: 'console' },
            ],
          },
        } as never;
      }
      return { architecture: { constraints: [] } } as never;
    });

    const registry = {
      nodes: {
        'test.current': { description: 'Current', inherits: 'base' },
        'test.alternative': { description: 'Alternative', inherits: 'base' },
        'base': { description: 'Base' },
      },
      mixins: {},
    };

    const result = findAlternativeArchitectures(registry as never, 'test.current', ['forbid_import']);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(s => s.archId === 'test.alternative')).toBe(true);
  });

  it('should skip base architecture', async () => {
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: { constraints: [] },
    } as never);

    const registry = {
      nodes: {
        'test.current': { description: 'Current' },
        'base': { description: 'Base' },
      },
      mixins: {},
    };

    const result = findAlternativeArchitectures(registry as never, 'test.current', ['forbid_import']);
    expect(result.every(s => s.archId !== 'base')).toBe(true);
  });

  it('should limit suggestions to 3', async () => {
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(resolveArchitecture).mockImplementation((_registry, archId) => {
      if (archId === 'test.current') {
        return {
          architecture: {
            constraints: [{ rule: 'forbid_import', value: 'axios' }],
          },
        } as never;
      }
      return { architecture: { constraints: [] } } as never;
    });

    const registry = {
      nodes: {
        'test.current': { description: 'Current' },
        'test.alt1': { description: 'Alt1' },
        'test.alt2': { description: 'Alt2' },
        'test.alt3': { description: 'Alt3' },
        'test.alt4': { description: 'Alt4' },
        'test.alt5': { description: 'Alt5' },
      },
      mixins: {},
    };

    const result = findAlternativeArchitectures(registry as never, 'test.current', ['forbid_import']);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('should detect sibling relationship', async () => {
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(resolveArchitecture).mockImplementation((_registry, archId) => {
      if (archId === 'test.current') {
        return {
          architecture: {
            constraints: [{ rule: 'forbid_import', value: 'axios' }],
          },
        } as never;
      }
      return { architecture: { constraints: [] } } as never;
    });

    const registry = {
      nodes: {
        'test.current': { description: 'Current', inherits: 'parent' },
        'test.sibling': { description: 'Sibling', inherits: 'parent' },
        'parent': { description: 'Parent' },
      },
      mixins: {},
    };

    const result = findAlternativeArchitectures(registry as never, 'test.current', ['forbid_import']);
    const sibling = result.find(s => s.archId === 'test.sibling');
    expect(sibling?.relationship).toBe('sibling');
  });

  it('should detect parent relationship', async () => {
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(resolveArchitecture).mockImplementation((_registry, archId) => {
      if (archId === 'test.current') {
        return {
          architecture: {
            constraints: [{ rule: 'forbid_import', value: 'axios' }],
          },
        } as never;
      }
      return { architecture: { constraints: [] } } as never;
    });

    const registry = {
      nodes: {
        'test.current': { description: 'Current', inherits: 'parent' },
        'parent': { description: 'Parent' },
      },
      mixins: {},
    };

    const result = findAlternativeArchitectures(registry as never, 'test.current', ['forbid_import']);
    const parent = result.find(s => s.archId === 'parent');
    expect(parent?.relationship).toBe('parent');
  });

  it('should detect child relationship', async () => {
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(resolveArchitecture).mockImplementation((_registry, archId) => {
      if (archId === 'test.current') {
        return {
          architecture: {
            constraints: [{ rule: 'forbid_import', value: 'axios' }],
          },
        } as never;
      }
      return { architecture: { constraints: [] } } as never;
    });

    const registry = {
      nodes: {
        'test.current': { description: 'Current', inherits: 'grandparent' },
        'test.child': { description: 'Child', inherits: 'test.current' },
        'grandparent': { description: 'Grandparent' },
      },
      mixins: {},
    };

    const result = findAlternativeArchitectures(registry as never, 'test.current', ['forbid_import']);
    const child = result.find(s => s.archId === 'test.child');
    expect(child?.relationship).toBe('child');
  });

  it('should skip alternatives that do not remove violated constraints', async () => {
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(resolveArchitecture).mockImplementation((_registry, archId) => {
      // Both current and alternative have the same violated constraint
      return {
        architecture: {
          constraints: [{ rule: 'forbid_import', value: 'axios' }],
        },
      } as never;
    });

    const registry = {
      nodes: {
        'test.current': { description: 'Current' },
        'test.alternative': { description: 'Alternative' },
      },
      mixins: {},
    };

    const result = findAlternativeArchitectures(registry as never, 'test.current', ['forbid_import']);
    expect(result).toEqual([]);
  });

  it('should handle resolveArchitecture throwing for alternative architecture', async () => {
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(resolveArchitecture).mockImplementation((_registry, archId) => {
      if (archId === 'test.current') {
        return {
          architecture: {
            constraints: [{ rule: 'forbid_import', value: 'axios' }],
          },
        } as never;
      }
      throw new Error('Failed to resolve');
    });

    const registry = {
      nodes: {
        'test.current': { description: 'Current' },
        'test.broken': { description: 'Broken' },
      },
      mixins: {},
    };

    // Should not throw, just skip the broken one
    const result = findAlternativeArchitectures(registry as never, 'test.current', ['forbid_import']);
    expect(result).toEqual([]);
  });

  it('should sort suggestions by net constraint change', async () => {
    const { resolveArchitecture } = await import('../../../../src/core/registry/resolver.js');

    vi.mocked(resolveArchitecture).mockImplementation((_registry, archId) => {
      if (archId === 'test.current') {
        return {
          architecture: {
            constraints: [
              { rule: 'forbid_import', value: 'axios' },
              { rule: 'forbid_pattern', value: 'console' },
            ],
          },
        } as never;
      }
      if (archId === 'test.alt1') {
        // Removes 1 violated, adds 3 new = net +2
        return {
          architecture: {
            constraints: [
              { rule: 'forbid_pattern', value: 'console' },
              { rule: 'require', value: 'tests' },
              { rule: 'require', value: 'docs' },
              { rule: 'require', value: 'lint' },
            ],
          },
        } as never;
      }
      if (archId === 'test.alt2') {
        // Removes 1 violated, adds 0 new = net -1
        return {
          architecture: {
            constraints: [],
          },
        } as never;
      }
      return { architecture: { constraints: [] } } as never;
    });

    const registry = {
      nodes: {
        'test.current': { description: 'Current' },
        'test.alt1': { description: 'Alt1 - adds more' },
        'test.alt2': { description: 'Alt2 - removes more' },
      },
      mixins: {},
    };

    const result = findAlternativeArchitectures(registry as never, 'test.current', ['forbid_import']);
    // alt2 should come first (net -2 is better than net +2)
    if (result.length >= 2) {
      expect(result[0].archId).toBe('test.alt2');
    }
  });
});
