/**
 * @arch archcodex.test.unit
 *
 * Tests for SpecCodex schema validation.
 */
import { describe, it, expect } from 'vitest';
import {
  SpecNodeSchema,
  InputFieldSchema,
  OutputFieldSchema,
  InvariantSchema,
  ExampleSchema,
  SecuritySchema,
} from '../../../../src/core/spec/schema.js';

describe('SpecCodex Schema', () => {
  describe('InputFieldSchema', () => {
    it('validates string input field', () => {
      const result = InputFieldSchema.safeParse({
        type: 'string',
        required: true,
        max: 100,
      });
      expect(result.success).toBe(true);
    });

    it('validates enum input field with values', () => {
      const result = InputFieldSchema.safeParse({
        type: 'enum',
        values: ['active', 'inactive', 'pending'],
      });
      expect(result.success).toBe(true);
    });

    it('validates id input field with table reference', () => {
      const result = InputFieldSchema.safeParse({
        type: 'id',
        table: 'users',
        required: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid type', () => {
      const result = InputFieldSchema.safeParse({
        type: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('OutputFieldSchema', () => {
    it('validates object output with properties', () => {
      const result = OutputFieldSchema.safeParse({
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates array output with items', () => {
      const result = OutputFieldSchema.safeParse({
        type: 'array',
        items: { type: 'string' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('InvariantSchema', () => {
    it('validates simple field assertion', () => {
      const result = InvariantSchema.safeParse({
        'result.status': 'success',
      });
      expect(result.success).toBe(true);
    });

    it('validates condition expression', () => {
      const result = InvariantSchema.safeParse({
        condition: 'result.items.length <= input.limit',
        description: 'Result respects limit',
      });
      expect(result.success).toBe(true);
    });

    it('validates forall invariant', () => {
      const result = InvariantSchema.safeParse({
        forall: {
          variable: 'item',
          in: 'result.items',
          then: { 'item.id': '@exists' },
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates exists invariant without where', () => {
      const result = InvariantSchema.safeParse({
        exists: {
          variable: 'item',
          in: 'result.items',
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates exists invariant with where', () => {
      const result = InvariantSchema.safeParse({
        exists: {
          variable: 'item',
          in: 'result.items',
          where: { 'item.type': 'primary' },
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ExampleSchema', () => {
    it('validates success example', () => {
      const result = ExampleSchema.safeParse({
        name: 'valid input',
        given: { name: 'Alice' },
        then: { 'result.greeting': 'Hello, Alice!' },
      });
      expect(result.success).toBe(true);
    });

    it('validates error example', () => {
      const result = ExampleSchema.safeParse({
        name: 'invalid input',
        given: { name: '' },
        then: { error: 'INVALID_NAME' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SecuritySchema', () => {
    it('validates full security config', () => {
      const result = SecuritySchema.safeParse({
        authentication: 'required',
        rate_limit: { requests: 60, window: '15m' },
        permissions: ['product.create'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SpecNodeSchema', () => {
    it('validates minimal spec', () => {
      const result = SpecNodeSchema.safeParse({
        intent: 'Create a product',
      });
      expect(result.success).toBe(true);
    });

    it('validates full spec', () => {
      const result = SpecNodeSchema.safeParse({
        intent: 'Create a product from URL',
        inherits: 'spec.mutation',
        mixins: ['requires_auth', 'logs_audit'],
        inputs: {
          url: { type: 'string', required: true, validate: 'url' },
        },
        outputs: {
          product: { type: 'object' },
        },
        security: {
          authentication: 'required',
        },
        invariants: [
          { 'result.product.url': '@valid_url' },
        ],
        examples: {
          success: [
            { name: 'valid url', given: { url: 'https://example.com' }, then: { 'result.product': '@exists' } },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates base spec with required_fields', () => {
      const result = SpecNodeSchema.safeParse({
        type: 'base',
        intent: 'Base mutation spec',
        required_fields: ['intent', 'inputs'],
      });
      expect(result.success).toBe(true);
    });
  });
});
