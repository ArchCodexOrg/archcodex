/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// We need to import these after mocking
let loadArchConfig: typeof import('../../../src/utils/archconfig.js').loadArchConfig;
let getApiKey: typeof import('../../../src/utils/archconfig.js').getApiKey;
let archConfigExists: typeof import('../../../src/utils/archconfig.js').archConfigExists;

describe('archconfig', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `archcodex-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });

    // Fresh import for each test
    vi.resetModules();
    const mod = await import('../../../src/utils/archconfig.js');
    loadArchConfig = mod.loadArchConfig;
    getApiKey = mod.getApiKey;
    archConfigExists = mod.archConfigExists;
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  describe('loadArchConfig', () => {
    it('should return empty config when no .archconfig exists', async () => {
      const config = await loadArchConfig(testDir);
      expect(config).toEqual({});
    });

    it('should parse KEY=value format', async () => {
      await writeFile(join(testDir, '.archconfig'), 'OPENAI_API_KEY=sk-test123\n');

      const config = await loadArchConfig(testDir);
      expect(config.openai_api_key).toBe('sk-test123');
    });

    it('should parse keys case-insensitively', async () => {
      await writeFile(join(testDir, '.archconfig'), 'OpenAI_API_Key=sk-mixed\n');

      const config = await loadArchConfig(testDir);
      expect(config.openai_api_key).toBe('sk-mixed');
    });

    it('should handle quoted values', async () => {
      await writeFile(
        join(testDir, '.archconfig'),
        'OPENAI_API_KEY="sk-quoted"\nANTHROPIC_API_KEY=\'sk-single\'\n'
      );

      const config = await loadArchConfig(testDir);
      expect(config.openai_api_key).toBe('sk-quoted');
      expect(config.anthropic_api_key).toBe('sk-single');
    });

    it('should skip comments and empty lines', async () => {
      await writeFile(
        join(testDir, '.archconfig'),
        '# This is a comment\n\nOPENAI_API_KEY=sk-valid\n# Another comment\n'
      );

      const config = await loadArchConfig(testDir);
      expect(config.openai_api_key).toBe('sk-valid');
      expect(Object.keys(config).length).toBe(1);
    });

    it('should handle values with equals signs', async () => {
      await writeFile(join(testDir, '.archconfig'), 'SOME_KEY=value=with=equals\n');

      const config = await loadArchConfig(testDir);
      expect(config.some_key).toBe('value=with=equals');
    });

    it('should handle multiple keys', async () => {
      await writeFile(
        join(testDir, '.archconfig'),
        'OPENAI_API_KEY=sk-openai\nANTHROPIC_API_KEY=sk-anthropic\nMISTRAL_API_KEY=sk-mistral\n'
      );

      const config = await loadArchConfig(testDir);
      expect(config.openai_api_key).toBe('sk-openai');
      expect(config.anthropic_api_key).toBe('sk-anthropic');
      expect(config.mistral_api_key).toBe('sk-mistral');
    });
  });

  describe('getApiKey', () => {
    it('should return key from config', () => {
      const config = { openai_api_key: 'sk-from-config' };
      expect(getApiKey(config, 'openai')).toBe('sk-from-config');
    });

    it('should fall back to environment variable', () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-from-env';

      try {
        const config = {};
        expect(getApiKey(config, 'openai')).toBe('sk-from-env');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should prefer config over environment', () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-from-env';

      try {
        const config = { openai_api_key: 'sk-from-config' };
        expect(getApiKey(config, 'openai')).toBe('sk-from-config');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should support anthropic provider', () => {
      const config = { anthropic_api_key: 'sk-anthropic' };
      expect(getApiKey(config, 'anthropic')).toBe('sk-anthropic');
    });

    it('should support mistral provider', () => {
      const config = { mistral_api_key: 'sk-mistral' };
      expect(getApiKey(config, 'mistral')).toBe('sk-mistral');
    });

    it('should return undefined when key not found', () => {
      const config = {};
      expect(getApiKey(config, 'openai')).toBeUndefined();
    });
  });

  describe('archConfigExists', () => {
    it('should return false when no config exists', () => {
      expect(archConfigExists(testDir)).toBe(false);
    });

    it('should return true when project config exists', async () => {
      await writeFile(join(testDir, '.archconfig'), 'KEY=value\n');
      expect(archConfigExists(testDir)).toBe(true);
    });
  });
});
