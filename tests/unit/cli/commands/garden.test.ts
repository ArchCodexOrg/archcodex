/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the garden command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGardenCommand } from '../../../../src/cli/commands/garden.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
      green: (s: string) => s,
    }),
    cyan: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    dim: (s: string) => s,
    gray: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockConfigResult = {
  version: '1.0',
  files: { scan: { include: ['**/*.ts'], exclude: ['**/node_modules/**'] } },
  llm: {},
};

let mockIndexEntries: Array<{ arch_id: string; keywords: string[] }> = [];

let mockRegistryResult = {
  nodes: { base: { description: 'Base' } },
  mixins: {},
};

let mockGlobResult: string[] = [];
let mockFileContents: Record<string, string> = {};
let mockGardenReport = {
  patterns: [],
  inconsistencies: [],
  keywordSuggestions: [],
  keywordCleanups: [],
  typeDuplicates: [],
  summary: {
    patternCount: 0,
    inconsistencyCount: 0,
    keywordSuggestionCount: 0,
    keywordCleanupCount: 0,
    typeDuplicateCount: 0,
    hasIssues: false,
  },
};

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockImplementation(async () => mockConfigResult),
}));

vi.mock('../../../../src/core/discovery/loader.js', () => ({
  loadIndex: vi.fn().mockImplementation(async () => ({ entries: mockIndexEntries })),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockImplementation(async () => mockRegistryResult),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn().mockResolvedValue({
    ignores: vi.fn().mockReturnValue(false),
  }),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockImplementation(async () => mockGlobResult),
  readFile: vi.fn().mockImplementation(async (path: string) => mockFileContents[path] || ''),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../../src/core/garden/detector.js', () => ({
  PatternDetector: vi.fn(function() {
    return {
    analyze: vi.fn().mockReturnValue(mockGardenReport),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/types/duplicate-detector.js', () => ({
  DuplicateDetector: vi.fn(function() {
    return {
    scanFiles: vi.fn().mockResolvedValue({ groups: [] }),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../src/cli/formatters/garden.js', () => ({
  printGardenReport: vi.fn(),
}));

vi.mock('../../../../src/utils/archconfig.js', () => ({
  loadArchConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../../src/llm/providers/index.js', () => ({
  getAvailableProvider: vi.fn().mockReturnValue({
    name: 'prompt',
    isAvailable: vi.fn().mockReturnValue(false),
  }),
}));

vi.mock('../../../../src/llm/reindexer.js', () => ({
  reindexArchitecture: vi.fn().mockResolvedValue({ keywords: [], error: undefined }),
}));

vi.mock('../../../../src/core/discovery/concept-generator.js', () => ({
  generateConcepts: vi.fn().mockResolvedValue({ success: true, conceptCount: 0, coverage: 0 }),
}));

vi.mock('../../../../src/utils/yaml.js', () => ({
  parseYaml: vi.fn().mockReturnValue({ entries: [] }),
  stringifyYaml: vi.fn().mockReturnValue('entries: []'),
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

import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadIndex } from '../../../../src/core/discovery/loader.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { loadArchIgnore } from '../../../../src/utils/archignore.js';
import { globFiles, readFile, writeFile } from '../../../../src/utils/file-system.js';
import { extractArchId } from '../../../../src/core/arch-tag/parser.js';
import { PatternDetector } from '../../../../src/core/garden/detector.js';
import { DuplicateDetector } from '../../../../src/core/types/duplicate-detector.js';
import { getAvailableProvider } from '../../../../src/llm/providers/index.js';
import { reindexArchitecture } from '../../../../src/llm/reindexer.js';
import { generateConcepts } from '../../../../src/core/discovery/concept-generator.js';
import { parseYaml, stringifyYaml } from '../../../../src/utils/yaml.js';
import { logger } from '../../../../src/utils/logger.js';

describe('garden command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/project');

    // Reset mock data
    mockConfigResult = {
      version: '1.0',
      files: { scan: { include: ['**/*.ts'], exclude: ['**/node_modules/**'] } },
      llm: {},
    };
    mockIndexEntries = [];
    mockRegistryResult = {
      nodes: { base: { description: 'Base' } },
      mixins: {},
    };
    mockGlobResult = [];
    mockFileContents = {};
    mockGardenReport = {
      patterns: [],
      inconsistencies: [],
      keywordSuggestions: [],
      keywordCleanups: [],
      typeDuplicates: [],
      summary: {
        patternCount: 0,
        inconsistencyCount: 0,
        keywordSuggestionCount: 0,
        keywordCleanupCount: 0,
        typeDuplicateCount: 0,
        hasIssues: false,
      },
    };

    // Reset mocks
    vi.mocked(loadConfig).mockImplementation(async () => mockConfigResult as any);
    vi.mocked(loadIndex).mockImplementation(async () => ({ entries: mockIndexEntries }) as any);
    vi.mocked(loadRegistry).mockImplementation(async () => mockRegistryResult as any);
    vi.mocked(globFiles).mockImplementation(async () => mockGlobResult);
    vi.mocked(readFile).mockImplementation(async (path: string) => mockFileContents[path] || '');
    vi.mocked(PatternDetector).mockImplementation(function() {
      return {
      analyze: vi.fn().mockReturnValue(mockGardenReport),
      dispose: vi.fn(),
    } as any;
    });
    vi.mocked(getAvailableProvider).mockReturnValue({
      name: 'prompt',
      isAvailable: vi.fn().mockReturnValue(false),
    } as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createGardenCommand', () => {
    it('should create a command with correct name', () => {
      const command = createGardenCommand();
      expect(command.name()).toBe('garden');
    });

    it('should have the correct description', () => {
      const command = createGardenCommand();
      expect(command.description()).toContain('Analyze');
    });

    it('should have required options', () => {
      const command = createGardenCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--llm');
      expect(optionNames).toContain('--concepts');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--detect-patterns');
      expect(optionNames).toContain('--check-consistency');
      expect(optionNames).toContain('--suggest-keywords');
      expect(optionNames).toContain('--cleanup-keywords');
      expect(optionNames).toContain('--detect-type-duplicates');
      expect(optionNames).toContain('--apply-keywords');
      expect(optionNames).toContain('--apply-cleanup');
      expect(optionNames).toContain('--config');
      expect(optionNames).toContain('--min-cluster-size');
      expect(optionNames).toContain('--max-keyword-usage');
      expect(optionNames).toContain('--semantic');
    });

    it('should have default values', () => {
      const command = createGardenCommand();
      const options = command.options;

      const configOption = options.find((opt) => opt.long === '--config');
      expect(configOption?.defaultValue).toBe('.arch/config.yaml');

      const minClusterOption = options.find((opt) => opt.long === '--min-cluster-size');
      expect(minClusterOption?.defaultValue).toBe('2');

      const maxKeywordOption = options.find((opt) => opt.long === '--max-keyword-usage');
      expect(maxKeywordOption?.defaultValue).toBe('3');
    });

    it('should have short flag for config', () => {
      const command = createGardenCommand();
      const configOption = command.options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');
    });
  });

  describe('basic execution', () => {
    it('should load config, index, and archignore', async () => {
      const command = createGardenCommand();
      await command.parseAsync(['node', 'test']);

      expect(loadConfig).toHaveBeenCalledWith('/project', '.arch/config.yaml');
      expect(loadIndex).toHaveBeenCalledWith('/project');
      expect(loadArchIgnore).toHaveBeenCalledWith('/project');
    });

    it('should use config file patterns', async () => {
      mockConfigResult.files.scan.include = ['src/**/*.tsx', 'lib/**/*.ts'];

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test']);

      expect(globFiles).toHaveBeenCalledWith('src/**/*.tsx', expect.any(Object));
      expect(globFiles).toHaveBeenCalledWith('lib/**/*.ts', expect.any(Object));
    });

    it('should create PatternDetector', async () => {
      const command = createGardenCommand();
      await command.parseAsync(['node', 'test']);

      expect(PatternDetector).toHaveBeenCalledWith('/project', expect.any(Array));
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json is used', async () => {
      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--json']);

      const calls = consoleLogSpy.mock.calls;
      const jsonCall = calls.find((c) => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
    });
  });

  describe('type duplicate detection', () => {
    it('should skip type duplicate detection by default', async () => {
      mockGlobResult = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'type Test = string;';

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test']);

      expect(DuplicateDetector).not.toHaveBeenCalled();
    });

    it('should run type duplicate detection when enabled', async () => {
      mockGlobResult = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'type Test = string;';

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--detect-type-duplicates']);

      expect(DuplicateDetector).toHaveBeenCalled();
    });
  });

  describe('semantic analysis', () => {
    it('should read file contents when semantic analysis is enabled', async () => {
      mockGlobResult = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--semantic']);

      expect(readFile).toHaveBeenCalledWith('/project/src/test.ts');
    });

    it('should dispose detector after semantic analysis', async () => {
      mockGlobResult = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const mockDispose = vi.fn();
      vi.mocked(PatternDetector).mockImplementation(function() {
      return {
        analyze: vi.fn().mockReturnValue(mockGardenReport),
        dispose: mockDispose,
      } as any;
    });

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--semantic']);

      expect(mockDispose).toHaveBeenCalled();
    });
  });

  describe('LLM mode', () => {
    it('should warn when LLM not configured', async () => {
      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--llm']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('no LLM provider configured'))).toBe(true);
    });

    it('should use LLM for keyword suggestions when configured', async () => {
      mockGlobResult = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = '/** @arch test.arch */\nconst x = 1;';
      vi.mocked(extractArchId).mockReturnValue('test.arch');

      vi.mocked(getAvailableProvider).mockReturnValue({
        name: 'openai',
        isAvailable: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(reindexArchitecture).mockResolvedValue({
        keywords: ['generated', 'keywords'],
        error: undefined,
        success: true,
        archId: 'test.arch',
      });

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--llm']);

      expect(loadRegistry).toHaveBeenCalled();
      expect(reindexArchitecture).toHaveBeenCalled();
    });

    it('should handle LLM errors gracefully', async () => {
      mockGlobResult = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = '/** @arch test.arch */\nconst x = 1;';
      vi.mocked(extractArchId).mockReturnValue('test.arch');

      vi.mocked(getAvailableProvider).mockReturnValue({
        name: 'openai',
        isAvailable: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(reindexArchitecture).mockResolvedValue({
        keywords: [],
        error: 'API error',
        success: false,
        archId: 'test.arch',
      });

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--llm']);

      // Should not throw
      expect(reindexArchitecture).toHaveBeenCalled();
    });
  });

  describe('concepts generation', () => {
    it('should warn when --concepts used without --llm', async () => {
      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--concepts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('--concepts requires --llm'))).toBe(true);
    });

    it('should generate concepts when both --llm and --concepts are used', async () => {
      vi.mocked(getAvailableProvider).mockReturnValue({
        name: 'openai',
        isAvailable: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(generateConcepts).mockResolvedValue({
        success: true,
        conceptCount: 5,
        coverage: 80,
      });

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--llm', '--concepts']);

      expect(generateConcepts).toHaveBeenCalledWith('/project', expect.any(Object), expect.any(Object));
    });
  });

  describe('apply keywords', () => {
    it('should apply keyword suggestions when --apply-keywords is used', async () => {
      mockGardenReport.keywordSuggestions = [{
        archId: 'test.arch',
        currentKeywords: [],
        suggestedKeywords: ['new', 'keyword'],
        basedOnFiles: ['src/test.ts'],
      }];

      vi.mocked(parseYaml).mockReturnValue({ entries: [] });

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--apply-keywords']);

      expect(writeFile).toHaveBeenCalled();
    });

    it('should not write when no suggestions', async () => {
      mockGardenReport.keywordSuggestions = [];

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--apply-keywords']);

      expect(writeFile).not.toHaveBeenCalled();
    });
  });

  describe('apply cleanup', () => {
    it('should have --apply-cleanup option available', () => {
      const command = createGardenCommand();
      const options = command.options;
      const applyCleanupOption = options.find((opt) => opt.long === '--apply-cleanup');
      expect(applyCleanupOption).toBeDefined();
      expect(applyCleanupOption?.defaultValue).toBe(false);
    });
  });

  describe('exit codes', () => {
    it('should exit with 1 when issues found', async () => {
      mockGardenReport.summary.hasIssues = true;

      const command = createGardenCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not exit with 1 when applying changes', async () => {
      mockGardenReport.summary.hasIssues = true;
      mockGardenReport.keywordSuggestions = [{
        archId: 'test.arch',
        currentKeywords: [],
        suggestedKeywords: ['new'],
        basedOnFiles: [],
      }];

      vi.mocked(parseYaml).mockReturnValue({ entries: [] });

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--apply-keywords']);

      // Should not call process.exit(1) when applying changes
      // (the test would throw if it did)
    });
  });

  describe('error handling', () => {
    it('should handle config load errors', async () => {
      vi.mocked(loadConfig).mockRejectedValueOnce(new Error('Config error'));

      const command = createGardenCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Config error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle index load errors', async () => {
      vi.mocked(loadIndex).mockRejectedValueOnce(new Error('Index error'));

      const command = createGardenCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Index error');
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValueOnce('string error');

      const command = createGardenCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Unknown error');
    });
  });

  describe('archignore filtering', () => {
    it('should filter files through archignore', async () => {
      mockGlobResult = ['/project/src/a.ts', '/project/src/ignored.ts'];

      const mockIgnores = vi.fn().mockImplementation((path: string) => path.includes('ignored'));
      vi.mocked(loadArchIgnore).mockResolvedValueOnce({
        ignores: mockIgnores,
      } as any);

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockIgnores).toHaveBeenCalled();
    });
  });

  describe('arch tag extraction', () => {
    it('should extract arch tags from files', async () => {
      mockGlobResult = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = '/** @arch my.arch */\ncode';

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test']);

      expect(extractArchId).toHaveBeenCalled();
    });

    it('should handle files that cannot be read', async () => {
      mockGlobResult = ['/project/src/test.ts'];
      vi.mocked(readFile).mockRejectedValueOnce(new Error('Read error'));

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test']);

      // Should not throw - just skip the file
      expect(PatternDetector).toHaveBeenCalled();
    });
  });

  describe('file deduplication', () => {
    it('should deduplicate files from multiple patterns', async () => {
      mockConfigResult.files.scan.include = ['**/*.ts', 'src/**/*.ts'];
      // Same file returned by both patterns
      vi.mocked(globFiles)
        .mockResolvedValueOnce(['/project/src/test.ts'])
        .mockResolvedValueOnce(['/project/src/test.ts']);

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test']);

      // extractArchId should only be called once per unique file
      expect(extractArchId).toHaveBeenCalledTimes(1);
    });
  });

  describe('options', () => {
    it('should pass options to PatternDetector.analyze', async () => {
      const mockAnalyze = vi.fn().mockReturnValue(mockGardenReport);
      vi.mocked(PatternDetector).mockImplementation(function() {
      return {
        analyze: mockAnalyze,
        dispose: vi.fn(),
      } as any;
    });

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--min-cluster-size', '5', '--max-keyword-usage', '10']);

      expect(mockAnalyze).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          minClusterSize: 5,
          maxKeywordUsage: 10,
        }),
        undefined,
        expect.any(Array)
      );
    });

    it('should pass semantic flag to analyze', async () => {
      mockGlobResult = ['/project/src/test.ts'];
      mockFileContents['/project/src/test.ts'] = 'const x = 1;';

      const mockAnalyze = vi.fn().mockReturnValue(mockGardenReport);
      vi.mocked(PatternDetector).mockImplementation(function() {
      return {
        analyze: mockAnalyze,
        dispose: vi.fn(),
      } as any;
    });

      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--semantic']);

      expect(mockAnalyze).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          useSemanticAnalysis: true,
        }),
        expect.any(Map),
        expect.any(Array)
      );
    });
  });

  describe('custom config path', () => {
    it('should use custom config path', async () => {
      const command = createGardenCommand();
      await command.parseAsync(['node', 'test', '--config', 'custom/config.yaml']);

      expect(loadConfig).toHaveBeenCalledWith('/project', 'custom/config.yaml');
    });
  });
});
