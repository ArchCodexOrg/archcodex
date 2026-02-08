/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for spec infer subcommand registration and action logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerInferCommand } from '../../../../../src/cli/commands/spec/infer.js';

// Mock core spec functions
vi.mock('../../../../../src/core/spec/index.js', () => ({
  inferSpec: vi.fn(),
  inferSpecUpdate: vi.fn(),
  parseImplementationPath: vi.fn(),
}));

// Mock file-system utilities
vi.mock('../../../../../src/utils/file-system.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('function test() {}'),
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

import { inferSpec, inferSpecUpdate, parseImplementationPath } from '../../../../../src/core/spec/index.js';
import { ensureDir, writeFile } from '../../../../../src/utils/file-system.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('registerInferCommand', () => {
  it('registers infer subcommand on parent', () => {
    const parent = new Command('spec');
    registerInferCommand(parent);

    const infer = parent.commands.find(c => c.name() === 'infer');
    expect(infer).toBeDefined();
    expect(infer!.description()).toContain('Generate spec');
  });

  it('infer command requires implementation argument', () => {
    const parent = new Command('spec');
    registerInferCommand(parent);

    const infer = parent.commands.find(c => c.name() === 'infer')!;
    expect(infer.registeredArguments).toHaveLength(1);
    expect(infer.registeredArguments[0].name()).toBe('implementation');
    expect(infer.registeredArguments[0].required).toBe(true);
  });

  it('infer command has --update option', () => {
    const parent = new Command('spec');
    registerInferCommand(parent);

    const infer = parent.commands.find(c => c.name() === 'infer')!;
    const updateOption = infer.options.find(o => o.long === '--update');
    expect(updateOption).toBeDefined();
  });

  it('infer command has --enrich option', () => {
    const parent = new Command('spec');
    registerInferCommand(parent);

    const infer = parent.commands.find(c => c.name() === 'infer')!;
    const enrichOption = infer.options.find(o => o.long === '--enrich');
    expect(enrichOption).toBeDefined();
  });

  it('infer command has --provider option', () => {
    const parent = new Command('spec');
    registerInferCommand(parent);

    const infer = parent.commands.find(c => c.name() === 'infer')!;
    const providerOption = infer.options.find(o => o.long === '--provider');
    expect(providerOption).toBeDefined();
  });

  it('infer command has --output option', () => {
    const parent = new Command('spec');
    registerInferCommand(parent);

    const infer = parent.commands.find(c => c.name() === 'infer')!;
    const outputOption = infer.options.find(o => o.long === '--output');
    expect(outputOption).toBeDefined();
  });

  it('infer command has --dry-run option', () => {
    const parent = new Command('spec');
    registerInferCommand(parent);

    const infer = parent.commands.find(c => c.name() === 'infer')!;
    const dryRunOption = infer.options.find(o => o.long === '--dry-run');
    expect(dryRunOption).toBeDefined();
  });

  it('infer command has --inherits option', () => {
    const parent = new Command('spec');
    registerInferCommand(parent);

    const infer = parent.commands.find(c => c.name() === 'infer')!;
    const inheritsOption = infer.options.find(o => o.long === '--inherits');
    expect(inheritsOption).toBeDefined();
  });

  it('infer command has --json option', () => {
    const parent = new Command('spec');
    registerInferCommand(parent);

    const infer = parent.commands.find(c => c.name() === 'infer')!;
    const jsonOption = infer.options.find(o => o.long === '--json');
    expect(jsonOption).toBeDefined();
  });
});

describe('infer command action', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('infer mode (no --update)', () => {
    it('should call inferSpec with implementation path and options', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: true,
        specId: 'spec.test.myFunc',
        yaml: 'spec.test.myFunc:\n  inherits: spec.function\n',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#myFunc']);
      } catch {
        // Commander may throw on exit override
      }

      expect(inferSpec).toHaveBeenCalledWith({
        implementationPath: 'src/test.ts#myFunc',
        options: {
          projectRoot: '/test/project',
          inherits: undefined,
        },
      });
    });

    it('should output YAML to stdout on success', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: true,
        specId: 'spec.test.myFunc',
        yaml: 'spec.test.myFunc:\n  inherits: spec.function\n',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#myFunc']);
      } catch {
        // Commander may throw on exit override
      }

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('spec.test.myFunc')
      );
    });

    it('should log spec metadata on success without --json', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: true,
        specId: 'spec.test.myFunc',
        yaml: 'yaml-content',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'token' },
          effects: [{ type: 'database' }],
          errorCodes: ['NOT_FOUND', 'UNAUTHORIZED'],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#myFunc']);
      } catch {
        // ignore
      }

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('spec.test.myFunc'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('spec.function'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('token'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('database'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('NOT_FOUND'));
    });

    it('should write to file when --output is provided', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: true,
        specId: 'spec.test.myFunc',
        yaml: 'yaml-output',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#myFunc', '--output', '/out/spec.yaml']);
      } catch {
        // ignore
      }

      expect(ensureDir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledWith('/out/spec.yaml', 'yaml-output');
    });

    it('should not write file when --dry-run is set', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: true,
        specId: 'spec.test.myFunc',
        yaml: 'yaml-output',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#myFunc', '--output', '/out/spec.yaml', '--dry-run']);
      } catch {
        // ignore
      }

      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should output JSON when --json flag is provided', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: true,
        specId: 'spec.test.myFunc',
        yaml: 'yaml-content',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#myFunc', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"specId"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('should exit with code 1 and log errors when inference is invalid', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: false,
        specId: '',
        yaml: '',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [{ code: 'PARSE_ERROR', message: 'Could not parse file' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/bad.ts#fn']);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('PARSE_ERROR'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should output JSON errors when --json and inference is invalid', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: false,
        specId: '',
        yaml: '',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [{ code: 'PARSE_ERROR', message: 'Could not parse file' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/bad.ts#fn', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"valid"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should pass --inherits option to inferSpec', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: true,
        specId: 'spec.test.myFunc',
        yaml: 'yaml-content',
        detectedPatterns: {
          baseSpec: 'spec.mutation',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#fn', '--inherits', 'spec.mutation']);
      } catch {
        // ignore
      }

      expect(inferSpec).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            inherits: 'spec.mutation',
          }),
        })
      );
    });

    it('should exit with code 0 on successful inference', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: true,
        specId: 'spec.test.myFunc',
        yaml: 'yaml',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#fn']);
      } catch {
        // ignore
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('update mode (--update)', () => {
    it('should call inferSpecUpdate when --update is provided', async () => {
      vi.mocked(inferSpecUpdate).mockResolvedValue({
        valid: true,
        yaml: 'updated-yaml',
        mergeReport: {
          addedInputs: [],
          removedInputs: [],
          addedOutputs: [],
          removedOutputs: [],
          preservedSections: ['goal', 'intent'],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--update', 'spec.test.myFunc',
        ]);
      } catch {
        // ignore
      }

      expect(inferSpecUpdate).toHaveBeenCalledWith({
        specId: 'spec.test.myFunc',
        implementationPath: 'src/test.ts#fn',
        options: { projectRoot: '/test/project' },
      });
    });

    it('should log merge report on successful update', async () => {
      vi.mocked(inferSpecUpdate).mockResolvedValue({
        valid: true,
        yaml: 'updated-yaml',
        mergeReport: {
          addedInputs: ['newParam'],
          removedInputs: ['oldParam'],
          addedOutputs: ['newOutput'],
          removedOutputs: ['oldOutput'],
          preservedSections: ['goal', 'intent', 'examples'],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--update', 'spec.test.myFunc',
        ]);
      } catch {
        // ignore
      }

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('newParam'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('oldParam'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('newOutput'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('oldOutput'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('goal'));
    });

    it('should write updated spec to file when --output is provided', async () => {
      vi.mocked(inferSpecUpdate).mockResolvedValue({
        valid: true,
        yaml: 'updated-yaml-content',
        mergeReport: {
          addedInputs: [],
          removedInputs: [],
          addedOutputs: [],
          removedOutputs: [],
          preservedSections: ['goal'],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--update', 'spec.test.myFunc',
          '--output', '/out/updated.yaml',
        ]);
      } catch {
        // ignore
      }

      expect(writeFile).toHaveBeenCalledWith('/out/updated.yaml', 'updated-yaml-content');
    });

    it('should not write file in update mode when --dry-run is set', async () => {
      vi.mocked(inferSpecUpdate).mockResolvedValue({
        valid: true,
        yaml: 'updated-yaml-content',
        mergeReport: {
          addedInputs: [],
          removedInputs: [],
          addedOutputs: [],
          removedOutputs: [],
          preservedSections: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--update', 'spec.test.myFunc',
          '--output', '/out/updated.yaml',
          '--dry-run',
        ]);
      } catch {
        // ignore
      }

      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should output JSON in update mode when --json is provided', async () => {
      vi.mocked(inferSpecUpdate).mockResolvedValue({
        valid: true,
        yaml: 'updated-yaml',
        mergeReport: {
          addedInputs: [],
          removedInputs: [],
          addedOutputs: [],
          removedOutputs: [],
          preservedSections: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--update', 'spec.test.myFunc',
          '--json',
        ]);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"valid"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('should exit with code 1 when update is invalid', async () => {
      vi.mocked(inferSpecUpdate).mockResolvedValue({
        valid: false,
        yaml: '',
        mergeReport: {
          addedInputs: [],
          removedInputs: [],
          addedOutputs: [],
          removedOutputs: [],
          preservedSections: [],
        },
        errors: [{ code: 'SPEC_NOT_FOUND', message: 'Spec not found' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--update', 'spec.nonexistent',
        ]);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SPEC_NOT_FOUND'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit with code 0 when update is valid', async () => {
      vi.mocked(inferSpecUpdate).mockResolvedValue({
        valid: true,
        yaml: 'yaml',
        mergeReport: {
          addedInputs: [],
          removedInputs: [],
          addedOutputs: [],
          removedOutputs: [],
          preservedSections: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--update', 'spec.test.myFunc',
        ]);
      } catch {
        // ignore
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('update mode extended', () => {
    it('should output YAML to stdout when valid update without --output', async () => {
      vi.mocked(inferSpecUpdate).mockResolvedValue({
        valid: true,
        yaml: 'spec.test.myFunc:\n  updated: true\n',
        mergeReport: {
          addedInputs: [],
          removedInputs: [],
          addedOutputs: [],
          removedOutputs: [],
          preservedSections: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--update', 'spec.test.myFunc',
        ]);
      } catch {
        // ignore
      }

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('spec.test.myFunc')
      );
    });

    it('should output JSON errors in update mode when --json and invalid', async () => {
      vi.mocked(inferSpecUpdate).mockResolvedValue({
        valid: false,
        yaml: '',
        mergeReport: {
          addedInputs: [],
          removedInputs: [],
          addedOutputs: [],
          removedOutputs: [],
          preservedSections: [],
        },
        errors: [{ code: 'PARSE_FAIL', message: 'Parse failed' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--update', 'spec.bad',
          '--json',
        ]);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"valid"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('infer mode extended', () => {
    it('should not log metadata in --dry-run mode', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: true,
        specId: 'spec.test.myFunc',
        yaml: 'yaml-content',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#fn', '--dry-run']);
      } catch {
        // ignore
      }

      // In dry-run mode, no metadata logging happens (no Spec ID line)
      const infoCallArgs = vi.mocked(logger.info).mock.calls.map(c => String(c[0]));
      const hasSpecIdLog = infoCallArgs.some(arg => arg.includes('Spec ID'));
      expect(hasSpecIdLog).toBe(false);
    });

    it('should output YAML to stdout (not file) in --dry-run with --output', async () => {
      vi.mocked(inferSpec).mockReturnValue({
        valid: true,
        specId: 'spec.test.myFunc',
        yaml: 'yaml-dry-run',
        detectedPatterns: {
          baseSpec: 'spec.function',
          security: { authentication: 'none' },
          effects: [],
          errorCodes: [],
        },
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--output', '/out/spec.yaml',
          '--dry-run',
        ]);
      } catch {
        // ignore
      }

      // writeFile should NOT be called in dry-run
      expect(writeFile).not.toHaveBeenCalled();
      // YAML should still be output to stdout
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('yaml-dry-run')
      );
    });
  });

  describe('error handling', () => {
    it('should catch and log unexpected errors', async () => {
      vi.mocked(inferSpec).mockImplementation(() => {
        throw new Error('Unexpected crash');
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#fn']);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Unexpected crash'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should output JSON error when --json and unexpected error occurs', async () => {
      vi.mocked(inferSpec).mockImplementation(() => {
        throw new Error('Boom');
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'infer', 'src/test.ts#fn', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"error"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should catch and log error in update mode', async () => {
      vi.mocked(inferSpecUpdate).mockRejectedValue(new Error('Update crash'));

      const parent = new Command('spec');
      parent.exitOverride();
      registerInferCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'infer', 'src/test.ts#fn',
          '--update', 'spec.test.myFunc',
        ]);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Update crash'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
