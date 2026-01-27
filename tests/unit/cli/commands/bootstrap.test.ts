/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the bootstrap command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBootstrapCommand } from '../../../../src/cli/commands/bootstrap.js';

// Module-level configurable mock variables
let mockGlobResult: string[] = [];
let mockFileContents: Record<string, string> = {};
let mockInferResult: { archId: string; confidence: 'high' | 'medium' | 'low'; reason: string } | null = null;
let mockConfig: Record<string, unknown> = {
  version: '1.0',
  files: { scan: { include: ['**/*.ts'], exclude: [] } },
  inference: { validate_arch_ids: true },
  registry: {},
};
let mockRegistryExists = true;
let mockHasArchitecture = true;
let mockParseArchTagsResult: { archTag: { archId: string; rawTag: string } | null; intents: unknown[]; overrides: unknown[] } = {
  archTag: null,
  intents: [],
  overrides: [],
};

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn().mockImplementation(async (path: string) => mockFileContents[path] || ''),
  writeFile: vi.fn().mockResolvedValue(undefined),
  globFiles: vi.fn().mockImplementation(async () => mockGlobResult),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn().mockResolvedValue({
    filter: vi.fn().mockImplementation((files: string[]) => files),
  }),
}));

vi.mock('../../../../src/core/infer/index.js', () => ({
  inferArchitecture: vi.fn().mockImplementation(() => mockInferResult),
  buildRulesFromSettings: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  parseArchTags: vi.fn().mockImplementation(() => mockParseArchTagsResult),
}));

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockImplementation(async () => mockConfig),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: { 'app.service': { description: 'Service' } },
    mixins: {},
  }),
  hasArchitecture: vi.fn().mockImplementation(() => mockHasArchitecture),
  registryExists: vi.fn().mockImplementation(async () => mockRegistryExists),
}));

vi.mock('../../../../src/utils/arch-tag.js', () => ({
  insertArchTag: vi.fn().mockImplementation((content: string, archId: string) =>
    `/**\n * @arch ${archId}\n */\n${content}`
  ),
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

// Mock chalk with pass-through
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, { cyan: (s: string) => s }),
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('bootstrap command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset all mock state
    mockGlobResult = [];
    mockFileContents = {};
    mockInferResult = null;
    mockConfig = {
      version: '1.0',
      files: { scan: { include: ['**/*.ts'], exclude: [] } },
      inference: { validate_arch_ids: true },
      registry: {},
    };
    mockRegistryExists = true;
    mockHasArchitecture = true;
    mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

    // Reset mock implementations that may have been changed
    const { loadRegistry } = await import('../../../../src/core/registry/loader.js');
    vi.mocked(loadRegistry).mockResolvedValue({
      architectures: { 'app.service': { description: 'Service' } },
      mixins: {},
    });

    const { loadConfig } = await import('../../../../src/core/config/loader.js');
    vi.mocked(loadConfig).mockImplementation(async () => mockConfig);

    // Reset inferArchitecture to use the current mockInferResult value
    const { inferArchitecture } = await import('../../../../src/core/infer/index.js');
    vi.mocked(inferArchitecture).mockImplementation(() => mockInferResult);

    // Set up spies for all tests
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  describe('createBootstrapCommand', () => {
    it('should create a command with correct name', () => {
      const command = createBootstrapCommand();
      expect(command.name()).toBe('bootstrap');
    });

    it('should have the correct description', () => {
      const command = createBootstrapCommand();
      expect(command.description()).toContain('Infer');
      expect(command.description()).toContain('tag');
    });

    it('should have an optional pattern argument', () => {
      const command = createBootstrapCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('pattern');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createBootstrapCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--dry-run');
      expect(optionNames).toContain('--min-confidence');
      expect(optionNames).toContain('--json');
    });

    it('should have min-confidence short option', () => {
      const command = createBootstrapCommand();
      const minConfOpt = command.options.find(opt => opt.long === '--min-confidence');
      expect(minConfOpt?.short).toBe('-c');
    });
  });

  describe('execution', () => {
    it('should warn when no files found', async () => {
      mockGlobResult = [];

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.warn).toHaveBeenCalledWith('No files found matching the pattern.');
    });

    it('should skip already tagged files', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = '/** @arch app.service */\nconst x = 1;';
      mockParseArchTagsResult = {
        archTag: { archId: 'app.service', rawTag: '@arch app.service' },
        intents: [],
        overrides: [],
      };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Already tagged:'));
    });

    it('should skip files with no match', async () => {
      mockGlobResult = ['src/unknown.ts'];
      const fullPath = `${process.cwd()}/src/unknown.ts`;
      mockFileContents[fullPath] = 'const x = 1;';
      mockInferResult = null;
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No match:'));
    });

    it('should skip files with low confidence when minConfidence is high', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'low', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '--min-confidence', 'high']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Low confidence:'));
    });

    it('should tag files with high confidence', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'high', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      const { writeFile } = await import('../../../../src/utils/file-system.js');
      expect(writeFile).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('app.service'));
    });

    it('should not write files in dry-run mode', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'high', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      const { writeFile } = await import('../../../../src/utils/file-system.js');
      expect(writeFile).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    });

    it('should output JSON when --json flag is used', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'high', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '--json']);

      // Find the JSON output call
      const jsonCall = consoleLogSpy.mock.calls.find(call => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('results');
      expect(output).toHaveProperty('summary');
    });

    it('should include results and summary in JSON output', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'high', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find(call => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      const output = JSON.parse(jsonCall![0] as string);
      expect(output.summary).toHaveProperty('tagged');
      expect(output.summary).toHaveProperty('skippedTagged');
      expect(output.summary).toHaveProperty('skippedLowConf');
      expect(output.summary).toHaveProperty('skippedNoMatch');
      expect(output.summary).toHaveProperty('skippedUnknownArch');
    });

    it('should tag medium confidence files when minConfidence is medium', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'medium', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '--min-confidence', 'medium']);

      const { writeFile } = await import('../../../../src/utils/file-system.js');
      expect(writeFile).toHaveBeenCalled();
    });

    it('should tag low confidence files when minConfidence is low', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'low', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '--min-confidence', 'low']);

      const { writeFile } = await import('../../../../src/utils/file-system.js');
      expect(writeFile).toHaveBeenCalled();
    });

    it('should skip unknown archId when registry validation is enabled', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'unknown.arch', confidence: 'high', reason: 'pattern match' };
      mockHasArchitecture = false;
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('unknown archId'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown archId:'));
    });

    it('should use custom pattern when provided', async () => {
      mockGlobResult = [];

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', 'lib/**/*.js']);

      const { globFiles } = await import('../../../../src/utils/file-system.js');
      expect(globFiles).toHaveBeenCalledWith(
        'lib/**/*.js',
        expect.objectContaining({ cwd: process.cwd() })
      );
    });

    it('should use config patterns when no pattern provided', async () => {
      mockGlobResult = [];
      mockConfig.files = { scan: { include: ['src/**/*.ts', 'lib/**/*.ts'], exclude: [] } };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      const { globFiles } = await import('../../../../src/utils/file-system.js');
      expect(globFiles).toHaveBeenCalledWith(
        'src/**/*.ts',
        expect.anything()
      );
    });

    it('should show Bootstrap Summary header', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'high', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Bootstrap Summary:'));
    });

    it('should show dry-run tip when in dry-run mode with changes', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'high', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '--dry-run']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Run without --dry-run'));
    });

    it('should show low confidence tip when files skipped', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'low', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '--min-confidence', 'high']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('--min-confidence medium'));
    });

    it('should show warning about unknown architectures', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'unknown.arch', confidence: 'high', reason: 'pattern match' };
      mockHasArchitecture = false;
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('matched unknown architectures')
      );
    });

    it('should show files needing manual review', async () => {
      mockGlobResult = ['src/unknown.ts'];
      const fullPath = `${process.cwd()}/src/unknown.ts`;
      mockFileContents[fullPath] = 'const x = 1;';
      mockInferResult = null;
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Files needing manual review:'));
    });

    it('should handle multiple files with different outcomes', async () => {
      mockGlobResult = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
      const cwd = process.cwd();
      mockFileContents[`${cwd}/src/a.ts`] = 'export class A {}';
      mockFileContents[`${cwd}/src/b.ts`] = '/** @arch existing */\nconst b = 1;';
      mockFileContents[`${cwd}/src/c.ts`] = 'const c = 1;';

      const { inferArchitecture } = await import('../../../../src/core/infer/index.js');
      const { parseArchTags } = await import('../../../../src/core/arch-tag/parser.js');

      // a.ts: infer succeeds
      // b.ts: already tagged
      // c.ts: no match
      vi.mocked(inferArchitecture).mockImplementation((file: string) => {
        if (file === 'src/a.ts') {
          return { archId: 'app.service', confidence: 'high', reason: 'pattern' };
        }
        return null;
      });

      vi.mocked(parseArchTags).mockImplementation((content: string) => {
        if (content.includes('@arch existing')) {
          return { archTag: { archId: 'existing', rawTag: '@arch existing' }, intents: [], overrides: [] };
        }
        return { archTag: null, intents: [], overrides: [] };
      });

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      const { writeFile } = await import('../../../../src/utils/file-system.js');
      // Only a.ts should be written
      expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it('should log info about analyzing files', async () => {
      mockGlobResult = ['src/a.ts', 'src/b.ts'];
      const cwd = process.cwd();
      mockFileContents[`${cwd}/src/a.ts`] = 'const a = 1;';
      mockFileContents[`${cwd}/src/b.ts`] = 'const b = 1;';
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.info).toHaveBeenCalledWith('Analyzing 2 file(s)...');
    });

    it('should log info about custom rules when present', async () => {
      mockGlobResult = ['src/a.ts'];
      const cwd = process.cwd();
      mockFileContents[`${cwd}/src/a.ts`] = 'const a = 1;';
      mockConfig = {
        version: '1.0',
        files: { scan: { include: ['**/*.ts'], exclude: [] } },
        inference: {
          validate_arch_ids: true,
          custom_rules: [{ filePattern: '*.ts', archId: 'custom.arch' }],
        },
        registry: {},
      };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.info).toHaveBeenCalledWith('Using 1 custom inference rule(s)');
    });

    it('should work without registry when validation is disabled', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'high', reason: 'pattern match' };
      mockConfig = {
        version: '1.0',
        files: { scan: { include: ['**/*.ts'], exclude: [] } },
        inference: { validate_arch_ids: false },
        registry: {},
      };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      const { loadRegistry } = await import('../../../../src/core/registry/loader.js');
      // Should not load registry when validation is disabled
      expect(loadRegistry).not.toHaveBeenCalled();
    });

    it('should handle registry load failure gracefully', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'high', reason: 'pattern match' };
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const { loadRegistry } = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Load failed'));

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.warn).toHaveBeenCalledWith('Could not load registry for archId validation');
    });

    it('should handle errors and exit with code 1', async () => {
      const { loadConfig } = await import('../../../../src/core/config/loader.js');
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config error'));

      const command = createBootstrapCommand();

      await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Config error');
    });

    it('should skip registry check when registry does not exist', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'high', reason: 'pattern match' };
      mockRegistryExists = false;
      mockParseArchTagsResult = { archTag: null, intents: [], overrides: [] };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      const { loadRegistry } = await import('../../../../src/core/registry/loader.js');
      expect(loadRegistry).not.toHaveBeenCalled();
    });
  });

  describe('confidence level filtering', () => {
    it('high minConfidence should skip medium and low confidence', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'medium', reason: 'pattern match' };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '-c', 'high']);

      const { writeFile } = await import('../../../../src/utils/file-system.js');
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('medium minConfidence should skip low confidence but tag medium', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'medium', reason: 'pattern match' };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '-c', 'medium']);

      const { writeFile } = await import('../../../../src/utils/file-system.js');
      expect(writeFile).toHaveBeenCalled();
    });

    it('low minConfidence should tag all confidence levels', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'low', reason: 'pattern match' };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test', '-c', 'low']);

      const { writeFile } = await import('../../../../src/utils/file-system.js');
      expect(writeFile).toHaveBeenCalled();
    });

    it('should default to high minConfidence', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'medium', reason: 'pattern match' };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      const { writeFile } = await import('../../../../src/utils/file-system.js');
      expect(writeFile).not.toHaveBeenCalled();
    });
  });

  describe('manual review list', () => {
    it('should show files with low confidence in review list', async () => {
      mockGlobResult = ['src/service.ts'];
      const fullPath = `${process.cwd()}/src/service.ts`;
      mockFileContents[fullPath] = 'export class MyService {}';
      mockInferResult = { archId: 'app.service', confidence: 'low', reason: 'pattern match' };

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Files needing manual review:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('app.service'));
    });

    it('should show files with no match in review list', async () => {
      mockGlobResult = ['src/unknown.ts'];
      const fullPath = `${process.cwd()}/src/unknown.ts`;
      mockFileContents[fullPath] = 'const x = 1;';
      mockInferResult = null;

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('no pattern match'));
    });

    it('should truncate review list to 10 files with message', async () => {
      const files = Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`);
      mockGlobResult = files;
      const cwd = process.cwd();
      for (const file of files) {
        mockFileContents[`${cwd}/${file}`] = 'const x = 1;';
      }
      mockInferResult = null;

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('... and 5 more'));
    });

    it('should not show review list when more than 20 files need review', async () => {
      const files = Array.from({ length: 25 }, (_, i) => `src/file${i}.ts`);
      mockGlobResult = files;
      const cwd = process.cwd();
      for (const file of files) {
        mockFileContents[`${cwd}/${file}`] = 'const x = 1;';
      }
      mockInferResult = null;

      const command = createBootstrapCommand();
      await command.parseAsync(['node', 'test']);

      // Review list should not be shown
      const reviewCall = consoleLogSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('Files needing manual review:')
      );
      expect(reviewCall).toBeUndefined();
    });
  });
});
