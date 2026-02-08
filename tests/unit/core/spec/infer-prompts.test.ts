/**
 * @arch archcodex.test.unit
 *
 * Tests for LLM enrichment prompt building, response parsing, and YAML merging.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEnrichmentPrompt,
  parseEnrichmentResponse,
  mergeEnrichedSections,
} from '../../../../src/core/spec/infer-prompts.js';
import type { EnrichmentRequest, EnrichedSections } from '../../../../src/core/spec/inferrer.types.js';

// ---------------------------------------------------------------------------
// buildEnrichmentPrompt
// ---------------------------------------------------------------------------

describe('buildEnrichmentPrompt', () => {
  const baseRequest: EnrichmentRequest = {
    filePath: 'src/utils/format.ts',
    content: 'export function formatDate(d: Date): string { return d.toISOString(); }',
    exportName: 'formatDate',
    skeleton: {
      valid: true,
      specId: 'spec.utils.format.formatDate',
      yaml: 'spec:\n  inherits: spec.function',
      detectedPatterns: {
        baseSpec: 'spec.function',
        security: { authentication: 'none' },
        effects: [],
        errorCodes: [],
      },
      errors: [],
    },
    context: {
      importedTypes: [],
      calledFunctions: ['toISOString'],
      contextFiles: [],
    },
  };

  it('includes the export name in prompt', () => {
    const prompt = buildEnrichmentPrompt(baseRequest);
    expect(prompt).toContain('formatDate');
  });

  it('includes the implementation code', () => {
    const prompt = buildEnrichmentPrompt(baseRequest);
    expect(prompt).toContain('export function formatDate');
  });

  it('includes JSON output format instructions', () => {
    const prompt = buildEnrichmentPrompt(baseRequest);
    expect(prompt).toContain('goal');
    expect(prompt).toContain('intent');
    expect(prompt).toContain('successExamples');
    expect(prompt).toContain('invariants');
    expect(prompt).toContain('JSON');
  });

  it('includes imported types when present', () => {
    const request: EnrichmentRequest = {
      ...baseRequest,
      context: {
        importedTypes: [
          { name: 'Result', definition: 'interface Result { valid: boolean }', filePath: 'src/types.ts' },
        ],
        calledFunctions: [],
        contextFiles: [],
      },
    };

    const prompt = buildEnrichmentPrompt(request);
    expect(prompt).toContain('Result');
    expect(prompt).toContain('interface Result');
  });

  it('includes error codes when detected', () => {
    const request: EnrichmentRequest = {
      ...baseRequest,
      skeleton: {
        ...baseRequest.skeleton,
        detectedPatterns: {
          ...baseRequest.skeleton.detectedPatterns,
          errorCodes: ['NOT_FOUND', 'INVALID_INPUT'],
        },
      },
    };

    const prompt = buildEnrichmentPrompt(request);
    expect(prompt).toContain('NOT_FOUND');
    expect(prompt).toContain('INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// parseEnrichmentResponse
// ---------------------------------------------------------------------------

describe('parseEnrichmentResponse', () => {
  it('parses valid JSON response', () => {
    const response = JSON.stringify({
      goal: 'Process payments',
      intent: 'Handle payment flow',
      successExamples: [{ name: 'basic payment', given: { amount: 100 }, then: { status: 'completed' } }],
      errorExamples: [{ name: 'invalid amount', given: { amount: -1 }, then: { errorCode: 'INVALID_AMOUNT' } }],
      invariants: ['amount must be positive'],
    });

    const result = parseEnrichmentResponse(response);

    expect(result.goal).toBe('Process payments');
    expect(result.intent).toBe('Handle payment flow');
    expect(result.successExamples).toHaveLength(1);
    expect(result.errorExamples).toHaveLength(1);
    expect(result.invariants).toContain('amount must be positive');
  });

  it('parses JSON wrapped in markdown code block', () => {
    const response = '```json\n{"goal":"Test goal","intent":"Test intent","successExamples":[],"errorExamples":[],"invariants":[]}\n```';

    const result = parseEnrichmentResponse(response);

    expect(result.goal).toBe('Test goal');
    expect(result.intent).toBe('Test intent');
  });

  it('handles partial JSON with missing fields', () => {
    const response = '{"goal":"Partial goal"}';

    const result = parseEnrichmentResponse(response);

    expect(result.goal).toBe('Partial goal');
    expect(result.successExamples).toEqual([]);
    expect(result.invariants).toBeDefined();
  });

  it('falls back to TODO values for malformed JSON', () => {
    const result = parseEnrichmentResponse('This is not valid JSON at all');

    expect(result.goal).toContain('TODO');
    expect(result.intent).toContain('TODO');
    expect(result.invariants.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to TODO values for empty response', () => {
    const result = parseEnrichmentResponse('');

    expect(result.goal).toContain('TODO');
    expect(result.intent).toContain('TODO');
  });

  it('filters non-string invariants', () => {
    const response = JSON.stringify({
      goal: 'Test',
      intent: 'Test',
      successExamples: [],
      errorExamples: [],
      invariants: ['valid string', 42, null, 'another string'],
    });

    const result = parseEnrichmentResponse(response);

    expect(result.invariants).toEqual(['valid string', 'another string']);
  });
});

// ---------------------------------------------------------------------------
// mergeEnrichedSections
// ---------------------------------------------------------------------------

describe('mergeEnrichedSections', () => {
  const skeleton = [
    '# Auto-generated by `archcodex spec infer` — review and customize',
    'version: "1.0"',
    '',
    'spec.test.fn:',
    '  inherits: spec.function',
    '  implementation: src/test.ts#fn',
    '',
    '  # === STRATEGIC ===',
    '  goal: "TODO: Describe the high-level goal"',
    '  outcomes:',
    '    - "TODO: List expected outcomes"',
    '',
    '  # === OPERATIONAL ===',
    '  intent: "TODO: Describe what this function does"',
    '',
    '  inputs:',
    '    name:',
    '      type: string',
    '      required: true',
    '',
    '  outputs:',
    '    result:',
    '      type: object',
    '',
    '  # === INVARIANTS ===',
    '  invariants:',
    '    - "TODO: Define invariants"',
    '',
    '  # === EXAMPLES ===',
    '  examples:',
    '    success:',
    '      - name: "TODO: basic success case"',
    '        given:',
    '          name: "TODO"',
    '        then:',
    '          result: "@defined"',
    '',
  ].join('\n');

  it('replaces TODO goal and intent', () => {
    const enriched: EnrichedSections = {
      goal: 'Process user data efficiently',
      intent: 'Validate and transform user input',
      successExamples: [],
      errorExamples: [],
      invariants: ['Input must not be empty', 'Output preserves field order'],
    };

    const result = mergeEnrichedSections(skeleton, enriched);

    expect(result).toContain('Process user data efficiently');
    expect(result).toContain('Validate and transform user input');
    expect(result).not.toContain('TODO: Describe the high-level goal');
    expect(result).not.toContain('TODO: Describe what this function does');
  });

  it('replaces TODO invariants', () => {
    const enriched: EnrichedSections = {
      goal: 'Test goal',
      intent: 'Test intent',
      successExamples: [],
      errorExamples: [],
      invariants: ['Input must not be empty', 'Output preserves field order'],
    };

    const result = mergeEnrichedSections(skeleton, enriched);

    expect(result).toContain('Input must not be empty');
    expect(result).toContain('Output preserves field order');
    expect(result).not.toContain('TODO: Define invariants');
  });

  it('preserves structural sections (inputs, outputs)', () => {
    const enriched: EnrichedSections = {
      goal: 'Format names',
      intent: 'Format a name string',
      successExamples: [],
      errorExamples: [],
      invariants: [],
    };

    const result = mergeEnrichedSections(skeleton, enriched);

    expect(result).toContain('inputs:');
    expect(result).toContain('name:');
    expect(result).toContain('type: string');
    expect(result).toContain('implementation: src/test.ts#fn');
  });

  it('replaces examples when enriched examples provided', () => {
    const enriched: EnrichedSections = {
      goal: 'Test',
      intent: 'Test',
      successExamples: [
        { name: 'valid input', given: { name: 'John' }, then: { 'result.valid': true } },
      ],
      errorExamples: [
        { name: 'empty input', given: { name: '' }, then: { errorCode: 'INVALID_INPUT' } },
      ],
      invariants: [],
    };

    const result = mergeEnrichedSections(skeleton, enriched);

    expect(result).toContain('valid input');
    expect(result).toContain('"John"');
    expect(result).toContain('empty input');
    expect(result).toContain('INVALID_INPUT');
    expect(result).not.toContain('TODO: basic success case');
  });

  it('leaves skeleton unchanged when all enriched sections are TODO', () => {
    const enriched: EnrichedSections = {
      goal: 'TODO: Describe the high-level goal',
      intent: 'TODO: Describe what this function does',
      successExamples: [],
      errorExamples: [],
      invariants: ['TODO: Define invariants'],
    };

    const result = mergeEnrichedSections(skeleton, enriched);

    // Should be unchanged (all TODOs remain)
    expect(result).toContain('TODO: Describe the high-level goal');
    expect(result).toContain('TODO: Describe what this function does');
    expect(result).toContain('TODO: Define invariants');
  });
});
