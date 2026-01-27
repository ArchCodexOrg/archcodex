/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthAnalyzer } from '../../../../src/core/health/analyzer.js';
import type { Config } from '../../../../src/core/config/schema.js';

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockResolvedValue(['file1.ts', 'file2.ts', 'file3.ts']),
  readFile: vi.fn().mockImplementation((path: string) => {
    if (path.includes('file1')) return Promise.resolve('/** @arch archcodex.core */');
    if (path.includes('file2')) return Promise.resolve('/** @arch archcodex.cli */');
    return Promise.resolve('// no arch tag');
  }),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn().mockResolvedValue({
    filter: (files: string[]) => files,
  }),
}));

vi.mock('../../../../src/core/audit/scanner.js', () => ({
  AuditScanner: vi.fn().mockImplementation(() => ({
    scan: vi.fn().mockResolvedValue({
      files: [
        {
          filePath: 'src/test.ts',
          overrides: [
            { rule: 'forbid_import', value: 'lodash', status: 'active', expires: '2025-12-31' },
            { rule: 'max_file_lines', value: '500', status: 'expired' },
          ],
        },
      ],
      summary: {
        totalOverrides: 2,
        filesWithOverrides: 1,
        expiredOverrides: 1,
        expiringOverrides: 0,
      },
    }),
  })),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    nodes: {
      'base': { description: 'Base' },
      'archcodex.core': { inherits: 'base', description: 'Core' },
      'archcodex.cli': { inherits: 'base', description: 'CLI' },
      'archcodex.unused': { inherits: 'base', description: 'Unused' }, // Not used by files or inherited
    },
    mixins: {},
  }),
  listArchitectureIds: vi.fn().mockReturnValue(['base', 'archcodex.core', 'archcodex.cli', 'archcodex.unused']),
}));

const mockConfig: Config = {
  version: '1.0',
  registry: '.arch/registry.yaml',
  files: {
    scan: { include: ['**/*.ts'], exclude: ['**/node_modules/**'] },
    untagged: { policy: 'warn', require_in: [], exempt: [] },
  },
  validation: {
    fail_on_warning: false,
    max_overrides_per_file: 3,
    fail_on_expired_override: true,
    exit_codes: { success: 0, error: 1, warning_only: 0 },
  },
  hydration: { format: 'terse', include_why: true, show_inheritance: false, max_header_tokens: 500 },
  pointers: { base_paths: { arch: '.arch/docs', code: '.', template: '.arch/templates' }, default_extension: '.md' },
  overrides: { required_fields: ['reason'], optional_fields: ['expires', 'ticket', 'approved_by'], warn_no_expiry: true, max_expiry_days: 180 },
  llm: { default_provider: 'prompt', providers: {} },
  languages: {
    typescript: { enabled: true, skip_constraints: [], non_applicable_constraints: 'skip' },
    javascript: { enabled: true, skip_constraints: [], non_applicable_constraints: 'skip' },
    python: { enabled: false, skip_constraints: [], non_applicable_constraints: 'skip' },
    go: { enabled: false, skip_constraints: [], non_applicable_constraints: 'skip' },
    java: { enabled: false, skip_constraints: [], non_applicable_constraints: 'skip' },
  },
  packages: [],
  layers: [],
  inference: { use_builtin_rules: false, prepend_custom: true, validate_arch_ids: true },
};

describe('HealthAnalyzer', () => {
  let analyzer: HealthAnalyzer;

  beforeEach(() => {
    analyzer = new HealthAnalyzer('/test/project', mockConfig);
    vi.clearAllMocks();
  });

  describe('analyze', () => {
    it('generates a health report', async () => {
      const report = await analyzer.analyze();

      expect(report).toHaveProperty('overrideDebt');
      expect(report).toHaveProperty('coverage');
      expect(report).toHaveProperty('registryHealth');
      expect(report).toHaveProperty('topViolatedConstraints');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('generatedAt');
    });

    it('calculates override debt', async () => {
      const report = await analyzer.analyze();

      expect(report.overrideDebt.active).toBe(2);
      expect(report.overrideDebt.expired).toBe(1);
    });

    it('calculates coverage metrics', async () => {
      const report = await analyzer.analyze();

      expect(report.coverage.totalFiles).toBe(3);
      expect(report.coverage.taggedFiles).toBe(2);
      expect(report.coverage.untaggedFiles).toBe(1);
      expect(report.coverage.coveragePercent).toBe(67);
      expect(report.coverage.usedArchIds).toEqual(['archcodex.cli', 'archcodex.core']);
    });

    it('calculates registry health with unused architectures', async () => {
      const report = await analyzer.analyze();

      // base is inherited by others, so not unused
      // archcodex.core and archcodex.cli are used by files
      // archcodex.unused is truly unused (not inherited, not used by files)
      expect(report.registryHealth.totalArchitectures).toBe(4);
      expect(report.registryHealth.unusedArchitectures).toBe(1);
      expect(report.registryHealth.unusedArchIds).toContain('archcodex.unused');
      expect(report.registryHealth.unusedArchIds).not.toContain('base'); // inherited
    });

    it('generates recommendations for expired overrides', async () => {
      const report = await analyzer.analyze();

      const expiredRec = report.recommendations.find(r => r.title === 'Expired overrides');
      expect(expiredRec).toBeDefined();
      expect(expiredRec?.type).toBe('warning');
    });

    it('generates recommendations for low coverage', async () => {
      const report = await analyzer.analyze();

      const coverageRec = report.recommendations.find(r => r.title === 'Improve architecture coverage');
      expect(coverageRec).toBeDefined();
    });
  });
});
