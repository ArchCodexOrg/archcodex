/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the action command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActionCommand } from '../../../../src/cli/commands/action.js';
import type { ActionRegistry, ActionDefinition } from '../../../../src/core/registry/schema.js';
import type { FeatureRegistry, FeatureDefinition } from '../../../../src/core/registry/schema.js';

// Mock action registry result
let mockActionRegistry: ActionRegistry = { actions: {} };
let mockFeatureRegistry: FeatureRegistry = { features: {} };
let mockActionNames: string[] = [];
let mockActionMatch: Array<{ name: string; action: ActionDefinition; score: number; matchType: string }> = [];
let mockHasAction = false;
let mockGetAction: ActionDefinition | undefined = undefined;
let mockLinkedFeature: FeatureDefinition | undefined = undefined;

// Mock dependencies
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadActionRegistry: vi.fn().mockImplementation(async () => mockActionRegistry),
  loadFeatureRegistry: vi.fn().mockImplementation(async () => mockFeatureRegistry),
  listActionNames: vi.fn().mockImplementation(() => mockActionNames),
  getAction: vi.fn().mockImplementation(() => mockGetAction),
  matchAction: vi.fn().mockImplementation(() => mockActionMatch),
  hasAction: vi.fn().mockImplementation(() => mockHasAction),
  findFeatureByAction: vi.fn().mockImplementation(() => mockLinkedFeature),
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
    }),
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('action command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockActionRegistry = { actions: {} };
    mockFeatureRegistry = { features: {} };
    mockActionNames = [];
    mockActionMatch = [];
    mockHasAction = false;
    mockGetAction = undefined;
    mockLinkedFeature = undefined;
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Reset mock implementations
    const loader = await import('../../../../src/core/registry/loader.js');
    vi.mocked(loader.loadActionRegistry).mockImplementation(async () => mockActionRegistry);
    vi.mocked(loader.loadFeatureRegistry).mockImplementation(async () => mockFeatureRegistry);
    vi.mocked(loader.listActionNames).mockImplementation(() => mockActionNames);
    vi.mocked(loader.getAction).mockImplementation(() => mockGetAction);
    vi.mocked(loader.matchAction).mockImplementation(() => mockActionMatch);
    vi.mocked(loader.hasAction).mockImplementation(() => mockHasAction);
    vi.mocked(loader.findFeatureByAction).mockImplementation(() => mockLinkedFeature);
  });

  describe('createActionCommand', () => {
    it('should create a command with correct name', () => {
      const command = createActionCommand();
      expect(command.name()).toBe('action');
    });

    it('should have the correct description', () => {
      const command = createActionCommand();
      expect(command.description()).toContain('guidance');
    });

    it('should have an optional query argument', () => {
      const command = createActionCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('query');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createActionCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--json');
    });

    it('should have subcommands', () => {
      const command = createActionCommand();
      const subcommands = command.commands;

      const subcommandNames = subcommands.map((cmd) => cmd.name());
      expect(subcommandNames).toContain('list');
      expect(subcommandNames).toContain('show');
    });
  });

  describe('execution - no actions defined', () => {
    it('should warn when no actions defined', async () => {
      mockActionRegistry = { actions: {} };

      const command = createActionCommand();
      await command.parseAsync(['node', 'test', 'add view']);

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No actions defined'));
    });

    it('should output JSON when no actions defined with --json flag', async () => {
      mockActionRegistry = { actions: {} };

      const command = createActionCommand();
      await command.parseAsync(['node', 'test', 'add view', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.error !== undefined;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('error');
      expect(output).toHaveProperty('hint');
    });
  });

  describe('execution - no query', () => {
    it('should show help when no query provided', async () => {
      mockActionRegistry = {
        actions: {
          'add-view': {
            description: 'Add a view',
            checklist: [],
          },
        },
      };
      mockActionNames = ['add-view'];

      const command = createActionCommand();
      await command.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Action-Based Discovery'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('archcodex action'));
    });

    it('should show help in JSON when no query provided with --json', async () => {
      mockActionRegistry = {
        actions: {
          'add-view': {
            description: 'Add a view',
            checklist: [],
          },
        },
      };
      mockActionNames = ['add-view'];

      const command = createActionCommand();
      await command.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.hint !== undefined;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('hint');
      expect(output).toHaveProperty('examples');
      expect(output).toHaveProperty('available_actions');
    });
  });

  describe('execution - query matching', () => {
    it('should show no matching actions message', async () => {
      mockActionRegistry = {
        actions: {
          'add-view': {
            description: 'Add a view',
            checklist: [],
          },
        },
      };
      mockActionMatch = [];

      const command = createActionCommand();
      await command.parseAsync(['node', 'test', 'unrelated query']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No matching actions'));
    });

    it('should show matching actions when query matches', async () => {
      const viewAction: ActionDefinition = {
        description: 'Add a view component',
        architecture: 'app.view',
        checklist: ['Create view file', 'Register in module'],
        intents: ['ui-view'],
      };
      mockActionRegistry = {
        actions: {
          'add-view': viewAction,
        },
      };
      mockActionMatch = [
        {
          name: 'add-view',
          action: viewAction,
          score: 0.95,
          matchType: 'description',
        },
      ];

      const command = createActionCommand();
      await command.parseAsync(['node', 'test', 'add view']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('add-view'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('95%'));
    });

    it('should output JSON with --json flag for matches', async () => {
      const viewAction: ActionDefinition = {
        description: 'Add a view',
        checklist: [],
      };
      mockActionRegistry = {
        actions: { 'add-view': viewAction },
      };
      mockActionMatch = [{ name: 'add-view', action: viewAction, score: 0.9, matchType: 'name' }];

      const command = createActionCommand();
      await command.parseAsync(['node', 'test', 'add view', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return Array.isArray(parsed);
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
    });

    it('should show multiple matches', async () => {
      const viewAction: ActionDefinition = { description: 'Add a view', checklist: [] };
      const componentAction: ActionDefinition = { description: 'Add a component', checklist: [] };
      mockActionRegistry = {
        actions: {
          'add-view': viewAction,
          'add-component': componentAction,
        },
      };
      mockActionMatch = [
        { name: 'add-view', action: viewAction, score: 0.9, matchType: 'name' },
        { name: 'add-component', action: componentAction, score: 0.7, matchType: 'description' },
      ];

      const command = createActionCommand();
      await command.parseAsync(['node', 'test', 'add']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('add-view'));
    });

    it('should print action details for best match', async () => {
      const viewAction: ActionDefinition = {
        description: 'Add a view component',
        architecture: 'app.view',
        checklist: ['Step 1', 'Step 2'],
        intents: ['ui-view'],
        aliases: ['create-view', 'new-view'],
      };
      mockActionRegistry = { actions: { 'add-view': viewAction } };
      mockActionMatch = [{ name: 'add-view', action: viewAction, score: 0.95, matchType: 'name' }];

      const command = createActionCommand();
      await command.parseAsync(['node', 'test', 'view']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('app.view'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Step 1'));
    });
  });

  describe('action list subcommand', () => {
    it('should warn when no actions defined', async () => {
      mockActionNames = [];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.listActionNames).mockReturnValue([]);

      const command = createActionCommand();
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await listCommand.parseAsync(['node', 'test']);

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No actions defined'));
    });

    it('should list actions', async () => {
      mockActionRegistry = {
        actions: {
          'add-view': { description: 'Add a view', checklist: [] },
          'add-service': { description: 'Add a service', checklist: [], aliases: ['new-service'] },
        },
      };
      mockActionNames = ['add-view', 'add-service'];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadActionRegistry).mockResolvedValue(mockActionRegistry);
      vi.mocked(loader.listActionNames).mockReturnValue(mockActionNames);

      const command = createActionCommand();
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await listCommand.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Available Actions'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('add-view'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('add-service'));
    });

    it('should show aliases in list', async () => {
      mockActionRegistry = {
        actions: {
          'add-view': { description: 'Add a view', checklist: [], aliases: ['create-view', 'new-view'] },
        },
      };
      mockActionNames = ['add-view'];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadActionRegistry).mockResolvedValue(mockActionRegistry);
      vi.mocked(loader.listActionNames).mockReturnValue(mockActionNames);

      const command = createActionCommand();
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await listCommand.parseAsync(['node', 'test']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('create-view'));
    });

    it('should output JSON with --json flag', async () => {
      mockActionRegistry = {
        actions: {
          'add-view': { description: 'Add a view', checklist: [] },
        },
      };
      mockActionNames = ['add-view'];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadActionRegistry).mockResolvedValue(mockActionRegistry);
      vi.mocked(loader.listActionNames).mockReturnValue(mockActionNames);

      const command = createActionCommand();
      // Access the list subcommand directly
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await listCommand.parseAsync(['node', 'test', '--json']);

      expect(consoleLogSpy).toHaveBeenCalled();
      // Find the JSON output
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
      expect(Array.isArray(output)).toBe(true);
    });

    it('should output JSON when empty with --json flag', async () => {
      mockActionNames = [];

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.listActionNames).mockReturnValue([]);

      const command = createActionCommand();
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await listCommand.parseAsync(['node', 'test', '--json']);

      expect(consoleLogSpy).toHaveBeenCalled();
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
      expect(output.actions).toEqual([]);
    });
  });

  describe('action show subcommand', () => {
    it('should error when action not found', async () => {
      mockHasAction = false;

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasAction).mockReturnValue(false);

      const command = createActionCommand();
      const showCommand = command.commands.find(c => c.name() === 'show')!;
      await expect(showCommand.parseAsync(['node', 'test', 'nonexistent'])).rejects.toThrow(
        'process.exit called'
      );

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Action not found'));
    });

    it('should output JSON error when action not found with --json', async () => {
      mockHasAction = false;

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasAction).mockReturnValue(false);

      const command = createActionCommand();
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

    it('should show action details', async () => {
      mockHasAction = true;
      mockGetAction = {
        description: 'Add a view component',
        architecture: 'app.view',
        checklist: ['Create view file', 'Register in module'],
        intents: ['ui-view'],
        aliases: ['create-view'],
        suggested_path: 'src/views/',
        file_pattern: '${name}View.tsx',
        test_pattern: '${name}View.test.tsx',
        variables: [
          { name: 'name', prompt: 'View name', default: 'MyView' },
        ],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasAction).mockReturnValue(true);
      vi.mocked(loader.getAction).mockReturnValue(mockGetAction);

      const command = createActionCommand();
      const showCommand = command.commands.find(c => c.name() === 'show')!;
      await showCommand.parseAsync(['node', 'test', 'add-view']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('add-view'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('app.view'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Create view file'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('@intent'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('create-view'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('src/views/'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('${name}View.tsx'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('${name}'));
    });

    it('should show linked feature when available', async () => {
      mockHasAction = true;
      mockGetAction = {
        description: 'Add a view',
        architecture: 'app.view',
        checklist: [],
      };
      mockLinkedFeature = {
        description: 'Feature scaffold',
        components: [
          { role: 'view', architecture: 'app.view', path: 'src/views/${name}View.tsx' },
          { role: 'test', architecture: 'app.test', path: 'tests/${name}View.test.tsx', optional: true },
        ],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasAction).mockReturnValue(true);
      vi.mocked(loader.getAction).mockReturnValue(mockGetAction);
      vi.mocked(loader.findFeatureByAction).mockReturnValue(mockLinkedFeature);

      const command = createActionCommand();
      const showCommand = command.commands.find(c => c.name() === 'show')!;
      await showCommand.parseAsync(['node', 'test', 'add-view']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Linked Feature'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('view'));
    });

    it('should suggest scaffold command when no linked feature but architecture exists', async () => {
      mockHasAction = true;
      mockGetAction = {
        description: 'Add a view',
        architecture: 'app.view',
        checklist: [],
      };
      mockLinkedFeature = undefined;

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasAction).mockReturnValue(true);
      vi.mocked(loader.getAction).mockReturnValue(mockGetAction);

      const command = createActionCommand();
      const showCommand = command.commands.find(c => c.name() === 'show')!;
      await showCommand.parseAsync(['node', 'test', 'add-view']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('archcodex scaffold'));
    });

    it('should output JSON with --json flag', async () => {
      mockHasAction = true;
      mockGetAction = {
        description: 'Add a view',
        architecture: 'app.view',
        checklist: ['Step 1'],
        intents: ['ui-view'],
      };
      mockLinkedFeature = {
        description: 'Feature',
        components: [{ role: 'view', architecture: 'app.view', path: 'src/views/${name}.tsx' }],
      };

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasAction).mockReturnValue(true);
      vi.mocked(loader.getAction).mockReturnValue(mockGetAction);
      vi.mocked(loader.findFeatureByAction).mockReturnValue(mockLinkedFeature);

      const command = createActionCommand();
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
      expect(output).toHaveProperty('architecture', 'app.view');
      expect(output).toHaveProperty('linked_feature');
    });

    it('should output JSON without linked feature when not available', async () => {
      mockHasAction = true;
      mockGetAction = {
        description: 'Add a view',
        checklist: [],
      };
      mockLinkedFeature = undefined;

      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.hasAction).mockReturnValue(true);
      vi.mocked(loader.getAction).mockReturnValue(mockGetAction);
      vi.mocked(loader.findFeatureByAction).mockReturnValue(undefined);

      const command = createActionCommand();
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
      expect(output.linked_feature).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle errors in main command', async () => {
      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadActionRegistry).mockRejectedValue(new Error('Load failed'));

      const command = createActionCommand();
      await expect(command.parseAsync(['node', 'test', 'query'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Load failed');
    });

    it('should handle errors in list subcommand', async () => {
      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadActionRegistry).mockRejectedValue(new Error('Load failed'));

      const command = createActionCommand();
      const listCommand = command.commands.find(c => c.name() === 'list')!;
      await expect(listCommand.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Load failed');
    });

    it('should handle errors in show subcommand', async () => {
      const loader = await import('../../../../src/core/registry/loader.js');
      vi.mocked(loader.loadActionRegistry).mockRejectedValue(new Error('Load failed'));

      const command = createActionCommand();
      const showCommand = command.commands.find(c => c.name() === 'show')!;
      await expect(showCommand.parseAsync(['node', 'test', 'action-name'])).rejects.toThrow(
        'process.exit called'
      );

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Load failed');
    });
  });
});
