/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for keyword extractor.
 */
import { describe, it, expect } from 'vitest';
import { extractKeywords, extractAllKeywords } from '../../../../src/core/discovery/keyword-extractor.js';
import type { ArchitectureNode } from '../../../../src/core/registry/schema.js';

describe('extractKeywords', () => {
  it('should extract keywords from arch ID segments', () => {
    const node: ArchitectureNode = {
      rationale: 'Test architecture',
    };

    const keywords = extractKeywords('archcodex.core.engine', node);

    expect(keywords).toContain('archcodex');
    expect(keywords).toContain('core');
    expect(keywords).toContain('engine');
  });

  it('should extract keywords from description', () => {
    const node: ArchitectureNode = {
      description: 'Payment processor for credit cards',
      rationale: 'Handles payment transactions',
    };

    const keywords = extractKeywords('test.arch', node);

    expect(keywords).toContain('payment');
    expect(keywords).toContain('processor');
    expect(keywords).toContain('credit');
    expect(keywords).toContain('cards');
  });

  it('should extract keywords from rationale', () => {
    const node: ArchitectureNode = {
      rationale: 'Orchestrates validation workflow execution',
    };

    const keywords = extractKeywords('test.arch', node);

    expect(keywords).toContain('orchestrates');
    expect(keywords).toContain('validation');
    expect(keywords).toContain('workflow');
    expect(keywords).toContain('execution');
  });

  it('should extract keywords from hints', () => {
    const node: ArchitectureNode = {
      rationale: 'Test',
      hints: [
        'Always redact sensitive data',
        { text: 'Use dependency injection pattern' },
      ],
    };

    const keywords = extractKeywords('test.arch', node);

    expect(keywords).toContain('redact');
    expect(keywords).toContain('sensitive');
    expect(keywords).toContain('dependency');
    expect(keywords).toContain('injection');
    expect(keywords).toContain('pattern');
  });

  it('should include mixin names as keywords', () => {
    const node: ArchitectureNode = {
      rationale: 'Test',
      mixins: ['tested', 'srp', 'dip'],
    };

    const keywords = extractKeywords('test.arch', node);

    expect(keywords).toContain('tested');
    expect(keywords).toContain('srp');
    expect(keywords).toContain('dip');
  });

  it('should extract keywords from constraint values', () => {
    const node: ArchitectureNode = {
      rationale: 'Test',
      constraints: [
        { rule: 'forbid_import', value: ['axios', 'fetch'], severity: 'error' },
        { rule: 'require_decorator', value: 'Injectable', severity: 'error' },
      ],
    };

    const keywords = extractKeywords('test.arch', node);

    expect(keywords).toContain('axios');
    expect(keywords).toContain('fetch');
    expect(keywords).toContain('injectable');
  });

  it('should filter out stop words', () => {
    const node: ArchitectureNode = {
      description: 'The service for handling all the data',
      rationale: 'This is used for processing',
    };

    const keywords = extractKeywords('test.arch', node);

    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('for');
    expect(keywords).not.toContain('all');
    expect(keywords).not.toContain('this');
  });

  it('should filter out short words', () => {
    const node: ArchitectureNode = {
      description: 'A to B API',
      rationale: 'An IO handler',
    };

    const keywords = extractKeywords('test.arch', node);

    expect(keywords).not.toContain('a');
    expect(keywords).not.toContain('to');
    expect(keywords).not.toContain('an');
    expect(keywords).not.toContain('io');
  });

  it('should return sorted, deduplicated keywords', () => {
    const node: ArchitectureNode = {
      description: 'Payment payment PAYMENT',
      rationale: 'Payment handler',
    };

    const keywords = extractKeywords('payment.service', node);

    // Should only have one instance of 'payment'
    const paymentCount = keywords.filter((k) => k === 'payment').length;
    expect(paymentCount).toBe(1);

    // Should be sorted
    const sorted = [...keywords].sort();
    expect(keywords).toEqual(sorted);
  });

  it('should not include numeric constraint values', () => {
    const node: ArchitectureNode = {
      rationale: 'Test',
      constraints: [
        { rule: 'max_file_lines', value: 500, severity: 'error' },
      ],
    };

    const keywords = extractKeywords('test.arch', node);

    expect(keywords).not.toContain('500');
  });
});

describe('extractAllKeywords', () => {
  it('should extract keywords for all architectures', () => {
    const nodes: Record<string, ArchitectureNode> = {
      'app.service': {
        description: 'Application service layer',
        rationale: 'Business logic',
      },
      'app.controller': {
        description: 'HTTP request handler',
        rationale: 'API endpoints',
      },
    };

    const result = extractAllKeywords(nodes);

    expect(result.size).toBe(2);
    expect(result.has('app.service')).toBe(true);
    expect(result.has('app.controller')).toBe(true);
    expect(result.get('app.service')).toContain('service');
    expect(result.get('app.controller')).toContain('controller');
  });
});
