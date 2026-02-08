/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for audit statistics extraction functions.
 */
import { describe, it, expect } from 'vitest';
import {
  findTopViolatedConstraints,
  findTopOverriddenArchitectures,
  findFilesWithMultipleOverrides,
} from '../../../../src/core/health/audit-stats.js';
import type { AuditReportForStats } from '../../../../src/core/health/audit-stats.js';

function createReport(files: AuditReportForStats['files']): AuditReportForStats {
  return { files };
}

describe('findTopViolatedConstraints', () => {
  it('should return empty array for no files', () => {
    const result = findTopViolatedConstraints(createReport([]));
    expect(result).toEqual([]);
  });

  it('should return empty array for files with no overrides', () => {
    const result = findTopViolatedConstraints(createReport([
      { filePath: 'src/a.ts', archId: 'core', overrides: [] },
      { filePath: 'src/b.ts', archId: 'core', overrides: [] },
    ]));
    expect(result).toEqual([]);
  });

  it('should count overrides by constraint key (rule:value)', () => {
    const result = findTopViolatedConstraints(createReport([
      {
        filePath: 'src/a.ts',
        archId: 'core',
        overrides: [
          { rule: 'forbid_import', value: 'axios' },
          { rule: 'max_file_lines', value: '200' },
        ],
      },
      {
        filePath: 'src/b.ts',
        archId: 'core',
        overrides: [
          { rule: 'forbid_import', value: 'axios' },
        ],
      },
    ]));

    expect(result).toHaveLength(2);
    // forbid_import:axios should be first (count 2)
    expect(result[0].constraint).toBe('forbid_import:axios');
    expect(result[0].overrideCount).toBe(2);
    expect(result[0].files).toEqual(['src/a.ts', 'src/b.ts']);
    // max_file_lines:200 should be second (count 1)
    expect(result[1].constraint).toBe('max_file_lines:200');
    expect(result[1].overrideCount).toBe(1);
  });

  it('should limit to top 5 constraints', () => {
    const files = [];
    for (let i = 0; i < 10; i++) {
      files.push({
        filePath: `src/file${i}.ts`,
        archId: 'core',
        overrides: [{ rule: `rule_${i}`, value: `val_${i}` }],
      });
    }
    // Add extra overrides for first 6 to create different counts
    for (let i = 0; i < 6; i++) {
      files.push({
        filePath: `src/extra${i}.ts`,
        archId: 'core',
        overrides: [{ rule: `rule_${i}`, value: `val_${i}` }],
      });
    }

    const result = findTopViolatedConstraints(createReport(files));
    expect(result).toHaveLength(5);
  });

  it('should sort by override count descending', () => {
    const result = findTopViolatedConstraints(createReport([
      {
        filePath: 'src/a.ts',
        archId: 'core',
        overrides: [{ rule: 'rule_low', value: 'x' }],
      },
      {
        filePath: 'src/b.ts',
        archId: 'core',
        overrides: [{ rule: 'rule_high', value: 'y' }],
      },
      {
        filePath: 'src/c.ts',
        archId: 'core',
        overrides: [{ rule: 'rule_high', value: 'y' }],
      },
      {
        filePath: 'src/d.ts',
        archId: 'core',
        overrides: [{ rule: 'rule_high', value: 'y' }],
      },
    ]));

    expect(result[0].constraint).toBe('rule_high:y');
    expect(result[0].overrideCount).toBe(3);
    expect(result[1].constraint).toBe('rule_low:x');
    expect(result[1].overrideCount).toBe(1);
  });

  it('should not duplicate file paths for same file with multiple overrides of same rule', () => {
    const result = findTopViolatedConstraints(createReport([
      {
        filePath: 'src/a.ts',
        archId: 'core',
        overrides: [
          { rule: 'forbid_import', value: 'axios' },
          { rule: 'forbid_import', value: 'axios' },
        ],
      },
    ]));

    expect(result[0].constraint).toBe('forbid_import:axios');
    expect(result[0].overrideCount).toBe(2);
    expect(result[0].files).toEqual(['src/a.ts']); // not duplicated
  });

  it('should handle files with null archId', () => {
    const result = findTopViolatedConstraints(createReport([
      {
        filePath: 'src/untagged.ts',
        archId: null,
        overrides: [{ rule: 'max_file_lines', value: '300' }],
      },
    ]));

    expect(result).toHaveLength(1);
    expect(result[0].files).toEqual(['src/untagged.ts']);
  });
});

describe('findTopOverriddenArchitectures', () => {
  it('should return empty array for no files', () => {
    const result = findTopOverriddenArchitectures(createReport([]));
    expect(result).toEqual([]);
  });

  it('should skip files with no archId', () => {
    const result = findTopOverriddenArchitectures(createReport([
      {
        filePath: 'src/a.ts',
        archId: null,
        overrides: [{ rule: 'forbid_import', value: 'axios' }],
      },
    ]));
    expect(result).toEqual([]);
  });

  it('should skip files with no overrides', () => {
    const result = findTopOverriddenArchitectures(createReport([
      { filePath: 'src/a.ts', archId: 'core.engine', overrides: [] },
    ]));
    expect(result).toEqual([]);
  });

  it('should aggregate overrides by architecture', () => {
    const result = findTopOverriddenArchitectures(createReport([
      {
        filePath: 'src/a.ts',
        archId: 'core.engine',
        overrides: [
          { rule: 'forbid_import', value: 'axios' },
          { rule: 'max_file_lines', value: '200' },
        ],
      },
      {
        filePath: 'src/b.ts',
        archId: 'core.engine',
        overrides: [{ rule: 'forbid_import', value: 'lodash' }],
      },
      {
        filePath: 'src/c.ts',
        archId: 'cli.command',
        overrides: [{ rule: 'max_file_lines', value: '300' }],
      },
    ]));

    expect(result).toHaveLength(2);
    // core.engine: 3 overrides, 2 files
    expect(result[0].archId).toBe('core.engine');
    expect(result[0].overrideCount).toBe(3);
    expect(result[0].filesWithOverrides).toBe(2);
    // cli.command: 1 override, 1 file
    expect(result[1].archId).toBe('cli.command');
    expect(result[1].overrideCount).toBe(1);
    expect(result[1].filesWithOverrides).toBe(1);
  });

  it('should sort by override count descending', () => {
    const result = findTopOverriddenArchitectures(createReport([
      {
        filePath: 'src/a.ts',
        archId: 'low-count',
        overrides: [{ rule: 'r1', value: 'v1' }],
      },
      {
        filePath: 'src/b.ts',
        archId: 'high-count',
        overrides: [
          { rule: 'r1', value: 'v1' },
          { rule: 'r2', value: 'v2' },
          { rule: 'r3', value: 'v3' },
        ],
      },
    ]));

    expect(result[0].archId).toBe('high-count');
    expect(result[1].archId).toBe('low-count');
  });

  it('should limit to top 10 architectures', () => {
    const files = [];
    for (let i = 0; i < 15; i++) {
      files.push({
        filePath: `src/file${i}.ts`,
        archId: `arch.${i}`,
        overrides: [{ rule: 'r1', value: 'v1' }],
      });
    }

    const result = findTopOverriddenArchitectures(createReport(files));
    expect(result).toHaveLength(10);
  });
});

describe('findFilesWithMultipleOverrides', () => {
  it('should return empty array for no files', () => {
    const result = findFilesWithMultipleOverrides(createReport([]));
    expect(result).toEqual([]);
  });

  it('should exclude files with fewer than 2 overrides', () => {
    const result = findFilesWithMultipleOverrides(createReport([
      { filePath: 'src/a.ts', archId: 'core', overrides: [] },
      {
        filePath: 'src/b.ts',
        archId: 'core',
        overrides: [{ rule: 'r1', value: 'v1' }],
      },
    ]));
    expect(result).toEqual([]);
  });

  it('should include files with 2 or more overrides', () => {
    const result = findFilesWithMultipleOverrides(createReport([
      {
        filePath: 'src/a.ts',
        archId: 'core.engine',
        overrides: [
          { rule: 'forbid_import', value: 'axios' },
          { rule: 'max_file_lines', value: '200' },
        ],
      },
    ]));

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/a.ts');
    expect(result[0].archId).toBe('core.engine');
    expect(result[0].overrideCount).toBe(2);
  });

  it('should sort by override count descending', () => {
    const result = findFilesWithMultipleOverrides(createReport([
      {
        filePath: 'src/low.ts',
        archId: 'core',
        overrides: [
          { rule: 'r1', value: 'v1' },
          { rule: 'r2', value: 'v2' },
        ],
      },
      {
        filePath: 'src/high.ts',
        archId: 'core',
        overrides: [
          { rule: 'r1', value: 'v1' },
          { rule: 'r2', value: 'v2' },
          { rule: 'r3', value: 'v3' },
          { rule: 'r4', value: 'v4' },
        ],
      },
    ]));

    expect(result[0].filePath).toBe('src/high.ts');
    expect(result[0].overrideCount).toBe(4);
    expect(result[1].filePath).toBe('src/low.ts');
    expect(result[1].overrideCount).toBe(2);
  });

  it('should limit to top 10 files', () => {
    const files = [];
    for (let i = 0; i < 15; i++) {
      files.push({
        filePath: `src/file${i}.ts`,
        archId: 'core',
        overrides: [
          { rule: 'r1', value: 'v1' },
          { rule: 'r2', value: 'v2' },
        ],
      });
    }

    const result = findFilesWithMultipleOverrides(createReport(files));
    expect(result).toHaveLength(10);
  });

  it('should handle null archId', () => {
    const result = findFilesWithMultipleOverrides(createReport([
      {
        filePath: 'src/untagged.ts',
        archId: null,
        overrides: [
          { rule: 'r1', value: 'v1' },
          { rule: 'r2', value: 'v2' },
        ],
      },
    ]));

    expect(result).toHaveLength(1);
    expect(result[0].archId).toBeNull();
  });

  it('should exclude files with exactly 1 override', () => {
    const result = findFilesWithMultipleOverrides(createReport([
      {
        filePath: 'src/single.ts',
        archId: 'core',
        overrides: [{ rule: 'r1', value: 'v1' }],
      },
      {
        filePath: 'src/double.ts',
        archId: 'core',
        overrides: [
          { rule: 'r1', value: 'v1' },
          { rule: 'r2', value: 'v2' },
        ],
      },
    ]));

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/double.ts');
  });
});
