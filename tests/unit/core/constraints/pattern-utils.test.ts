/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  getPatternFromConstraint,
  matchesCallPattern,
  findMatchingCallPattern,
  matchesOptionalCallPattern,
} from '../../../../src/core/constraints/pattern-utils.js';
import type { FunctionCallInfo } from '../../../../src/validators/semantic.types.js';

describe('pattern-utils', () => {
  describe('getPatternFromConstraint', () => {
    it('should return pattern field when present', () => {
      const constraint = { pattern: 'debug\\.print', value: 'description' };
      expect(getPatternFromConstraint(constraint)).toBe('debug\\.print');
    });

    it('should fall back to value when pattern is not present', () => {
      const constraint = { value: 'debug\\.print' };
      expect(getPatternFromConstraint(constraint)).toBe('debug\\.print');
    });

    it('should return null when value is not a string', () => {
      const constraint = { value: ['a', 'b'] };
      expect(getPatternFromConstraint(constraint)).toBeNull();
    });

    it('should return null when value is a number', () => {
      const constraint = { value: 100 };
      expect(getPatternFromConstraint(constraint)).toBeNull();
    });

    it('should prefer pattern over string value', () => {
      const constraint = { pattern: 'preferred', value: 'fallback' };
      expect(getPatternFromConstraint(constraint)).toBe('preferred');
    });
  });

  describe('matchesCallPattern', () => {
    const createCall = (callee: string, methodName?: string, receiver?: string): FunctionCallInfo => ({
      callee,
      methodName: methodName || callee.split('.').pop() || callee,
      receiver,
      arguments: [],
      argumentCount: 0,
      location: { line: 1, column: 1 },
      controlFlow: { inTryBlock: false, inCatchBlock: false, inAsyncFunction: false, inLoop: false },
    });

    it('should match exact callee', () => {
      const call = createCall('setTimeout');
      expect(matchesCallPattern(call, 'setTimeout')).toBe(true);
      expect(matchesCallPattern(call, 'setInterval')).toBe(false);
    });

    it('should match exact methodName', () => {
      const call = createCall('api.fetch', 'fetch', 'api');
      expect(matchesCallPattern(call, 'fetch')).toBe(true);
    });

    it('should match single wildcard pattern', () => {
      const call = createCall('api.fetch', 'fetch', 'api');
      expect(matchesCallPattern(call, 'api.*')).toBe(true);

      const nested = createCall('api.client.fetch', 'fetch', 'api.client');
      expect(matchesCallPattern(nested, 'api.*')).toBe(false);
    });

    it('should match deep wildcard pattern', () => {
      const call = createCall('api.client.fetch', 'fetch');
      expect(matchesCallPattern(call, 'api.**')).toBe(true);
      expect(matchesCallPattern(call, 'other.**')).toBe(false);
    });

    it('should match regex pattern', () => {
      const call = createCall('debug.print');
      expect(matchesCallPattern(call, '/^debug\\./')).toBe(true);
      expect(matchesCallPattern(call, '/^info\\./')).toBe(false);
    });

    it('should handle invalid regex gracefully', () => {
      const call = createCall('test');
      expect(matchesCallPattern(call, '/[invalid/')).toBe(false);
    });
  });

  describe('findMatchingCallPattern', () => {
    const createCall = (callee: string, receiver?: string): FunctionCallInfo => ({
      callee,
      methodName: callee.split('.').pop() || callee,
      receiver,
      arguments: [],
      argumentCount: 0,
      location: { line: 1, column: 1 },
      controlFlow: { inTryBlock: false, inCatchBlock: false, inAsyncFunction: false, inLoop: false },
    });

    it('should return matching pattern', () => {
      const call = createCall('api.fetch', 'api');
      const patterns = ['other.*', 'api.*', 'third.*'];
      expect(findMatchingCallPattern(call, patterns)).toBe('api.*');
    });

    it('should return null when no pattern matches', () => {
      const call = createCall('unknown.method');
      const patterns = ['api.*', 'client.*'];
      expect(findMatchingCallPattern(call, patterns)).toBeNull();
    });

    it('should return first matching pattern', () => {
      const call = createCall('setTimeout');
      const patterns = ['setTimeout', '/^set/'];
      expect(findMatchingCallPattern(call, patterns)).toBe('setTimeout');
    });
  });

  describe('matchesOptionalCallPattern', () => {
    const createCall = (callee: string, receiver?: string): FunctionCallInfo => ({
      callee,
      methodName: callee.split('.').pop() || callee,
      receiver,
      arguments: [],
      argumentCount: 0,
      location: { line: 1, column: 1 },
      controlFlow: { inTryBlock: false, inCatchBlock: false, inAsyncFunction: false, inLoop: false },
    });

    it('should return true when no pattern provided', () => {
      const call = createCall('anything');
      expect(matchesOptionalCallPattern(call, undefined)).toBe(true);
      expect(matchesOptionalCallPattern(call, '')).toBe(true);
    });

    it('should delegate to matchesCallPattern when pattern provided', () => {
      const call = createCall('api.fetch', 'api');
      expect(matchesOptionalCallPattern(call, 'api.*')).toBe(true);
      expect(matchesOptionalCallPattern(call, 'other.*')).toBe(false);
    });
  });
});
