/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for spec generate subcommand registration and action logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerGenerateCommand } from '../../../../../src/cli/commands/spec/generate.js';

// Mock core spec functions
vi.mock('../../../../../src/core/spec/index.js', () => ({
  loadSpecRegistry: vi.fn(),
  loadFixtures: vi.fn(),
  resolveSpec: vi.fn(),
  generateUnitTests: vi.fn(),
  generatePropertyTests: vi.fn(),
  generateIntegrationTests: vi.fn(),
  generateUITests: vi.fn(),
}));

// Mock types helper
vi.mock('../../../../../src/cli/commands/spec/types.js', () => ({
  resolveOutputPath: vi.fn().mockResolvedValue('/resolved/output.test.ts'),
}));

// Mock logger
vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
      green: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
  },
}));

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import {
  loadSpecRegistry,
  loadFixtures,
  resolveSpec,
  generateUnitTests,
  generatePropertyTests,
  generateIntegrationTests,
  generateUITests,
} from '../../../../../src/core/spec/index.js';
import { resolveOutputPath } from '../../../../../src/cli/commands/spec/types.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('registerGenerateCommand', () => {
  it('registers generate subcommand on parent', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate');
    expect(generate).toBeDefined();
    expect(generate!.description()).toContain('Generate');
  });

  it('generate command requires specId argument', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    expect(generate.registeredArguments).toHaveLength(1);
    expect(generate.registeredArguments[0].name()).toBe('specId');
    expect(generate.registeredArguments[0].required).toBe(true);
  });

  it('generate command has --type option with unit default', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    const typeOption = generate.options.find(o => o.long === '--type');
    expect(typeOption).toBeDefined();
    expect(typeOption!.defaultValue).toBe('unit');
  });

  it('generate command has --framework option', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    const frameworkOption = generate.options.find(o => o.long === '--framework');
    expect(frameworkOption).toBeDefined();
  });

  it('generate command has --dry-run option', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    const dryRunOption = generate.options.find(o => o.long === '--dry-run');
    expect(dryRunOption).toBeDefined();
  });

  it('generate command has --output option', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    const outputOption = generate.options.find(o => o.long === '--output');
    expect(outputOption).toBeDefined();
  });

  it('generate command has --json option', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    const jsonOption = generate.options.find(o => o.long === '--json');
    expect(jsonOption).toBeDefined();
  });

  it('generate command has --no-markers option', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    const markersOption = generate.options.find(o => o.long === '--no-markers');
    expect(markersOption).toBeDefined();
  });

  it('generate command has --num-runs option for property tests', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    const numRunsOption = generate.options.find(o => o.long === '--num-runs');
    expect(numRunsOption).toBeDefined();
  });

  it('generate command has --seed option for reproducible property tests', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    const seedOption = generate.options.find(o => o.long === '--seed');
    expect(seedOption).toBeDefined();
  });

  it('generate command has --setup-helpers option for integration tests', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    const setupOption = generate.options.find(o => o.long === '--setup-helpers');
    expect(setupOption).toBeDefined();
  });

  it('generate command has UI test options', () => {
    const parent = new Command('spec');
    registerGenerateCommand(parent);

    const generate = parent.commands.find(c => c.name() === 'generate')!;
    expect(generate.options.find(o => o.long === '--accessibility')).toBeDefined();
    expect(generate.options.find(o => o.long === '--base-selector')).toBeDefined();
    expect(generate.options.find(o => o.long === '--component-name')).toBeDefined();
  });
});

describe('generate command action', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  const mockRegistry = { nodes: { 'spec.test.fn': { intent: 'Test fn' } } };
  const mockFixtures = { fixtures: {} };
  const mockResolvedSpec = {
    valid: true,
    spec: { specId: 'spec.test.fn', node: { type: 'concrete' } },
    errors: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/test/project');

    vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
    vi.mocked(loadFixtures).mockResolvedValue(mockFixtures);
    vi.mocked(resolveSpec).mockReturnValue(mockResolvedSpec);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('spec resolution failure', () => {
    it('should exit with error when spec cannot be resolved', async () => {
      vi.mocked(resolveSpec).mockReturnValue({
        valid: false,
        spec: null,
        errors: [{ code: 'NOT_FOUND', message: 'Spec not found' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'generate', 'spec.missing']);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resolve')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should output JSON when spec resolution fails and --json is set', async () => {
      vi.mocked(resolveSpec).mockReturnValue({
        valid: false,
        spec: null,
        errors: [{ code: 'NOT_FOUND', message: 'Not found' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'generate', 'spec.missing', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"valid"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });
  });

  describe('unit test generation', () => {
    it('should generate unit tests by default', async () => {
      vi.mocked(generateUnitTests).mockReturnValue({
        valid: true,
        code: 'describe("test", () => { it("works", () => {}) });',
        testCount: 3,
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'generate', 'spec.test.fn']);
      } catch {
        // ignore
      }

      expect(generateUnitTests).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generated 3 test(s)')
      );
    });

    it('should pass fixture registry to unit test generator', async () => {
      vi.mocked(generateUnitTests).mockReturnValue({
        valid: true,
        code: 'test code',
        testCount: 1,
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'generate', 'spec.test.fn']);
      } catch {
        // ignore
      }

      expect(generateUnitTests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fixtureRegistry: mockFixtures })
      );
    });

    it('should output JSON when --json is set for unit tests', async () => {
      vi.mocked(generateUnitTests).mockReturnValue({
        valid: true,
        code: 'test code',
        testCount: 1,
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'generate', 'spec.test.fn', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"testCount"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('should exit with error when unit test generation fails', async () => {
      vi.mocked(generateUnitTests).mockReturnValue({
        valid: false,
        code: '',
        testCount: 0,
        errors: [{ code: 'GEN_ERROR', message: 'Failed to generate' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'generate', 'spec.test.fn']);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should write to file when --output is provided for unit tests', async () => {
      vi.mocked(generateUnitTests).mockReturnValue({
        valid: true,
        code: 'test code output',
        testCount: 2,
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn',
          '--output', '/out/tests/',
        ]);
      } catch {
        // ignore
      }

      expect(resolveOutputPath).toHaveBeenCalledWith('/out/tests/', 'spec.test.fn', 'unit');
    });

    it('should show dry-run message when --dry-run and --output are set', async () => {
      vi.mocked(generateUnitTests).mockReturnValue({
        valid: true,
        code: 'test code',
        testCount: 1,
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn',
          '--output', '/out/test.ts',
          '--dry-run',
        ]);
      } catch {
        // ignore
      }

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[dry-run]')
      );
    });
  });

  describe('property test generation', () => {
    it('should generate property tests when --type=property', async () => {
      vi.mocked(generatePropertyTests).mockReturnValue({
        valid: true,
        code: 'fc.property test code',
        propertyCount: 5,
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn', '--type', 'property',
        ]);
      } catch {
        // ignore
      }

      expect(generatePropertyTests).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('5 property test(s)')
      );
    });

    it('should pass numRuns and seed to property test generator', async () => {
      vi.mocked(generatePropertyTests).mockReturnValue({
        valid: true,
        code: 'property test code',
        propertyCount: 1,
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn',
          '--type', 'property',
          '--num-runs', '200',
          '--seed', '42',
        ]);
      } catch {
        // ignore
      }

      expect(generatePropertyTests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          numRuns: 200,
          seed: 42,
        })
      );
    });

    it('should exit with error when property test generation fails', async () => {
      vi.mocked(generatePropertyTests).mockReturnValue({
        valid: false,
        code: '',
        propertyCount: 0,
        errors: [{ code: 'GEN_ERROR', message: 'No invariants defined' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn', '--type', 'property',
        ]);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate property')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('integration test generation', () => {
    it('should generate integration tests when --type=integration', async () => {
      vi.mocked(generateIntegrationTests).mockReturnValue({
        valid: true,
        code: 'integration test code',
        effectTests: 3,
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn', '--type', 'integration',
        ]);
      } catch {
        // ignore
      }

      expect(generateIntegrationTests).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('3 integration test(s)')
      );
    });

    it('should pass setup-helpers to integration test generator', async () => {
      vi.mocked(generateIntegrationTests).mockReturnValue({
        valid: true,
        code: 'integration code',
        effectTests: 1,
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn',
          '--type', 'integration',
          '--setup-helpers', 'tests/helpers/setup.ts',
        ]);
      } catch {
        // ignore
      }

      expect(generateIntegrationTests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          setupHelpers: 'tests/helpers/setup.ts',
        })
      );
    });
  });

  describe('UI test generation', () => {
    it('should generate UI tests when --type=ui', async () => {
      vi.mocked(generateUITests).mockReturnValue({
        valid: true,
        code: 'UI test code',
        testCount: 4,
        categories: { interaction: 2, visual: 1, accessibility: 1 },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn', '--type', 'ui',
        ]);
      } catch {
        // ignore
      }

      expect(generateUITests).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('4 UI test(s)')
      );
    });

    it('should use cypress framework when --framework=cypress for UI tests', async () => {
      vi.mocked(generateUITests).mockReturnValue({
        valid: true,
        code: 'cypress test code',
        testCount: 1,
        categories: { interaction: 1 },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn',
          '--type', 'ui',
          '--framework', 'cypress',
        ]);
      } catch {
        // ignore
      }

      expect(generateUITests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ framework: 'cypress' })
      );
    });

    it('should use testing-library framework when specified', async () => {
      vi.mocked(generateUITests).mockReturnValue({
        valid: true,
        code: 'rtl test code',
        testCount: 1,
        categories: { interaction: 1 },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn',
          '--type', 'ui',
          '--framework', 'testing-library',
        ]);
      } catch {
        // ignore
      }

      expect(generateUITests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ framework: 'testing-library' })
      );
    });

    it('should pass accessibility plugin option for UI tests', async () => {
      vi.mocked(generateUITests).mockReturnValue({
        valid: true,
        code: 'axe test code',
        testCount: 1,
        categories: { accessibility: 1 },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn',
          '--type', 'ui',
          '--accessibility', 'axe',
        ]);
      } catch {
        // ignore
      }

      expect(generateUITests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ accessibilityPlugin: 'axe' })
      );
    });

    it('should exit with error when UI test generation fails', async () => {
      vi.mocked(generateUITests).mockReturnValue({
        valid: false,
        code: '',
        testCount: 0,
        categories: {},
        errors: [{ code: 'UI_ERROR', message: 'No UI scenarios' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn', '--type', 'ui',
        ]);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate UI')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('unknown test type', () => {
    it('should exit with error for unknown test type', async () => {
      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'generate', 'spec.test.fn', '--type', 'unknown',
        ]);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unknown test type')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling', () => {
    it('should catch and log unexpected errors', async () => {
      vi.mocked(loadSpecRegistry).mockRejectedValue(new Error('Registry crash'));

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'generate', 'spec.test.fn']);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Registry crash')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should output JSON when unexpected error and --json is set', async () => {
      vi.mocked(loadSpecRegistry).mockRejectedValue(new Error('Boom'));

      const parent = new Command('spec');
      parent.exitOverride();
      registerGenerateCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'generate', 'spec.test.fn', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"error"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
