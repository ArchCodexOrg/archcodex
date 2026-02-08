/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for ADR generator — single ADR generation, all ADRs generation,
 * formatting helpers, and index generation.
 */
import { describe, it, expect } from 'vitest';
import {
  generateAdr,
  generateAllAdrs,
} from '../../../../src/core/docs/adr-generator.js';
import type {
  AdrGeneratorOptions,
  AllAdrsOptions,
} from '../../../../src/core/docs/adr-generator.js';
import type { FlattenedArchitecture, ResolvedConstraint } from '../../../../src/core/registry/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createArch(overrides: Partial<FlattenedArchitecture> = {}): FlattenedArchitecture {
  return {
    archId: 'test.architecture',
    inheritanceChain: ['test.architecture', 'base'],
    mixinsApplied: [],
    appliedMixins: [],
    constraints: [],
    hints: [],
    pointers: [],
    ...overrides,
  } as FlattenedArchitecture;
}

function createConstraint(overrides: Partial<ResolvedConstraint> = {}): ResolvedConstraint {
  return {
    rule: 'forbid_import',
    value: 'chalk',
    severity: 'error',
    source: 'test.architecture',
    ...overrides,
  } as ResolvedConstraint;
}

// ---------------------------------------------------------------------------
// generateAdr — basic
// ---------------------------------------------------------------------------

describe('generateAdr', () => {
  it('generates ADR with correct title from archId', () => {
    const arch = createArch({ archId: 'convex.mutation.guarded' });
    const result = generateAdr(arch);

    expect(result.valid).toBe(true);
    expect(result.markdown).toContain('# ADR: Convex Mutation Guarded');
  });

  it('returns error when archId is missing', () => {
    const arch = createArch({ archId: '' });
    const result = generateAdr(arch);

    expect(result.valid).toBe(false);
    expect(result.markdown).toBe('');
    expect(result.sections).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('MISSING_ARCH_ID');
  });

  // ---------------------------------------------------------------------------
  // Status section
  // ---------------------------------------------------------------------------

  describe('status section', () => {
    it('shows Active status by default', () => {
      const result = generateAdr(createArch());

      expect(result.markdown).toContain('**Active**');
      expect(result.sections).toContain('status');
    });

    it('shows Deprecated status with date', () => {
      const arch = createArch({ deprecated_from: '2.0.0' });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('**Deprecated** (since 2.0.0)');
    });

    it('includes migration guide link when deprecated', () => {
      const arch = createArch({
        deprecated_from: '2.0.0',
        migration_guide: 'docs/migration.md',
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('[Migration Guide](docs/migration.md)');
    });
  });

  // ---------------------------------------------------------------------------
  // Context section
  // ---------------------------------------------------------------------------

  describe('context section', () => {
    it('uses rationale when available', () => {
      const arch = createArch({
        rationale: 'We chose this pattern because of XYZ.',
        description: 'Some description',
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('We chose this pattern because of XYZ.');
      expect(result.sections).toContain('context');
    });

    it('falls back to description when rationale is missing', () => {
      const arch = createArch({
        description: 'Architecture for data access.',
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('Architecture for data access.');
    });

    it('generates placeholder context when both are missing', () => {
      const arch = createArch({ archId: 'core.engine' });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('Architecture pattern for core engine components.');
    });
  });

  // ---------------------------------------------------------------------------
  // Inheritance section
  // ---------------------------------------------------------------------------

  describe('inheritance section', () => {
    it('shows inheritance chain when enabled and chain is > 1', () => {
      const arch = createArch({
        inheritanceChain: ['child.arch', 'parent.arch', 'base'],
      });
      const result = generateAdr(arch, { includeInheritance: true });

      expect(result.markdown).toContain('### Inheritance');
      expect(result.markdown).toContain('`parent.arch`');
      expect(result.markdown).toContain('`base`');
    });

    it('hides inheritance chain when disabled', () => {
      const arch = createArch({
        inheritanceChain: ['child.arch', 'parent.arch'],
      });
      const result = generateAdr(arch, { includeInheritance: false });

      expect(result.markdown).not.toContain('### Inheritance');
    });

    it('hides inheritance when chain has only 1 entry (self)', () => {
      const arch = createArch({
        inheritanceChain: ['test.architecture'],
      });
      const result = generateAdr(arch, { includeInheritance: true });

      expect(result.markdown).not.toContain('### Inheritance');
    });
  });

  // ---------------------------------------------------------------------------
  // Applied Mixins section
  // ---------------------------------------------------------------------------

  describe('applied mixins section', () => {
    it('shows applied mixins when present', () => {
      const arch = createArch({
        appliedMixins: ['mixin.logging', 'mixin.auth'],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('### Applied Mixins');
      expect(result.markdown).toContain('`mixin.logging`');
      expect(result.markdown).toContain('`mixin.auth`');
    });

    it('omits mixins section when no mixins applied', () => {
      const arch = createArch({ appliedMixins: [] });
      const result = generateAdr(arch);

      expect(result.markdown).not.toContain('### Applied Mixins');
    });
  });

  // ---------------------------------------------------------------------------
  // Decision section — constraints
  // ---------------------------------------------------------------------------

  describe('decision section', () => {
    it('includes constraint values in decision section', () => {
      const arch = createArch({
        constraints: [
          createConstraint({ rule: 'max_file_lines', value: 500 }),
        ],
      });
      const result = generateAdr(arch);

      expect(result.sections).toContain('decision');
      expect(result.markdown).toContain('500');
    });

    it('groups constraints by rule type', () => {
      const arch = createArch({
        constraints: [
          createConstraint({ rule: 'forbid_import', value: 'chalk' }),
          createConstraint({ rule: 'forbid_import', value: 'ora' }),
          createConstraint({ rule: 'max_file_lines', value: 300 }),
        ],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('### Forbidden Imports');
      expect(result.markdown).toContain('### Max File Lines');
    });

    it('shows placeholder when no constraints exist', () => {
      const arch = createArch({ constraints: [] });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('No specific constraints defined');
    });

    it('formats constraints differently based on format option', () => {
      const constraint = createConstraint({
        rule: 'forbid_import',
        value: 'chalk',
        why: 'Use logger instead',
      });

      // Detailed format: bold value, explicit source
      const detailed = generateAdr(
        createArch({ constraints: [constraint] }),
        { format: 'detailed' }
      );
      expect(detailed.markdown).toContain('**chalk**');
      expect(detailed.markdown).toContain('*Why*: Use logger instead');

      // Compact format: just value
      const compact = generateAdr(
        createArch({ constraints: [constraint] }),
        { format: 'compact' }
      );
      expect(compact.markdown).toContain('- chalk');

      // Standard format: value with why inline
      const standard = generateAdr(
        createArch({ constraints: [constraint] }),
        { format: 'standard' }
      );
      expect(standard.markdown).toContain('`chalk`');
    });

    it('shows constraint source in detailed format when different from archId', () => {
      const constraint = createConstraint({
        rule: 'forbid_import',
        value: 'chalk',
        why: 'reason',
        source: 'parent.architecture',
      });
      const result = generateAdr(
        createArch({ archId: 'child.architecture', constraints: [constraint] }),
        { format: 'detailed' }
      );

      expect(result.markdown).toContain('*Source*: `parent.architecture`');
    });

    it('handles array constraint values', () => {
      const arch = createArch({
        constraints: [
          createConstraint({ rule: 'forbid_import', value: ['chalk', 'ora', 'commander'] }),
        ],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('chalk, ora, commander');
    });

    it('formats unknown rule types using title case', () => {
      const arch = createArch({
        constraints: [
          createConstraint({ rule: 'custom_rule_name' as ResolvedConstraint['rule'], value: 'test' }),
        ],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('Custom Rule Name');
    });
  });

  // ---------------------------------------------------------------------------
  // File conventions section
  // ---------------------------------------------------------------------------

  describe('file conventions section', () => {
    it('shows file pattern and default path', () => {
      const arch = createArch({
        file_pattern: '${name}Service.ts',
        default_path: 'src/services/',
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('### File Conventions');
      expect(result.markdown).toContain('`${name}Service.ts`');
      expect(result.markdown).toContain('`src/services/`');
    });

    it('omits file conventions when neither pattern nor path is set', () => {
      const result = generateAdr(createArch());

      expect(result.markdown).not.toContain('### File Conventions');
    });
  });

  // ---------------------------------------------------------------------------
  // Consequences section
  // ---------------------------------------------------------------------------

  describe('consequences section', () => {
    it('lists forbidden items', () => {
      const arch = createArch({
        constraints: [
          createConstraint({ rule: 'forbid_import', value: 'chalk', why: 'Use logger' }),
          createConstraint({ rule: 'forbid_pattern', value: 'console.log' }),
        ],
      });
      const result = generateAdr(arch);

      expect(result.sections).toContain('consequences');
      expect(result.markdown).toContain('### Forbidden');
      expect(result.markdown).toContain('`chalk`');
      expect(result.markdown).toContain('`console.log`');
    });

    it('lists required items', () => {
      const arch = createArch({
        constraints: [
          createConstraint({ rule: 'require_import', value: 'logger' }),
          createConstraint({ rule: 'require_test_file', value: '*.test.ts' }),
        ],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('### Required');
      expect(result.markdown).toContain('`logger`');
      expect(result.markdown).toContain('`*.test.ts`');
    });

    it('shows placeholder when no forbidden or required', () => {
      const arch = createArch({
        constraints: [
          createConstraint({ rule: 'max_file_lines', value: 500 }),
        ],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('no explicit forbidden or required items');
    });
  });

  // ---------------------------------------------------------------------------
  // Guidelines (hints) section
  // ---------------------------------------------------------------------------

  describe('guidelines section', () => {
    it('shows hints when enabled', () => {
      const arch = createArch({
        hints: [
          { text: 'Use dependency injection' },
          { text: 'Keep methods small', example: 'code://src/example.ts' },
        ],
      });
      const result = generateAdr(arch, { includeHints: true });

      expect(result.sections).toContain('guidelines');
      expect(result.markdown).toContain('## Guidelines');
      expect(result.markdown).toContain('Use dependency injection');
      expect(result.markdown).toContain('Example: code://src/example.ts');
    });

    it('hides hints when disabled', () => {
      const arch = createArch({
        hints: [{ text: 'A hint' }],
      });
      const result = generateAdr(arch, { includeHints: false });

      expect(result.markdown).not.toContain('## Guidelines');
    });

    it('omits guidelines section when no hints', () => {
      const arch = createArch({ hints: [] });
      const result = generateAdr(arch, { includeHints: true });

      expect(result.markdown).not.toContain('## Guidelines');
    });
  });

  // ---------------------------------------------------------------------------
  // References section
  // ---------------------------------------------------------------------------

  describe('references section', () => {
    it('shows reference implementations', () => {
      const arch = createArch({
        reference_implementations: ['src/services/UserService.ts', 'src/services/OrderService.ts'],
      });
      const result = generateAdr(arch, { includeReferences: true });

      expect(result.sections).toContain('references');
      expect(result.markdown).toContain('## References');
      expect(result.markdown).toContain('`src/services/UserService.ts`');
    });

    it('hides references when disabled', () => {
      const arch = createArch({
        reference_implementations: ['src/example.ts'],
      });
      const result = generateAdr(arch, { includeReferences: false });

      expect(result.markdown).not.toContain('## References');
    });
  });

  // ---------------------------------------------------------------------------
  // Code pattern section (detailed format only)
  // ---------------------------------------------------------------------------

  describe('code pattern section', () => {
    it('shows code pattern in detailed format', () => {
      const arch = createArch({
        code_pattern: 'export class FooService {\n  constructor() {}\n}',
      });
      const result = generateAdr(arch, { format: 'detailed' });

      expect(result.markdown).toContain('### Code Pattern');
      expect(result.markdown).toContain('```typescript');
      expect(result.markdown).toContain('export class FooService');
    });

    it('hides code pattern in standard format', () => {
      const arch = createArch({
        code_pattern: 'export class FooService {}',
      });
      const result = generateAdr(arch, { format: 'standard' });

      expect(result.markdown).not.toContain('### Code Pattern');
    });
  });

  // ---------------------------------------------------------------------------
  // Intent annotations section
  // ---------------------------------------------------------------------------

  describe('intent annotations section', () => {
    it('shows expected intents', () => {
      const arch = createArch({
        expected_intents: ['stateless', 'pure'],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('### Intent Annotations');
      expect(result.markdown).toContain('**Expected:**');
      expect(result.markdown).toContain('`@intent:stateless`');
      expect(result.markdown).toContain('`@intent:pure`');
    });

    it('shows suggested intents with when description', () => {
      const arch = createArch({
        suggested_intents: [
          { name: 'cacheable', when: 'Results can be memoized' },
        ],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('**Suggested:**');
      expect(result.markdown).toContain('`@intent:cacheable`');
    });

    it('omits intent section when no intents defined', () => {
      const result = generateAdr(createArch());

      expect(result.markdown).not.toContain('### Intent Annotations');
    });
  });

  // ---------------------------------------------------------------------------
  // Default options
  // ---------------------------------------------------------------------------

  describe('default options', () => {
    it('uses standard format by default', () => {
      const arch = createArch({
        constraints: [createConstraint({ rule: 'forbid_import', value: 'chalk', why: 'reason' })],
      });
      const result = generateAdr(arch);

      // Standard format uses backticks around values
      expect(result.markdown).toContain('`chalk`');
    });

    it('includes inheritance by default', () => {
      const arch = createArch({
        inheritanceChain: ['a', 'b', 'c'],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('### Inheritance');
    });

    it('includes hints by default', () => {
      const arch = createArch({
        hints: [{ text: 'A hint' }],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('## Guidelines');
    });

    it('includes references by default', () => {
      const arch = createArch({
        reference_implementations: ['src/example.ts'],
      });
      const result = generateAdr(arch);

      expect(result.markdown).toContain('## References');
    });
  });
});

// ---------------------------------------------------------------------------
// generateAllAdrs
// ---------------------------------------------------------------------------

describe('generateAllAdrs', () => {
  const createRegistry = (
    nodes: Record<string, { description?: string; kind?: string }>
  ) => ({ nodes });

  const createResolver = (archs: Record<string, FlattenedArchitecture | undefined>) => {
    return (archId: string) => archs[archId];
  };

  it('generates ADR files for each architecture', () => {
    const registry = createRegistry({
      'core.engine': { description: 'Engine pattern' },
      'core.domain': { description: 'Domain pattern' },
    });
    const resolver = createResolver({
      'core.engine': createArch({ archId: 'core.engine' }),
      'core.domain': createArch({ archId: 'core.domain' }),
    });

    const result = generateAllAdrs(registry, resolver);

    expect(result.valid).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].name).toBe('core-engine.md');
    expect(result.files[1].name).toBe('core-domain.md');
  });

  it('skips abstract/base architectures by default', () => {
    const registry = createRegistry({
      'core.engine': { description: 'Concrete' },
      'base': { description: 'Base' },
      'core.base': { description: 'Core base' },
      'core.definition': { kind: 'definition' },
    });
    const resolver = createResolver({
      'core.engine': createArch({ archId: 'core.engine' }),
    });

    const result = generateAllAdrs(registry, resolver);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].archId).toBe('core.engine');
  });

  it('includes abstract architectures when skipAbstract is false', () => {
    const registry = createRegistry({
      'core.engine': {},
      'base': {},
    });
    const resolver = createResolver({
      'core.engine': createArch({ archId: 'core.engine' }),
      'base': createArch({ archId: 'base' }),
    });

    const result = generateAllAdrs(registry, resolver, { skipAbstract: false });

    expect(result.files).toHaveLength(2);
  });

  it('reports errors for unresolvable architectures', () => {
    const registry = createRegistry({
      'core.broken': { description: 'Broken' },
    });
    const resolver = createResolver({
      'core.broken': undefined,
    });

    const result = generateAllAdrs(registry, resolver);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('RESOLVE_FAILED');
  });

  it('generates grouped index by layer', () => {
    const registry = createRegistry({
      'core.engine': { description: 'Engine' },
      'cli.command': { description: 'CLI command' },
    });
    const resolver = createResolver({
      'core.engine': createArch({ archId: 'core.engine' }),
      'cli.command': createArch({ archId: 'cli.command' }),
    });

    const result = generateAllAdrs(registry, resolver, { includeIndex: true, groupBy: 'layer' });

    expect(result.index).toBeDefined();
    expect(result.index).toContain('# Architecture Decision Records');
    expect(result.index).toContain('## Core');
    expect(result.index).toContain('## Cli');
    expect(result.index).toContain('`core.engine`');
    expect(result.index).toContain('`cli.command`');
    expect(result.index).toContain('Engine');
  });

  it('generates flat index', () => {
    const registry = createRegistry({
      'b.first': {},
      'a.second': {},
    });
    const resolver = createResolver({
      'b.first': createArch({ archId: 'b.first' }),
      'a.second': createArch({ archId: 'a.second' }),
    });

    const result = generateAllAdrs(registry, resolver, { includeIndex: true, groupBy: 'flat' });

    expect(result.index).toBeDefined();
    expect(result.index).toContain('## All Architectures');
    // Should be sorted alphabetically — a.second before b.first
    const aIdx = result.index!.indexOf('a.second');
    const bIdx = result.index!.indexOf('b.first');
    expect(aIdx).toBeLessThan(bIdx);
  });

  it('omits index when disabled', () => {
    const registry = createRegistry({
      'core.engine': {},
    });
    const resolver = createResolver({
      'core.engine': createArch({ archId: 'core.engine' }),
    });

    const result = generateAllAdrs(registry, resolver, { includeIndex: false });

    expect(result.index).toBeUndefined();
  });

  it('omits index when no files generated', () => {
    const registry = createRegistry({});
    const resolver = createResolver({});

    const result = generateAllAdrs(registry, resolver, { includeIndex: true });

    expect(result.index).toBeUndefined();
  });

  it('includes statistics in index', () => {
    const registry = createRegistry({
      'core.engine': {},
      'core.domain': {},
    });
    const resolver = createResolver({
      'core.engine': createArch({ archId: 'core.engine' }),
      'core.domain': createArch({ archId: 'core.domain' }),
    });

    const result = generateAllAdrs(registry, resolver, { includeIndex: true });

    expect(result.index).toContain('*Total ADRs: 2*');
    expect(result.index).toContain('*Generated:');
  });
});
