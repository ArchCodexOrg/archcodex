/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadConfig,
  getDefaultConfig,
  mergeConfig,
  getConfigPath,
  configExists,
} from '../../../../src/core/config/loader.js';

describe('config loader', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `archcodex-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(testDir, '.arch'), { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getDefaultConfig', () => {
    it('should return a valid default config', () => {
      const config = getDefaultConfig();

      expect(config).toHaveProperty('validation');
      expect(config).toHaveProperty('hydration');
      expect(config.validation).toHaveProperty('fail_on_warning');
    });

    it('should have sensible defaults', () => {
      const config = getDefaultConfig();

      expect(config.validation.fail_on_warning).toBe(false);
      expect(config.hydration.format).toBe('terse');
    });
  });

  describe('loadConfig', () => {
    it('should return default config when no config file exists', async () => {
      const config = await loadConfig(testDir);
      const defaults = getDefaultConfig();

      expect(config).toEqual(defaults);
    });

    it('should load config from file', async () => {
      const configContent = `
validation:
  fail_on_warning: true
  max_overrides_per_file: 5
`;
      await writeFile(join(testDir, '.arch', 'config.yaml'), configContent);

      const config = await loadConfig(testDir);

      expect(config.validation.fail_on_warning).toBe(true);
      expect(config.validation.max_overrides_per_file).toBe(5);
    });

    it('should merge with defaults', async () => {
      const configContent = `
validation:
  fail_on_warning: true
`;
      await writeFile(join(testDir, '.arch', 'config.yaml'), configContent);

      const config = await loadConfig(testDir);

      // Explicitly set value
      expect(config.validation.fail_on_warning).toBe(true);
      // Default value still present
      expect(config.hydration.format).toBe('terse');
    });

    it('should load from custom path', async () => {
      const customConfigContent = `
validation:
  fail_on_warning: true
`;
      await writeFile(join(testDir, 'custom-config.yaml'), customConfigContent);

      const config = await loadConfig(testDir, 'custom-config.yaml');

      expect(config.validation.fail_on_warning).toBe(true);
    });

    it('should throw on invalid YAML', async () => {
      const invalidYaml = `
validation:
  fail_on_warning: [[[invalid
`;
      await writeFile(join(testDir, '.arch', 'config.yaml'), invalidYaml);

      await expect(loadConfig(testDir)).rejects.toThrow();
    });
  });

  describe('mergeConfig', () => {
    it('should merge partial config with defaults', () => {
      const partial = {
        validation: {
          fail_on_warning: true,
        },
      };

      const config = mergeConfig(partial as Partial<ReturnType<typeof getDefaultConfig>>);

      expect(config.validation.fail_on_warning).toBe(true);
      expect(config.hydration.format).toBe('terse');
    });

    it('should handle empty partial', () => {
      const config = mergeConfig({});
      const defaults = getDefaultConfig();

      expect(config).toEqual(defaults);
    });
  });

  describe('getConfigPath', () => {
    it('should return correct path', () => {
      const path = getConfigPath('/project');

      expect(path).toContain('.arch');
      expect(path).toContain('config.yaml');
    });
  });

  describe('configExists', () => {
    it('should return false when config does not exist', async () => {
      const emptyDir = join(testDir, 'empty');
      await mkdir(emptyDir);

      const exists = await configExists(emptyDir);

      expect(exists).toBe(false);
    });

    it('should return true when config exists', async () => {
      await writeFile(join(testDir, '.arch', 'config.yaml'), 'validation: {}');

      const exists = await configExists(testDir);

      expect(exists).toBe(true);
    });
  });
});
