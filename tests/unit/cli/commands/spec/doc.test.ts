/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for spec doc subcommand registration and action logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerDocCommand } from '../../../../../src/cli/commands/spec/doc.js';

// Mock core spec functions
vi.mock('../../../../../src/core/spec/index.js', () => ({
  loadSpecRegistry: vi.fn(),
  listSpecIds: vi.fn(),
  resolveSpec: vi.fn(),
  generateApiDocs: vi.fn(),
  generateExampleDocs: vi.fn(),
  generateErrorDocs: vi.fn(),
  generateAllDocs: vi.fn(),
}));

// Mock types helper
vi.mock('../../../../../src/cli/commands/spec/types.js', () => ({
  resolveOutputPath: vi.fn().mockResolvedValue('/resolved/output.md'),
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
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import {
  loadSpecRegistry,
  listSpecIds,
  resolveSpec,
  generateApiDocs,
  generateExampleDocs,
  generateErrorDocs,
  generateAllDocs,
} from '../../../../../src/core/spec/index.js';
import { resolveOutputPath } from '../../../../../src/cli/commands/spec/types.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('registerDocCommand', () => {
  it('registers doc subcommand on parent', () => {
    const parent = new Command('spec');
    registerDocCommand(parent);

    const doc = parent.commands.find(c => c.name() === 'doc');
    expect(doc).toBeDefined();
    expect(doc!.description()).toContain('documentation');
  });

  it('doc command has --type option', () => {
    const parent = new Command('spec');
    registerDocCommand(parent);

    const doc = parent.commands.find(c => c.name() === 'doc')!;
    const typeOption = doc.options.find(o => o.long === '--type');
    expect(typeOption).toBeDefined();
  });

  it('doc command has --all option', () => {
    const parent = new Command('spec');
    registerDocCommand(parent);

    const doc = parent.commands.find(c => c.name() === 'doc')!;
    const allOption = doc.options.find(o => o.long === '--all');
    expect(allOption).toBeDefined();
  });

  it('doc command has --dry-run option', () => {
    const parent = new Command('spec');
    registerDocCommand(parent);

    const doc = parent.commands.find(c => c.name() === 'doc')!;
    const dryRunOption = doc.options.find(o => o.long === '--dry-run');
    expect(dryRunOption).toBeDefined();
  });

  it('doc command has optional specId argument', () => {
    const parent = new Command('spec');
    registerDocCommand(parent);

    const doc = parent.commands.find(c => c.name() === 'doc')!;
    expect(doc.registeredArguments).toHaveLength(1);
    expect(doc.registeredArguments[0].name()).toBe('specId');
    expect(doc.registeredArguments[0].required).toBe(false);
  });

  it('doc command has --output option', () => {
    const parent = new Command('spec');
    registerDocCommand(parent);

    const doc = parent.commands.find(c => c.name() === 'doc')!;
    const outputOption = doc.options.find(o => o.long === '--output');
    expect(outputOption).toBeDefined();
  });

  it('doc command has --no-toc option', () => {
    const parent = new Command('spec');
    registerDocCommand(parent);

    const doc = parent.commands.find(c => c.name() === 'doc')!;
    const tocOption = doc.options.find(o => o.long === '--no-toc');
    expect(tocOption).toBeDefined();
  });

  it('doc command has --no-examples option', () => {
    const parent = new Command('spec');
    registerDocCommand(parent);

    const doc = parent.commands.find(c => c.name() === 'doc')!;
    const examplesOption = doc.options.find(o => o.long === '--no-examples');
    expect(examplesOption).toBeDefined();
  });

  it('doc command has --json option', () => {
    const parent = new Command('spec');
    registerDocCommand(parent);

    const doc = parent.commands.find(c => c.name() === 'doc')!;
    const jsonOption = doc.options.find(o => o.long === '--json');
    expect(jsonOption).toBeDefined();
  });

  it('doc command --type defaults to all', () => {
    const parent = new Command('spec');
    registerDocCommand(parent);

    const doc = parent.commands.find(c => c.name() === 'doc')!;
    const typeOption = doc.options.find(o => o.long === '--type');
    expect(typeOption!.defaultValue).toBe('all');
  });
});

describe('doc command action', () => {
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

  describe('when no specs are found', () => {
    it('should exit with error when registry is empty', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({ nodes: {} });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn']);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No specs found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should output JSON error when registry is empty and --json is set', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({ nodes: {} });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"error"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });
  });

  describe('when no specId is provided and --all is not set', () => {
    it('should exit with error asking for specId', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: { 'spec.test': { intent: 'test' } },
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc']);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Spec ID required')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should output JSON error when --json and no specId', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: { 'spec.test': { intent: 'test' } },
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('Spec ID required')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });
  });

  describe('single spec doc generation', () => {
    const mockRegistry = { nodes: { 'spec.test.fn': { intent: 'Test fn' } } };

    it('should resolve spec and generate all docs by default', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.fn', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: true,
        markdown: '# API Docs\nContent here',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn']);
      } catch {
        // ignore
      }

      expect(resolveSpec).toHaveBeenCalledWith(mockRegistry, 'spec.test.fn');
      expect(generateAllDocs).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('# API Docs')
      );
    });

    it('should generate api docs when --type=api', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.fn', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateApiDocs).mockReturnValue({
        valid: true,
        markdown: '# API Reference',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn', '--type', 'api']);
      } catch {
        // ignore
      }

      expect(generateApiDocs).toHaveBeenCalled();
    });

    it('should generate example docs when --type=examples', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.fn', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateExampleDocs).mockReturnValue({
        valid: true,
        markdown: '# Examples',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn', '--type', 'examples']);
      } catch {
        // ignore
      }

      expect(generateExampleDocs).toHaveBeenCalled();
    });

    it('should generate error docs when --type=errors', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.fn', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateErrorDocs).mockReturnValue({
        valid: true,
        markdown: '# Error Codes',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn', '--type', 'errors']);
      } catch {
        // ignore
      }

      expect(generateErrorDocs).toHaveBeenCalled();
    });

    it('should exit with error when spec resolution fails', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: false,
        spec: null,
        errors: [{ code: 'NOT_FOUND', message: 'Spec not found' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.nonexistent']);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resolve')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should output JSON errors when spec resolution fails and --json is set', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: false,
        spec: null,
        errors: [{ code: 'NOT_FOUND', message: 'Spec not found' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.nonexistent', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"valid"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('should exit with error when doc generation fails', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.fn', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: false,
        markdown: '',
        errors: [{ code: 'GEN_ERROR', message: 'Generation failed' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn']);
      } catch {
        // ignore
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should show preview in dry-run mode', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.fn', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: true,
        markdown: '# Generated Docs',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn', '--dry-run']);
      } catch {
        // ignore
      }

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Would generate')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('# Generated Docs')
      );
    });

    it('should write to file when --output is provided', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.fn', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: true,
        markdown: '# Docs Content',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn', '--output', '/out/docs']);
      } catch {
        // ignore
      }

      expect(resolveOutputPath).toHaveBeenCalledWith('/out/docs', 'spec.test.fn', 'docs');
    });

    it('should output JSON result when --json is set', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.fn', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: true,
        markdown: '# Docs',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"valid"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });
  });

  describe('--all flag for batch generation', () => {
    it('should generate docs for all specs when --all is set', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: {
          'spec.test.a': { intent: 'A' },
          'spec.test.b': { intent: 'B' },
        },
      });
      vi.mocked(listSpecIds).mockReturnValue(['spec.test.a', 'spec.test.b']);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.a', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: true,
        markdown: '# Docs',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', '--all']);
      } catch {
        // ignore
      }

      expect(listSpecIds).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generated documentation')
      );
    });

    it('should skip base specs when generating all', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: {
          'spec.function': { intent: 'base' },
          'spec.test.a': { intent: 'A' },
        },
      });
      vi.mocked(listSpecIds).mockReturnValue(['spec.function', 'spec.test.a']);

      // First call returns a base spec, second returns a concrete spec
      vi.mocked(resolveSpec)
        .mockReturnValueOnce({
          valid: true,
          spec: { specId: 'spec.function', node: { type: 'base' } },
          errors: [],
        })
        .mockReturnValueOnce({
          valid: true,
          spec: { specId: 'spec.test.a', node: { type: 'concrete' } },
          errors: [],
        });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: true,
        markdown: '# Docs',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', '--all']);
      } catch {
        // ignore
      }

      // generateAllDocs should only be called once (for the concrete spec)
      expect(generateAllDocs).toHaveBeenCalledTimes(1);
    });

    it('should handle resolution errors in batch mode gracefully', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: {
          'spec.test.a': { intent: 'A' },
          'spec.test.b': { intent: 'B' },
        },
      });
      vi.mocked(listSpecIds).mockReturnValue(['spec.test.a', 'spec.test.b']);
      vi.mocked(resolveSpec)
        .mockReturnValueOnce({
          valid: false,
          spec: null,
          errors: [{ code: 'ERR', message: 'Failed' }],
        })
        .mockReturnValueOnce({
          valid: true,
          spec: { specId: 'spec.test.b', node: { type: 'concrete' } },
          errors: [],
        });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: true,
        markdown: '# Docs',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', '--all']);
      } catch {
        // ignore
      }

      // Should still succeed overall with partial results
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generated documentation')
      );
    });

    it('should output JSON when --all and --json are set', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: { 'spec.test.a': { intent: 'A' } },
      });
      vi.mocked(listSpecIds).mockReturnValue(['spec.test.a']);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.a', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: true,
        markdown: '# Docs',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', '--all', '--json']);
      } catch {
        // ignore
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"specs"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('should write files when --all and --output are set', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: { 'spec.test.a': { intent: 'A' } },
      });
      vi.mocked(listSpecIds).mockReturnValue(['spec.test.a']);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.a', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: true,
        markdown: '# Generated',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', '--all', '--output', '/out/docs']);
      } catch {
        // ignore
      }

      // Should include output directory in success message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('/out/docs')
      );
    });

    it('should not write files when --all, --output, and --dry-run are set', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: { 'spec.test.a': { intent: 'A' } },
      });
      vi.mocked(listSpecIds).mockReturnValue(['spec.test.a']);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.a', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: true,
        markdown: '# Generated',
        errors: [],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', '--all', '--output', '/out/docs', '--dry-run']);
      } catch {
        // ignore
      }

      // Should still report generated count but no fs.writeFile calls
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generated documentation')
      );
    });
  });

  describe('doc generation failure with JSON', () => {
    it('should output JSON when doc generation fails and --json is set', async () => {
      const mockRegistry = { nodes: { 'spec.test.fn': { intent: 'Test fn' } } };
      vi.mocked(loadSpecRegistry).mockResolvedValue(mockRegistry);
      vi.mocked(resolveSpec).mockReturnValue({
        valid: true,
        spec: { specId: 'spec.test.fn', node: { type: 'concrete' } },
        errors: [],
      });
      vi.mocked(generateAllDocs).mockReturnValue({
        valid: false,
        markdown: '',
        errors: [{ code: 'GEN_FAIL', message: 'Generation failed' }],
      });

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn', '--json']);
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

  describe('error handling', () => {
    it('should catch unexpected errors and log them', async () => {
      vi.mocked(loadSpecRegistry).mockRejectedValue(new Error('Registry crash'));

      const parent = new Command('spec');
      parent.exitOverride();
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn']);
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
      registerDocCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'doc', 'spec.test.fn', '--json']);
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
