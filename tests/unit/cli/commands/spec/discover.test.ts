/**
 * @arch archcodex.test.unit
 *
 * Tests for spec discover subcommand registration.
 */
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerDiscoverCommand } from '../../../../../src/cli/commands/spec/discover.js';

describe('registerDiscoverCommand', () => {
  it('registers discover subcommand on parent', () => {
    const parent = new Command('spec');
    registerDiscoverCommand(parent);

    const discover = parent.commands.find(c => c.name() === 'discover');
    expect(discover).toBeDefined();
    expect(discover!.description()).toContain('Find');
  });

  it('discover command requires query argument', () => {
    const parent = new Command('spec');
    registerDiscoverCommand(parent);

    const discover = parent.commands.find(c => c.name() === 'discover')!;
    expect(discover.registeredArguments).toHaveLength(1);
    expect(discover.registeredArguments[0].name()).toBe('query');
  });

  it('discover command has --limit option', () => {
    const parent = new Command('spec');
    registerDiscoverCommand(parent);

    const discover = parent.commands.find(c => c.name() === 'discover')!;
    const limitOption = discover.options.find(o => o.long === '--limit');
    expect(limitOption).toBeDefined();
  });
});
