/**
 * @arch archcodex.test.unit
 *
 * Tests for spec CLI command.
 */
import { describe, it, expect, vi } from 'vitest';
import { createSpecCommand } from '../../../../src/cli/commands/spec/index.js';

// Mock the spec module
vi.mock('../../../../src/core/spec/index.js', () => ({
  loadSpecRegistry: vi.fn().mockResolvedValue({ specs: {} }),
  resolveSpec: vi.fn().mockReturnValue({ specId: 'test', node: {} }),
  validateSpecRegistry: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  formatValidationSummary: vi.fn().mockReturnValue('All specs valid'),
  listSpecIds: vi.fn().mockReturnValue(['spec.test']),
  listSpecMixinIds: vi.fn().mockReturnValue(['mixin.test']),
  formatSpecForLLM: vi.fn().mockReturnValue('Formatted spec'),
  getSpecSchema: vi.fn().mockReturnValue({ valid: true }),
  formatSchemaDoc: vi.fn().mockReturnValue('Schema doc'),
  findUnwiredSpecs: vi.fn().mockReturnValue({ unwired: [], coverage: { total: 1, wired: 1 } }),
  formatUnwiredReport: vi.fn().mockReturnValue('Coverage report'),
  loadFixtures: vi.fn().mockReturnValue({}),
  listFixtures: vi.fn().mockReturnValue([]),
  getFixturesTemplate: vi.fn().mockReturnValue(''),
  generateUnitTests: vi.fn().mockReturnValue({ valid: true, code: '' }),
  generatePropertyTests: vi.fn().mockReturnValue({ valid: true, code: '' }),
  generateIntegrationTests: vi.fn().mockReturnValue({ valid: true, code: '' }),
  generateUITests: vi.fn().mockReturnValue({ valid: true, code: '' }),
  generateApiDocs: vi.fn().mockReturnValue({ valid: true, markdown: '' }),
  generateExampleDocs: vi.fn().mockReturnValue({ valid: true, markdown: '' }),
  generateErrorDocs: vi.fn().mockReturnValue({ valid: true, markdown: '' }),
  generateAllDocs: vi.fn().mockReturnValue({ valid: true, markdown: '' }),
  verifyImplementation: vi.fn().mockReturnValue({ valid: true }),
  formatVerifyResult: vi.fn().mockReturnValue('Verify result'),
  expandPlaceholder: vi.fn().mockReturnValue({ success: true, value: 'test' }),
  listPlaceholders: vi.fn().mockReturnValue([]),
  isPlaceholderError: vi.fn().mockReturnValue(false),
}));

describe('Spec Command', () => {
  describe('createSpecCommand', () => {
    it('creates command with correct name', () => {
      const command = createSpecCommand();

      expect(command.name()).toBe('spec');
    });

    it('has subcommands', () => {
      const command = createSpecCommand();
      const subcommands = command.commands.map(c => c.name());

      expect(subcommands).toContain('check');
      expect(subcommands).toContain('resolve');
      expect(subcommands).toContain('list');
    });

    it('has check subcommand', () => {
      const command = createSpecCommand();
      const check = command.commands.find(c => c.name() === 'check');

      expect(check).toBeDefined();
    });

    it('has resolve subcommand', () => {
      const command = createSpecCommand();
      const resolve = command.commands.find(c => c.name() === 'resolve');

      expect(resolve).toBeDefined();
    });

    it('has generate subcommand', () => {
      const command = createSpecCommand();
      const generate = command.commands.find(c => c.name() === 'generate');

      expect(generate).toBeDefined();
    });

    it('has init subcommand', () => {
      const command = createSpecCommand();
      const init = command.commands.find(c => c.name() === 'init');

      expect(init).toBeDefined();
    });
  });
});
