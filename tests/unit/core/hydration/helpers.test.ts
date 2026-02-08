/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for hydration helper functions.
 */
import { describe, it, expect } from 'vitest';
import {
  extractForbiddenConstraints,
  extractRequiredConstraints,
  formatConstraintValue,
  groupConstraintsBySeverity,
  estimateTokens,
  findPatternSuggestion,
  selectSharpHints,
} from '../../../../src/core/hydration/helpers.js';
import type { ResolvedConstraint, ResolvedHint } from '../../../../src/core/registry/types.js';
import type { PatternRegistry } from '../../../../src/core/patterns/types.js';

function createConstraint(overrides: Partial<ResolvedConstraint> & { rule: string; value: unknown }): ResolvedConstraint {
  return {
    severity: 'error',
    source: 'test.arch',
    ...overrides,
  } as ResolvedConstraint;
}

function createHint(text: string, example?: string): ResolvedHint {
  return { text, example };
}

describe('extractForbiddenConstraints', () => {
  it('should return empty array for no constraints', () => {
    expect(extractForbiddenConstraints([])).toEqual([]);
  });

  it('should extract forbid_import constraints', () => {
    const constraints = [
      createConstraint({ rule: 'forbid_import', value: ['axios'] }),
      createConstraint({ rule: 'require_import', value: ['lodash'] }),
    ];
    const result = extractForbiddenConstraints(constraints);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('forbid_import');
  });

  it('should extract forbid_decorator constraints', () => {
    const constraints = [
      createConstraint({ rule: 'forbid_decorator', value: ['Deprecated'] }),
    ];
    const result = extractForbiddenConstraints(constraints);
    expect(result).toHaveLength(1);
  });

  it('should extract max_file_lines constraints', () => {
    const constraints = [
      createConstraint({ rule: 'max_file_lines', value: 200 }),
    ];
    const result = extractForbiddenConstraints(constraints);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('max_file_lines');
  });

  it('should extract max_public_methods constraints', () => {
    const constraints = [
      createConstraint({ rule: 'max_public_methods', value: 7 }),
    ];
    const result = extractForbiddenConstraints(constraints);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('max_public_methods');
  });

  it('should exclude require_ and other constraints', () => {
    const constraints = [
      createConstraint({ rule: 'require_import', value: ['zod'] }),
      createConstraint({ rule: 'must_extend', value: 'BaseClass' }),
      createConstraint({ rule: 'implements', value: 'IService' }),
      createConstraint({ rule: 'naming_pattern', value: '*Service' }),
    ];
    const result = extractForbiddenConstraints(constraints);
    expect(result).toEqual([]);
  });

  it('should extract multiple forbidden/limit constraints', () => {
    const constraints = [
      createConstraint({ rule: 'forbid_import', value: ['axios'] }),
      createConstraint({ rule: 'forbid_decorator', value: ['Inject'] }),
      createConstraint({ rule: 'max_file_lines', value: 300 }),
      createConstraint({ rule: 'max_public_methods', value: 5 }),
      createConstraint({ rule: 'require_import', value: ['zod'] }),
    ];
    const result = extractForbiddenConstraints(constraints);
    expect(result).toHaveLength(4);
  });
});

describe('extractRequiredConstraints', () => {
  it('should return empty array for no constraints', () => {
    expect(extractRequiredConstraints([])).toEqual([]);
  });

  it('should extract require_import constraints', () => {
    const constraints = [
      createConstraint({ rule: 'require_import', value: ['zod'] }),
      createConstraint({ rule: 'forbid_import', value: ['axios'] }),
    ];
    const result = extractRequiredConstraints(constraints);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('require_import');
  });

  it('should extract must_extend constraints', () => {
    const constraints = [
      createConstraint({ rule: 'must_extend', value: 'BaseClass' }),
    ];
    const result = extractRequiredConstraints(constraints);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('must_extend');
  });

  it('should extract implements constraints', () => {
    const constraints = [
      createConstraint({ rule: 'implements', value: 'IService' }),
    ];
    const result = extractRequiredConstraints(constraints);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('implements');
  });

  it('should extract require_decorator constraints', () => {
    const constraints = [
      createConstraint({ rule: 'require_decorator', value: ['Injectable'] }),
    ];
    const result = extractRequiredConstraints(constraints);
    expect(result).toHaveLength(1);
  });

  it('should extract require_test_file constraints', () => {
    const constraints = [
      createConstraint({ rule: 'require_test_file', value: true }),
    ];
    const result = extractRequiredConstraints(constraints);
    expect(result).toHaveLength(1);
  });

  it('should exclude forbid_ and limit constraints', () => {
    const constraints = [
      createConstraint({ rule: 'forbid_import', value: ['axios'] }),
      createConstraint({ rule: 'max_file_lines', value: 200 }),
      createConstraint({ rule: 'max_public_methods', value: 7 }),
      createConstraint({ rule: 'naming_pattern', value: '*Service' }),
    ];
    const result = extractRequiredConstraints(constraints);
    expect(result).toEqual([]);
  });
});

describe('formatConstraintValue', () => {
  it('should join array values with comma', () => {
    expect(formatConstraintValue(['a', 'b', 'c'])).toBe('a, b, c');
  });

  it('should convert single string to string', () => {
    expect(formatConstraintValue('hello')).toBe('hello');
  });

  it('should convert number to string', () => {
    expect(formatConstraintValue(200)).toBe('200');
  });

  it('should convert boolean to string', () => {
    expect(formatConstraintValue(true)).toBe('true');
  });

  it('should handle empty array', () => {
    expect(formatConstraintValue([])).toBe('');
  });

  it('should handle single-element array', () => {
    expect(formatConstraintValue(['only'])).toBe('only');
  });

  it('should handle null/undefined by converting to string', () => {
    expect(formatConstraintValue(null)).toBe('null');
    expect(formatConstraintValue(undefined)).toBe('undefined');
  });
});

describe('groupConstraintsBySeverity', () => {
  it('should return empty groups for no constraints', () => {
    const result = groupConstraintsBySeverity([]);
    expect(result.error).toEqual([]);
    expect(result.warning).toEqual([]);
  });

  it('should group error constraints', () => {
    const constraints = [
      createConstraint({ rule: 'forbid_import', value: ['axios'], severity: 'error' }),
      createConstraint({ rule: 'max_file_lines', value: 200, severity: 'error' }),
    ];
    const result = groupConstraintsBySeverity(constraints);
    expect(result.error).toHaveLength(2);
    expect(result.warning).toHaveLength(0);
  });

  it('should group warning constraints', () => {
    const constraints = [
      createConstraint({ rule: 'naming_pattern', value: '*Service', severity: 'warning' }),
    ];
    const result = groupConstraintsBySeverity(constraints);
    expect(result.error).toHaveLength(0);
    expect(result.warning).toHaveLength(1);
  });

  it('should separate mixed severities', () => {
    const constraints = [
      createConstraint({ rule: 'forbid_import', value: ['axios'], severity: 'error' }),
      createConstraint({ rule: 'naming_pattern', value: '*Service', severity: 'warning' }),
      createConstraint({ rule: 'max_file_lines', value: 200, severity: 'error' }),
      createConstraint({ rule: 'require_import', value: ['zod'], severity: 'warning' }),
    ];
    const result = groupConstraintsBySeverity(constraints);
    expect(result.error).toHaveLength(2);
    expect(result.warning).toHaveLength(2);
  });
});

describe('estimateTokens', () => {
  it('should estimate ~4 chars per token', () => {
    // 12 chars -> 3 tokens
    expect(estimateTokens('hello world!')).toBe(3);
  });

  it('should round up with Math.ceil', () => {
    // 5 chars -> ceil(5/4) = 2
    expect(estimateTokens('hello')).toBe(2);
  });

  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should handle long text', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBe(100);
  });

  it('should handle single character', () => {
    expect(estimateTokens('x')).toBe(1);
  });
});

describe('findPatternSuggestion', () => {
  const patternRegistry: PatternRegistry = {
    patterns: {
      httpClient: {
        canonical: 'src/utils/http-client.ts',
        exports: ['HttpClient'],
        usage: 'Use HttpClient for all HTTP requests',
        keywords: ['http', 'axios', 'fetch', 'request'],
      },
      logger: {
        canonical: 'src/utils/logger.ts',
        exports: ['Logger', 'createLogger'],
        usage: 'Use Logger for structured logging',
        keywords: ['log', 'debug', 'console'],
      },
    },
  };

  it('should return null when no pattern registry provided', () => {
    const constraint = createConstraint({ rule: 'forbid_import', value: ['axios'] });
    expect(findPatternSuggestion(constraint)).toBeNull();
  });

  it('should return null when constraint is not forbid_import', () => {
    const constraint = createConstraint({ rule: 'max_file_lines', value: 200 });
    expect(findPatternSuggestion(constraint, patternRegistry)).toBeNull();
  });

  it('should find pattern matching forbidden import keyword', () => {
    const constraint = createConstraint({ rule: 'forbid_import', value: ['axios'] });
    const result = findPatternSuggestion(constraint, patternRegistry);

    expect(result).not.toBeNull();
    expect(result!.file).toBe('src/utils/http-client.ts');
    expect(result!.export).toBe('HttpClient');
    expect(result!.description).toBe('Use HttpClient for all HTTP requests');
  });

  it('should match by keyword substring (case-insensitive)', () => {
    const constraint = createConstraint({ rule: 'forbid_import', value: ['AXIOS'] });
    const result = findPatternSuggestion(constraint, patternRegistry);
    expect(result).not.toBeNull();
    expect(result!.file).toBe('src/utils/http-client.ts');
  });

  it('should find logger pattern for console-related forbidden import', () => {
    const constraint = createConstraint({ rule: 'forbid_import', value: ['console'] });
    const result = findPatternSuggestion(constraint, patternRegistry);

    expect(result).not.toBeNull();
    expect(result!.file).toBe('src/utils/logger.ts');
  });

  it('should return null when no keyword matches', () => {
    const constraint = createConstraint({ rule: 'forbid_import', value: ['some-random-module'] });
    const result = findPatternSuggestion(constraint, patternRegistry);
    expect(result).toBeNull();
  });

  it('should handle array value for forbid_import', () => {
    const constraint = createConstraint({ rule: 'forbid_import', value: ['node-fetch', 'axios'] });
    const result = findPatternSuggestion(constraint, patternRegistry);
    expect(result).not.toBeNull();
  });

  it('should handle single string value for forbid_import', () => {
    const constraint = createConstraint({ rule: 'forbid_import', value: 'axios' });
    const result = findPatternSuggestion(constraint, patternRegistry);
    expect(result).not.toBeNull();
  });

  it('should return default export when pattern has no exports', () => {
    const registry: PatternRegistry = {
      patterns: {
        tool: {
          canonical: 'src/utils/tool.ts',
          keywords: ['hammer'],
        },
      },
    };
    const constraint = createConstraint({ rule: 'forbid_import', value: ['hammer'] });
    const result = findPatternSuggestion(constraint, registry);

    expect(result).not.toBeNull();
    expect(result!.export).toBe('default');
  });

  it('should return null for empty pattern registry', () => {
    const emptyRegistry: PatternRegistry = { patterns: {} };
    const constraint = createConstraint({ rule: 'forbid_import', value: ['axios'] });
    expect(findPatternSuggestion(constraint, emptyRegistry)).toBeNull();
  });

  it('should handle non-string values in value array by skipping them', () => {
    const constraint = createConstraint({ rule: 'forbid_import', value: [42, 'axios'] });
    const result = findPatternSuggestion(constraint, patternRegistry);
    expect(result).not.toBeNull();
    expect(result!.file).toBe('src/utils/http-client.ts');
  });
});

describe('selectSharpHints', () => {
  it('should return empty array for no hints', () => {
    expect(selectSharpHints([], 3)).toEqual([]);
  });

  it('should prefer non-generic hints over SOLID boilerplate', () => {
    const hints = [
      createHint('[SRP] Single responsibility'),
      createHint('[DRY] Do not repeat yourself'),
      createHint('Core modules should be framework-agnostic'),
      createHint('Use dependency injection for external services'),
    ];

    const result = selectSharpHints(hints, 3);
    expect(result).toHaveLength(3);
    // Non-generic hints should come first
    expect(result[0].text).toBe('Core modules should be framework-agnostic');
    expect(result[1].text).toBe('Use dependency injection for external services');
  });

  it('should filter out all generic SOLID prefixes', () => {
    const genericPrefixes = ['[SRP]', '[OCP]', '[LSP]', '[ISP]', '[DIP]', '[DRY]', '[KISS]'];
    const hints = genericPrefixes.map(prefix => createHint(`${prefix} Some principle`));

    const result = selectSharpHints(hints, 3);
    // All are generic, so up to max should be returned (backfilling from generic)
    expect(result).toHaveLength(3);
  });

  it('should backfill with generic hints when not enough specific hints', () => {
    const hints = [
      createHint('Specific hint about module'),
      createHint('[SRP] Each file one responsibility'),
      createHint('[DIP] Depend on abstractions'),
    ];

    const result = selectSharpHints(hints, 3);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('Specific hint about module');
    // Backfilled generic hints
    expect(result[1].text).toContain('[SRP]');
    expect(result[2].text).toContain('[DIP]');
  });

  it('should limit to max count', () => {
    const hints = [
      createHint('Hint 1'),
      createHint('Hint 2'),
      createHint('Hint 3'),
      createHint('Hint 4'),
      createHint('Hint 5'),
    ];

    const result = selectSharpHints(hints, 2);
    expect(result).toHaveLength(2);
  });

  it('should return all hints when fewer than max', () => {
    const hints = [createHint('Only hint')];
    const result = selectSharpHints(hints, 5);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Only hint');
  });

  it('should handle max of 0', () => {
    const hints = [createHint('Hint 1'), createHint('Hint 2')];
    const result = selectSharpHints(hints, 0);
    expect(result).toEqual([]);
  });

  it('should preserve example field in returned hints', () => {
    const hints = [
      createHint('Use patterns from code://src/example.ts', 'code://src/example.ts'),
    ];
    const result = selectSharpHints(hints, 3);
    expect(result[0].example).toBe('code://src/example.ts');
  });

  it('should handle all specific hints when count equals max', () => {
    const hints = [
      createHint('Specific 1'),
      createHint('Specific 2'),
      createHint('Specific 3'),
    ];
    const result = selectSharpHints(hints, 3);
    expect(result).toHaveLength(3);
    expect(result.every(h => !h.text.startsWith('['))).toBe(true);
  });
});
