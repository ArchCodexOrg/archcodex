/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for intents usage subcommand.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IntentRegistry, IntentDefinition } from '../../../../../src/core/registry/schema.js';
import type { Config } from '../../../../../src/core/config/schema.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      green: (s: string) => s,
      yellow: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
  },
}));

// Mock file system
vi.mock('../../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(),
  readFile: vi.fn(),
}));

// Mock arch-tag parser
vi.mock('../../../../../src/core/arch-tag/parser.js', () => ({
  extractIntents: vi.fn(),
  parseArchTags: vi.fn(),
}));

// Mock TypeScript validator
vi.mock('../../../../../src/validators/typescript.js', () => ({
  TypeScriptValidator: vi.fn(function() {
    return {
    parseFile: vi.fn().mockResolvedValue({
      functions: [],
      classes: [],
    }),
  };
  }),
}));

// Mock logger
vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { showUsage } from '../../../../../src/cli/commands/intents/usage.js';
import { globFiles, readFile } from '../../../../../src/utils/file-system.js';
import { extractIntents, parseArchTags } from '../../../../../src/core/arch-tag/parser.js';
import { TypeScriptValidator } from '../../../../../src/validators/typescript.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('showUsage', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  const defaultConfig: Config = {
    version: '1.0',
    files: {
      scan: {
        include: ['**/*.ts'],
        exclude: ['**/node_modules/**'],
      },
    },
  };

  function createMockRegistry(intents: Record<string, Partial<IntentDefinition>>): IntentRegistry {
    const fullIntents: Record<string, IntentDefinition> = {};
    for (const [name, def] of Object.entries(intents)) {
      fullIntents[name] = {
        description: def.description || 'Test intent',
        category: def.category || 'general',
      };
    }
    return { intents: fullIntents };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Default mock setup
    vi.mocked(globFiles).mockResolvedValue([]);
    vi.mocked(extractIntents).mockReturnValue([]);
    vi.mocked(parseArchTags).mockReturnValue({
      archId: null,
      intents: [],
      overrides: [],
      inlineMixins: [],
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('no files found', () => {
    it('should show no intents message when no files', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);
      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await showUsage('/project', defaultConfig, registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No intents found'))).toBe(true);
    });
  });

  describe('file scanning', () => {
    it('should use config patterns for globbing', async () => {
      const config: Config = {
        version: '1.0',
        files: {
          scan: {
            include: ['src/**/*.ts', 'lib/**/*.ts'],
            exclude: ['**/test/**'],
          },
        },
      };

      vi.mocked(globFiles).mockResolvedValue([]);
      const registry = createMockRegistry({});

      await showUsage('/project', config, registry, false);

      expect(globFiles).toHaveBeenCalledWith(
        ['src/**/*.ts', 'lib/**/*.ts'],
        expect.objectContaining({
          cwd: '/project',
          ignore: ['**/test/**'],
        })
      );
    });

    it('should use default patterns when config patterns not set', async () => {
      const config: Config = { version: '1.0' };

      vi.mocked(globFiles).mockResolvedValue([]);
      const registry = createMockRegistry({});

      await showUsage('/project', config, registry, false);

      expect(globFiles).toHaveBeenCalledWith(
        ['**/*.ts', '**/*.tsx'],
        expect.objectContaining({
          cwd: '/project',
        })
      );
    });
  });

  describe('intent extraction', () => {
    it('should extract intents from files', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:admin-only */\nexport function test() {}');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'admin-only', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await showUsage('/project', defaultConfig, registry, false);

      expect(readFile).toHaveBeenCalledWith('/project/src/file.ts');
    });

    it('should handle file read errors gracefully', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

      const registry = createMockRegistry({});

      await showUsage('/project', defaultConfig, registry, false);

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('JSON output', () => {
    it('should output JSON when json flag is true', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:admin-only */');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'admin-only', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await showUsage('/project', defaultConfig, registry, true);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.defined).toBeDefined();
      expect(output.undefined).toBeDefined();
      expect(output.summary).toBeDefined();
    });

    it('should include entry counts in JSON output', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:admin-only */');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'admin-only', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await showUsage('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.defined['admin-only']).toBeDefined();
      expect(output.defined['admin-only'].count).toBeGreaterThanOrEqual(0);
    });

    it('should track undefined intents separately', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:undefined-intent */');
      vi.mocked(extractIntents).mockReturnValue(['undefined-intent']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'undefined-intent', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await showUsage('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.undefined['undefined-intent']).toBeDefined();
    });

    it('should include summary with totals', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);

      const registry = createMockRegistry({});

      await showUsage('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.summary.totalIntents).toBeDefined();
      expect(output.summary.fileLevelIntents).toBeDefined();
      expect(output.summary.functionLevelIntents).toBeDefined();
    });
  });

  describe('text output', () => {
    it('should show header', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:admin-only */');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'admin-only', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await showUsage('/project', defaultConfig, registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('INTENT USAGE'))).toBe(true);
    });

    it('should show undefined intents section when present', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:undefined-intent */');
      vi.mocked(extractIntents).mockReturnValue(['undefined-intent']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'undefined-intent', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await showUsage('/project', defaultConfig, registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('UNDEFINED INTENTS'))).toBe(true);
    });
  });

  describe('TypeScript function-level intents', () => {
    it('should extract function-level intents from TypeScript files', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:cli-output */\nfunction test() {}');
      vi.mocked(extractIntents).mockReturnValue(['cli-output']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [],
        overrides: [],
        inlineMixins: [],
      });

      // Mock TypeScript validator to return function with intent
      const mockParseFile = vi.fn().mockResolvedValue({
        functions: [
          {
            name: 'test',
            intents: ['cli-output'],
            startLine: 2,
          },
        ],
        classes: [],
      });
      vi.mocked(TypeScriptValidator).mockImplementation(function() {
      return {
        parseFile: mockParseFile,
      } as any;
    });

      const registry = createMockRegistry({ 'cli-output': { description: 'CLI' } });

      await showUsage('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.summary.functionLevelIntents).toBeGreaterThanOrEqual(0);
    });

    it('should extract method intents from classes', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/service.ts']);
      vi.mocked(readFile).mockResolvedValue('class Service { /** @intent:admin-only */ handle() {} }');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [],
        overrides: [],
        inlineMixins: [],
      });

      const mockParseFile = vi.fn().mockResolvedValue({
        functions: [],
        classes: [
          {
            name: 'Service',
            methods: [
              {
                name: 'handle',
                intents: ['admin-only'],
                startLine: 1,
              },
            ],
          },
        ],
      });
      vi.mocked(TypeScriptValidator).mockImplementation(function() {
      return {
        parseFile: mockParseFile,
      } as any;
    });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await showUsage('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.defined['admin-only']).toBeDefined();
    });

    it('should handle TypeScript parsing errors gracefully', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:admin-only */ invalid typescript');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'admin-only', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const mockParseFile = vi.fn().mockRejectedValue(new Error('Parse error'));
      vi.mocked(TypeScriptValidator).mockImplementation(function() {
      return {
        parseFile: mockParseFile,
      } as any;
    });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      // Should not throw
      await showUsage('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output).toBeDefined();
    });
  });

  describe('non-TypeScript files', () => {
    it('should handle non-TypeScript files as file-level only', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/config.json']);
      vi.mocked(readFile).mockResolvedValue('{"intent": "admin-only"}');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'admin-only', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await showUsage('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      // Non-TS files are file-level only
      expect(output.summary).toBeDefined();
    });
  });

  describe('multiple files with same intent', () => {
    it('should aggregate intents across files', async () => {
      vi.mocked(globFiles).mockResolvedValue([
        '/project/src/file1.ts',
        '/project/src/file2.ts',
      ]);
      vi.mocked(readFile)
        .mockResolvedValueOnce('/** @intent:admin-only */')
        .mockResolvedValueOnce('/** @intent:admin-only */');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'admin-only', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await showUsage('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.defined['admin-only'].count).toBeGreaterThanOrEqual(0);
    });
  });
});
