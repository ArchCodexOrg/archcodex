/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * AUTO-GENERATED from .arch/specs/speccodex/improvements.spec.yaml
 * DO NOT EDIT - regenerate with: npx tsx tests/spec/generate-tests.ts
 *
 * Integration tests generated from spec effects.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadSpecRegistry } from '../../../src/core/spec/loader.js';
import { resolveSpec } from '../../../src/core/spec/resolver.js';
import { generateIntegrationTests } from '../../../src/core/spec/generators/integration.js';
import type { SpecRegistry, ResolvedSpec } from '../../../src/core/spec/schema.js';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');

describe('[GENERATED] Integration Tests from Specs', () => {
  let registry: SpecRegistry;

  beforeAll(async () => {
    registry = await loadSpecRegistry(PROJECT_ROOT);
  });

  describe('spec.speccodex.validator.errors (has effects)', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generateIntegrationTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.validator.errors');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generateIntegrationTests(spec);
    });

    it('generates integration tests from effects', () => {
      expect(generated.valid).toBe(true);
      expect(generated.effectTests).toBeGreaterThan(0);
    });

    it('generates metrics effect test', () => {
      // Spec has: metrics: { counter: "spec.validation.warnings" }
      // Standard (non-Convex) uses mockMetrics pattern
      expect(generated.code).toContain('mockMetrics');
      expect(generated.code).toContain('spec.validation.warnings');
    });

    it('generates cache effect test', () => {
      // Spec has: cache: { invalidated: "spec.validation.${specId}" }
      expect(generated.code).toContain('cache');
      expect(generated.code).toContain('invalidate');
    });
  });

  describe('spec.speccodex.verify.schema (has effects)', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generateIntegrationTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.verify.schema');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generateIntegrationTests(spec);
    });

    it('generates integration tests from effects', () => {
      expect(generated.valid).toBe(true);
      expect(generated.effectTests).toBeGreaterThan(0);
    });

    it('generates audit_log effect test', () => {
      // Spec has: audit_log: { action: "spec.verify.drift" }
      // Standard (non-Convex) uses mockLogger pattern
      expect(generated.code).toContain('mockLogger');
      expect(generated.code).toContain('spec.verify.drift');
    });

    it('generates notification effect test', () => {
      // Spec has: notification: { type: "drift_detected", channel: "slack" }
      expect(generated.code).toContain('notification');
      expect(generated.code).toContain('drift_detected');
      expect(generated.code).toContain('slack');
    });
  });

  describe('spec.speccodex.generate.coverage (has effects)', () => {
    let spec: ResolvedSpec;
    let generated: ReturnType<typeof generateIntegrationTests>;

    beforeAll(() => {
      const result = resolveSpec(registry, 'spec.speccodex.generate.coverage');
      expect(result.valid).toBe(true);
      spec = result.spec!;
      generated = generateIntegrationTests(spec);
    });

    it('generates integration tests from effects', () => {
      expect(generated.valid).toBe(true);
      expect(generated.effectTests).toBeGreaterThan(0);
    });

    it('generates cache effect test', () => {
      // Spec has: cache: { updated: "generated.tests.${specId}" }
      expect(generated.code).toContain('cache');
    });

    it('generates metrics effect test', () => {
      // Spec has: metrics: { gauge: "spec.coverage.generated_tests" }
      expect(generated.code).toContain('spec.coverage.generated_tests');
    });

    it('generates scheduler effect test', () => {
      // Spec has: scheduler: { job: "validate_generated_tests", delay: "1s" }
      // Standard (non-Convex) uses mockScheduler pattern
      expect(generated.code).toContain('mockScheduler');
      expect(generated.code).toContain('validate_generated_tests');
    });
  });

  describe('specs without effects', () => {
    const specsWithoutEffects = [
      'spec.speccodex.placeholders.hasItem',
      'spec.speccodex.placeholders.jsonpath',
      'spec.speccodex.invariants.structured',
      'spec.speccodex.generate.naming',
      'spec.speccodex.schema.outputs',
      'spec.speccodex.schema.assertions',
    ];

    for (const specId of specsWithoutEffects) {
      it(`${specId} has no effects → no integration tests`, () => {
        const result = resolveSpec(registry, specId);
        expect(result.valid).toBe(true);
        const generated = generateIntegrationTests(result.spec!);
        expect(generated.valid).toBe(false);
        expect(generated.errors[0]?.code).toBe('NO_EFFECTS');
      });
    }
  });
});
