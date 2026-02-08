/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for YAML utility functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { parseYaml, parseYamlWithSchema, stringifyYaml, loadYaml, loadYamlWithSchema, writeYaml } from '../../../src/utils/yaml.js';
import { SystemError, ErrorCodes } from '../../../src/utils/errors.js';
import { readFile, writeFile } from '../../../src/utils/file-system.js';

// Mock file-system for async load/write functions
vi.mock('../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

describe('parseYaml', () => {
  it('should parse valid YAML string', () => {
    const yaml = `
name: test
version: 1.0
    `;
    const result = parseYaml<{ name: string; version: number }>(yaml);
    expect(result.name).toBe('test');
    expect(result.version).toBe(1.0);
  });

  it('should parse YAML with arrays', () => {
    const yaml = `
items:
  - one
  - two
  - three
    `;
    const result = parseYaml<{ items: string[] }>(yaml);
    expect(result.items).toEqual(['one', 'two', 'three']);
  });

  it('should parse YAML with nested objects', () => {
    const yaml = `
config:
  database:
    host: localhost
    port: 5432
    `;
    const result = parseYaml<{ config: { database: { host: string; port: number } } }>(yaml);
    expect(result.config.database.host).toBe('localhost');
    expect(result.config.database.port).toBe(5432);
  });

  it('should parse YAML with null values', () => {
    const yaml = `
value: null
another: ~
    `;
    const result = parseYaml<{ value: null; another: null }>(yaml);
    expect(result.value).toBeNull();
    expect(result.another).toBeNull();
  });

  it('should parse empty YAML', () => {
    const result = parseYaml<null>('');
    expect(result).toBeNull();
  });

  it('should throw SystemError for invalid YAML', () => {
    const invalidYaml = `
name: test
  invalid: indentation
    `;
    expect(() => parseYaml(invalidYaml)).toThrow(SystemError);
  });

  it('should include error message in thrown error', () => {
    try {
      parseYaml('{ invalid: yaml: content }');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SystemError);
      expect((error as SystemError).code).toBe(ErrorCodes.PARSE_ERROR);
    }
  });
});

describe('parseYamlWithSchema', () => {
  const testSchema = z.object({
    name: z.string(),
    version: z.number(),
    optional: z.string().optional(),
  });

  it('should parse and validate YAML matching schema', () => {
    const yaml = `
name: test
version: 1.0
    `;
    const result = parseYamlWithSchema(yaml, testSchema);
    expect(result.name).toBe('test');
    expect(result.version).toBe(1.0);
    expect(result.optional).toBeUndefined();
  });

  it('should parse YAML with optional fields', () => {
    const yaml = `
name: test
version: 1.0
optional: present
    `;
    const result = parseYamlWithSchema(yaml, testSchema);
    expect(result.optional).toBe('present');
  });

  it('should throw SystemError when schema validation fails', () => {
    const yaml = `
name: test
version: not-a-number
    `;
    expect(() => parseYamlWithSchema(yaml, testSchema)).toThrow(SystemError);
  });

  it('should throw with INVALID_REGISTRY code for validation errors', () => {
    const yaml = `
name: test
    `;
    try {
      parseYamlWithSchema(yaml, testSchema);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SystemError);
      expect((error as SystemError).code).toBe(ErrorCodes.INVALID_REGISTRY);
    }
  });

  it('should include validation error details', () => {
    const yaml = `
wrongField: test
    `;
    try {
      parseYamlWithSchema(yaml, testSchema);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SystemError);
      const systemError = error as SystemError;
      expect(systemError.details).toHaveProperty('errors');
    }
  });

  describe('with complex schemas', () => {
    const complexSchema = z.object({
      constraints: z.array(
        z.object({
          rule: z.string(),
          value: z.union([z.string(), z.array(z.string())]),
          severity: z.enum(['error', 'warning']),
        })
      ),
    });

    it('should validate complex nested structures', () => {
      const yaml = `
constraints:
  - rule: forbid_import
    value:
      - axios
      - http
    severity: error
  - rule: max_lines
    value: "500"
    severity: warning
      `;
      const result = parseYamlWithSchema(yaml, complexSchema);
      expect(result.constraints).toHaveLength(2);
      expect(result.constraints[0].rule).toBe('forbid_import');
      expect(result.constraints[0].value).toEqual(['axios', 'http']);
    });
  });
});

describe('stringifyYaml', () => {
  it('should stringify simple object', () => {
    const data = { name: 'test', version: 1.0 };
    const result = stringifyYaml(data);
    expect(result).toContain('name: test');
    expect(result).toContain('version: 1');
  });

  it('should stringify arrays', () => {
    const data = { items: ['a', 'b', 'c'] };
    const result = stringifyYaml(data);
    expect(result).toContain('items:');
    expect(result).toContain('- a');
    expect(result).toContain('- b');
    expect(result).toContain('- c');
  });

  it('should stringify nested objects', () => {
    const data = {
      config: {
        database: {
          host: 'localhost',
        },
      },
    };
    const result = stringifyYaml(data);
    expect(result).toContain('config:');
    expect(result).toContain('database:');
    expect(result).toContain('host: localhost');
  });

  it('should handle null values', () => {
    const data = { value: null };
    const result = stringifyYaml(data);
    expect(result).toContain('value: null');
  });

  it('should handle empty objects', () => {
    const result = stringifyYaml({});
    expect(result.trim()).toBe('{}');
  });

  it('should handle empty arrays', () => {
    const data = { items: [] };
    const result = stringifyYaml(data);
    expect(result).toContain('items: []');
  });

  it('should maintain proper indentation', () => {
    const data = {
      level1: {
        level2: {
          value: 'deep',
        },
      },
    };
    const result = stringifyYaml(data);
    const lines = result.split('\n');
    // Check that indentation increases for nested levels
    expect(lines.some(l => l.startsWith('  '))).toBe(true);
  });
});

describe('loadYaml', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should load and parse a YAML file', async () => {
    mockReadFile.mockResolvedValue('name: test\nversion: 1\n');

    const result = await loadYaml<{ name: string; version: number }>('/path/to/file.yaml');
    expect(result.name).toBe('test');
    expect(result.version).toBe(1);
    expect(mockReadFile).toHaveBeenCalledWith('/path/to/file.yaml');
  });

  it('should re-throw SystemError from readFile', async () => {
    const sysError = new SystemError(ErrorCodes.PARSE_ERROR, 'Read failed');
    mockReadFile.mockRejectedValue(sysError);

    await expect(loadYaml('/missing.yaml')).rejects.toThrow(sysError);
  });

  it('should wrap non-SystemError with file path context', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    try {
      await loadYaml('/missing.yaml');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SystemError);
      expect((error as SystemError).code).toBe(ErrorCodes.PARSE_ERROR);
      expect((error as SystemError).message).toContain('/missing.yaml');
    }
  });
});

describe('loadYamlWithSchema', () => {
  const schema = z.object({ name: z.string(), version: z.number() });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should load, parse, and validate a YAML file', async () => {
    mockReadFile.mockResolvedValue('name: test\nversion: 2\n');

    const result = await loadYamlWithSchema('/path/to/file.yaml', schema);
    expect(result.name).toBe('test');
    expect(result.version).toBe(2);
  });

  it('should re-throw SystemError with file path context on validation failure', async () => {
    mockReadFile.mockResolvedValue('name: test\n');

    try {
      await loadYamlWithSchema('/path/to/invalid.yaml', schema);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SystemError);
      expect((error as SystemError).message).toContain('/path/to/invalid.yaml');
    }
  });

  it('should wrap non-SystemError with file path context', async () => {
    mockReadFile.mockRejectedValue(new Error('Permission denied'));

    try {
      await loadYamlWithSchema('/path/to/file.yaml', schema);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SystemError);
      expect((error as SystemError).code).toBe(ErrorCodes.PARSE_ERROR);
      expect((error as SystemError).message).toContain('/path/to/file.yaml');
    }
  });
});

describe('writeYaml', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should stringify and write data to a file', async () => {
    mockWriteFile.mockResolvedValue(undefined);

    await writeYaml('/path/to/output.yaml', { name: 'test', items: [1, 2] });

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/path/to/output.yaml',
      expect.stringContaining('name: test'),
    );
  });
});
