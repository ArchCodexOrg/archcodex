/**
 * @arch archcodex.test.unit
 *
 * Tests for spec list subcommand registration.
 */
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerListCommand } from '../../../../../src/cli/commands/spec/list.js';

describe('registerListCommand', () => {
  it('registers list subcommand on parent', () => {
    const parent = new Command('spec');
    registerListCommand(parent);

    const list = parent.commands.find(c => c.name() === 'list');
    expect(list).toBeDefined();
    expect(list!.description()).toContain('List');
  });

  it('list command has --mixins option', () => {
    const parent = new Command('spec');
    registerListCommand(parent);

    const list = parent.commands.find(c => c.name() === 'list')!;
    const mixinsOption = list.options.find(o => o.long === '--mixins');
    expect(mixinsOption).toBeDefined();
  });

  it('list command has --json option', () => {
    const parent = new Command('spec');
    registerListCommand(parent);

    const list = parent.commands.find(c => c.name() === 'list')!;
    const jsonOption = list.options.find(o => o.long === '--json');
    expect(jsonOption).toBeDefined();
  });
});
