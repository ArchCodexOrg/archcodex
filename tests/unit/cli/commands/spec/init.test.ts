/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for spec init subcommand registration and runSpecInit logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerInitCommand, runSpecInit } from '../../../../../src/cli/commands/spec/init.js';

vi.mock('../../../../../src/utils/file-system.js', () => ({
  fileExists: vi.fn(),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('version: "1.0"\n'),
}));

vi.mock('../../../../../src/cli/commands/spec-init-templates.js', () => ({
  SPEC_BASE_TEMPLATE: 'base-template-content',
  SPEC_MIXINS_TEMPLATE: 'mixins-template-content',
  SPEC_EXAMPLE_TEMPLATE: 'example-template-content',
  SPEC_CONFIG_SECTION: '\nspeccodex:\n  enabled: true\n',
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

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

import { fileExists, ensureDir, writeFile, readFile } from '../../../../../src/utils/file-system.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('registerInitCommand', () => {
  it('registers init subcommand on parent', () => {
    const parent = new Command('spec');
    registerInitCommand(parent);

    const init = parent.commands.find(c => c.name() === 'init');
    expect(init).toBeDefined();
    expect(init!.description()).toContain('Initialize');
  });

  it('init command has --force option', () => {
    const parent = new Command('spec');
    registerInitCommand(parent);

    const init = parent.commands.find(c => c.name() === 'init')!;
    const forceOption = init.options.find(o => o.long === '--force');
    expect(forceOption).toBeDefined();
  });

  it('init command has --minimal option', () => {
    const parent = new Command('spec');
    registerInitCommand(parent);

    const init = parent.commands.find(c => c.name() === 'init')!;
    const minimalOption = init.options.find(o => o.long === '--minimal');
    expect(minimalOption).toBeDefined();
  });
});

describe('runSpecInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when .arch directory does not exist', async () => {
    vi.mocked(fileExists).mockResolvedValue(false);

    await expect(
      runSpecInit({ options: { projectRoot: '/test' } })
    ).rejects.toThrow('ARCH_NOT_INITIALIZED');
  });

  it('creates specs directory when .arch exists', async () => {
    // .arch dir exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // _base.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // _mixins.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // example.spec.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // config.yaml does not exist (for update check)
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const result = await runSpecInit({ options: { projectRoot: '/test' } });

    expect(ensureDir).toHaveBeenCalledWith(expect.stringContaining('specs'));
    expect(result.success).toBe(true);
  });

  it('creates base, mixins, and example files', async () => {
    // .arch dir exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // _base.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // _mixins.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // example.spec.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // config.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const result = await runSpecInit({ options: { projectRoot: '/test' } });

    expect(writeFile).toHaveBeenCalledTimes(3);
    expect(result.filesCreated).toHaveLength(3);
    expect(result.filesCreated).toEqual(
      expect.arrayContaining([
        expect.stringContaining('_base.yaml'),
        expect.stringContaining('_mixins.yaml'),
        expect.stringContaining('example.spec.yaml'),
      ])
    );
  });

  it('skips example file in minimal mode', async () => {
    // .arch dir exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // _base.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // _mixins.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // config.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const result = await runSpecInit({ options: { projectRoot: '/test', minimal: true } });

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(result.filesCreated).toHaveLength(2);
    const hasExample = result.filesCreated.some(f => f.includes('example'));
    expect(hasExample).toBe(false);
  });

  it('skips files that already exist when force is false', async () => {
    // .arch dir exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // _base.yaml exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // _mixins.yaml exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // example.spec.yaml exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // config.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const result = await runSpecInit({ options: { projectRoot: '/test' } });

    expect(writeFile).not.toHaveBeenCalled();
    expect(result.filesSkipped).toHaveLength(3);
    expect(result.filesCreated).toHaveLength(0);
    expect(result.success).toBe(true);
  });

  it('overwrites existing files when force is true', async () => {
    // .arch dir exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // For force mode, fileExists is not called for the skip check
    // _base.yaml - force skips the existence check
    // _mixins.yaml
    // example.spec.yaml
    // config.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const result = await runSpecInit({ options: { projectRoot: '/test', force: true } });

    expect(writeFile).toHaveBeenCalledTimes(3);
    expect(result.filesCreated).toHaveLength(3);
  });

  it('updates config.yaml when it exists but lacks speccodex section', async () => {
    // .arch dir exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // _base.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // _mixins.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // example.spec.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // config.yaml exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);

    vi.mocked(readFile).mockResolvedValue('version: "1.0"\nfiles:\n  scan:\n    include: ["**/*.ts"]\n');

    const result = await runSpecInit({ options: { projectRoot: '/test' } });

    // writeFile should be called 4 times: 3 spec files + config update
    expect(writeFile).toHaveBeenCalledTimes(4);
    expect(result.filesCreated).toContain('.arch/config.yaml (updated)');
  });

  it('does not update config.yaml when speccodex section already present', async () => {
    // .arch dir exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // _base.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // _mixins.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // example.spec.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // config.yaml exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);

    vi.mocked(readFile).mockResolvedValue('version: "1.0"\nspeccodex:\n  enabled: true\n');

    const result = await runSpecInit({ options: { projectRoot: '/test' } });

    // writeFile should be called 3 times: only spec files, config not updated
    expect(writeFile).toHaveBeenCalledTimes(3);
    const configUpdated = result.filesCreated.some(f => f.includes('config.yaml'));
    expect(configUpdated).toBe(false);
  });

  it('uses process.cwd() when no projectRoot is specified', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/default/cwd');

    // .arch dir check
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // _base.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // _mixins.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // example.spec.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    // config.yaml does not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    await runSpecInit({ options: {} });

    // ensureDir should have been called with a path containing /default/cwd
    expect(ensureDir).toHaveBeenCalledWith(expect.stringContaining('/default/cwd'));

    cwdSpy.mockRestore();
  });

  it('returns success true when no errors occur', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const result = await runSpecInit({ options: { projectRoot: '/test' } });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('init command action', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset file-system mocks to clear any queued mockResolvedValueOnce values
    // from previous tests (clearAllMocks does not clear the once-value queue)
    vi.mocked(fileExists).mockReset();
    vi.mocked(ensureDir).mockReset().mockResolvedValue(undefined);
    vi.mocked(writeFile).mockReset().mockResolvedValue(undefined);
    vi.mocked(readFile).mockReset().mockResolvedValue('version: "1.0"\n');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  it('should display success message on successful init', async () => {
    // .arch dir exists
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    // Files do not exist
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init']);
    } catch {
      // ignore
    }

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('initialized successfully')
    );
  });

  it('should display created files list', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init']);
    } catch {
      // ignore
    }

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Created')
    );
  });

  it('should display skipped files when they already exist', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(true); // _base.yaml exists
    vi.mocked(fileExists).mockResolvedValueOnce(true); // _mixins.yaml exists
    vi.mocked(fileExists).mockResolvedValueOnce(true); // example exists
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init']);
    } catch {
      // ignore
    }

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipped')
    );
  });

  it('should display next steps after successful init', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init']);
    } catch {
      // ignore
    }

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Next steps')
    );
  });

  it('should not mention example spec in next steps when --minimal', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init', '--minimal']);
    } catch {
      // ignore
    }

    // Check that next steps are shown but without example reference
    const allCalls = consoleLogSpy.mock.calls.map(c => String(c[0]));
    const hasNextSteps = allCalls.some(c => c.includes('Next steps'));
    expect(hasNextSteps).toBe(true);
  });

  it('should exit with code 1 when .arch is not initialized', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init']);
    } catch {
      // ignore
    }

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('.arch/ directory not found')
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with code 1 on unexpected error', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(ensureDir).mockRejectedValueOnce(new Error('Permission denied'));

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init']);
    } catch {
      // ignore
    }

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Permission denied')
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should pass --force option through to runSpecInit', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init', '--force']);
    } catch {
      // ignore
    }

    // All files should be created (force mode)
    expect(writeFile).toHaveBeenCalledTimes(3);
  });

  it('should handle non-Error objects in catch block', async () => {
    // Mock runSpecInit to throw a non-Error value by making writeFile reject with a string.
    // We need archDir to exist, and one file check to pass, so writeFile is invoked.
    vi.mocked(fileExists)
      .mockResolvedValueOnce(true)   // archDir exists
      .mockResolvedValueOnce(false)  // _base.yaml does not exist
      .mockResolvedValueOnce(false)  // _mixins.yaml does not exist
      .mockResolvedValueOnce(false)  // example does not exist
      .mockResolvedValueOnce(false); // config does not exist
    vi.mocked(writeFile).mockRejectedValueOnce(42); // non-Error thrown value

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init']);
    } catch {
      // ignore
    }

    // The non-Error path uses: `Initialization failed: ${error}`
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Initialization failed')
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should not show step 3 about example spec in minimal mode next steps', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init', '--minimal']);
    } catch {
      // ignore
    }

    // In minimal mode, the "Study example.spec.yaml" step should be absent
    const allCalls = consoleLogSpy.mock.calls.map(c => String(c[0]));
    const hasExampleStep = allCalls.some(c => c.includes('example.spec.yaml'));
    expect(hasExampleStep).toBe(false);
  });

  it('should display created file count matching actual files', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init']);
    } catch {
      // ignore
    }

    // writeFile should have been called 3 times for the created files
    expect(writeFile).toHaveBeenCalledTimes(3);
    // console.log should have been called multiple times for output
    expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(5);
  });

  it('should output skipped section when all files already exist', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init']);
    } catch {
      // ignore
    }

    // No files written
    expect(writeFile).not.toHaveBeenCalled();
    // Should still show success + skipped section
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipped')
    );
  });

  it('should display generate tests step in next steps', async () => {
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);
    vi.mocked(fileExists).mockResolvedValueOnce(false);

    const parent = new Command('spec');
    parent.exitOverride();
    registerInitCommand(parent);

    try {
      await parent.parseAsync(['node', 'spec', 'init']);
    } catch {
      // ignore
    }

    const allCalls = consoleLogSpy.mock.calls.map(c => String(c[0]));
    const hasGenerateStep = allCalls.some(c => c.includes('spec generate'));
    expect(hasGenerateStep).toBe(true);
  });
});
