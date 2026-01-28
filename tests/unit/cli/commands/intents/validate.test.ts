/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for intents validate subcommand.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IntentRegistry, IntentDefinition } from '../../../../../src/core/registry/schema.js';
import type { Config } from '../../../../../src/core/config/schema.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      yellow: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
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

// Mock pattern matcher
vi.mock('../../../../../src/utils/pattern-matcher.js', () => ({
  patternMatches: vi.fn(),
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
  },
}));

import { validateIntents } from '../../../../../src/cli/commands/intents/validate.js';
import { globFiles, readFile } from '../../../../../src/utils/file-system.js';
import { extractIntents, parseArchTags } from '../../../../../src/core/arch-tag/parser.js';
import { patternMatches } from '../../../../../src/utils/pattern-matcher.js';
import { TypeScriptValidator } from '../../../../../src/validators/typescript.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('validateIntents', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

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
        requires: def.requires,
        forbids: def.forbids,
        conflicts_with: def.conflicts_with,
      };
    }
    return { intents: fullIntents };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Default mock setup
    vi.mocked(globFiles).mockResolvedValue([]);
    vi.mocked(extractIntents).mockReturnValue([]);
    vi.mocked(parseArchTags).mockReturnValue({
      archId: null,
      intents: [],
      overrides: [],
      inlineMixins: [],
    });
    vi.mocked(patternMatches).mockReturnValue(false);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('no files found', () => {
    it('should report success when no intents found', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);
      const registry = createMockRegistry({});

      await validateIntents('/project', defaultConfig, registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('validated successfully'))).toBe(true);
    });
  });

  describe('undefined intents', () => {
    it('should report undefined intents', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:unknown-intent */');
      vi.mocked(extractIntents).mockReturnValue(['unknown-intent']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'unknown-intent', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      try {
        await validateIntents('/project', defaultConfig, registry, false);
      } catch {
        // Expected - process.exit
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes("Unknown intent '@intent:unknown-intent'"))).toBe(true);
    });
  });

  describe('missing required patterns', () => {
    it('should report when required pattern is missing', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:admin-only */\nexport function test() {}');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'admin-only', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });
      vi.mocked(patternMatches).mockReturnValue(false);

      const registry = createMockRegistry({
        'admin-only': {
          description: 'Admin',
          requires: ['checkPermission'],
        },
      });

      try {
        await validateIntents('/project', defaultConfig, registry, false);
      } catch {
        // Expected - process.exit
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes("requires pattern 'checkPermission'"))).toBe(true);
    });

    it('should pass when required pattern is found', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:admin-only */\ncheckPermission()');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'admin-only', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });
      vi.mocked(patternMatches).mockReturnValue(true);

      const registry = createMockRegistry({
        'admin-only': {
          description: 'Admin',
          requires: ['checkPermission'],
        },
      });

      await validateIntents('/project', defaultConfig, registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('validated successfully'))).toBe(true);
    });
  });

  describe('forbidden patterns', () => {
    it('should report when forbidden pattern is found', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:secure */\nconsole.log(password)');
      vi.mocked(extractIntents).mockReturnValue(['secure']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'secure', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });
      vi.mocked(patternMatches).mockReturnValue(true);

      const registry = createMockRegistry({
        'secure': {
          description: 'Secure',
          forbids: ['console\\.log'],
        },
      });

      try {
        await validateIntents('/project', defaultConfig, registry, false);
      } catch {
        // Expected - process.exit
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('forbids pattern'))).toBe(true);
    });
  });

  describe('conflicting intents', () => {
    it('should report conflicting intents in same file', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:admin-only\n * @intent:public-endpoint */');
      vi.mocked(extractIntents).mockReturnValue(['admin-only', 'public-endpoint']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [
          { name: 'admin-only', line: 1, column: 1 },
          { name: 'public-endpoint', line: 2, column: 1 },
        ],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({
        'admin-only': {
          description: 'Admin',
          conflicts_with: ['public-endpoint'],
        },
        'public-endpoint': {
          description: 'Public',
        },
      });

      try {
        await validateIntents('/project', defaultConfig, registry, false);
      } catch {
        // Expected - process.exit
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes("conflicts with '@intent:public-endpoint'"))).toBe(true);
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

      await validateIntents('/project', defaultConfig, registry, true);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.totalIntents).toBe(1);
      expect(output.issues).toBeDefined();
      expect(output.passed).toBe(true);
    });

    it('should include issue details in JSON output', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:unknown */');
      vi.mocked(extractIntents).mockReturnValue(['unknown']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'unknown', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({});

      await validateIntents('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.issues.length).toBe(1);
      expect(output.issues[0].type).toBe('undefined');
      expect(output.passed).toBe(false);
    });

    it('should include file and function level counts in JSON', async () => {
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

      await validateIntents('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.fileLevelIntents).toBeDefined();
      expect(output.functionLevelIntents).toBeDefined();
    });
  });

  describe('text output', () => {
    it('should show header', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);
      const registry = createMockRegistry({});

      await validateIntents('/project', defaultConfig, registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('INTENT VALIDATION'))).toBe(true);
    });

    it('should show total count', async () => {
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

      await validateIntents('/project', defaultConfig, registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Total intents:'))).toBe(true);
    });

    it('should group issues by type', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:unknown */');
      vi.mocked(extractIntents).mockReturnValue(['unknown']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'unknown', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({});

      try {
        await validateIntents('/project', defaultConfig, registry, false);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Undefined Intents'))).toBe(true);
    });
  });

  describe('function-level intents', () => {
    it('should validate function-level intents', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('function test() { /** @intent:admin-only */ }');
      vi.mocked(extractIntents).mockReturnValue(['admin-only']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [],
        overrides: [],
        inlineMixins: [],
      });

      const mockParseFile = vi.fn().mockResolvedValue({
        functions: [
          {
            name: 'test',
            intents: ['admin-only'],
            startLine: 1,
            endLine: 1,
          },
        ],
        classes: [],
      });
      vi.mocked(TypeScriptValidator).mockImplementation(function() {
      return {
        parseFile: mockParseFile,
      } as any;
    });

      const registry = createMockRegistry({ 'admin-only': { description: 'Admin' } });

      await validateIntents('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.functionLevelIntents).toBeGreaterThanOrEqual(0);
    });

    it('should validate class method intents', async () => {
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
                endLine: 1,
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

      await validateIntents('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.passed).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

      const registry = createMockRegistry({});

      await validateIntents('/project', defaultConfig, registry, false);

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle TypeScript parsing errors gracefully', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:admin-only */ invalid');
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
      await validateIntents('/project', defaultConfig, registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output).toBeDefined();
    });
  });

  describe('config patterns', () => {
    it('should use config scan patterns', async () => {
      const config: Config = {
        version: '1.0',
        files: {
          scan: {
            include: ['custom/**/*.ts'],
            exclude: ['custom/test/**'],
          },
        },
      };

      vi.mocked(globFiles).mockResolvedValue([]);
      const registry = createMockRegistry({});

      await validateIntents('/project', config, registry, false);

      expect(globFiles).toHaveBeenCalledWith(
        ['custom/**/*.ts'],
        expect.objectContaining({
          ignore: ['custom/test/**'],
        })
      );
    });

    it('should use defaults when config patterns not set', async () => {
      const config: Config = { version: '1.0' };

      vi.mocked(globFiles).mockResolvedValue([]);
      const registry = createMockRegistry({});

      await validateIntents('/project', config, registry, false);

      expect(globFiles).toHaveBeenCalledWith(
        ['**/*.ts', '**/*.tsx'],
        expect.objectContaining({
          ignore: ['**/node_modules/**', '**/dist/**'],
        })
      );
    });
  });

  describe('exit code', () => {
    it('should exit with code 1 when issues found', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/project/src/file.ts']);
      vi.mocked(readFile).mockResolvedValue('/** @intent:unknown */');
      vi.mocked(extractIntents).mockReturnValue(['unknown']);
      vi.mocked(parseArchTags).mockReturnValue({
        archId: null,
        intents: [{ name: 'unknown', line: 1, column: 1 }],
        overrides: [],
        inlineMixins: [],
      });

      const registry = createMockRegistry({});

      try {
        await validateIntents('/project', defaultConfig, registry, false);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not exit when no issues (text mode)', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);
      const registry = createMockRegistry({});

      await validateIntents('/project', defaultConfig, registry, false);

      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });
});
