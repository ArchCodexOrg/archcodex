/**
 * @arch archcodex.test.unit
 *
 * Tests for integration test generator.
 */
import { describe, it, expect } from 'vitest';
import {
  generateIntegrationTests,
} from '../../../../../src/core/spec/generators/integration.js';
import type { ResolvedSpec, Effect } from '../../../../../src/core/spec/schema.js';

describe('Integration Test Generator', () => {
  const createSpec = (effects?: Effect[], architectures?: string[]): ResolvedSpec => ({
    specId: 'spec.test.integration',
    inheritanceChain: ['spec.test.integration'],
    appliedMixins: [],
    node: {
      intent: 'Test integration test generation',
      effects,
      architectures,
    },
  });

  describe('generateIntegrationTests', () => {
    it('generates tests for spec with effects', () => {
      const spec = createSpec([
        { audit_log: { action: 'test.action', resourceType: 'test' } },
        { database: { table: 'items', operation: 'insert' } },
      ]);

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toBeDefined();
    });

    it('handles spec without effects', () => {
      const spec = createSpec();
      const result = generateIntegrationTests(spec);

      // Still valid, just returns empty or minimal code
      expect(result).toBeDefined();
    });

    it('handles audit_log effects', () => {
      const spec = createSpec([
        { audit_log: { action: 'user.create', resourceType: 'user' } },
      ]);

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
    });

    it('handles database effects', () => {
      const spec = createSpec([
        { database: { table: 'users', operation: 'insert' } },
      ]);

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
    });
  });

  // Gap 6: Architecture-aware integration tests
  describe('architecture-aware patterns (Gap 6)', () => {
    it('convex architecture uses ctx.db pattern for database effects', () => {
      const spec = createSpec(
        [{ database: { table: 'products', operation: 'insert' } }],
        ['convex.mutation']
      );

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('ctx.db');
      expect(result.code).toContain('createTestContext');
    });

    it('standard architecture uses mock-based verification for database effects', () => {
      const spec = createSpec(
        [{ database: { table: 'products', operation: 'insert' } }],
        ['archcodex.core.domain']
      );

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('vi.fn()');
      expect(result.code).toContain('mockDb');
      expect(result.code).not.toContain('createTestContext');
    });

    it('no architecture defaults to standard mocks', () => {
      const spec = createSpec(
        [{ cache: { invalidated: 'items' } }]
      );

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('vi.fn()');
      expect(result.code).toContain('mockCache');
    });

    it('standard architecture includes vi in imports', () => {
      const spec = createSpec(
        [{ audit_log: { action: 'test.action', resourceType: 'test' } }],
        ['archcodex.core.domain']
      );

      const result = generateIntegrationTests(spec);

      expect(result.code).toContain("vi } from 'vitest'");
    });

    it('convex architecture does not include vi in imports', () => {
      const spec = createSpec(
        [{ audit_log: { action: 'test.action', resourceType: 'test' } }],
        ['convex.mutation']
      );

      const result = generateIntegrationTests(spec);

      expect(result.code).not.toContain('vi }');
      expect(result.code).not.toContain('vi.fn()');
    });

    it('standard architecture uses mockLogger for audit_log effects', () => {
      const spec = createSpec(
        [{ audit_log: { action: 'user.create', resourceType: 'user' } }],
        ['archcodex.core.domain']
      );

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('mockLogger');
    });

    it('standard architecture uses mockNotifier for notification effects', () => {
      const spec = createSpec(
        [{ notification: { type: 'email', channel: 'smtp' } }],
        ['archcodex.core.domain']
      );

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('mockNotifier');
    });

    it('standard architecture uses vi.clearAllMocks in beforeEach', () => {
      const spec = createSpec(
        [{ database: { table: 'items', operation: 'insert' } }],
        ['archcodex.core.domain']
      );

      const result = generateIntegrationTests(spec);

      expect(result.code).toContain('vi.clearAllMocks()');
      expect(result.code).toContain('beforeEach');
    });

    it('convex architecture uses cleanupTestContext in afterEach', () => {
      const spec = createSpec(
        [{ database: { table: 'items', operation: 'insert' } }],
        ['convex.mutation']
      );

      const result = generateIntegrationTests(spec);

      expect(result.code).toContain('cleanupTestContext');
      expect(result.code).toContain('afterEach');
    });
  });
});
