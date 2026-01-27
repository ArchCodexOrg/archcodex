/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for FeedbackStore.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { FeedbackStore } from '../../../../src/core/feedback/store.js';
import type { ValidationResult } from '../../../../src/core/validation/types.js';

describe('FeedbackStore', () => {
  let tmpDir: string;
  let store: FeedbackStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-feedback-'));
    await fs.mkdir(path.join(tmpDir, '.arch'), { recursive: true });
    store = new FeedbackStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('should create empty data if file does not exist', async () => {
      const data = await store.load();
      expect(data.version).toBe('1.0');
      expect(data.entries).toHaveLength(0);
      expect(data.metadata.projectRoot).toBe(tmpDir);
    });

    it('should load existing data', async () => {
      const existingData = {
        version: '1.0',
        entries: [
          {
            rule: 'forbid_import',
            value: 'console',
            severity: 'error',
            file: 'src/test.ts',
            archId: 'test.arch',
            timestamp: '2024-01-01T00:00:00.000Z',
            wasOverridden: false,
          },
        ],
        metadata: {
          createdAt: '2024-01-01T00:00:00.000Z',
          lastUpdatedAt: '2024-01-01T00:00:00.000Z',
          projectRoot: tmpDir,
        },
      };
      await fs.writeFile(
        path.join(tmpDir, '.arch/feedback.json'),
        JSON.stringify(existingData)
      );

      const data = await store.load();
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].rule).toBe('forbid_import');
    });
  });

  describe('recordViolations', () => {
    it('should record violations from validation results', async () => {
      const results: ValidationResult[] = [
        {
          status: 'fail',
          file: 'src/test.ts',
          archId: 'test.arch',
          inheritanceChain: [],
          mixinsApplied: [],
          violations: [
            {
              code: 'E001',
              rule: 'forbid_import',
              value: 'console',
              severity: 'error',
              line: 1,
              column: 1,
              message: 'Import forbidden',
              source: 'test.arch',
            },
          ],
          warnings: [],
          overridesActive: [],
          passed: false,
          errorCount: 1,
          warningCount: 0,
          timing: { parseMs: 0, resolutionMs: 0, validationMs: 0, totalMs: 0 },
        },
      ];

      const count = await store.recordViolations(results);
      expect(count).toBe(1);

      const data = await store.load();
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].rule).toBe('forbid_import');
      expect(data.entries[0].file).toBe('src/test.ts');
      expect(data.entries[0].wasOverridden).toBe(false);
    });

    it('should mark overridden violations', async () => {
      const results: ValidationResult[] = [
        {
          status: 'warn',
          file: 'src/test.ts',
          archId: 'test.arch',
          inheritanceChain: [],
          mixinsApplied: [],
          violations: [],
          warnings: [
            {
              code: 'E001',
              rule: 'forbid_import',
              value: 'console',
              severity: 'warning',
              line: 1,
              column: 1,
              message: '[OVERRIDDEN] Import forbidden',
              source: 'test.arch',
            },
          ],
          overridesActive: [],
          passed: true,
          errorCount: 0,
          warningCount: 1,
          timing: { parseMs: 0, resolutionMs: 0, validationMs: 0, totalMs: 0 },
        },
      ];

      await store.recordViolations(results);
      const data = await store.load();
      expect(data.entries[0].wasOverridden).toBe(true);
    });
  });

  describe('getEntries', () => {
    it('should filter by days', async () => {
      // Create store with old and new entries
      const now = new Date();
      const oldDate = new Date(now);
      oldDate.setDate(oldDate.getDate() - 60);

      const existingData = {
        version: '1.0',
        entries: [
          {
            rule: 'forbid_import',
            value: 'old',
            severity: 'error',
            file: 'src/old.ts',
            archId: 'test',
            timestamp: oldDate.toISOString(),
            wasOverridden: false,
          },
          {
            rule: 'forbid_import',
            value: 'new',
            severity: 'error',
            file: 'src/new.ts',
            archId: 'test',
            timestamp: now.toISOString(),
            wasOverridden: false,
          },
        ],
        metadata: {
          createdAt: oldDate.toISOString(),
          lastUpdatedAt: now.toISOString(),
          projectRoot: tmpDir,
        },
      };
      await fs.writeFile(
        path.join(tmpDir, '.arch/feedback.json'),
        JSON.stringify(existingData)
      );

      const entries = await store.getEntries({ days: 30 });
      expect(entries).toHaveLength(1);
      expect(entries[0].value).toBe('new');
    });

    it('should filter by rule', async () => {
      const existingData = {
        version: '1.0',
        entries: [
          {
            rule: 'forbid_import',
            value: 'console',
            severity: 'error',
            file: 'src/test.ts',
            archId: 'test',
            timestamp: new Date().toISOString(),
            wasOverridden: false,
          },
          {
            rule: 'max_file_lines',
            value: '500',
            severity: 'warning',
            file: 'src/test.ts',
            archId: 'test',
            timestamp: new Date().toISOString(),
            wasOverridden: false,
          },
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
          projectRoot: tmpDir,
        },
      };
      await fs.writeFile(
        path.join(tmpDir, '.arch/feedback.json'),
        JSON.stringify(existingData)
      );

      const entries = await store.getEntries({ rule: 'forbid_import' });
      expect(entries).toHaveLength(1);
      expect(entries[0].rule).toBe('forbid_import');
    });
  });

  describe('pruneOldEntries', () => {
    it('should remove entries older than specified days', async () => {
      const now = new Date();
      const oldDate = new Date(now);
      oldDate.setDate(oldDate.getDate() - 100);

      const existingData = {
        version: '1.0',
        entries: [
          {
            rule: 'forbid_import',
            value: 'old',
            severity: 'error',
            file: 'src/old.ts',
            archId: 'test',
            timestamp: oldDate.toISOString(),
            wasOverridden: false,
          },
          {
            rule: 'forbid_import',
            value: 'new',
            severity: 'error',
            file: 'src/new.ts',
            archId: 'test',
            timestamp: now.toISOString(),
            wasOverridden: false,
          },
        ],
        metadata: {
          createdAt: oldDate.toISOString(),
          lastUpdatedAt: now.toISOString(),
          projectRoot: tmpDir,
        },
      };
      await fs.writeFile(
        path.join(tmpDir, '.arch/feedback.json'),
        JSON.stringify(existingData)
      );

      const prunedCount = await store.pruneOldEntries(90);
      expect(prunedCount).toBe(1);

      const data = await store.load();
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].value).toBe('new');
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      const existingData = {
        version: '1.0',
        entries: [
          {
            rule: 'forbid_import',
            value: 'console',
            severity: 'error',
            file: 'src/test.ts',
            archId: 'test',
            timestamp: new Date().toISOString(),
            wasOverridden: false,
          },
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
          projectRoot: tmpDir,
        },
      };
      await fs.writeFile(
        path.join(tmpDir, '.arch/feedback.json'),
        JSON.stringify(existingData)
      );

      await store.clear();
      const data = await store.load();
      expect(data.entries).toHaveLength(0);
    });
  });
});
