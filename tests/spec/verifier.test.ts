/**
 * @arch archcodex.core.domain
 *
 * Tests for bidirectional verification - dogfooding from spec.speccodex.verify
 */
import { describe, it, expect } from 'vitest';
import {
  verifyImplementation,
  formatVerifyResult,
} from '../../src/core/spec/verifier.js';
import type { ResolvedSpec } from '../../src/core/spec/schema.js';

// Helper to create a minimal resolved spec
function createSpec(overrides: Partial<ResolvedSpec['node']> & { specId?: string }): ResolvedSpec {
  const { specId = 'spec.test', ...node } = overrides;
  return {
    specId,
    inheritanceChain: [specId],
    appliedMixins: [],
    node: {
      intent: 'Test function',
      ...node,
    },
  };
}

describe('verifyImplementation (from spec.speccodex.verify)', () => {
  describe('success cases', () => {
    it('matching implementation passes verification', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        architectures: ['convex.mutation'],
        inputs: {
          url: { type: 'string', required: true },
          title: { type: 'string' },
        },
        examples: {
          errors: [
            { name: 'invalid url', then: { error: 'INVALID_URL' } },
            { name: 'not found', then: { error: 'NOT_FOUND' } },
          ],
        },
      });

      const impl = `
/**
 * @arch convex.mutation
 */
export const create = makeAuthMutation(async (ctx, { url, title }) => {
  if (!isValidUrl(url)) {
    throw new ConvexError({ code: 'INVALID_URL', message: 'Invalid URL' });
  }
  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new ConvexError({ code: 'NOT_FOUND', message: 'Not found' });
  }
  return ctx.db.insert('products', { url, title });
});
`;

      const result = verifyImplementation(spec, impl, 'create.ts');

      expect(result.valid).toBe(true);
      expect(result.drift).toHaveLength(0);
      expect(result.coverage.inputsCovered).toBe(2);
      expect(result.coverage.errorsCovered).toBe(2);
    });

    it('extra implementation parameter is a warning not error', () => {
      const spec = createSpec({
        specId: 'spec.test',
        inputs: {
          url: { type: 'string', required: true },
        },
      });

      const impl = `
/**
 * @arch base
 */
export const fn = async ({ url, debug }) => {
  return { url };
};
`;

      const result = verifyImplementation(spec, impl, 'test.ts', { checkArchitecture: false });

      expect(result.valid).toBe(true);
      expect(result.drift.some(d => d.type === 'extra_input' && d.field === 'debug')).toBe(true);
      expect(result.drift.find(d => d.type === 'extra_input')?.severity).toBe('warning');
    });
  });

  describe('error cases - drift detection', () => {
    it('detects missing input parameter', () => {
      const spec = createSpec({
        specId: 'spec.test',
        inputs: {
          url: { type: 'string', required: true },
          title: { type: 'string' },
          projectId: { type: 'id' },
        },
      });

      const impl = `
export const fn = async ({ url }) => {
  return { url };
};
`;

      const result = verifyImplementation(spec, impl, 'test.ts', { checkArchitecture: false });

      expect(result.valid).toBe(false);
      expect(result.drift.some(d => d.type === 'missing_input' && d.field === 'title')).toBe(true);
      expect(result.drift.some(d => d.type === 'missing_input' && d.field === 'projectId')).toBe(true);
    });

    it('detects missing error handling', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: {
          errors: [
            { name: 'invalid url', then: { error: 'INVALID_URL' } },
            { name: 'permission denied', then: { error: 'PERMISSION_DENIED' } },
          ],
        },
      });

      const impl = `
export const fn = async (input) => {
  return input;
};
`;

      const result = verifyImplementation(spec, impl, 'test.ts', { checkArchitecture: false });

      expect(result.valid).toBe(false);
      expect(result.drift.some(d => d.type === 'missing_error' && d.errorCode === 'INVALID_URL')).toBe(true);
      expect(result.drift.some(d => d.type === 'missing_error' && d.errorCode === 'PERMISSION_DENIED')).toBe(true);
    });

    it('detects architecture mismatch', () => {
      const spec = createSpec({
        specId: 'spec.test',
        architectures: ['convex.mutation'],
      });

      const impl = `
/**
 * @arch convex.query
 */
export const fn = async () => {};
`;

      const result = verifyImplementation(spec, impl, 'test.ts');

      expect(result.valid).toBe(false);
      expect(result.drift.some(d =>
        d.type === 'architecture_mismatch' &&
        d.expected === 'convex.mutation' &&
        d.actual === 'convex.query'
      )).toBe(true);
    });

    it('detects missing @arch tag', () => {
      const spec = createSpec({
        specId: 'spec.test',
        architectures: ['convex.mutation'],
      });

      const impl = `
export const fn = async () => {};
`;

      const result = verifyImplementation(spec, impl, 'test.ts');

      expect(result.valid).toBe(false);
      expect(result.drift.some(d => d.type === 'architecture_mismatch')).toBe(true);
    });
  });

  describe('skip checks', () => {
    it('skips architecture check when disabled', () => {
      const spec = createSpec({
        specId: 'spec.test',
        architectures: ['convex.mutation'],
      });

      const impl = `
/**
 * @arch convex.query
 */
export const fn = async () => {};
`;

      const result = verifyImplementation(spec, impl, 'test.ts', { checkArchitecture: false });

      expect(result.drift.filter(d => d.type === 'architecture_mismatch')).toHaveLength(0);
    });

    it('skips error check when disabled', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: {
          errors: [
            { name: 'test error', then: { error: 'TEST_ERROR' } },
          ],
        },
      });

      const impl = `export const fn = async () => {};`;

      const result = verifyImplementation(spec, impl, 'test.ts', {
        checkArchitecture: false,
        checkErrors: false,
      });

      expect(result.drift.filter(d => d.type === 'missing_error')).toHaveLength(0);
    });

    it('skips input check when disabled', () => {
      const spec = createSpec({
        specId: 'spec.test',
        inputs: {
          foo: { type: 'string' },
          bar: { type: 'string' },
        },
      });

      const impl = `export const fn = async () => {};`;

      const result = verifyImplementation(spec, impl, 'test.ts', {
        checkArchitecture: false,
        checkInputs: false,
      });

      expect(result.drift.filter(d => d.type === 'missing_input')).toHaveLength(0);
    });
  });

  describe('coverage reporting', () => {
    it('reports input coverage correctly', () => {
      const spec = createSpec({
        specId: 'spec.test',
        inputs: {
          a: { type: 'string' },
          b: { type: 'string' },
          c: { type: 'string' },
        },
      });

      const impl = `export const fn = async ({ a, c }) => {};`;

      const result = verifyImplementation(spec, impl, 'test.ts', { checkArchitecture: false });

      expect(result.coverage.inputsTotal).toBe(3);
      expect(result.coverage.inputsCovered).toBe(2);
    });

    it('reports error coverage correctly', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: {
          errors: [
            { name: 'e1', then: { error: 'ERROR_1' } },
            { name: 'e2', then: { error: 'ERROR_2' } },
            { name: 'e3', then: { error: 'ERROR_3' } },
          ],
        },
      });

      const impl = `
throw new ConvexError({ code: 'ERROR_1' });
throw new ConvexError({ code: 'ERROR_3' });
`;

      const result = verifyImplementation(spec, impl, 'test.ts', { checkArchitecture: false });

      expect(result.coverage.errorsTotal).toBe(3);
      expect(result.coverage.errorsCovered).toBe(2);
    });

    it('reports output coverage correctly (Improvement #6)', () => {
      const spec = createSpec({
        specId: 'spec.test',
        outputs: {
          id: { type: 'id' },
          title: { type: 'string' },
          createdAt: { type: 'number' },
        },
      });

      const impl = `
export const fn = async () => {
  return { id, title, createdAt: Date.now() };
};
`;

      const result = verifyImplementation(spec, impl, 'test.ts', { checkArchitecture: false });

      expect(result.coverage.outputsTotal).toBe(3);
      expect(result.coverage.outputsCovered).toBe(3);
    });
  });

  // Improvement #6: Output Schema Verification
  describe('output verification (Improvement #6)', () => {
    it('detects missing output fields', () => {
      const spec = createSpec({
        specId: 'spec.test',
        outputs: {
          id: { type: 'id' },
          title: { type: 'string' },
          missingField: { type: 'string' },
        },
      });

      const impl = `
export const fn = async () => {
  return { id, title };
};
`;

      const result = verifyImplementation(spec, impl, 'test.ts', { checkArchitecture: false });

      expect(result.valid).toBe(false);
      const missingOutput = result.drift.find(d => d.type === 'missing_output');
      expect(missingOutput).toBeDefined();
      expect(missingOutput?.field).toBe('missingField');
    });

    it('detects extra output fields as warnings', () => {
      const spec = createSpec({
        specId: 'spec.test',
        outputs: {
          id: { type: 'id' },
        },
      });

      const impl = `
export const fn = async () => {
  return { id, extraField };
};
`;

      const result = verifyImplementation(spec, impl, 'test.ts', { checkArchitecture: false });

      expect(result.valid).toBe(true); // warnings don't fail
      const extraOutput = result.drift.find(d => d.type === 'extra_output');
      expect(extraOutput).toBeDefined();
      expect(extraOutput?.field).toBe('extraField');
      expect(extraOutput?.severity).toBe('warning');
    });

    it('skips output check when disabled', () => {
      const spec = createSpec({
        specId: 'spec.test',
        outputs: {
          id: { type: 'id' },
          missing: { type: 'string' },
        },
      });

      const impl = `export const fn = async () => ({ id });`;

      const result = verifyImplementation(spec, impl, 'test.ts', {
        checkArchitecture: false,
        checkOutputs: false,
      });

      expect(result.drift.filter(d => d.type === 'missing_output')).toHaveLength(0);
    });

    it('extracts return fields from TypeScript return type', () => {
      const spec = createSpec({
        specId: 'spec.test',
        outputs: {
          userId: { type: 'id' },
          data: { type: 'object' },
        },
      });

      const impl = `
export const fn = async (ctx: Context): Promise<{ userId: Id, data: Data }> => {
  return { userId: ctx.userId, data };
};
`;

      const result = verifyImplementation(spec, impl, 'test.ts', { checkArchitecture: false });

      expect(result.coverage.outputsCovered).toBe(2);
      expect(result.valid).toBe(true);
    });
  });
});

describe('formatVerifyResult', () => {
  it('formats passing result', () => {
    const result = verifyImplementation(
      createSpec({ specId: 'spec.test' }),
      '/** @arch base */ export const fn = () => {};',
      'test.ts',
      { checkArchitecture: false, checkErrors: false, checkInputs: false }
    );

    const formatted = formatVerifyResult(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('spec.test');
    expect(formatted).toContain('test.ts');
  });

  it('formats failing result with drift', () => {
    const spec = createSpec({
      specId: 'spec.test',
      inputs: { missing: { type: 'string' } },
    });

    const result = verifyImplementation(spec, 'export const fn = () => {};', 'test.ts', {
      checkArchitecture: false,
    });

    const formatted = formatVerifyResult(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('drift');
    expect(formatted).toContain('missing_input');
  });
});
