/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for FeedbackAnalyzer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { FeedbackStore } from '../../../../src/core/feedback/store.js';
import { FeedbackAnalyzer } from '../../../../src/core/feedback/analyzer.js';
import type { ViolationEntry } from '../../../../src/core/feedback/types.js';

describe('FeedbackAnalyzer', () => {
  let tmpDir: string;
  let store: FeedbackStore;
  let analyzer: FeedbackAnalyzer;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-analyzer-'));
    await fs.mkdir(path.join(tmpDir, '.arch'), { recursive: true });
    store = new FeedbackStore(tmpDir);
    analyzer = new FeedbackAnalyzer(store);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function seedEntries(entries: Partial<ViolationEntry>[]): Promise<void> {
    const now = new Date().toISOString();
    const fullEntries = entries.map((e) => ({
      rule: 'forbid_import' as const,
      value: 'console',
      severity: 'error' as const,
      file: 'src/test.ts',
      archId: 'test.arch',
      timestamp: now,
      wasOverridden: false,
      ...e,
    }));

    const data = {
      version: '1.0',
      entries: fullEntries,
      metadata: {
        createdAt: now,
        lastUpdatedAt: now,
        projectRoot: tmpDir,
      },
    };
    await fs.writeFile(
      path.join(tmpDir, '.arch/feedback.json'),
      JSON.stringify(data)
    );
  }

  describe('generateReport', () => {
    it('should generate empty report when no data', async () => {
      const report = await analyzer.generateReport();
      expect(report.summary.totalViolations).toBe(0);
      expect(report.topViolations).toHaveLength(0);
      expect(report.recommendations).toHaveLength(0);
    });

    it('should aggregate violations by rule and value', async () => {
      await seedEntries([
        { rule: 'forbid_import', value: 'console', file: 'src/a.ts' },
        { rule: 'forbid_import', value: 'console', file: 'src/b.ts' },
        { rule: 'forbid_import', value: 'axios', file: 'src/c.ts' },
        { rule: 'max_file_lines', value: '500', file: 'src/d.ts' },
      ]);

      const report = await analyzer.generateReport();
      expect(report.summary.totalViolations).toBe(4);
      expect(report.summary.uniqueRules).toBe(2);
      expect(report.summary.uniqueFiles).toBe(4);

      // Top violation should be console (2 occurrences)
      expect(report.topViolations[0].value).toBe('console');
      expect(report.topViolations[0].count).toBe(2);
    });

    it('should track override counts', async () => {
      await seedEntries([
        { rule: 'forbid_import', value: 'console', wasOverridden: false },
        { rule: 'forbid_import', value: 'console', wasOverridden: true },
        { rule: 'forbid_import', value: 'console', wasOverridden: true },
      ]);

      const report = await analyzer.generateReport();
      expect(report.summary.totalOverrides).toBe(2);
      expect(report.topViolations[0].overrideCount).toBe(2);
    });
  });

  describe('recommendations', () => {
    it('should recommend relaxing constraint with high override ratio', async () => {
      // Create entries where most are overridden
      await seedEntries([
        { rule: 'forbid_import', value: 'console', wasOverridden: true, file: 'src/a.ts' },
        { rule: 'forbid_import', value: 'console', wasOverridden: true, file: 'src/b.ts' },
        { rule: 'forbid_import', value: 'console', wasOverridden: true, file: 'src/c.ts' },
        { rule: 'forbid_import', value: 'console', wasOverridden: false, file: 'src/d.ts' },
      ]);

      const report = await analyzer.generateReport({ minViolationCount: 3 });
      const relaxRec = report.recommendations.find((r) => r.type === 'relax_constraint');
      expect(relaxRec).toBeDefined();
      expect(relaxRec?.rule).toBe('forbid_import');
      expect(relaxRec?.value).toBe('console');
    });

    it('should recommend architecture update for single-arch violations', async () => {
      // All violations in same architecture
      await seedEntries([
        { rule: 'forbid_call', value: 'setTimeout', archId: 'my.arch', file: 'src/a.ts' },
        { rule: 'forbid_call', value: 'setTimeout', archId: 'my.arch', file: 'src/b.ts' },
        { rule: 'forbid_call', value: 'setTimeout', archId: 'my.arch', file: 'src/c.ts' },
        { rule: 'forbid_call', value: 'setTimeout', archId: 'my.arch', file: 'src/d.ts' },
        { rule: 'forbid_call', value: 'setTimeout', archId: 'my.arch', file: 'src/e.ts' },
      ]);

      const report = await analyzer.generateReport({ minViolationCount: 3 });
      const archRec = report.recommendations.find((r) => r.type === 'update_architecture');
      expect(archRec).toBeDefined();
      expect(archRec?.description).toContain('my.arch');
    });

    it('should recommend reviewing widespread patterns', async () => {
      // Many files, no overrides
      await seedEntries([
        { rule: 'max_file_lines', value: '500', file: 'src/a.ts', archId: 'arch1' },
        { rule: 'max_file_lines', value: '500', file: 'src/b.ts', archId: 'arch2' },
        { rule: 'max_file_lines', value: '500', file: 'src/c.ts', archId: 'arch3' },
        { rule: 'max_file_lines', value: '500', file: 'src/d.ts', archId: 'arch4' },
        { rule: 'max_file_lines', value: '500', file: 'src/e.ts', archId: 'arch5' },
      ]);

      const report = await analyzer.generateReport({ minViolationCount: 3 });
      const reviewRec = report.recommendations.find((r) => r.type === 'review_pattern');
      expect(reviewRec).toBeDefined();
      expect(reviewRec?.evidence.affectedFileCount).toBe(5);
    });
  });

  describe('getViolationStats', () => {
    it('should return stats grouped by rule and value', async () => {
      await seedEntries([
        { rule: 'forbid_import', value: 'console' },
        { rule: 'forbid_import', value: 'console' },
        { rule: 'forbid_import', value: 'axios' },
      ]);

      const stats = await analyzer.getViolationStats();
      expect(stats).toHaveLength(2);

      const consoleStat = stats.find((s) => s.value === 'console');
      expect(consoleStat?.count).toBe(2);

      const axiosStat = stats.find((s) => s.value === 'axios');
      expect(axiosStat?.count).toBe(1);
    });

    it('should track first and last seen timestamps', async () => {
      const older = new Date();
      older.setDate(older.getDate() - 5);
      const newer = new Date();

      await seedEntries([
        { rule: 'forbid_import', value: 'console', timestamp: older.toISOString() },
        { rule: 'forbid_import', value: 'console', timestamp: newer.toISOString() },
      ]);

      const stats = await analyzer.getViolationStats();
      expect(stats[0].firstSeen).toBe(older.toISOString());
      expect(stats[0].lastSeen).toBe(newer.toISOString());
    });
  });
});
