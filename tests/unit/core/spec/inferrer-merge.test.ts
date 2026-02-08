/**
 * @arch archcodex.test.unit
 *
 * Tests for inferSpecUpdate — merging inferred changes into existing specs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inferSpecUpdate } from '../../../../src/core/spec/inferrer.js';

// Mock loadSpecRegistry and resolveSpec to control existing spec data
vi.mock('../../../../src/core/spec/loader.js', () => ({
  loadSpecRegistry: vi.fn(),
}));

vi.mock('../../../../src/core/spec/resolver.js', () => ({
  resolveSpec: vi.fn(),
}));

import { loadSpecRegistry } from '../../../../src/core/spec/loader.js';
import { resolveSpec } from '../../../../src/core/spec/resolver.js';

const mockedLoadSpecRegistry = vi.mocked(loadSpecRegistry);
const mockedResolveSpec = vi.mocked(resolveSpec);

const FIXTURES = 'tests/fixtures/typescript';

function makeResolvedSpec(overrides: Record<string, unknown> = {}) {
  return {
    valid: true,
    spec: {
      specId: 'spec.test.fn',
      inheritanceChain: ['spec.function'],
      appliedMixins: [],
      node: {
        goal: 'Existing goal that must be preserved',
        intent: 'Existing intent that must be preserved',
        inputs: {
          input: { type: 'string', required: true },
        },
        outputs: {
          result: { type: 'string' },
        },
        invariants: [
          'Result is always a non-empty string',
          'Input must be trimmed before processing',
        ],
        examples: {
          success: [
            { name: 'basic case', given: { input: 'hello' }, then: { 'result': 'HELLO' } },
          ],
          errors: [
            { name: 'empty input', given: { input: '' }, then: { 'error.code': 'EMPTY_INPUT' } },
          ],
        },
        ...overrides,
      },
    },
    errors: [],
  };
}

describe('inferSpecUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('error cases', () => {
    it('returns SPEC_NOT_FOUND when registry is empty', async () => {
      mockedLoadSpecRegistry.mockResolvedValue({ nodes: {}, mixins: {} });

      const result = await inferSpecUpdate({
        specId: 'spec.nonexistent',
        implementationPath: `${FIXTURES}/plain-function.ts#formatDate`,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'SPEC_NOT_FOUND' })]),
      );
    });

    it('returns SPEC_NOT_FOUND when spec ID not in registry', async () => {
      mockedLoadSpecRegistry.mockResolvedValue({
        nodes: { 'spec.other': {} as never },
        mixins: {},
      });
      mockedResolveSpec.mockReturnValue({
        valid: false,
        errors: [{ code: 'NOT_FOUND', message: 'not found' }],
      });

      const result = await inferSpecUpdate({
        specId: 'spec.nonexistent',
        implementationPath: `${FIXTURES}/plain-function.ts#formatDate`,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'SPEC_NOT_FOUND' })]),
      );
    });
  });

  describe('preservation', () => {
    it('preserves existing goal', async () => {
      mockedLoadSpecRegistry.mockResolvedValue({
        nodes: { 'spec.test.fn': {} as never },
        mixins: {},
      });
      mockedResolveSpec.mockReturnValue(makeResolvedSpec() as never);

      const result = await inferSpecUpdate({
        specId: 'spec.test.fn',
        implementationPath: `${FIXTURES}/helpers.ts#doStuff`,
      });

      expect(result.valid).toBe(true);
      expect(result.yaml).toContain('goal: "Existing goal that must be preserved"');
      expect(result.yaml).not.toContain('goal: "TODO');
    });

    it('preserves existing intent', async () => {
      mockedLoadSpecRegistry.mockResolvedValue({
        nodes: { 'spec.test.fn': {} as never },
        mixins: {},
      });
      mockedResolveSpec.mockReturnValue(makeResolvedSpec() as never);

      const result = await inferSpecUpdate({
        specId: 'spec.test.fn',
        implementationPath: `${FIXTURES}/helpers.ts#doStuff`,
      });

      expect(result.valid).toBe(true);
      expect(result.yaml).toContain('intent: "Existing intent that must be preserved"');
      expect(result.yaml).not.toContain('intent: "TODO');
    });

    it('preserves existing invariants', async () => {
      mockedLoadSpecRegistry.mockResolvedValue({
        nodes: { 'spec.test.fn': {} as never },
        mixins: {},
      });
      mockedResolveSpec.mockReturnValue(makeResolvedSpec() as never);

      const result = await inferSpecUpdate({
        specId: 'spec.test.fn',
        implementationPath: `${FIXTURES}/helpers.ts#doStuff`,
      });

      expect(result.valid).toBe(true);
      expect(result.yaml).toContain('Result is always a non-empty string');
      expect(result.yaml).toContain('Input must be trimmed before processing');
      expect(result.yaml).not.toContain('TODO: Define invariants');
    });

    it('preserves existing examples', async () => {
      mockedLoadSpecRegistry.mockResolvedValue({
        nodes: { 'spec.test.fn': {} as never },
        mixins: {},
      });
      mockedResolveSpec.mockReturnValue(makeResolvedSpec() as never);

      const result = await inferSpecUpdate({
        specId: 'spec.test.fn',
        implementationPath: `${FIXTURES}/helpers.ts#doStuff`,
      });

      expect(result.valid).toBe(true);
      expect(result.yaml).toContain('basic case');
      expect(result.yaml).toContain('empty input');
      expect(result.yaml).not.toContain('TODO: basic success case');
    });

    it('preservedSections always includes goal, intent, examples, invariants', async () => {
      mockedLoadSpecRegistry.mockResolvedValue({
        nodes: { 'spec.test.fn': {} as never },
        mixins: {},
      });
      mockedResolveSpec.mockReturnValue(makeResolvedSpec() as never);

      const result = await inferSpecUpdate({
        specId: 'spec.test.fn',
        implementationPath: `${FIXTURES}/helpers.ts#doStuff`,
      });

      expect(result.valid).toBe(true);
      expect(result.mergeReport.preservedSections).toContain('goal');
      expect(result.mergeReport.preservedSections).toContain('intent');
      expect(result.mergeReport.preservedSections).toContain('examples');
      expect(result.mergeReport.preservedSections).toContain('invariants');
    });
  });

  describe('merge report', () => {
    it('detects new parameters added to implementation', async () => {
      // helpers.ts#doStuff has `input: string` parameter
      // existing spec has `input` — so no new params here
      // But the return type has `result` — matching existing output
      mockedLoadSpecRegistry.mockResolvedValue({
        nodes: { 'spec.test.fn': {} as never },
        mixins: {},
      });
      mockedResolveSpec.mockReturnValue(makeResolvedSpec({
        inputs: {}, // no existing inputs
      }) as never);

      const result = await inferSpecUpdate({
        specId: 'spec.test.fn',
        implementationPath: `${FIXTURES}/helpers.ts#doStuff`,
      });

      expect(result.valid).toBe(true);
      // doStuff(input: string) — 'input' is new vs. empty existing spec
      expect(result.mergeReport.addedInputs).toContain('input');
    });

    it('detects removed parameters', async () => {
      mockedLoadSpecRegistry.mockResolvedValue({
        nodes: { 'spec.test.fn': {} as never },
        mixins: {},
      });
      mockedResolveSpec.mockReturnValue(makeResolvedSpec({
        inputs: {
          input: { type: 'string', required: true },
          oldParam: { type: 'string', required: false },
        },
      }) as never);

      const result = await inferSpecUpdate({
        specId: 'spec.test.fn',
        implementationPath: `${FIXTURES}/helpers.ts#doStuff`,
      });

      expect(result.valid).toBe(true);
      expect(result.mergeReport.removedInputs).toContain('oldParam');
    });
  });
});
