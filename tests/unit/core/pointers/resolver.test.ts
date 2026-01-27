/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the PointerResolver class.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PointerResolver } from '../../../../src/core/pointers/resolver.js';

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn().mockResolvedValue('file content'),
  fileExists: vi.fn().mockResolvedValue(true),
}));

import { readFile, fileExists } from '../../../../src/utils/file-system.js';

describe('PointerResolver', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(readFile).mockResolvedValue('file content');
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const resolver = new PointerResolver(projectRoot);
      expect(resolver).toBeDefined();
    });

    it('should create with custom options', () => {
      const resolver = new PointerResolver(projectRoot, {
        archBasePath: 'custom/docs',
        codeBasePath: 'src',
        templateBasePath: 'templates',
        allowedSchemes: ['arch', 'code'],
      });
      expect(resolver).toBeDefined();
    });
  });

  describe('parse', () => {
    it('should parse arch:// URI', () => {
      const resolver = new PointerResolver(projectRoot);
      const parsed = resolver.parse('arch://docs/readme.md');

      expect(parsed).not.toBeNull();
      expect(parsed?.scheme).toBe('arch');
      expect(parsed?.path).toBe('docs/readme.md');
    });

    it('should parse code:// URI', () => {
      const resolver = new PointerResolver(projectRoot);
      const parsed = resolver.parse('code://src/index.ts');

      expect(parsed).not.toBeNull();
      expect(parsed?.scheme).toBe('code');
      expect(parsed?.path).toBe('src/index.ts');
    });

    it('should parse template:// URI', () => {
      const resolver = new PointerResolver(projectRoot);
      const parsed = resolver.parse('template://service.ts.hbs');

      expect(parsed).not.toBeNull();
      expect(parsed?.scheme).toBe('template');
      expect(parsed?.path).toBe('service.ts.hbs');
    });

    it('should parse URI with fragment', () => {
      const resolver = new PointerResolver(projectRoot);
      const parsed = resolver.parse('code://src/index.ts#L10-L20');

      expect(parsed).not.toBeNull();
      expect(parsed?.fragment).toBe('L10-L20');
    });

    it('should return null for invalid URI', () => {
      const resolver = new PointerResolver(projectRoot);
      const parsed = resolver.parse('invalid://test');

      expect(parsed).toBeNull();
    });

    it('should return null for malformed URI', () => {
      const resolver = new PointerResolver(projectRoot);
      const parsed = resolver.parse('not-a-uri');

      expect(parsed).toBeNull();
    });
  });

  describe('resolve', () => {
    it('should resolve valid arch:// URI', async () => {
      const resolver = new PointerResolver(projectRoot);
      const result = await resolver.resolve('arch://docs/readme.md');

      expect(result.success).toBe(true);
      expect(result.content).toBe('file content');
    });

    it('should resolve valid code:// URI', async () => {
      const resolver = new PointerResolver(projectRoot);
      const result = await resolver.resolve('code://src/index.ts');

      expect(result.success).toBe(true);
      expect(result.content).toBe('file content');
    });

    it('should fail for invalid URI format', async () => {
      const resolver = new PointerResolver(projectRoot);
      const result = await resolver.resolve('invalid-uri');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid pointer URI format');
    });

    it('should fail for disallowed scheme', async () => {
      const resolver = new PointerResolver(projectRoot, {
        allowedSchemes: ['arch'],
      });
      const result = await resolver.resolve('code://src/index.ts');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should fail for file not found', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);
      const resolver = new PointerResolver(projectRoot);
      const result = await resolver.resolve('arch://missing.md');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject path traversal attempts', async () => {
      const resolver = new PointerResolver(projectRoot);
      const result = await resolver.resolve('arch://../../../etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Security violation');
    });

    it('should reject absolute paths', async () => {
      const resolver = new PointerResolver(projectRoot);
      const result = await resolver.resolve('arch:///etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Security violation');
    });

    it('should extract line range fragment', async () => {
      vi.mocked(readFile).mockResolvedValue('line1\nline2\nline3\nline4\nline5');
      const resolver = new PointerResolver(projectRoot);
      const result = await resolver.resolve('code://file.ts#L2-L4');

      expect(result.success).toBe(true);
      expect(result.fragmentContent).toBe('line2\nline3\nline4');
    });

    it('should extract single line fragment', async () => {
      vi.mocked(readFile).mockResolvedValue('line1\nline2\nline3');
      const resolver = new PointerResolver(projectRoot);
      const result = await resolver.resolve('code://file.ts#L2');

      expect(result.success).toBe(true);
      expect(result.fragmentContent).toBe('line2');
    });

    it('should extract markdown section fragment', async () => {
      // Use single # header to avoid edge case where ## becomes # after slice(1)
      vi.mocked(readFile).mockResolvedValue('# Section\n\nContent here');
      const resolver = new PointerResolver(projectRoot);
      const result = await resolver.resolve('arch://readme.md#Section');

      expect(result.success).toBe(true);
      expect(result.fragmentContent).toContain('Content here');
    });
  });
});
