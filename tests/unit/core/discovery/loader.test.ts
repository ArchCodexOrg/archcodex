/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadIndex,
  getIndexPath,
  indexExists,
} from '../../../../src/core/discovery/loader.js';

describe('discovery loader', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `archcodex-index-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(testDir, '.arch'), { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadIndex', () => {
    it('should return empty index when no file exists', async () => {
      const index = await loadIndex(testDir);

      expect(index.entries).toHaveLength(0);
      expect(index.version).toBe('1.0');
    });

    it('should load index from file', async () => {
      const indexContent = `
version: "1.0"
entries:
  - arch_id: domain.payment.processor
    description: Payment processing service
    keywords:
      - payment
      - billing
`;
      await writeFile(join(testDir, '.arch', 'index.yaml'), indexContent);

      const index = await loadIndex(testDir);

      expect(index.entries).toHaveLength(1);
      expect(index.entries[0].arch_id).toBe('domain.payment.processor');
      expect(index.entries[0].keywords).toContain('payment');
    });

    it('should load from custom path', async () => {
      const indexContent = `
version: "1.0"
entries:
  - arch_id: custom.arch
    description: Custom entry
    keywords:
      - custom
`;
      await writeFile(join(testDir, 'custom-index.yaml'), indexContent);

      const index = await loadIndex(testDir, 'custom-index.yaml');

      expect(index.entries).toHaveLength(1);
      expect(index.entries[0].arch_id).toBe('custom.arch');
    });

    it('should throw on invalid YAML', async () => {
      const invalidYaml = `
version: 1.0
entries: [[[invalid
`;
      await writeFile(join(testDir, '.arch', 'index.yaml'), invalidYaml);

      await expect(loadIndex(testDir)).rejects.toThrow();
    });

    it('should handle multiple entries', async () => {
      const indexContent = `
version: "1.0"
entries:
  - arch_id: domain.user.service
    description: User service
    keywords: [user, auth]
  - arch_id: domain.order.handler
    description: Order handler
    keywords: [order, cart]
  - arch_id: infra.database.repo
    description: Database repository
    keywords: [database, sql]
`;
      await writeFile(join(testDir, '.arch', 'index.yaml'), indexContent);

      const index = await loadIndex(testDir);

      expect(index.entries).toHaveLength(3);
    });
  });

  describe('getIndexPath', () => {
    it('should return correct path', () => {
      const path = getIndexPath('/project');

      expect(path).toContain('.arch');
      expect(path).toContain('index.yaml');
    });
  });

  describe('indexExists', () => {
    it('should return false when index does not exist', async () => {
      const emptyDir = join(testDir, 'empty');
      await mkdir(emptyDir);

      const exists = await indexExists(emptyDir);

      expect(exists).toBe(false);
    });

    it('should return true when index exists', async () => {
      await writeFile(join(testDir, '.arch', 'index.yaml'), 'version: "1.0"\nentries: []');

      const exists = await indexExists(testDir);

      expect(exists).toBe(true);
    });
  });
});
