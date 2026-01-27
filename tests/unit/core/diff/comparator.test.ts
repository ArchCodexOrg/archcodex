/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { compareRegistries } from '../../../../src/core/diff/comparator.js';
import type { Registry } from '../../../../src/core/registry/schema.js';

describe('compareRegistries', () => {
  const createRegistry = (nodes: Record<string, any>, mixins: Record<string, any> = {}): Registry => ({
    nodes,
    mixins,
  });

  it('should detect added architectures', async () => {
    const fromRegistry = createRegistry({
      base: { rationale: 'Base architecture', description: 'Base' },
    });

    const toRegistry = createRegistry({
      base: { rationale: 'Base architecture', description: 'Base' },
      'domain.new': { rationale: 'New domain', description: 'New architecture' },
    });

    const diff = await compareRegistries(
      fromRegistry,
      toRegistry,
      'from',
      'to',
      process.cwd(),
      { includeAffectedFiles: false }
    );

    expect(diff.summary.architecturesAdded).toBe(1);
    expect(diff.architectureChanges).toHaveLength(1);
    expect(diff.architectureChanges[0].type).toBe('added');
    expect(diff.architectureChanges[0].archId).toBe('domain.new');
  });

  it('should detect removed architectures', async () => {
    const fromRegistry = createRegistry({
      base: { rationale: 'Base architecture', description: 'Base' },
      'domain.old': { rationale: 'Old domain', description: 'Old architecture' },
    });

    const toRegistry = createRegistry({
      base: { rationale: 'Base architecture', description: 'Base' },
    });

    const diff = await compareRegistries(
      fromRegistry,
      toRegistry,
      'from',
      'to',
      process.cwd(),
      { includeAffectedFiles: false }
    );

    expect(diff.summary.architecturesRemoved).toBe(1);
    expect(diff.architectureChanges).toHaveLength(1);
    expect(diff.architectureChanges[0].type).toBe('removed');
    expect(diff.architectureChanges[0].archId).toBe('domain.old');
  });

  it('should detect modified constraints', async () => {
    const fromRegistry = createRegistry({
      base: {
        rationale: 'Base',
        constraints: [
          { rule: 'forbid_import', value: ['console'], severity: 'error' },
        ],
      },
    });

    const toRegistry = createRegistry({
      base: {
        rationale: 'Base',
        constraints: [
          { rule: 'forbid_import', value: ['console'], severity: 'error' },
          { rule: 'max_file_lines', value: 300, severity: 'warning' },
        ],
      },
    });

    const diff = await compareRegistries(
      fromRegistry,
      toRegistry,
      'from',
      'to',
      process.cwd(),
      { includeAffectedFiles: false }
    );

    expect(diff.summary.architecturesModified).toBe(1);
    expect(diff.architectureChanges[0].constraintChanges).toHaveLength(1);
    expect(diff.architectureChanges[0].constraintChanges![0].type).toBe('added');
    expect(diff.architectureChanges[0].constraintChanges![0].rule).toBe('max_file_lines');
  });

  it('should detect inheritance changes', async () => {
    const fromRegistry = createRegistry({
      base: { rationale: 'Base' },
      domain: { rationale: 'Domain', inherits: 'base' },
    });

    const toRegistry = createRegistry({
      base: { rationale: 'Base' },
      domain: { rationale: 'Domain', inherits: 'other' },
    });

    const diff = await compareRegistries(
      fromRegistry,
      toRegistry,
      'from',
      'to',
      process.cwd(),
      { includeAffectedFiles: false }
    );

    expect(diff.summary.architecturesModified).toBe(1);
    expect(diff.architectureChanges[0].inheritsChange).toBeDefined();
    expect(diff.architectureChanges[0].inheritsChange!.old).toBe('base');
    expect(diff.architectureChanges[0].inheritsChange!.new).toBe('other');
  });

  it('should detect mixin changes', async () => {
    const fromRegistry = createRegistry(
      { base: { rationale: 'Base' } },
      { tested: { rationale: 'Tested mixin' } }
    );

    const toRegistry = createRegistry(
      { base: { rationale: 'Base' } },
      {
        tested: { rationale: 'Tested mixin' },
        srp: { rationale: 'SRP mixin' },
      }
    );

    const diff = await compareRegistries(
      fromRegistry,
      toRegistry,
      'from',
      'to',
      process.cwd(),
      { includeAffectedFiles: false }
    );

    expect(diff.summary.mixinsAdded).toBe(1);
    expect(diff.mixinChanges).toHaveLength(1);
    expect(diff.mixinChanges[0].mixinId).toBe('srp');
    expect(diff.mixinChanges[0].type).toBe('added');
  });

  it('should detect no changes when registries are equal', async () => {
    const registry = createRegistry({
      base: {
        rationale: 'Base',
        constraints: [
          { rule: 'forbid_import', value: ['console'], severity: 'error' },
        ],
      },
    });

    const diff = await compareRegistries(
      registry,
      registry,
      'from',
      'to',
      process.cwd(),
      { includeAffectedFiles: false }
    );

    expect(diff.summary.architecturesAdded).toBe(0);
    expect(diff.summary.architecturesRemoved).toBe(0);
    expect(diff.summary.architecturesModified).toBe(0);
    expect(diff.architectureChanges).toHaveLength(0);
  });
});
