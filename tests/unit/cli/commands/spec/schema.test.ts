/**
 * @arch archcodex.test.unit
 *
 * Tests for spec schema subcommand registration.
 */
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerSchemaCommand } from '../../../../../src/cli/commands/spec/schema.js';

describe('registerSchemaCommand', () => {
  it('registers schema subcommand on parent', () => {
    const parent = new Command('spec');
    registerSchemaCommand(parent);

    const schema = parent.commands.find(c => c.name() === 'schema');
    expect(schema).toBeDefined();
    expect(schema!.description()).toContain('schema');
  });

  it('schema command has --filter option', () => {
    const parent = new Command('spec');
    registerSchemaCommand(parent);

    const schema = parent.commands.find(c => c.name() === 'schema')!;
    const filterOption = schema.options.find(o => o.long === '--filter');
    expect(filterOption).toBeDefined();
  });

  it('schema command has --examples option', () => {
    const parent = new Command('spec');
    registerSchemaCommand(parent);

    const schema = parent.commands.find(c => c.name() === 'schema')!;
    const examplesOption = schema.options.find(o => o.long === '--examples');
    expect(examplesOption).toBeDefined();
  });
});
