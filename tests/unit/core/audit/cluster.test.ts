/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { clusterOverrides } from '../../../../src/core/audit/cluster.js';
import type { AuditReport } from '../../../../src/core/audit/types.js';

function makeReport(overrides: Array<{ file: string; rule: string; value: string; reason?: string }>): AuditReport {
  const fileMap = new Map<string, typeof overrides>();
  for (const o of overrides) {
    const list = fileMap.get(o.file) ?? [];
    list.push(o);
    fileMap.set(o.file, list);
  }

  return {
    files: Array.from(fileMap.entries()).map(([filePath, fileOverrides]) => ({
      filePath,
      archId: null,
      overrides: fileOverrides.map(o => ({
        rule: o.rule,
        value: o.value,
        reason: o.reason,
        line: 1,
        filePath: o.file,
        archId: null,
        status: 'active' as const,
        daysUntilExpiry: 30,
        errors: [],
        warnings: [],
      })),
      overrideCount: fileOverrides.length,
      hasExpired: false,
      hasExpiring: false,
    })),
    summary: {
      totalFiles: fileMap.size,
      filesWithOverrides: fileMap.size,
      totalOverrides: overrides.length,
      activeOverrides: overrides.length,
      expiringOverrides: 0,
      expiredOverrides: 0,
      invalidOverrides: 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

describe('clusterOverrides', () => {
  it('should return empty array when no overrides', () => {
    const report = makeReport([]);
    expect(clusterOverrides(report)).toEqual([]);
  });

  it('should not cluster single-file overrides', () => {
    const report = makeReport([
      { file: 'src/a.ts', rule: 'forbid_import', value: 'axios' },
    ]);
    expect(clusterOverrides(report)).toEqual([]);
  });

  it('should cluster overrides appearing in 2+ files', () => {
    const report = makeReport([
      { file: 'src/a.ts', rule: 'forbid_import', value: 'axios', reason: 'Legacy HTTP' },
      { file: 'src/b.ts', rule: 'forbid_import', value: 'axios', reason: 'Legacy client' },
    ]);

    const clusters = clusterOverrides(report);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].constraintKey).toBe('forbid_import:axios');
    expect(clusters[0].fileCount).toBe(2);
    expect(clusters[0].files).toContain('src/a.ts');
    expect(clusters[0].files).toContain('src/b.ts');
    expect(clusters[0].commonReasons).toHaveLength(2);
  });

  it('should sort clusters by file count descending', () => {
    const report = makeReport([
      { file: 'src/a.ts', rule: 'forbid_pattern', value: 'console' },
      { file: 'src/b.ts', rule: 'forbid_pattern', value: 'console' },
      { file: 'src/c.ts', rule: 'forbid_pattern', value: 'console' },
      { file: 'src/a.ts', rule: 'forbid_import', value: 'fs' },
      { file: 'src/b.ts', rule: 'forbid_import', value: 'fs' },
    ]);

    const clusters = clusterOverrides(report);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].fileCount).toBe(3); // console cluster first
    expect(clusters[1].fileCount).toBe(2); // fs cluster second
  });

  it('should generate a promote command', () => {
    const report = makeReport([
      { file: 'src/a.ts', rule: 'forbid_pattern', value: 'console', reason: 'CLI output' },
      { file: 'src/b.ts', rule: 'forbid_pattern', value: 'console', reason: 'CLI output' },
    ]);

    const clusters = clusterOverrides(report);
    expect(clusters[0].promoteCommand).toContain('archcodex promote');
    expect(clusters[0].promoteCommand).toContain('--intent');
  });

  it('should derive intent name from common reasons', () => {
    const report = makeReport([
      { file: 'src/a.ts', rule: 'forbid_pattern', value: 'console.log', reason: 'CLI output needed' },
      { file: 'src/b.ts', rule: 'forbid_pattern', value: 'console.log', reason: 'CLI output for user' },
    ]);

    const clusters = clusterOverrides(report);
    expect(clusters[0].suggestedIntent).toBe('cli-output');
  });

  it('should deduplicate files in clusters', () => {
    const report = makeReport([
      { file: 'src/a.ts', rule: 'forbid_import', value: 'fs' },
      { file: 'src/a.ts', rule: 'forbid_import', value: 'fs' }, // duplicate override in same file
      { file: 'src/b.ts', rule: 'forbid_import', value: 'fs' },
    ]);

    const clusters = clusterOverrides(report);
    expect(clusters[0].fileCount).toBe(2); // 2 unique files, not 3
  });
});
