/**
 * @arch archcodex.test.unit
 *
 * Tests for spec fixture subcommand registration and action execution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerFixtureCommand } from '../../../../../src/cli/commands/spec/fixture.js';

// --- Configurable mock state ---
interface MockFixture {
  description: string;
  mode: 'generate' | 'documentation';
  value?: unknown;
  setup?: string;
}

let mockFixtureRegistry: { fixtures: Record<string, MockFixture> };
let mockFixturesList: Array<{ name: string; description: string; mode: string }>;
let mockTemplate: string;
let mockLoadError: boolean;

// --- Mocks ---
vi.mock('../../../../../src/core/spec/index.js', () => ({
  loadFixtures: vi.fn(async () => {
    if (mockLoadError) {
      throw new Error('Failed to load fixtures');
    }
    return mockFixtureRegistry;
  }),
  listFixtures: vi.fn(() => mockFixturesList),
  getFixturesTemplate: vi.fn(() => mockTemplate),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
  },
}));

import { logger } from '../../../../../src/utils/logger.js';

describe('registerFixtureCommand', () => {
  it('registers fixture subcommand on parent', () => {
    const parent = new Command('spec');
    registerFixtureCommand(parent);

    const fixture = parent.commands.find(c => c.name() === 'fixture');
    expect(fixture).toBeDefined();
    expect(fixture!.description()).toContain('fixture');
  });

  it('fixture command has --list option', () => {
    const parent = new Command('spec');
    registerFixtureCommand(parent);

    const fixture = parent.commands.find(c => c.name() === 'fixture')!;
    const listOption = fixture.options.find(o => o.long === '--list');
    expect(listOption).toBeDefined();
  });

  it('fixture command has --template option', () => {
    const parent = new Command('spec');
    registerFixtureCommand(parent);

    const fixture = parent.commands.find(c => c.name() === 'fixture')!;
    const templateOption = fixture.options.find(o => o.long === '--template');
    expect(templateOption).toBeDefined();
  });

  it('fixture command has --json option', () => {
    const parent = new Command('spec');
    registerFixtureCommand(parent);

    const fixture = parent.commands.find(c => c.name() === 'fixture')!;
    const jsonOption = fixture.options.find(o => o.long === '--json');
    expect(jsonOption).toBeDefined();
  });

  it('fixture command has optional name argument', () => {
    const parent = new Command('spec');
    registerFixtureCommand(parent);

    const fixture = parent.commands.find(c => c.name() === 'fixture')!;
    expect(fixture.registeredArguments).toHaveLength(1);
    expect(fixture.registeredArguments[0].required).toBe(false);
  });
});

describe('fixture command action', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/test-project');

    // Reset mock state
    mockFixtureRegistry = {
      fixtures: {
        authenticated: {
          description: 'Authenticated user context',
          mode: 'generate',
          value: { userId: 'user-123', role: 'admin' },
        },
        no_access: {
          description: 'No access context',
          mode: 'documentation',
          setup: 'Remove all permissions',
        },
        custom_fixture: {
          description: 'A custom project fixture',
          mode: 'generate',
          value: { key: 'value' },
        },
      },
    };
    mockFixturesList = [
      { name: 'authenticated', description: 'Authenticated user context', mode: 'generate' },
      { name: 'no_access', description: 'No access context', mode: 'documentation' },
      { name: 'custom_fixture', description: 'A custom project fixture', mode: 'generate' },
    ];
    mockTemplate = '# Fixtures template\nfixtures:\n  myFixture:\n    value: {}';
    mockLoadError = false;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('--template option', () => {
    it('shows template in text mode', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      await parent.parseAsync(['node', 'spec', 'fixture', '--template']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Fixtures File Template');
      expect(output).toContain('_fixtures.yaml');
      expect(output).toContain(mockTemplate);
    });

    it('shows template as JSON when --json and --template are both set', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      await parent.parseAsync(['node', 'spec', 'fixture', '--template', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          const parsed = JSON.parse(c[0] as string);
          return parsed.template !== undefined;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
    });
  });

  describe('--list option (or no name argument)', () => {
    it('lists all fixtures in text mode with --list', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      await parent.parseAsync(['node', 'spec', 'fixture', '--list']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Available Fixtures');
      expect(output).toContain('authenticated');
      expect(output).toContain('custom_fixture');
    });

    it('lists fixtures when no name is provided (default to list)', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      await parent.parseAsync(['node', 'spec', 'fixture']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Available Fixtures');
    });

    it('lists fixtures as JSON with --list and --json', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      await parent.parseAsync(['node', 'spec', 'fixture', '--list', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          const parsed = JSON.parse(c[0] as string);
          return parsed.fixtures !== undefined;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('shows built-in fixtures grouped separately', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      await parent.parseAsync(['node', 'spec', 'fixture', '--list']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Built-in');
      expect(output).toContain('Project fixtures');
    });

    it('shows documentation mode tag for doc fixtures', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      await parent.parseAsync(['node', 'spec', 'fixture', '--list']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('[doc]');
    });

    it('shows total fixture count', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      await parent.parseAsync(['node', 'spec', 'fixture', '--list']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('3 fixture(s)');
    });

    it('handles case with no built-in fixtures', async () => {
      mockFixturesList = [
        { name: 'custom_one', description: 'Custom', mode: 'generate' },
      ];

      const parent = new Command('spec');
      registerFixtureCommand(parent);

      await parent.parseAsync(['node', 'spec', 'fixture', '--list']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Project fixtures');
      expect(output).not.toContain('Built-in');
    });

    it('handles case with no custom fixtures', async () => {
      mockFixturesList = [
        { name: 'authenticated', description: 'Auth context', mode: 'generate' },
      ];

      const parent = new Command('spec');
      registerFixtureCommand(parent);

      await parent.parseAsync(['node', 'spec', 'fixture', '--list']);

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Built-in');
      expect(output).not.toContain('Project fixtures');
    });
  });

  describe('specific fixture lookup', () => {
    it('shows fixture details for an existing fixture (generate mode)', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'fixture', 'authenticated']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Fixture: @authenticated');
      expect(output).toContain('Authenticated user context');
      expect(output).toContain('generate');
      expect(output).toContain('Value');
    });

    it('shows fixture details for documentation mode with setup', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'fixture', 'no_access']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Fixture: @no_access');
      expect(output).toContain('documentation');
      expect(output).toContain('Setup');
      expect(output).toContain('Remove all permissions');
    });

    it('shows fixture as JSON when --json is set', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'fixture', 'authenticated', '--json']);
      } catch {
        // may or may not exit
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          const parsed = JSON.parse(c[0] as string);
          return parsed.name === 'authenticated';
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('exits with 1 when fixture not found (text mode)', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'fixture', 'nonexistent']);
      } catch {
        // process.exit
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error when fixture not found with --json', async () => {
      const parent = new Command('spec');
      registerFixtureCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'fixture', 'nonexistent', '--json']);
      } catch {
        // process.exit
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          const parsed = JSON.parse(c[0] as string);
          return parsed.error !== undefined;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('does not show value for generate fixtures with undefined value', async () => {
      mockFixtureRegistry.fixtures.authenticated = {
        description: 'Auth',
        mode: 'generate',
      };

      const parent = new Command('spec');
      registerFixtureCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'fixture', 'authenticated']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).not.toContain('Value');
    });

    it('does not show setup for documentation fixtures without setup', async () => {
      mockFixtureRegistry.fixtures.no_access = {
        description: 'No access',
        mode: 'documentation',
      };

      const parent = new Command('spec');
      registerFixtureCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'fixture', 'no_access']);
      } catch {
        // may or may not exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).not.toContain('Setup');
    });
  });

  describe('error handling', () => {
    it('catches errors and logs them (text mode)', async () => {
      mockLoadError = true;

      const parent = new Command('spec');
      registerFixtureCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'fixture', '--list']);
      } catch {
        // process.exit
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Fixture lookup failed'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error on exception with --json', async () => {
      mockLoadError = true;

      const parent = new Command('spec');
      registerFixtureCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'fixture', '--list', '--json']);
      } catch {
        // process.exit
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          const parsed = JSON.parse(c[0] as string);
          return parsed.error !== undefined;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
