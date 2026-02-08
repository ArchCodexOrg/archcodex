/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the doc command structure.
 */
import { describe, it, expect } from 'vitest';
import { createDocCommand } from '../../../../src/cli/commands/doc.js';

describe('doc command', () => {
  describe('createDocCommand', () => {
    it('should create a command named doc', () => {
      const command = createDocCommand();
      expect(command.name()).toBe('doc');
    });

    it('should have a description', () => {
      const command = createDocCommand();
      expect(command.description()).toContain('documentation');
    });

    it('should have adr subcommand', () => {
      const command = createDocCommand();
      const adr = command.commands.find(c => c.name() === 'adr');
      expect(adr).toBeDefined();
      expect(adr!.description()).toContain('ADR');
    });

    it('should have templates subcommand', () => {
      const command = createDocCommand();
      const templates = command.commands.find(c => c.name() === 'templates');
      expect(templates).toBeDefined();
    });

    it('should have watch subcommand', () => {
      const command = createDocCommand();
      const watch = command.commands.find(c => c.name() === 'watch');
      expect(watch).toBeDefined();
    });

    it('should have verify subcommand', () => {
      const command = createDocCommand();
      const verify = command.commands.find(c => c.name() === 'verify');
      expect(verify).toBeDefined();
    });

    it('adr subcommand should have expected options', () => {
      const command = createDocCommand();
      const adr = command.commands.find(c => c.name() === 'adr')!;
      const optionNames = adr.options.map(o => o.long);
      expect(optionNames).toContain('--all');
      expect(optionNames).toContain('--output');
      expect(optionNames).toContain('--dry-run');
      expect(optionNames).toContain('--json');
    });

    it('should have four subcommands total', () => {
      const command = createDocCommand();
      expect(command.commands).toHaveLength(4);
    });

    it('templates subcommand should have init and list options', () => {
      const command = createDocCommand();
      const templates = command.commands.find(c => c.name() === 'templates')!;
      const optionNames = templates.options.map(o => o.long);
      expect(optionNames).toContain('--init');
      expect(optionNames).toContain('--list');
      expect(optionNames).toContain('--json');
    });

    it('watch subcommand should have type and output options', () => {
      const command = createDocCommand();
      const watch = command.commands.find(c => c.name() === 'watch')!;
      const optionNames = watch.options.map(o => o.long);
      expect(optionNames).toContain('--type');
      expect(optionNames).toContain('--output');
      expect(optionNames).toContain('--debounce');
      expect(optionNames).toContain('--clear');
    });

    it('verify subcommand should have required output option', () => {
      const command = createDocCommand();
      const verify = command.commands.find(c => c.name() === 'verify')!;
      const outputOption = verify.options.find(o => o.long === '--output');
      expect(outputOption).toBeDefined();
      expect(outputOption!.required).toBe(true);
    });

    it('verify subcommand should have fix and json options', () => {
      const command = createDocCommand();
      const verify = command.commands.find(c => c.name() === 'verify')!;
      const optionNames = verify.options.map(o => o.long);
      expect(optionNames).toContain('--fix');
      expect(optionNames).toContain('--json');
    });

    it('adr subcommand should have format option with default', () => {
      const command = createDocCommand();
      const adr = command.commands.find(c => c.name() === 'adr')!;
      const formatOption = adr.options.find(o => o.long === '--format');
      expect(formatOption).toBeDefined();
    });

    it('adr subcommand should have group-by option', () => {
      const command = createDocCommand();
      const adr = command.commands.find(c => c.name() === 'adr')!;
      const optionNames = adr.options.map(o => o.long);
      expect(optionNames).toContain('--group-by');
    });

    it('adr subcommand should have boolean toggle options', () => {
      const command = createDocCommand();
      const adr = command.commands.find(c => c.name() === 'adr')!;
      const optionNames = adr.options.map(o => o.long);
      expect(optionNames).toContain('--no-skip-abstract');
      expect(optionNames).toContain('--no-inheritance');
      expect(optionNames).toContain('--no-hints');
      expect(optionNames).toContain('--no-references');
    });

    it('adr subcommand should have template-dir option', () => {
      const command = createDocCommand();
      const adr = command.commands.find(c => c.name() === 'adr')!;
      const templateOption = adr.options.find(o => o.long === '--template-dir');
      expect(templateOption).toBeDefined();
    });

    it('adr subcommand should have index option', () => {
      const command = createDocCommand();
      const adr = command.commands.find(c => c.name() === 'adr')!;
      const optionNames = adr.options.map(o => o.long);
      expect(optionNames).toContain('--index');
    });
  });
});
