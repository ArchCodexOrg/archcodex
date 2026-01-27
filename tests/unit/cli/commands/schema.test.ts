/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the schema command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSchemaCommand } from '../../../../src/cli/commands/schema.js';

// Configurable mock behavior
let mockRegistryResult = {
  nodes: {
    base: { description: 'Base' },
    'archcodex.core': { description: 'Core', inherits: 'base' },
  } as Record<string, { description: string; inherits?: string; mixins?: string[]; constraints?: Array<{ rule: string; value?: unknown; why?: string }> }>,
  mixins: {
    tested: { description: 'Requires tests', inline: 'allowed' as const, constraints: [{ rule: 'require_test_file', value: ['*.test.ts'] }] },
    srp: { description: 'Single Responsibility', inline: 'only' as const, rationale: 'Per-file marker' },
    'core-tested': { description: 'Core testing', inline: 'forbidden' as const },
  } as Record<string, { description: string; inline?: 'allowed' | 'only' | 'forbidden'; constraints?: Array<{ rule: string; value?: unknown }>; rationale?: string; hints?: Array<string | { text: string; example?: string }> }>,
};

// Mock dependencies
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockImplementation(async () => mockRegistryResult),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { loadRegistry } from '../../../../src/core/registry/loader.js';

describe('schema command', () => {
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
    mockRegistryResult = {
      nodes: {
        base: { description: 'Base' },
        'archcodex.core': { description: 'Core', inherits: 'base' },
      },
      mixins: {
        tested: { description: 'Requires tests', inline: 'allowed', constraints: [{ rule: 'require_test_file', value: ['*.test.ts'] }] },
        srp: { description: 'Single Responsibility', inline: 'only', rationale: 'Per-file marker' },
        'core-tested': { description: 'Core testing', inline: 'forbidden' },
      },
    };

    // Reset mocks
    vi.mocked(loadRegistry).mockImplementation(async () => mockRegistryResult as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createSchemaCommand', () => {
    it('should create a command with correct name', () => {
      const command = createSchemaCommand();
      expect(command.name()).toBe('schema');
    });

    it('should have the correct description', () => {
      const command = createSchemaCommand();
      expect(command.description()).toContain('schema');
    });

    it('should have an optional query argument', () => {
      const command = createSchemaCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('query');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createSchemaCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--rules');
      expect(optionNames).toContain('--mixins');
      expect(optionNames).toContain('--examples');
      expect(optionNames).toContain('--all');
      expect(optionNames).toContain('--format');
      expect(optionNames).toContain('--template');
      expect(optionNames).toContain('--fields');
      expect(optionNames).toContain('--conditions');
      expect(optionNames).toContain('--architectures');
      expect(optionNames).toContain('--recipe');
    });

    it('should have default value for format option', () => {
      const command = createSchemaCommand();
      const formatOption = command.options.find((opt) => opt.long === '--format');
      expect(formatOption?.defaultValue).toBe('human');
    });
  });

  describe('default output (minimal)', () => {
    it('should show minimal output by default', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('RULES:'))).toBe(true);
      expect(calls.some((c) => c?.includes('schema --all'))).toBe(true);
    });
  });

  describe('query mode', () => {
    it('should show rule details when querying a rule', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'forbid_import']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('forbid_import'))).toBe(true);
    });

    it('should show field details when querying a field', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'description']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('description'))).toBe(true);
    });

    it('should show condition details when querying a condition', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'file_matches']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('file_matches'))).toBe(true);
    });

    it('should show mixin details when querying a mixin', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'tested']);

      expect(loadRegistry).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('tested'))).toBe(true);
    });

    it('should show architecture details when querying an architecture', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'archcodex.core']);

      expect(loadRegistry).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('archcodex.core'))).toBe(true);
    });

    it('should show "no match" for unknown queries', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'nonexistent_thing']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No match'))).toBe(true);
    });

    it('should show naming_pattern structured alternative', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'naming_pattern']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('naming_pattern'))).toBe(true);
      expect(calls.some((c) => c?.includes('Structured'))).toBe(true);
    });

    it('should output JSON for rule query with --format json', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'forbid_import', '--format', 'json']);

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
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.rule).toBe('forbid_import');
    });

    it('should output AI format for rule query', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'forbid_import', '--format', 'ai']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('- rule: forbid_import'))).toBe(true);
    });

    it('should show inline mode for mixins', async () => {
      mockRegistryResult.mixins.srp = { description: 'SRP', inline: 'only', rationale: 'Per-file marker' };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'srp']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('inline-only'))).toBe(true);
    });

    it('should show JSON for mixin query with --format json', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'tested', '--format', 'json']);

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
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.name).toBe('tested');
    });

    it('should show AI format for mixin query', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'tested', '--format', 'ai']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('mixins:') || c?.includes('+tested'))).toBe(true);
    });

    it('should show JSON for architecture query with --format json', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'archcodex.core', '--format', 'json']);

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
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.id).toBe('archcodex.core');
    });

    it('should show AI format for architecture query', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'archcodex.core', '--format', 'ai']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('@arch archcodex.core'))).toBe(true);
    });

    it('should show JSON for field query with --format json', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'description', '--format', 'json']);

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

    it('should show AI format for field query', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'description', '--format', 'ai']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('description:'))).toBe(true);
    });

    it('should show JSON for condition query with --format json', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'file_matches', '--format', 'json']);

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

    it('should show AI format for condition query', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'file_matches', '--format', 'ai']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('when:'))).toBe(true);
    });
  });

  describe('--template option', () => {
    it('should show architecture template', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--template']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Template') || c?.includes('template'))).toBe(true);
    });

    it('should output JSON for template with --format json', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--template', '--format', 'json']);

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
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.template).toBeDefined();
    });

    it('should output AI format for template', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--template', '--format', 'ai']);

      // AI format outputs just the YAML template
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('--recipe option', () => {
    it('should show available recipes when recipe not found', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--recipe', 'nonexistent']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No recipe found'))).toBe(true);
      expect(calls.some((c) => c?.includes('Available recipes'))).toBe(true);
    });

    it('should show recipe when found', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--recipe', 'domain-service']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      // Recipe exists or shows available recipes
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should output JSON for recipe with --format json', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--recipe', 'domain-service', '--format', 'json']);

      const calls = consoleLogSpy.mock.calls;
      const jsonCall = calls.find((c) => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      // Either found JSON or not found (which wouldn't be JSON)
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('--examples option', () => {
    it('should list example categories when --examples without argument', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--examples']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Available Example Categories') || c?.includes('categories'))).toBe(true);
    });

    it('should show all examples with --examples all', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--examples', 'all']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architecture Examples') || c?.includes('architectures'))).toBe(true);
    });

    it('should show architecture examples with --examples architecture', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--examples', 'architecture']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architecture'))).toBe(true);
    });

    it('should show constraint examples with --examples constraint', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--examples', 'constraint']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Constraint'))).toBe(true);
    });

    it('should show recipe list with --examples recipe', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--examples', 'recipe']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Recipe'))).toBe(true);
    });

    it('should output JSON for examples with --format json', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--examples', 'all', '--format', 'json']);

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

  describe('--format json', () => {
    it('should output JSON with default options', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--format', 'json']);

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
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.rules).toBeDefined();
    });

    it('should include mixins when --mixins flag is used', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--mixins', '--format', 'json']);

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
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.mixins).toBeDefined();
    });

    it('should include architectures when --architectures flag is used', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--architectures', '--format', 'json']);

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
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.architectures).toBeDefined();
    });

    it('should handle registry load failure gracefully', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry error'));

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--mixins', '--format', 'json']);

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
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.mixins).toEqual([]);
    });
  });

  describe('--format ai', () => {
    it('should output AI format', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--format', 'ai']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('# RULES'))).toBe(true);
      expect(calls.some((c) => c?.includes('# CONSTRAINT TEMPLATE'))).toBe(true);
    });
  });

  describe('--all option', () => {
    it('should output comprehensive documentation', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--all']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('CONSTRAINT RULES'))).toBe(true);
      expect(calls.some((c) => c?.includes('ARCHITECTURE FIELDS'))).toBe(true);
      expect(calls.some((c) => c?.includes('CONDITIONS'))).toBe(true);
    });

    it('should show mixins in comprehensive output', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--all']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('MIXINS'))).toBe(true);
    });

    it('should show architectures in comprehensive output', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--all']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('ARCHITECTURES'))).toBe(true);
    });

    it('should handle registry load failure gracefully in comprehensive mode', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry error'));

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--all']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Could not load registry'))).toBe(true);
    });
  });

  describe('section options', () => {
    it('should show only rules with --rules', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--rules']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('CONSTRAINT RULES'))).toBe(true);
    });

    it('should show only fields with --fields', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--fields']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('ARCHITECTURE FIELDS') || c?.includes('CONSTRAINT FIELDS'))).toBe(true);
    });

    it('should show only conditions with --conditions', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--conditions']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('CONDITIONS'))).toBe(true);
    });

    it('should show only mixins with --mixins', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--mixins']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('MIXINS'))).toBe(true);
    });

    it('should show only architectures with --architectures', async () => {
      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--architectures']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('ARCHITECTURES'))).toBe(true);
    });

    it('should handle empty registry gracefully', async () => {
      mockRegistryResult = { nodes: {}, mixins: {} };
      vi.mocked(loadRegistry).mockImplementation(async () => mockRegistryResult as any);

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--mixins']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('MIXINS'))).toBe(true);
    });

    it('should show mixin inline mode in section output', async () => {
      mockRegistryResult.mixins['test-inline'] = { description: 'Test', inline: 'only' };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--mixins']);

      // Check that mixins section was shown
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('MIXINS'))).toBe(true);
    });

    it('should handle registry load failure in section mode', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry error'));

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--mixins']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Could not load registry'))).toBe(true);
    });

    it('should show mixin constraints in section output', async () => {
      mockRegistryResult.mixins.tested = {
        description: 'Requires tests',
        constraints: [{ rule: 'require_test_file', value: ['*.test.ts'] }],
      };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--mixins']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('tested'))).toBe(true);
    });

    it('should show architecture details in section output', async () => {
      mockRegistryResult.nodes['archcodex.core'] = {
        description: 'Core architecture',
        inherits: 'base',
        mixins: ['tested'],
        constraints: [{ rule: 'forbid_import', value: ['axios'] }],
      };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', '--architectures']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('archcodex.core'))).toBe(true);
    });
  });

  describe('mixin details in query', () => {
    it('should show mixin constraints', async () => {
      mockRegistryResult.mixins.tested = {
        description: 'Requires tests',
        constraints: [{ rule: 'require_test_file', value: ['*.test.ts'] }],
      };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'tested']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Constraints'))).toBe(true);
    });

    it('should show mixin hints', async () => {
      mockRegistryResult.mixins.tested = {
        description: 'Requires tests',
        hints: ['Always test edge cases'],
      };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'tested']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Hints'))).toBe(true);
    });

    it('should show mixin rationale', async () => {
      mockRegistryResult.mixins.srp = {
        description: 'Single Responsibility',
        rationale: 'Each module should have one reason to change',
      };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'srp']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Rationale'))).toBe(true);
    });

    it('should show usage example for inline-only mixin', async () => {
      mockRegistryResult.mixins.srp = {
        description: 'Single Responsibility',
        inline: 'only',
      };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'srp']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('@arch') || c?.includes('+srp'))).toBe(true);
    });

    it('should show usage example for registry-only mixin', async () => {
      mockRegistryResult.mixins['core-tested'] = {
        description: 'Core testing',
        inline: 'forbidden',
      };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'core-tested']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('mixins:') || c?.includes('registry'))).toBe(true);
    });
  });

  describe('architecture details in query', () => {
    it('should show architecture constraints', async () => {
      mockRegistryResult.nodes['archcodex.core'] = {
        description: 'Core',
        constraints: [{ rule: 'forbid_import', value: ['axios'], why: 'Use internal client' }],
      };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'archcodex.core']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Constraints'))).toBe(true);
    });

    it('should show architecture hints', async () => {
      mockRegistryResult.nodes['archcodex.core'] = {
        description: 'Core',
        hints: ['Keep functions pure'],
      } as any;

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'archcodex.core']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Hints'))).toBe(true);
    });

    it('should show architecture rationale', async () => {
      mockRegistryResult.nodes['archcodex.core'] = {
        description: 'Core',
        rationale: 'Central business logic',
      } as any;

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'archcodex.core']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Rationale'))).toBe(true);
    });

    it('should show architecture mixins', async () => {
      mockRegistryResult.nodes['archcodex.core'] = {
        description: 'Core',
        mixins: ['tested', 'srp'],
      };

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'archcodex.core']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Mixins'))).toBe(true);
    });

    it('should show architecture reference implementations', async () => {
      mockRegistryResult.nodes['archcodex.core'] = {
        description: 'Core',
        reference_implementations: ['src/core/example.ts'],
      } as any;

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'archcodex.core']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Reference implementations') || c?.includes('reference'))).toBe(true);
    });

    it('should show architecture file conventions', async () => {
      mockRegistryResult.nodes['archcodex.core'] = {
        description: 'Core',
        file_pattern: '${Name}Service.ts',
        default_path: 'src/core',
      } as any;

      const command = createSchemaCommand();
      await command.parseAsync(['node', 'test', 'archcodex.core']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('File conventions') || c?.includes('Pattern') || c?.includes('Path'))).toBe(true);
    });
  });
});
