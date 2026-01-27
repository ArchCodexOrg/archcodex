/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for validate-plan engine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validatePlan, formatValidationResult } from '../../../../src/core/validate-plan/engine.js';
import type { PlanValidationResult } from '../../../../src/core/validate-plan/types.js';

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    layers: [
      { name: 'utils', paths: ['src/utils/**'], can_import: [], exclude: [] },
      { name: 'core', paths: ['src/core/**'], can_import: ['utils'], exclude: [] },
      { name: 'cli', paths: ['src/cli/**'], can_import: ['core', 'utils'], exclude: [] },
    ],
    files: { scan: { include: ['src/**/*.ts'], exclude: ['**/node_modules/**'] } },
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {
      'archcodex.core.engine': {
        constraints: [
          { rule: 'forbid_import', value: ['axios', 'http'], why: 'Use ApiClient', alternative: 'src/core/api/client', severity: 'error' },
          { rule: 'forbid_pattern', value: ['console.log'], severity: 'error' },
          { rule: 'require_test_file', value: ['*.test.ts'] },
        ],
        hints: ['Engines orchestrate domain objects'],
        appliedMixins: ['tested'],
        description: 'Use case orchestrator',
      },
      'archcodex.core.types': {
        constraints: [],
        hints: [],
        appliedMixins: [],
        description: 'Type definitions',
      },
    },
  }),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn((registry: unknown, archId: string) => {
    const reg = registry as { architectures: Record<string, unknown> };
    const arch = reg.architectures[archId];
    if (!arch) return { architecture: null };
    return { architecture: arch };
  }),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn().mockReturnValue(null),
}));

function makeResult(overrides: Partial<PlanValidationResult> = {}): PlanValidationResult {
  return {
    valid: true,
    violations: [],
    warnings: [],
    impactedFiles: [],
    stats: {
      filesChecked: 2,
      errorsFound: 0,
      warningsFound: 0,
      impactedFileCount: 0,
    },
    ...overrides,
  };
}

describe('formatValidationResult', () => {
  it('should show PASS for valid plans', () => {
    const result = makeResult();
    const output = formatValidationResult(result);

    expect(output).toContain('Plan validation: PASS');
    expect(output).toContain('2 files checked, 0 errors, 0 warnings');
  });

  it('should show FAIL for invalid plans', () => {
    const result = makeResult({
      valid: false,
      violations: [{
        file: 'src/test.ts',
        rule: 'forbid_import',
        detail: 'Import "axios" is forbidden',
        severity: 'error',
        suggestion: 'Use ApiClient',
        alternative: 'src/core/api/client',
      }],
      stats: { filesChecked: 1, errorsFound: 1, warningsFound: 0, impactedFileCount: 0 },
    });
    const output = formatValidationResult(result);

    expect(output).toContain('Plan validation: FAIL');
    expect(output).toContain('Errors:');
    expect(output).toContain('src/test.ts: forbid_import - Import "axios" is forbidden');
    expect(output).toContain('fix: Use ApiClient');
  });

  it('should show warnings section', () => {
    const result = makeResult({
      warnings: [{
        file: 'src/service.ts',
        rule: 'require_test_file',
        detail: 'Missing companion test file',
        severity: 'warning',
        suggestion: 'Add src/service.test.ts',
      }],
      stats: { filesChecked: 1, errorsFound: 0, warningsFound: 1, impactedFileCount: 0 },
    });
    const output = formatValidationResult(result);

    expect(output).toContain('Warnings:');
    expect(output).toContain('Missing companion test file');
    expect(output).toContain('fix: Add src/service.test.ts');
  });

  it('should show impacted files', () => {
    const result = makeResult({
      impactedFiles: ['src/cli/commands/health.ts', 'src/mcp/server.ts'],
      stats: { filesChecked: 1, errorsFound: 0, warningsFound: 0, impactedFileCount: 2 },
    });
    const output = formatValidationResult(result);

    expect(output).toContain('Impacted files (2):');
    expect(output).toContain('src/cli/commands/health.ts');
    expect(output).toContain('src/mcp/server.ts');
  });

  it('should truncate impacted files at 10', () => {
    const impactedFiles = Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`);
    const result = makeResult({
      impactedFiles,
      stats: { filesChecked: 1, errorsFound: 0, warningsFound: 0, impactedFileCount: 15 },
    });
    const output = formatValidationResult(result);

    expect(output).toContain('... and 5 more');
  });
});

describe('validatePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create action', () => {
    it('should error when archId is missing', async () => {
      const result = await validatePlan('/project', {
        changes: [{ path: 'src/new.ts', action: 'create' }],
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe('missing_arch_tag');
    });

    it('should error when archId is invalid', async () => {
      const result = await validatePlan('/project', {
        changes: [{ path: 'src/new.ts', action: 'create', archId: 'nonexistent.arch' }],
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe('invalid_arch_id');
    });

    it('should detect forbidden imports', async () => {
      const result = await validatePlan('/project', {
        changes: [{
          path: 'src/new.ts',
          action: 'create',
          archId: 'archcodex.core.engine',
          newImports: ['axios'],
        }],
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe('forbid_import');
      expect(result.violations[0].detail).toContain('axios');
    });

    it('should detect scoped package forbidden imports', async () => {
      const result = await validatePlan('/project', {
        changes: [{
          path: 'src/new.ts',
          action: 'create',
          archId: 'archcodex.core.engine',
          newImports: ['axios/retry'],
        }],
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe('forbid_import');
    });

    it('should not match partial module names', async () => {
      const result = await validatePlan('/project', {
        changes: [{
          path: 'src/new.ts',
          action: 'create',
          archId: 'archcodex.core.engine',
          newImports: ['maxios-client'],
        }],
      });

      expect(result.valid).toBe(true);
    });

    it('should warn about missing test file for tested mixin', async () => {
      const result = await validatePlan('/project', {
        changes: [{
          path: 'src/core/engine.ts',
          action: 'create',
          archId: 'archcodex.core.engine',
        }],
      });

      expect(result.warnings.some(w => w.rule === 'require_test_file')).toBe(true);
    });

    it('should not warn about test file when creating a test file', async () => {
      const result = await validatePlan('/project', {
        changes: [{
          path: 'src/core/engine.test.ts',
          action: 'create',
          archId: 'archcodex.core.engine',
        }],
      });

      expect(result.warnings.some(w => w.rule === 'require_test_file')).toBe(false);
    });

    it('should detect forbidden patterns', async () => {
      const result = await validatePlan('/project', {
        changes: [{
          path: 'src/new.ts',
          action: 'create',
          archId: 'archcodex.core.engine',
          codePatterns: ['console.log("debug")'],
        }],
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe('forbid_pattern');
    });
  });

  describe('modify action', () => {
    it('should warn when architecture cannot be determined', async () => {
      const result = await validatePlan('/project', {
        changes: [{ path: 'src/unknown.ts', action: 'modify' }],
      });

      expect(result.warnings.some(w => w.rule === 'unknown_arch')).toBe(true);
    });

    it('should validate constraints when archId is provided', async () => {
      const result = await validatePlan('/project', {
        changes: [{
          path: 'src/core/engine.ts',
          action: 'modify',
          archId: 'archcodex.core.engine',
          newImports: ['http'],
        }],
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe('forbid_import');
    });
  });

  describe('rename action', () => {
    it('should error when newPath is missing', async () => {
      const result = await validatePlan('/project', {
        changes: [{ path: 'src/old.ts', action: 'rename' }],
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe('missing_new_path');
    });

    it('should warn about layer changes on rename', async () => {
      const result = await validatePlan('/project', {
        changes: [{
          path: 'src/core/service.ts',
          action: 'rename',
          newPath: 'src/cli/service.ts',
        }],
      });

      expect(result.warnings.some(w => w.rule === 'layer_change')).toBe(true);
    });
  });

  describe('path sanitization', () => {
    it('should reject paths that traverse outside project root', async () => {
      const result = await validatePlan('/project', {
        changes: [{ path: '../../etc/passwd', action: 'create', archId: 'archcodex.core.engine' }],
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe('path_traversal');
    });

    it('should reject newPath that traverses outside project root', async () => {
      const result = await validatePlan('/project', {
        changes: [{
          path: 'src/old.ts',
          action: 'rename',
          newPath: '../../../etc/shadow',
        }],
      });

      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe('path_traversal');
    });

    it('should allow valid relative paths', async () => {
      const result = await validatePlan('/project', {
        changes: [{ path: 'src/core/new.ts', action: 'create', archId: 'archcodex.core.types' }],
      });

      expect(result.violations.some(v => v.rule === 'path_traversal')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty changes array', async () => {
      const result = await validatePlan('/project', { changes: [] });

      expect(result.valid).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle multiple changes', async () => {
      const result = await validatePlan('/project', {
        changes: [
          { path: 'src/core/a.ts', action: 'create', archId: 'archcodex.core.types' },
          { path: 'src/core/b.ts', action: 'create', archId: 'archcodex.core.types' },
        ],
      });

      expect(result.stats.filesChecked).toBe(2);
    });

    it('should deduplicate impacted files', async () => {
      const { globFiles, readFile } = await import('../../../../src/utils/file-system.js');
      const mockedGlob = vi.mocked(globFiles);
      const mockedRead = vi.mocked(readFile);

      mockedGlob.mockResolvedValue(['/project/src/cli/cmd.ts']);
      mockedRead.mockResolvedValue("import { engine } from '../core/engine';");

      const result = await validatePlan('/project', {
        changes: [
          { path: 'src/core/engine.ts', action: 'modify', archId: 'archcodex.core.types' },
          { path: 'src/core/engine.ts', action: 'delete' },
        ],
      });

      // Impacted files should be deduplicated
      const uniqueImpacted = new Set(result.impactedFiles);
      expect(result.impactedFiles.length).toBe(uniqueImpacted.size);
    });
  });
});
