/**
 * @arch archcodex.test.unit
 *
 * Tests for spec resolve subcommand registration.
 */
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerResolveCommand } from '../../../../../src/cli/commands/spec/resolve.js';

describe('registerResolveCommand', () => {
  it('registers resolve subcommand on parent', () => {
    const parent = new Command('spec');
    registerResolveCommand(parent);

    const resolve = parent.commands.find(c => c.name() === 'resolve');
    expect(resolve).toBeDefined();
    expect(resolve!.description()).toContain('Resolve');
  });

  it('resolve command has --json option', () => {
    const parent = new Command('spec');
    registerResolveCommand(parent);

    const resolve = parent.commands.find(c => c.name() === 'resolve')!;
    const jsonOption = resolve.options.find(o => o.long === '--json');
    expect(jsonOption).toBeDefined();
  });

  it('resolve command requires specId argument', () => {
    const parent = new Command('spec');
    registerResolveCommand(parent);

    const resolve = parent.commands.find(c => c.name() === 'resolve')!;
    expect(resolve.registeredArguments).toHaveLength(1);
    expect(resolve.registeredArguments[0].name()).toBe('specId');
    expect(resolve.registeredArguments[0].required).toBe(true);
  });
});
