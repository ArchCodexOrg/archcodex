/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the feature command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFeatureCommand } from '../../../../src/cli/commands/feature.js';
import type { FeatureRegistry, FeatureDefinition } from '../../../../src/core/registry/schema.js';

// Mock state
let mockFeatureRegistry: FeatureRegistry = { features: {} };
let mockFeatureNames: string[] = [];
let mockHasFeature = false;
let mockGetFeature: FeatureDefinition | undefined = undefined;
let mockPreviewResult = { components: [] as Array<{ role: string; path: string; exists: boolean; optional: boolean }> };
let mockScaffoldResult = { success: true, components: [] as Array<{ role: string; path: string; success: boolean; error?: string; skipped?: boolean }>, checklist: [] as string[] };

// Mock dependencies
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadFeatureRegistry: vi.fn().mockImplementation(async () => mockFeatureRegistry),
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {},
    mixins: {},
  }),
  listFeatureNames: vi.fn().mockImplementation(() => mockFeatureNames),
  getFeature: vi.fn().mockImplementation(() => mockGetFeature),
  hasFeature: vi.fn().mockImplementation(() => mockHasFeature),
}));

vi.mock('../../../../src/core/discovery/index.js', () => ({
  loadIndex: vi.fn().mockResolvedValue({ entries: {} }),
}));

vi.mock('../../../../src/core/scaffold/feature-engine.js', () => ({
  FeatureEngine: vi.fn(function() {
    return {
    previewFeature: vi.fn().mockImplementation(async () => mockPreviewResult),
    scaffoldFeature: vi.fn().mockImplementation(async () => mockScaffoldResult),
  };
  }),
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
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
      green: (s: string) => s,
      red: (s: string) => s,
    }),
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('feature command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFeatureRegistry = { features: {} };
    mockFeatureNames = [];
    mockHasFeature = false;
    mockGetFeature = undefined;
    mockPreviewResult = { components: [] };
    mockScaffoldResult = { success: true, components: [], checklist: [] };
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Reset mock implementations
    const loader = await import('../../../../src/core/registry/loader.js');
    vi.mocked(loader.loadFeatureRegistry).mockImplementation(async () => mockFeatureRegistry);
    vi.mocked(loader.listFeatureNames).mockImplementation(() => mockFeatureNames);
    vi.mocked(loader.getFeature).mockImplementation(() => mockGetFeature);
    vi.mocked(loader.hasFeature).mockImplementation(() => mockHasFeature);
  });

  describe('createFeatureCommand', () => {
    it('should create a command with correct name', () => {
      const command = createFeatureCommand();
      expect(command.name()).toBe('feature');
    });

    it('should have the correct description', () => {
      const command = createFeatureCommand();
      expect(command.description()).toContain('Scaffold');
    });

    it('should have an optional feature-name argument', () => {
      const command = createFeatureCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('feature-name');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createFeatureCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--name');
      expect(optionNames).toContain('--dry-run');
      expect(optionNames).toContain('--overwrite');
      expect(optionNames).toContain('--skip-optional');
      expect(optionNames).toContain('--json');
    });

    it('should have subcommands', () => {
      const command = createFeatureCommand();
      const subcommands = command.commands;

      const subcommandNames = subcommands.map((cmd) => cmd.name());
      expect(subcommandNames).toContain('list');
      expect(subcommandNames).toContain('show');
    });
  });

  describe('execution - no feature name', () => {
    it('should show help when no feature name provided', async () => {
      mockFeatureNames = ['add-constraint', 'add-view'];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.listFeatureNames).mockReturnValue(mockFeatureNames);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Feature Scaffolding'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('add-constraint'));
    });

    it('should show no features message when none defined', async () => {
      mockFeatureNames = [];

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No features defined'));
    });

    it('should output JSON when no feature name provided with --json', async () => {
      mockFeatureNames = ['add-view'];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.listFeatureNames).mockReturnValue(mockFeatureNames);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('hint');
      expect(output).toHaveProperty('available');
    });
  });

  describe('execution - feature not found', () => {
    it('should error when feature not found', async () => {
      mockHasFeature = false;

      const command = createFeatureCommand();
      await expect(command.parseAsync(['node', 'test', 'nonexistent', '--name', 'Test'])).rejects.toThrow(
        'process.exit called'
      );

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Feature not found'));
    });

    it('should output JSON error when feature not found with --json', async () => {
      mockHasFeature = false;
      mockFeatureNames = ['add-view'];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.listFeatureNames).mockReturnValue(mockFeatureNames);

      const command = createFeatureCommand();
      await expect(command.parseAsync(['node', 'test', 'nonexistent', '--name', 'Test', '--json'])).rejects.toThrow(
        'process.exit called'
      );

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.error !== undefined;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
    });
  });

  describe('execution - missing name option', () => {
    it('should error when --name not provided', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await expect(command.parseAsync(['node', 'test', 'add-view'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Missing required --name'));
    });

    it('should output JSON error when --name not provided with --json', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await expect(command.parseAsync(['node', 'test', 'add-view', '--json'])).rejects.toThrow(
        'process.exit called'
      );

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.error !== undefined;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
    });
  });

  describe('execution - dry run', () => {
    it('should preview feature scaffold with --dry-run', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [
          { role: 'main', architecture: 'app.view', path: 'src/views/${name}.tsx' },
        ],
        checklist: ['Register in module'],
      };
      mockPreviewResult = {
        components: [
          { role: 'main', path: 'src/views/MyView.tsx', exists: false, optional: false },
        ],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test', 'add-view', '--name', 'MyView', '--dry-run']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Preview'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Would create'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('main'));
    });

    it('should show existing file marker in preview', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [{ role: 'main', architecture: 'app.view', path: 'src/views/${name}.tsx' }],
      };
      mockPreviewResult = {
        components: [
          { role: 'main', path: 'src/views/MyView.tsx', exists: true, optional: false },
        ],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test', 'add-view', '--name', 'MyView', '--dry-run']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('exists'));
    });

    it('should show optional marker in preview', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [{ role: 'test', architecture: 'app.test', path: 'tests/${name}.test.tsx', optional: true }],
      };
      mockPreviewResult = {
        components: [
          { role: 'test', path: 'tests/MyView.test.tsx', exists: false, optional: true },
        ],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test', 'add-view', '--name', 'MyView', '--dry-run']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('optional'));
    });

    it('should show checklist in preview when present', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [],
        checklist: ['Register in module', 'Update routes'],
      };
      mockPreviewResult = { components: [] };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test', 'add-view', '--name', 'MyView', '--dry-run']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Manual steps'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Register in module'));
    });

    it('should output JSON in dry-run with --json', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [],
      };
      mockPreviewResult = { components: [] };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test', 'add-view', '--name', 'MyView', '--dry-run', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.dryRun !== undefined;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.dryRun).toBe(true);
    });
  });

  describe('execution - scaffold', () => {
    it('should scaffold feature successfully', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [{ role: 'main', architecture: 'app.view', path: 'src/views/${name}.tsx' }],
      };
      mockScaffoldResult = {
        success: true,
        components: [{ role: 'main', path: 'src/views/MyView.tsx', success: true }],
        checklist: [],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test', 'add-view', '--name', 'MyView']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Feature scaffolded'));
    });

    it('should show failed scaffold result', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [{ role: 'main', architecture: 'app.view', path: 'src/views/${name}.tsx' }],
      };
      mockScaffoldResult = {
        success: false,
        components: [{ role: 'main', path: 'src/views/MyView.tsx', success: false, error: 'Permission denied' }],
        checklist: [],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await expect(command.parseAsync(['node', 'test', 'add-view', '--name', 'MyView'])).rejects.toThrow(
        'process.exit called'
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('failed'));
    });

    it('should show skipped optional components', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [
          { role: 'main', architecture: 'app.view', path: 'src/views/${name}.tsx' },
          { role: 'test', architecture: 'app.test', path: 'tests/${name}.test.tsx', optional: true },
        ],
      };
      mockScaffoldResult = {
        success: true,
        components: [
          { role: 'main', path: 'src/views/MyView.tsx', success: true },
          { role: 'test', path: 'tests/MyView.test.tsx', success: false, skipped: true },
        ],
        checklist: [],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test', 'add-view', '--name', 'MyView', '--skip-optional']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('skipped'));
    });

    it('should show checklist after scaffold', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [],
      };
      mockScaffoldResult = {
        success: true,
        components: [],
        checklist: ['Register in module', 'Update routes'],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test', 'add-view', '--name', 'MyView']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Remaining manual steps'));
    });

    it('should output JSON with scaffold result', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Test feature',
        components: [],
      };
      mockScaffoldResult = {
        success: true,
        components: [],
        checklist: [],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      await command.parseAsync(['node', 'test', 'add-view', '--name', 'MyView', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.success !== undefined;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
    });
  });

  describe('feature list subcommand', () => {
    it('should warn when no features defined', async () => {
      mockFeatureNames = [];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.listFeatureNames).mockReturnValue([]);

      const command = createFeatureCommand();
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await listCommand.parseAsync(['node', 'test']);

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No features defined'));
    });

    it('should list features', async () => {
      mockFeatureRegistry = {
        features: {
          'add-view': {
            description: 'Add a view',
            components: [{ role: 'main', architecture: 'app.view', path: 'src/views/${name}.tsx' }],
          },
        },
      };
      mockFeatureNames = ['add-view'];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadFeatureRegistry).mockResolvedValue(mockFeatureRegistry);
      vi.mocked(loader.listFeatureNames).mockReturnValue(mockFeatureNames);

      const command = createFeatureCommand();
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await listCommand.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Available Feature Templates'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('add-view'));
    });

    it('should output JSON with --json flag', async () => {
      mockFeatureRegistry = {
        features: {
          'add-view': {
            description: 'Add a view',
            components: [{ role: 'main', architecture: 'app.view', path: 'src/${name}.tsx' }],
          },
        },
      };
      mockFeatureNames = ['add-view'];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadFeatureRegistry).mockResolvedValue(mockFeatureRegistry);
      vi.mocked(loader.listFeatureNames).mockReturnValue(mockFeatureNames);

      const command = createFeatureCommand();
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await listCommand.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(Array.isArray(output)).toBe(true);
    });

    it('should output JSON when empty with --json flag', async () => {
      mockFeatureNames = [];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.listFeatureNames).mockReturnValue([]);

      const command = createFeatureCommand();
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await listCommand.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.features).toEqual([]);
    });
  });

  describe('feature show subcommand', () => {
    it('should error when feature not found', async () => {
      mockHasFeature = false;

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(false);

      const command = createFeatureCommand();
      const showCommand = command.commands.find(c => c.name() === 'show')!;
      await expect(showCommand.parseAsync(['node', 'test', 'nonexistent'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Feature not found'));
    });

    it('should show feature details', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Add a view component',
        components: [
          { role: 'main', architecture: 'app.view', path: 'src/views/${name}.tsx' },
          { role: 'test', architecture: 'app.test', path: 'tests/${name}.test.tsx', optional: true },
        ],
        shared_variables: { layer: 'view' },
        checklist: ['Register in module'],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      const showCommand = command.commands.find(c => c.name() === 'show')!;
      await showCommand.parseAsync(['node', 'test', 'add-view']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('add-view'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Add a view'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('app.view'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('optional'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('layer'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Register in module'));
    });

    it('should output JSON with --json flag', async () => {
      mockHasFeature = true;
      mockGetFeature = {
        description: 'Add a view',
        components: [{ role: 'main', architecture: 'app.view', path: 'src/${name}.tsx' }],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(true);
      vi.mocked(loader.getFeature).mockReturnValue(mockGetFeature);

      const command = createFeatureCommand();
      const showCommand = command.commands.find(c => c.name() === 'show')!;
      await showCommand.parseAsync(['node', 'test', 'add-view', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('name', 'add-view');
    });

    it('should output JSON error when not found with --json', async () => {
      mockHasFeature = false;

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasFeature).mockReturnValue(false);

      const command = createFeatureCommand();
      const showCommand = command.commands.find(c => c.name() === 'show')!;
      await expect(showCommand.parseAsync(['node', 'test', 'nonexistent', '--json'])).rejects.toThrow(
        'process.exit called'
      );

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.error !== undefined;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle errors in main command', async () => {
      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadFeatureRegistry).mockRejectedValue(new Error('Load failed'));

      const command = createFeatureCommand();
      await expect(command.parseAsync(['node', 'test', 'feature-name', '--name', 'Test'])).rejects.toThrow(
        'process.exit called'
      );

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Load failed');
    });

    it('should handle errors in list subcommand', async () => {
      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadFeatureRegistry).mockRejectedValue(new Error('Load failed'));

      const command = createFeatureCommand();
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await expect(listCommand.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Load failed');
    });

    it('should handle errors in show subcommand', async () => {
      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadFeatureRegistry).mockRejectedValue(new Error('Load failed'));

      const command = createFeatureCommand();
      const showCommand = command.commands.find(c => c.name() === 'show')!;
      await expect(showCommand.parseAsync(['node', 'test', 'feature-name'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Load failed');
    });
  });
});
