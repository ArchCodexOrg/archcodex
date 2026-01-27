/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the fetch command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFetchCommand } from '../../../../src/cli/commands/fetch.js';

// Module-level mock configuration
interface MockResolveResult {
  success: boolean;
  content?: string;
  filePath?: string;
  fragmentContent?: string;
  error?: string;
}
let mockResolveResult: MockResolveResult = {
  success: true,
  content: 'file content',
  filePath: 'test.ts',
};
let mockResolveError: Error | null = null;
let mockLoadConfigError: Error | null = null;

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockImplementation(async () => {
    if (mockLoadConfigError) throw mockLoadConfigError;
    return {
      version: '1.0',
      pointers: {
        base_paths: {
          arch: '.arch/',
          code: 'src/',
          template: '.arch/templates/',
        },
      },
    };
  }),
}));

vi.mock('../../../../src/core/pointers/resolver.js', () => ({
  PointerResolver: vi.fn().mockImplementation(() => ({
    resolve: vi.fn().mockImplementation(async () => {
      if (mockResolveError) throw mockResolveError;
      return mockResolveResult;
    }),
  })),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

// Mock process.cwd
vi.spyOn(process, 'cwd').mockReturnValue('/test/project');

// Spy on console.log
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('fetch command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockResolveResult = {
      success: true,
      content: 'file content',
      filePath: 'test.ts',
    };
    mockResolveError = null;
    mockLoadConfigError = null;

    // Reset mocks
    const config = await import('../../../../src/core/config/loader.js');
    vi.mocked(config.loadConfig).mockImplementation(async () => {
      if (mockLoadConfigError) throw mockLoadConfigError;
      return {
        version: '1.0',
        pointers: {
          base_paths: {
            arch: '.arch/',
            code: 'src/',
            template: '.arch/templates/',
          },
        },
      };
    });

    const resolver = await import('../../../../src/core/pointers/resolver.js');
    vi.mocked(resolver.PointerResolver).mockImplementation(() => ({
      resolve: vi.fn().mockImplementation(async () => {
        if (mockResolveError) throw mockResolveError;
        return mockResolveResult;
      }),
    }));
  });

  describe('createFetchCommand', () => {
    it('should create a command with correct name', () => {
      const command = createFetchCommand();
      expect(command.name()).toBe('fetch');
    });

    it('should have the correct description', () => {
      const command = createFetchCommand();
      expect(command.description()).toContain('Fetch');
    });

    it('should have a required uri argument', () => {
      const command = createFetchCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('uri');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createFetchCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--config');
      expect(optionNames).toContain('--json');
    });
  });

  describe('runFetch', () => {
    it('should load config from default path', async () => {
      const config = await import('../../../../src/core/config/loader.js');

      const command = createFetchCommand();
      await command.parseAsync(['node', 'test', 'arch://docs/readme']);

      expect(config.loadConfig).toHaveBeenCalledWith('/test/project/.arch/config.yaml');
    });

    it('should load config from custom path', async () => {
      const config = await import('../../../../src/core/config/loader.js');

      const command = createFetchCommand();
      await command.parseAsync(['node', 'test', 'arch://docs/readme', '--config', 'custom/config.yaml']);

      expect(config.loadConfig).toHaveBeenCalledWith('/test/project/custom/config.yaml');
    });

    it('should create PointerResolver with correct options', async () => {
      const resolver = await import('../../../../src/core/pointers/resolver.js');

      const command = createFetchCommand();
      await command.parseAsync(['node', 'test', 'arch://docs/readme']);

      expect(resolver.PointerResolver).toHaveBeenCalledWith('/test/project', {
        archBasePath: '.arch/',
        codeBasePath: 'src/',
        templateBasePath: '.arch/templates/',
        allowedSchemes: ['arch', 'code', 'template'],
      });
    });

    it('should output content for successful fetch', async () => {
      mockResolveResult = {
        success: true,
        content: 'Hello World',
        filePath: '/test/project/.arch/docs/readme.md',
      };

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFetchCommand();
      await command.parseAsync(['node', 'test', 'arch://docs/readme']);

      expect(consoleSpy).toHaveBeenCalledWith('Hello World');
      expect(logger.logger.info).toHaveBeenCalledWith('Source: /test/project/.arch/docs/readme.md');
    });

    it('should output fragment content when present', async () => {
      mockResolveResult = {
        success: true,
        content: 'Full file content',
        fragmentContent: 'Just the fragment',
        filePath: '/test/project/src/utils.ts',
      };

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFetchCommand();
      await command.parseAsync(['node', 'test', 'code://utils#myFunction']);

      expect(consoleSpy).toHaveBeenCalledWith('Just the fragment');
      expect(logger.logger.info).toHaveBeenCalledWith('Fragment from: /test/project/src/utils.ts');
    });

    it('should output JSON when --json flag is provided', async () => {
      mockResolveResult = {
        success: true,
        content: 'Test content',
        filePath: 'test.ts',
      };

      const command = createFetchCommand();
      await command.parseAsync(['node', 'test', 'arch://docs/readme', '--json']);

      const jsonCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success"')
      );
      expect(jsonCall).toBeDefined();
    });

    it('should error when resolve fails', async () => {
      mockResolveResult = {
        success: false,
        error: 'File not found',
      };

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFetchCommand();
      await expect(
        command.parseAsync(['node', 'test', 'arch://nonexistent'])
      ).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Failed to fetch: File not found');
    });

    it('should handle config load errors', async () => {
      mockLoadConfigError = new Error('Config not found');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFetchCommand();
      await expect(
        command.parseAsync(['node', 'test', 'arch://docs/readme'])
      ).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Config not found');
    });

    it('should handle resolver errors', async () => {
      mockResolveError = new Error('Invalid URI format');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFetchCommand();
      await expect(
        command.parseAsync(['node', 'test', 'invalid://uri'])
      ).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Invalid URI format');
    });

    it('should handle non-Error exceptions', async () => {
      const config = await import('../../../../src/core/config/loader.js');
      vi.mocked(config.loadConfig).mockRejectedValue('string error');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFetchCommand();
      await expect(
        command.parseAsync(['node', 'test', 'arch://docs/readme'])
      ).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Unknown error');
    });

    it('should handle arch:// URI scheme', async () => {
      mockResolveResult = {
        success: true,
        content: 'Architecture doc content',
        filePath: '/test/project/.arch/docs/arch.md',
      };

      const command = createFetchCommand();
      await command.parseAsync(['node', 'test', 'arch://docs/arch']);

      expect(consoleSpy).toHaveBeenCalledWith('Architecture doc content');
    });

    it('should handle code:// URI scheme', async () => {
      mockResolveResult = {
        success: true,
        content: 'Source code content',
        filePath: '/test/project/src/utils.ts',
      };

      const command = createFetchCommand();
      await command.parseAsync(['node', 'test', 'code://utils.ts']);

      expect(consoleSpy).toHaveBeenCalledWith('Source code content');
    });

    it('should handle template:// URI scheme', async () => {
      mockResolveResult = {
        success: true,
        content: 'Template content {{name}}',
        filePath: '/test/project/.arch/templates/service.hbs',
      };

      const command = createFetchCommand();
      await command.parseAsync(['node', 'test', 'template://service.hbs']);

      expect(consoleSpy).toHaveBeenCalledWith('Template content {{name}}');
    });

    it('should output JSON even for failed results when --json is provided', async () => {
      mockResolveResult = {
        success: false,
        error: 'File not found',
      };

      const command = createFetchCommand();
      await command.parseAsync(['node', 'test', 'arch://nonexistent', '--json']);

      const jsonCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success": false')
      );
      expect(jsonCall).toBeDefined();
    });
  });
});
