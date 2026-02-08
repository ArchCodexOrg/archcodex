/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the neighborhood command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNeighborhoodCommand } from '../../../../src/cli/commands/neighborhood.js';
import type { Neighborhood } from '../../../../src/core/neighborhood/types.js';

// Configurable mock behavior
let mockNeighborhood: Neighborhood;
let mockAnalyzeError: Error | null = null;

function createBaseNeighborhood(): Neighborhood {
  return {
    file: 'src/test.ts',
    architecture: 'domain.service',
    layer: { name: 'core', canImport: ['util'], cannotImport: ['cli'] },
    importedBy: [],
    currentImports: [],
    missingRequired: [],
    constraints: { forbidImport: [], requireImport: [] },
    forbiddenImports: [],
    sameLayerPatterns: ['src/core/**/*.ts'],
  };
}

// Mock dependencies
vi.mock('../../../../src/core/neighborhood/index.js', () => ({
  NeighborhoodAnalyzer: vi.fn(function() {
    return {
    analyze: vi.fn().mockImplementation(async () => {
      if (mockAnalyzeError) {
        throw mockAnalyzeError;
      }
      return mockNeighborhood;
    }),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {},
    mixins: {},
  }),
}));

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    registry: {},
    files: { source_patterns: ['src/**/*.ts'] },
  }),
}));

vi.mock('../../../../src/core/patterns/loader.js', () => ({
  loadPatternRegistry: vi.fn().mockResolvedValue({
    patterns: {},
  }),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { NeighborhoodAnalyzer } from '../../../../src/core/neighborhood/index.js';
import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { loadPatternRegistry } from '../../../../src/core/patterns/loader.js';
import { logger } from '../../../../src/utils/logger.js';

describe('neighborhood command', () => {
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
    mockNeighborhood = createBaseNeighborhood();
    mockAnalyzeError = null;

    // Reset NeighborhoodAnalyzer mock
    vi.mocked(NeighborhoodAnalyzer).mockImplementation(function() {
      return {
      analyze: vi.fn().mockImplementation(async () => {
        if (mockAnalyzeError) {
          throw mockAnalyzeError;
        }
        return mockNeighborhood;
      }),
      dispose: vi.fn(),
    } as any;
    });

    // Reset loadConfig mock
    vi.mocked(loadConfig).mockResolvedValue({
      version: '1.0',
      registry: {},
      files: { source_patterns: ['src/**/*.ts'] },
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createNeighborhoodCommand', () => {
    it('should create a command with correct name', () => {
      const command = createNeighborhoodCommand();
      expect(command.name()).toBe('neighborhood');
    });

    it('should have the correct description', () => {
      const command = createNeighborhoodCommand();
      expect(command.description()).toBe('Analyze import boundaries for a file');
    });

    it('should have a required file argument', () => {
      const command = createNeighborhoodCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('file');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createNeighborhoodCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--format');
      expect(optionNames).toContain('--depth');
      expect(optionNames).toContain('--include-external');
      expect(optionNames).toContain('--with-patterns');
      expect(optionNames).toContain('--violations-only');
      expect(optionNames).toContain('--config');
    });

    it('should have correct default for format option', () => {
      const command = createNeighborhoodCommand();
      const formatOption = command.options.find((opt) => opt.long === '--format');
      expect(formatOption?.defaultValue).toBe('yaml');
    });

    it('should have correct default for depth option', () => {
      const command = createNeighborhoodCommand();
      const depthOption = command.options.find((opt) => opt.long === '--depth');
      expect(depthOption?.defaultValue).toBe('1');
    });

    it('should have short flags for common options', () => {
      const command = createNeighborhoodCommand();
      const options = command.options;

      const formatOption = options.find((opt) => opt.long === '--format');
      expect(formatOption?.short).toBe('-f');

      const depthOption = options.find((opt) => opt.long === '--depth');
      expect(depthOption?.short).toBe('-d');

      const configOption = options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');
    });
  });

  describe('command execution', () => {
    it('should load config and registry', async () => {
      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(loadConfig).toHaveBeenCalled();
      expect(loadRegistry).toHaveBeenCalled();
    });

    it('should create NeighborhoodAnalyzer with correct args', async () => {
      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(NeighborhoodAnalyzer).toHaveBeenCalledWith(
        '/project',
        expect.any(Object),
        expect.any(Object),
        undefined
      );
    });

    it('should call analyze with correct options', async () => {
      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--depth', '3']);

      const analyzerInstance = vi.mocked(NeighborhoodAnalyzer).mock.results[0].value;
      expect(analyzerInstance.analyze).toHaveBeenCalledWith(
        'src/file.ts',
        expect.objectContaining({
          depth: 3,
        })
      );
    });

    it('should dispose analyzer after analysis', async () => {
      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const analyzerInstance = vi.mocked(NeighborhoodAnalyzer).mock.results[0].value;
      expect(analyzerInstance.dispose).toHaveBeenCalled();
    });

    it('should load pattern registry when --with-patterns is set', async () => {
      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--with-patterns']);

      expect(loadPatternRegistry).toHaveBeenCalledWith('/project');
    });

    it('should not load pattern registry without --with-patterns', async () => {
      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(loadPatternRegistry).not.toHaveBeenCalled();
    });
  });

  describe('format options', () => {
    it('should output YAML by default', async () => {
      mockNeighborhood = createBaseNeighborhood();

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const output = consoleLogSpy.mock.calls[0][0];
      // YAML output should have file: src/test.ts
      expect(output).toContain('file: src/test.ts');
    });

    it('should output JSON when format is json', async () => {
      mockNeighborhood = createBaseNeighborhood();

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'json']);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.file).toBe('src/test.ts');
      expect(parsed.architecture).toBe('domain.service');
    });

    it('should output human-readable format', async () => {
      mockNeighborhood = createBaseNeighborhood();

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('FILE: src/test.ts');
      expect(output).toContain('Architecture: domain.service');
    });

    it('should output AI-optimized format', async () => {
      mockNeighborhood = createBaseNeighborhood();

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('# Import Boundaries: src/test.ts');
      expect(output).toContain('Architecture: domain.service');
    });
  });

  describe('violations only mode', () => {
    it('should filter to only violations when --violations-only is set', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.currentImports = [
        { path: './allowed.js', allowed: true },
        { path: 'axios', allowed: false, forbiddenBy: 'forbid_import' },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'json', '--violations-only']);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.current_imports.length).toBe(1);
      expect(parsed.current_imports[0].path).toBe('axios');
    });

    it('should show all imports without --violations-only', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.currentImports = [
        { path: './allowed.js', allowed: true },
        { path: 'axios', allowed: false, forbiddenBy: 'forbid_import' },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'json']);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.current_imports.length).toBe(2);
    });
  });

  describe('JSON output structure', () => {
    it('should include layer information', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.layer = {
        name: 'domain',
        canImport: ['util', 'infra'],
        cannotImport: ['cli', 'test'],
      };

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'json']);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.layer.name).toBe('domain');
      expect(parsed.layer.can_import).toEqual(['util', 'infra']);
      expect(parsed.layer.cannot_import).toEqual(['cli', 'test']);
    });

    it('should include imported_by information', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.importedBy = [
        { file: 'src/consumer.ts', architecture: 'consumer.arch' },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'json']);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.imported_by.length).toBe(1);
      expect(parsed.imported_by[0].file).toBe('src/consumer.ts');
    });

    it('should include constraints', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.constraints = {
        forbidImport: [{ value: ['axios'], why: 'Use internal client' }],
        requireImport: [{ value: ['./types'], match: 'types.ts', why: 'Need types' }],
      };

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'json']);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.constraints.forbid_import.length).toBe(1);
      expect(parsed.constraints.forbid_import[0].value).toEqual(['axios']);
      expect(parsed.constraints.require_import.length).toBe(1);
    });

    it('should include missing required imports', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.missingRequired = [
        {
          import: './types',
          why: 'Types required',
          suggestion: { statement: "import type { Foo } from './types'" },
        },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'json']);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.missing_required.length).toBe(1);
      expect(parsed.missing_required[0].import).toBe('./types');
      expect(parsed.missing_required[0].suggestion).toContain("import type");
    });

    it('should include suggested patterns', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.suggestedPatterns = [
        {
          name: 'logger',
          canonical: 'src/utils/logger.ts',
          exports: ['logger'],
          usage: 'Use for logging',
          relevance: 'high',
        },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'json']);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.suggested_patterns.length).toBe(1);
      expect(parsed.suggested_patterns[0].name).toBe('logger');
    });

    it('should include importable_by when present', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.importableBy = {
        patterns: ['src/services/**'],
        why: 'Internal module',
      };

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'json']);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.importable_by.patterns).toEqual(['src/services/**']);
    });
  });

  describe('human output format', () => {
    it('should show architecture info', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.architecture = 'archcodex.core.domain';

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Architecture: archcodex.core.domain');
    });

    it('should show (untagged) when no architecture', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.architecture = undefined;

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Architecture: (untagged)');
    });

    it('should show layer import rules', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.layer = {
        name: 'core',
        canImport: ['util'],
        cannotImport: ['cli'],
      };

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Can import from: util');
      expect(output).toContain('Cannot import from: cli');
    });

    it('should show imported by files', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.importedBy = [
        { file: 'src/a.ts', architecture: 'arch.a' },
        { file: 'src/b.ts', architecture: undefined },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('IMPORTED BY:');
      expect(output).toContain('src/a.ts');
      expect(output).toContain('[arch.a]');
    });

    it('should show (none) when no importers', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.importedBy = [];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('(none)');
    });

    it('should truncate long importer list', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.importedBy = Array(15).fill(null).map((_, i) => ({
        file: `src/file${i}.ts`,
        architecture: undefined,
      }));

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('... and 5 more');
    });

    it('should show importable by patterns', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.importableBy = {
        patterns: ['src/services/**', 'src/api/**'],
        why: 'Internal use only',
      };

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('IMPORTABLE BY:');
      expect(output).toContain('src/services/**');
      expect(output).toContain('Why: Internal use only');
    });

    it('should show missing required imports', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.missingRequired = [
        {
          import: './types',
          why: 'Need type definitions',
          suggestion: { statement: "import type { T } from './types'" },
        },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('MISSING REQUIRED IMPORTS:');
      expect(output).toContain('./types');
      expect(output).toContain('Why: Need type definitions');
    });

    it('should show current imports with status icons', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.currentImports = [
        { path: './allowed.js', allowed: true, layer: 'core' },
        { path: 'axios', allowed: false, forbiddenBy: 'forbid_import', why: 'Use internal' },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('✓ ./allowed.js');
      expect(output).toContain('✗ axios');
      expect(output).toContain('Why: Use internal');
    });

    it('should show forbidden imports', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.forbiddenImports = [
        { value: ['axios', 'http'], why: 'Use internal client', alternative: 'src/client' },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('FORBIDDEN IMPORTS:');
      expect(output).toContain('axios, http');
      expect(output).toContain('Use instead: src/client');
    });

    it('should show suggested patterns with relevance', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.suggestedPatterns = [
        { name: 'logger', canonical: 'src/logger.ts', relevance: 'high', usage: 'For logging' },
        { name: 'config', canonical: 'src/config.ts', relevance: 'medium' },
        { name: 'utils', canonical: 'src/utils.ts', relevance: 'low' },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('SUGGESTED PATTERNS:');
      expect(output).toContain('★ logger');
      expect(output).toContain('☆ config');
      expect(output).toContain('○ utils');
    });

    it('should show same layer patterns', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.sameLayerPatterns = ['src/core/**/*.ts', 'src/domain/**/*.ts'];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'human']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('SAME LAYER (implicitly allowed):');
      expect(output).toContain('src/core/**/*.ts');
    });
  });

  describe('AI output format', () => {
    it('should show architecture info', async () => {
      mockNeighborhood = createBaseNeighborhood();

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Architecture: domain.service');
    });

    it('should show layer info with can_import', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.layer = { name: 'core', canImport: ['util'], cannotImport: [] };

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Layer: core (can import: util)');
    });

    it('should show cannot import layers', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.layer = { name: 'core', canImport: [], cannotImport: ['cli', 'test'] };

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('## Cannot Import From Layers');
      expect(output).toContain('cli, test');
    });

    it('should show forbidden imports with alternatives', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.forbiddenImports = [
        { value: ['axios'], why: 'Use internal', alternative: 'src/client' },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('## Forbidden Imports');
      expect(output).toContain('- axios');
      expect(output).toContain('Why: Use internal');
      expect(output).toContain('Use instead: src/client');
    });

    it('should show missing required imports', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.missingRequired = [
        { import: './types', suggestion: { statement: "import { T } from './types'" } },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('## Missing Required Imports');
      expect(output).toContain('./types');
      expect(output).toContain("Add: import { T }");
    });

    it('should show current violations', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.currentImports = [
        { path: 'axios', allowed: false, layerViolation: 'crosses layer boundary', why: 'Forbidden' },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('## Current Violations');
      expect(output).toContain('axios');
      expect(output).toContain('crosses layer boundary');
    });

    it('should show suggested patterns (excluding low relevance)', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.suggestedPatterns = [
        { name: 'logger', canonical: 'src/logger.ts', exports: ['log'], usage: 'Use for logging', relevance: 'high' },
        { name: 'low', canonical: 'src/low.ts', relevance: 'low' },
      ];

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('## Suggested Patterns');
      expect(output).toContain('logger: src/logger.ts');
      expect(output).toContain('Exports: log');
      expect(output).not.toContain('low: src/low.ts');
    });

    it('should show dependents with truncation', async () => {
      mockNeighborhood = createBaseNeighborhood();
      mockNeighborhood.importedBy = Array(8).fill(null).map((_, i) => ({
        file: `src/file${i}.ts`,
        architecture: i < 2 ? `arch.${i}` : undefined,
      }));

      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--format', 'ai']);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('## Dependents (8 files)');
      expect(output).toContain('[arch.0]');
      expect(output).toContain('... and 3 more');
    });
  });

  describe('option handling', () => {
    it('should pass include-external to analyzer', async () => {
      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--include-external']);

      const analyzerInstance = vi.mocked(NeighborhoodAnalyzer).mock.results[0].value;
      expect(analyzerInstance.analyze).toHaveBeenCalledWith(
        'src/file.ts',
        expect.objectContaining({
          includeExternal: true,
        })
      );
    });

    it('should pass violations-only to analyzer', async () => {
      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--violations-only']);

      const analyzerInstance = vi.mocked(NeighborhoodAnalyzer).mock.results[0].value;
      expect(analyzerInstance.analyze).toHaveBeenCalledWith(
        'src/file.ts',
        expect.objectContaining({
          violationsOnly: true,
        })
      );
    });

    it('should use custom config path', async () => {
      const command = createNeighborhoodCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--config', 'custom/config.yaml']);

      expect(loadConfig).toHaveBeenCalledWith('/project', 'custom/config.yaml');
    });
  });

  describe('error handling', () => {
    it('should handle config loading errors', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));

      const command = createNeighborhoodCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected - process.exit throws
      }

      expect(logger.error).toHaveBeenCalledWith('Config not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle analysis errors', async () => {
      mockAnalyzeError = new Error('File not found');

      const command = createNeighborhoodCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/nonexistent.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('File not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValue('string error');

      const command = createNeighborhoodCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('string error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should dispose analyzer even on error', async () => {
      mockAnalyzeError = new Error('Analysis failed');

      const command = createNeighborhoodCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      const analyzerInstance = vi.mocked(NeighborhoodAnalyzer).mock.results[0].value;
      expect(analyzerInstance.dispose).toHaveBeenCalled();
    });
  });
});
