/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { AuditScanner } from '../../../../src/core/audit/scanner.js';
import { getDefaultConfig } from '../../../../src/core/config/loader.js';
import type { Config } from '../../../../src/core/config/schema.js';

describe('AuditScanner', () => {
  let testDir: string;
  let config: Config;

  beforeEach(async () => {
    testDir = join(tmpdir(), `archcodex-audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(testDir, 'src'), { recursive: true });
    config = getDefaultConfig();
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('scan', () => {
    it('should return empty report when no overrides exist', async () => {
      await writeFile(
        join(testDir, 'src', 'service.ts'),
        `/**
 * @arch domain.service
 */
export class Service {}
`
      );

      const scanner = new AuditScanner(testDir, config);
      const report = await scanner.scan({ include: ['src/**/*.ts'] });

      expect(report.files).toHaveLength(0);
      expect(report.summary.totalOverrides).toBe(0);
    });

    it('should find active overrides', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);
      const expiryDate = futureDate.toISOString().split('T')[0];

      await writeFile(
        join(testDir, 'src', 'service.ts'),
        `/**
 * @arch domain.service
 * @override forbid_import:lodash
 * @reason Legacy code migration
 * @expires ${expiryDate}
 */
import lodash from 'lodash';
export class Service {}
`
      );

      const scanner = new AuditScanner(testDir, config);
      const report = await scanner.scan({ include: ['src/**/*.ts'] });

      expect(report.files).toHaveLength(1);
      expect(report.summary.totalOverrides).toBe(1);
      expect(report.summary.activeOverrides).toBe(1);
    });

    it('should find expiring overrides', async () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 15);
      const expiryDate = soonDate.toISOString().split('T')[0];

      await writeFile(
        join(testDir, 'src', 'service.ts'),
        `/**
 * @arch domain.service
 * @override forbid_import:lodash
 * @reason Legacy code migration
 * @expires ${expiryDate}
 */
import lodash from 'lodash';
`
      );

      const scanner = new AuditScanner(testDir, config);
      const report = await scanner.scan({
        include: ['src/**/*.ts'],
        expiringDays: 30,
      });

      expect(report.summary.expiringOverrides).toBe(1);
      expect(report.files[0].hasExpiring).toBe(true);
    });

    it('should find expired overrides', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);
      const expiryDate = pastDate.toISOString().split('T')[0];

      await writeFile(
        join(testDir, 'src', 'service.ts'),
        `/**
 * @arch domain.service
 * @override forbid_import:lodash
 * @reason Legacy code migration
 * @expires ${expiryDate}
 */
import lodash from 'lodash';
`
      );

      const scanner = new AuditScanner(testDir, config);
      const report = await scanner.scan({ include: ['src/**/*.ts'] });

      // Expired overrides are counted - may be marked as 'expired' or 'invalid'
      expect(report.files).toHaveLength(1);
      const override = report.files[0].overrides[0];
      expect(override.daysUntilExpiry).toBeLessThan(0);
    });

    it('should differentiate active and non-active overrides', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);
      const pastDateStr = pastDate.toISOString().split('T')[0];

      await writeFile(
        join(testDir, 'src', 'active.ts'),
        `/**
 * @arch domain.service
 * @override forbid_import:fs
 * @reason Active override
 * @expires ${futureDateStr}
 */
import fs from 'fs';
`
      );

      await writeFile(
        join(testDir, 'src', 'expired.ts'),
        `/**
 * @arch domain.service
 * @override forbid_import:http
 * @reason Expired override
 * @expires ${pastDateStr}
 */
import http from 'http';
`
      );

      const scanner = new AuditScanner(testDir, config);
      const report = await scanner.scan({
        include: ['src/**/*.ts'],
      });

      // Should find both files
      expect(report.files).toHaveLength(2);

      // Check that we can differentiate based on days until expiry
      const activeFile = report.files.find(f => f.filePath.includes('active'));
      const expiredFile = report.files.find(f => f.filePath.includes('expired'));

      expect(activeFile?.overrides[0].daysUntilExpiry).toBeGreaterThan(0);
      expect(expiredFile?.overrides[0].daysUntilExpiry).toBeLessThan(0);
    });

    it('should include arch_id in results', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);
      const expiryDate = futureDate.toISOString().split('T')[0];

      await writeFile(
        join(testDir, 'src', 'service.ts'),
        `/**
 * @arch domain.payment.service
 * @override forbid_import:lodash
 * @reason Legacy
 * @expires ${expiryDate}
 */
export class PaymentService {}
`
      );

      const scanner = new AuditScanner(testDir, config);
      const report = await scanner.scan({ include: ['src/**/*.ts'] });

      expect(report.files[0].archId).toBe('domain.payment.service');
    });

    it('should calculate days until expiry', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 45);
      const expiryDate = futureDate.toISOString().split('T')[0];

      await writeFile(
        join(testDir, 'src', 'service.ts'),
        `/**
 * @arch domain.service
 * @override forbid_import:lodash
 * @reason Legacy
 * @expires ${expiryDate}
 */
export class Service {}
`
      );

      const scanner = new AuditScanner(testDir, config);
      const report = await scanner.scan({ include: ['src/**/*.ts'] });

      const override = report.files[0].overrides[0];
      expect(override.daysUntilExpiry).toBeGreaterThan(40);
      expect(override.daysUntilExpiry).toBeLessThan(50);
    });

    it('should include generatedAt timestamp', async () => {
      const scanner = new AuditScanner(testDir, config);
      const report = await scanner.scan({ include: ['src/**/*.ts'] });

      expect(report.generatedAt).toBeDefined();
      expect(new Date(report.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
