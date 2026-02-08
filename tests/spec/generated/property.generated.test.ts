/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * AUTO-GENERATED from .arch/specs/speccodex/improvements.spec.yaml
 * DO NOT EDIT - regenerate with: npx tsx tests/spec/generate-tests.ts
 *
 * Property-based tests generated from spec invariants.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadSpecRegistry } from '../../../src/core/spec/loader.js';
import { resolveSpec } from '../../../src/core/spec/resolver.js';
import { generatePropertyTests } from '../../../src/core/spec/generators/property.js';
import type { SpecRegistry, ResolvedSpec } from '../../../src/core/spec/schema.js';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');

describe('[GENERATED] Property Tests from Specs', () => {
  let registry: SpecRegistry;

  beforeAll(async () => {
    registry = await loadSpecRegistry(PROJECT_ROOT);
  });

  describe('spec.speccodex.placeholders.hasItem', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generatePropertyTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.placeholders.hasItem');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generatePropertyTests(spec);
    });

    it('generates property tests from invariants', () => {
      expect(generated.valid).toBe(true);
      expect(generated.propertyCount).toBeGreaterThan(0);
    });

    it('generates forall invariant tests', () => {
      // This spec has a forall invariant
      const hasForallInvariant = spec.node.invariants?.some(inv =>
        typeof inv === 'object' && inv !== null && 'forall' in inv
      );
      if (hasForallInvariant) {
        expect(generated.code).toContain('forall');
      }
    });

    it('generates fc.assert calls', () => {
      expect(generated.code).toContain('fc.assert');
    });
  });

  describe('spec.speccodex.placeholders.jsonpath', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generatePropertyTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.placeholders.jsonpath');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generatePropertyTests(spec);
    });

    it('generates property tests from invariants', () => {
      expect(generated.valid).toBe(true);
    });

    it('generates tests for segment type invariant', () => {
      // Spec has: forall seg in result.segments: seg.type in ['property', 'index', 'wildcard']
      expect(generated.code).toContain('segments');
    });
  });

  describe('spec.speccodex.invariants.structured', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generatePropertyTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.invariants.structured');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generatePropertyTests(spec);
    });

    it('generates property tests', () => {
      expect(generated.valid).toBe(true);
    });

    it('generates both forall and exists tests', () => {
      // This spec has both forall and exists invariants
      expect(generated.code).toContain('forall');
      expect(generated.code).toContain('exists');
    });
  });

  describe('spec.speccodex.generate.naming', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generatePropertyTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.generate.naming');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generatePropertyTests(spec);
    });

    it('generates property tests', () => {
      expect(generated.valid).toBe(true);
    });
  });

  describe('spec.speccodex.validator.errors', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generatePropertyTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.validator.errors');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generatePropertyTests(spec);
    });

    it('generates property tests', () => {
      expect(generated.valid).toBe(true);
    });
  });

  describe('spec.speccodex.verify.schema', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generatePropertyTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.verify.schema');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generatePropertyTests(spec);
    });

    it('generates property tests', () => {
      expect(generated.valid).toBe(true);
    });
  });

  describe('spec.speccodex.generate.coverage', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generatePropertyTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.generate.coverage');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generatePropertyTests(spec);
    });

    it('generates property tests from condition invariants', () => {
      expect(generated.valid).toBe(true);
      // Spec has condition invariants (coverageStats, testCount)
      expect(generated.code).toContain('testCount');
    });
  });

  describe('spec.speccodex.schema.outputs', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generatePropertyTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.schema.outputs');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generatePropertyTests(spec);
    });

    it('generates property tests', () => {
      expect(generated.valid).toBe(true);
    });
  });

  describe('spec.speccodex.schema.assertions', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generatePropertyTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.schema.assertions');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generatePropertyTests(spec);
    });

    it('generates property tests', () => {
      expect(generated.valid).toBe(true);
    });
  });
});
