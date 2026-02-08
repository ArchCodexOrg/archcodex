/**
 * @arch archcodex.test.unit
 *
 * Tests for spec command orchestrator (index.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import { createSpecCommand } from '../../../../../src/cli/commands/spec/index.js';

// Mock the spec module
vi.mock('../../../../../src/core/spec/index.js', () => ({
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

describe('createSpecCommand', () => {
  it('creates command with correct name', () => {
    const command = createSpecCommand();
    expect(command.name()).toBe('spec');
  });

  it('registers all subcommands', () => {
    const command = createSpecCommand();
    const subcommands = command.commands.map(c => c.name());

    expect(subcommands).toContain('help');
    expect(subcommands).toContain('check');
    expect(subcommands).toContain('resolve');
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('discover');
    expect(subcommands).toContain('placeholder');
    expect(subcommands).toContain('fixture');
    expect(subcommands).toContain('generate');
    expect(subcommands).toContain('verify');
    expect(subcommands).toContain('infer');
    expect(subcommands).toContain('schema');
    expect(subcommands).toContain('drift');
    expect(subcommands).toContain('doc');
    expect(subcommands).toContain('init');
  });

  it('has 14 subcommands', () => {
    const command = createSpecCommand();
    expect(command.commands).toHaveLength(14);
  });
});
